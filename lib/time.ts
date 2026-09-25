// Utilitários de formatação/parse de tempo.

/** Formata segundos para "mm:ss.ms" (ms com 1 casa). Ex: 75.4 -> "01:15.4" */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 10);
  return `${pad(m)}:${pad(s)}.${ms}`;
}

/** Formata segundos para "HH:MM:SS.mmm" usado como argumento do FFmpeg. */
export function toFFmpegTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3, "0")}`;
}

/** Converte "mm:ss.ms" ou "mm:ss" ou "ss" em segundos. Retorna null se inválido. */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  try {
    if (parts.length === 1) {
      const v = parseFloat(parts[0]);
      return Number.isFinite(v) ? v : null;
    }
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseFloat(parts[1]);
      if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
      return m * 60 + s;
    }
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseFloat(parts[2]);
      if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s))
        return null;
      return h * 3600 + m * 60 + s;
    }
  } catch {
    return null;
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
