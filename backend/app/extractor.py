"""Floor-plan raster -> flat color-block geometry.

Config-driven refactor of the validated reference CLI (Steps 1-6).
Pure functions: no file paths, no globals. Returns normalized geometry
so the frontend can render + edit directly and the backend can emit SVG.
"""
from __future__ import annotations

import time
from typing import Any

import cv2
import numpy as np
from scipy import ndimage as ndi


# ---------------------------------------------------------------- helpers

def hex2rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def family_to_category(fam: str) -> str:
    """Coarse UI/SVG group. All zone_* collapse to 'zone'."""
    return "zone" if fam.startswith("zone") else fam


def _morph(mask: np.ndarray, op: int, k: int) -> np.ndarray:
    """Fast boolean morphology via OpenCV.

    scipy.ndimage.binary_* is O(N*K^2) and takes ~10s for a 42px kernel on an
    upscaled image; cv2.morphologyEx does the same in ~0.2s. Used for the large
    area-family closing and shell open/close where kernels get big after upscale.
    """
    u = mask.astype(np.uint8)
    ker = np.ones((k, k), np.uint8)
    return cv2.morphologyEx(u, op, ker).astype(bool)


def _contours_of(mask, eps, min_area, hole_max_area, upscale=1, smooth_k=0,
                 rectangularize=False, rect_fill=0.82):
    """Connected components -> simplified external contours.

    Fills small interior holes (unit-code text / icons) before tracing.

    Anti-jaggedness: each component mask is supersampled (upscale) so the 1px
    pixel staircase becomes a sub-pixel ramp, then smoothed with an elliptical
    open+close (smooth_k) so serration is shaved symmetrically. approxPolyDP runs
    in the upscaled domain (eps*upscale) and points are divided back, so real
    corners stay sharp while stairsteps collapse to straight edges.

    Rectangularize: when a component fills >= rect_fill of its minAreaRect it is a
    tenant box; snap it to the rect's 4 corners for crisp reference-like edges.
    L-shapes / corridors / shell (low fill ratio) keep the smoothed polygon.

    Smoothing is scaled to component size so tiny units aren't rounded to blobs.

    Labelling + area thresholds stay in native pixels; only geometry is upscaled.
    """
    upscale = max(1, int(upscale))
    smooth_k = max(0, int(smooth_k))
    out = []
    lab, n = ndi.label(mask)
    slices = ndi.find_objects(lab)
    for i in range(1, n + 1):
        sl = slices[i - 1]
        if sl is None:
            continue
        # work inside the component's bounding box, not the whole image
        comp = lab[sl] == i
        a = int(comp.sum())
        if a < min_area:
            continue
        filled = ndi.binary_fill_holes(comp)
        holes = filled & ~comp
        hl, hn = ndi.label(holes)
        if hn:
            sizes = ndi.sum(holes, hl, range(1, hn + 1))
            keep = np.zeros(hn + 1, bool)
            keep[1:] = np.array(sizes) < hole_max_area
            comp = comp | keep[hl]
        u = (comp * 255).astype(np.uint8)
        if upscale > 1:
            u = cv2.resize(u, None, fx=upscale, fy=upscale,
                           interpolation=cv2.INTER_LINEAR)
            u = np.where(u >= 128, 255, 0).astype(np.uint8)
        # smoothing kernel capped to component size: big zones smooth fully,
        # tiny tenant units barely (they get rectangularized anyway)
        if smooth_k > 0:
            bb = min(comp.shape) * upscale
            sk = min(smooth_k, max(1, int(bb * 0.12)))
            ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (sk, sk))
            u = cv2.morphologyEx(u, cv2.MORPH_OPEN, ker)
            u = cv2.morphologyEx(u, cv2.MORPH_CLOSE, ker)
        cs, _ = cv2.findContours(u, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cs:
            continue
        c = max(cs, key=cv2.contourArea)   # area re-checked on native `a` above
        snapped = None
        if rectangularize:
            rect = cv2.minAreaRect(c)      # rotated rect (plan is slightly rotated)
            rw, rh = rect[1]
            if rw * rh > 0 and cv2.contourArea(c) / (rw * rh) >= rect_fill:
                snapped = cv2.boxPoints(rect).astype(float)   # 4 clean corners
        if snapped is not None:
            p = snapped / upscale
        else:
            # eps scaled to upscaled domain; points divided back to native coords
            p = cv2.approxPolyDP(c, eps * upscale, True).reshape(-1, 2).astype(float) / upscale
        if len(p) < 3:
            continue
        oy, ox = sl[0].start, sl[1].start   # bbox origin -> back to full-image coords
        p[:, 0] += ox
        p[:, 1] += oy
        ys, xs = np.nonzero(comp)
        out.append({"pts": p, "area": a,
                    "cx": float(xs.mean()) + ox, "cy": float(ys.mean()) + oy})
    return out


# ---------------------------------------------------------------- palette detect (Step 1)

def detect_palette(arr: np.ndarray, min_share: float = 0.001, max_swatches: int = 40):
    """Exact-RGB frequency; keep colors with pixel share > min_share."""
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3).astype(np.uint8)
    packed = (flat[:, 0].astype(np.uint32) << 16) | (flat[:, 1].astype(np.uint32) << 8) | flat[:, 2].astype(np.uint32)
    vals, counts = np.unique(packed, return_counts=True)
    total = h * w
    order = np.argsort(-counts)
    swatches = []
    for j in order:
        share = counts[j] / total
        if share <= min_share:
            break
        v = int(vals[j])
        hexc = "#%02X%02X%02X" % ((v >> 16) & 255, (v >> 8) & 255, v & 255)
        swatches.append({"hex": hexc, "share": round(float(share), 5)})
        if len(swatches) >= max_swatches:
            break
    return swatches


