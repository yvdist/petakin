import type { Metadata } from "next";
import Link from "next/link";
import { landingFontVars } from "@/components/landing/fonts";
import FloorBadge from "@/components/landing/ui/floor-badge";

export const metadata: Metadata = {
  title: "Auto mode — Under construction · Petakin",
  description: "Petakin Auto mode is temporarily under construction. Manual mapping is available now.",
  robots: { index: false, follow: false },
};

export default function AutoUnderConstructionPage() {
  return (
    <div className={`${landingFontVars} relative min-h-screen overflow-hidden bg-white font-inter text-l-ink`}>
      {/* faint sample SVG motif */}
      <img
        src="/sample/petakin-1F.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-32 top-1/2 hidden w-[820px] max-w-none -translate-y-1/2 opacity-[0.05] md:block"
      />

      {/* soft gradient atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(13,122,114,0.08), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 80%, rgba(229,24,127,0.05), transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-hairline bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-inter-tight text-lg font-bold tracking-tight">Petakin</span>
            <span className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
              Auto
            </span>
          </Link>
          <Link
            href="/manual"
            className="rounded-md bg-primary px-3.5 py-1.5 font-inter text-[13px] font-medium text-white transition-colors hover:bg-[#0b665f]"
          >
            Open Manual
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[960px] flex-col items-start px-6 py-20 md:py-28">
        <div className="mb-8 flex items-center gap-3">
          <FloorBadge label="…" size={56} />
          <span className="font-jbmono text-[11px] uppercase tracking-[0.12em] text-l-ink-faint">
            Under construction
          </span>
        </div>

        <h1 className="max-w-[18ch] font-inter-tight text-[36px] font-bold leading-[1.08] tracking-tight md:text-[52px]">
          Auto mode is getting a rebuild
        </h1>
        <p className="mt-5 max-w-[52ch] font-inter text-[17px] leading-relaxed text-l-ink-muted">
          We’re parking Auto for now while we tighten segmentation and presets. Manual mapping is
          live — draw over your underlay and export clean SVG today.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/manual"
            className="rounded-md bg-primary px-5 py-2.5 font-inter text-[15px] font-medium text-white transition-colors hover:bg-[#0b665f] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Continue in Manual
          </Link>
          <Link
            href="/"
            className="rounded-md border border-hairline bg-white/80 px-5 py-2.5 font-inter text-[15px] font-medium text-l-ink-muted transition-colors hover:border-l-ink-faint hover:text-l-ink"
          >
            Back to home
          </Link>
        </div>

        <p className="mt-16 font-jbmono text-[11px] uppercase tracking-[0.1em] text-l-ink-faint">
          Manual · live &nbsp;·&nbsp; Auto · soon
        </p>
      </main>
    </div>
  );
}
