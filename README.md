# Petakin — Floor Plan → Flat SVG

Turn raster mall floor plans (screenshot/PDF export, colored-by-category, full of
unit-code text + facility icons + watermarks) into clean **flat color-block SVGs**:
one `<path>` polygon per unit, solid fill, thin white separators, no text/icons,
transparent background, floor-label badge. Built for repeatable use — 5 floors per
mall, many malls — with **presets** so every floor stays style-identical.

Local-only. No third-party services.

## Stack

- **Backend** — Python + FastAPI. The validated segmentation-per-color algorithm
  (numpy / scipy.ndimage / opencv). Emits normalized geometry + grouped SVG.
- **Frontend** — Next.js (App Router) + TypeScript + Tailwind. Left control panel,
  right live SVG editor (zoom/pan, hover, click-edit, multi-select merge/delete,
  underlay overlay, stats). Batch mode → ZIP of SVG + PNG per floor.

```
backend/   app/{extractor,svg,presets,models,main}.py   requirements.txt
frontend/  app/{page,batch}  components/*  lib/{types,presets,api,geometry}.ts
```

## Run

Two terminals.

**Backend** (port 8000):
```bash
cd backend
/opt/homebrew/bin/python3.13 -m venv .venv        # first time only
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** (port 3000, proxies `/api/*` → backend):
```bash
cd frontend
npm install                                        # first time only
npm run dev
```

Open http://localhost:3000. Override backend host with `PETAKIN_BACKEND=...`.

## How it works (algorithm)

1. **Detect palette** — exact-RGB frequency; colors with share > 0.1% become swatches.
2. **Classify pixels** — nearest palette color (Euclidean RGB), valid only if distance
   `< colorTolerance` (default 16) so anti-aliased separator pixels drop and neighbors
   don't merge.
3. **Extract units** — per color family: opening (despeckle) + closing for large zones,
   connected components, drop `< minUnitArea`, fill small interior holes (kills text/icon
   remnants), drop components whose centroid sits inside a larger same-family component,
   contour + `approxPolyDP(simplify)`.
4. **Extract shell** — floor plate / corridor footprint, drawn beneath in `#ECECEC`.
5. **Recolor** — new color stays in the category's family, hue varied between neighbors;
   large zones use one flat family color.
6. **Normalize + emit** — scale to `normalizedWidth` (default 1500), pad 26, right gutter
   300 for the badge. Grouped SVG: `#shell`, `#units > cat-* > named paths (data-area)`,
   `#badge`. Transparent, no embedded raster.

Everything (palette map, per-family hue lists, all parameters, badge) lives in a **preset**
saved to `localStorage` (import/export as JSON). The AEON Tebrau City preset is the baked
default.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/detect` | image → detected palette swatches |
| POST | `/api/process` | image + config → geometry JSON (units/shell/stats) |
| POST | `/api/export/svg` | (edited) geometry + config → SVG string |
| GET | `/api/preset/default` | AEON default preset |

PNG export and batch ZIP are produced client-side (canvas + JSZip) — no native cairo dep.

## Validated against AEON Tebrau City

| Floor | Size | Units | Time |
|---|---|---|---|
| B | 1600×1276 | 7 | ~3s |
| GF | 1440×1226 | 96 | ~5s |
| 1F | 1600×1128 | **101** | ~4s |
| 2F | 1846×1242 | 97 | ~8s |
| RF | 1720×932 | 1 | ~3s |

Acceptance: 1F ≥ 100 units, transparent SVG (no `<image>`/frame), grouped named paths
(Figma-selectable per category), identical badge/stroke/scale across floors from one preset,
< 10s per image. B and RF are mostly parking zones, so few tenant units by design.

## Notes

- Do **not** use generic potrace/ImageTracer — they trace text and produce fragmented
  paths. The per-color segmentation here is far cleaner for mall plans.
- Reprocessing on a parameter/palette change re-runs the backend (debounced) and resets
  local edits. Merge/delete/recolor are local, post-process edits — do them last, then
  Export.
