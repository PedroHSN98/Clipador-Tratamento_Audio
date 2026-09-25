"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Plus,
  Clapperboard,
  Package,
  Loader2,
  Zap,
  CircleDashed,
  RefreshCw,
} from "lucide-react";
import type { Clip, SourceVideo } from "@/lib/types";
import { loadFFmpeg, renderClip } from "@/lib/ffmpeg";
import { VideoUploader } from "@/components/VideoUploader";
import { PreviewPanel } from "@/components/PreviewPanel";
import { ClipCard } from "@/components/ClipCard";

type FFmpegState = "idle" | "loading" | "ready" | "error";

export default function Page() {
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ffmpegState, setFfmpegState] = useState<FFmpegState>("idle");
  const [renderingAll, setRenderingAll] = useState(false);
  const [zipping, setZipping] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const activeClip = clips.find((c) => c.id === activeClipId) ?? null;

  // ---- Carregamento do vídeo de origem ----
  const handleFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const src: SourceVideo = {
        file,
        url,
        duration: probe.duration,
        width: probe.videoWidth || 1920,
        height: probe.videoHeight || 1080,
      };
      setSource(src);
      setDuration(probe.duration);

      // Primeiro clipe padrão cobrindo até 30s (ou o vídeo inteiro).
      const first = makeClip(0, Math.min(30, probe.duration), 1);
      setClips([first]);
      setActiveClipId(first.id);
    };
  }, []);

  // Aquece o FF.wasm assim que há um vídeo carregado.
  useEffect(() => {
    if (!source || ffmpegState !== "idle") return;
    setFfmpegState("loading");
    loadFFmpeg()
      .then(() => setFfmpegState("ready"))
      .catch(() => setFfmpegState("error"));
  }, [source, ffmpegState]);

  // ---- CRUD de clipes ----
  const addClip = useCallback(() => {
    if (!source) return;
    setClips((prev) => {
      const start = Math.min(currentTime, source.duration - 1);
      const end = Math.min(start + 15, source.duration);
      const clip = makeClip(start, end, prev.length + 1);
      setActiveClipId(clip.id);
      return [...prev, clip];
    });
  }, [source, currentTime]);

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }, []);

  const removeClip = useCallback(
    (id: string) => {
      setClips((prev) => {
        const target = prev.find((c) => c.id === id);
        if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl);
        return prev.filter((c) => c.id !== id);
      });
      setActiveClipId((cur) => (cur === id ? null : cur));
    },
    []
  );

  // ---- Player ----
  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }, []);

  // ---- Renderização ----
  const renderOne = useCallback(
    async (id: string) => {
      if (!source) return;
      const clip = clipsRef.current.find((c) => c.id === id);
      if (!clip) return;
      updateClip(id, { status: "processing", progress: 0, errorMessage: undefined });
      try {
        const resultUrl = await renderClip({
          source,
          clip,
          onProgress: (p) => updateClip(id, { progress: p }),
        });
        updateClip(id, { status: "done", progress: 100, resultUrl });
      } catch (err) {
        updateClip(id, {
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "Falha ao renderizar o clipe.",
        });
      }
    },
    [source, updateClip]
  );

  // Mantém uma referência viva de clips para o loop sequencial.
  const clipsRef = useRef<Clip[]>(clips);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const renderAll = useCallback(async () => {
    setRenderingAll(true);
    try {
      for (const c of clipsRef.current) {
        await renderOne(c.id);
      }
    } finally {
      setRenderingAll(false);
    }
  }, [renderOne]);

  const downloadZip = useCallback(async () => {
    const ready = clipsRef.current.filter((c) => c.resultUrl);
    if (ready.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const c of ready) {
        const blob = await (await fetch(c.resultUrl!)).blob();
        let name = `${safeName(c.name)}.mp4`;
        let i = 2;
        while (used.has(name)) name = `${safeName(c.name)}_${i++}.mp4`;
        used.add(name);
        zip.file(name, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clipes-video-clipper-studio.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }, []);

  const resetSource = useCallback(() => {
    if (source) URL.revokeObjectURL(source.url);
    clips.forEach((c) => c.resultUrl && URL.revokeObjectURL(c.resultUrl));
    setSource(null);
    setClips([]);
    setActiveClipId(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [source, clips]);

  const readyCount = clips.filter((c) => c.resultUrl).length;

  // ---- Render ----
  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-5 lg:px-8">
      <Header
        ffmpegState={ffmpegState}
        hasSource={!!source}
        onReset={resetSource}
      />

      {!source ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <VideoUploader onFile={handleFile} />
        </div>
      ) : (
        <div className="mt-5 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
          {/* Preview central */}
          <section className="min-h-[420px] lg:min-h-0">
            <PreviewPanel
              source={source}
              videoRef={videoRef}
              activeClip={activeClip}
              clips={clips}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onSeek={seek}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
              onPlayStateChange={setIsPlaying}
              onUpdateActiveClip={(patch) =>
                activeClip && updateClip(activeClip.id, patch)
              }
            />
          </section>

          {/* Painel lateral de clipes */}
          <aside className="flex flex-col rounded-2xl border border-edge bg-panel/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Clapperboard className="h-4 w-4 text-brand" />
                Clipes ({clips.length})
              </h2>
              <button
                onClick={addClip}
                className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-hover"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>

            {/* Ações em lote */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={renderAll}
                disabled={renderingAll || clips.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-brand/50 bg-brand-soft/50 px-2 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-soft disabled:opacity-40"
              >
                {renderingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Renderizar todos
              </button>
              <button
                onClick={downloadZip}
                disabled={zipping || readyCount === 0}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-edge bg-panel-lighter px-2 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-accent/50 disabled:opacity-40"
              >
                {zipping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Package className="h-3.5 w-3.5" />
                )}
                Baixar ZIP ({readyCount})
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {clips.map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  index={i}
                  duration={duration}
                  currentTime={currentTime}
                  isActive={clip.id === activeClipId}
                  onSelect={() => setActiveClipId(clip.id)}
                  onUpdate={(patch) => updateClip(clip.id, patch)}
                  onRemove={() => removeClip(clip.id)}
                  onRender={() => renderOne(clip.id)}
                  onSeek={seek}
                />
              ))}

              {clips.length === 0 && (
                <p className="rounded-lg border border-dashed border-edge py-8 text-center text-xs text-slate-500">
                  Nenhum clipe. Clique em “Adicionar”.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ---- Helpers ----

function makeClip(start: number, end: number, n: number): Clip {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    name: `Corte ${String(n).padStart(2, "0")}`,
    start,
    end,
    aspect: "9:16",
    fill: "crop",
    cropX: 0.5,
    cropY: 0.5,
    zoom: 1,
    status: "idle",
    progress: 0,
  };
}

function safeName(name: string): string {
  return (
    name.replace(/[^\w\-À-ú ]+/g, "").trim().replace(/\s+/g, "_") || "clipe"
  );
}

function Header({
  ffmpegState,
  hasSource,
  onReset,
}: {
  ffmpegState: FFmpegState;
  hasSource: boolean;
  onReset: () => void;
}) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-base font-bold leading-tight text-white">
          <Clapperboard className="h-4 w-4 text-brand" />
          Clipador de Vídeo
        </h1>
        <p className="text-xs text-slate-500">
          Corte, converta o formato e baixe — múltiplos clipes de uma vez
        </p>
      </div>

      <div className="flex items-center gap-3">
        <FFmpegStatus state={ffmpegState} />
        {hasSource && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel-light px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Novo vídeo
          </button>
        )}
      </div>
    </header>
  );
}

function FFmpegStatus({ state }: { state: FFmpegState }) {
  const map = {
    idle: { icon: CircleDashed, text: "Motor em espera", cls: "text-slate-500" },
    loading: {
      icon: Loader2,
      text: "Carregando motor…",
      cls: "text-amber-400",
    },
    ready: { icon: Zap, text: "Motor pronto", cls: "text-emerald-400" },
    error: {
      icon: CircleDashed,
      text: "Falha no motor",
      cls: "text-red-400",
    },
  } as const;
  const { icon: Icon, text, cls } = map[state];
  return (
    <span
      className={`hidden items-center gap-1.5 text-xs sm:flex ${cls}`}
      title="Estado do FFmpeg.wasm"
    >
      <Icon className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
      {text}
    </span>
  );
}
