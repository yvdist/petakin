import Image from "next/image";
import CanvasFrame from "./ui/canvas-frame";
import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

const STEPS = [
  {
    n: "01",
    t: "Upload a floor plan.",
    b: "Any PNG or JPG, including a screenshot from a vendor PDF. The underlay appears on the canvas; tune its opacity so the unit lines stay readable.",
    img: "/media/step-1-upload.png",
    alt: "Floor-plan upload panel with a floor label, and the mall underlay showing on the canvas.",
    strip: ["UPLOAD", "PNG · JPG"],
  },
  {
    n: "02",
    t: "Draw units in Manual mode.",
    b: "Outline for the floor shell; Rect / Ellipse / Poly for units (snap grid, vertex editing, bezier curves). Layer panel: group, visibility, lock, reorder. A tab per floor plus autosave. Optional: Seed from auto, then clean up what doesn't fit.",
    img: "/media/step-2-draw.png",
    alt: "Manual mode: store units drawn as color blocks over the underlay, with a layer panel and floor tabs.",
    strip: ["DRAW", "SNAP 8px", "LAYERS"],
    status: "AUTOSAVED",
  },
  {
    n: "03",
    t: "Export SVG (or PNG).",
    b: "Group per category, ID per unit, transparent background, white strokes between units, floor badge. Import/export the workspace as JSON to continue later.",
    img: "/media/step-3-export.png",
    alt: "Clean flat color-block SVG output with a floor badge and a transparent background.",
    strip: ["EXPORT", "SVG · PNG"],
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <Reveal>
          <SectionLabel>01 — HOW IT WORKS</SectionLabel>
          <h2 className="mt-3 font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
            Three steps, full control
          </h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-16">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              className={`grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12 ${
                i % 2 === 1 ? "md:[&>figure]:order-2" : ""
              }`}
            >
              <CanvasFrame strip={s.strip} status={s.status} badgeLabel="1F">
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 560px"
                  className="object-cover object-left-top"
                />
              </CanvasFrame>
              <div>
                <div className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
                  STEP {s.n}
                </div>
                <h3 className="mt-2 font-inter-tight text-[22px] font-semibold tracking-tight text-l-ink md:text-[26px]">
                  {s.t}
                </h3>
                <p className="mt-3 max-w-[52ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
                  {s.b}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
