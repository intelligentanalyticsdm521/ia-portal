// SetupPaymentsCard — F-Stripe-Client-Side (2026-06-23).
//
// Client-facing dual-path Stripe Connect picker. Shown on the OLIVER
// dashboard once the tenant signs in (post-CIAM) and BEFORE Stripe is
// connected. Replaces the founder-wizard dual-path picker: per Brandon,
// the founder never touches client bank info — the client picks their
// own path inside their own portal.
//
// Two paths exactly:
//   1. "Set one up for me"          → POST /billing/connect/start
//                                      (Controller / Express — we mint
//                                      the account, Stripe hosts the
//                                      onboarding flow)
//   2. "I already have a Stripe account" → POST /billing/connect/oauth-start
//                                      (Standard OAuth — tenant signs in
//                                      on stripe.com and links an existing
//                                      account)
//
// Both endpoints return { url } (auto-unwrapped from the {data:…} envelope
// by useOliverApi.post). We open in a new tab via window.location so the
// dashboard is preserved when Stripe redirects back with
// ?stripe_connected=1 (Express success) or ?code=…&state=… (OAuth
// callback handled server-side, which then redirects to the dashboard
// with ?stripe_connected=1 or ?stripe_error=<code>).
//
// Error contract:
//   • 503 stripe_oauth_not_configured (Standard path, ca_* missing in KV)
//     → surface friendly inline copy steering the user to "Set one up for
//     me". Do NOT crash. Express path is unaffected.
//   • Other failures → red inline error with the raw message.
//
// Visibility: caller decides via the `show` prop. The OLIVER dashboard
// only renders this when stripeStatus indicates charges_enabled is not
// true.
import { useState, useEffect } from "react";
import { CreditCard, AlertCircle } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";

// Mirrors feeBreakdown() in oliver-api lib/iaFee.js.
interface FeeBreakdown {
  tier: string;
  stripe: { percent: number; flat: number; note: string };
  ia: { percent: number; flat: number; cap: number | null; note: string };
  blendedCard: { percent: number; flat: number; label: string };
}

interface ConnectStartResponse {
  url?: string;
  account_id?: string;
  mode?: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

/** Parse the OLIVER fetch wrapper's thrown error string back into the
 *  underlying JSON body (best effort). oliverFetch throws
 *  `OLIVER API ${status}: ${text}` — we pull `text` and JSON.parse it. */
function parseApiError(e: unknown): { status: number | null; body: ApiErrorBody | null; raw: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/^OLIVER API (\d+): (.*)$/s);
  if (!m) return { status: null, body: null, raw };
  const status = Number(m[1]);
  try {
    return { status, body: JSON.parse(m[2]) as ApiErrorBody, raw };
  } catch {
    return { status, body: null, raw };
  }
}

