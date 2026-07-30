"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Uploader from "@/components/Uploader";
import SwatchList from "@/components/SwatchList";
import Sliders from "@/components/Sliders";
import HueEditor from "@/components/HueEditor";
import StatsPanel from "@/components/StatsPanel";
import SvgCanvas from "@/components/SvgCanvas";
import type { Category, Config, Geometry, Preset, Swatch } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { AEON_CONFIG, cloneConfig, deletePreset, loadPresets, savePreset } from "@/lib/presets";
import { detectPalette, exportSvg, processImage } from "@/lib/api";
import { deleteUnits, download, mergeUnits, recomputeStats, svgToPngBlob, updateUnit } from "@/lib/geometry";

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function applyCategory(config: Config, hex: string, category: Category): Config {
  const map = config.paletteMap.map((e) => ({ ...e }));
  const idx = map.findIndex((e) => e.hex.toUpperCase() === hex.toUpperCase());
  let family: string = category;
  if (category === "zone") {
    family = idx >= 0 && map[idx].family.startsWith("zone") ? map[idx].family : "zone_yellow";
  }
  if (idx >= 0) map[idx].family = family;
  else map.push({ hex, family });
  return { ...config, paletteMap: map };
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [floor, setFloor] = useState("1F");
  const [config, setConfig] = useState<Config>(() => cloneConfig(AEON_CONFIG));
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const [underlayOpacity, setUnderlayOpacity] = useState(0.5);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);

  useEffect(() => setPresets(loadPresets()), []);

  const runProcess = useCallback(async (f: File, cfg: Config) => {
    // cancel any in-flight run; only the latest generation may apply its result
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++genRef.current;
    setBusy(true);
    setError(null);
    try {
      const geo = await processImage(f, cfg, controller.signal);
      if (gen !== genRef.current) return; // a newer run superseded this one
      setGeometry(geo);
      setSelected(new Set());
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // superseded, not an error
      if (gen === genRef.current) setError(String(e));
    } finally {
      if (gen === genRef.current) setBusy(false); // only latest clears the spinner
    }
  }, []);

  const onFile = useCallback(
    async (f: File) => {
      setFile(f);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(f));
      try {
        const det = await detectPalette(f);
        setSwatches(det.swatches);
      } catch (e) {
        setError(String(e));
      }
      runProcess(f, config);
    },
    [config, imageUrl, runProcess],
  );

  // debounced reprocess whenever config changes (params / palette / colors)
  useEffect(() => {
    if (!file) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runProcess(file, config), 600);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const patchConfig = (fn: (c: Config) => Config) => setConfig((c) => fn(cloneConfig(c)));

  const onSetCategory = (hex: string, category: Category) => patchConfig((c) => applyCategory(c, hex, category));
  const onSetOutput = (family: string, color: string) => patchConfig((c) => ({ ...c, big: { ...c.big, [family]: color } }));
  const onChangeHue = (family: string, index: number, color: string) =>
    patchConfig((c) => {
      const arr = [...(c.var[family] ?? [])];
      arr[index] = color;
      return { ...c, var: { ...c.var, [family]: arr } };
    });
  const onChangeBig = (family: string, color: string) => patchConfig((c) => ({ ...c, big: { ...c.big, [family]: color } }));
  const onSlider = (key: keyof Config, value: number) => patchConfig((c) => ({ ...c, [key]: value }) as Config);

  // ---- selection editing (local, no reprocess) ----
  const onUnitClick = (id: string, additive: boolean) =>
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSel = () => setSelected(new Set());
  const doMerge = () => {
    if (!geometry) return;
    setGeometry(mergeUnits(geometry, selected));
    setSelected(new Set());
  };
  const doDelete = () => {
    if (!geometry) return;
    setGeometry(deleteUnits(geometry, selected));
    setSelected(new Set());
  };
  const recolorOne = (id: string, fill: string) => geometry && setGeometry(updateUnit(geometry, id, { fill }));
  const recatOne = (id: string, category: string) => geometry && setGeometry(recomputeStats(updateUnit(geometry, id, { category })));

  // ---- export ----
  const doExportSvg = async () => {
    if (!geometry) return;
    const svg = await exportSvg(floor, geometry, config, "Petakin");
    download(`petakin_${floor}.svg`, svg, "image/svg+xml");
  };
  const doExportPng = async () => {
    if (!geometry) return;
    const svg = await exportSvg(floor, geometry, config, "Petakin");
    const blob = await svgToPngBlob(svg, geometry.canvas.width, geometry.canvas.height, 2);
    download(`petakin_${floor}.png`, blob);
  };

  // ---- presets ----
  const doSavePreset = () => {
    const name = prompt("Preset name:", "My mall");
    if (!name) return;
    setPresets(savePreset({ name, config: cloneConfig(config) }));
  };
  const loadPresetByName = (name: string) => {
    const p = presets.find((x) => x.name === name);
    if (p) setConfig(cloneConfig(p.config));
  };
  const exportPresetFile = () =>
    download(`petakin_preset_${floor}.json`, JSON.stringify({ name: `Preset ${floor}`, config }, null, 2), "application/json");
  const importPresetFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as Preset;
        setConfig(cloneConfig(p.config));
        setPresets(savePreset(p));
      } catch (e) {
        setError("Invalid preset file: " + e);
      }
    };
    reader.readAsText(f);
  };

  const selId = selected.size === 1 ? [...selected][0] : null;
  const selUnit = selId ? geometry?.units.find((u) => u.id === selId) : null;
  const hoveredUnit = hovered ? geometry?.units.find((u) => u.id === hovered) : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-ink">Petakin</span>
          <span className="text-xs text-neutral-400">Floor Plan → Flat SVG</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {busy && <span className="text-brand">Processing…</span>}
          {error && <span className="max-w-md truncate text-red-600" title={error}>{error}</span>}
          <Link href="/manual" className="rounded bg-brand px-3 py-1 text-white hover:bg-brand-hover">
            Manual mode
          </Link>
          <Link href="/batch" className="rounded bg-neutral-800 px-3 py-1 text-white hover:bg-neutral-700">
            Batch mode
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* LEFT — controls */}
        <aside className="w-96 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white">
          <Section title="Input">
            <Uploader floor={floor} onFloor={setFloor} onFile={onFile} fileName={file?.name} />
          </Section>

          <Section title="Palette → Category">
            <SwatchList swatches={swatches} config={config} onSetCategory={onSetCategory} onSetOutput={onSetOutput} />
          </Section>

          <Section title="Parameters">
            <label className="mb-3 flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={config.rectangularize}
                onChange={(e) =>
                  patchConfig((c) => ({ ...c, rectangularize: e.target.checked }))
                }
                className="accent-brand"
              />
              Rectangularize tenant boxes (crisp rectangles)
            </label>
            <Sliders config={config} onChange={onSlider} />
            <div className="mt-3">
              <HueEditor config={config} onChangeHue={onChangeHue} onChangeBig={onChangeBig} />
            </div>
          </Section>

          <Section title="Presets">
            <div className="flex flex-wrap gap-2">
              <select
                onChange={(e) => e.target.value && loadPresetByName(e.target.value)}
                className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                defaultValue=""
              >
                <option value="">Load preset…</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              <button onClick={doSavePreset} className="rounded bg-neutral-200 px-2 py-1 text-sm">Save</button>
              <button onClick={exportPresetFile} className="rounded bg-neutral-200 px-2 py-1 text-sm">Export</button>
              <button onClick={() => importRef.current?.click()} className="rounded bg-neutral-200 px-2 py-1 text-sm">Import</button>
              <input ref={importRef} type="file" accept="application/json" className="hidden"
                onChange={(e) => e.target.files?.[0] && importPresetFile(e.target.files[0])} />
              {presets.length > 1 && (
                <button
                  onClick={() => { const n = prompt("Delete preset name:"); if (n) setPresets(deletePreset(n)); }}
                  className="rounded bg-neutral-200 px-2 py-1 text-sm text-red-600"
                >Delete</button>
              )}
            </div>
          </Section>

          <Section title="Export">
            <div className="flex gap-2">
              <button onClick={() => file && runProcess(file, config)} disabled={!file}
                className="flex-1 rounded bg-neutral-200 px-2 py-1.5 text-sm disabled:opacity-40">Reprocess</button>
              <button onClick={doExportSvg} disabled={!geometry}
                className="flex-1 rounded bg-brand px-2 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-40">Export SVG</button>
              <button onClick={doExportPng} disabled={!geometry}
                className="flex-1 rounded bg-brand-hover px-2 py-1.5 text-sm text-white disabled:opacity-40">Export PNG</button>
            </div>
          </Section>

          <Section title="Statistics">
            <StatsPanel geometry={geometry} />
          </Section>
        </aside>

        {/* RIGHT — preview / editor */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showUnderlay} onChange={(e) => setShowUnderlay(e.target.checked)} />
              Underlay
            </label>
            {showUnderlay && (
              <input type="range" min={0.1} max={1} step={0.05} value={underlayOpacity}
                onChange={(e) => setUnderlayOpacity(Number(e.target.value))} className="w-24 accent-brand" />
            )}
            <div className="flex-1" />
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">{selected.size} selected</span>
                {selected.size >= 2 && (
                  <button onClick={doMerge} className="rounded bg-emerald-600 px-2 py-1 text-white">Merge</button>
                )}
                <button onClick={doDelete} className="rounded bg-red-600 px-2 py-1 text-white">Delete</button>
                <button onClick={clearSel} className="rounded bg-neutral-200 px-2 py-1">Clear</button>
              </div>
            )}
            {hoveredUnit && (
              <span className="text-xs text-neutral-500">
                {hoveredUnit.id} · {CATEGORY_LABEL[hoveredUnit.category as Category] ?? hoveredUnit.category} · {hoveredUnit.area}px
              </span>
            )}
          </div>

          {selUnit && (
            <div className="absolute left-4 top-14 z-20 w-56 rounded-lg bg-white p-3 shadow-lg ring-1 ring-neutral-200">
              <div className="mb-2 text-xs font-semibold text-neutral-700">{selUnit.id}</div>
              <label className="mb-2 flex items-center justify-between text-xs">
                Fill
                <input type="color" value={selUnit.fill} onChange={(e) => recolorOne(selUnit.id, e.target.value)}
                  className="h-6 w-10 rounded border border-neutral-300" />
              </label>
              <label className="mb-2 block text-xs">
                Category
                <select value={selUnit.category} onChange={(e) => recatOne(selUnit.id, e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 px-1 py-1 text-xs">
                  {CATEGORIES.filter((c) => c !== "ignore").map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </label>
              <button onClick={doDelete} className="w-full rounded bg-red-600 px-2 py-1 text-xs text-white">Delete unit</button>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            {geometry ? (
              <SvgCanvas
                geometry={geometry}
                config={config}
                floor={floor}
                underlayUrl={imageUrl}
                showUnderlay={showUnderlay}
                underlayOpacity={underlayOpacity}
                selected={selected}
                hovered={hovered}
                onHover={setHovered}
                onUnitClick={onUnitClick}
                onBackgroundClick={clearSel}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                {busy ? "Processing…" : "Upload a floor plan to begin."}
              </div>
            )}

            {/* reprocess overlay — stale SVG stays visible (dimmed) underneath */}
            {busy && geometry && (
              <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/40 backdrop-blur-[2px]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
                <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm">
                  Processing… (high quality)
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
