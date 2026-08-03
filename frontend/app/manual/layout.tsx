import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manual editor",
  description:
    "Manually map each unit over your vendor floor-plan underlay and export a clean transparent SVG — ready for Figma, wayfinding, and signage.",
  alternates: { canonical: "/manual" },
};

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return children;
}