# ---------------------------------------------------------------- extraction (Steps 2-5)

DEFAULT_AREA_FAMILIES = ("zone_yellow", "zone_green", "zone_blue", "zone_orange",
                         "zone_purple", "anchor", "vacant")


def extract(arr: np.ndarray, config: dict[str, Any]) -> dict[str, Any]:
    t0 = time.perf_counter()
    arr = arr.astype(float)

    # ---- input upscale (Step 0): resolve small tenant boxes at low source res ----
    # NEAREST is mandatory: linear/cubic invent intermediate colors that fail the
    # exact-RGB classification below. It duplicates pixels (no new detail) but lets
    # tiny units survive morphology/area gates and gives minAreaRect cleaner input.
    #
    # Resolution-aware: never multiply a large image past WORK_CAP (a blind x2 on a
    # 6400px HD upload = 115M px = multi-GB OOM = 500). Small sources still upscale;
    # already-HD sources fall back to in_up=1 (they process fine at native res).
    in_up_req = max(1, int(config.get("inputUpscale", 2)))
    H0, W0, _ = arr.shape
    long0 = max(H0, W0)
    work_cap = int(config.get("workCap", 4500))
    in_up = max(1, min(in_up_req, work_cap // long0)) if long0 <= work_cap else 1
    if in_up > 1:
        arr = cv2.resize(arr.astype(np.uint8), None, fx=in_up, fy=in_up,
                         interpolation=cv2.INTER_NEAREST).astype(float)
    elif long0 > 2 * work_cap:
        # pathological upload (> 9000px): downscale to bound memory. NEAREST keeps
        # palette-ish colors; a soft upscale has no real detail to lose anyway.
        # in_up stays 1, so param scaling + transform below map to these coords.
        ds = (2 * work_cap) / long0
        arr = cv2.resize(arr.astype(np.uint8), None, fx=ds, fy=ds,
                         interpolation=cv2.INTER_NEAREST).astype(float)
    H, W, _ = arr.shape

    palette_map = config["paletteMap"]            # [{hex, family}, ...]
    var = config["var"]
    big = config["big"]
    shell_fill = config.get("shellFill", "#ECECEC")
    tol = float(config.get("colorTolerance", 16))
    # pixel-area/kernel params are native-terms; scale to the upscaled domain
    min_unit_area = int(config.get("minUnitArea", 80)) * in_up * in_up
    eps = float(config.get("simplify", 1.4))
    hole_max = int(config.get("holeMaxArea", 4000)) * in_up * in_up
    big_frac = float(config.get("bigZoneFrac", 0.05))
    shell_frac = float(config.get("shellAreaFrac", 0.004))
    shell_eps = float(config.get("shellSimplify", 1.6))
    close_k = int(config.get("closeAreaKernel", 21)) * in_up
    area_families = set(config.get("areaFamilies", DEFAULT_AREA_FAMILIES))
    inside_drop = bool(config.get("insideDrop", True))
    upscale = int(config.get("upscale", 3))
    smooth_k = int(config.get("smoothKernel", 5))
    open_k = int(config.get("openKernel", 3)) * in_up
    fam_gate = int(config.get("familyMinPixels", 150)) * in_up * in_up
    rectangularize = bool(config.get("rectangularize", True))
    rect_fill = float(config.get("rectFillThresh", 0.62))

    pal = np.stack([hex2rgb(e["hex"]) for e in palette_map]).astype(np.float32)
    # nearest palette color per pixel, memory-light: P passes over H*W
    # (avoids a H*W*P*3 broadcast that costs hundreds of MB and seconds).
    # float32 halves the big allocations vs float64 (matters for HD inputs).
    flat = arr.reshape(-1, 3).astype(np.float32)
    best = np.full(flat.shape[0], np.inf, np.float32)
    idx_flat = np.zeros(flat.shape[0], np.int32)
    for k, c in enumerate(pal):
        diff = flat - c   # c is float32 -> diff stays float32
        dd = np.einsum("ij,ij->i", diff, diff)   # squared distance
        m = dd < best
        best[m] = dd[m]
        idx_flat[m] = k
    idx = idx_flat.reshape(H, W)
    valid = best.reshape(H, W) < tol * tol

    # ---- shell / floor plate (Step 4) ----
    ink = np.linalg.norm(arr - 255, axis=2) > 26
    ink = ndi.binary_fill_holes(ink)
    ink = _morph(ink, cv2.MORPH_OPEN, 5 * in_up)
    lab, n = ndi.label(ink)
    if n:
        sizes = ndi.sum(ink, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = np.array(sizes) > shell_frac * H * W
        ink = keep[lab]
    ink = _morph(ink, cv2.MORPH_CLOSE, 7 * in_up)
    shell = _contours_of(ink, shell_eps, shell_frac * H * W, hole_max,
                         upscale=upscale, smooth_k=smooth_k,
                         rectangularize=False)   # footprint is never a rectangle

    # ---- units (Step 3) ----
    units = []
    for k, entry in enumerate(palette_map):
        fam = entry["family"]
        if fam == "ignore":
            continue
        m = (idx == k) & valid
        if m.sum() < fam_gate:
            continue
        if open_k > 1:
            m = _morph(m, cv2.MORPH_OPEN, open_k)
        if fam in area_families:
            m = _morph(m, cv2.MORPH_CLOSE, close_k)
        for c in _contours_of(m, eps, min_unit_area, hole_max,
                              upscale=upscale, smooth_k=smooth_k,
                              rectangularize=rectangularize, rect_fill=rect_fill):
            c["fam"] = fam
            units.append(c)

    # drop components whose centroid sits inside a larger same-family component
    if inside_drop:
        units.sort(key=lambda u: -u["area"])
        kept = []
        for u in units:
            inside = False
            for v in kept:
                if v["fam"] != u["fam"] or v["area"] <= u["area"]:
                    continue
                if cv2.pointPolygonTest(v["pts"].astype(np.float32),
                                        (float(u["cx"]), float(u["cy"])), False) >= 0:
                    inside = True
                    break
            if not inside:
                kept.append(u)
        units = kept

    # ---- recolor (Step 5) ----
    plan_area = float(ink.sum()) or 1.0
    for u in units:
        u["big"] = u["area"] > big_frac * plan_area
    units.sort(key=lambda u: (u["cx"] + u["cy"]))
    ctr: dict[str, int] = {}
    flat_families = set(big.keys()) - {"fnb", "fashion", "specialty", "services", "vacant"}
    for u in units:
        f = u["fam"]
        # big components + zone/anchor families use a single flat category color
        if u["big"] or f in flat_families:
            u["fill"] = big.get(f, "#CCCCCC")
        else:
            i = ctr.get(f, 0)
            ctr[f] = i + 1
            hues = var.get(f) or [big.get(f, "#CCCCCC")]
            u["fill"] = hues[i % len(hues)]
    units.sort(key=lambda u: -u["area"])

    # ---- normalize geometry (Step 6) ----
    target_w = float(config.get("normalizedWidth", 1500))
    pad = float(config.get("pad", 26))
    gutter = float(config.get("gutter", 300))
    allpts = np.vstack([s["pts"] for s in shell] + [u["pts"] for u in units]) if (shell or units) else np.zeros((1, 2))
    x0, y0 = allpts.min(0)
    x1, y1 = allpts.max(0)
    span_x = (x1 - x0) or 1.0
    s = target_w / span_x

    def norm(pts):
        q = (pts - [x0, y0]) * s + pad
        return [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in q]

    ph = (y1 - y0) * s + pad * 2
    pw = target_w + pad * 2
    canvas_w = pw + gutter
    canvas_h = max(ph, 330.0)

    out_shell = [{
        "id": f"shell-{i + 1}",
        "fill": shell_fill,
        "area": s0["area"],
        "points": norm(s0["pts"]),
    } for i, s0 in enumerate(shell)]

    cat_ctr: dict[str, int] = {}
    out_units = []
    for u in units:
        cat = family_to_category(u["fam"])
        cat_ctr[cat] = cat_ctr.get(cat, 0) + 1
        out_units.append({
            "id": f"{cat}-{cat_ctr[cat]:02d}",
            "family": u["fam"],
            "category": cat,
            "area": u["area"],
            "cx": round(u["cx"], 1),
            "cy": round(u["cy"], 1),
            "fill": u["fill"],
            "big": bool(u["big"]),
            "points": norm(u["pts"]),
        })

    # stats
    per_cat: dict[str, int] = {}
    for u in out_units:
        per_cat[u["category"]] = per_cat.get(u["category"], 0) + 1
    unit_area = sum(u["area"] for u in out_units)
    stats = {
        "unitCount": len(out_units),
        "shellCount": len(out_shell),
        "perCategory": per_cat,
        "unitArea": int(unit_area),
        "shellArea": int(plan_area),
        "coverage": round(unit_area / plan_area, 3) if plan_area else 0.0,
        "elapsed": round(time.perf_counter() - t0, 3),
    }

    return {
        "shell": out_shell,
        "units": out_units,
        "canvas": {
            "width": round(canvas_w, 1),
            "height": round(canvas_h, 1),
            "planWidth": round(pw, 1),
            "gutter": gutter,
            "pad": pad,
        },
        "badge": {"cx": round(pw + gutter / 2, 1), "cy": 150},
        # source->normalized mapping: (X,Y)_src -> ((X-x0)*scale+pad, (Y-y0)*scale+pad)
        # lets the frontend align the ORIGINAL raster as an underlay. Points are in
        # the input-upscaled domain, so undo in_up to report original-pixel coords.
        "transform": {"x0": float(x0) / in_up, "y0": float(y0) / in_up,
                      "scale": float(s) * in_up, "pad": pad,
                      "srcW": int(W / in_up), "srcH": int(H / in_up)},
        "stats": stats,
    }
