"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Uploader from "@/components/Uploader";
import LayersPanel from "@/components/LayersPanel";
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
  activeProject,
  assignShapeToActiveLayer,
  createLayer,
  defaultFill,
  deleteLayerNodes,
  emitManualSvg,
  getDrawOpacity,
  getLayerTree,
  getStroke,
  groupSelection,
  isManualProject,
  isManualWorkspace,
  loadWorkspace,
  makeTab,
  moveLayer,
  moveShape,
  newProject,
  newShapeId,
  newWorkspace,
  patchGroup,
  patchLayer,
  removeShapeFromLayers,
  removeVert,
  reorderUngrouped,
  saveWorkspace,
  seedFromGeometry,
  setActiveLayer,
  setAllCollapsed,
  setRootOrder,
  shapeVerts,
  shellVertsOf,
  suggestNextFloor,
  syncShapeFromVerts,
  ungroupedShapeIds,
  SHELL_ID,
  type LayerMoveTarget,
  type ManualProject,
  type ManualShape,
  type ManualWorkspace,
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

function ToolIcon({ name }: { name: Tool }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "select":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 4l7 16 2.5-6.5L20 11z" />
        </svg>
      );
    case "outline":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 8h16M4 16h16M8 4v16M16 4v16" opacity={0.35} />
          <rect x="5" y="5" width="14" height="14" rx="1" />
        </svg>
      );
    case "rect":
      return (
        <svg {...common} aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="1" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common} aria-hidden>
          <ellipse cx="12" cy="12" rx="9" ry="6" />
        </svg>
      );
    case "poly":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 3l8 6.5-3 9.5H7L4 9.5z" />
        </svg>
      );
  }
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
  const [workspace, setWorkspace] = useState<ManualWorkspace | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawCat, setDrawCat] = useState<Category>("fnb");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVertIndex, setSelectedVertIndex] = useState<number | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [layersOpen, setLayersOpen] = useState(true);
  const [snap, setSnap] = useState(true);
  const [gridSize, setGridSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const importRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);

  const project = useMemo(() => activeProject(workspace), [workspace]);
  const activeTabTitle = useMemo(() => {
    if (!workspace) return "";
    return workspace.tabs.find((t) => t.id === workspace.activeTabId)?.title ?? "";
  }, [workspace]);

  const updateActive = useCallback((fn: (p: ManualProject) => ManualProject) => {
    setWorkspace((ws) => {
      if (!ws) return ws;
      return {
        ...ws,
        tabs: ws.tabs.map((t) => {
          if (t.id !== ws.activeTabId) return t;
          const next = fn(t.project);
          const title =
            t.title === t.project.floor || t.title === next.floor ? next.floor : t.title;
          return { ...t, project: next, title };
        }),
      };
    });
  }, []);

  // restore workspace on mount (or start with one empty tab)
  useEffect(() => {
    const ws = loadWorkspace();
    setWorkspace(ws ?? newWorkspace("1F"));
  }, []);

  // debounced autosave
  useEffect(() => {
    if (!workspace) return;
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const res = saveWorkspace(workspace);
      setSaved(res.ok ? "saved" : "idle");
      if (res.bgDropped) {
        setError("Autosaved without background image(s) (too large for browser storage). Re-upload after refresh.");
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [workspace]);

  const resetTabLocalUi = useCallback(() => {
    setSelectedId(null);
    setSelectedVertIndex(null);
    setSelectedLayerIds([]);
    setSelectedShapeIds([]);
    setFile(null);
    setTool("select");
    if (editorHostRef.current) editorHostRef.current.scrollTop = 0;
  }, []);

  const switchTab = useCallback(
    (id: string) => {
      setWorkspace((ws) => (ws ? { ...ws, activeTabId: id } : ws));
      resetTabLocalUi();
    },
    [resetTabLocalUi],
  );

  const addTab = useCallback(() => {
    setWorkspace((ws) => {
      const base = ws ?? newWorkspace("1F");
      const floor = suggestNextFloor(base);
      const tab = makeTab(newProject(floor));
      return {
        ...base,
        tabs: [...base.tabs, tab],
        activeTabId: tab.id,
      };
    });
    resetTabLocalUi();
  }, [resetTabLocalUi]);

  const closeTab = useCallback(
    (id: string) => {
      setWorkspace((ws) => {
        if (!ws) return ws;
        const tab = ws.tabs.find((t) => t.id === id);
        if (!tab) return ws;
        if (tab.project.shapes.length > 0 || tab.project.shell) {
          if (!confirm(`Close tab “${tab.title}”? Unsaved export will be lost from this tab.`)) return ws;
        }
        if (ws.tabs.length <= 1) {
          const fresh = makeTab(newProject(tab.project.floor || "1F"));
          return { ...ws, tabs: [fresh], activeTabId: fresh.id };
        }
        const tabs = ws.tabs.filter((t) => t.id !== id);
        const activeTabId =
          ws.activeTabId === id
            ? tabs[Math.max(0, ws.tabs.findIndex((t) => t.id === id) - 1)]?.id ?? tabs[0].id
            : ws.activeTabId;
        return { ...ws, tabs, activeTabId };
      });
      resetTabLocalUi();
    },
    [resetTabLocalUi],
  );

  const renameTab = useCallback((id: string) => {
    setWorkspace((ws) => {
      if (!ws) return ws;
      const tab = ws.tabs.find((t) => t.id === id);
      if (!tab) return ws;
      const next = window.prompt("Tab name", tab.title);
      if (next == null || !next.trim()) return ws;
      return {
        ...ws,
        tabs: ws.tabs.map((t) => (t.id === id ? { ...t, title: next.trim() } : t)),
      };
    });
  }, []);

  const setFloor = (floor: string) => {
    if (!workspace) {
      setWorkspace(newWorkspace(floor));
      return;
    }
    updateActive((p) => ({ ...p, floor }));
  };

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    try {
      const bg = await readImage(f);
      setWorkspace((ws) => {
        if (!ws) {
          const p = { ...newProject("1F"), bg: { ...bg, opacity: 0.4 } };
          const tab = makeTab(p);
          return { version: 2, tabs: [tab], activeTabId: tab.id, updatedAt: Date.now() };
        }
        return {
          ...ws,
          tabs: ws.tabs.map((t) =>
            t.id === ws.activeTabId
              ? {
                  ...t,
                  project: {
                    ...t.project,
                    bg: { ...bg, opacity: t.project.bg.opacity || 0.4 },
                  },
                }
              : t,
          ),
        };
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
      updateActive((p) => {
        let next = { ...p, shapes: [...p.shapes, ...shapes] };
        for (const s of shapes) next = assignShapeToActiveLayer(next, s.id);
        return next;
      });
    } catch (e) {
      setError("Seed failed (is the backend running?): " + String(e));
    } finally {
      setBusy(false);
    }
  }, [file, updateActive]);

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

  const addShape = useCallback(
    (s: ManualShape) => {
      updateActive((p) => assignShapeToActiveLayer({ ...p, shapes: [...p.shapes, s] }, s.id));
      setSelectedId(s.id);
      setSelectedShapeIds([s.id]);
      setSelectedVertIndex(null);
      setTool("select");
    },
    [updateActive],
  );

  const updateShapeVerts = useCallback(
    (id: string, verts: PolyVert[]) => {
      const synced = syncShapeFromVerts(verts);
      updateActive((p) => ({
        ...p,
        shapes: p.shapes.map((s) =>
          s.id === id ? { ...s, verts: synced.verts, points: synced.points } : s,
        ),
      }));
    },
    [updateActive],
  );

  const patchShape = useCallback(
    (id: string, patch: Partial<ManualShape>) => {
      updateActive((p) => ({
        ...p,
        shapes: p.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [updateActive],
  );

  const selectId = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedVertIndex(null);
    if (id && id !== SHELL_ID) setSelectedShapeIds([id]);
    else setSelectedShapeIds([]);
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
      updateActive((p) => ({ ...p, shell: points, shellVerts: next }));
    } else {
      updateShapeVerts(selectedId, next);
    }
    setSelectedVertIndex(null);
  }, [project, selectedId, selectedVertIndex, updateActive, updateShapeVerts]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedId === SHELL_ID) {
      if (!confirm("Delete outer outline? Units will no longer be clipped.")) return;
      updateActive((p) => ({ ...p, shell: null, shellVerts: null }));
      setSelectedId(null);
      setSelectedVertIndex(null);
      return;
    }
    if (!confirm("Delete this shape?")) return;
    updateActive((p) =>
      removeShapeFromLayers(
        { ...p, shapes: p.shapes.filter((s) => s.id !== selectedId) },
        selectedId,
      ),
    );
    setSelectedId(null);
    setSelectedShapeIds([]);
    setSelectedVertIndex(null);
  }, [selectedId, updateActive]);

  const setShell = useCallback(
    (verts: PolyVert[]) => {
      const points = syncShapeFromVerts(verts).points;
      updateActive((p) => ({ ...p, shell: points, shellVerts: verts }));
      setTool("select");
    },
    [updateActive],
  );

  const clearShell = useCallback(() => {
    if (!confirm("Clear outer outline? Units will no longer be clipped.")) return;
    updateActive((p) => ({ ...p, shell: null, shellVerts: null }));
    if (selectedId === SHELL_ID) {
      setSelectedId(null);
      setSelectedVertIndex(null);
    }
  }, [selectedId, updateActive]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || selectedId === SHELL_ID) return;
    updateActive((p) => {
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
  }, [selectedId, updateActive]);

  const setOpacity = (v: number) => updateActive((p) => ({ ...p, bg: { ...p.bg, opacity: v } }));
  const setDrawOpacity = (v: number) => updateActive((p) => ({ ...p, drawOpacity: v }));
  const stroke = getStroke(project);
  const setStrokeColor = (color: string) =>
    updateActive((p) => ({ ...p, stroke: { ...getStroke(p), color } }));
  const setStrokeWidth = (width: number) =>
    updateActive((p) => ({ ...p, stroke: { ...getStroke(p), width } }));

  // ---- layers ----
  // Display order (front → back) for Shift+click range selection
  const panelRows = useMemo(() => {
    if (!project) return [] as string[];
    const tree = getLayerTree(project);
    const rows: string[] = [];
    for (const id of [...tree.rootOrder].reverse()) {
      rows.push(id);
      const g = tree.groups.find((x) => x.id === id);
      if (g && !g.collapsed) rows.push(...[...g.childIds].reverse());
    }
    for (const l of tree.layers) {
      if (!tree.rootOrder.includes(l.id) && !tree.groups.some((g) => g.childIds.includes(l.id))) {
        rows.push(l.id);
      }
    }
    return rows;
  }, [project]);

  const onSelectLayerRow = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (!project) return;
      const rows = panelRows;
      if (e.metaKey || e.ctrlKey) {
        setSelectedLayerIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
        return;
      }
      if (e.shiftKey && selectedLayerIds.length > 0) {
        const last = selectedLayerIds[selectedLayerIds.length - 1];
        const a = rows.indexOf(last);
        const b = rows.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedLayerIds(rows.slice(lo, hi + 1));
          return;
        }
      }
      setSelectedLayerIds([id]);
      setSelectedShapeIds([]);
    },
    [panelRows, project, selectedLayerIds],
  );

  const onSelectShapeRow = useCallback((id: string, e: React.MouseEvent) => {
    if (!project) return;
    const ungrouped = ungroupedShapeIds(project);
    if (e.metaKey || e.ctrlKey) {
      setSelectedShapeIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      setSelectedId(id);
      return;
    }
    if (e.shiftKey && selectedShapeIds.length > 0) {
      const list = ungrouped.length ? ungrouped : project.shapes.map((s) => s.id);
      const last = selectedShapeIds[selectedShapeIds.length - 1];
      const a = list.indexOf(last);
      const b = list.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedShapeIds(list.slice(lo, hi + 1));
        setSelectedId(id);
        return;
      }
    }
    setSelectedShapeIds([id]);
    setSelectedId(id);
    setSelectedLayerIds([]);
    setSelectedVertIndex(null);
  }, [project, selectedShapeIds]);

  const doNewLayer = () => updateActive((p) => createLayer(p));
  const doGroup = () => {
    if (!project) return;
    const ungroupedSel = selectedShapeIds.filter((id) => ungroupedShapeIds(project).includes(id));
    const layerIds = selectedLayerIds.filter((id) =>
      getLayerTree(project).layers.some((l) => l.id === id),
    );
    updateActive((p) => groupSelection(p, layerIds, ungroupedSel));
    setSelectedLayerIds([]);
    setSelectedShapeIds([]);
  };
  const doDeleteLayerNodes = () => {
    if (!selectedLayerIds.length) return;
    if (!confirm("Remove selected layers/groups? Shapes stay as ungrouped.")) return;
    updateActive((p) => deleteLayerNodes(p, selectedLayerIds));
    setSelectedLayerIds([]);
  };

  const onReorderRoot = useCallback(
    (displayOrder: string[]) => {
      updateActive((p) => setRootOrder(p, [...displayOrder].reverse()));
    },
    [updateActive],
  );
  const onMoveLayerCb = useCallback(
    (layerId: string, target: LayerMoveTarget, indexModel: number) => {
      updateActive((p) => moveLayer(p, layerId, target, indexModel));
    },
    [updateActive],
  );
  const onMoveShapeCb = useCallback(
    (shapeId: string, targetLayerId: string | null, indexModel: number) => {
      updateActive((p) => moveShape(p, shapeId, targetLayerId, indexModel));
    },
    [updateActive],
  );
  const onReorderUngroupedCb = useCallback(
    (displayOrder: string[]) => {
      updateActive((p) => reorderUngrouped(p, [...displayOrder].reverse()));
    },
    [updateActive],
  );
  const onToggleLayerCollapsed = useCallback(
    (id: string) => {
      updateActive((p) => {
        const l = getLayerTree(p).layers.find((x) => x.id === id);
        if (!l) return p;
        return patchLayer(p, id, { collapsed: !l.collapsed });
      });
    },
    [updateActive],
  );
  const onCollapseAll = useCallback(
    (collapsed: boolean) => {
      updateActive((p) => setAllCollapsed(p, collapsed));
    },
    [updateActive],
  );

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

  // ---- project / workspace file ----
  const exportProject = () => {
    if (!project) return;
    download(`petakin_manual_${project.floor}.json`, JSON.stringify(project, null, 2), "application/json");
  };
  const exportAllTabs = () => {
    if (!workspace) return;
    download("petakin_manual_workspace.json", JSON.stringify(workspace, null, 2), "application/json");
  };

  const importJson = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (isManualWorkspace(data)) {
          if (
            !confirm(
              `Import ${data.tabs.length} tab(s) and add them to the current workspace?`,
            )
          ) {
            return;
          }
          setWorkspace((ws) => {
            const base = ws ?? newWorkspace("1F");
            const imported = data.tabs.map((t) =>
              makeTab(t.project, t.title || t.project.floor),
            );
            const tabs = [...base.tabs, ...imported];
            return {
              ...base,
              tabs,
              activeTabId: imported[imported.length - 1]?.id ?? base.activeTabId,
            };
          });
          setSelectedId(null);
          setSelectedVertIndex(null);
          setFile(null);
          return;
        }
        if (isManualProject(data)) {
          setWorkspace((ws) => {
            const base = ws ?? newWorkspace(data.floor || "1F");
            const tab = makeTab(data);
            return {
              ...base,
              tabs: [...base.tabs, tab],
              activeTabId: tab.id,
            };
          });
          setSelectedId(null);
          setSelectedVertIndex(null);
          setFile(null);
          return;
        }
        throw new Error("not a manual project or workspace");
      } catch (e) {
        setError("Invalid file: " + String(e));
      }
    };
    reader.readAsText(f);
  };

  const doNew = () => {
    if (!confirm("Reset the active tab to a blank project? Other tabs are kept.")) return;
    updateActive(() => newProject(project?.floor ?? "1F"));
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
      else if (e.key === "e" || e.key === "E") setTool("ellipse");
      else if (e.key === "p" || e.key === "P") setTool("poly");
      else if (e.key === "o" || e.key === "O") setTool("outline");
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedVertIndex != null) deleteVert();
        else deleteSelected();
      } else if (e.key === "[") {
        updateActive((p) => ({
          ...p,
          bg: { ...p.bg, opacity: Math.max(0.05, p.bg.opacity - 0.1) },
        }));
      } else if (e.key === "]") {
        updateActive((p) => ({
          ...p,
          bg: { ...p.bg, opacity: Math.min(1, p.bg.opacity + 0.1) },
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, deleteVert, duplicateSelected, selectedVertIndex, updateActive]);

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
    { key: "ellipse", label: "Ellipse", hint: "E" },
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
          <Link href="/auto" className="rounded bg-neutral-800 px-3 py-1 text-white hover:bg-neutral-700">
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
            <div className="mb-3 grid grid-cols-3 gap-1">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTool(t.key)}
                  className={`flex flex-col items-center gap-0.5 rounded px-1.5 py-1.5 text-[11px] leading-tight ${
                    tool === t.key ? "bg-brand text-white" : "bg-neutral-200 text-neutral-700"
                  }`}
                  title={`${t.label} (${t.hint})`}
                >
                  <ToolIcon name={t.key} />
                  <span>
                    {t.label} <span className="opacity-60">{t.hint}</span>
                  </span>
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
              <button onClick={doNew} className="rounded bg-neutral-200 px-2 py-1 text-sm">New tab content</button>
              <button onClick={exportProject} disabled={!project} className="rounded bg-neutral-200 px-2 py-1 text-sm disabled:opacity-40">
                Export tab
              </button>
              <button onClick={exportAllTabs} disabled={!workspace} className="rounded bg-neutral-200 px-2 py-1 text-sm disabled:opacity-40">
                Export all tabs
              </button>
              <button onClick={() => importRef.current?.click()} className="rounded bg-neutral-200 px-2 py-1 text-sm">
                Import
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              Import accepts a single floor JSON or a full workspace (adds as new tabs).
            </p>
          </Section>

          <Section title="Export">
            <div className="flex gap-2">
              <button onClick={doExportSvg} disabled={!project || !project.shapes.length}
                className="flex-1 rounded bg-brand px-2 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-40">Export SVG</button>
              <button onClick={doExportPng} disabled={!project || !project.shapes.length}
                className="flex-1 rounded bg-brand-hover px-2 py-1.5 text-sm text-white disabled:opacity-40">Export PNG</button>
            </div>
            <div className="mt-2 text-xs text-neutral-400">{project?.shapes.length ?? 0} shapes · {workspace?.tabs.length ?? 0} tabs</div>
          </Section>
        </aside>

        {/* RIGHT — editor */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-stretch gap-0.5 overflow-x-auto border-b border-neutral-200 bg-neutral-100 px-1 pt-1">
            {(workspace?.tabs ?? []).map((t) => {
              const active = t.id === workspace?.activeTabId;
              return (
                <div
                  key={t.id}
                  className={`group flex max-w-[10rem] items-center gap-1 rounded-t px-2 py-1.5 text-xs ${
                    active
                      ? "bg-white text-ink shadow-sm ring-1 ring-neutral-200 ring-b-white"
                      : "bg-transparent text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    onClick={() => switchTab(t.id)}
                    onDoubleClick={() => renameTab(t.id)}
                    title={`${t.title} (double-click to rename)`}
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    className="rounded px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    aria-label={`Close ${t.title}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addTab}
              className="mb-0.5 ml-0.5 rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-200"
              title="New tab"
            >
              +
            </button>
          </div>

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
            <label className="flex items-center gap-1.5">
              Draw
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={getDrawOpacity(project)}
                onChange={(e) => setDrawOpacity(Number(e.target.value))}
                className="w-28 accent-brand"
                disabled={!project}
              />
            </label>
            <div className="flex-1" />
            <span className="text-xs text-neutral-500">
              {tool === "rect" && "Drag to draw a box · Shift = square"}
              {tool === "ellipse" && "Drag to draw oval · Shift = circle"}
              {tool === "poly" &&
                "Click = corner · drag = curve · exact cursor · Space = pan"}
              {tool === "outline" &&
                "Trace outer boundary · click/drag curves · exact cursor · Space = pan"}
              {tool === "select" &&
                "Alt-drag from selected point / mid-edge = curve · ⌘/Ctrl-drag = precise · click point then ⌫ = delete point · right-click edge = add point"}
            </span>
          </div>

          <div ref={editorHostRef} className="relative min-h-0 flex-1 overflow-hidden">
            {hasImage && project ? (
              <div className="absolute inset-0">
                <ManualCanvas
                  key={workspace?.activeTabId ?? "tab"}
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
              </div>
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

            {project && (
              <div
                key={workspace?.activeTabId ?? "layers"}
                className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1"
              >
                {!layersOpen ? (
                  <button
                    type="button"
                    onClick={() => setLayersOpen(true)}
                    className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 shadow-lg ring-1 ring-neutral-200 hover:bg-white"
                  >
                    Layers{activeTabTitle ? ` · ${activeTabTitle}` : ""}
                  </button>
                ) : (
                  <div className="w-72 overflow-hidden rounded-lg bg-white/95 shadow-xl ring-1 ring-neutral-200 backdrop-blur-sm">
                    <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-1.5">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Layers{activeTabTitle ? ` · ${activeTabTitle}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLayersOpen(false)}
                        className="rounded px-1.5 py-0.5 text-2xl text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                        title="Collapse"
                      >
                        ▾
                      </button>
                    </div>
                    <div className="p-2">
                      <LayersPanel
                        project={project}
                        selectedLayerIds={selectedLayerIds}
                        selectedShapeIds={selectedShapeIds}
                        onSelectLayer={onSelectLayerRow}
                        onSelectShape={onSelectShapeRow}
                        onToggleLayerVisible={(id) => {
                          const l = getLayerTree(project).layers.find((x) => x.id === id);
                          if (l) updateActive((p) => patchLayer(p, id, { visible: !l.visible }));
                        }}
                        onToggleLayerLocked={(id) => {
                          const l = getLayerTree(project).layers.find((x) => x.id === id);
                          if (l) updateActive((p) => patchLayer(p, id, { locked: !l.locked }));
                        }}
                        onToggleGroupVisible={(id) => {
                          const g = getLayerTree(project).groups.find((x) => x.id === id);
                          if (g) updateActive((p) => patchGroup(p, id, { visible: !g.visible }));
                        }}
                        onToggleGroupLocked={(id) => {
                          const g = getLayerTree(project).groups.find((x) => x.id === id);
                          if (g) updateActive((p) => patchGroup(p, id, { locked: !g.locked }));
                        }}
                        onToggleGroupCollapsed={(id) => {
                          const g = getLayerTree(project).groups.find((x) => x.id === id);
                          if (g) updateActive((p) => patchGroup(p, id, { collapsed: !g.collapsed }));
                        }}
                        onToggleLayerCollapsed={onToggleLayerCollapsed}
                        onRenameLayer={(id) => {
                          const l = getLayerTree(project).layers.find((x) => x.id === id);
                          if (!l) return;
                          const name = window.prompt("Layer name", l.name);
                          if (name != null && name.trim()) updateActive((p) => patchLayer(p, id, { name: name.trim() }));
                        }}
                        onRenameGroup={(id) => {
                          const g = getLayerTree(project).groups.find((x) => x.id === id);
                          if (!g) return;
                          const name = window.prompt("Group name", g.name);
                          if (name != null && name.trim()) updateActive((p) => patchGroup(p, id, { name: name.trim() }));
                        }}
                        onNewLayer={doNewLayer}
                        onGroup={doGroup}
                        onDeleteNodes={doDeleteLayerNodes}
                        onSetActiveLayer={(id) => updateActive((p) => setActiveLayer(p, id))}
                        onReorderRoot={onReorderRoot}
                        onMoveLayer={onMoveLayerCb}
                        onMoveShape={onMoveShapeCb}
                        onReorderUngrouped={onReorderUngroupedCb}
                        onCollapseAll={onCollapseAll}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
