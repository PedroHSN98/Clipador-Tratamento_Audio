"use client";

import { useState } from "react";
import {
  Download,
  Trash2,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FlagTriangleRight,
  FlagTriangleLeft,
  ZoomIn,
  Crosshair,
} from "lucide-react";
import type { Clip } from "@/lib/types";
import { ASPECT_PRESETS, FILL_PRESETS } from "@/lib/presets";
import { formatTime, parseTime } from "@/lib/time";
import { DualRangeSlider } from "./DualRangeSlider";

interface ClipCardProps {
  clip: Clip;
  index: number;
  duration: number;
  currentTime: number;
  isActive: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Clip>) => void;
  onRemove: () => void;
  onRender: () => void;
  onSeek: (t: number) => void;
}

export function ClipCard({
  clip,
  index,
  duration,
  currentTime,
  isActive,
  onSelect,
  onUpdate,
  onRemove,
  onRender,
  onSeek,
}: ClipCardProps) {
  return (
    <div
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-xl border bg-panel-light p-4 transition-colors",
        isActive
          ? "border-brand ring-1 ring-brand/40"
          : "border-edge hover:border-brand/40",
      ].join(" ")}
    >
      {/* Cabeçalho: nome + status + remover */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-bold text-brand">
          {index + 1}
        </span>
        <input
          value={clip.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-white outline-none focus:bg-panel focus:ring-1 focus:ring-brand/50"
        />
        <StatusBadge clip={clip} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label="Remover clipe"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Timestamps */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <TimeField
          label="Início"
          value={clip.start}
          onCommit={(v) =>
            onUpdate({ start: clamp(v, 0, clip.end - 0.1) })
          }
          onSetCurrent={() =>
            onUpdate({ start: clamp(currentTime, 0, clip.end - 0.1) })
          }
        />
        <TimeField
          label="Fim"
          value={clip.end}
          onCommit={(v) =>
            onUpdate({ end: clamp(v, clip.start + 0.1, duration) })
          }
          onSetCurrent={() =>
            onUpdate({ end: clamp(currentTime, clip.start + 0.1, duration) })
          }
          alignEnd
        />
      </div>

      {/* Slider duplo */}
      <div onClick={(e) => e.stopPropagation()} className="mb-3 px-1">
        <DualRangeSlider
          min={0}
          max={duration || 0}
          start={clip.start}
          end={clip.end}
          onChange={(s, en) => onUpdate({ start: s, end: en })}
        />
      </div>

      {/* Aspect ratio */}
      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Formato de saída
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {ASPECT_PRESETS.map((a) => (
            <button
              key={a.id}
              onClick={() => onUpdate({ aspect: a.id })}
              className={[
                "rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                clip.aspect === a.id
                  ? "border-brand bg-brand-soft text-white"
                  : "border-edge bg-panel text-slate-300 hover:border-brand/40",
              ].join(" ")}
            >
              <div className="font-semibold">{a.label}</div>
              <div className="text-[10px] text-slate-500">{a.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Modo de enquadramento */}
      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Enquadramento
        </label>
        <div className="flex flex-col gap-1.5">
          {FILL_PRESETS.map((f) => (
            <button
              key={f.id}
              onClick={() => onUpdate({ fill: f.id })}
              className={[
                "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                clip.fill === f.id
                  ? "border-brand bg-brand-soft text-white"
                  : "border-edge bg-panel text-slate-300 hover:border-brand/40",
              ].join(" ")}
            >
              <span className="font-medium">{f.label}</span>
              <span className="ml-2 text-[10px] text-slate-500">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reposicionamento + zoom (só no modo Preencher/Crop) */}
      {clip.fill === "crop" && (
        <div
          className="mb-3 rounded-lg border border-edge bg-panel p-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-300">
              <ZoomIn className="h-3.5 w-3.5 text-brand" /> Enquadramento
            </span>
            <button
              onClick={() => onUpdate({ cropX: 0.5, cropY: 0.5, zoom: 1 })}
              className="flex items-center gap-1 text-[10px] text-slate-400 transition-colors hover:text-white"
            >
              <Crosshair className="h-3 w-3" /> Centralizar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={clip.zoom}
              onChange={(e) =>
                onUpdate({ zoom: parseFloat(e.target.value) })
              }
              className="h-4 flex-1"
              aria-label="Zoom do recorte"
            />
            <span className="w-9 text-right font-mono text-[11px] text-slate-300">
              {clip.zoom.toFixed(1)}x
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-slate-500">
            Arraste a caixa no preview para escolher a área do vídeo.
          </p>
        </div>
      )}

      {/* Barra de progresso durante render */}
      {clip.status === "processing" && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Renderizando…</span>
            <span className="font-mono">{clip.progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all"
              style={{ width: `${clip.progress}%` }}
            />
          </div>
        </div>
      )}

      {clip.status === "error" && clip.errorMessage && (
        <p className="mb-3 rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
          {clip.errorMessage}
        </p>
      )}

      {/* Ações */}
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onSeek(clip.start)}
          className="flex items-center gap-1.5 rounded-lg bg-panel-lighter px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
        >
          <Play className="h-3.5 w-3.5" /> Prever
        </button>
        <button
          onClick={onRender}
          disabled={clip.status === "processing"}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {clip.status === "processing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {clip.resultUrl ? "Renderizar de novo" : "Renderizar"}
        </button>
        {clip.resultUrl && (
          <a
            href={clip.resultUrl}
            download={`${sanitize(clip.name)}.mp4`}
            className="flex items-center gap-1.5 rounded-lg bg-accent/90 px-2.5 py-1.5 text-xs font-medium text-panel transition-colors hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> Baixar
          </a>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ clip }: { clip: Clip }) {
  if (clip.status === "done" || clip.resultUrl) {
    return (
      <span title="Pronto">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </span>
    );
  }
  if (clip.status === "processing") {
    return <Loader2 className="h-4 w-4 animate-spin text-brand" />;
  }
  if (clip.status === "error") {
    return (
      <span title="Erro">
        <AlertCircle className="h-4 w-4 text-red-400" />
      </span>
    );
  }
  return null;
}

function TimeField({
  label,
  value,
  onCommit,
  onSetCurrent,
  alignEnd,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  onSetCurrent: () => void;
  alignEnd?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatTime(value);

  return (
    <div className="rounded-lg border border-edge bg-panel p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <button
          onClick={onSetCurrent}
          title="Definir no ponto atual do player"
          className="flex items-center gap-0.5 text-[10px] text-brand hover:text-brand-hover"
        >
          {alignEnd ? (
            <FlagTriangleLeft className="h-3 w-3" />
          ) : (
            <FlagTriangleRight className="h-3 w-3" />
          )}
          agora
        </button>
      </div>
      <input
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) {
            const parsed = parseTime(draft);
            if (parsed !== null) onCommit(parsed);
            setDraft(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full bg-transparent font-mono text-sm text-white outline-none"
      />
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitize(name: string): string {
  return name.replace(/[^\w\-À-ú ]+/g, "").trim().replace(/\s+/g, "_") || "clipe";
}
