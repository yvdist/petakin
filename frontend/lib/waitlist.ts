import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export type Lead = {
  email: string;
  created_at: string;
  source: "hero" | "cta";
  role?: string;
};

/**
 * Provider-agnostic waitlist sink.
 *
 * Default provider is a local stub: it logs the lead and appends it to
 * `.waitlist.log.jsonl` at the project root. Swap `saveLead` for a real
 * provider by filling in one of the stubs below and wiring env vars.
 */
export async function saveLead(lead: Lead): Promise<void> {
  // --- default: local stub -------------------------------------------------
  console.log("[waitlist] lead", JSON.stringify(lead));
  try {
    const file = join(process.cwd(), ".waitlist.log.jsonl");
    await appendFile(file, JSON.stringify(lead) + "\n", "utf8");
  } catch (err) {
    // Non-fatal: log write can fail on read-only FS (e.g. serverless).
    console.error("[waitlist] append failed", err);
  }

  // --- Resend Audience (stub) ---------------------------------------------
  // await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ email: lead.email }),
  // });

  // --- Supabase table (stub) ----------------------------------------------
  // await fetch(`${process.env.SUPABASE_URL}/rest/v1/waitlist`, {
  //   method: "POST",
  //   headers: {
  //     apikey: process.env.SUPABASE_SERVICE_KEY!,
  //     Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify(lead),
  // });

  // --- Google Sheet via Apps Script (stub) --------------------------------
  // await fetch(process.env.WAITLIST_SHEET_WEBHOOK!, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(lead),
  // });
}
