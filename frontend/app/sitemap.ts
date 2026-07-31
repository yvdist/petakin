import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE}/manual`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
