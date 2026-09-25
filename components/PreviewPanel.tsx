"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Play, Pause, RotateCcw, Scissors, Move, Camera, Plus, X } from "lucide-react";
import type { Clip, SourceVideo } from "@/lib/types";
import { getAspect } from "@/lib/presets";
import { formatTime } from "@/lib/time";
import { getFramingAt, activeFramingIndex } from "@/lib/framing";
import { TimelineTrack } from "./TimelineTrack";

interface PreviewPanelProps {
  source: SourceVideo;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeClip: Clip | null;
  clips: Clip[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  peaks: Float32Array | null;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onTimeUpdate: (t: number) => void;
  onDurationChange: (d: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  /** Atualiza o crop do enquadramento ativo no tempo atual. */
  onUpdateActiveFraming: (
    patch: Partial<{ cropX: number; cropY: number; zoom: number }>
  ) => void;
  /** Adiciona um enquadramento no tempo atual. */
  onAddFraming: () => void;
  /** Remove o enquadramento que começa no tempo `t`. */
  onRemoveFraming: (t: number) => void;
  /** Move o enquadramento de índice `index` para o tempo `newT`. */
  onMoveFraming: (index: number, newT: number) => void;
}

export function PreviewPanel({
  source,
  videoRef,
  activeClip,
  clips,
  currentTime,
  duration,
  isPlaying,
  peaks,
  onTogglePlay,
  onSeek,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onUpdateActiveFraming,
  onAddFraming,
  onRemoveFraming,
  onMoveFraming,
}: PreviewPanelProps) {
  const sourceAR = source.width / source.height;
  // No modo "Original" (corte rápido) não há conversão de formato → sem máscara.
  const target =
    activeClip && activeClip.aspect !== "original"
      ? getAspect(activeClip.aspect)
      : null;
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Crop do enquadramento ativo no tempo atual (multicâmera).
  const activeFraming = activeClip
    ? getFramingAt(activeClip, currentTime)
    : { cropX: 0.5, cropY: 0.5, zoom: 1 };
  const cropX = activeFraming.cropX;
  const cropY = activeFraming.cropY;
  const zoom = Math.max(1, activeFraming.zoom);

  // Região aproveitada (modo crop) em frações do frame: posição + tamanho.
  const cropRect = useMemo(() => {
    if (!target) return null;
    const targetAR = target.width / target.height;
    const baseW = Math.min(1, targetAR / sourceAR);
    const baseH = Math.min(1, sourceAR / targetAR);
    const w = baseW / zoom;
    const h = baseH / zoom;
    const left = cropX * (1 - w);
    const top = cropY * (1 - h);
    return { w, h, left, top };
  }, [target, sourceAR, zoom, cropX, cropY]);

  const isCropMode = activeClip?.fill === "crop";

  // --- Arraste (pan) da região de recorte ---
  const dragState = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isCropMode || !cropRect) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: cropRect.left,
        startTop: cropRect.top,
      };
    },
    [isCropMode, cropRect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current;
      const frame = frameRef.current;
      if (!drag || !frame || !cropRect) return;
      const rect = frame.getBoundingClientRect();
      const dxFrac = (e.clientX - drag.startX) / rect.width;
      const dyFrac = (e.clientY - drag.startY) / rect.height;

      const availW = 1 - cropRect.w;
      const availH = 1 - cropRect.h;
      const newLeft = clamp(drag.startLeft + dxFrac, 0, availW);
      const newTop = clamp(drag.startTop + dyFrac, 0, availH);
      onUpdateActiveFraming({
        cropX: availW > 0 ? newLeft / availW : 0.5,
        cropY: availH > 0 ? newTop / availH : 0.5,
      });
    },
    [cropRect, onUpdateActiveFraming]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  // Wire dos eventos do <video>.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => onTimeUpdate(v.currentTime);
    const onDur = () => onDurationChange(v.duration);
    const onPlay = () => onPlayStateChange(true);
    const onPause = () => onPlayStateChange(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [videoRef, onTimeUpdate, onDurationChange, onPlayStateChange]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Área do vídeo */}
      <div className="relative flex flex-1 items-center justify-center rounded-2xl bg-black/60 p-4">
        <div
          ref={frameRef}
          className="relative max-h-full max-w-full overflow-hidden rounded-lg shadow-2xl shadow-black/50"
          style={{ aspectRatio: `${source.width} / ${source.height}` }}
        >
          <video
            ref={videoRef}
            src={source.url}
            className="block h-full w-full"
            playsInline
          />

          {/* Overlay da máscara do aspecto escolhido */}
          {target && cropRect && (
            <div className="absolute inset-0">
              {isCropMode ? (
                <>
                  {/* Sombras fora da região aproveitada */}
                  <MaskShades
                    left={cropRect.left}
                    top={cropRect.top}
                    w={cropRect.w}
                    h={cropRect.h}
                  />
                  {/* Caixa de recorte — arrastável */}
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="group absolute cursor-move rounded-sm border-2 border-brand ring-1 ring-black/40 touch-none"
                    style={{
                      left: `${cropRect.left * 100}%`,
                      top: `${cropRect.top * 100}%`,
                      width: `${cropRect.w * 100}%`,
                      height: `${cropRect.h * 100}%`,
                    }}
                  >
                    {/* grade de terços */}
                    <div className="pointer-events-none absolute inset-0 opacity-50">
                      <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
                      <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
                      <div className="absolute top-1/3 left-0 w-full h-px bg-white/40" />
                      <div className="absolute top-2/3 left-0 w-full h-px bg-white/40" />
                    </div>
                    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Move className="h-3 w-3" /> arraste
                    </div>
                  </div>
                </>
              ) : (
                <div className="pointer-events-none absolute inset-2 rounded-sm border-2 border-dashed border-accent/70" />
              )}

              <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
                {target.label} · {target.width}×{target.height}
                {isCropMode && zoom > 1 ? ` · ${zoom.toFixed(1)}x` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Controles + timeline */}
      <div className="rounded-2xl border border-edge bg-panel-light p-4">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover"
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => onSeek(0)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-lighter text-slate-300 transition-colors hover:text-white"
            aria-label="Voltar ao início"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="ml-1 font-mono text-sm text-slate-300">
            <span className="text-white">{formatTime(currentTime)}</span>
            <span className="text-slate-500"> / {formatTime(duration)}</span>
          </div>
        </div>

        {/* Timeline com waveform, faixas dos clipes, prévia e enquadramentos */}
        <TimelineTrack
          source={source}
          clips={clips}
          activeClip={activeClip}
          activeClipId={activeClip?.id ?? null}
          currentTime={currentTime}
          duration={duration}
          peaks={peaks}
          onSeek={onSeek}
          onMoveFraming={onMoveFraming}
        />

        {activeClip && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Scissors className="h-3.5 w-3.5 text-accent" />
            Editando:{" "}
            <span className="font-medium text-slate-200">
              {activeClip.name}
            </span>
            <span className="text-slate-500">
              ({formatTime(activeClip.start)} → {formatTime(activeClip.end)})
            </span>
          </div>
        )}

        {/* Enquadramentos por trecho (multicâmera) — só no modo Crop */}
        {activeClip &&
          activeClip.fill === "crop" &&
          activeClip.aspect !== "original" && (
            <FramingControls
              clip={activeClip}
              currentTime={currentTime}
              onAdd={onAddFraming}
              onRemove={onRemoveFraming}
              onSeek={onSeek}
            />
          )}
      </div>
    </div>
  );
}

