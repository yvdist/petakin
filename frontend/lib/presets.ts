// AEON default preset (mirrors backend presets.py) + localStorage store.
import type { Config, Preset, Category } from "./types";

export const AEON_CONFIG: Config = {
  paletteMap: [
    { hex: "#F8D899", family: "fnb" },
    { hex: "#DAE4A4", family: "fashion" },
    { hex: "#C2E0F4", family: "specialty" },
    { hex: "#D1B9D1", family: "services" },
    { hex: "#EED4E1", family: "anchor" },
    { hex: "#E1D4E4", family: "zone_purple" },
    { hex: "#F4F0C4", family: "zone_yellow" },
    { hex: "#ACD4B9", family: "zone_green" },
    { hex: "#A2CCEA", family: "zone_blue" },
    { hex: "#848388", family: "vacant" },
    { hex: "#EBB17B", family: "zone_orange" },
    { hex: "#D6D4B2", family: "zone_yellow" },
    { hex: "#EAEAEA", family: "ignore" },
    { hex: "#DCDCDC", family: "ignore" },
    { hex: "#FFFFFF", family: "ignore" },
    { hex: "#B8B8B8", family: "ignore" },
  ],
  var: {
    fnb: ["#F2A03C", "#E8842E", "#F5B85E", "#D9762A", "#F09A56", "#E5A63A", "#FFC073", "#DE8C3E"],
    fashion: ["#8CC63F", "#63B24A", "#A9CE5C", "#4E9E55", "#7DBF6A", "#B6D35F", "#5FA83F", "#98C97E"],
    specialty: ["#4FBBE8", "#2E9FD6", "#6FD0EE", "#3D8FCC", "#57C7DA", "#82D8F2", "#2BB3C9", "#5AA8E0"],
    services: ["#A97FD1", "#8E63C4", "#C097E0", "#7A5BB5", "#B589DC", "#9B6FCF", "#CBA6E8", "#8874C6"],
    vacant: ["#9E9E9E", "#8C8C8C", "#ADADAD"],
    anchor: ["#F2A7CB"],
    zone_purple: ["#C9A9DC"],
    zone_yellow: ["#F2E888"],
    zone_green: ["#8FCBA6"],
    zone_blue: ["#7FC1E8"],
    zone_orange: ["#EDA062"],
  },
  big: {
    fnb: "#E8842E", fashion: "#8CC63F", specialty: "#4FBBE8", services: "#C9A9DC",
    vacant: "#8A8A93", anchor: "#F2A7CB", zone_purple: "#C9A9DC", zone_yellow: "#F2E888",
    zone_green: "#8FCBA6", zone_blue: "#7FC1E8", zone_orange: "#EDA062",
  },
  shellFill: "#ECECEC",
  colorTolerance: 16,
  minUnitArea: 50,
  simplify: 2.0,
  strokeWidth: 6,
  normalizedWidth: 1500,
  inputUpscale: 2,
  rectangularize: true,
  rectFillThresh: 0.62,
  upscale: 2,
  smoothKernel: 6,
  openKernel: 2,
  familyMinPixels: 150,
  pad: 26,
  gutter: 300,
  bigZoneFrac: 0.05,
  shellAreaFrac: 0.004,
  shellSimplify: 2.6,
  closeAreaKernel: 21,
  holeMaxArea: 4000,
  insideDrop: true,
  areaFamilies: ["zone_yellow", "zone_green", "zone_blue", "zone_orange", "zone_purple", "anchor", "vacant"],
  badge: { r: 88, stroke: "#E5187F", strokeWidth: 8, fontSize: 105 },
};

export const AEON_PRESET: Preset = { name: "AEON Tebrau City", config: AEON_CONFIG };

// map an internal family -> coarse UI category
export function familyToCategory(fam: string): Category {
  if (fam === "ignore") return "ignore";
  if (fam.startsWith("zone")) return "zone";
  return fam as Category;
}

const KEY = "petakin.presets.v1";

export function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [AEON_PRESET];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [AEON_PRESET];
    const arr = JSON.parse(raw) as Preset[];
    return arr.some((p) => p.name === AEON_PRESET.name) ? arr : [AEON_PRESET, ...arr];
  } catch {
    return [AEON_PRESET];
  }
}

export function savePreset(preset: Preset): Preset[] {
  const presets = loadPresets().filter((p) => p.name !== preset.name);
  const next = [...presets, preset];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deletePreset(name: string): Preset[] {
  const next = loadPresets().filter((p) => p.name !== name);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function cloneConfig(c: Config): Config {
  return JSON.parse(JSON.stringify(c));
}
