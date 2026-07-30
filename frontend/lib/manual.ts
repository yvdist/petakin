// Manual mapping mode: hand-drawn vector shapes over a low-opacity denah.
// Pure client-side — model, localStorage store, seed-from-auto converter, and a
// TS port of backend svg.py emit_svg() so export needs no backend.
import type { Category, Geometry, Point } from "./types";
import { AEON_CONFIG } from "./presets";

export type ShapeKind = "rect" | "poly";

/** Synthetic id for the outer shell when selected in the canvas. */
export const SHELL_ID = "__shell__";

/** Vertex with optional outgoing bezier handle (absolute coords). */
export type PolyVert = { p: Point; handleOut?: Point };

export interface ManualShape {
  id: string;
  kind: ShapeKind;
  points: Point[]; // image-pixel space; rect stored as its 4 corners (always synced)
  /** Bezier source-of-truth when present; anchors + optional handleOut. */
  verts?: PolyVert[];
  category: Category;
  fill: string; // resolved hex (category default or custom override)
  name?: string;
}

/** Tenant block stroke (white separators between units). */
export interface ManualStroke {
  color: string;
  width: number; // image-pixel space
}

export interface ManualProject {
  version: 1;
  floor: string;
  bg: { dataUrl: string; width: number; height: number; opacity: number };
  shapes: ManualShape[];
  /** Outer floor-plate polygon — clips units (optional). Flattened points. */
  shell?: Point[] | null;
  /** Bezier verts for shell when drawn with pen curves. */
  shellVerts?: PolyVert[] | null;
  /** Stroke for tenant rect/poly (default white). */
  stroke?: ManualStroke;
  updatedAt: number;
}

export const DEFAULT_STROKE: ManualStroke = { color: "#FFFFFF", width: 2 };

export function getStroke(project: ManualProject | null | undefined): ManualStroke {
  const s = project?.stroke;
  if (!s) return { ...DEFAULT_STROKE };
  return {
    color: typeof s.color === "string" && s.color ? s.color : DEFAULT_STROKE.color,
    width: Math.max(1, Math.min(12, Number(s.width) || DEFAULT_STROKE.width)),
  };
}

// Categories a user can actually draw with (ignore is auto-only).
export const DRAW_CATEGORIES: Category[] = [
  "fnb",
  "fashion",
  "specialty",
  "services",
  "anchor",
  "vacant",
  "zone",
];

// One flat color per category — mirrors the AEON preset `big` map so manual
// output stays visually consistent with the auto pipeline and across floors.
export const CATEGORY_COLORS: Record<Category, string> = {
  fnb: AEON_CONFIG.big.fnb,
  fashion: AEON_CONFIG.big.fashion,
  specialty: AEON_CONFIG.big.specialty,
  services: AEON_CONFIG.big.services,
  anchor: AEON_CONFIG.big.anchor,
  vacant: AEON_CONFIG.big.vacant,
  zone: AEON_CONFIG.big.zone_yellow,
  ignore: "#CCCCCC",
};

// stable category render order (shell first below) — matches svg.py CATEGORY_ORDER
const CATEGORY_ORDER: Category[] = [
  "anchor",
  "vacant",
  "zone",
  "specialty",
  "services",
  "fashion",
  "fnb",
];

