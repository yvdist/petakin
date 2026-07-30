"use client";
import { useCallback, useEffect, useRef, useState, WheelEvent, MouseEvent } from "react";
import type { Point } from "@/lib/types";
import { pathD } from "@/lib/geometry";
import type { ManualProject, ManualShape, ShapeKind } from "@/lib/manual";

export type Tool = "select" | "rect" | "poly";

interface Props {
  project: ManualProject;
  tool: Tool;
  snap: boolean;
  gridSize: number;
  selectedId: string | null;
  makeShape: (kind: ShapeKind, points: Point[]) => ManualShape; // applies current category/fill
  onSelect: (id: string | null) => void;
  onAddShape: (shape: ManualShape) => void;
  onUpdateShape: (id: string, points: Point[]) => void;
}

type View = { scale: number; tx: number; ty: number };

export default function ManualCanvas({
  project,
  tool,
  snap,
  gridSize,
  selectedId,
  makeShape,
  onSelect,
  onAddShape,
  onUpdateShape,
}: Props) {
  const { bg, shapes } = project;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  // in-progress drawing / editing state (renders previews)
  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null);
  const [poly, setPoly] = useState<{ pts: Point[]; cur: Point } | null>(null);
  const [live, setLive] = useState<{ id: string; points: Point[] } | null>(null);
  // latest live-edit points, kept in a ref so onMouseUp can commit without
  // depending on a re-render landing between the last mousemove and mouseup
  const liveRef = useRef<{ id: string; points: Point[] } | null>(null);
  const setLiveEdit = (v: { id: string; points: Point[] } | null) => {
    liveRef.current = v;
    setLive(v);
  };

  // low-level pointer interaction bookkeeping (no re-render)
  const drag = useRef<{
    mode: "none" | "pan" | "move" | "vertex" | "rect";
    startClient: { x: number; y: number };
    startContent: Point;
    orig: Point[]; // original points for move
    vIdx: number;
  } | null>(null);
  const moved = useRef(false);
  const spaceHeld = useRef(false);
  const shiftHeld = useRef(false);
  // mirror of `poly` so closePoly can emit exactly once (state updaters must be
  // pure — React Strict Mode double-invokes them, which would add the shape twice)
  const polyRef = useRef<{ pts: Point[]; cur: Point } | null>(null);
  useEffect(() => {
    polyRef.current = poly;
  }, [poly]);

  // reset transient drafts when the tool changes
  useEffect(() => {
    setRectDraft(null);
    setPoly(null);
  }, [tool]);

  // screen(client) -> content coordinates (undo viewBox then the view g-transform)
  const toContent = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current!;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const vb = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      return [(vb.x - view.tx) / view.scale, (vb.y - view.ty) / view.scale];
    },
    [view],
  );

  // gather snap targets (vertices of every shape except the one being edited)
  const snapPoint = useCallback(
    (p: Point, excludeId?: string): Point => {
      if (!snap) return p;
      const th = 10 / view.scale;
      for (const s of shapes) {
        if (s.id === excludeId) continue;
        for (const v of s.points) {
          if (Math.abs(v[0] - p[0]) < th && Math.abs(v[1] - p[1]) < th) return [v[0], v[1]];
        }
      }
      const g = gridSize > 0 ? gridSize : 1;
      return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
    },
    [snap, shapes, view.scale, gridSize],
  );

  // constrain a poly segment to H / V / 45° from the previous vertex (shift)
  function constrain(prev: Point, cur: Point): Point {
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];
    if (Math.abs(dx) > Math.abs(dy) * 2) return [cur[0], prev[1]];
    if (Math.abs(dy) > Math.abs(dx) * 2) return [prev[0], cur[1]];
    const m = (Math.abs(dx) + Math.abs(dy)) / 2;
    return [prev[0] + Math.sign(dx) * m, prev[1] + Math.sign(dy) * m];
  }

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * (bg.width || 1);
    const my = ((e.clientY - rect.top) / rect.height) * (bg.height || 1);
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(40, Math.max(0.05, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) };
    });
  }, [bg.width, bg.height]);

  const beginPan = (e: MouseEvent) => {
    drag.current = {
      mode: "pan",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      orig: [],
      vIdx: -1,
    };
    moved.current = false;
  };

  // ---- pointer down on the svg background ----
  const onBgMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || spaceHeld.current) return beginPan(e); // middle / space = pan
    const c = toContent(e.clientX, e.clientY);
    if (tool === "rect") {
      const a = snapPoint(c);
      drag.current = { mode: "rect", startClient: { x: e.clientX, y: e.clientY }, startContent: a, orig: [], vIdx: -1 };
      setRectDraft({ a, b: a });
      moved.current = false;
    } else if (tool === "poly") {
      // poly is click-driven; ignore mousedown (handled on click)
      return;
    } else {
      // select: background drag pans, click (no move) deselects
      beginPan(e);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    // poly rubber-band follows the cursor even without a button held
    if (tool === "poly" && poly) {
      let cur = toContent(e.clientX, e.clientY);
      cur = snapPoint(cur);
      if (shiftHeld.current && poly.pts.length) cur = constrain(poly.pts[poly.pts.length - 1], cur);
      setPoly({ ...poly, cur });
    }
    const dstate = drag.current;
    if (!dstate) return;
    const dxC = e.clientX - dstate.startClient.x;
    const dyC = e.clientY - dstate.startClient.y;
    if (Math.abs(dxC) + Math.abs(dyC) > 3) moved.current = true;

    if (dstate.mode === "pan") {
      dstate.startClient = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, tx: v.tx + dxC, ty: v.ty + dyC }));
    } else if (dstate.mode === "rect") {
      let b = toContent(e.clientX, e.clientY);
      b = snapPoint(b);
      setRectDraft({ a: dstate.startContent, b });
    } else if (dstate.mode === "move" && selectedId) {
      const dx = dxC / view.scale;
      const dy = dyC / view.scale;
      setLiveEdit({ id: selectedId, points: dstate.orig.map(([x, y]) => [x + dx, y + dy] as Point) });
    } else if (dstate.mode === "vertex" && selectedId && dstate.vIdx >= 0) {
      let p = toContent(e.clientX, e.clientY);
      p = snapPoint(p, selectedId);
      const pts = dstate.orig.map((q, i) => (i === dstate.vIdx ? p : ([q[0], q[1]] as Point)));
      setLiveEdit({ id: selectedId, points: pts });
    }
  };

  const onMouseUp = () => {
    const dstate = drag.current;
    drag.current = null;
    if (!dstate) return;
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
        const corners: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        onAddShape(makeShape("rect", corners));
      }
    } else if (dstate.mode === "move" || dstate.mode === "vertex") {
      const committed = liveRef.current;
      if (committed) onUpdateShape(committed.id, committed.points);
      setLiveEdit(null);
    }
  };

  const onSvgClick = () => {
    if (tool === "select" && !moved.current) onSelect(null);
  };

  // poly: click to add vertex; double-click / Enter closes; Esc cancels
  const onSvgMouseDownCapturePoly = (e: MouseEvent) => {
    if (tool !== "poly" || e.button !== 0 || spaceHeld.current) return;
    let c = toContent(e.clientX, e.clientY);
    c = snapPoint(c);
    setPoly((prev) => {
      if (!prev) return { pts: [c], cur: c };
      const last = prev.pts[prev.pts.length - 1];
      const pt = shiftHeld.current ? constrain(last, c) : c;
      return { pts: [...prev.pts, pt], cur: pt };
    });
  };

  const closePoly = useCallback(() => {
    const prev = polyRef.current;
    if (prev) {
      // drop consecutive duplicates (double-click leaves a repeated last vertex)
      const clean = prev.pts.filter(
        (p, i) => i === 0 || p[0] !== prev.pts[i - 1][0] || p[1] !== prev.pts[i - 1][1],
      );
      if (clean.length >= 3) onAddShape(makeShape("poly", clean));
    }
    polyRef.current = null;
    setPoly(null);
  }, [onAddShape, makeShape]);

  // keyboard: Space (pan), Shift (constrain), Enter (close poly), Esc (cancel)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        spaceHeld.current = true;
        e.preventDefault();
      }
      if (e.key === "Shift") shiftHeld.current = true;
      if (e.key === "Enter" && tool === "poly") closePoly();
      if (e.key === "Escape") setPoly(null);
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
      if (e.key === "Shift") shiftHeld.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [tool, closePoly]);

  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  const beginVertexDrag = (e: MouseEvent, s: ManualShape, i: number) => {
    e.stopPropagation();
    drag.current = {
      mode: "vertex",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      orig: s.points.map(([x, y]) => [x, y] as Point),
      vIdx: i,
    };
    moved.current = false;
  };

  const sw = 2 / view.scale;
  const handleR = 5 / view.scale;

  // selected shape + points for the vertex handles (precomputed, no IIFE in JSX)
  const handleShape = tool === "select" && selectedId ? shapes.find((x) => x.id === selectedId) ?? null : null;
  const handlePts = handleShape ? (live && live.id === handleShape.id ? live.points : handleShape.points) : null;
  const cursorClass =
    tool === "select" ? "cursor-default active:cursor-grabbing" : "cursor-crosshair";

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
      <svg
        ref={svgRef}
        className={`h-full w-full ${cursorClass}`}
        viewBox={`0 0 ${bg.width || 1} ${bg.height || 1}`}
        onWheel={onWheel}
        onMouseDown={(e) => {
          onSvgMouseDownCapturePoly(e);
          onBgMouseDown(e);
        }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => (drag.current = null)}
        onClick={onSvgClick}
        onDoubleClick={() => tool === "poly" && closePoly()}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
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

          <g stroke="#FFFFFF" strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
            {shapes.map((s) => {
              const pts = live && live.id === s.id ? live.points : s.points;
              const isSel = s.id === selectedId;
              const isHov = hovered === s.id;
              return (
                <path
                  key={s.id}
                  d={pathD(pts)}
                  fill={s.fill}
                  stroke={isSel ? "#E5187F" : isHov ? "#111827" : "#FFFFFF"}
                  strokeWidth={isSel ? sw * 1.6 : sw}
                  className={tool === "select" ? "cursor-move" : ""}
                  pointerEvents={tool === "select" ? "auto" : "none"}
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    if (tool !== "select" || spaceHeld.current) return;
                    e.stopPropagation();
                    onSelect(s.id);
                    drag.current = {
                      mode: "move",
                      startClient: { x: e.clientX, y: e.clientY },
                      startContent: [0, 0],
                      orig: s.points.map(([x, y]) => [x, y] as Point),
                      vIdx: -1,
                    };
                    moved.current = false;
                  }}
                />
              );
            })}
          </g>

          {/* vertex handles for the selected shape (select tool) */}
          {handleShape &&
            handlePts &&
            handlePts.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={handleR}
                fill="#FFFFFF"
                stroke="#E5187F"
                strokeWidth={sw}
                className="cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => beginVertexDrag(e, handleShape, i)}
              />
            ))}

          {/* rect preview */}
          {rectDraft && (
            <rect
              x={Math.min(rectDraft.a[0], rectDraft.b[0])}
              y={Math.min(rectDraft.a[1], rectDraft.b[1])}
              width={Math.abs(rectDraft.b[0] - rectDraft.a[0])}
              height={Math.abs(rectDraft.b[1] - rectDraft.a[1])}
              fill="#E5187F22"
              stroke="#E5187F"
              strokeWidth={sw}
              pointerEvents="none"
            />
          )}

          {/* poly preview */}
          {poly && poly.pts.length > 0 && (
            <g pointerEvents="none">
              <polyline
                points={[...poly.pts, poly.cur].map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="none"
                stroke="#E5187F"
                strokeWidth={sw}
                strokeDasharray={`${4 / view.scale} ${3 / view.scale}`}
              />
              {poly.pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={handleR} fill="#E5187F" />
              ))}
            </g>
          )}
        </g>
      </svg>

      {tool === "poly" && poly && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          {poly.pts.length} pts · double-click or Enter to close · Esc to cancel · Shift = straight
        </div>
      )}
    </div>
  );
}
