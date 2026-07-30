"use client";
import { useId, useState } from "react";

type State = "idle" | "loading" | "success" | "error";

/**
 * Inline waitlist form. Used in the hero and the closing CTA (same component).
 * Honeypot field `company` is hidden from humans; bots that fill it are
 * silently accepted server-side. Errors render inline — no toast.
 */
export default function WaitlistForm({ source }: { source: "hero" | "cta" }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const hpId = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "loading") return;
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const company = (form.elements.namedItem("company") as HTMLInputElement).value;

    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, company }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setState("error");
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setState("success");
      // fire-and-forget analytics if a provider is present
      const w = window as unknown as {
        va?: (event: string, name: string, data?: Record<string, unknown>) => void;
        plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
      };
      w.va?.("event", "waitlist_signup", { source });
      w.plausible?.("waitlist_signup", { props: { source } });
    } catch {
      setState("error");
      setError("Couldn't connect. Check your connection and try again.");
    }
  }

  if (state === "success") {
    return (
      <p className="font-jbmono text-[13px] leading-relaxed text-primary" role="status">
        You’re on the list. We’ll email you when access opens.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={emailId} className="sr-only">
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.com"
          disabled={state === "loading"}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-[15px] text-l-ink placeholder:text-l-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
        />
        {/* honeypot — hidden from users, must stay empty */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={hpId}>Company</label>
          <input id={hpId} name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <button
          type="submit"
          disabled={state === "loading"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#0b665f] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
        >
          {state === "loading" && (
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          Join waitlist
        </button>
      </div>
      {state === "error" && error && (
        <p className="mt-2 font-jbmono text-[12px] text-cat-fnb" role="alert">
          {error}
        </p>
      )}
      {state !== "error" && (
        <p className="mt-2 font-jbmono text-[11px] uppercase tracking-[0.08em] text-l-ink-faint">
          No spam. We’ll only email you when access opens.
        </p>
      )}
    </form>
  );
}
