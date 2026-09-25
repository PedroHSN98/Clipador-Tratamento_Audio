import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/AppNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Video Clipper Studio",
  description:
    "Clipador profissional de vídeos — corte, converta aspect ratio e baixe múltiplos clipes 100% no navegador com FFmpeg.wasm.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
