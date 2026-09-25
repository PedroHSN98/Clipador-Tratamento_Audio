import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// FFFSType é um const enum (sem valor em runtime), então usamos a string que
// o worker do FFmpeg espera internamente. mount() apenas repassa essa string.
const WORKERFS = "WORKERFS" as unknown as FFFSType;
import type { Clip, SourceVideo } from "./types";
import { buildFFmpegArgs } from "./ffmpeg-command";
import {
  buildAudioArgs,
  AUDIO_FORMAT_INFO,
  type AudioTreatment,
} from "./audio-command";

// Core single-thread do FFmpeg.wasm (v0.12) servido via unpkg.
// toBlobURL baixa com CORS e cria uma blob URL same-origin — assim os
// cabeçalhos COOP/COEP (require-corp) são respeitados.
//
// NOTA: o core multi-thread (core-mt) aceleraria o encode, mas nesta
// configuração (core carregado via blob URL sob COEP) os workers de pthread
// não inicializam e o encode entra em DEADLOCK — trava sem processar 1 frame.
// Por isso usamos o core single-thread, que é confiável e conclui cortes
// longos (5+ min). Para reduzir o tempo dos trechos longos, o encode usa
// preset "ultrafast" (ver ffmpeg-command.ts) e o vídeo de origem é lido via
// WORKERFS (ver renderClip), sem copiar tudo para a memória.
const CORE_VERSION = "0.12.6";
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type LogHandler = (message: string) => void;

/** Carrega (uma única vez) a instância do FFmpeg.wasm. */
export function loadFFmpeg(onLog?: LogHandler): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const instance = new FFmpeg();
    if (onLog) {
      instance.on("log", ({ message }) => onLog(message));
    }
    await instance.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });
    ffmpeg = instance;
    return instance;
  })();

  return loadPromise;
}

export function isFFmpegLoaded(): boolean {
  return ffmpeg !== null;
}

/**
 * Renderiza um clipe: escreve o vídeo original no FS virtual, executa o
 * recorte/conversão e devolve uma Blob URL do mp4 resultante.
 */
export async function renderClip(params: {
  source: SourceVideo;
  clip: Clip;
  onProgress?: (progress: number) => void;
}): Promise<string> {
  const { source, clip, onProgress } = params;
  const instance = await loadFFmpeg();

  const ext = guessExt(source.file.name);
  const mountDir = `/mnt-${clip.id}`;
  const mountedName = "source" + ext;
  const outputName = `clip-${clip.id}.mp4`;

  // Handler de progresso específico deste render.
  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    onProgress?.(pct);
  };
  instance.on("progress", progressHandler);

  // Captura os logs do FFmpeg para diagnosticar falhas (codec não suportado,
  // memória insuficiente, arquivo corrompido, etc.).
  const logLines: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logLines.push(message);
    if (logLines.length > 300) logLines.shift();
  };
  instance.on("log", logHandler);

  // Entrada do vídeo via WORKERFS: o FFmpeg lê os bytes direto do File do
  // navegador, sob demanda, SEM copiar o vídeo inteiro para a memória do wasm.
  // É isso que permite cortar trechos longos (5+ min) de vídeos grandes sem
  // estourar a memória. Se o WORKERFS não estiver disponível, cai no writeFile.
  let inputName: string;
  let mounted = false;
  try {
    await instance.createDir(mountDir);
    const fileForMount =
      source.file.name === mountedName
        ? source.file
        : new File([source.file], mountedName, { type: source.file.type });
    await instance.mount(WORKERFS, { files: [fileForMount] }, mountDir);
    inputName = `${mountDir}/${mountedName}`;
    mounted = true;
  } catch {
    inputName = mountedName;
    await instance.writeFile(mountedName, await fetchFile(source.file));
  }

  const cleanupInput = async () => {
    if (mounted) {
      try {
        await instance.unmount(mountDir);
      } catch {
        /* ignore */
      }
      await safeDeleteDir(instance, mountDir);
    } else {
      await safeDelete(instance, mountedName);
    }
  };

  try {
    const args = buildFFmpegArgs({
      inputName,
      outputName,
      start: clip.start,
      end: clip.end,
      aspect: clip.aspect,
      fill: clip.fill,
      sourceWidth: source.width,
      sourceHeight: source.height,
      cropX: clip.cropX,
      cropY: clip.cropY,
      zoom: clip.zoom,
    });

    // exec retorna 0 em sucesso; != 0 em erro/timeout. NÃO lança sozinho —
    // por isso precisamos checar aqui para não entregar um arquivo corrompido.
    const code = await instance.exec(args);
    if (code !== 0) {
      throw new Error(explainFailure(logLines, code));
    }

    let bytes: Uint8Array;
    try {
      bytes = (await instance.readFile(outputName)) as Uint8Array;
    } catch {
      throw new Error(
        explainFailure(logLines, code) ||
          "O FFmpeg terminou sem gerar o arquivo de saída."
      );
    }

    // Valida que a saída é um MP4 real e não um arquivo truncado/vazio.
    if (!bytes || bytes.byteLength < 1024 || !hasMp4Signature(bytes)) {
      throw new Error(
        "O arquivo gerado ficou incompleto ou inválido. " +
          explainFailure(logLines, code)
      );
    }

    // .slice() copia para um ArrayBuffer novo (não compartilhado), evitando
    // problemas de SharedArrayBuffer/Blob em ambientes cross-origin isolated.
    const blob = new Blob([bytes.slice()], { type: "video/mp4" });
    return URL.createObjectURL(blob);
  } finally {
    await cleanupInput();
    await safeDelete(instance, outputName);
    instance.off("progress", progressHandler);
    instance.off("log", logHandler);
  }
}

