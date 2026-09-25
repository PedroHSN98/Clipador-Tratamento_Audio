// Construtor de comandos FFmpeg para o Tratador de Áudio.
//
// Encadeia filtros de áudio conforme as opções escolhidas:
//  - Redução de ruído de fundo: highpass + afftdn (denoise por FFT).
//  - Correção de áudio estourado (clipping/distorção): adeclip + acompressor
//    + alimiter (repara picos cortados e evita novo estouro).
//  - Normalização de volume (EBU R128): loudnorm — deixa tudo "na mesma
//    sintonia", subindo áudio baixo e controlando o alto.

export type AudioFormat = "mp3" | "wav" | "m4a";
export type Intensity = "leve" | "medio" | "forte";
export type LoudnessTarget = "-14" | "-16" | "-23";

export interface AudioTreatment {
  denoise: boolean;
  denoiseLevel: Intensity;
  declip: boolean;
  normalize: boolean;
  loudness: LoudnessTarget;
  format: AudioFormat;
}

export const DEFAULT_TREATMENT: AudioTreatment = {
  denoise: true,
  denoiseLevel: "medio",
  declip: true,
  normalize: true,
  loudness: "-16",
  format: "mp3",
};

// Redução de ruído (dB) por nível.
const NOISE_REDUCTION: Record<Intensity, number> = {
  leve: 6,
  medio: 12,
  forte: 21,
};

export function buildAudioFilterChain(t: AudioTreatment): string[] {
  const chain: string[] = [];

  if (t.denoise) {
    // Corta ruído de baixa frequência (ex.: zumbido/AC) e aplica denoise FFT.
    chain.push("highpass=f=90");
    chain.push(`afftdn=nr=${NOISE_REDUCTION[t.denoiseLevel]}:nf=-25`);
    if (t.denoiseLevel === "forte") {
      // Reforço para ruído mais forte.
      chain.push("anlmdn=s=0.0004");
    }
  }

  if (t.declip) {
    // Repara amostras cortadas e comprime picos para "domar" o estouro.
    chain.push("adeclip");
    chain.push("acompressor=threshold=-18dB:ratio=3:attack=20:release=250");
  }

  if (t.normalize) {
    // Normalização de loudness (EBU R128) — volume consistente.
    chain.push(`loudnorm=I=${t.loudness}:TP=-1.5:LRA=11`);
  }

  // Limitador de segurança no fim: garante que nada estoure após os ganhos.
  if (t.declip || t.normalize) {
    chain.push("alimiter=limit=0.97");
  }

  return chain;
}

/** Codec/flags de saída por formato. */
function outputCodecArgs(format: AudioFormat): string[] {
  switch (format) {
    case "wav":
      return ["-c:a", "pcm_s16le"];
    case "m4a":
      return ["-c:a", "aac", "-b:a", "192k"];
    case "mp3":
    default:
      return ["-c:a", "libmp3lame", "-q:a", "2"]; // ~190 kbps VBR
  }
}

export function buildAudioArgs(params: {
  inputName: string;
  outputName: string;
  treatment: AudioTreatment;
  /** trecho opcional (segundos) — se omitido, processa o áudio inteiro */
  start?: number;
  end?: number;
}): string[] {
  const { inputName, outputName, treatment, start, end } = params;
  const args: string[] = [];

  if (typeof start === "number" && start > 0) {
    args.push("-ss", start.toFixed(3));
  }
  if (typeof end === "number" && end > 0) {
    args.push("-to", end.toFixed(3));
  }

  args.push("-i", inputName);

  // Descarta qualquer vídeo/imagem — saída é somente áudio.
  args.push("-vn");

  const chain = buildAudioFilterChain(treatment);
  if (chain.length > 0) {
    args.push("-af", chain.join(","));
  }

  args.push(...outputCodecArgs(treatment.format));
  args.push(outputName);

  return args;
}

export const AUDIO_FORMAT_INFO: Record<
  AudioFormat,
  { label: string; ext: string; mime: string }
> = {
  mp3: { label: "MP3", ext: "mp3", mime: "audio/mpeg" },
  wav: { label: "WAV (sem perdas)", ext: "wav", mime: "audio/wav" },
  m4a: { label: "M4A (AAC)", ext: "m4a", mime: "audio/mp4" },
};
