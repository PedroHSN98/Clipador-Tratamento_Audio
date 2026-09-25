// Detecção automática de cortes a partir da energia do áudio.
//
// Ideia: percorre a waveform (picos por balde, já normalizados 0..1) e separa o
// vídeo em segmentos "com áudio" (fala/som) versus "silêncio". Trechos de
// silêncio longos o suficiente viram fronteiras entre clipes sugeridos. Também
// aplica limites de duração mínima/máxima para gerar cortes utilizáveis.
//
// Não é transcrição — é uma heurística de energia, rápida e 100% local, boa
// para dar um ponto de partida que o usuário depois ajusta.

export interface DetectedSegment {
  start: number;
  end: number;
}

export interface AutoDetectOptions {
  /** Fração da energia média usada como limiar de silêncio (0..1). */
  silenceThreshold?: number;
  /** Silêncio precisa durar ao menos isto (s) para cortar. */
  minSilence?: number;
  /** Segmentos mais curtos que isto (s) são descartados. */
  minSegment?: number;
  /** Segmentos maiores que isto (s) são divididos. */
  maxSegment?: number;
  /** Folga (s) adicionada antes/depois de cada segmento. */
  padding?: number;
}

const DEFAULTS: Required<AutoDetectOptions> = {
  silenceThreshold: 0.12,
  minSilence: 0.4,
  minSegment: 2,
  maxSegment: 90,
  padding: 0.15,
};

/**
 * Analisa os picos de áudio e devolve segmentos sugeridos de fala/som.
 * `peaks` é o array normalizado (0..1); `duration` é a duração total em segundos.
 */
export function detectSegments(
  peaks: Float32Array | number[],
  duration: number,
  options: AutoDetectOptions = {}
): DetectedSegment[] {
  const opt = { ...DEFAULTS, ...options };
  const n = peaks.length;
  if (n === 0 || duration <= 0) return [];

  const secondsPerBucket = duration / n;

  // Limiar de silêncio relativo à energia média (mais robusto que um valor fixo).
  let sum = 0;
  for (let i = 0; i < n; i++) sum += peaks[i];
  const mean = sum / n;
  const threshold = Math.max(0.02, mean * opt.silenceThreshold * (1 / 0.12));

  // Marca cada balde como "audível" ou "silêncio".
  const minSilenceBuckets = Math.max(1, Math.round(opt.minSilence / secondsPerBucket));

  const segments: DetectedSegment[] = [];
  let segStart: number | null = null;
  let silenceRun = 0;

  for (let i = 0; i < n; i++) {
    const audible = peaks[i] >= threshold;
    if (audible) {
      if (segStart === null) segStart = i;
      silenceRun = 0;
    } else if (segStart !== null) {
      silenceRun++;
      // Silêncio prolongado encerra o segmento atual.
      if (silenceRun >= minSilenceBuckets) {
        const endBucket = i - silenceRun + 1;
        pushSegment(segments, segStart, endBucket, secondsPerBucket, opt, duration);
        segStart = null;
        silenceRun = 0;
      }
    }
  }
  // Fecha um segmento aberto no fim do vídeo.
  if (segStart !== null) {
    pushSegment(segments, segStart, n, secondsPerBucket, opt, duration);
  }

  // Divide segmentos longos demais em pedaços <= maxSegment.
  const split: DetectedSegment[] = [];
  for (const s of segments) {
    const len = s.end - s.start;
    if (len <= opt.maxSegment) {
      split.push(s);
    } else {
      const parts = Math.ceil(len / opt.maxSegment);
      const partLen = len / parts;
      for (let p = 0; p < parts; p++) {
        split.push({
          start: s.start + p * partLen,
          end: p === parts - 1 ? s.end : s.start + (p + 1) * partLen,
        });
      }
    }
  }

  return split;
}

function pushSegment(
  out: DetectedSegment[],
  startBucket: number,
  endBucket: number,
  secondsPerBucket: number,
  opt: Required<AutoDetectOptions>,
  duration: number
) {
  let start = startBucket * secondsPerBucket - opt.padding;
  let end = endBucket * secondsPerBucket + opt.padding;
  start = Math.max(0, start);
  end = Math.min(duration, end);
  if (end - start >= opt.minSegment) {
    out.push({ start, end });
  }
}
