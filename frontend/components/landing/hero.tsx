import Image from "next/image";
import CanvasFrame from "./ui/canvas-frame";
import WaitlistForm from "./ui/waitlist-form";
import SectionLabel from "./ui/section-label";

export default function Hero() {
  return (
    <section id="top" className="border-b border-hairline">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 py-16 md:grid-cols-12 md:gap-8 md:px-12 md:py-24">
        {/* left — copy + form */}
        <div className="flex flex-col justify-center md:col-span-6">
          <SectionLabel>EARLY ACCESS · NOT PUBLIC YET</SectionLabel>
          <h1 className="mt-4 font-inter-tight text-[34px] font-bold leading-[1.05] tracking-tight text-l-ink md:text-[58px]">
            Draw units over the real floor plan. Export clean SVG.
          </h1>
          <p className="mt-5 max-w-[68ch] font-inter text-[17px] leading-relaxed text-l-ink-muted">
            Petakin is a manual mapping editor that sits on top of your vendor floor-plan underlay.
            Draw each unit with Rect, Ellipse, or Poly (curves included), organize layers and
            categories, and export transparent SVG ready for Figma / wayfinding. Need a head start?
            Auto mode can seed the shapes — you still finish by hand.
          </p>
          <div id="waitlist-hero" className="mt-8 scroll-mt-24">
            <WaitlistForm source="hero" />
          </div>
        </div>

        {/* right — canvas frame */}
        <div className="flex items-center md:col-span-6">
          <CanvasFrame
            className="w-full"
            strip={["UNDERLAY 40%", "DRAW 100%", "SNAP 8px"]}
            status="AUTOSAVED"
          >
            <Image
              src="/media/hero-manual.png"
              alt="Petakin Manual mode editor: a mall floor plan as underlay with store units drawn as color blocks and a layer panel on the right."
              fill
              priority
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover object-left-top"
            />
          </CanvasFrame>
        </div>
      </div>
    </section>
  );
}