/**
 * Quatro retângulos escuros cobrindo a área fora da região de recorte
 * (definida por left/top/w/h em frações de 0..1).
 */
function MaskShades({
  left,
  top,
  w,
  h,
}: {
  left: number;
  top: number;
  w: number;
  h: number;
}) {
  const shade = "pointer-events-none absolute bg-black/60";
  const rightStart = (left + w) * 100;
  const bottomStart = (top + h) * 100;
  return (
    <>
      {/* topo */}
      <div className={shade} style={{ left: 0, right: 0, top: 0, height: `${top * 100}%` }} />
      {/* base */}
      <div className={shade} style={{ left: 0, right: 0, top: `${bottomStart}%`, bottom: 0 }} />
      {/* esquerda (na faixa do recorte) */}
      <div
        className={shade}
        style={{ top: `${top * 100}%`, height: `${h * 100}%`, left: 0, width: `${left * 100}%` }}
      />
      {/* direita (na faixa do recorte) */}
      <div
        className={shade}
        style={{ top: `${top * 100}%`, height: `${h * 100}%`, left: `${rightStart}%`, right: 0 }}
      />
    </>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Painel de enquadramentos por trecho (troca de câmera): lista os pontos de
 * enquadramento do clipe, permite ir até cada um, adicionar no tempo atual e
 * remover. Os marcadores também aparecem na timeline (ver TimelineTrack).
 */
function FramingControls({
  clip,
  currentTime,
  onAdd,
  onRemove,
  onSeek,
}: {
  clip: Clip;
  currentTime: number;
  onAdd: () => void;
  onRemove: (t: number) => void;
  onSeek: (t: number) => void;
}) {
  const framings =
    clip.framings ?? [
      { t: clip.start, cropX: clip.cropX, cropY: clip.cropY, zoom: clip.zoom },
    ];
  const activeIdx = Math.max(0, activeFramingIndex(clip, currentTime));

  return (
    <div className="mt-3 rounded-lg border border-edge bg-panel p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
          <Camera className="h-3.5 w-3.5 text-brand" />
          Enquadramentos (câmeras)
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-brand-hover"
          title="Cria um enquadramento a partir do tempo atual do player"
        >
          <Plus className="h-3 w-3" /> Adicionar no tempo atual
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {framings.map((f, i) => {
          const isActive = i === activeIdx;
          return (
            <span
              key={`${f.t}-${i}`}
              className={[
                "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors",
                isActive
                  ? "border-brand bg-brand-soft text-white"
                  : "border-edge bg-panel-lighter text-slate-300",
              ].join(" ")}
            >
              <button
                onClick={() => onSeek(f.t)}
                className="font-mono"
                title="Ir para este enquadramento"
              >
                {i + 1} · {formatTime(f.t)}
              </button>
              {framings.length > 1 && (
                <button
                  onClick={() => onRemove(f.t)}
                  className="text-slate-500 transition-colors hover:text-red-400"
                  title="Remover enquadramento"
                  aria-label="Remover enquadramento"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-tight text-slate-500">
        Vá até a troca de câmera, clique em “Adicionar no tempo atual” e
        reposicione a caixa no preview. Cada trecho mantém seu enquadramento até
        o próximo (corte seco).
      </p>
    </div>
  );
}
