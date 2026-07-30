"use client";
import type { Config, Swatch, Category } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { familyToCategory } from "@/lib/presets";

function familyOf(hex: string, config: Config): string | null {
  const e = config.paletteMap.find((p) => p.hex.toUpperCase() === hex.toUpperCase());
  return e ? e.family : null;
}

export default function SwatchList({
  swatches,
  config,
  onSetCategory,
  onSetOutput,
}: {
  swatches: Swatch[];
  config: Config;
  onSetCategory: (hex: string, category: Category) => void;
  onSetOutput: (family: string, color: string) => void;
}) {
  if (!swatches.length)
    return <div className="text-xs text-neutral-500">Upload an image to detect the palette.</div>;

  return (
    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {swatches.map((s) => {
        const fam = familyOf(s.hex, config);
        const cat: Category = fam ? familyToCategory(fam) : "ignore";
        const output = fam ? config.big[fam] ?? config.var[fam]?.[0] ?? "#cccccc" : "#cccccc";
        return (
          <div key={s.hex} className="flex items-center gap-2 rounded bg-neutral-50 p-1.5">
            <span
              className="h-6 w-6 shrink-0 rounded ring-1 ring-neutral-300"
              style={{ background: s.hex }}
              title={s.hex}
            />
            <span className="w-16 shrink-0 font-mono text-[10px] text-neutral-500">
              {s.hex}
              <br />
              {(s.share * 100).toFixed(1)}%
            </span>
            <select
              value={cat}
              onChange={(e) => onSetCategory(s.hex, e.target.value as Category)}
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-1 text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            {fam && cat !== "ignore" && (
              <input
                type="color"
                value={output}
                onChange={(e) => onSetOutput(fam, e.target.value)}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300"
                title={`output color for ${fam}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
