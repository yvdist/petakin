import Image from "next/image";
import Link from "next/link";
import CanvasFrame from "./ui/canvas-frame";
import SectionLabel from "./ui/section-label";

export default function Hero() {
  return (
    <section id="top" className="border-b border-hairline">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 py-16 md:grid-cols-12 md:gap-8 md:px-12 md:py-24">
        {/* left — copy + CTA */}
        <div className="flex flex-col justify-center md:col-span-6">
          <SectionLabel>MANUAL MAPPING · LIVE NOW</SectionLabel>
          <h1 className="mt-4 font-inter-tight text-[34px] font-bold leading-[1.05] tracking-tight text-l-ink md:text-[58px]">
            Draw units over the real floor plan. Export clean SVG.
          </h1>
          <p className="mt-5 max-w-[68ch] font-inter text-[17px] leading-relaxed text-l-ink-muted">
            Petakin is a manual mapping editor that sits on top of your vendor floor-plan underlay.
            Draw each unit with Rect, Ellipse, or Poly (curves included), organize layers and
            categories, and export transparent SVG ready for Figma / wayfinding.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/manual"
              className="rounded-md bg-primary px-5 py-2.5 font-inter text-[15px] font-medium text-white transition-colors hover:bg-[#0b665f] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Start mapping
            </Link>
            <Link
              href="/auto"
              className="rounded-md border border-hairline bg-white px-5 py-2.5 font-inter text-[15px] font-medium text-l-ink-muted transition-colors hover:border-l-ink-faint hover:text-l-ink focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Auto mode
            </Link>
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