export interface AudioResult {
  url: string;
  ext: string;
  size: number;
}

/**
 * Trata o áudio de um arquivo (áudio OU vídeo): reduz ruído de fundo, corrige
 * estouros e normaliza o volume, conforme o `treatment`. Devolve uma Blob URL
 * do áudio processado. Usa a mesma estratégia de memória do clipador (WORKERFS).
 */
export async function processAudio(params: {
  file: File;
  treatment: AudioTreatment;
  start?: number;
  end?: number;
  onProgress?: (progress: number) => void;
}): Promise<AudioResult> {
  const { file, treatment, start, end, onProgress } = params;
  const instance = await loadFFmpeg();

  const jobId = randomId();
  const ext = guessExt(file.name);
  const mountDir = `/amnt-${jobId}`;
  const mountedName = "source" + ext;
  const outExt = AUDIO_FORMAT_INFO[treatment.format].ext;
  const outputName = `treated-${jobId}.${outExt}`;

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
  };
  instance.on("progress", progressHandler);

  const logLines: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logLines.push(message);
    if (logLines.length > 300) logLines.shift();
  };
  instance.on("log", logHandler);

  // Entrada via WORKERFS (sem duplicar o arquivo na memória).
  let inputName: string;
  let mounted = false;
  try {
    await instance.createDir(mountDir);
    const fileForMount =
      file.name === mountedName
        ? file
        : new File([file], mountedName, { type: file.type });
    await instance.mount(WORKERFS, { files: [fileForMount] }, mountDir);
    inputName = `${mountDir}/${mountedName}`;
    mounted = true;
  } catch {
    inputName = mountedName;
    await instance.writeFile(mountedName, await fetchFile(file));
  }

  const cleanupInput = async () => {
    if (mounted) {
      try {
        await instance.unmount(mountDir);
      } catch {
        /* ignore */
      }
      await safeDeleteDir(instance, mountDir);
    } else {
      await safeDelete(instance, mountedName);
    }
  };

  try {
    const args = buildAudioArgs({
      inputName,
      outputName,
      treatment,
      start,
      end,
    });

    const code = await instance.exec(args);
    if (code !== 0) {
      throw new Error(explainAudioFailure(logLines, code));
    }

    let bytes: Uint8Array;
    try {
      bytes = (await instance.readFile(outputName)) as Uint8Array;
    } catch {
      throw new Error(
        explainAudioFailure(logLines, code) ||
          "O FFmpeg terminou sem gerar o áudio de saída."
      );
    }

    if (!bytes || bytes.byteLength < 256) {
      throw new Error(
        "O áudio gerado ficou vazio ou inválido. " +
          explainAudioFailure(logLines, code)
      );
    }

    const blob = new Blob([bytes.slice()], {
      type: AUDIO_FORMAT_INFO[treatment.format].mime,
    });
    return { url: URL.createObjectURL(blob), ext: outExt, size: bytes.byteLength };
  } finally {
    await cleanupInput();
    await safeDelete(instance, outputName);
    instance.off("progress", progressHandler);
    instance.off("log", logHandler);
  }
}

