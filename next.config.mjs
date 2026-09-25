import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fixa a raiz no próprio projeto (há outros lockfiles em diretórios acima).
  outputFileTracingRoot: projectRoot,
  // Cabeçalhos obrigatórios para habilitar SharedArrayBuffer,
  // que o FFmpeg.wasm (multi-thread) precisa para rodar no navegador.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
