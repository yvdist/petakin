"use client";
import { useState } from "react";
import type { Config } from "@/lib/types";

export default function HueEditor({
  config,
  onChangeHue,
  onChangeBig,
}: {
  config: Config;
  onChangeHue: (family: string, index: number, color: string) => void;
  onChangeBig: (family: string, color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const families = Object.keys(config.var);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 text-xs font-medium text-brand hover:underline"
      >
        {open ? "▾ Hide hue lists" : "▸ Edit hue lists"}
      </button>
      {open && (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {families.map((fam) => (
            <div key={fam}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-600">
                <span className="font-mono">{fam}</span>
                {config.big[fam] && (
                  <label className="flex items-center gap-1">
                    <span>flat</span>
                    <input
                      type="color"
                      value={config.big[fam]}
                      onChange={(e) => onChangeBig(fam, e.target.value)}
                      className="h-5 w-5 rounded border border-neutral-300"
                    />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {config.var[fam].map((c, i) => (
                  <input
                    key={i}
                    type="color"
                    value={c}
                    onChange={(e) => onChangeHue(fam, i, e.target.value)}
                    className="h-5 w-5 rounded border border-neutral-300"
                    title={c}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
