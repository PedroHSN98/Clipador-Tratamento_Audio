"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  UploadCloud,
  Waves,
  Volume2,
  Gauge,
  Loader2,
  Download,
  RefreshCw,
  Zap,
  CircleDashed,
  Sparkles,
  Play,
} from "lucide-react";
import { loadFFmpeg, processAudio } from "@/lib/ffmpeg";
import {
  DEFAULT_TREATMENT,
  AUDIO_FORMAT_INFO,
  type AudioTreatment,
  type Intensity,
  type LoudnessTarget,
  type AudioFormat,
} from "@/lib/audio-command";

type FFmpegState = "idle" | "loading" | "ready" | "error";
type JobStatus = "idle" | "processing" | "done" | "error";

const ACCEPTED = "audio/*,video/*";

export default function AudioPage() {
  const [file, setFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<AudioTreatment>(DEFAULT_TREATMENT);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<string>("mp3");
  const [error, setError] = useState<string | null>(null);
  const [ffmpegState, setFfmpegState] = useState<FFmpegState>("idle");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback(
    (p: Partial<AudioTreatment>) => setTreatment((t) => ({ ...t, ...p })),
    []
  );

  const handleFile = useCallback(
    (f: File | undefined | null) => {
      setError(null);
      if (!f) return;
      if (!f.type.startsWith("audio/") && !f.type.startsWith("video/")) {
        setError("Envie um arquivo de áudio ou vídeo.");
        return;
      }
      if (srcUrl) URL.revokeObjectURL(srcUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setStatus("idle");
      setProgress(0);
      setFile(f);
      setSrcUrl(URL.createObjectURL(f));
    },
    [srcUrl, resultUrl]
  );

  // Aquece o FFmpeg assim que há arquivo.
  useEffect(() => {
    if (!file || ffmpegState !== "idle") return;
    setFfmpegState("loading");
    loadFFmpeg()
      .then(() => setFfmpegState("ready"))
      .catch(() => setFfmpegState("error"));
  }, [file, ffmpegState]);

  const run = useCallback(async () => {
    if (!file) return;
    setStatus("processing");
    setProgress(0);
    setError(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    try {
      const res = await processAudio({
        file,
        treatment,
        onProgress: setProgress,
      });
      setResultUrl(res.url);
      setResultExt(res.ext);
      setStatus("done");
      setProgress(100);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Falha ao tratar o áudio."
      );
    }
  }, [file, treatment, resultUrl]);

  const reset = useCallback(() => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setSrcUrl(null);
    setResultUrl(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, [srcUrl, resultUrl]);

  const downloadName = file
    ? `${baseName(file.name)}-tratado.${resultExt}`
    : `audio-tratado.${resultExt}`;

  const anyTreatment =
    treatment.denoise || treatment.declip || treatment.normalize;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-[1500px] flex-col px-4 py-5 lg:px-8">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold leading-tight text-white">
            <AudioLines className="h-4 w-4 text-accent" />
            Tratador de Áudio
          </h1>
          <p className="text-xs text-slate-500">
            Remove ruído, corrige estouros e nivela o volume — tudo no navegador
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FFmpegStatus state={ffmpegState} />
          {file && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel-light px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Novo arquivo
            </button>
          )}
        </div>
      </header>

      {!file ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="mx-auto w-full max-w-2xl">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className={[
                "cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors",
                dragging
                  ? "border-accent bg-accent/10"
                  : "border-edge bg-panel-light hover:border-accent/60 hover:bg-panel-lighter",
              ].join(" ")}
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-white">
                Arraste seu áudio ou vídeo aqui
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                ou clique para selecionar — MP3, WAV, M4A, MP4…
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            {error && (
              <p className="mt-3 text-center text-sm text-red-400">{error}</p>
            )}
            <p className="mt-6 text-center text-xs text-slate-500">
              Seu arquivo é processado localmente e não é enviado a nenhum
              servidor.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
          {/* Painel de players */}
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl border border-edge bg-panel-light p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Play className="h-4 w-4 text-slate-400" /> Original
              </div>
              <p className="mb-3 truncate text-xs text-slate-500" title={file.name}>
                {file.name}
              </p>
              {srcUrl && (
                <audio src={srcUrl} controls className="w-full" preload="metadata" />
              )}
            </div>

            <div
              className={[
                "rounded-2xl border p-5 transition-colors",
                resultUrl
                  ? "border-accent/50 bg-accent/5"
                  : "border-edge bg-panel-light/40",
              ].join(" ")}
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-accent" /> Áudio tratado
              </div>

              {status === "processing" && (
                <div className="py-4">
                  <div className="mb-2 flex justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processando…
                    </span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {status === "error" && error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              {status !== "processing" && resultUrl && (
                <>
                  <audio
                    src={resultUrl}
                    controls
                    className="w-full"
                    preload="metadata"
                  />
                  <a
                    href={resultUrl}
                    download={downloadName}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-panel transition-colors hover:brightness-110"
                  >
                    <Download className="h-4 w-4" /> Baixar áudio tratado
                  </a>
                </>
              )}

              {status === "idle" && !resultUrl && (
                <p className="py-4 text-xs text-slate-500">
                  Ajuste as opções ao lado e clique em “Tratar áudio”. O
                  resultado aparece aqui para você comparar antes de baixar.
                </p>
              )}
            </div>
          </section>

          {/* Painel de opções */}
          <aside className="flex flex-col gap-3 rounded-2xl border border-edge bg-panel/60 p-4">
            <h2 className="text-sm font-semibold text-white">Tratamentos</h2>

            {/* Ruído */}
            <OptionCard
              icon={Waves}
              title="Reduzir ruído de fundo"
              desc="Remove chiado, zumbido e ruído constante"
              enabled={treatment.denoise}
              onToggle={(v) => patch({ denoise: v })}
            >
              <Pills<Intensity>
                value={treatment.denoiseLevel}
                onChange={(v) => patch({ denoiseLevel: v })}
                options={[
                  { value: "leve", label: "Leve" },
                  { value: "medio", label: "Médio" },
                  { value: "forte", label: "Forte" },
                ]}
              />
            </OptionCard>

            {/* Estouro */}
            <OptionCard
              icon={Gauge}
              title="Corrigir áudio estourado"
              desc="Repara distorção/clipping e controla os picos"
              enabled={treatment.declip}
              onToggle={(v) => patch({ declip: v })}
            />

            {/* Normalização */}
            <OptionCard
              icon={Volume2}
              title="Nivelar volume"
              desc="Deixa tudo na mesma sintonia (sobe o baixo, controla o alto)"
              enabled={treatment.normalize}
              onToggle={(v) => patch({ normalize: v })}
            >
              <Pills<LoudnessTarget>
                value={treatment.loudness}
                onChange={(v) => patch({ loudness: v })}
                options={[
                  { value: "-14", label: "Alto" },
                  { value: "-16", label: "Padrão" },
                  { value: "-23", label: "Suave" },
                ]}
              />
            </OptionCard>

            {/* Formato */}
            <div className="rounded-xl border border-edge bg-panel-light p-3">
              <div className="mb-2 text-xs font-medium text-slate-400">
                Formato de saída
              </div>
              <Pills<AudioFormat>
                value={treatment.format}
                onChange={(v) => patch({ format: v })}
                options={(Object.keys(AUDIO_FORMAT_INFO) as AudioFormat[]).map(
                  (k) => ({ value: k, label: AUDIO_FORMAT_INFO[k].label })
                )}
              />
            </div>

            <button
              onClick={run}
              disabled={status === "processing" || !anyTreatment}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-panel transition-colors hover:brightness-110 disabled:opacity-40"
            >
              {status === "processing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {status === "done" ? "Tratar novamente" : "Tratar áudio"}
            </button>
            {!anyTreatment && (
              <p className="text-center text-[11px] text-amber-400/80">
                Ative pelo menos um tratamento.
              </p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

// ---- Subcomponentes ----

function OptionCard({
  icon: Icon,
  title,
  desc,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-3 transition-colors",
        enabled ? "border-brand/50 bg-brand-soft/20" : "border-edge bg-panel-light",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            enabled ? "bg-brand/20 text-brand" : "bg-panel text-slate-500",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="text-[11px] leading-tight text-slate-500">{desc}</div>
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>
      {enabled && children && <div className="mt-3 pl-11">{children}</div>}
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-brand" : "bg-edge",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "rounded-lg border px-2.5 py-1 text-xs transition-colors",
            value === o.value
              ? "border-brand bg-brand text-white"
              : "border-edge bg-panel text-slate-300 hover:border-brand/40",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FFmpegStatus({ state }: { state: FFmpegState }) {
  const map = {
    idle: { icon: CircleDashed, text: "Motor em espera", cls: "text-slate-500" },
    loading: { icon: Loader2, text: "Carregando motor…", cls: "text-amber-400" },
    ready: { icon: Zap, text: "Motor pronto", cls: "text-emerald-400" },
    error: { icon: CircleDashed, text: "Falha no motor", cls: "text-red-400" },
  } as const;
  const { icon: Icon, text, cls } = map[state];
  return (
    <span className={`hidden items-center gap-1.5 text-xs sm:flex ${cls}`}>
      <Icon
        className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`}
      />
      {text}
    </span>
  );
}

function baseName(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, "");
  return (
    noExt.replace(/[^\w\-À-ú ]+/g, "").trim().replace(/\s+/g, "_") || "audio"
  );
}
