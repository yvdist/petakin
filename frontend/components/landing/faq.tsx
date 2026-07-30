import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

const ITEMS: { q: string; a: string }[] = [
  {
    q: "Does the plan keep the same shape as the original?",
    a: "Yes. You draw on top of the real floor-plan underlay, so proportions and layout follow the source. Petakin cleans up the look (text, icons, watermarks go away) — it doesn't change the shape.",
  },
  {
    q: "Why is Manual mode the headline?",
    a: "Unit-by-unit control. Vendor plans are often messy and inconsistent across floors; hand-drawing over an underlay is more dependable for production work than an automatic trace.",
  },
  {
    q: "How accurate is Auto mode?",
    a: "Useful as a seed / draft. It often gets most units in, but the rest — and the final quality — is cleaned up in Manual. We don't claim it finishes on its own.",
  },
  {
    q: "Which input formats are supported?",
    a: "PNG and JPG, including screenshots exported from a vendor PDF. As long as the image is readable, it can become an underlay.",
  },
  {
    q: "Can the result be edited in Figma / Illustrator?",
    a: "Yes. The SVG output has a group per category and an ID per unit, so every path can be selected and arranged like a normal layer.",
  },
  {
    q: "What if my plan isn't a mall — say a hospital or an airport?",
    a: "The flow is the same — underlay, draw units/zones, categorize, export. The built-in categories lean retail, but Manual mode doesn't limit what shapes you can draw.",
  },
  {
    q: "When does access open?",
    a: "Not public yet. Join the waitlist and we'll email you the moment access is available.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <Reveal>
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-3 font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
            Questions that come up often
          </h2>
        </Reveal>

        <div className="mt-8 max-w-[820px] border-t border-hairline">
          {ITEMS.map((it) => (
            <details key={it.q} className="group border-b border-hairline">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-inter-tight text-[17px] font-medium tracking-tight text-l-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                {it.q}
                <span
                  aria-hidden
                  className="font-jbmono text-[18px] leading-none text-l-ink-faint transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[68ch] pb-5 font-inter text-[15px] leading-relaxed text-l-ink-muted">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
