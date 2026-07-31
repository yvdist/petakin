import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

const COLS = [
  {
    t: "Text & icons get traced too.",
    b: "Potrace and ImageTracer treat unit codes and toilet icons as shapes — the result is messy.",
  },
  {
    t: "Paths shatter.",
    b: "A single unit can become dozens of slivers you can't cleanly select in Figma.",
  },
  {
    t: "No structure.",
    b: "Without categories and IDs it's just a picture — you can't bind it to tenant data.",
  },
];

export default function Problem() {
  return (
    <section className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <Reveal>
          <SectionLabel>THE PROBLEM</SectionLabel>
          <h2 className="mt-3 max-w-[68ch] font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
            Why ordinary auto-trace isn’t enough
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-hairline">
          {COLS.map((c, i) => (
            <Reveal key={c.t} delay={i * 60} className="md:px-8 md:first:pl-0">
              <h3 className="font-inter-tight text-[17px] font-semibold tracking-tight text-l-ink">
                {c.t}
              </h3>
              <p className="mt-2 max-w-[46ch] font-inter text-[15px] leading-relaxed text-l-ink-muted">
                {c.b}
              </p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="mt-12 max-w-[68ch] border-l-2 border-primary pl-4 font-inter text-[16px] leading-relaxed text-l-ink">
            Petakin leads with manual mapping over an underlay. Auto mode is paused for a rebuild —
            Manual is the production path today.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
