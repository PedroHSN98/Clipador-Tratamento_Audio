"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, AudioLines } from "lucide-react";

const TABS = [
  { href: "/", label: "Clipador de Vídeo", icon: Clapperboard },
  { href: "/audio", label: "Tratador de Áudio", icon: AudioLines },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-panel/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold leading-tight text-white">
              Video Clipper Studio
            </div>
            <div className="text-[10px] text-slate-500">
              100% no navegador
            </div>
          </div>
        </Link>

        <nav className="ml-2 flex items-center gap-1 rounded-xl bg-panel-light p-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-brand text-white"
                    : "text-slate-400 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
