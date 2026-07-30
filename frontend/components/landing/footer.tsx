export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-3 px-6 py-8 font-jbmono text-[12px] uppercase tracking-[0.08em] text-l-ink-muted sm:flex-row sm:items-center md:px-12">
        <div className="flex items-center gap-2">
          <span className="font-inter-tight text-[14px] font-bold normal-case tracking-tight text-l-ink">
            Petakin
          </span>
          <span className="text-l-ink-faint">· {year}</span>
        </div>
        <a href="mailto:support@petakin.com" className="hover:text-primary">
          support@petakin.com
        </a>
      </div>
    </footer>
  );
}
