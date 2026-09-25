"use client";

import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["Espaço"], desc: "Reproduzir / pausar" },
  { keys: ["I"], desc: "Marcar início do clipe ativo no ponto atual" },
  { keys: ["O"], desc: "Marcar fim do clipe ativo no ponto atual" },
  { keys: ["N"], desc: "Novo clipe" },
  { keys: ["D"], desc: "Duplicar clipe ativo" },
  { keys: ["←", "→"], desc: "Retroceder / avançar 1s (Shift = 5s)" },
  { keys: ["J"], desc: "Reduzir a velocidade / câmera lenta" },
  { keys: ["K"], desc: "Pausar e voltar à velocidade normal" },
  { keys: ["L"], desc: "Acelerar a reprodução" },
  { keys: ["?"], desc: "Abrir / fechar esta ajuda" },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-edge bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Keyboard className="h-4 w-4 text-brand" /> Atalhos de teclado
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-panel-lighter hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li
              key={s.desc}
              className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-xs hover:bg-panel-light"
            >
              <span className="text-slate-300">{s.desc}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[1.6rem] rounded-md border border-edge bg-panel-lighter px-1.5 py-0.5 text-center font-mono text-[11px] text-slate-200"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] leading-tight text-slate-500">
          Os atalhos ficam inativos enquanto você digita em um campo de texto.
        </p>
      </div>
    </div>
  );
}
