// Cálculo da forma de onda (waveform) do áudio de um arquivo de vídeo/áudio.
//
// Estratégia: decodifica o áudio com a Web Audio API (decodeAudioData),
// mistura os canais em mono e reduz para um número fixo de "baldes" (buckets),
// guardando o pico (máximo absoluto) de cada balde. Esse array normalizado
// (0..1) é o que a timeline desenha.
//
// Cuidado de memória: decodeAudioData descomprime TODO o áudio para float32 na
// memória. Para vídeos muito longos isso é caro, então há um limite de tamanho
// de arquivo — acima dele, a waveform é simplesmente omitida (a timeline
// continua funcionando só com os marcadores dos clipes).

const MAX_BYTES_FOR_WAVEFORM = 400 * 1024 * 1024; // ~400 MB

export interface Waveform {
  /** Picos normalizados (0..1), um por balde, na ordem temporal. */
  peaks: Float32Array;
  /** Duração do áudio decodificado, em segundos. */
  duration: number;
}

/**
 * Calcula a waveform de um arquivo. Retorna null se não for possível
 * (arquivo grande demais, sem áudio, ou formato não decodificável) — o chamador
 * deve tratar null como "sem waveform".
 */
export async function computeWaveform(
  file: File,
  buckets = 800
): Promise<Waveform | null> {
  if (typeof window === "undefined") return null;
  if (file.size > MAX_BYTES_FOR_WAVEFORM) return null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    if (length === 0 || channels === 0) return null;

    const peaks = new Float32Array(buckets);
    const samplesPerBucket = Math.max(1, Math.floor(length / buckets));

    // Percorre cada canal uma vez, acumulando o pico por balde.
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let b = 0; b < buckets; b++) {
        const startS = b * samplesPerBucket;
        const endS = Math.min(startS + samplesPerBucket, length);
        let max = 0;
        for (let i = startS; i < endS; i++) {
          const v = Math.abs(data[i]);
          if (v > max) max = v;
        }
        if (max > peaks[b]) peaks[b] = max;
      }
    }

    // Normaliza para 0..1 pelo maior pico global (dá presença visual mesmo em
    // áudios de volume baixo).
    let globalMax = 0;
    for (let i = 0; i < buckets; i++) if (peaks[i] > globalMax) globalMax = peaks[i];
    if (globalMax > 0) {
      for (let i = 0; i < buckets; i++) peaks[i] = peaks[i] / globalMax;
    }

    return { peaks, duration: audioBuffer.duration };
  } catch {
    return null;
  } finally {
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}
