import type { ReactNode } from "react";
import FloorBadge from "./floor-badge";

type CanvasFrameProps = {
  children: ReactNode;
  /** mono labels rendered in the bottom strip, e.g. ["UNDERLAY 40%", "DRAW 100%"] */
  strip?: string[];
  /** small right-aligned status in the strip, e.g. "AUTOSAVED" */
  status?: string;
  /** show the magenta floor badge in the top-right corner */
  badge?: boolean;
  badgeLabel?: string;
  className?: string;
};

/**
 * The recurring "instrument" frame: hairline border, 6px radius, transparent
 * checkerboard backdrop, a floor badge, and a technical status strip. Media
 * (image/video) is passed as children and clipped to a 4/3 area.
 */
export default function CanvasFrame({
  children,
  strip,
  status,
  badge = true,
  badgeLabel = "1F",
  className = "",
}: CanvasFrameProps) {
  return (
    <figure className={`overflow-hidden rounded-md border border-hairline bg-surface ${className}`}>
      <div className="checkerboard-12 relative aspect-[4/3] overflow-hidden">
        {children}
        {badge && (
          <div className="absolute right-3 top-3">
            <FloorBadge label={badgeLabel} />
          </div>
        )}
      </div>
      {(strip || status) && (
        <figcaption className="flex items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface px-3 py-2 font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
          {strip?.map((s) => (
            <span key={s}>{s}</span>
          ))}
          {status && <span className="ml-auto text-primary">{status}</span>}
        </figcaption>
      )}
    </figure>
  );
}
