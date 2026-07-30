"use client";
import type { Config } from "@/lib/types";

interface Row {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}

const ROWS: Row[] = [
  { key: "inputUpscale", label: "Input upscale (quality, slower)", min: 1, max: 4, step: 1 },
  { key: "rectFillThresh", label: "Rectangularize fill", min: 0.5, max: 0.95, step: 0.02 },
  { key: "colorTolerance", label: "Color tolerance", min: 8, max: 30, step: 1 },
  { key: "minUnitArea", label: "Min unit area (px)", min: 20, max: 2000, step: 10 },
  { key: "simplify", label: "Simplify (epsilon)", min: 0.5, max: 4, step: 0.1 },
  { key: "smoothKernel", label: "Edge smoothing", min: 0, max: 12, step: 1 },
  { key: "upscale", label: "Supersample", min: 1, max: 4, step: 1 },
  { key: "openKernel", label: "Despeckle", min: 0, max: 6, step: 1 },
  { key: "familyMinPixels", label: "Family min px", min: 50, max: 500, step: 10 },
  { key: "strokeWidth", label: "Stroke width", min: 2, max: 12, step: 0.5 },
  { key: "normalizedWidth", label: "Normalized width", min: 800, max: 2400, step: 50 },
];

export default function Sliders({
  config,
  onChange,
}: {
  config: Config;
  onChange: (key: keyof Config, value: number) => void;
}) {
  return (
    <div className="space-y-3">
      {ROWS.map((r) => (
        <label key={r.key} className="block">
          <div className="mb-1 flex justify-between text-xs text-neutral-600">
            <span>{r.label}</span>
            <span className="font-mono text-neutral-900">{config[r.key] as number}</span>
          </div>
          <input
            type="range"
            min={r.min}
            max={r.max}
            step={r.step}
            value={config[r.key] as number}
            onChange={(e) => onChange(r.key, Number(e.target.value))}
            className="w-full accent-pink-600"
          />
        </label>
      ))}
    </div>
  );
}
