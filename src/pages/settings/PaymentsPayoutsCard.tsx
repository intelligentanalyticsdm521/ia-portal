// Payments & payouts — the money side of Plan & Pricing.
//
// Three things a business needs and had nowhere to see:
//
//   1. What we actually charge them per transaction, plus the link to the full
//      breakdown. Brandon: "this is where you were supposed to put their current
//      fees and then the link to the full fee breakdown list."
//   2. When their money reaches their bank. Both live accounts turned out to be
//      on MANUAL payouts, which means money sits in Stripe until someone pushes
//      it. Nobody was pushing it. That gets a loud warning here.
//   3. A route to change the payout bank.
//
// The split is deliberate. The SCHEDULE is changed here, in our portal — there
// is already an endpoint for it and no reason to send anyone to Stripe. The
// BANK cannot be: Stripe requires the account holder to authenticate before
// changing where money lands, and no link we generate can skip that. So the
// bank is an honest hand-off with a warning, not a pretend-inline experience.
import { useEffect, useState, useCallback, useMemo } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { ConnectComponentsProvider, ConnectAccountManagement } from "@stripe/react-connect-js";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";

interface FeeBreakdown {
  tier: string;
  stripe: { percent: number; flat: number; note: string };
  ia: { percent: number; flat: number; cap: number | null; note: string };
  blendedCard: { percent: number; flat: number; label: string };
}

interface PayoutSchedule {
  interval?: string;
  delay_days?: number;
  weekly_anchor?: string;
  monthly_anchor?: number;
}

