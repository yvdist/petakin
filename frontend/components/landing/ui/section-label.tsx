import type { ReactNode } from "react";

/** Small technical caption in mono, e.g. "01 — CARA KERJA". */
export default function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-jbmono text-[11px] font-medium uppercase tracking-[0.08em] text-l-ink-faint">
      {children}
    </span>
  );
}
