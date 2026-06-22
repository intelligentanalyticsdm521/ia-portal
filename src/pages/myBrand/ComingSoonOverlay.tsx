// src/pages/myBrand/ComingSoonOverlay.tsx
//
// Customer-facing "Coming Soon" gate for the entire My Brand product surface
// (Brandon 2026-06-22). Backend + Portal pages are fully built — what's
// missing is the platform-side trust required for the social-publishing half:
//
//   - Meta business verification (Facebook + Instagram pages publishing)
//   - LinkedIn Marketing Partner approval
//   - X (paid API) plan + brand-safety review
//
// Until those land we don't want customers stumbling into half-of-a-feature.
// Rather than rip the pages out we drop this centered card on top of every
// My Brand sub-page so the surface still loads (founder testing, deep links)
// but customers see a unified "we'll let you know" message instead.
//
// Founder/super-user bypass: pages call useAppState().bootstrap.user.isSuperUser
// and skip rendering this overlay when true. The HOC withMyBrandComingSoon()
// in this same file applies that check uniformly to every default export.
//
// "Notify me" reuses the F-110 product_waitlist table (oliver-api POST
// /api/v1/waitlist) — same lead-capture pipeline as STELLA/FORGE/ARGUS.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Palette, BellRing, ArrowLeft } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { submitWaitlist } from "../../lib/signupCheckout";

export interface ComingSoonOverlayProps {
  /** Optional seed email so a logged-in user doesn't have to retype it. */
  defaultEmail?: string;
}

export function ComingSoonOverlay({ defaultEmail }: ComingSoonOverlayProps) {
  const navigate = useNavigate();
  const { bootstrap } = useAppState();
  const seedEmail = defaultEmail || bootstrap?.user?.email || "";

  const [email, setEmail] = useState(seedEmail);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the seed in sync if bootstrap finishes loading after the first render.
  useEffect(() => {
    if (!email && seedEmail) setEmail(seedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedEmail]);

  async function notifyMe() {
    setError(null);
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await submitWaitlist({
        product: "my_brand",
        email: email.trim(),
        name: bootstrap?.user?.displayName || undefined,
        source_url: typeof window !== "undefined" ? window.location.href : undefined,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your request — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      // Full-bleed overlay anchored to the main content area. The customer
      // can't drag away to find the underlying page — the goal is to gate
      // discovery, not just decorate it. z-30 keeps us under the founder
      // emergency-act-as banner (z-50) and the chatbot launcher.
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-50/95 px-4 py-8 backdrop-blur-sm"
      aria-label="My Brand — Coming Soon"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header band — mirrors the IadmModal ink gradient so this card
            visually reads as a system message, not a marketing splash. */}
        <div
          className="rounded-t-xl px-6 py-5 text-white"
          style={{ background: "linear-gradient(135deg, #0B1C24 0%, #1A3A4A 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: "#FEC82C22" }}
            >
              <Palette className="h-5 w-5" style={{ color: "#FEC82C" }} />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#FEC82C]">
                Creative Studio
              </div>
              <h2 className="text-lg font-semibold">My Brand — Coming Soon</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {done ? (
            <div className="text-center py-2">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-sm text-slate-700">
                You're on the list — we'll email <strong>{email}</strong> the moment My
                Brand opens for customers.
              </p>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => navigate("/app/dashboard")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#1A3A4A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B1C24]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-700">
                We're putting the finishing touches on AI Image Studio, Brand Voice
                Monitor, Social Channels, and the Mini-Canva Template Studio. You'll be
                invited to use My Brand when it launches.{" "}
                <span className="font-semibold text-slate-900">
                  No additional cost when activated.
                </span>
              </p>
              <p className="mt-3 text-xs italic text-slate-500">
                Founder/admin access continues to be available.
              </p>

              {/* Email capture */}
              <div className="mt-5">
                <label className="block">
                  <span className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourbusiness.com"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#FEC82C] focus:outline-none focus:ring-1 focus:ring-[#FEC82C]"
                  />
                </label>
                {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
              </div>

              {/* Actions */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => navigate("/app/dashboard")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to dashboard
                </button>
                <button
                  type="button"
                  onClick={notifyMe}
                  disabled={submitting || !email.includes("@")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#FEC82C] px-4 py-2 text-sm font-semibold text-[#1A3A4A] hover:bg-[#f5be1f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  {submitting ? "Saving…" : "Notify me"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HOC ─────────────────────────────────────────────────────────────────────
// Wrap any My Brand page so it auto-gates for non-founder users. The page
// keeps rendering (so the underlying React tree mounts and founder can still
// hit the real surface) but the overlay sits on top for everyone else.
//
// Usage at the bottom of each page file:
//
//   export default withMyBrandComingSoon(SocialChannelsPage);
//
// The wrapper relies on a position:relative ancestor — the AppShell <main>
// has overflow-y-auto, but the overlay is absolutely positioned inside a
// relative wrapper we render here so the overlay never bleeds onto the
// IconRail / SubNav.
import type { ComponentType } from "react";

export function withMyBrandComingSoon<P extends object>(
  Page: ComponentType<P>,
): ComponentType<P> {
  const Wrapped = (props: P) => {
    const { bootstrap } = useAppState();
    const isFounder = !!bootstrap?.user?.isSuperUser;

    if (isFounder) {
      // Founder/super-admin sees the live page unmodified — no overlay,
      // no wrapper that could shift layout. This keeps Brandon's testing
      // 1:1 with the eventual customer experience.
      return <Page {...props} />;
    }

    return (
      <div className="relative min-h-full">
        <Page {...props} />
        <ComingSoonOverlay />
      </div>
    );
  };
  Wrapped.displayName = `withMyBrandComingSoon(${Page.displayName || Page.name || "Component"})`;
  return Wrapped;
}

export default ComingSoonOverlay;
