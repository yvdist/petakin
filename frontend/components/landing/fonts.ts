import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

// Landing-only typefaces. Scoped to the landing wrapper so the editor keeps IBM Plex.
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter-tight-src",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter-src",
  display: "swap",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jbmono-src",
  display: "swap",
});

// Combined className to apply on the landing root wrapper.
export const landingFontVars = `${interTight.variable} ${inter.variable} ${jetBrainsMono.variable}`;
