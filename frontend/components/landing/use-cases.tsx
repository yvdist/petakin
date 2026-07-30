import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

const CARDS = [
  {
    t: "Digital signage.",
    b: "Vertical screens inside the mall — clean and legible from a distance.",
    accent: "var(--color-cat-specialty)",
  },
  {
    t: "Dynamic wayfinding apps.",
    b: "Every path has an ID, so it's easy to wire to tenant data.",
    accent: "var(--color-cat-services)",
  },
  {
    t: "Client presentations.",
    b: "Multiple floors in a uniform style (same tabs and categories), ready to drop into a deck.",
    accent: "var(--color-cat-fashion)",
  },
];

export default function UseCases() {
  return (
    <section className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <Reveal>
          <SectionLabel>WHAT FOR</SectionLabel>
          <h2 className="mt-3 font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
            One output, many destinations
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {CARDS.map((c, i) => (
            <Reveal key={c.t} delay={i * 60}>
              <div className="h-full rounded-md border border-hairline bg-white p-6">
                <span aria-hidden className="block h-1 w-8 rounded-full" style={{ backgroundColor: c.accent }} />
                <h3 className="mt-4 font-inter-tight text-[18px] font-semibold tracking-tight text-l-ink">
                  {c.t}
                </h3>
                <p className="mt-2 font-inter text-[15px] leading-relaxed text-l-ink-muted">{c.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
