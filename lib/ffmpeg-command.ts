import type { AspectRatioId, FillModeId } from "./types";
import { getAspect } from "./presets";
import { toFFmpegTime } from "./time";

/**
 * Monta os argumentos do FFmpeg para recortar um segmento e converter para
 * o aspect ratio / modo de enquadramento escolhido.
 *
 * Referência dos filtros (equivalente CLI):
 *  - crop : scale=W:H:force_original_aspect_ratio=increase,crop=W:H
 *  - fit  : scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2
 *  - blur : [0:v]scale=W:H:increase,crop=W:H,boxblur=20:5[bg];
 *           [0:v]scale=W:H:decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2
 */
export function buildFFmpegArgs(params: {
  inputName: string;
  outputName: string;
  start: number;
  end: number;
  aspect: AspectRatioId;
  fill: FillModeId;
  /** Dimensões do vídeo de origem (para o recorte reposicionável). */
  sourceWidth: number;
  sourceHeight: number;
  cropX?: number;
  cropY?: number;
  zoom?: number;
}): string[] {
  const {
    inputName,
    outputName,
    start,
    end,
    aspect,
    fill,
    sourceWidth,
    sourceHeight,
    cropX = 0.5,
    cropY = 0.5,
    zoom = 1,
  } = params;
  // -ss antes de -i = seek rápido (o arquivo inteiro já está no FS virtual).
  const args: string[] = [
    "-ss",
    toFFmpegTime(start),
    "-to",
    toFFmpegTime(end),
    "-i",
    inputName,
  ];

  // Modo "Original": corte sem reencode (stream copy). É ordens de grandeza
  // mais rápido, pois não decodifica/recodifica os quadros — apenas copia os
  // pacotes do intervalo. Mantém o formato/codec e o mesmo contêiner de saída.
  // Observação: o corte se alinha ao quadro-chave mais próximo do início, então
  // o começo pode variar frações de segundo.
  if (aspect === "original") {
    args.push("-c", "copy", "-movflags", "+faststart", outputName);
    return args;
  }

  const { width: w, height: h } = getAspect(aspect);

  if (fill === "blur") {
    const filter =
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,` +
      `crop=${w}:${h},boxblur=20:5[bg];` +
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2`;
    args.push("-filter_complex", filter);
  } else if (fill === "fit") {
    const filter =
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
    args.push("-vf", filter);
  } else {
    // crop (pan & scan) — preenche a tela cortando as bordas.
    // Recorta a região exata escolhida no preview (posição + zoom) direto
    // do vídeo original e só então escala para o formato de saída. Assim o
    // recorte casa 1:1 com a máscara mostrada na interface.
    const sourceAR = sourceWidth / sourceHeight;
    const targetAR = w / h;
    const baseW = Math.min(1, targetAR / sourceAR);
    const baseH = Math.min(1, sourceAR / targetAR);
    const z = Math.max(1, zoom);
    const rw = baseW / z; // largura do recorte (fração do original)
    const rh = baseH / z; // altura do recorte (fração do original)
    const left = clamp01(cropX) * (1 - rw);
    const top = clamp01(cropY) * (1 - rh);
    const f = (n: number) => n.toFixed(6);
    const filter =
      `crop=iw*${f(rw)}:ih*${f(rh)}:iw*${f(left)}:ih*${f(top)},` +
      `scale=${w}:${h},setsar=1`;
    args.push("-vf", filter);
  }

  // Preset adaptativo: cortes longos priorizam velocidade (o encode roda no
  // navegador). Acima de ~2 min usamos ultrafast para o render não demorar
  // minutos; cortes curtos mantêm veryfast (melhor qualidade/tamanho).
  const durationSec = Math.max(0, end - start);
  const preset = durationSec > 120 ? "ultrafast" : "veryfast";
  const crf = durationSec > 120 ? "24" : "23";

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    crf,
    "-threads",
    "0", // deixa o FFmpeg escolher; o core atual é single-thread (ver lib/ffmpeg.ts)
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputName
  );

  return args;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