export function SetupPaymentsCard() {
  const { post, get } = useOliverApi();
  const [pending, setPending] = useState<"express" | "standard" | null>(null);

  // The tenant's REAL blended rate (Stripe + IA platform fee) for their tier.
  // This card used to hardcode "2.9% + $0.30" and hand-wave the IA portion as
  // "may add a small platform fee", which understated what the merchant
  // actually pays. /tier-limits/my-fees resolves it from their subscription.
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  useEffect(() => {
    let alive = true;
    get("/tier-limits/my-fees")
      .then((d) => { if (alive && d) setFees(d as FeeBreakdown); })
      .catch(() => { /* non-fatal: fall back to the generic line below */ });
    return () => { alive = false; };
  }, [get]);
  // We track two error slots so users can see "Standard is unavailable"
  // without it bleeding into a separate Express failure.
  const [expressError, setExpressError] = useState<string | null>(null);
  const [standardError, setStandardError] = useState<string | null>(null);
  // Sticky 503 banner — once the user discovers Standard is not yet
  // configured we keep the inline note even after the spinner clears so
  // they don't keep clicking the broken button.
  const [oauthUnavailable, setOauthUnavailable] = useState(false);

  async function launchExpress() {
    setPending("express");
    setExpressError(null);
    try {
      const r = await post<ConnectStartResponse>("/billing/connect/start", {
        return_url: typeof window !== "undefined" ? window.location.href : "",
      });
      if (!r?.url) {
        setExpressError("Stripe didn't return an onboarding URL. Please try again.");
        setPending(null);
        return;
      }
      // Full-page nav (not new tab) so the post-onboarding return URL
      // lands back on this same dashboard with ?stripe_connected=1.
      window.location.assign(r.url);
    } catch (e) {
      const { body, raw } = parseApiError(e);
      setExpressError(body?.message || raw || "Failed to start Stripe setup.");
      setPending(null);
    }
  }

  async function launchStandardOAuth() {
    setPending("standard");
    setStandardError(null);
    try {
      const r = await post<ConnectStartResponse>("/billing/connect/oauth-start", {
        return_url: typeof window !== "undefined" ? window.location.href : "",
      });
      if (!r?.url) {
        setStandardError("Stripe didn't return an authorization URL. Please try again.");
        setPending(null);
        return;
      }
      window.location.assign(r.url);
    } catch (e) {
      const { status, body, raw } = parseApiError(e);
      // 503 stripe_oauth_not_configured — KV is missing the ca_* client
      // ID. Treat this as a soft "not available yet" and steer to
      // Express instead. Don't surface the raw error.
      if (status === 503 && body?.error === "stripe_oauth_not_configured") {
        setOauthUnavailable(true);
        setStandardError(null);
      } else {
        setStandardError(body?.message || raw || "Failed to start Stripe linking.");
      }
      setPending(null);
    }
  }

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(135deg, #FEF9C3 0%, #FEF3C7 100%)",
        border: "2px solid #FEC82C",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 40, height: 40, flexShrink: 0,
            background: "#1A3A4A", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <CreditCard className="h-5 w-5" style={{ color: "#FEC82C" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A3A4A", marginBottom: 4 }}>
            Set up payments to start invoicing
          </div>
          <div style={{ fontSize: 12, color: "#3F3F46", lineHeight: 1.5, marginBottom: 14 }}>
            OLIVER uses Stripe to process customer payments. Choose how you want to connect.
          </div>

          {oauthUnavailable && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                background: "#FEF3C7", border: "1px solid #FBBF24",
                borderRadius: 6, padding: "8px 10px", marginBottom: 12,
                fontSize: 11, color: "#78350F", lineHeight: 1.4,
              }}
            >
              <AlertCircle className="h-3.5 w-3.5" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Linking an existing Stripe account isn't available yet. Use <strong>Set one up for me</strong> instead — you can still use your existing Stripe email so payouts land in the same bank.
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={launchExpress}
              disabled={pending !== null}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 6, border: "none",
                background: "#1A3A4A", color: "#fff",
                fontSize: 13, fontWeight: 600,
                cursor: pending !== null ? "not-allowed" : "pointer",
                opacity: pending !== null ? 0.6 : 1,
              }}
            >
              {pending === "express" && (
                <span
                  style={{
                    display: "inline-block", width: 12, height: 12,
                    border: "2px solid #FEC82C", borderTopColor: "transparent",
                    borderRadius: "50%", animation: "oliver-spin 0.7s linear infinite",
                  }}
                />
              )}
              {pending === "express" ? "Opening Stripe…" : "Set one up for me"}
            </button>

            <button
              type="button"
              onClick={launchStandardOAuth}
              disabled={pending !== null || oauthUnavailable}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 6,
                background: "#fff", color: "#1A3A4A",
                border: "1px solid #1A3A4A",
                fontSize: 13, fontWeight: 600,
                cursor: (pending !== null || oauthUnavailable) ? "not-allowed" : "pointer",
                opacity: (pending !== null || oauthUnavailable) ? 0.55 : 1,
              }}
            >
              {pending === "standard" && (
                <span
                  style={{
                    display: "inline-block", width: 12, height: 12,
                    border: "2px solid #1A3A4A", borderTopColor: "transparent",
                    borderRadius: "50%", animation: "oliver-spin 0.7s linear infinite",
                  }}
                />
              )}
              {pending === "standard" ? "Opening Stripe…" : "I already have a Stripe account"}
            </button>
          </div>

          {(expressError || standardError) && (
            <div
              style={{
                marginTop: 10, padding: "8px 10px",
                background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 6,
                fontSize: 11, color: "#991B1B", lineHeight: 1.4,
              }}
            >
              {expressError || standardError}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 10, color: "#5A5A5A", lineHeight: 1.5 }}>
            {fees ? (
              <>
                Payment processing is{" "}
                <strong style={{ color: "#2A2A2A" }}>{fees.blendedCard.label}</strong> on your{" "}
                {fees.tier.charAt(0).toUpperCase() + fees.tier.slice(1)} plan.{" "}
              </>
            ) : (
              <>Payment processing fees apply to each transaction. </>
            )}
            See{" "}
            <a href="/app/services/oliver_fees" style={{ color: "#1A7DB5", textDecoration: "none" }}>
              Fees &amp; Terms
            </a>{" "}
            for the full Stripe and Intelligent Analytics breakdown.
          </div>
        </div>
      </div>
    </div>
  );
}

export default SetupPaymentsCard;
