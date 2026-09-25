// Geração de miniaturas (thumbnails) do vídeo para o "scrubbing" na timeline.
//
// Estratégia: um <video> oculto é posicionado em vários instantes e cada frame
// é desenhado num <canvas>, virando um data URL JPEG leve. As miniaturas são
// geradas em segundo plano após o carregamento e usadas na pré-visualização
// que aparece ao passar o mouse pela linha do tempo.

export interface Thumbnail {
  /** Instante do vídeo (segundos) representado por esta miniatura. */
  time: number;
  /** data URL (JPEG) do frame. */
  url: string;
}

export interface ThumbnailStrip {
  thumbs: Thumbnail[];
  /** Cancela a geração em andamento (ex.: ao trocar de vídeo). */
  cancel: () => void;
}

/**
 * Gera `count` miniaturas distribuídas ao longo do vídeo. Resolve com o array
 * (mesmo parcial, se cancelado). `onThumb` é chamado a cada miniatura pronta,
 * permitindo à UI preencher progressivamente.
 */
export function generateThumbnails(params: {
  url: string;
  duration: number;
  count?: number;
  width?: number;
  onThumb?: (thumb: Thumbnail, index: number) => void;
}): { done: Promise<Thumbnail[]>; cancel: () => void } {
  const { url, duration, count = 40, width = 160, onThumb } = params;
  let cancelled = false;

  const done = new Promise<Thumbnail[]>((resolve) => {
    const thumbs: Thumbnail[] = [];

    if (typeof document === "undefined" || duration <= 0) {
      resolve(thumbs);
      return;
    }

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const finish = () => {
      video.removeAttribute("src");
      video.load();
      resolve(thumbs);
    };

    const n = Math.max(1, count);
    // Amostra instantes no centro de cada segmento (evita o frame 0 preto).
    const times = Array.from(
      { length: n },
      (_, i) => ((i + 0.5) / n) * duration
    );

    let idx = 0;

    const captureNext = () => {
      if (cancelled || idx >= times.length) {
        finish();
        return;
      }
      video.currentTime = Math.min(times[idx], Math.max(0, duration - 0.05));
    };

    const onSeeked = () => {
      if (cancelled) {
        finish();
        return;
      }
      if (ctx && video.videoWidth > 0) {
        const h = Math.round((width * video.videoHeight) / video.videoWidth);
        canvas.width = width;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, width, h);
        try {
          const thumb: Thumbnail = {
            time: times[idx],
            url: canvas.toDataURL("image/jpeg", 0.5),
          };
          thumbs.push(thumb);
          onThumb?.(thumb, idx);
        } catch {
          /* frame não capturável — ignora */
        }
      }
      idx++;
      captureNext();
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", finish);
    video.addEventListener("loadeddata", () => {
      if (!cancelled) captureNext();
    });
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
}