interface PayoutsResp {
  connected?: boolean;
  /** true  = we control this account -> embed Stripe's form here.
   *  false = the business connected their OWN Stripe -> send them to their
   *          dashboard, where they genuinely can sign in.
   *  null  = not resolved yet. Say so; don't pick a journey by guessing. */
  is_controller?: boolean | null;
  platform?: boolean;
  note?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  payout_schedule?: PayoutSchedule | null;
  balance?: { available?: { amount: number; currency: string }[] } | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Plain-English version of a Stripe payout schedule. */
function describeSchedule(s: PayoutSchedule | null | undefined): string {
  if (!s?.interval) return "Not set";
  const delay = s.delay_days != null ? ` about ${s.delay_days} business day${s.delay_days === 1 ? "" : "s"} after a payment clears` : "";
  switch (s.interval) {
    case "daily":   return `Automatically every day,${delay || " once funds clear"}`;
    case "weekly":  return `Automatically every week${s.weekly_anchor ? ` on ${s.weekly_anchor}` : ""}${delay}`;
    case "monthly": return `Automatically every month${s.monthly_anchor ? ` on day ${s.monthly_anchor}` : ""}${delay}`;
    case "manual":  return "Manual — money stays in Stripe until someone sends it";
    default:        return s.interval;
  }
}

export function PaymentsPayoutsCard() {
  const { get, post } = useOliverApi();
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  const [payouts, setPayouts] = useState<PayoutsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Fees and payouts are independent — one failing must not blank the other.
    const [f, p] = await Promise.all([
      get<FeeBreakdown>("/tier-limits/my-fees").catch(() => null),
      get<PayoutsResp>("/settings/stripe/payouts").catch(() => null),
    ]);
    setFees(f);
    setPayouts(p);
    setLoading(false);
  }, [get]);

  useEffect(() => { void load(); }, [load]);

  async function setSchedule(interval: string) {
    setSaving(true);
    setMsg(null);
    try {
      await post("/settings/stripe/payout-schedule", { interval });
      await load();
      // Re-read rather than trusting the write: Stripe can accept the call and
      // still not apply the schedule on some account configurations.
      setMsg({ kind: "ok", text: "Payout schedule updated." });
    } catch (e) {
      // Stripe restricts who may set a payout schedule on some account types.
      // If it refuses, say so and point at the place that can — do not leave a
      // spinner and a shrug.
      setMsg({
        kind: "err",
        text: `Couldn't change the schedule: ${apiErrorMessage(e)}. You can set it directly in Stripe under Settings → Payouts.`,
      });
    } finally {
      setSaving(false);
    }
  }

  // Stripe's own account UI, rendered inside this page.
  //
  // The first version of this button sent people to dashboard.stripe.com and
  // they hit a wall: "Your business is connected to a Platform... Use that
  // Platform to access your account dashboard." Our connected accounts are
  // platform-controlled, so Stripe refuses direct sign-in on purpose and points
  // them back at us. This is what it is pointing at.
  //
  // The session is minted only when the panel is opened, not on page load.
  const [bankOpen, setBankOpen] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);

  // Opening the panel does two things: proves the session can be minted, and
  // gets the publishable key. The key comes from the API rather than a
  // build-time VITE_ var — routes/payments.js already serves it that way, and a
  // second source is one more thing to drift out of sync.
  useEffect(() => {
    if (!bankOpen || pubKey) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await post<{ client_secret: string; publishable_key: string }>(
          "/settings/stripe/account-session",
        );
        if (cancelled) return;
        if (!r?.publishable_key) throw new Error("Stripe isn't configured on the server.");
        setPubKey(r.publishable_key);
      } catch (e) {
        if (!cancelled) setConnectErr(apiErrorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [bankOpen, pubKey, post]);

  const stripeConnect = useMemo(() => {
    if (!bankOpen || !pubKey) return null;
    return loadConnectAndInitialize({
      publishableKey: pubKey,
      // Must return a FRESH secret on every call — Connect.js also uses this to
      // refresh the session when it expires.
      fetchClientSecret: async () => {
        const r = await post<{ client_secret: string }>("/settings/stripe/account-session");
        if (!r?.client_secret) throw new Error("No client secret returned");
        return r.client_secret;
      },
      appearance: { variables: { colorPrimary: "#1A7DB5" } },
    });
  }, [bankOpen, pubKey, post]);

  if (loading) {
    return <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-500">Loading payments &amp; payouts…</div>;
  }

  // Platform account, or nobody connected yet — nothing useful to show.
  if (payouts?.platform) return null;
  // The endpoint always states this outright — infer nothing.
  const connected = payouts?.connected === true;

  // Two different businesses, two different journeys.
  const weControl = payouts?.is_controller === true;
  const theyControl = payouts?.is_controller === false;

  const schedule = payouts?.payout_schedule;
  const isManual = schedule?.interval === "manual";

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Payments &amp; payouts</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          What you're charged per transaction, and when your money reaches your bank.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {/* ── Fees ───────────────────────────────────────────────────────── */}
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Your processing fee</div>
            <a href="/app/services/oliver_fees" className="text-xs text-[#1A7DB5] hover:underline">
              See the full breakdown →
            </a>
          </div>
          {fees ? (
            <>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
                {fees.blendedCard.label}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                On the <span className="font-medium capitalize">{fees.tier}</span> plan.{" "}
                {fees.ia.percent === 0 && fees.ia.flat === 0
                  ? "No platform fee on this plan — this is Stripe's rate."
                  : `Includes Stripe's ${fees.stripe.percent}% + ${money(fees.stripe.flat)}${
                      fees.ia.cap != null ? `, and our portion is capped at ${money(fees.ia.cap)} per transaction` : ""
                    }.`}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-500">Couldn't load your fee — the full breakdown still works.</div>
          )}
        </div>

        {/* ── Payout schedule ────────────────────────────────────────────── */}
        <div className="px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">When you get paid</div>

          {!connected ? (
            <div className="mt-1 text-sm text-gray-500">
              Connect a payment account first and your payout schedule will appear here.
            </div>
          ) : (
            <>
              <div className="mt-1 text-sm text-gray-900">{describeSchedule(schedule)}</div>

              {/* Manual is the setting nobody chooses on purpose, and its
                  symptom is silence: payments succeed and the bank stays empty.
                  Both live accounts were on it. */}
              {isManual && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <span className="font-semibold">Your money isn't being sent to your bank.</span>{" "}
                  On a manual schedule, payments collect in Stripe and stay there until someone sends them.
                  Most businesses want <span className="font-semibold">Daily</span>.
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(["daily", "weekly", "monthly"] as const).map((i) => (
                  <button
                    key={i}
                    onClick={() => setSchedule(i)}
                    disabled={saving || schedule?.interval === i}
                    className={`rounded border px-2.5 py-1 text-xs capitalize ${
                      schedule?.interval === i
                        ? "border-[#1A7DB5] bg-[#1A7DB5] text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50"
                    }`}
                  >
                    {i}
                  </button>
                ))}
                {saving && <span className="text-xs text-gray-500">Saving…</span>}
              </div>
            </>
          )}
        </div>

        {/* ── Bank account ───────────────────────────────────────────────── */}
        <div className="px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Bank account</div>
          <div className="mt-1 text-sm text-gray-600">
            Your bank details live with Stripe, not with us — we never see your account number.
          </div>

          {/* An account the business connected themselves is theirs: they have a
              real Stripe login, and Stripe won't even return their bank details
              to us. Sending them to their own dashboard is the correct answer
              here, not a fallback. */}
          {theyControl ? (
            <>
              <div className="mt-1 text-xs text-gray-500">
                You connected your own Stripe account, so you manage your bank details there.
              </div>
              <a
                href="https://dashboard.stripe.com/settings/payouts"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-[#1A7DB5] hover:border-gray-300"
              >
                Open your Stripe dashboard →
              </a>
            </>
          ) : weControl ? (
            <button
              onClick={() => { setConnectErr(null); setBankOpen((v) => !v); }}
              disabled={!connected}
              className="mt-2 rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-[#1A7DB5] hover:border-gray-300 disabled:opacity-50"
            >
              {bankOpen ? "Close" : "Update bank information"}
            </button>
          ) : connected ? (
            // is_controller is null — unresolved. Offer nothing rather than the
            // wrong thing; the next capability sync fills it in.
            <div className="mt-2 text-xs text-gray-500">
              Still checking how this account is set up. Refresh in a moment, or tell us and we'll look.
            </div>
          ) : null}

          {connectErr && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {connectErr}
            </div>
          )}

          {weControl && bankOpen && !stripeConnect && !connectErr && (
            <div className="mt-2 text-xs text-gray-500">Loading Stripe…</div>
          )}

          {weControl && bankOpen && stripeConnect && (
            <div className="mt-3 rounded-md border border-gray-200 p-2">
              <ConnectComponentsProvider connectInstance={stripeConnect}>
                <ConnectAccountManagement
                  onLoadError={(e) =>
                    setConnectErr(
                      `Stripe couldn't load the account form: ${e.error?.message || "unknown error"}. Try again, or tell us and we'll sort it.`,
                    )
                  }
                />
              </ConnectComponentsProvider>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`border-t px-4 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
