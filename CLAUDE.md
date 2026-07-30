# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Petakin turns raster mall floor plans (colored-by-category screenshots full of unit-code text, facility icons, watermarks) into clean flat color-block SVGs: one `<path>` polygon per unit, solid fill, thin white separators, no text/icons, transparent background, floor-label badge. Built for repeatable batch use (5 floors × many malls) via **presets** so every floor of a mall stays style-identical.

Local-only, no third-party services. Validated against AEON Tebrau City (acceptance: floor 1F ≥ 100 units, < 10s/image, grouped named paths selectable per category in Figma).

## Run

Two terminals. Frontend proxies `/api/*` to the backend.

**Backend** (port 8000):
```bash
cd backend
/opt/homebrew/bin/python3.13 -m venv .venv        # first time only
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** (port 3000):
```bash
cd frontend
npm install                                        # first time only
npm run dev        # build: npm run build | lint: npm run lint
```

Override backend host with `PETAKIN_BACKEND=...` (read in `frontend/next.config.ts`). No test suite exists; validation is manual against real floor-plan images.

## Architecture

Split backend (segmentation algorithm) / frontend (interactive editor). The **backend is stateless and pure** — no file paths, no globals; images and config go in, geometry JSON comes out. All editing state lives in the frontend.

### Backend — `backend/app/`
- `extractor.py` — the core algorithm; `detect_palette()` and `extract(arr, config)`. Config-driven port of a validated reference CLI (Steps 1–6). Uses numpy + scipy.ndimage + opencv.
- `svg.py` — `emit_svg()`; turns normalized geometry into the spec-exact grouped SVG.
- `presets.py` — the baked AEON default preset (palette map + per-family hue lists + all params) and `DEFAULT_CONFIG`.
- `models.py` — pydantic request models. `main.py` — FastAPI routes + CORS.

Routes: `POST /api/detect` (image → palette swatches), `POST /api/process` (image + config → geometry JSON), `POST /api/export/svg` (edited geometry + config → SVG string), `GET /api/preset/default`, `GET /api/health`.

### Frontend — `frontend/` (Next.js App Router + TypeScript + Tailwind)
- `app/page.tsx` — single-floor editor: left control panel, right live SVG canvas. Owns all state; re-processes (debounced) on config/palette change.
- `app/batch/page.tsx` — batch mode; produces a ZIP of SVG + PNG per floor.
- `components/` — `Uploader`, `SwatchList`, `Sliders`, `HueEditor`, `StatsPanel`, `SvgCanvas` (zoom/pan/hover/select).
- `lib/api.ts` — backend wrappers. `lib/types.ts` — shared types mirroring backend geometry + preset schema. `lib/presets.ts` — AEON default config (mirrors `presets.py`) + localStorage preset store. `lib/geometry.ts` — client-side edits.

### The extraction algorithm (`extract()`, Steps 1–6)
1. **Palette** — exact-RGB frequency; colors with pixel share > 0.1% become swatches.
2. **Classify** — each pixel → nearest palette color (squared Euclidean RGB, done as P memory-light passes not a H×W×P broadcast); valid only if distance < `colorTolerance` (default 16), so anti-aliased separator pixels drop and neighbors don't merge.
3. **Units** — per family: opening (despeckle), closing for `areaFamilies` (large zones), connected components, drop `< minUnitArea`, fill small interior holes (removes text/icon remnants via `holeMaxArea`), drop components whose centroid sits inside a larger same-family component, contour + `approxPolyDP(simplify)`.
4. **Shell** — floor plate/corridor footprint, drawn beneath in `shellFill` (`#ECECEC`).
5. **Recolor** — big components + flat families get one category color (`big`); others cycle a per-family hue list (`var`) so neighbors differ.
6. **Normalize** — scale to `normalizedWidth` (1500), pad 26, right gutter 300 for badge. Also returns a source→normalized `transform` so the frontend can align the original raster as an underlay.

### Config / preset model — the central contract
A **preset is the full editable config**: `paletteMap` (source hex → internal family), `var` (per-family hue lists), `big` (per-family flat color), plus all params (`colorTolerance`, `minUnitArea`, `simplify`, `strokeWidth`, `normalizedWidth`, `pad`, `gutter`, badge, …). One preset drives all five floors of a mall so they stay identical. Presets live in browser localStorage (import/export as JSON); the AEON preset is the baked default and is duplicated in **both** `backend/app/presets.py` and `frontend/lib/presets.ts` — keep the two in sync when changing defaults.

**Families vs categories**: internal `family` (e.g. `fnb`, `zone_yellow`, `anchor`, `ignore`) is fine-grained; the coarse SVG/UI `category` collapses all `zone_*` to `zone` (`family_to_category` in the backend, `Category` in `lib/types.ts`). `family == "ignore"` skips a color entirely. Category render order is fixed in `svg.py` `CATEGORY_ORDER`.

### Frontend-only responsibilities
PNG export and batch ZIP are produced **client-side** (canvas + JSZip) — no native cairo dependency. Merge (polygon union via `polygon-clipping`), delete, and recolor are local post-process edits in `lib/geometry.ts`. **Reprocessing on any parameter/palette change re-runs the backend and resets local edits** — so merge/delete/recolor must be done last, right before export.

## Gotchas
- **Next.js**: `frontend/AGENTS.md` warns this Next.js version has breaking changes from training-data knowledge — read `node_modules/next/dist/docs/` before writing frontend framework code.
- Do **not** swap the per-color segmentation for generic potrace/ImageTracer — they trace text and produce fragmented paths. The color-family segmentation is far cleaner for mall plans.
- SVG must stay transparent: no `<image>`, no frame rect.
