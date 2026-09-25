import type { AspectPreset, FillModePreset } from "./types";

export const ASPECT_PRESETS: AspectPreset[] = [
  {
    id: "9:16",
    label: "9:16 Vertical",
    hint: "TikTok • Reels • Shorts",
    width: 1080,
    height: 1920,
  },
  {
    id: "1:1",
    label: "1:1 Quadrado",
    hint: "Feed Instagram",
    width: 1080,
    height: 1080,
  },
  {
    id: "16:9",
    label: "16:9 Horizontal",
    hint: "YouTube padrão",
    width: 1920,
    height: 1080,
  },
  {
    id: "4:5",
    label: "4:5 Retrato",
    hint: "Feed vertical",
    width: 1080,
    height: 1350,
  },
];

export const FILL_PRESETS: FillModePreset[] = [
  {
    id: "crop",
    label: "Preencher (Crop)",
    hint: "Pan & Scan — corta as bordas, sem barras",
  },
  {
    id: "blur",
    label: "Fundo desfocado",
    hint: "Vídeo centralizado com blur nas laterais",
  },
  {
    id: "fit",
    label: "Barras pretas",
    hint: "Vídeo inteiro com barras (letterbox)",
  },
];

export function getAspect(id: AspectPresetId): AspectPreset {
  return ASPECT_PRESETS.find((a) => a.id === id) ?? ASPECT_PRESETS[0];
}

type AspectPresetId = AspectPreset["id"];
