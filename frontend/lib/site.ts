// Single source of truth for the site's public origin.
// Falls back to the production URL so metadata/robots/sitemap stay correct even
// if NEXT_PUBLIC_SITE_URL is not set in the deploy environment. Override the env
// var when moving to a custom domain.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://petakin.vercel.app";
