// Enquadramentos por trecho (multicâmera) dentro de um clipe.
//
// Problema: em gravações com troca de câmera, a pessoa aparece em posições
// diferentes ao longo do mesmo corte. Um crop fixo não acompanha. Aqui um clipe
// (no modo "crop") pode ter VÁRIOS enquadramentos, cada um valendo a partir de
// um tempo — com CORTE SECO na virada (sem interpolação), como a troca de câmera.
//
// Compatibilidade: quando `framings` está ausente, usa-se o crop base do clipe
// (cropX/cropY/zoom) para o corte inteiro — comportamento original preservado.

import type { Clip, Framing } from "./types";

export type { Framing };

export interface CropSegment {
  start: number;
  end: number;
  cropX: number;
  cropY: number;
  zoom: number;
}

function baseCrop(clip: Clip) {
  return { cropX: clip.cropX, cropY: clip.cropY, zoom: clip.zoom };
}

/** Índice do enquadramento ativo em `time` (último com t <= time). -1 se não há framings. */
export function activeFramingIndex(clip: Clip, time: number): number {
  const fr = clip.framings;
  if (!fr || fr.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < fr.length; i++) {
    if (fr[i].t <= time + 1e-6) idx = i;
    else break;
  }
  return idx;
}

/** Crop ativo em `time` (enquadramento ativo, ou a base do clipe). */
export function getFramingAt(
  clip: Clip,
  time: number
): { cropX: number; cropY: number; zoom: number } {
  const idx = activeFramingIndex(clip, time);
  if (idx === -1) return baseCrop(clip);
  const f = clip.framings![idx];
  return { cropX: f.cropX, cropY: f.cropY, zoom: f.zoom };
}

/** Aplica um patch de crop ao enquadramento ativo em `time` (ou à base). */
export function applyFramingPatch(
  clip: Clip,
  time: number,
  patch: Partial<{ cropX: number; cropY: number; zoom: number }>
): Clip {
  const idx = activeFramingIndex(clip, time);
  if (idx === -1) {
    return { ...clip, ...patch };
  }
  const framings = clip.framings!.map((f, i) =>
    i === idx ? { ...f, ...patch } : f
  );
  return { ...clip, framings };
}

/** Adiciona um enquadramento no tempo `time` (copiando o crop ativo naquele ponto). */
export function addFraming(clip: Clip, time: number): Clip {
  const t = Math.max(clip.start, Math.min(time, clip.end - 0.05));
  const framings = clip.framings ? [...clip.framings] : [];
  if (framings.length === 0) {
    // Converte a base no primeiro enquadramento, ancorado no início do clipe.
    framings.push({
      t: clip.start,
      cropX: clip.cropX,
      cropY: clip.cropY,
      zoom: clip.zoom,
    });
  }
  // Evita duplicar num tempo muito próximo de um existente.
  if (framings.some((f) => Math.abs(f.t - t) < 0.15)) {
    return { ...clip, framings };
  }
  const cur = getFramingAt({ ...clip, framings }, t);
  framings.push({ t, ...cur });
  framings.sort((a, b) => a.t - b.t);
  return { ...clip, framings };
}

/** Remove o enquadramento no tempo `t`; colapsa para a base se sobrar só um. */
export function removeFraming(clip: Clip, t: number): Clip {
  if (!clip.framings) return clip;
  let framings = clip.framings.filter((f) => Math.abs(f.t - t) > 1e-6);
  framings.sort((a, b) => a.t - b.t);
  if (framings.length <= 1) {
    const keep = framings[0] ?? clip.framings[0];
    return {
      ...clip,
      framings: undefined,
      cropX: keep.cropX,
      cropY: keep.cropY,
      zoom: keep.zoom,
    };
  }
  // O primeiro enquadramento sempre ancora no início do clipe.
  framings[0] = { ...framings[0], t: clip.start };
  return { ...clip, framings };
}

/** Reancora os enquadramentos quando o início/fim do clipe muda (mantém dentro do intervalo). */
export function clampFramings(clip: Clip): Clip {
  if (!clip.framings || clip.framings.length === 0) return clip;
  let framings = clip.framings
    .map((f, i) => (i === 0 ? { ...f, t: clip.start } : f))
    .filter((f) => f.t >= clip.start && f.t < clip.end);
  framings.sort((a, b) => a.t - b.t);
  if (framings.length === 0) {
    return { ...clip, framings: undefined };
  }
  framings[0] = { ...framings[0], t: clip.start };
  if (framings.length === 1) {
    return {
      ...clip,
      framings: undefined,
      cropX: framings[0].cropX,
      cropY: framings[0].cropY,
      zoom: framings[0].zoom,
    };
  }
  return { ...clip, framings };
}

/** Segmentos de crop para renderização (>1 só quando há múltiplos enquadramentos em modo crop). */
export function getCropSegments(clip: Clip): CropSegment[] {
  if (clip.fill !== "crop") return [];
  const fr = clip.framings;
  if (!fr || fr.length <= 1) return [];
  const sorted = [...fr].sort((a, b) => a.t - b.t);
  const segs: CropSegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = i === 0 ? clip.start : Math.max(clip.start, sorted[i].t);
    const end =
      i < sorted.length - 1 ? Math.min(clip.end, sorted[i + 1].t) : clip.end;
    if (end - start > 0.05) {
      segs.push({
        start,
        end,
        cropX: sorted[i].cropX,
        cropY: sorted[i].cropY,
        zoom: sorted[i].zoom,
      });
    }
  }
  return segs;
}
