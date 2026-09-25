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
  Keyboard,
  Wand2,
} from "lucide-react";
import type { Clip, SourceVideo } from "@/lib/types";
import { loadFFmpeg, renderClip, terminateFFmpeg } from "@/lib/ffmpeg";
import { VideoUploader } from "@/components/VideoUploader";
import { PreviewPanel } from "@/components/PreviewPanel";
import { ClipCard } from "@/components/ClipCard";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { saveProject, loadProject, clearProject } from "@/lib/storage";
import { computeWaveform } from "@/lib/waveform";
import { detectSegments } from "@/lib/auto-detect";

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
  const [restored, setRestored] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [detecting, setDetecting] = useState(false);

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

  // ---- Restauração do projeto salvo (uma vez, ao montar) ----
  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((saved) => {
        if (cancelled || !saved) return;
        setSource(saved.source);
        setDuration(saved.source.duration);
        setClips(saved.clips);
        setActiveClipId(saved.clips[0]?.id ?? null);
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Salvamento automático (debounced) do vídeo + clipes ----
  useEffect(() => {
    if (!restored || !source) return;
    const t = setTimeout(() => {
      void saveProject(source, clips);
    }, 600);
    return () => clearTimeout(t);
  }, [restored, source, clips]);

  // ---- Waveform (picos de áudio) — usada pela timeline e pela auto-detecção ----
  useEffect(() => {
    if (!source) {
      setPeaks(null);
      return;
    }
    let active = true;
    setPeaks(null);
    computeWaveform(source.file, 900).then((wf) => {
      if (active) setPeaks(wf?.peaks ?? null);
    });
    return () => {
      active = false;
    };
  }, [source]);

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

  const duplicateClip = useCallback((id: string) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const orig = prev[idx];
      const copy: Clip = {
        ...orig,
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now() + Math.random()),
        name: `${orig.name} (cópia)`,
        // Uma cópia é um novo trabalho: descarta o resultado renderizado.
        status: "idle",
        progress: 0,
        resultUrl: undefined,
        errorMessage: undefined,
      };
      setActiveClipId(copy.id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
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

  // ---- Detecção automática de cortes (por energia do áudio) ----
  const autoDetect = useCallback(() => {
    if (!source || !peaks) return;
    const segments = detectSegments(peaks, source.duration);
    if (segments.length === 0) {
      alert(
        "Não encontrei trechos com áudio nítido para sugerir cortes. " +
          "Ajuste os clipes manualmente ou tente outro vídeo."
      );
      return;
    }

    // Confirma antes de substituir, se o usuário já mexeu nos clipes.
    const current = clipsRef.current;
    const hasWork =
      current.length > 1 || current.some((c) => c.resultUrl || c.status !== "idle");
    if (
      hasWork &&
      !confirm(
        `Detectei ${segments.length} trecho(s). Isso vai substituir os clipes atuais. Continuar?`
      )
    ) {
      return;
    }

    // Usa o formato/enquadramento do clipe ativo como modelo.
    const tmpl =
      current.find((c) => c.id === activeClipIdRef.current) ?? current[0];
    const aspect = tmpl?.aspect ?? "9:16";
    const fill = tmpl?.fill ?? "crop";

    setDetecting(true);
    const detected: Clip[] = segments.map((s, i) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now() + Math.random() + i),
      name: `Auto ${String(i + 1).padStart(2, "0")}`,
      start: s.start,
      end: s.end,
      aspect,
      fill,
      cropX: 0.5,
      cropY: 0.5,
      zoom: 1,
      status: "idle",
      progress: 0,
    }));
    // Descarta blobs dos clipes antigos.
    current.forEach((c) => c.resultUrl && URL.revokeObjectURL(c.resultUrl));
    setClips(detected);
    setActiveClipId(detected[0].id);
    setDetecting(false);
  }, [source, peaks]);

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
  // Sinalizadores de cancelamento (fora do estado para leitura síncrona).
  const cancelIdRef = useRef<string | null>(null);
  const stopBatchRef = useRef(false);

  const renderOne = useCallback(
    async (id: string) => {
      if (!source) return;
      const clip = clipsRef.current.find((c) => c.id === id);
      if (!clip) return;
      // Descarta um resultado anterior antes de re-renderizar.
      if (clip.resultUrl) URL.revokeObjectURL(clip.resultUrl);
      updateClip(id, {
        status: "processing",
        progress: 0,
        startedAt: Date.now(),
        resultUrl: undefined,
        resultExt: undefined,
        errorMessage: undefined,
      });
      try {
        const { url, ext } = await renderClip({
          source,
          clip,
          onProgress: (p) => updateClip(id, { progress: p }),
        });
        updateClip(id, {
          status: "done",
          progress: 100,
          resultUrl: url,
          resultExt: ext,
          startedAt: undefined,
        });
      } catch (err) {
        // Se o erro veio de um cancelamento deliberado, volta ao estado ocioso.
        if (cancelIdRef.current === id) {
          cancelIdRef.current = null;
          updateClip(id, {
            status: "idle",
            progress: 0,
            startedAt: undefined,
            errorMessage: undefined,
          });
        } else {
          updateClip(id, {
            status: "error",
            startedAt: undefined,
            errorMessage:
              err instanceof Error ? err.message : "Falha ao renderizar o clipe.",
          });
        }
      }
    },
    [source, updateClip]
  );

  const cancelRender = useCallback(
    (id: string) => {
      cancelIdRef.current = id;
      stopBatchRef.current = true;
      // Encerra o worker do FFmpeg (aborta o exec em andamento).
      terminateFFmpeg();
      // Reaquece o motor para o próximo render.
      setFfmpegState("idle");
    },
    []
  );

  // Mantém uma referência viva de clips para o loop sequencial.
  const clipsRef = useRef<Clip[]>(clips);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  // Refs vivas usadas pelos atalhos de teclado (evitam rebinds a cada frame).
  const currentTimeRef = useRef(currentTime);
  const activeClipIdRef = useRef(activeClipId);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    activeClipIdRef.current = activeClipId;
  }, [activeClipId]);

  // Duração corrente (via <video> se disponível, senão o estado).
  const durationRef = useRef(duration);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  const dur = useCallback(
    () => videoRef.current?.duration || durationRef.current || 0,
    []
  );

  // ---- Atalhos de teclado (padrão de editores de vídeo) ----
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      // Não sequestra o teclado enquanto o usuário digita num campo.
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const v = videoRef.current;
      const t = currentTimeRef.current;
      const activeId = activeClipIdRef.current;
      const patchActive = (patch: Partial<Clip>) => {
        if (activeId) updateClip(activeId, patch);
      };

      switch (e.key) {
        case " ": // play / pause
          e.preventDefault();
          togglePlay();
          break;
        case "i":
        case "I": // marca início do clipe ativo no ponto atual
          e.preventDefault();
          patchActive({ start: Math.max(0, Math.min(t, dur() - 0.1)) });
          break;
        case "o":
        case "O": // marca fim do clipe ativo no ponto atual
          e.preventDefault();
          patchActive({ end: Math.min(t, dur()) });
          break;
        case "n":
        case "N": // novo clipe
          e.preventDefault();
          addClip();
          break;
        case "d":
        case "D": // duplica clipe ativo
          if (activeId) {
            e.preventDefault();
            duplicateClip(activeId);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(Math.max(0, t - (e.shiftKey ? 5 : 1)));
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(Math.min(dur(), t + (e.shiftKey ? 5 : 1)));
          break;
        case "j":
        case "J": // shuttle: desacelera / reduz a velocidade
          if (v) {
            e.preventDefault();
            v.playbackRate = Math.max(0.25, v.playbackRate / 2);
            if (v.paused) v.play();
          }
          break;
        case "k":
        case "K": // pausa e normaliza a velocidade
          if (v) {
            e.preventDefault();
            v.pause();
            v.playbackRate = 1;
          }
          break;
        case "l":
        case "L": // shuttle: acelera
          if (v) {
            e.preventDefault();
            v.playbackRate = Math.min(4, v.playbackRate < 1 ? 1 : v.playbackRate * 2);
            if (v.paused) v.play();
          }
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((s) => !s);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // dur() lê a ref/estado no momento do evento; deps são estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, togglePlay, addClip, duplicateClip, seek, updateClip, dur]);

  const renderAll = useCallback(async () => {
    setRenderingAll(true);
    stopBatchRef.current = false;
    try {
      for (const c of clipsRef.current) {
        if (stopBatchRef.current) break;
        await renderOne(c.id);
      }
    } finally {
      stopBatchRef.current = false;
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
        const ext = c.resultExt || "mp4";
        let name = `${safeName(c.name)}.${ext}`;
        let i = 2;
        while (used.has(name)) name = `${safeName(c.name)}_${i++}.${ext}`;
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
    void clearProject();
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
        onShowShortcuts={() => setShowShortcuts(true)}
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
              peaks={peaks}
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

            {/* Detecção automática de cortes */}
            <button
              onClick={autoDetect}
              disabled={detecting || !peaks}
              title={
                peaks
                  ? "Sugere clipes automaticamente a partir dos trechos com áudio"
                  : "Analisando o áudio…"
              }
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-2 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
            >
              {detecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {peaks ? "Detectar cortes automaticamente" : "Analisando áudio…"}
            </button>

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
                  onDuplicate={() => duplicateClip(clip.id)}
                  onRender={() => renderOne(clip.id)}
                  onCancel={() => cancelRender(clip.id)}
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

      {showShortcuts && (
        <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
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
  onShowShortcuts,
}: {
  ffmpegState: FFmpegState;
  hasSource: boolean;
  onReset: () => void;
  onShowShortcuts: () => void;
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
          <>
            <button
              onClick={onShowShortcuts}
              title="Atalhos de teclado (?)"
              className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel-light px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Atalhos</span>
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel-light px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Novo vídeo
            </button>
          </>
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
