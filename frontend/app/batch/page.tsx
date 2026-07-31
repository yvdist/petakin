"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import type { Config, Preset } from "@/lib/types";
import { AEON_CONFIG, cloneConfig, loadPresets } from "@/lib/presets";
import { exportSvg, processImage } from "@/lib/api";
import { download, svgToPngBlob } from "@/lib/geometry";

const KNOWN = ["B", "GF", "1F", "2F", "RF"];

function guessFloor(name: string, i: number): string {
  const up = name.toUpperCase();
  for (const f of KNOWN) if (up.includes(f)) return f;
  return `F${i + 1}`;
}

interface Item {
  file: File;
  floor: string;
  status: "pending" | "processing" | "done" | "error";
  units?: number;
  msg?: string;
}

export default function BatchPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("AEON Tebrau City");
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPresets(loadPresets()), []);
  const config: Config = presets.find((p) => p.name === presetName)?.config ?? AEON_CONFIG;

  const addFiles = (files: FileList) => {
    const next = Array.from(files).map((file, i) => ({
      file,
      floor: guessFloor(file.name, i),
      status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const setFloor = (idx: number, floor: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, floor } : it)));

  const run = async () => {
    setRunning(true);
    const zip = new JSZip();
    const cfg = cloneConfig(config);
    const snapshot = [...items];
    for (let i = 0; i < snapshot.length; i++) {
      setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: "processing" } : it)));
      try {
        const geo = await processImage(snapshot[i].file, cfg);
        const svg = await exportSvg(snapshot[i].floor, geo, cfg, "Petakin");
        const png = await svgToPngBlob(svg, geo.canvas.width, geo.canvas.height, 2);
        zip.file(`${snapshot[i].floor}.svg`, svg);
        zip.file(`${snapshot[i].floor}.png`, png);
        setItems((prev) =>
          prev.map((it, j) => (j === i ? { ...it, status: "done", units: geo.stats.unitCount } : it)),
        );
      } catch (e) {
        setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: "error", msg: String(e) } : it)));
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    download("petakin_batch.zip", blob);
    setRunning(false);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Petakin — Batch mode</h1>
        <Link href="/manual" className="rounded bg-neutral-800 px-3 py-1 text-sm text-white">← Editor</Link>
      </div>

      <p className="mb-4 text-sm text-neutral-600">
        Upload all floors, pick one preset, process with identical params, download a ZIP of SVG + PNG per floor.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <select value={presetName} onChange={(e) => setPresetName(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
          {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <button onClick={() => inputRef.current?.click()}
          className="rounded bg-neutral-200 px-3 py-1.5 text-sm">Add floors…</button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <div className="flex-1" />
        <button onClick={run} disabled={!items.length || running}
          className="rounded bg-brand px-4 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-40">
          {running ? "Processing…" : "Process & download ZIP"}
        </button>
      </div>

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {items.length === 0 && <div className="p-4 text-sm text-neutral-400">No files yet.</div>}
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 p-3 text-sm">
            <span className="w-40 truncate text-neutral-600">{it.file.name}</span>
            <input value={it.floor} onChange={(e) => setFloor(i, e.target.value)}
              className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm" />
            <div className="flex-1" />
            <span className={
              it.status === "done" ? "text-emerald-600" :
              it.status === "error" ? "text-red-600" :
              it.status === "processing" ? "text-brand" : "text-neutral-400"
            }>
              {it.status === "done" ? `${it.units} units` : it.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
