"use client";

import { useEffect, useRef, useState } from "react";
import type { Clip, SourceVideo } from "@/lib/types";
import { generateThumbnails, type Thumbnail } from "@/lib/thumbnails";
import { formatTime } from "@/lib/time";

interface TimelineTrackProps {
  source: SourceVideo;
  clips: Clip[];
  activeClip: Clip | null;
  activeClipId: string | null;
  currentTime: number;
  duration: number;
  /** Picos de áudio normalizados (0..1) para a waveform; null enquanto calcula. */
  peaks: Float32Array | null;
  onSeek: (t: number) => void;
  /** Move o enquadramento de índice `index` para o tempo `newT`. */
  onMoveFraming: (index: number, newT: number) => void;
}

/**
 * Linha do tempo do player com forma de onda (waveform) real ao fundo,
 * faixas dos clipes e pré-visualização em miniatura ao passar o mouse.
 */
export function TimelineTrack({
  source,
  clips,
  activeClip,
  activeClipId,
  currentTime,
  duration,
  peaks,
  onSeek,
  onMoveFraming,
}: TimelineTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [thumbs, setThumbs] = useState<Thumbnail[]>([]);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const hasWave = !!peaks && peaks.length > 0;
  // Índice do marcador de enquadramento sendo arrastado (null = nenhum).
  const draggingFramingRef = useRef<number | null>(null);

  // ---- Gera as miniaturas em segundo plano ----
  useEffect(() => {
    setThumbs([]);
    if (!duration) return;
    const collected: Thumbnail[] = [];
    const { done, cancel } = generateThumbnails({
      url: source.url,
      duration,
      count: 40,
      onThumb: (t) => {
        collected.push(t);
        // Atualiza em blocos para não re-renderizar a cada frame.
        if (collected.length % 5 === 0) setThumbs([...collected]);
      },
    });
    done.then((all) => setThumbs(all));
    return cancel;
  }, [source.url, duration]);

  // ---- Desenho da waveform (canvas) ----
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const mid = cssH / 2;
    const barW = cssW / peaks.length;
    const played = duration > 0 ? currentTime / duration : 0;

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const h = Math.max(1, peaks[i] * (cssH * 0.9));
      // Barras já reproduzidas ganham a cor de destaque.
      ctx.fillStyle = i / peaks.length <= played ? "#6366f1" : "#3f3f5a";
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }
  };

  // Redesenha ao mudar o tempo (progresso), os picos e no resize.
  useEffect(() => {
    if (hasWave) drawWaveform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, duration, hasWave, peaks]);

  useEffect(() => {
    const onResize = () => hasWave && drawWaveform();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWave]);

  // ---- Interação ----
  const timeFromEvent = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * duration;
  };

  // --- Arraste dos marcadores de enquadramento ---
  const startFramingDrag = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    draggingFramingRef.current = index;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const moveFramingDrag = (e: React.PointerEvent) => {
    if (draggingFramingRef.current === null) return;
    e.stopPropagation();
    onMoveFraming(draggingFramingRef.current, timeFromEvent(e.clientX));
  };
  const endFramingDrag = (e: React.PointerEvent) => {
    if (draggingFramingRef.current === null) return;
    e.stopPropagation();
    draggingFramingRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const nearestThumb = (time: number): Thumbnail | null => {
    if (thumbs.length === 0) return null;
    let best = thumbs[0];
    let bestD = Math.abs(best.time - time);
    for (const t of thumbs) {
      const d = Math.abs(t.time - time);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  };

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hoverThumb = hover ? nearestThumb(hover.time) : null;

  return (
    <div className="relative select-none">
      {/* Pré-visualização em miniatura ao passar o mouse */}
      {hover && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2"
          style={{ left: `${hover.x}px` }}
        >
          <div className="overflow-hidden rounded-md border border-edge bg-black shadow-xl">
            {hoverThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hoverThumb.url}
                alt=""
                className="block h-auto w-32"
                draggable={false}
              />
            ) : (
              <div className="flex h-20 w-32 items-center justify-center text-[10px] text-slate-500">
                gerando prévia…
              </div>
            )}
          </div>
          <div className="mt-0.5 text-center font-mono text-[10px] text-slate-300">
            {formatTime(hover.time)}
          </div>
        </div>
      )}

      {/* Trilha com waveform + faixas dos clipes + seek */}
      <div
        ref={trackRef}
        className="relative h-14 w-full cursor-pointer overflow-hidden rounded-lg bg-panel"
        onMouseMove={(e) => {
          if (draggingFramingRef.current !== null) return; // não sobrepõe o arraste
          const rect = trackRef.current!.getBoundingClientRect();
          setHover({
            x: e.clientX - rect.left,
            time: timeFromEvent(e.clientX),
          });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          if (draggingFramingRef.current !== null) return;
          onSeek(timeFromEvent(e.clientX));
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />

        {/* Faixas dos clipes */}
        {duration > 0 &&
          clips.map((c) => {
            const left = (c.start / duration) * 100;
            const width = ((c.end - c.start) / duration) * 100;
            const isActive = c.id === activeClipId;
            return (
              <div
                key={c.id}
                className={`pointer-events-none absolute bottom-0 top-0 border-x ${
                  isActive
                    ? "border-accent bg-accent/20"
                    : "border-brand/40 bg-brand/10"
                }`}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
                title={c.name}
              />
            );
          })}

        {/* Marcadores de enquadramento (troca de câmera) do clipe ativo.
            O 1º fica ancorado no início; os demais podem ser arrastados. */}
        {duration > 0 &&
          activeClip?.framings &&
          activeClip.framings.length > 1 &&
          activeClip.framings.map((f, i) => {
            const anchored = i === 0;
            return (
              <div
                key={`fr-${i}`}
                className={`absolute bottom-0 top-0 w-px bg-amber-400/90 ${
                  anchored ? "pointer-events-none" : ""
                }`}
                style={{ left: `${(f.t / duration) * 100}%` }}
                title={
                  anchored
                    ? `Enquadramento 1 (início)`
                    : `Enquadramento ${i + 1} — arraste para ajustar`
                }
              >
                {anchored ? (
                  <span className="absolute -top-0.5 left-0 flex h-3 w-3 -translate-x-1/2 items-center justify-center rounded-sm bg-amber-400 text-[8px] font-bold text-black">
                    {i + 1}
                  </span>
                ) : (
                  // Alça de arraste (área maior, invisível) sobre o marcador.
                  <div
                    onPointerDown={startFramingDrag(i)}
                    onPointerMove={moveFramingDrag}
                    onPointerUp={endFramingDrag}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -top-1 bottom-0 left-0 w-3 -translate-x-1/2 cursor-ew-resize touch-none"
                  >
                    <span className="absolute top-0.5 left-1/2 flex h-3 w-3 -translate-x-1/2 items-center justify-center rounded-sm bg-amber-400 text-[8px] font-bold text-black">
                      {i + 1}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

        {/* Cabeçote de reprodução */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white"
          style={{ left: `${playedPct}%` }}
        />

        {/* Linha de hover */}
        {hover && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/50"
            style={{ left: `${hover.x}px` }}
          />
        )}
      </div>
    </div>
  );
}
