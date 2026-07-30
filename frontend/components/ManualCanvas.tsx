"use client";
import { useCallback, useEffect, useRef, useState, WheelEvent, MouseEvent } from "react";
import type { Point } from "@/lib/types";
import { pathD } from "@/lib/geometry";
import {
  getStroke,
  SHELL_ID,
  type ManualProject,
  type ManualShape,
  type ShapeKind,
} from "@/lib/manual";

const BRAND = "#0D9488";
const BRAND_SOFT = "#0D948822";

export type Tool = "select" | "rect" | "poly" | "outline";

interface Props {
  project: ManualProject;
  tool: Tool;
  snap: boolean;
  gridSize: number;
  selectedId: string | null;
  makeShape: (kind: ShapeKind, points: Point[]) => ManualShape;
  onSelect: (id: string | null) => void;
  onAddShape: (shape: ManualShape) => void;
  onUpdateShape: (id: string, points: Point[]) => void;
  onSetShell: (points: Point[]) => void;
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
  onSetShell,
}: Props) {
  const { bg, shapes } = project;
  const shell = project.shell && project.shell.length >= 3 ? project.shell : null;
  const tenantStroke = getStroke(project);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null);
  const [poly, setPoly] = useState<{ pts: Point[]; cur: Point } | null>(null);
  const [live, setLive] = useState<{ id: string; points: Point[] } | null>(null);
  const liveRef = useRef<{ id: string; points: Point[] } | null>(null);
  const setLiveEdit = (v: { id: string; points: Point[] } | null) => {
    liveRef.current = v;
    setLive(v);
  };

  const drag = useRef<{
    mode: "none" | "pan" | "move" | "vertex" | "rect";
    startClient: { x: number; y: number };
    startContent: Point;
    orig: Point[];
    vIdx: number;
  } | null>(null);
  const moved = useRef(false);
  const spaceHeld = useRef(false);
  const shiftHeld = useRef(false);
  const polyRef = useRef<{ pts: Point[]; cur: Point } | null>(null);
  useEffect(() => {
    polyRef.current = poly;
  }, [poly]);

  useEffect(() => {
    setRectDraft(null);
    setPoly(null);
  }, [tool]);

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

  const snapPoint = useCallback(
    (p: Point, excludeId?: string): Point => {
      if (!snap) return p;
      const th = 10 / view.scale;
      if (shell && excludeId !== SHELL_ID) {
        for (const v of shell) {
          if (Math.abs(v[0] - p[0]) < th && Math.abs(v[1] - p[1]) < th) return [v[0], v[1]];
        }
      }
      for (const s of shapes) {
        if (s.id === excludeId) continue;
        for (const v of s.points) {
          if (Math.abs(v[0] - p[0]) < th && Math.abs(v[1] - p[1]) < th) return [v[0], v[1]];
        }
      }
      const g = gridSize > 0 ? gridSize : 1;
      return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
    },
    [snap, shapes, shell, view.scale, gridSize],
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
      const rect = svgRef.current!.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * (bg.width || 1);
      const my = ((e.clientY - rect.top) / rect.height) * (bg.height || 1);
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = Math.min(40, Math.max(0.05, v.scale * factor));
        const k = ns / v.scale;
        return { scale: ns, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) };
      });
    },
    [bg.width, bg.height],
  );

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

  const drawingPolyLike = tool === "poly" || tool === "outline";

  const onBgMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || spaceHeld.current) return beginPan(e);
    const c = toContent(e.clientX, e.clientY);
    if (tool === "rect") {
      const a = snapPoint(c);
      drag.current = {
        mode: "rect",
        startClient: { x: e.clientX, y: e.clientY },
        startContent: a,
        orig: [],
        vIdx: -1,
      };
      setRectDraft({ a, b: a });
      moved.current = false;
    } else if (drawingPolyLike) {
      return;
    } else {
      beginPan(e);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (drawingPolyLike && poly) {
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
        const corners: Point[] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ];
        onAddShape(makeShape("rect", corners));
      }
    } else if (dstate.mode === "move" || dstate.mode === "vertex") {
      const committed = liveRef.current;
      if (committed) {
        if (committed.id === SHELL_ID) onSetShell(committed.points);
        else onUpdateShape(committed.id, committed.points);
      }
      setLiveEdit(null);
    }
  };

  const onSvgClick = () => {
    if (tool === "select" && !moved.current) onSelect(null);
  };

  const onSvgMouseDownCapturePoly = (e: MouseEvent) => {
    if (!drawingPolyLike || e.button !== 0 || spaceHeld.current) return;
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
      const clean = prev.pts.filter(
        (p, i) => i === 0 || p[0] !== prev.pts[i - 1][0] || p[1] !== prev.pts[i - 1][1],
      );
      if (clean.length >= 3) {
        if (tool === "outline") {
          onSetShell(clean);
          onSelect(SHELL_ID);
        } else {
          onAddShape(makeShape("poly", clean));
        }
      }
    }
    polyRef.current = null;
    setPoly(null);
  }, [onAddShape, makeShape, onSetShell, onSelect, tool]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        spaceHeld.current = true;
        e.preventDefault();
      }
      if (e.key === "Shift") shiftHeld.current = true;
      if (e.key === "Enter" && drawingPolyLike) closePoly();
      if (e.key === "Escape") {
        polyRef.current = null;
        setPoly(null);
      }
      // ⌘Z / Ctrl+Z — undo last vertex while tracing poly or outline
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && drawingPolyLike) {
        const prev = polyRef.current;
        if (!prev?.pts.length) return;
        e.preventDefault();
        const pts = prev.pts.slice(0, -1);
        if (pts.length === 0) {
          polyRef.current = null;
          setPoly(null);
        } else {
          const next = { pts, cur: prev.cur };
          polyRef.current = next;
          setPoly(next);
        }
      }
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
  }, [drawingPolyLike, closePoly]);

  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  const beginVertexDrag = (e: MouseEvent, points: Point[], i: number, id: string) => {
    e.stopPropagation();
    onSelect(id);
    drag.current = {
      mode: "vertex",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      orig: points.map(([x, y]) => [x, y] as Point),
      vIdx: i,
    };
    moved.current = false;
  };

  const beginMove = (e: MouseEvent, points: Point[], id: string) => {
    if (tool !== "select" || spaceHeld.current) return;
    e.stopPropagation();
    onSelect(id);
    drag.current = {
      mode: "move",
      startClient: { x: e.clientX, y: e.clientY },
      startContent: [0, 0],
      orig: points.map(([x, y]) => [x, y] as Point),
      vIdx: -1,
    };
    moved.current = false;
  };

  const uiSw = 2 / view.scale;
  const strokeW = tenantStroke.width;
  const handleR = 5 / view.scale;

  const shellLive =
    live && live.id === SHELL_ID ? live.points : shell;
  const isShellSel = selectedId === SHELL_ID;
  const handlePts =
    tool === "select" && isShellSel && shellLive
      ? shellLive
      : tool === "select" && selectedId && selectedId !== SHELL_ID
        ? live && live.id === selectedId
          ? live.points
          : shapes.find((x) => x.id === selectedId)?.points ?? null
        : null;

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
        onDoubleClick={() => drawingPolyLike && closePoly()}
      >
        <defs>
          {shellLive && (
            <clipPath id="manual-shell">
              <path d={pathD(shellLive)} />
            </clipPath>
          )}
        </defs>
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

          {/* shell fill under units (clipped look) */}
          {shellLive && (
            <path
              d={pathD(shellLive)}
              fill="#ECECEC88"
              stroke="none"
              pointerEvents="none"
            />
          )}

          {/* units clipped to shell */}
          <g clipPath={shellLive ? "url(#manual-shell)" : undefined}>
            {shapes.map((s) => {
              const pts = live && live.id === s.id ? live.points : s.points;
              return (
                <path key={`f-${s.id}`} d={pathD(pts)} fill={s.fill} stroke="none" pointerEvents="none" />
              );
            })}
            {shapes.map((s) => {
              const pts = live && live.id === s.id ? live.points : s.points;
              const isSel = s.id === selectedId;
              const isHov = hovered === s.id;
              const stroke = isSel ? BRAND : isHov ? "#111827" : tenantStroke.color;
              const sw = isSel ? strokeW * 1.6 : strokeW;
              return (
                <path
                  key={`o-${s.id}`}
                  d={pathD(pts)}
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

          {/* shell black outline (drawn above units so perimeter stays visible) */}
          {shellLive && (
            <path
              d={pathD(shellLive)}
              fill="none"
              stroke={isShellSel ? BRAND : "#000000"}
              strokeWidth={isShellSel ? strokeW * 2 : Math.max(strokeW * 1.5, 2)}
              strokeLinejoin="miter"
              strokeLinecap="round"
              className={tool === "select" ? "cursor-move" : ""}
              pointerEvents={tool === "select" ? "stroke" : "none"}
              onMouseDown={(e) => beginMove(e, shellLive, SHELL_ID)}
            />
          )}

          {/* hit targets for units (outside clip so edges stay grabbable) */}
          {tool === "select" &&
            shapes.map((s) => {
              const pts = live && live.id === s.id ? live.points : s.points;
              return (
                <path
                  key={`h-${s.id}`}
                  d={pathD(pts)}
                  fill="transparent"
                  stroke="none"
                  className="cursor-move"
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => beginMove(e, s.points, s.id)}
                />
              );
            })}

          {/* vertex handles */}
          {handlePts &&
            handlePts.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={handleR}
                fill="#FFFFFF"
                stroke={BRAND}
                strokeWidth={uiSw}
                className="cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) =>
                  beginVertexDrag(e, handlePts, i, isShellSel ? SHELL_ID : selectedId!)
                }
              />
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

          {poly && poly.pts.length > 0 && (
            <g pointerEvents="none">
              <polyline
                points={[...poly.pts, poly.cur].map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="none"
                stroke={tool === "outline" ? "#111827" : BRAND}
                strokeWidth={uiSw}
                strokeDasharray={`${4 / view.scale} ${3 / view.scale}`}
              />
              {poly.pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={handleR}
                  fill={tool === "outline" ? "#111827" : BRAND}
                />
              ))}
            </g>
          )}
        </g>
      </svg>

      {drawingPolyLike && poly && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          {tool === "outline" ? "Outline" : "Polygon"} · {poly.pts.length} pts · ⌘Z undo point ·
          double-click or Enter to close · Esc cancel · Shift = straight
        </div>
      )}
    </div>
  );
}