let idCounter = 0;
export function newShapeId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter}`;
}

export function defaultFill(cat: Category): string {
  return CATEGORY_COLORS[cat] ?? "#CCCCCC";
}

export function shapeVerts(s: Pick<ManualShape, "points" | "verts">): PolyVert[] {
  if (s.verts && s.verts.length >= 2) return s.verts;
  return s.points.map((p) => ({ p }));
}

export function shellVertsOf(project: ManualProject): PolyVert[] | null {
  if (project.shellVerts && project.shellVerts.length >= 3) return project.shellVerts;
  if (project.shell && project.shell.length >= 3) return project.shell.map((p) => ({ p }));
  return null;
}

export function syncShapeFromVerts(verts: PolyVert[]): { verts: PolyVert[]; points: Point[] } {
  return { verts, points: flattenPolyVerts(verts) };
}

export function pathDFromVerts(verts: PolyVert[]): string {
  if (verts.length === 0) return "";
  const parts: string[] = [`M${verts[0].p[0].toFixed(1)},${verts[0].p[1].toFixed(1)}`];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!a.handleOut && !b.handleOut) {
      parts.push(`L${b.p[0].toFixed(1)},${b.p[1].toFixed(1)}`);
    } else {
      const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
      const c2 = b.handleOut
        ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
        : lerpPt(a.p, b.p, 2 / 3);
      parts.push(
        `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${b.p[0].toFixed(1)},${b.p[1].toFixed(1)}`,
      );
    }
  }
  parts.push("Z");
  return parts.join("");
}

/** Closest point on segment a→b to p; returns distance squared and t in [0,1]. */
export function distToSegment(p: Point, a: Point, b: Point): { dist2: number; t: number; q: Point } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Point = [a[0] + t * dx, a[1] + t * dy];
  const ddx = p[0] - q[0];
  const ddy = p[1] - q[1];
  return { dist2: ddx * ddx + ddy * ddy, t, q };
}

/** Find nearest edge of a closed vert ring within maxDist (content units). */
export function nearestEdge(
  p: Point,
  verts: PolyVert[],
  maxDist: number,
): { index: number; q: Point; dist: number } | null {
  if (verts.length < 2) return null;
  let best: { index: number; q: Point; dist: number } | null = null;
  const max2 = maxDist * maxDist;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i].p;
    const b = verts[(i + 1) % verts.length].p;
    const { dist2, q } = distToSegment(p, a, b);
    if (dist2 <= max2 && (!best || dist2 < best.dist * best.dist)) {
      best = { index: i, q, dist: Math.sqrt(dist2) };
    }
  }
  return best;
}

export function insertVertOnEdge(verts: PolyVert[], edgeIndex: number, q: Point): PolyVert[] {
  const next: PolyVert[] = verts.map((v) => ({
    p: [v.p[0], v.p[1]] as Point,
    ...(v.handleOut ? { handleOut: [v.handleOut[0], v.handleOut[1]] as Point } : {}),
  }));
  // break curve: clear handleOut on the edge start so new corner is sharp
  next[edgeIndex] = { p: next[edgeIndex].p };
  next.splice(edgeIndex + 1, 0, { p: q });
  return next;
}

/** Draft helpers below — cubic sampling for sync/export. */

function lerpPt(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return [
    uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0],
    uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1],
  ];
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(cubicAt(p0, p1, p2, p3, i / n));
  return out;
}

/** Densify pen verts (with optional handles) into a closed-ready polyline. */
export function flattenPolyVerts(verts: PolyVert[], samplesPerCurve = 12): Point[] {
  if (verts.length === 0) return [];
  if (verts.length === 1) return [verts[0].p];

  const appendSegment = (out: Point[], a: PolyVert, b: PolyVert) => {
    if (!a.handleOut && !b.handleOut) {
      out.push(b.p);
      return;
    }
    const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
    const c2 = b.handleOut
      ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
      : lerpPt(a.p, b.p, 2 / 3);
    const pts = sampleCubic(a.p, c1, c2, b.p, samplesPerCurve);
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
  };

  const out: Point[] = [verts[0].p];
  for (let i = 0; i < verts.length - 1; i++) appendSegment(out, verts[i], verts[i + 1]);
  // closing segment last → first
  appendSegment(out, verts[verts.length - 1], verts[0]);
  // drop duplicate close point (equals first) if last ≈ first
  if (out.length > 1) {
    const last = out[out.length - 1];
    const first = out[0];
    if (Math.abs(last[0] - first[0]) < 1e-6 && Math.abs(last[1] - first[1]) < 1e-6) out.pop();
  }
  return out.filter(
    (p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1],
  );
}

/** Open preview path (no close) for in-progress pen + rubber-band to cursor. */
export function flattenPolyVertsOpen(verts: PolyVert[], rubber?: Point, samplesPerCurve = 12): Point[] {
  if (verts.length === 0) return rubber ? [rubber] : [];
  const out: Point[] = [verts[0].p];
  const appendSegment = (a: PolyVert, b: PolyVert) => {
    if (!a.handleOut && !b.handleOut) {
      out.push(b.p);
      return;
    }
    const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
    const c2 = b.handleOut
      ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
      : lerpPt(a.p, b.p, 2 / 3);
    const pts = sampleCubic(a.p, c1, c2, b.p, samplesPerCurve);
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
  };
  for (let i = 0; i < verts.length - 1; i++) appendSegment(verts[i], verts[i + 1]);
  if (rubber) {
    const last = verts[verts.length - 1];
    if (last.handleOut) {
      const c1 = last.handleOut;
      const c2 = lerpPt(last.p, rubber, 2 / 3);
      const pts = sampleCubic(last.p, c1, c2, rubber, samplesPerCurve);
      for (let i = 1; i < pts.length; i++) out.push(pts[i]);
    } else {
      out.push(rubber);
    }
  }
  return out;
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

// ---- export: normalize + emit grouped SVG ----

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function d(points: Point[]): string {
  return "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z";
}

export function emitManualSvg(
  project: ManualProject,
  title = "Petakin",
): { svg: string; width: number; height: number } {
  const cfg = AEON_CONFIG;
  const pad = cfg.pad;
  const gutter = cfg.gutter;
  const targetW = cfg.normalizedWidth;
  const stroke = getStroke(project);
  const badge = cfg.badge;
  const shellPts = project.shell && project.shell.length >= 3 ? project.shell : null;

  // bbox over shell + shapes (fall back to bg dims when empty)
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const consider = (pts: Point[]) => {
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  };
  if (shellPts) consider(shellPts);
  for (const s of project.shapes) consider(s.points);
  if (!isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = project.bg.width || targetW;
    y1 = project.bg.height || targetW;
  }
  const spanX = Math.max(1, x1 - x0);
  const spanY = Math.max(1, y1 - y0);
  const scale = targetW / spanX;
  const norm = (p: Point): Point => [(p[0] - x0) * scale + pad, (p[1] - y0) * scale + pad];

  const planWidth = targetW + 2 * pad;
  const W = planWidth + gutter;
  const H = Math.max(spanY * scale + 2 * pad, 330);
  const bcx = planWidth + gutter / 2;
  const bcy = 150;

  const normedShapes = project.shapes.map((s) => ({ ...s, npoints: s.points.map(norm) }));
  const cats = CATEGORY_ORDER.filter((c) => normedShapes.some((s) => s.category === c));
  for (const s of normedShapes) if (!cats.includes(s.category)) cats.push(s.category);

  const strokeHex = stroke.color;
  const strokeW = stroke.width * scale;
  const shellStrokeW = Math.max(strokeW * 1.5, 2 * scale);
  const shellNorm = shellPts ? shellPts.map(norm) : null;

  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">`,
    `  <title>${esc(title)} - ${esc(project.floor)}</title>`,
  ];

  if (shellNorm) {
    o.push(`  <defs>`);
    o.push(`    <clipPath id="shell">`);
    o.push(`      <path d="${d(shellNorm)}"/>`);
    o.push(`    </clipPath>`);
    o.push(`  </defs>`);
    o.push(`  <g id="shell">`);
    o.push(
      `    <path fill="${cfg.shellFill}" stroke="#000000" stroke-width="${shellStrokeW.toFixed(2)}" ` +
        `stroke-linejoin="miter" stroke-linecap="round" d="${d(shellNorm)}"/>`,
    );
    o.push(`  </g>`);
  }

  const clipAttr = shellNorm ? ` clip-path="url(#shell)"` : "";
  o.push(`  <g id="units"${clipAttr}>`);
  for (const cat of cats) {
    o.push(`    <g id="cat-${cat}">`);
    let n = 0;
    for (const s of normedShapes) {
      if (s.category !== cat) continue;
      n += 1;
      const id = `${cat}-${String(n).padStart(2, "0")}`;
      const area = Math.round(shoelaceArea(s.npoints));
      const dd = d(s.npoints);
      o.push(
        `      <path id="${id}" data-area="${area}" data-family="${cat}" ` +
          `fill="${s.fill}" stroke="none" d="${dd}"/>`,
      );
      o.push(
        `      <path data-stroke-for="${id}" fill="none" stroke="${strokeHex}" ` +
          `stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="round" ` +
          `stroke-linecap="round" d="${dd}"/>`,
      );
    }
    o.push(`    </g>`);
  }
  o.push(`  </g>`);

  o.push(`  <g id="badge">`);
  o.push(
    `    <circle cx="${bcx.toFixed(0)}" cy="${bcy}" r="${badge.r}" fill="none" ` +
      `stroke="${badge.stroke}" stroke-width="${badge.strokeWidth}"/>`,
  );
  o.push(
    `    <text x="${bcx.toFixed(0)}" y="${bcy + 38}" text-anchor="middle" ` +
      `font-family="Arial, Helvetica, sans-serif" font-weight="700" ` +
      `font-size="${badge.fontSize}" fill="${badge.stroke}">${esc(project.floor)}</text>`,
  );
  o.push(`  </g>`);
  o.push(`</svg>`);

  return { svg: o.join("\n"), width: W, height: H };
}

