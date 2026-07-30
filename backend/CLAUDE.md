# CLAUDE.md — backend

Guidance for Claude Code when working in `backend/`. See `../CLAUDE.md` for the full-project picture.

## What this is

Stateless, pure segmentation service. Images + config go in, geometry JSON / SVG come out — no file paths, no globals, no persisted state. All editing state lives in the frontend. FastAPI + numpy + scipy.ndimage + opencv.

## Run

```bash
/opt/homebrew/bin/python3.13 -m venv .venv        # first time only
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: `curl -s http://127.0.0.1:8000/api/health` → `{"ok":true}`. No test suite; validate manually against real floor-plan images (acceptance: AEON 1F ≥ 100 units, < 10s/image).

## Files — `app/`
- `extractor.py` — core algorithm; `detect_palette()` and `extract(arr, config)`. Config-driven port of a validated reference CLI (Steps 1–6).
- `svg.py` — `emit_svg()`; normalized geometry → spec-exact grouped SVG.
- `presets.py` — baked AEON default preset (palette map + per-family hue lists + all params) and `DEFAULT_CONFIG`.
- `models.py` — pydantic request models. `main.py` — FastAPI routes + CORS.

Routes: `POST /api/detect` (image → palette swatches), `POST /api/process` (image + config → geometry JSON), `POST /api/export/svg` (edited geometry + config → SVG string), `GET /api/preset/default`, `GET /api/health`.

## The extraction algorithm (`extract()`, Steps 1–6)
1. **Palette** — exact-RGB frequency; colors with pixel share > 0.1% become swatches.
2. **Classify** — each pixel → nearest palette color (squared Euclidean RGB, done as P memory-light passes not a H×W×P broadcast); valid only if distance < `colorTolerance` (default 16), so anti-aliased separator pixels drop and neighbors don't merge.
3. **Units** — per family: opening (despeckle), closing for `areaFamilies` (large zones), connected components, drop `< minUnitArea`, fill small interior holes (removes text/icon remnants via `holeMaxArea`), drop components whose centroid sits inside a larger same-family component, contour + `approxPolyDP(simplify)`.
4. **Shell** — floor plate/corridor footprint, drawn beneath in `shellFill` (`#ECECEC`).
5. **Recolor** — big components + flat families get one category color (`big`); others cycle a per-family hue list (`var`) so neighbors differ.
6. **Normalize** — scale to `normalizedWidth` (1500), pad 26, right gutter 300 for badge. Also returns a source→normalized `transform` so the frontend can align the original raster as an underlay.

## Config / preset — the central contract
A preset is the full editable config: `paletteMap` (source hex → internal family), `var` (per-family hue lists), `big` (per-family flat color), plus params (`colorTolerance`, `minUnitArea`, `simplify`, `strokeWidth`, `normalizedWidth`, `pad`, `gutter`, badge, …). One preset drives all five floors of a mall so they stay identical.

The AEON preset is duplicated in **both** `app/presets.py` and `../frontend/lib/presets.ts` — keep the two in sync when changing defaults.

**Families vs categories**: internal `family` (`fnb`, `zone_yellow`, `anchor`, `ignore`, …) is fine-grained; coarse SVG `category` collapses all `zone_*` to `zone` (`family_to_category`). `family == "ignore"` skips a color. Category render order fixed in `svg.py` `CATEGORY_ORDER`.

## Gotchas
- Do **not** swap the per-color segmentation for generic potrace/ImageTracer — they trace text and produce fragmented paths.
- SVG must stay transparent: no `<image>`, no frame rect.
- PNG export and batch ZIP are frontend-side (canvas + JSZip) — no native cairo dep here; do not add one.
