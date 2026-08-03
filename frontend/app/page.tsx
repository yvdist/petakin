import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { landingFontVars } from "@/components/landing/fonts";
import Nav from "@/components/landing/nav";
import Hero from "@/components/landing/hero";
import StatsStrip from "@/components/landing/stats-strip";
import Problem from "@/components/landing/problem";
import HowItWorks from "@/components/landing/how-it-works";
import OutputSpec from "@/components/landing/output-spec";
import UseCases from "@/components/landing/use-cases";
import Modes from "@/components/landing/modes";
import Faq from "@/components/landing/faq";
import Cta from "@/components/landing/cta";
import Footer from "@/components/landing/footer";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: "Petakin — Turn mall floor plans into clean SVG" },
  description:
    "Petakin turns raster mall floor plans into clean mimic-plan SVGs through manual mapping over a floor-plan underlay. One path per unit — ready for Figma, wayfinding, and signage.",
  keywords: ["mimic plan", "mall floor plan", "SVG", "manual mapping", "wayfinding", "signage"],
  openGraph: {
    title: "Petakin — Turn mall floor plans into clean SVG",
    description:
      "A manual mapping editor over your vendor floor-plan underlay. Draw each unit, export transparent SVG ready for Figma / wayfinding.",
    type: "website",
    locale: "en_US",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Petakin",
  url: SITE_URL,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  description:
    "Petakin turns raster mall floor plans into clean mimic-plan SVGs through manual mapping over a floor-plan underlay. One path per unit — ready for Figma, wayfinding, and signage.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function LandingPage() {
  return (
    <div className={`${landingFontVars} min-h-screen bg-white font-inter text-l-ink`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main>
        <Hero />
        <StatsStrip />
        <Problem />
        <HowItWorks />
        <OutputSpec />
        <UseCases />
        <Modes />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
