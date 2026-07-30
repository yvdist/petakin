"use client";
import type { Geometry } from "@/lib/types";
import { CATEGORY_LABEL, Category } from "@/lib/types";

export default function StatsPanel({ geometry }: { geometry: Geometry | null }) {
  if (!geometry) return null;
  const s = geometry.stats;
  const cats = Object.entries(s.perCategory).sort((a, b) => b[1] - a[1]);
  const cov = Math.round(s.coverage * 100);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-neutral-600">Units</span>
        <span className="font-mono font-semibold">{s.unitCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-neutral-600">Unit area / shell</span>
        <span className={`font-mono font-semibold ${cov < 45 ? "text-amber-600" : ""}`}>{cov}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-neutral-600">Process time</span>
        <span className="font-mono">{s.elapsed}s</span>
      </div>
      <div className="mt-2 space-y-1">
        {cats.map(([c, n]) => (
          <div key={c} className="flex justify-between">
            <span className="text-neutral-600">{CATEGORY_LABEL[c as Category] ?? c}</span>
            <span className="font-mono">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
