"use client";
import { useCallback, useEffect, useRef, useState, WheelEvent, MouseEvent } from "react";
import type { Point } from "@/lib/types";
import {
  bendEdge,
  edgeHitRadius,
  flattenPolyVertsOpen,
  getStroke,
  insertVertOnEdge,
  nearestEdge,
  pathDFromVerts,
  shapeVerts,
  shellVertsOf,
  syncShapeFromVerts,
  SHELL_ID,
  type ManualProject,
  type ManualShape,
  type PolyVert,
  type ShapeKind,
} from "@/lib/manual";

const BRAND = "#0D9488";
const BRAND_SOFT = "#0D948822";
const DRAG_THRESH_PX = 4;

export type Tool = "select" | "rect" | "poly" | "outline";

interface Props {
  project: ManualProject;
  tool: Tool;
  snap: boolean;
  gridSize: number;
  selectedId: string | null;
  selectedVertIndex: number | null;
  makeShape: (kind: ShapeKind, points: Point[], verts?: PolyVert[]) => ManualShape;
  onSelect: (id: string | null) => void;
  onSelectVert: (index: number | null) => void;
  onAddShape: (shape: ManualShape) => void;
  onUpdateShapeVerts: (id: string, verts: PolyVert[]) => void;
  onSetShell: (verts: PolyVert[]) => void;
  onRequestTool?: (tool: Tool) => void;
}

type View = { scale: number; tx: number; ty: number };

type PolyDraft = {
  kind: "poly" | "outline";
  verts: PolyVert[];
  cur: Point;
};

type DragState = {
  mode: "none" | "pan" | "move" | "vertex" | "bezier" | "bend" | "rect" | "polyPlace";
  startClient: { x: number; y: number };
  startContent: Point;
  origVerts: PolyVert[];
  vIdx: number;
  handleOut?: Point;
};

function cloneVerts(verts: PolyVert[]): PolyVert[] {
  return verts.map((v) => ({
    p: [v.p[0], v.p[1]] as Point,
    handleOut: v.handleOut ? ([v.handleOut[0], v.handleOut[1]] as Point) : undefined,
  }));
}

function translateVerts(verts: PolyVert[], dx: number, dy: number): PolyVert[] {
  return verts.map((v) => ({
    p: [v.p[0] + dx, v.p[1] + dy] as Point,
    handleOut: v.handleOut
      ? ([v.handleOut[0] + dx, v.handleOut[1] + dy] as Point)
      : undefined,
  }));
}

