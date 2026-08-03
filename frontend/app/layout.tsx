import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Petakin — Turn mall floor plans into clean SVG",
    template: "%s · Petakin",
  },
  description:
    "Petakin turns raster mall and retail floor plans into clean flat color-block SVGs — one path per unit, ready for Figma, wayfinding, and signage.",
  keywords: ["Petakin", "mimic plan", "mall floor plan", "SVG", "manual mapping", "wayfinding", "signage"],
  applicationName: "Petakin",
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "Petakin",
    title: "Petakin — Turn mall floor plans into clean SVG",
    description:
      "Turn raster mall floor plans into clean flat color-block SVGs — one path per unit, ready for Figma, wayfinding, and signage.",
    url: "/",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Petakin — Turn mall floor plans into clean SVG",
    description:
      "Turn raster mall floor plans into clean flat color-block SVGs — one path per unit, ready for Figma, wayfinding, and signage.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full antialiased ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-full bg-neutral-100 font-sans text-neutral-900">{children}</body>
    </html>
  );
}
