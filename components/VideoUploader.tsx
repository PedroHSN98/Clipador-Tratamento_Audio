"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, Film } from "lucide-react";

const ACCEPTED = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi"];

export function VideoUploader({
  onFile,
}: {
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      setError(null);
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setError("Arquivo inválido. Envie um vídeo (MP4, WebM, MOV...).");
        return;
      }
      onFile(file);
    },
    [onFile]
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={[
          "group cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors",
          dragging
            ? "border-brand bg-brand-soft/40"
            : "border-edge bg-panel-light hover:border-brand/60 hover:bg-panel-lighter",
        ].join(" ")}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-semibold text-white">
          Arraste seu vídeo aqui
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          ou clique para selecionar do computador
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <Film className="h-4 w-4" />
          {ACCEPTED.map((ext) => (
            <span
              key={ext}
              className="rounded-md bg-panel px-2 py-0.5 font-mono uppercase"
            >
              {ext.replace(".", "")}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-3 text-center text-sm text-red-400">{error}</p>
      )}

      <p className="mt-6 text-center text-xs text-slate-500">
        100% no navegador — seu vídeo não é enviado para nenhum servidor.
      </p>
    </div>
  );
}
