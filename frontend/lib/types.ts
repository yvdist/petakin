// Shared types mirroring the backend geometry + preset schema.

export type Category =
  | "fnb"
  | "fashion"
  | "specialty"
  | "services"
  | "anchor"
  | "vacant"
  | "zone"
  | "ignore";

export const CATEGORIES: Category[] = [
  "fnb",
  "fashion",
  "specialty",
  "services",
  "anchor",
  "vacant",
  "zone",
  "ignore",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  fnb: "Food & Beverages",
  fashion: "Fashion & Accessories",
  specialty: "Specialty",
  services: "Services & Entertainment",
  anchor: "Anchor / Dept Store",
  vacant: "Vacant / Empty",
  zone: "Zone / Parking",
  ignore: "Ignore",
};

export interface Swatch {
  hex: string;
  share: number;
}

export interface PaletteEntry {
  hex: string;
  family: string; // internal family, e.g. fnb / zone_yellow
}

export interface BadgeConfig {
  r: number;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
}

export interface Config {
  paletteMap: PaletteEntry[];
  var: Record<string, string[]>;
  big: Record<string, string>;
  shellFill: string;
  colorTolerance: number;
  minUnitArea: number;
  simplify: number;
  strokeWidth: number;
  normalizedWidth: number;
  inputUpscale: number;
  rectangularize: boolean;
  rectFillThresh: number;
  upscale: number;
  smoothKernel: number;
  openKernel: number;
  familyMinPixels: number;
  pad: number;
  gutter: number;
  bigZoneFrac: number;
  shellAreaFrac: number;
  shellSimplify: number;
  closeAreaKernel: number;
  holeMaxArea: number;
  insideDrop: boolean;
  areaFamilies: string[];
  badge: BadgeConfig;
}

export interface Preset {
  name: string;
  config: Config;
}

export type Point = [number, number];

export interface UnitGeom {
  id: string;
  family: string;
  category: string;
  area: number;
  cx: number;
  cy: number;
  fill: string;
  big: boolean;
  points: Point[];
}

export interface ShellGeom {
  id: string;
  fill: string;
  area: number;
  points: Point[];
}

export interface Stats {
  unitCount: number;
  shellCount: number;
  perCategory: Record<string, number>;
  unitArea: number;
  shellArea: number;
  coverage: number;
  elapsed: number;
}

export interface Geometry {
  shell: ShellGeom[];
  units: UnitGeom[];
  canvas: { width: number; height: number; planWidth: number; gutter: number; pad: number };
  badge: { cx: number; cy: number };
  transform: { x0: number; y0: number; scale: number; pad: number; srcW: number; srcH: number };
  stats: Stats;
}
