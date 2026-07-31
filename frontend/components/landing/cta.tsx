import Link from "next/link";
import Reveal from "./ui/reveal";
import FloorBadge from "./ui/floor-badge";

export default function Cta() {
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-surface">
      {/* ornament: real Petakin output, barely visible */}
      <img
        src="/sample/petakin-1F.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/2 hidden w-[720px] max-w-none -translate-y-1/2 opacity-[0.06] md:block"
      />
      <div className="relative mx-auto max-w-[1200px] px-6 py-20 md:px-12 md:py-28">
        <Reveal className="max-w-[560px]">
          <div className="mb-6">
            <FloorBadge />
          </div>
          <h2 className="font-inter-tight text-[30px] font-bold leading-tight tracking-tight text-l-ink md:text-[40px]">
            Ready to map your floor plan?
          </h2>
          <p className="mt-4 max-w-[52ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
            Manual mode is live. Upload a vendor plan, draw units over the underlay, and export
            transparent SVG for Figma or wayfinding.
          </p>
          <div className="mt-8">
            <Link
              href="/manual"
              className="inline-flex rounded-md bg-primary px-5 py-2.5 font-inter text-[15px] font-medium text-white transition-colors hover:bg-[#0b665f] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Start mapping
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
