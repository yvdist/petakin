import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petakin — Floor Plan → Flat SVG",
  description: "Turn raster mall floor plans into clean flat color-block SVGs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-neutral-100 text-neutral-900">{children}</body>
    </html>
  );
}
