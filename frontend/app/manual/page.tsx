"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Uploader from "@/components/Uploader";
import ManualCanvas, { type Tool } from "@/components/ManualCanvas";
import type { Category, Point } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { AEON_CONFIG } from "@/lib/presets";
import { processImage } from "@/lib/api";
import { download, svgToPngBlob } from "@/lib/geometry";
import {
  CATEGORY_COLORS,
  DRAW_CATEGORIES,
  DEFAULT_STROKE,
  defaultFill,
  emitManualSvg,
  getStroke,
  loadProject,
  newProject,
  newShapeId,
  removeVert,
  saveProject,
  seedFromGeometry,
  shapeVerts,
  shellVertsOf,
  syncShapeFromVerts,
  SHELL_ID,
  type ManualProject,
  type ManualShape,
  type PolyVert,
  type ShapeKind,
} from "@/lib/manual";

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

function readImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ManualPage() {
  const [project, setProject] = useState<ManualProject | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawCat, setDrawCat] = useState<Category>("fnb");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVertIndex, setSelectedVertIndex] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [gridSize, setGridSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const importRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // restore last project on mount
  useEffect(() => {
    const p = loadProject();
    if (p) setProject(p);
  }, []);

  // debounced autosave on any project change
  useEffect(() => {
    if (!project) return;
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const res = saveProject(project);
      setSaved(res.ok ? "saved" : "idle");
      if (res.bgDropped) setError("Autosaved without background image (too large for browser storage). Re-upload it after refresh.");
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [project]);

  const setFloor = (floor: string) => setProject((p) => (p ? { ...p, floor } : newProject(floor)));

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    try {
      const bg = await readImage(f);
      setProject((p) => {
        const base = p ?? newProject("1F");
        return { ...base, bg: { ...bg, opacity: base.bg.opacity || 0.4 } };
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const seedFromAuto = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const geo = await processImage(file, AEON_CONFIG);
      const shapes = seedFromGeometry(geo);
      setProject((p) => (p ? { ...p, shapes: [...p.shapes, ...shapes] } : p));
    } catch (e) {
      setError("Seed failed (is the backend running?): " + String(e));
    } finally {
      setBusy(false);
    }
  }, [file]);

  // ---- shape ops ----
  const makeShape = useCallback(
    (kind: ShapeKind, points: Point[], verts?: PolyVert[]): ManualShape => ({
      id: newShapeId(),
      kind,
      points,
      verts,
      category: drawCat,
      fill: defaultFill(drawCat),
    }),
    [drawCat],
  );

  const addShape = useCallback((s: ManualShape) => {
    setProject((p) => (p ? { ...p, shapes: [...p.shapes, s] } : p));
    setSelectedId(s.id);
    setSelectedVertIndex(null);
    setTool("select");
  }, []);

  const updateShapeVerts = useCallback((id: string, verts: PolyVert[]) => {
    const synced = syncShapeFromVerts(verts);
    setProject((p) =>
      p
        ? {
            ...p,
            shapes: p.shapes.map((s) =>
              s.id === id ? { ...s, verts: synced.verts, points: synced.points } : s,
            ),
          }
        : p,
    );
  }, []);

  const patchShape = useCallback((id: string, patch: Partial<ManualShape>) => {
    setProject((p) => (p ? { ...p, shapes: p.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : p));
  }, []);

  const selectId = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedVertIndex(null);
  }, []);

  const deleteVert = useCallback(() => {
    if (!project || selectedId == null || selectedVertIndex == null) return;
    const verts =
      selectedId === SHELL_ID
        ? shellVertsOf(project)
        : (() => {
            const s = project.shapes.find((x) => x.id === selectedId);
            return s ? shapeVerts(s) : null;
          })();
    if (!verts) return;
    const next = removeVert(verts, selectedVertIndex);
    if (!next) {
      window.alert("Need at least 3 points");
      return;
    }
    if (selectedId === SHELL_ID) {
      const points = syncShapeFromVerts(next).points;
      setProject((p) => (p ? { ...p, shell: points, shellVerts: next } : p));
    } else {
      updateShapeVerts(selectedId, next);
    }
    setSelectedVertIndex(null);
  }, [project, selectedId, selectedVertIndex, updateShapeVerts]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedId === SHELL_ID) {
      if (!confirm("Delete outer outline? Units will no longer be clipped.")) return;
      setProject((p) => (p ? { ...p, shell: null, shellVerts: null } : p));
      setSelectedId(null);
      setSelectedVertIndex(null);
      return;
    }
    if (!confirm("Delete this shape?")) return;
    setProject((p) => (p ? { ...p, shapes: p.shapes.filter((s) => s.id !== selectedId) } : p));
    setSelectedId(null);
    setSelectedVertIndex(null);
  }, [selectedId]);

  const setShell = useCallback((verts: PolyVert[]) => {
    const points = syncShapeFromVerts(verts).points;
    setProject((p) => (p ? { ...p, shell: points, shellVerts: verts } : p));
    setTool("select");
  }, []);

  const clearShell = useCallback(() => {
    if (!confirm("Clear outer outline? Units will no longer be clipped.")) return;
    setProject((p) => (p ? { ...p, shell: null, shellVerts: null } : p));
    if (selectedId === SHELL_ID) {
      setSelectedId(null);
      setSelectedVertIndex(null);
    }
  }, [selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || selectedId === SHELL_ID) return;
    setProject((p) => {
      if (!p) return p;
      const src = p.shapes.find((s) => s.id === selectedId);
      if (!src) return p;
      const shift = (pt: Point): Point => [pt[0] + 16, pt[1] + 16];
      const copy: ManualShape = {
        ...src,
        id: newShapeId(),
        points: src.points.map(shift),
        verts: src.verts?.map((v) => ({
          p: shift(v.p),
          handleOut: v.handleOut ? shift(v.handleOut) : undefined,
        })),
      };
      setSelectedId(copy.id);
      setSelectedVertIndex(null);
      return { ...p, shapes: [...p.shapes, copy] };
    });
  }, [selectedId]);

  const setOpacity = (v: number) => setProject((p) => (p ? { ...p, bg: { ...p.bg, opacity: v } } : p));
  const stroke = getStroke(project);
  const setStrokeColor = (color: string) =>
    setProject((p) => (p ? { ...p, stroke: { ...getStroke(p), color } } : p));
  const setStrokeWidth = (width: number) =>
    setProject((p) => (p ? { ...p, stroke: { ...getStroke(p), width } } : p));

  // ---- export ----
  const doExportSvg = () => {
    if (!project) return;
    const { svg } = emitManualSvg(project);
    download(`petakin_${project.floor}.svg`, svg, "image/svg+xml");
  };
  const doExportPng = async () => {
    if (!project) return;
    const { svg, width, height } = emitManualSvg(project);
    const blob = await svgToPngBlob(svg, width, height, 2);
    download(`petakin_${project.floor}.png`, blob);
  };

  // ---- project file ----
  const exportProject = () => {
    if (!project) return;
    download(`petakin_manual_${project.floor}.json`, JSON.stringify(project, null, 2), "application/json");
  };
  const importProject = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as ManualProject;
        if (p.version !== 1 || !Array.isArray(p.shapes)) throw new Error("not a manual project");
        setProject(p);
        setSelectedId(null);
        setSelectedVertIndex(null);
      } catch (e) {
        setError("Invalid project file: " + String(e));
      }
    };
    reader.readAsText(f);
  };
  const doNew = () => {
    if (!confirm("Start a new project? Current shapes stay saved only if you exported them.")) return;
    setProject(newProject(project?.floor ?? "1F"));
    setSelectedId(null);
    setSelectedVertIndex(null);
    setFile(null);
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicateSelected();
        }
        return;
      }
      if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "r" || e.key === "R") setTool("rect");
      else if (e.key === "p" || e.key === "P") setTool("poly");
      else if (e.key === "o" || e.key === "O") setTool("outline");
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedVertIndex != null) deleteVert();
        else deleteSelected();
      } else if (e.key === "[") setProject((p) => (p ? { ...p, bg: { ...p.bg, opacity: Math.max(0.05, p.bg.opacity - 0.1) } } : p));
      else if (e.key === "]") setProject((p) => (p ? { ...p, bg: { ...p.bg, opacity: Math.min(1, p.bg.opacity + 0.1) } } : p));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, deleteVert, duplicateSelected, selectedVertIndex]);

  const selShape = useMemo(
    () =>
      selectedId && selectedId !== SHELL_ID && project
        ? project.shapes.find((s) => s.id === selectedId) ?? null
        : null,
    [selectedId, project],
  );
  const shellSelected = selectedId === SHELL_ID;
  const hasImage = !!project?.bg.dataUrl;
  const shellPts = project?.shell && project.shell.length >= 3 ? project.shell : null;

  const TOOLS: { key: Tool; label: string; hint: string }[] = [
    { key: "select", label: "Select", hint: "V" },
    { key: "outline", label: "Outline", hint: "O" },
    { key: "rect", label: "Rect", hint: "R" },
    { key: "poly", label: "Poly", hint: "P" },
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-ink">Petakin</span>
          <span className="text-xs text-neutral-400">Manual Mapping</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {busy && <span className="text-brand">Seeding…</span>}
          <span className="text-xs text-neutral-400">
            {saved === "saving" ? "Saving…" : saved === "saved" ? "Autosaved" : ""}
          </span>
          {error && <span className="max-w-md truncate text-red-600" title={error}>{error}</span>}
          <Link href="/" className="rounded bg-neutral-800 px-3 py-1 text-white hover:bg-neutral-700">
            Auto mode
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* LEFT — controls */}
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white">
          <Section title="Input">
            <Uploader floor={project?.floor ?? "1F"} onFloor={setFloor} onFile={onFile} fileName={file?.name} />
            <button
              onClick={seedFromAuto}
              disabled={!file || busy}
              className="mt-3 w-full rounded bg-neutral-200 px-2 py-1.5 text-sm disabled:opacity-40"
              title="Run the auto pipeline once and drop its units in as editable shapes"
            >
              Seed from auto
            </button>
          </Section>

          <Section title="Tools">
            <div className="mb-3 flex gap-1">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTool(t.key)}
                  className={`flex-1 rounded px-2 py-1.5 text-sm ${
                    tool === t.key ? "bg-brand text-white" : "bg-neutral-200 text-neutral-700"
                  }`}
                >
                  {t.label} <span className="opacity-60">{t.hint}</span>
                </button>
              ))}
            </div>
            <div className="mb-2 text-xs text-neutral-600">Draw as</div>
            <div className="mb-3 flex flex-wrap gap-1">
              {DRAW_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDrawCat(c)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                    drawCat === c ? "ring-2 ring-brand" : "ring-1 ring-neutral-300"
                  }`}
                >
                  <span className="h-3 w-3 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} className="accent-brand" />
              Snap
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-neutral-700">
              Grid
              <input
                type="number"
                min={1}
                max={100}
                value={gridSize}
                onChange={(e) => setGridSize(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded border border-neutral-300 px-1 py-0.5"
              />
              px
            </label>
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <div className="mb-2 text-xs font-medium text-neutral-600">Tenant stroke</div>
              <label className="mb-2 flex items-center justify-between text-xs text-neutral-700">
                Color
                <input
                  type="color"
                  value={stroke.color}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="h-6 w-10 rounded border border-neutral-300"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                Width
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={stroke.width}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-24 accent-brand"
                />
                <span className="w-6 font-mono">{stroke.width}</span>
                px
              </label>
              <button
                type="button"
                className="mt-1 text-[11px] text-neutral-500 hover:underline"
                onClick={() => {
                  setStrokeColor(DEFAULT_STROKE.color);
                  setStrokeWidth(DEFAULT_STROKE.width);
                }}
              >
                Reset to white / 2px
              </button>
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
              <div className="mb-1 font-medium text-neutral-600">Outer outline (shell)</div>
              <div className="mb-2 text-neutral-500">
                {shellPts ? `${shellPts.length} pts — clips overflowing units` : "Not set — use Outline tool"}
              </div>
              <div className="flex gap-2">
                {shellPts && (
                  <button
                    onClick={() => {
                      selectId(SHELL_ID);
                      setTool("select");
                    }}
                    className={`rounded px-2 py-1 text-xs ${shellSelected ? "bg-brand text-white" : "bg-neutral-200"}`}
                  >
                    Select shell
                  </button>
                )}
                <button
                  onClick={clearShell}
                  disabled={!shellPts}
                  className="rounded bg-neutral-200 px-2 py-1 text-xs disabled:opacity-40"
                >
                  Clear shell
                </button>
              </div>
            </div>
          </Section>

          {shellSelected && (
            <Section title="Shell">
              <p className="mb-2 text-xs text-neutral-600">
                Outer floor-plate outline. Units outside this boundary are clipped.
              </p>
              {selectedVertIndex != null && (
                <button
                  onClick={deleteVert}
                  className="mb-2 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white"
                >
                  Delete point ⌫
                </button>
              )}
              <button onClick={deleteSelected} className="w-full rounded bg-red-600 px-2 py-1 text-xs text-white">
                Delete shell ⌫
              </button>
            </Section>
          )}

          {selShape && (
            <Section title="Shape" right={<span className="text-xs text-neutral-400">{selShape.kind}</span>}>
              <div className="mb-2 text-xs text-neutral-600">Category</div>
              <div className="mb-3 flex flex-wrap gap-1">
                {DRAW_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => patchShape(selShape.id, { category: c, fill: defaultFill(c) })}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      selShape.category === c ? "ring-2 ring-brand" : "ring-1 ring-neutral-300"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
              <label className="mb-2 flex items-center justify-between text-xs">
                Fill override
                <input
                  type="color"
                  value={selShape.fill}
                  onChange={(e) => patchShape(selShape.id, { fill: e.target.value })}
                  className="h-6 w-10 rounded border border-neutral-300"
                />
              </label>
              <label className="mb-3 block text-xs">
                Name
                <input
                  value={selShape.name ?? ""}
                  onChange={(e) => patchShape(selShape.id, { name: e.target.value })}
                  placeholder="optional label"
                  className="mt-1 w-full rounded border border-neutral-300 px-1 py-1 text-xs"
                />
              </label>
              {selectedVertIndex != null && (
                <button
                  onClick={deleteVert}
                  className="mb-2 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white"
                >
                  Delete point ⌫
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={duplicateSelected} className="flex-1 rounded bg-neutral-200 px-2 py-1 text-xs">Duplicate ⌘D</button>
                <button onClick={deleteSelected} className="flex-1 rounded bg-red-600 px-2 py-1 text-xs text-white">Delete ⌫</button>
              </div>
            </Section>
          )}

          <Section title="Project">
            <div className="flex flex-wrap gap-2">
              <button onClick={doNew} className="rounded bg-neutral-200 px-2 py-1 text-sm">New</button>
              <button onClick={exportProject} disabled={!project} className="rounded bg-neutral-200 px-2 py-1 text-sm disabled:opacity-40">Export .json</button>
              <button onClick={() => importRef.current?.click()} className="rounded bg-neutral-200 px-2 py-1 text-sm">Import .json</button>
              <input ref={importRef} type="file" accept="application/json" className="hidden"
                onChange={(e) => e.target.files?.[0] && importProject(e.target.files[0])} />
            </div>
          </Section>

          <Section title="Export">
            <div className="flex gap-2">
              <button onClick={doExportSvg} disabled={!project || !project.shapes.length}
                className="flex-1 rounded bg-brand px-2 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-40">Export SVG</button>
              <button onClick={doExportPng} disabled={!project || !project.shapes.length}
                className="flex-1 rounded bg-brand-hover px-2 py-1.5 text-sm text-white disabled:opacity-40">Export PNG</button>
            </div>
            <div className="mt-2 text-xs text-neutral-400">{project?.shapes.length ?? 0} shapes</div>
          </Section>
        </aside>

        {/* RIGHT — editor */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-sm">
            <label className="flex items-center gap-1.5">
              Underlay
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={project?.bg.opacity ?? 0.4}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-28 accent-brand"
                disabled={!hasImage}
              />
            </label>
            <div className="flex-1" />
            <span className="text-xs text-neutral-500">
              {tool === "rect" && "Drag to draw a box"}
              {tool === "poly" &&
                "Click = corner · drag = curve · right-click edge = add point · Space = pan"}
              {tool === "outline" &&
                "Trace outer boundary · click/drag curves · Space = pan"}
              {tool === "select" &&
                "Alt-drag edge = curve · click point then ⌫ = delete point · right-click edge = add point"}
            </span>
          </div>

          <div className="relative min-h-0 flex-1">
            {hasImage && project ? (
              <ManualCanvas
                project={project}
                tool={tool}
                snap={snap}
                gridSize={gridSize}
                selectedId={selectedId}
                selectedVertIndex={selectedVertIndex}
                makeShape={makeShape}
                onSelect={selectId}
                onSelectVert={setSelectedVertIndex}
                onAddShape={addShape}
                onUpdateShapeVerts={updateShapeVerts}
                onSetShell={setShell}
                onRequestTool={setTool}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                Upload a denah to start drawing.
              </div>
            )}

            {busy && (
              <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/40 backdrop-blur-[2px]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
                <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm">Seeding from auto…</div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
