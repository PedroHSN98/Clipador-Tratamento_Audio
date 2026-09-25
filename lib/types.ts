// Tipos centrais do domínio do Video Clipper Studio.

export type AspectRatioId = "9:16" | "1:1" | "16:9" | "4:5";

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
  status: ClipStatus;
  /** 0..100 */
  progress: number;
  /** URL de objeto do resultado renderizado (mp4) */
  resultUrl?: string;
  errorMessage?: string;
}

export interface SourceVideo {
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
}
