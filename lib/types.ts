// Tipos centrais do domínio do Video Clipper Studio.

export type AspectRatioId = "original" | "9:16" | "1:1" | "16:9" | "4:5";

export type FillModeId = "fit" | "blur" | "crop";

export interface AspectPreset {
  id: AspectRatioId;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export interface FillModePreset {
  id: FillModeId;
  label: string;
  hint: string;
}

/** Um enquadramento (crop) que passa a valer a partir do tempo `t`. Ver lib/framing.ts. */
export interface Framing {
  /** Tempo absoluto no vídeo de origem (s) em que este enquadramento passa a valer. */
  t: number;
  cropX: number;
  cropY: number;
  zoom: number;
}

export type ClipStatus =
  | "idle"
  | "queued"
  | "processing"
  | "done"
  | "error";

export interface Clip {
  id: string;
  name: string;
  /** segundos */
  start: number;
  /** segundos */
  end: number;
  aspect: AspectRatioId;
  fill: FillModeId;
  /** Posição horizontal do recorte (0..1, 0.5 = centro). Só afeta o modo "crop". */
  cropX: number;
  /** Posição vertical do recorte (0..1, 0.5 = centro). Só afeta o modo "crop". */
  cropY: number;
  /** Zoom do recorte (>= 1). 1 = enquadramento padrão. Só afeta o modo "crop". */
  zoom: number;
  /**
   * Enquadramentos por trecho (multicâmera). Quando presente (>=2), o crop muda
   * em cada tempo `t` com corte seco. Ausente = usa o crop base acima. Ver
   * lib/framing.ts. Só afeta o modo "crop".
   */
  framings?: Framing[];
  status: ClipStatus;
  /** 0..100 */
  progress: number;
  /** Momento (ms epoch) em que o render começou — usado para estimar o tempo restante. Transitório. */
  startedAt?: number;
  /** URL de objeto do resultado renderizado */
  resultUrl?: string;
  /** Extensão do arquivo renderizado (ex.: "mp4", "webm"). */
  resultExt?: string;
  errorMessage?: string;
}

export interface SourceVideo {
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
}
