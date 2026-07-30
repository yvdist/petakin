"use client";
import { useRef, useState, useCallback, WheelEvent, MouseEvent } from "react";
import type { Config, Geometry } from "@/lib/types";
import { pathD } from "@/lib/geometry";

interface Props {
  geometry: Geometry;
  config: Config;
  floor: string;
  underlayUrl?: string | null;
  showUnderlay: boolean;
  underlayOpacity: number;
  selected: Set<string>;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onUnitClick: (id: string, additive: boolean) => void;
  onBackgroundClick: () => void;
}

export default function SvgCanvas({
  geometry,
  config,
  floor,
  underlayUrl,
  showUnderlay,
  underlayOpacity,
  selected,
  hovered,
  onHover,
  onUnitClick,
  onBackgroundClick,
}: Props) {
  const { canvas, badge, transform } = geometry;
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(20, Math.max(0.2, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) };
    });
  }, []);

  const onMouseDown = (e: MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    if (moved.current) {
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    }
  };
  const onMouseUp = () => {
    drag.current = null;
  };
  // background deselect: fires only when the click target is the svg itself
  // (unit paths call stopPropagation), and only when it wasn't a pan-drag.
  const onSvgClick = () => {
    if (!moved.current) onBackgroundClick();
  };
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  const uW = transform.srcW * transform.scale;
  const uH = transform.srcH * transform.scale;
  const uX = -transform.x0 * transform.scale + transform.pad;
  const uY = -transform.y0 * transform.scale + transform.pad;

  const sw = config.strokeWidth;

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
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={onSvgClick}
        onMouseLeave={() => (drag.current = null)}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {showUnderlay && underlayUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <image
              href={underlayUrl}
              x={uX}
              y={uY}
              width={uW}
              height={uH}
              opacity={underlayOpacity}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
          )}
          <g stroke="#FFFFFF" strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
            {geometry.shell.map((s) => (
              <path key={s.id} d={pathD(s.points)} fill={s.fill} pointerEvents="none" />
            ))}
            {geometry.units.map((u) => {
              const isSel = selected.has(u.id);
              const isHov = hovered === u.id;
              return (
                <path
                  key={u.id}
                  d={pathD(u.points)}
                  fill={u.fill}
                  stroke={isSel ? "#E5187F" : isHov ? "#111827" : "#FFFFFF"}
                  strokeWidth={isSel ? sw * 1.6 : sw}
                  className="cursor-pointer"
                  onMouseEnter={() => onHover(u.id)}
                  onMouseLeave={() => onHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!moved.current) onUnitClick(u.id, e.shiftKey || e.metaKey);
                  }}
                />
              );
            })}
          </g>
          <g>
            <circle
              cx={badge.cx}
              cy={badge.cy}
              r={config.badge.r}
              fill="none"
              stroke={config.badge.stroke}
              strokeWidth={config.badge.strokeWidth}
            />
            <text
              x={badge.cx}
              y={badge.cy + 38}
              textAnchor="middle"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight={700}
              fontSize={config.badge.fontSize}
              fill={config.badge.stroke}
            >
              {floor}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