function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/** Mensagens de erro específicas do tratamento de áudio. */
function explainAudioFailure(logLines: string[], code: number): string {
  const text = logLines.join("\n");
  if (/Cannot allocate memory|out of memory|memory access out of bounds|abort/i.test(text)) {
    return "Memória insuficiente no navegador — o arquivo é muito grande/longo. Tente um trecho menor.";
  }
  if (/Unknown decoder|Decoder .* not found|no decoder|Could not find codec|Unsupported codec|Invalid data found/i.test(text)) {
    return "Este formato de áudio não é suportado pelo processador do navegador. Tente enviar MP3, WAV, M4A ou um vídeo comum.";
  }
  if (/does not contain any stream|Output file .* does not contain/i.test(text)) {
    return "O arquivo enviado não parece conter áudio.";
  }
  const lastErr = [...logLines]
    .reverse()
    .find((l) => /error|invalid|fail|unable/i.test(l));
  return lastErr
    ? `Falha no FFmpeg: ${lastErr.trim()}`
    : `Falha ao tratar o áudio (código ${code}).`;
}

/** Verifica a assinatura de um MP4/MOV: bytes 4..8 devem ser "ftyp". */
function hasMp4Signature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  return (
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  );
}

/** Traduz os logs de erro do FFmpeg em uma mensagem útil ao usuário. */
function explainFailure(logLines: string[], code: number): string {
  const text = logLines.join("\n");
  if (/Cannot allocate memory|out of memory|memory access out of bounds|abort/i.test(text)) {
    return "Memória insuficiente no navegador para processar este vídeo — provavelmente é grande ou em 4K. Tente um trecho mais curto, um formato de menor resolução, ou use um vídeo menor.";
  }
  if (/Unknown decoder|Decoder .* not found|no decoder|Could not find codec|Unsupported codec/i.test(text)) {
    return "O codec deste vídeo não é suportado pelo processador do navegador. Converta o vídeo para MP4 (H.264) antes de importar.";
  }
  if (/moov atom not found|Invalid data found|could not find corresponding/i.test(text)) {
    return "O arquivo de vídeo parece corrompido ou está em um formato que o navegador não consegue ler.";
  }
  if (code === 1) {
    return "O processamento excedeu o tempo limite ou foi interrompido.";
  }
  // Última linha de erro relevante do FFmpeg, se houver.
  const lastErr = [...logLines]
    .reverse()
    .find((l) => /error|invalid|fail|unable/i.test(l));
  return lastErr
    ? `Falha no FFmpeg: ${lastErr.trim()}`
    : `Falha ao renderizar (código ${code}).`;
}

async function safeDelete(instance: FFmpeg, name: string) {
  try {
    await instance.deleteFile(name);
  } catch {
    /* ignore */
  }
}

async function safeDeleteDir(instance: FFmpeg, dir: string) {
  try {
    await instance.deleteDir(dir);
  } catch {
    /* ignore */
  }
}

function guessExt(filename: string): string {
  const m = filename
    .toLowerCase()
    .match(/\.(mp4|webm|mov|mkv|avi|m4v|mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/);
  return m ? m[0] : ".mp4";
}
