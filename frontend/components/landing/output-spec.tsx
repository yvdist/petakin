import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

const CODE = `<svg viewBox="0 0 1826 1024">
  <g id="shell">   <path id="shell-1" .../> </g>
  <g id="units">
    <g id="cat-fnb">     <path id="fnb-01" data-area="1820" .../> </g>
    <g id="cat-fashion"> <path id="fashion-01" .../> </g>
  </g>
  <g id="badge"> ... </g>
</svg>`;

const SWATCHES: { name: string; token: string }[] = [
  { name: "Food & Beverages", token: "var(--color-cat-fnb)" },
  { name: "Fashion & Accessories", token: "var(--color-cat-fashion)" },
  { name: "Specialty", token: "var(--color-cat-specialty)" },
  { name: "Services & Entertainment", token: "var(--color-cat-services)" },
  { name: "Anchor / Dept Store", token: "var(--color-cat-anchor)" },
  { name: "Vacant / Empty", token: "var(--color-cat-vacant)" },
  { name: "Zone / Parking", token: "var(--color-cat-zone)" },
];

export default function OutputSpec() {
  return (
    <section id="output" className="scroll-mt-20 border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
          <Reveal>
            <SectionLabel>02 — OUTPUT</SectionLabel>
            <h2 className="mt-3 font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
              Structured SVG, ready to use
            </h2>
            <p className="mt-4 max-w-[52ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
              Every unit is a single <code className="font-jbmono text-[14px]">path</code> with an ID,
              grouped by category. Transparent background, white strokes between units, floor badge.
              Edit it straight in Figma or bind it to tenant data.
            </p>
            <a
              href="/sample/petakin-1F.svg"
              download
              className="mt-6 inline-flex items-center gap-2 rounded-md border border-hairline bg-white px-4 py-2.5 font-inter text-[14px] font-medium text-l-ink transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Download sample SVG
              <span className="font-jbmono text-[11px] text-l-ink-faint">1F</span>
            </a>
          </Reveal>

          <Reveal delay={80}>
            <div className="overflow-x-auto rounded-md border border-hairline bg-surface-2">
              <pre className="min-w-max p-4 font-jbmono text-[13px] leading-relaxed text-l-ink">
                <code>{CODE}</code>
              </pre>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <ul className="mt-12 flex flex-wrap gap-x-6 gap-y-3">
            {SWATCHES.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-4 w-4 rounded-sm border border-hairline"
                  style={{ backgroundColor: s.token }}
                />
                <span className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-muted">
                  {s.name}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
