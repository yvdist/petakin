// Manual mapping mode: hand-drawn vector shapes over a low-opacity denah.
// Pure client-side — model, localStorage store, seed-from-auto converter, and a
// TS port of backend svg.py emit_svg() so export needs no backend.
import type { Category, Geometry, Point } from "./types";
import { AEON_CONFIG } from "./presets";

export type ShapeKind = "rect" | "poly";

export interface ManualShape {
  id: string;
  kind: ShapeKind;
  points: Point[]; // image-pixel space; rect stored as its 4 corners
  category: Category;
  fill: string; // resolved hex (category default or custom override)
  name?: string;
}

export interface ManualProject {
  version: 1;
  floor: string;
  bg: { dataUrl: string; width: number; height: number; opacity: number };
  shapes: ManualShape[];
  updatedAt: number;
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

function shoelaceArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ---- export: normalize + emit spec-exact grouped SVG (port of svg.py) ----

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
  const sw = cfg.strokeWidth;
  const badge = cfg.badge;

  // bbox over all shape points (fall back to bg dims when empty)
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const s of project.shapes) {
    for (const [x, y] of s.points) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
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

  // build units grouped by category, per-category zero-padded counter
  const normedShapes = project.shapes.map((s) => ({ ...s, npoints: s.points.map(norm) }));
  const cats = CATEGORY_ORDER.filter((c) => normedShapes.some((s) => s.category === c));
  for (const s of normedShapes) if (!cats.includes(s.category)) cats.push(s.category);

  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">`,
    `  <title>${esc(title)} - ${esc(project.floor)}</title>`,
    `  <g id="units" stroke="#FFFFFF" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">`,
  ];
  for (const cat of cats) {
    o.push(`    <g id="cat-${cat}">`);
    let n = 0;
    for (const s of normedShapes) {
      if (s.category !== cat) continue;
      n += 1;
      const id = `${cat}-${String(n).padStart(2, "0")}`;
      const area = Math.round(shoelaceArea(s.npoints));
      o.push(
        `      <path id="${id}" data-area="${area}" data-family="${cat}" ` +
          `fill="${s.fill}" d="${d(s.npoints)}"/>`,
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
// Auto geometry is in normalized coords; invert geo.transform back to source
// image pixels so seeded shapes line up with the uploaded underlay.
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

// ---- localStorage store (single active project) ----

const KEY = "petakin.manual.v1";

export function newProject(floor: string): ManualProject {
  return {
    version: 1,
    floor,
    bg: { dataUrl: "", width: 0, height: 0, opacity: 0.4 },
    shapes: [],
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

// Persist project. bg dataURL can blow the ~5MB quota; on failure retry without
// it so shapes still survive a refresh (underlay just needs re-uploading).
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