// ---- seed from the auto pipeline: geometry.units -> editable shapes ----
export function seedFromGeometry(geo: Geometry): ManualShape[] {
  const t = geo.transform;
  const toSrc = (p: Point): Point => [(p[0] - t.pad) / t.scale + t.x0, (p[1] - t.pad) / t.scale + t.y0];
  return geo.units.map((u) => {
    const cat = (DRAW_CATEGORIES as string[]).includes(u.category)
      ? (u.category as Category)
      : "specialty";
    return {
      id: newShapeId(),
      kind: "poly" as ShapeKind,
      points: u.points.map(toSrc),
      category: cat,
      fill: u.fill,
      name: u.id,
    };
  });
}

/** Optional: invert auto shell into manual shell points (source image space). */
export function shellFromGeometry(geo: Geometry): Point[] | null {
  const ring = geo.shell?.[0]?.points;
  if (!ring || ring.length < 3) return null;
  const t = geo.transform;
  return ring.map(([x, y]) => [(x - t.pad) / t.scale + t.x0, (y - t.pad) / t.scale + t.y0] as Point);
}

// ---- localStorage store (single active project) ----

const KEY = "petakin.manual.v1";

export function newProject(floor: string): ManualProject {
  return {
    version: 1,
    floor,
    bg: { dataUrl: "", width: 0, height: 0, opacity: 0.4 },
    shapes: [],
    shell: null,
    shellVerts: null,
    stroke: { ...DEFAULT_STROKE },
    updatedAt: Date.now(),
  };
}

export function loadProject(): ManualProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ManualProject;
  } catch {
    return null;
  }
}

export function saveProject(project: ManualProject): { ok: boolean; bgDropped: boolean } {
  if (typeof window === "undefined") return { ok: false, bgDropped: false };
  const withTs = { ...project, updatedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(withTs));
    return { ok: true, bgDropped: false };
  } catch {
    try {
      const lite = { ...withTs, bg: { ...withTs.bg, dataUrl: "" } };
      localStorage.setItem(KEY, JSON.stringify(lite));
      return { ok: true, bgDropped: true };
    } catch {
      return { ok: false, bgDropped: false };
    }
  }
}

export function clearProject(): void {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
