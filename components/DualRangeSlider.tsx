"use client";

/**
 * Slider de intervalo duplo (start/end) construído com dois inputs range
 * sobrepostos. Mantém min < max com um gap mínimo.
 */
export function DualRangeSlider({
  min,
  max,
  start,
  end,
  step = 0.05,
  onChange,
}: {
  min: number;
  max: number;
  start: number;
  end: number;
  step?: number;
  onChange: (start: number, end: number) => void;
}) {
  const range = max - min || 1;
  const gap = Math.min(0.2, range * 0.01);
  const startPct = ((start - min) / range) * 100;
  const endPct = ((end - min) / range) * 100;

  return (
    <div className="relative h-6 w-full select-none">
      {/* trilho */}
      <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-edge" />
      {/* faixa selecionada */}
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={start}
        onChange={(e) => {
          const v = Math.min(parseFloat(e.target.value), end - gap);
          onChange(v, end);
        }}
        className="dual-range pointer-events-none absolute inset-0 m-0 h-6 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
        aria-label="Início do clipe"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={end}
        onChange={(e) => {
          const v = Math.max(parseFloat(e.target.value), start + gap);
          onChange(start, v);
        }}
        className="dual-range pointer-events-none absolute inset-0 m-0 h-6 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
        aria-label="Fim do clipe"
      />
    </div>
  );
}
