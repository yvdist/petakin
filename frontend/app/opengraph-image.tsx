import { ImageResponse } from "next/og";

export const alt = "Petakin — turn mall floor plans into clean SVG";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Flat category color blocks — a stylized hint of the output, not a screenshot.
const BLOCKS = [
  { c: "#8CC63F", w: 150, h: 96 },
  { c: "#E8842E", w: 96, h: 96 },
  { c: "#4FBBE8", w: 120, h: 96 },
  { c: "#A97FD1", w: 130, h: 96 },
  { c: "#F2A7CB", w: 110, h: 96 },
  { c: "#F2E888", w: 140, h: 96 },
  { c: "#8CC63F", w: 96, h: 96 },
  { c: "#4FBBE8", w: 118, h: 96 },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFFFF",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: "#18181B", letterSpacing: -1 }}>
              Petakin
            </div>
            <div style={{ fontSize: 20, color: "#A1A1AA", letterSpacing: 2 }}>RASTER → SVG</div>
          </div>
          {/* magenta floor badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 999,
              border: "3px solid #E5187F",
              color: "#E5187F",
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            1F
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#18181B", letterSpacing: -2, lineHeight: 1.05 }}>
            Draw units over the real
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#18181B", letterSpacing: -2, lineHeight: 1.05 }}>
            floor plan. Export clean SVG.
          </div>
        </div>

        {/* flat color blocks + separators */}
        <div style={{ display: "flex", gap: 6 }}>
          {BLOCKS.map((b, i) => (
            <div key={i} style={{ width: b.w, height: b.h, background: b.c, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
