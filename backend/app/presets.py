"""Baked AEON Tebrau City default preset (palette map + hues + params).

A preset is the full editable config: everything the UI can tweak and save,
so five floors processed with one preset stay style-identical (AC #4).
"""

# source palette hex -> internal family
AEON_PALETTE_MAP = [
    {"hex": "#F8D899", "family": "fnb"},
    {"hex": "#DAE4A4", "family": "fashion"},
    {"hex": "#C2E0F4", "family": "specialty"},
    {"hex": "#D1B9D1", "family": "services"},
    {"hex": "#EED4E1", "family": "anchor"},
    {"hex": "#E1D4E4", "family": "zone_purple"},
    {"hex": "#F4F0C4", "family": "zone_yellow"},
    {"hex": "#ACD4B9", "family": "zone_green"},
    {"hex": "#A2CCEA", "family": "zone_blue"},
    {"hex": "#848388", "family": "vacant"},
    {"hex": "#EBB17B", "family": "zone_orange"},
    {"hex": "#D6D4B2", "family": "zone_yellow"},   # watermark over yellow plate (B)
    {"hex": "#EAEAEA", "family": "ignore"},        # corridor / void grey
    {"hex": "#DCDCDC", "family": "ignore"},
    {"hex": "#FFFFFF", "family": "ignore"},
    {"hex": "#B8B8B8", "family": "ignore"},
]

AEON_VAR = {
    "fnb":       ["#F2A03C", "#E8842E", "#F5B85E", "#D9762A", "#F09A56", "#E5A63A", "#FFC073", "#DE8C3E"],
    "fashion":   ["#8CC63F", "#63B24A", "#A9CE5C", "#4E9E55", "#7DBF6A", "#B6D35F", "#5FA83F", "#98C97E"],
    "specialty": ["#4FBBE8", "#2E9FD6", "#6FD0EE", "#3D8FCC", "#57C7DA", "#82D8F2", "#2BB3C9", "#5AA8E0"],
    "services":  ["#A97FD1", "#8E63C4", "#C097E0", "#7A5BB5", "#B589DC", "#9B6FCF", "#CBA6E8", "#8874C6"],
    "vacant":    ["#9E9E9E", "#8C8C8C", "#ADADAD"],
    "anchor":    ["#F2A7CB"],
    "zone_purple": ["#C9A9DC"],
    "zone_yellow": ["#F2E888"],
    "zone_green":  ["#8FCBA6"],
    "zone_blue":   ["#7FC1E8"],
    "zone_orange": ["#EDA062"],
}

AEON_BIG = {
    "fnb": "#E8842E", "fashion": "#8CC63F", "specialty": "#4FBBE8", "services": "#C9A9DC",
    "vacant": "#8A8A93", "anchor": "#F2A7CB", "zone_purple": "#C9A9DC", "zone_yellow": "#F2E888",
    "zone_green": "#8FCBA6", "zone_blue": "#7FC1E8", "zone_orange": "#EDA062",
}

DEFAULT_CONFIG = {
    "paletteMap": AEON_PALETTE_MAP,
    "var": AEON_VAR,
    "big": AEON_BIG,
    "shellFill": "#ECECEC",
    # exposed sliders
    "colorTolerance": 16,
    "minUnitArea": 50,          # native px; scaled by inputUpscale internally
    "simplify": 2.0,
    "strokeWidth": 6,
    "normalizedWidth": 1500,
    # quality: input upscale (survival) + rectangularize (crisp tenant boxes)
    "inputUpscale": 2,          # source upscale (NEAREST) for small-box survival
    "rectangularize": True,     # snap compact units to clean rectangles
    "rectFillThresh": 0.62,     # fill-ratio gate for snapping (lower = crisper)
    # anti-jaggedness: supersample masks + size-scaled elliptical smoothing
    "upscale": 2,               # per-component mask supersample (total ~4x)
    "smoothKernel": 6,          # elliptical open/close kernel (0=off)
    "openKernel": 2,            # gentler despeckle — preserve small boxes
    "familyMinPixels": 150,     # per-family skip gate (native px, scaled)
    # fixed-from-preset (identical across floors)
    "pad": 26,
    "gutter": 300,
    "bigZoneFrac": 0.05,
    "shellAreaFrac": 0.004,
    "shellSimplify": 2.6,
    "closeAreaKernel": 21,
    "holeMaxArea": 4000,
    "insideDrop": True,
    "areaFamilies": ["zone_yellow", "zone_green", "zone_blue", "zone_orange",
                     "zone_purple", "anchor", "vacant"],
    # badge (spec-fixed)
    "badge": {"r": 88, "stroke": "#E5187F", "strokeWidth": 8, "fontSize": 105},
}

AEON_PRESET = {
    "name": "AEON Tebrau City",
    "config": DEFAULT_CONFIG,
}
