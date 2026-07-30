import { clientIp, rateLimit } from "@/lib/rate-limit";
import { saveLead } from "@/lib/waitlist";

// Local route handler. Takes precedence over the /api/:path* backend rewrite
// (afterFiles), so only /api/waitlist is handled here.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`waitlist:${ip}`);
  if (!limit.ok) {
    return Response.json(
      { ok: false, error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const source = data.source === "cta" ? "cta" : "hero";
  const role = typeof data.role === "string" && data.role.trim() ? data.role.trim().slice(0, 120) : undefined;
  const honeypot = typeof data.company === "string" ? data.company : "";

  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (honeypot) {
    return Response.json({ ok: true });
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 422 });
  }

  try {
    await saveLead({ email, created_at: new Date().toISOString(), source, role });
  } catch (err) {
    console.error("[waitlist] saveLead failed", err);
    return Response.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