export default function ManualCanvas({
  project,
  tool,
  snap,
  gridSize,
  selectedId,
  selectedVertIndex,
  makeShape,
  onSelect,
  onSelectVert,
  onAddShape,
  onUpdateShapeVerts,
  onSetShell,
  onRequestTool,
}: Props) {
  const { bg, shapes } = project;
  const shellV = shellVertsOf(project);
  const tenantStroke = getStroke(project);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [hovered, setHovered] = useState<string | null>(null);

  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null);
  const [poly, setPoly] = useState<PolyDraft | null>(null);
  const [placing, setPlacing] = useState<{ p: Point; handleOut?: Point } | null>(null);
  const [live, setLive] = useState<{ id: string; verts: PolyVert[] } | null>(null);
  const liveRef = useRef<{ id: string; verts: PolyVert[] } | null>(null);
  const setLiveEdit = (v: { id: string; verts: PolyVert[] } | null) => {
    liveRef.current = v;
    setLive(v);
  };

  const drag = useRef<DragState | null>(null);
  const moved = useRef(false);
  const spaceHeld = useRef(false);
  const shiftHeld = useRef(false);
  const altHeld = useRef(false);
  const ctrlHeld = useRef(false);
  const polyRef = useRef<PolyDraft | null>(null);
  useEffect(() => {
    polyRef.current = poly;
  }, [poly]);

  useEffect(() => {
    setRectDraft(null);
    setPlacing(null);
    if ((tool === "poly" || tool === "outline") && polyRef.current) {
      setPoly((p) => (p ? { ...p, kind: tool } : p));
    }
  }, [tool]);

  /** Screen → SVG user space (viewBox), before pan/zoom group. */
  const clientToSvg = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const w = bg.width || 1;
      const h = bg.height || 1;
      return [
        ((clientX - rect.left) / Math.max(1e-6, rect.width)) * w,
        ((clientY - rect.top) / Math.max(1e-6, rect.height)) * h,
      ];
    },
    [bg.width, bg.height],
  );

  /** Screen → content coords via the pan/zoom group's live CTM (no stale view). */
  const toContent = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const g = contentRef.current;
    if (!svg || !g) return [0, 0];
    const ctm = g.getScreenCTM();
    if (!ctm) {
      const v = viewRef.current;
      const [x, y] = clientToSvg(clientX, clientY);
      return [(x - v.tx) / v.scale, (y - v.ty) / v.scale];
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }, [clientToSvg]);

  const clientToSvgDelta = useCallback(
    (dxClient: number, dyClient: number): Point => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      return [
        (dxClient / Math.max(1e-6, rect.width)) * (bg.width || 1),
        (dyClient / Math.max(1e-6, rect.height)) * (bg.height || 1),
      ];
    },
    [bg.width, bg.height],
  );

  const snapPoint = useCallback(
    (p: Point, excludeId?: string): Point => {
      if (!snap) return p;
      const th = 10 / view.scale;
      if (shellV && excludeId !== SHELL_ID) {
        for (const v of shellV) {
          if (Math.abs(v.p[0] - p[0]) < th && Math.abs(v.p[1] - p[1]) < th) return [v.p[0], v.p[1]];
        }
      }
      for (const s of shapes) {
        if (s.id === excludeId) continue;
        for (const v of shapeVerts(s)) {
          if (Math.abs(v.p[0] - p[0]) < th && Math.abs(v.p[1] - p[1]) < th) return [v.p[0], v.p[1]];
        }
      }
      const g = gridSize > 0 ? gridSize : 1;
      return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
    },
    [snap, shapes, shellV, view.scale, gridSize],
  );

  function constrain(prev: Point, cur: Point): Point {
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];
    if (Math.abs(dx) > Math.abs(dy) * 2) return [cur[0], prev[1]];
    if (Math.abs(dy) > Math.abs(dx) * 2) return [prev[0], cur[1]];
    const m = (Math.abs(dx) + Math.abs(dy)) / 2;
    return [prev[0] + Math.sign(dx) * m, prev[1] + Math.sign(dy) * m];
  }

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const [mx, my] = clientToSvg(e.clientX, e.clientY);
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = Math.min(40, Math.max(0.05, v.scale * factor));
        const k = ns / v.scale;
        return { scale: ns, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) };
      });
    },
    [clientToSvg],
  );

  const beginPan = (e: MouseEvent) => {
    drag.current = {
      mode: "pan",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      origVerts: [],
      vIdx: -1,
    };
    moved.current = false;
  };

  const drawingPolyLike = tool === "poly" || tool === "outline";
  const draftPaused = !!poly && !drawingPolyLike;

  const commitVerts = useCallback(
    (id: string, verts: PolyVert[]) => {
      if (id === SHELL_ID) onSetShell(verts);
      else onUpdateShapeVerts(id, verts);
    },
    [onSetShell, onUpdateShapeVerts],
  );

  const commitPolyPlace = useCallback(
    (anchor: Point, handleOut: Point | undefined, clientDist: number) => {
      const kind = tool === "outline" ? "outline" : tool === "poly" ? "poly" : polyRef.current?.kind ?? "poly";
      const vert: PolyVert =
        clientDist > DRAG_THRESH_PX && handleOut ? { p: anchor, handleOut } : { p: anchor };
      setPoly((prev) => {
        if (!prev) return { kind, verts: [vert], cur: anchor };
        return { ...prev, kind, verts: [...prev.verts, vert], cur: anchor };
      });
      setPlacing(null);
    },
    [tool],
  );

  const onBgMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || spaceHeld.current) return beginPan(e);
    if (e.button === 2) return;
    const c = toContent(e.clientX, e.clientY);
    if (tool === "rect") {
      const a = snapPoint(c);
      drag.current = {
        mode: "rect",
        startClient: { x: e.clientX, y: e.clientY },
        startContent: a,
        origVerts: [],
        vIdx: -1,
      };
      setRectDraft({ a, b: a });
      moved.current = false;
    } else if (drawingPolyLike) {
      return;
    } else if (tool === "select" && (e.altKey || altHeld.current)) {
      // Alt-drag near any edge to bend (prefer selected)
      const maxDist = edgeHitRadius(view.scale);
      const tryBend = (id: string, verts: PolyVert[]) => {
        const edge = nearestEdge(c, verts, maxDist);
        if (!edge) return false;
        onSelect(id);
        onSelectVert(edge.index);
        drag.current = {
          mode: "bend",
          startClient: { x: e.clientX, y: e.clientY },
          startContent: c,
          origVerts: cloneVerts(verts),
          vIdx: edge.index,
        };
        moved.current = false;
        setLiveEdit({ id, verts: bendEdge(verts, edge.index, c) });
        return true;
      };
      if (selectedId === SHELL_ID && shellV && tryBend(SHELL_ID, shellV)) return;
      if (selectedId && selectedId !== SHELL_ID) {
        const s = shapes.find((x) => x.id === selectedId);
        if (s && tryBend(s.id, shapeVerts(s))) return;
      }
      if (shellV && tryBend(SHELL_ID, shellV)) return;
      for (const s of shapes) {
        if (tryBend(s.id, shapeVerts(s))) return;
      }
      beginPan(e);
    } else {
      beginPan(e);
    }
  };

  const onPolyMouseDown = (e: MouseEvent) => {
    if (!drawingPolyLike || e.button !== 0 || spaceHeld.current) return;
    e.stopPropagation();
    // Exact cursor position — no grid snap while tracing (snap still applies in Select/Rect)
    let c = toContent(e.clientX, e.clientY);
    if (shiftHeld.current && poly?.verts.length) {
      c = constrain(poly.verts[poly.verts.length - 1].p, c);
    }
    drag.current = {
      mode: "polyPlace",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: c,
      origVerts: [],
      vIdx: -1,
    };
    moved.current = false;
    setPlacing({ p: c });
  };

  const onMouseMove = (e: MouseEvent) => {
    // Rubber-band follows raw cursor
    if (drawingPolyLike && poly && drag.current?.mode !== "polyPlace") {
      let cur = toContent(e.clientX, e.clientY);
      if (shiftHeld.current && poly.verts.length) cur = constrain(poly.verts[poly.verts.length - 1].p, cur);
      setPoly({ ...poly, cur });
    }

    const dstate = drag.current;
    if (!dstate) return;
    const dxC = e.clientX - dstate.startClient.x;
    const dyC = e.clientY - dstate.startClient.y;
    if (Math.abs(dxC) + Math.abs(dyC) > 3) moved.current = true;

    if (dstate.mode === "pan") {
      dstate.startClient = { x: e.clientX, y: e.clientY };
      const [dx, dy] = clientToSvgDelta(dxC, dyC);
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    } else if (dstate.mode === "rect") {
      let b = toContent(e.clientX, e.clientY);
      b = snapPoint(b);
      setRectDraft({ a: dstate.startContent, b });
    } else if (dstate.mode === "polyPlace") {
      let h = toContent(e.clientX, e.clientY);
      if (shiftHeld.current) h = constrain(dstate.startContent, h);
      dstate.handleOut = h;
      if (Math.hypot(dxC, dyC) > DRAG_THRESH_PX) setPlacing({ p: dstate.startContent, handleOut: h });
      else setPlacing({ p: dstate.startContent });
    } else if (dstate.mode === "move" && selectedId) {
      const [dxSvg, dySvg] = clientToSvgDelta(dxC, dyC);
      const dx = dxSvg / view.scale;
      const dy = dySvg / view.scale;
      setLiveEdit({ id: selectedId, verts: translateVerts(dstate.origVerts, dx, dy) });
    } else if (dstate.mode === "vertex" && selectedId && dstate.vIdx >= 0) {
      const precise = e.ctrlKey || e.metaKey || ctrlHeld.current;
      let p = toContent(e.clientX, e.clientY);
      if (!precise) p = snapPoint(p, selectedId);
      const orig = dstate.origVerts[dstate.vIdx];
      const dx = p[0] - orig.p[0];
      const dy = p[1] - orig.p[1];
      const verts = cloneVerts(dstate.origVerts);
      verts[dstate.vIdx] = {
        p,
        handleOut: orig.handleOut
          ? ([orig.handleOut[0] + dx, orig.handleOut[1] + dy] as Point)
          : undefined,
      };
      setLiveEdit({ id: selectedId, verts });
    } else if (dstate.mode === "bezier" && selectedId && dstate.vIdx >= 0) {
      const precise = e.ctrlKey || e.metaKey || ctrlHeld.current;
      let h = toContent(e.clientX, e.clientY);
      if (!precise) h = snapPoint(h, selectedId);
      if (shiftHeld.current) {
        const anchor = dstate.origVerts[dstate.vIdx].p;
        h = constrain(anchor, h);
      }
      const verts = cloneVerts(dstate.origVerts);
      verts[dstate.vIdx] = { ...verts[dstate.vIdx], handleOut: h };
      setLiveEdit({ id: selectedId, verts });
    } else if (dstate.mode === "bend" && selectedId && dstate.vIdx >= 0) {
      const precise = e.ctrlKey || e.metaKey || ctrlHeld.current;
      let h = toContent(e.clientX, e.clientY);
      if (!precise) h = snapPoint(h, selectedId);
      setLiveEdit({ id: selectedId, verts: bendEdge(dstate.origVerts, dstate.vIdx, h) });
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    const dstate = drag.current;
    drag.current = null;
    if (!dstate) return;
    if (dstate.mode === "polyPlace") {
      const dist = Math.hypot(e.clientX - dstate.startClient.x, e.clientY - dstate.startClient.y);
      commitPolyPlace(dstate.startContent, dstate.handleOut, dist);
      return;
    }
    if (dstate.mode === "rect" && rectDraft) {
      const { a, b } = rectDraft;
      setRectDraft(null);
      const w = Math.abs(b[0] - a[0]);
      const h = Math.abs(b[1] - a[1]);
      if (w > 2 && h > 2) {
        const x0 = Math.min(a[0], b[0]);
        const y0 = Math.min(a[1], b[1]);
        const x1 = Math.max(a[0], b[0]);
        const y1 = Math.max(a[1], b[1]);
        const corners: Point[] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ];
        const verts = corners.map((p) => ({ p }));
        onAddShape(makeShape("rect", corners, verts));
      }
    } else if (
      dstate.mode === "move" ||
      dstate.mode === "vertex" ||
      dstate.mode === "bezier" ||
      dstate.mode === "bend"
    ) {
      const committed = liveRef.current;
      if (committed) commitVerts(committed.id, committed.verts);
      setLiveEdit(null);
    }
  };

  const onSvgClick = () => {
    if (tool === "select" && !moved.current) {
      onSelect(null);
      onSelectVert(null);
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (tool !== "select" || spaceHeld.current) return;
    const c = toContent(e.clientX, e.clientY);
    const maxDist = edgeHitRadius(view.scale);

    // prefer selected shape/shell, then any shape
    const candidates: { id: string; verts: PolyVert[] }[] = [];
    if (selectedId === SHELL_ID && shellV) candidates.push({ id: SHELL_ID, verts: shellV });
    else if (selectedId) {
      const s = shapes.find((x) => x.id === selectedId);
      if (s) candidates.push({ id: s.id, verts: shapeVerts(s) });
    }
    if (shellV && selectedId !== SHELL_ID) candidates.push({ id: SHELL_ID, verts: shellV });
    for (const s of shapes) {
      if (s.id !== selectedId) candidates.push({ id: s.id, verts: shapeVerts(s) });
    }

    let hit: { id: string; edgeIndex: number; q: Point; dist: number } | null = null;
    for (const cand of candidates) {
      const edge = nearestEdge(c, cand.verts, maxDist);
      if (edge && (!hit || edge.dist < hit.dist)) {
        hit = { id: cand.id, edgeIndex: edge.index, q: edge.q, dist: edge.dist };
      }
    }
    if (!hit) return;
    const src =
      hit.id === SHELL_ID
        ? shellV!
        : shapeVerts(shapes.find((s) => s.id === hit!.id)!);
    const next = insertVertOnEdge(src, hit.edgeIndex, hit.q);
    commitVerts(hit.id, next);
    onSelect(hit.id);
    onSelectVert(hit.edgeIndex + 1);
  };

  const closePoly = useCallback(() => {
    const prev = polyRef.current;
    polyRef.current = null;
    setPoly(null);
    setPlacing(null);
    if (prev && prev.verts.length >= 3) {
      const synced = syncShapeFromVerts(prev.verts);
      if (synced.points.length >= 3) {
        if (prev.kind === "outline") {
          onSetShell(synced.verts);
          onSelect(SHELL_ID);
        } else {
          onAddShape(makeShape("poly", synced.points, synced.verts));
        }
      }
    }
  }, [onAddShape, makeShape, onSetShell, onSelect]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        spaceHeld.current = true;
        e.preventDefault();
      }
      if (e.key === "Shift") shiftHeld.current = true;
      if (e.key === "Alt") {
        altHeld.current = true;
        e.preventDefault();
      }
      if (e.key === "Control" || e.key === "Meta") ctrlHeld.current = true;
      if (e.key === "Enter" && drawingPolyLike) closePoly();
      if (e.key === "Escape") {
        polyRef.current = null;
        setPoly(null);
        setPlacing(null);
        onSelectVert(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && drawingPolyLike) {
        const prev = polyRef.current;
        if (!prev?.verts.length) return;
        e.preventDefault();
        const verts = prev.verts.slice(0, -1);
        if (verts.length === 0) {
          polyRef.current = null;
          setPoly(null);
        } else {
          const next = { ...prev, verts, cur: verts[verts.length - 1].p };
          polyRef.current = next;
          setPoly(next);
        }
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
      if (e.key === "Shift") shiftHeld.current = false;
      if (e.key === "Alt") altHeld.current = false;
      if (e.key === "Control" || e.key === "Meta") ctrlHeld.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [drawingPolyLike, closePoly, onSelectVert]);

  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  const beginVertexDrag = (e: MouseEvent, verts: PolyVert[], i: number, id: string) => {
    e.stopPropagation();
    onSelect(id);
    onSelectVert(i);
    drag.current = {
      mode: "vertex",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      origVerts: cloneVerts(verts),
      vIdx: i,
    };
    moved.current = false;
  };

  const beginBezierDrag = (e: MouseEvent, verts: PolyVert[], i: number, id: string) => {
    e.stopPropagation();
    onSelect(id);
    onSelectVert(i);
    drag.current = {
      mode: "bezier",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      origVerts: cloneVerts(verts),
      vIdx: i,
    };
    moved.current = false;
  };

  const beginMove = (e: MouseEvent, verts: PolyVert[], id: string) => {
    if (tool !== "select" || spaceHeld.current || e.button !== 0) return;
    e.stopPropagation();

    // Alt + drag on fill/edge → bend nearest edge instead of moving whole shape
    if (e.altKey || altHeld.current) {
      const c = toContent(e.clientX, e.clientY);
      const edge = nearestEdge(c, verts, edgeHitRadius(view.scale));
      if (edge) {
        onSelect(id);
        onSelectVert(edge.index);
        drag.current = {
          mode: "bend",
          startClient: { x: e.clientX, y: e.clientY },
          startContent: c,
          origVerts: cloneVerts(verts),
          vIdx: edge.index,
        };
        moved.current = false;
        setLiveEdit({ id, verts: bendEdge(verts, edge.index, c) });
        return;
      }
    }

    onSelect(id);
    onSelectVert(null);
    drag.current = {
      mode: "move",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      origVerts: cloneVerts(verts),
      vIdx: -1,
    };
    moved.current = false;
  };

  const uiSw = 2 / view.scale;
  const strokeW = tenantStroke.width;
  const handleR = 5 / view.scale;

  const liveVertsFor = (id: string, fallback: PolyVert[]) =>
    live && live.id === id ? live.verts : fallback;

  const shellLive = shellV ? liveVertsFor(SHELL_ID, shellV) : null;
  const isShellSel = selectedId === SHELL_ID;

  const selectedShape = selectedId && selectedId !== SHELL_ID ? shapes.find((s) => s.id === selectedId) : null;
  const selectedVerts = selectedShape
    ? liveVertsFor(selectedShape.id, shapeVerts(selectedShape))
    : isShellSel && shellLive
      ? shellLive
      : null;

  const cursorClass =
    tool === "select" ? "cursor-default active:cursor-grabbing" : "cursor-crosshair";

  const previewStroke = poly?.kind === "outline" || tool === "outline" ? "#111827" : BRAND;
  const draftVerts: PolyVert[] = placing
    ? [...(poly?.verts ?? []), { p: placing.p, handleOut: placing.handleOut }]
    : poly?.verts ?? [];
  const previewPts =
    draftVerts.length > 0
      ? flattenPolyVertsOpen(draftVerts, drawingPolyLike && !placing && poly ? poly.cur : undefined)
      : [];

  return (
    <div className="relative h-full w-full overflow-hidden checkerboard">
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button onClick={resetView} className="rounded bg-white/90 px-2 py-1 text-xs shadow ring-1 ring-neutral-300">
          Reset view
        </button>
        <span className="rounded bg-white/90 px-2 py-1 text-xs shadow ring-1 ring-neutral-300">
          {Math.round(view.scale * 100)}%
        </span>
      </div>

      {draftPaused && poly && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 px-3 py-1.5 text-xs text-white shadow">
          <span>
            {poly.kind === "outline" ? "Outline" : "Polygon"} in progress ({poly.verts.length} pts)
          </span>
          <button
            type="button"
            className="rounded bg-brand px-2 py-0.5 font-medium text-white"
            onClick={() => onRequestTool?.(poly.kind)}
          >
            Continue ({poly.kind === "outline" ? "O" : "P"})
          </button>
          <span className="text-white/60">Esc cancel · Space pan</span>
        </div>
      )}

      <svg
        ref={svgRef}
        className={`h-full w-full ${cursorClass}`}
        viewBox={`0 0 ${bg.width || 1} ${bg.height || 1}`}
        preserveAspectRatio="none"
        onWheel={onWheel}
        onContextMenu={onContextMenu}
        onMouseDown={(e) => {
          onPolyMouseDown(e);
          onBgMouseDown(e);
        }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (drag.current?.mode === "polyPlace") {
            commitPolyPlace(drag.current.startContent, undefined, 0);
          }
          drag.current = null;
        }}
        onClick={onSvgClick}
      >
        <defs>
          {shellLive && (
            <clipPath id="manual-shell">
              <path d={pathDFromVerts(shellLive)} />
            </clipPath>
          )}
        </defs>
        <g
          ref={contentRef}
          transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}
        >
          {bg.dataUrl && (
            <image
              href={bg.dataUrl}
              x={0}
              y={0}
              width={bg.width}
              height={bg.height}
              opacity={bg.opacity}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
          )}

          {shellLive && (
            <path d={pathDFromVerts(shellLive)} fill="#ECECEC88" stroke="none" pointerEvents="none" />
          )}

          <g clipPath={shellLive ? "url(#manual-shell)" : undefined}>
            {shapes.map((s) => {
              const verts = liveVertsFor(s.id, shapeVerts(s));
              return (
                <path
                  key={`f-${s.id}`}
                  d={pathDFromVerts(verts)}
                  fill={s.fill}
                  stroke="none"
                  pointerEvents="none"
                />
              );
            })}
            {shapes.map((s) => {
              const verts = liveVertsFor(s.id, shapeVerts(s));
              const isSel = s.id === selectedId;
              const isHov = hovered === s.id;
              const stroke = isSel ? BRAND : isHov ? "#111827" : tenantStroke.color;
              const sw = isSel ? strokeW * 1.6 : strokeW;
              return (
                <path
                  key={`o-${s.id}`}
                  d={pathDFromVerts(verts)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              );
            })}
          </g>

          {shellLive && (
            <path
              d={pathDFromVerts(shellLive)}
              fill="none"
              stroke={isShellSel ? BRAND : "#000000"}
              strokeWidth={isShellSel ? strokeW * 2 : Math.max(strokeW * 1.5, 2)}
              strokeLinejoin="miter"
              strokeLinecap="round"
              className={tool === "select" ? "cursor-move" : ""}
              pointerEvents={tool === "select" ? "stroke" : "none"}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => beginMove(e, shellLive, SHELL_ID)}
            />
          )}

          {tool === "select" &&
            shapes.map((s) => {
              const verts = liveVertsFor(s.id, shapeVerts(s));
              return (
                <path
                  key={`h-${s.id}`}
                  d={pathDFromVerts(verts)}
                  fill="transparent"
                  stroke="none"
                  className="cursor-move"
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => beginMove(e, verts, s.id)}
                />
              );
            })}

          {/* anchors + bezier handles for selection */}
          {tool === "select" &&
            selectedVerts &&
            selectedVerts.map((v, i) => (
              <g key={`ah-${i}`}>
                {v.handleOut && (
                  <>
                    <line
                      x1={v.p[0]}
                      y1={v.p[1]}
                      x2={v.handleOut[0]}
                      y2={v.handleOut[1]}
                      stroke={BRAND}
                      strokeWidth={uiSw * 0.7}
                      opacity={0.55}
                      pointerEvents="none"
                    />
                    <circle
                      cx={v.handleOut[0]}
                      cy={v.handleOut[1]}
                      r={handleR * 0.75}
                      fill="#fff"
                      stroke={BRAND}
                      strokeWidth={uiSw}
                      className="cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) =>
                        beginBezierDrag(e, selectedVerts, i, isShellSel ? SHELL_ID : selectedId!)
                      }
                    />
                  </>
                )}
                <circle
                  cx={v.p[0]}
                  cy={v.p[1]}
                  r={selectedVertIndex === i ? handleR * 1.35 : handleR}
                  fill={selectedVertIndex === i ? BRAND : "#FFFFFF"}
                  stroke={BRAND}
                  strokeWidth={uiSw}
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) =>
                    beginVertexDrag(e, selectedVerts, i, isShellSel ? SHELL_ID : selectedId!)
                  }
                />
              </g>
            ))}

          {rectDraft && (
            <rect
              x={Math.min(rectDraft.a[0], rectDraft.b[0])}
              y={Math.min(rectDraft.a[1], rectDraft.b[1])}
              width={Math.abs(rectDraft.b[0] - rectDraft.a[0])}
              height={Math.abs(rectDraft.b[1] - rectDraft.a[1])}
              fill={BRAND_SOFT}
              stroke={BRAND}
              strokeWidth={uiSw}
              pointerEvents="none"
            />
          )}

          {(poly || placing) && (
            <g pointerEvents="none" opacity={draftPaused ? 0.55 : 1}>
              {previewPts.length > 1 && (
                <polyline
                  points={previewPts.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill="none"
                  stroke={previewStroke}
                  strokeWidth={uiSw}
                  strokeDasharray={drawingPolyLike ? `${4 / view.scale} ${3 / view.scale}` : undefined}
                />
              )}
              {(poly?.verts ?? []).map((v, i) => (
                <g key={i}>
                  {v.handleOut && (
                    <line
                      x1={v.p[0]}
                      y1={v.p[1]}
                      x2={v.handleOut[0]}
                      y2={v.handleOut[1]}
                      stroke={previewStroke}
                      strokeWidth={uiSw * 0.7}
                      opacity={0.5}
                    />
                  )}
                  <circle cx={v.p[0]} cy={v.p[1]} r={handleR} fill={previewStroke} />
                </g>
              ))}
              {placing && (
                <>
                  {placing.handleOut && (
                    <line
                      x1={placing.p[0]}
                      y1={placing.p[1]}
                      x2={placing.handleOut[0]}
                      y2={placing.handleOut[1]}
                      stroke={previewStroke}
                      strokeWidth={uiSw * 0.7}
                      opacity={0.6}
                    />
                  )}
                  <circle cx={placing.p[0]} cy={placing.p[1]} r={handleR} fill={previewStroke} />
                  {placing.handleOut && (
                    <circle
                      cx={placing.handleOut[0]}
                      cy={placing.handleOut[1]}
                      r={handleR * 0.7}
                      fill="#fff"
                      stroke={previewStroke}
                      strokeWidth={uiSw}
                    />
                  )}
                </>
              )}
            </g>
          )}
        </g>
      </svg>

      {drawingPolyLike && (poly || placing) && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          {poly?.kind === "outline" || tool === "outline" ? "Outline" : "Polygon"} ·{" "}
          {poly?.verts.length ?? 0} verts · click = corner · drag = curve · Shift = straight · Space =
          pan · ⌘Z undo · Enter close · Esc cancel
        </div>
      )}
    </div>
  );
}
