"""Emit the spec-exact grouped SVG from normalized geometry.

Structure (required for Figma per-category select + tenant data-binding):
  <g id="shell"> <path id="shell-1"/> </g>
  <g id="units"> <g id="cat-fnb"> <path id="fnb-01" data-area=.../> ... </g> ... </g>
  <g id="badge"> circle + text </g>
Transparent background, no <image>, no frame rect.
"""
from __future__ import annotations

from typing import Any

# stable category render order (shell drawn first, below)
CATEGORY_ORDER = ["anchor", "vacant", "zone", "specialty", "services", "fashion", "fnb"]


def _d(points: list[list[float]]) -> str:
    return "M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z"


def emit_svg(floor: str, geometry: dict[str, Any], config: dict[str, Any],
             title: str = "Petakin") -> str:
    canvas = geometry["canvas"]
    W = canvas["width"]
    H = canvas["height"]
    sw = float(config.get("strokeWidth", 6))
    badge = config.get("badge", {"r": 88, "stroke": "#E5187F", "strokeWidth": 8, "fontSize": 105})
    b = geometry["badge"]

    o = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}">',
        f'  <title>{title} - {floor}</title>',
        f'  <g id="shell" stroke="#FFFFFF" stroke-width="{sw:g}" '
        f'stroke-linejoin="round" stroke-linecap="round">',
    ]
    for s in geometry["shell"]:
        o.append(f'    <path id="{s["id"]}" fill="{s["fill"]}" d="{_d(s["points"])}"/>')
    o.append('  </g>')

    o.append(f'  <g id="units" stroke="#FFFFFF" stroke-width="{sw:g}" '
             f'stroke-linejoin="round" stroke-linecap="round">')
    units = geometry["units"]
    cats = [c for c in CATEGORY_ORDER if any(u["category"] == c for u in units)]
    # include any category not in the fixed order, appended stably
    for u in units:
        if u["category"] not in cats:
            cats.append(u["category"])
    for cat in cats:
        o.append(f'    <g id="cat-{cat}">')
        for u in units:
            if u["category"] != cat:
                continue
            o.append(f'      <path id="{u["id"]}" data-area="{u["area"]}" '
                     f'data-family="{u["family"]}" fill="{u["fill"]}" d="{_d(u["points"])}"/>')
        o.append('    </g>')
    o.append('  </g>')

    r = badge.get("r", 88)
    stroke = badge.get("stroke", "#E5187F")
    bsw = badge.get("strokeWidth", 8)
    fs = badge.get("fontSize", 105)
    cx, cy = b["cx"], b["cy"]
    o.append('  <g id="badge">')
    o.append(f'    <circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r}" fill="none" '
             f'stroke="{stroke}" stroke-width="{bsw}"/>')
    o.append(f'    <text x="{cx:.0f}" y="{cy + 38:.0f}" text-anchor="middle" '
             f'font-family="Arial, Helvetica, sans-serif" font-weight="700" '
             f'font-size="{fs}" fill="{stroke}">{floor}</text>')
    o.append('  </g>')
    o.append('</svg>')
    return "\n".join(o)
