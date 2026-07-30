export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 md:px-12">
        <a href="#top" className="flex items-baseline gap-2">
          <span className="font-inter-tight text-lg font-bold tracking-tight text-l-ink">Petakin</span>
          <span className="font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
            RASTER → SVG
          </span>
        </a>
        <nav className="flex items-center gap-6">
          <a href="#how-it-works" className="hidden font-inter text-[14px] text-l-ink-muted hover:text-l-ink md:inline">
            How it works
          </a>
          <a href="#output" className="hidden font-inter text-[14px] text-l-ink-muted hover:text-l-ink md:inline">
            Output
          </a>
          <a href="#faq" className="hidden font-inter text-[14px] text-l-ink-muted hover:text-l-ink md:inline">
            FAQ
          </a>
          <a
            href="#waitlist-hero"
            className="rounded-md bg-primary px-3.5 py-2 font-inter text-[14px] font-medium text-white transition-colors hover:bg-[#0b665f] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Join waitlist
          </a>
        </nav>
      </div>
    </header>
  );
}
