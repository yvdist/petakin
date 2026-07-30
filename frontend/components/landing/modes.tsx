import Image from "next/image";
import CanvasFrame from "./ui/canvas-frame";
import Reveal from "./ui/reveal";
import SectionLabel from "./ui/section-label";

export default function Modes() {
  return (
    <section className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-12 md:py-20">
        <Reveal>
          <SectionLabel>03 — TWO MODES</SectionLabel>
          <h2 className="mt-3 font-inter-tight text-[26px] font-bold tracking-tight text-l-ink md:text-[34px]">
            Manual does the work, Auto gives you a head start
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-hairline">
          {/* Manual — the core, heavier */}
          <Reveal className="md:pr-10">
            <div className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-primary">
              CORE
            </div>
            <h3 className="mt-2 font-inter-tight text-[22px] font-semibold tracking-tight text-l-ink">
              Manual mode
            </h3>
            <p className="mt-3 max-w-[46ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
              Draw over the underlay. Outline / Rect / Ellipse / Poly tools, snap, layer panel, floor
              tabs, autosave, SVG/PNG export. Full control — this is the main flow.
            </p>
            <div className="mt-6">
              <CanvasFrame strip={["MANUAL", "DRAW · LAYERS"]} status="AUTOSAVED">
                <Image
                  src="/media/manual-mode.png"
                  alt="Petakin Manual mode with drawing tools, a layer panel, and a tab per floor."
                  fill
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 540px"
                  className="object-cover object-left-top"
                />
              </CanvasFrame>
            </div>
          </Reveal>

          {/* Auto — optional, lighter */}
          <Reveal delay={80} className="md:pl-10">
            <div className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
              OPTIONAL
            </div>
            <h3 className="mt-2 font-inter-tight text-[22px] font-semibold tracking-tight text-l-ink">
              Auto mode
            </h3>
            <p className="mt-3 max-w-[46ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
              Per-category color segmentation plus presets. Use it on its own for a quick draft, or
              Seed from auto into Manual for finishing. No “done automatically” promise.
            </p>
            <div className="mt-6">
              <CanvasFrame badge={false} strip={["AUTO", "SEGMENT + PRESET"]}>
                <Image
                  src="/media/auto-mode.png"
                  alt="Petakin Auto mode: per-category color segmentation from the floor-plan image."
                  fill
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 540px"
                  className="object-cover object-left-top"
                />
              </CanvasFrame>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
