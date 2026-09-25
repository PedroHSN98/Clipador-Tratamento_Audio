// Renderização por WebCodecs (encoder de HARDWARE) via Mediabunny.
//
// Por que existe: o FFmpeg.wasm recodifica na CPU emulada e é lento para
// conversões (ex.: 9:16). A API WebCodecs do navegador usa o encoder de
// hardware (GPU) da máquina — tipicamente 10–50× mais rápido. A Mediabunny faz
// demux → decode → transformar (crop/resize) → encode → remux usando WebCodecs.
//
// Este caminho cobre os modos "crop" (Pan & Scan) e "fit" (barras pretas).
// O modo "blur" (fundo desfocado) não tem equivalente nativo aqui → o chamador
// deve cair no FFmpeg.wasm. O modo "original" (corte sem reencode) também fica
// com o FFmpeg (`-c copy`), que já é instantâneo.

import {
  Input,
  Output,
  Conversion,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS,
  QUALITY_HIGH,
  type ConversionVideoOptions,
} from "mediabunny";
import type { Clip, SourceVideo } from "./types";
import { getAspect } from "./presets";

/** Erro que sinaliza "não dá pra usar WebCodecs aqui" → cair no FFmpeg.wasm. */
export class WebCodecsUnsupportedError extends Error {}
/** Erro que sinaliza cancelamento deliberado pelo usuário. */
export class WebCodecsCanceledError extends Error {}

/** WebCodecs (encode + decode) disponível neste navegador? */
export function webCodecsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !==
      "undefined" &&
    typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !==
      "undefined"
  );
}

/** Este clipe é elegível para o caminho WebCodecs (crop/fit, não blur/original)? */
export function canUseWebCodecs(clip: Clip): boolean {
  if (!webCodecsSupported()) return false;
  if (clip.aspect === "original") return false; // corte sem reencode → FFmpeg -c copy
  if (clip.fill === "blur") return false; // blur não suportado por aqui
  return true;
}

// Conversão ativa (para o cancelamento via botão ✕).
let activeConversion: Conversion | null = null;

/** Cancela a conversão WebCodecs em andamento, se houver. */
export function cancelWebCodecs(): void {
  if (activeConversion) {
    void activeConversion.cancel();
    activeConversion = null;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export async function renderClipWebCodecs(params: {
  source: SourceVideo;
  clip: Clip;
  onProgress?: (progress: number) => void;
}): Promise<{ url: string; ext: string }> {
  const { source, clip, onProgress } = params;
  const { width: w, height: h } = getAspect(clip.aspect);

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source.file),
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  // Monta as opções de vídeo conforme o modo de enquadramento.
  let videoOpts: ConversionVideoOptions;
  if (clip.fill === "fit") {
    // Barras pretas: contém o quadro inteiro dentro do formato de saída.
    videoOpts = { width: w, height: h, fit: "contain" };
  } else {
    // Crop (Pan & Scan): recorta exatamente a região escolhida no preview e
    // escala para o formato de saída. Mesma matemática do ffmpeg-command.ts.
    const sw = source.width;
    const sh = source.height;
    const sourceAR = sw / sh;
    const targetAR = w / h;
    const baseW = Math.min(1, targetAR / sourceAR);
    const baseH = Math.min(1, sourceAR / targetAR);
    const z = Math.max(1, clip.zoom || 1);
    const rw = baseW / z;
    const rh = baseH / z;
    const left = clamp01(clip.cropX ?? 0.5) * (1 - rw);
    const top = clamp01(clip.cropY ?? 0.5) * (1 - rh);
    videoOpts = {
      width: w,
      height: h,
      fit: "fill", // o crop já entrega a proporção exata → sem distorção
      crop: {
        left: Math.round(left * sw),
        top: Math.round(top * sh),
        width: Math.max(2, Math.round(rw * sw)),
        height: Math.max(2, Math.round(rh * sh)),
      },
    };
  }

  let conversion: Conversion;
  try {
    conversion = await Conversion.init({
      input,
      output,
      trim: { start: clip.start, end: clip.end },
      video: { ...videoOpts, codec: "avc", quality: QUALITY_HIGH },
      showWarnings: false,
    });
  } catch {
    throw new WebCodecsUnsupportedError("Falha ao inicializar a conversão WebCodecs.");
  }

  // Se algum track essencial foi descartado (ex.: codec não encodável por
  // hardware), a saída sairia sem vídeo → melhor cair no FFmpeg.wasm.
  if (!conversion.isValid || conversion.discardedTracks.length > 0) {
    throw new WebCodecsUnsupportedError(
      "Este vídeo não é compatível com a aceleração por hardware."
    );
  }

  if (onProgress) {
    conversion.onProgress = (p) =>
      onProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
  }

  activeConversion = conversion;
  try {
    await conversion.execute();
  } catch (err) {
    if (conversion.state === "canceled") {
      throw new WebCodecsCanceledError("Renderização cancelada.");
    }
    // Qualquer outra falha → deixa o chamador tentar o FFmpeg.wasm.
    throw new WebCodecsUnsupportedError(
      err instanceof Error ? err.message : "Falha na renderização por hardware."
    );
  } finally {
    if (activeConversion === conversion) activeConversion = null;
  }

  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength < 1024) {
    throw new WebCodecsUnsupportedError("A saída por hardware ficou vazia.");
  }
  const blob = new Blob([buffer], { type: "video/mp4" });
  return { url: URL.createObjectURL(blob), ext: "mp4" };
}
