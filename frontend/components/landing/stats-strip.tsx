import Reveal from "./ui/reveal";

const STATS = [
  { n: "1 path", d: "one unit = one polygon, selectable in Figma" },
  { n: "N floors", d: "a tab per floor, uniform style, autosave in the browser" },
  { n: "Snap grid", d: "Outline · Rect · Ellipse · Poly (+ bezier)" },
  { n: "0 raster", d: "pure vector output, no embedded image" },
];

export default function StatsStrip() {
  return (
    <section className="border-b border-hairline">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 divide-x divide-hairline border-x border-hairline px-0 md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal
            key={s.n}
            delay={i * 60}
            className="px-6 py-8 md:px-8"
          >
            <div className="font-inter-tight text-[32px] font-semibold leading-none tracking-tight text-l-ink">
              {s.n}
            </div>
            <div className="mt-2 font-jbmono text-[11px] uppercase leading-relaxed tracking-[0.08em] text-l-ink-faint">
              {s.d}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
