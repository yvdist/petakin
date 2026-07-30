// Client-side geometry editing: merge (polygon union), delete, recolor, stats.
import polygonClipping from "polygon-clipping";
import type { Geometry, Point, UnitGeom } from "./types";

export function pathD(points: Point[]): string {
  return "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z";
}

function shoelaceArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function recomputeStats(geo: Geometry): Geometry {
  const perCategory: Record<string, number> = {};
  let unitArea = 0;
  for (const u of geo.units) {
    perCategory[u.category] = (perCategory[u.category] ?? 0) + 1;
    unitArea += u.area;
  }
  const shellArea = geo.stats.shellArea || 1;
  return {
    ...geo,
    stats: {
      ...geo.stats,
      unitCount: geo.units.length,
      perCategory,
      unitArea,
      coverage: Math.round((unitArea / shellArea) * 1000) / 1000,
    },
  };
}

export function deleteUnits(geo: Geometry, ids: Set<string>): Geometry {
  return recomputeStats({ ...geo, units: geo.units.filter((u) => !ids.has(u.id)) });
}

export function updateUnit(geo: Geometry, id: string, patch: Partial<UnitGeom>): Geometry {
  return recomputeStats({
    ...geo,
    units: geo.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
  });
}

// Union selected units into one path. Merged unit inherits the first unit's
// category/family/fill; recomputes area (sum) + centroid.
export function mergeUnits(geo: Geometry, ids: Set<string>): Geometry {
  const chosen = geo.units.filter((u) => ids.has(u.id));
  if (chosen.length < 2) return geo;
  const polys = chosen.map((u) => [[...u.points, u.points[0]]] as [number, number][][]);
  let merged: ReturnType<typeof polygonClipping.union>;
  try {
    merged = polygonClipping.union(polys[0], ...polys.slice(1));
  } catch {
    return geo;
  }
  if (!merged.length) return geo;
  // pick the largest outer ring across the resulting multipolygon
  let best: Point[] = [];
  let bestArea = -1;
  for (const poly of merged) {
    const outer = poly[0].map(([x, y]) => [x, y] as Point);
    const a = shoelaceArea(outer);
    if (a > bestArea) {
      bestArea = a;
      best = outer;
    }
  }
  // polygon-clipping closes rings; drop the duplicate last point
  if (best.length > 1 && best[0][0] === best[best.length - 1][0] && best[0][1] === best[best.length - 1][1]) {
    best = best.slice(0, -1);
  }
  const base = chosen[0];
  const areaSum = chosen.reduce((s, u) => s + u.area, 0);
  const cx = chosen.reduce((s, u) => s + u.cx * u.area, 0) / areaSum;
  const cy = chosen.reduce((s, u) => s + u.cy * u.area, 0) / areaSum;
  const mergedUnit: UnitGeom = {
    ...base,
    id: `${base.category}-m${Math.round(cx)}${Math.round(cy)}`,
    area: areaSum,
    cx,
    cy,
    big: areaSum > chosen[0].area,
    points: best,
  };
  const rest = geo.units.filter((u) => !ids.has(u.id));
  return recomputeStats({ ...geo, units: [...rest, mergedUnit] });
}

// Rasterize an SVG string to a transparent PNG blob via canvas (scale = px multiplier).
export function svgToPngBlob(svg: string, viewW: number, viewH: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // data: URL is more reliable than blob: for SVG fills/strokes in some browsers
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewW * scale);
      canvas.height = Math.round(viewH * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return reject(new Error("no 2d ctx"));
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg image load failed"));
    img.src = url;
  });
}

export function download(filename: string, data: Blob | string, mime = "text/plain") {
  const type = mime.includes("svg") && !mime.includes("charset") ? `${mime};charset=utf-8` : mime;
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
