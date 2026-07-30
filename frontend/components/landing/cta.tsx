import Reveal from "./ui/reveal";
import WaitlistForm from "./ui/waitlist-form";
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
            Want to try it when access opens?
          </h2>
          <p className="mt-4 max-w-[52ch] font-inter text-[16px] leading-relaxed text-l-ink-muted">
            We’re opening access gradually. Leave your email and we’ll reach out the moment Petakin
            is ready for you.
          </p>
          <div id="waitlist-cta" className="mt-8 scroll-mt-24">
            <WaitlistForm source="cta" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
