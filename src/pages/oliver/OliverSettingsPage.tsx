import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface TenantSettings {
  tenantName?: string;
  tenantFullName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
}

interface StripeStatus {
  connected: boolean;
  stripeAccountId?: string;
  type?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  readyToCharge?: boolean;
}

export function OliverSettingsPage() {
  const { get, post, ready } = useOliverApi();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [stripeAction, setStripeAction] = useState<"idle" | "connecting" | "syncing">("idle");
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st] = await Promise.all([
        get<TenantSettings>("/settings"),
        get<StripeStatus>("/settings/stripe"),
      ]);
      setSettings(s);
      setStripe(st);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, refresh]);

  // Handle return-from-Stripe via querystring
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("stripe");
    if (!flag) return;

    if (flag === "success") {
      setStripeMessage("Onboarding complete — syncing status from Stripe…");
      (async () => {
        try {
          await post<StripeStatus>("/settings/stripe/sync");
          await refresh();
          setStripeMessage("Stripe account connected and ready to accept payments.");
        } catch (err) {
          setStripeMessage(`Status sync failed: ${(err as Error).message}`);
        }
      })();
    } else if (flag === "refresh") {
      setStripeMessage("Onboarding link expired — generating a fresh one…");
      (async () => {
        try {
          const res = await post<{ onboardingUrl: string }>("/settings/stripe/refresh");
          if (res?.onboardingUrl) window.location.href = res.onboardingUrl;
        } catch (err) {
          setStripeMessage(`Refresh failed: ${(err as Error).message}`);
        }
      })();
    }

    // Clean the querystring once handled
    const url = new URL(window.location.href);
    url.searchParams.delete("stripe");
    window.history.replaceState({}, "", url.toString());
  }, [ready, post, refresh]);

  async function startStripeConnect() {
    setStripeAction("connecting");
    setStripeMessage(null);
    try {
      const res = await post<{ onboardingUrl: string }>("/settings/stripe/connect");
      if (res?.onboardingUrl) {
        window.location.href = res.onboardingUrl;
      } else {
        setStripeMessage("Backend did not return an onboarding URL.");
      }
    } catch (err) {
      setStripeMessage(`Connect failed: ${(err as Error).message}`);
    } finally {
      setStripeAction("idle");
    }
  }

  async function syncStripe() {
    setStripeAction("syncing");
    setStripeMessage(null);
    try {
      await post<StripeStatus>("/settings/stripe/sync");
      await refresh();
      setStripeMessage("Status refreshed.");
    } catch (err) {
      setStripeMessage(`Sync failed: ${(err as Error).message}`);
    } finally {
      setStripeAction("idle");
    }
  }

  const businessRows: [string, string][] = [
    ["Business Name", settings?.tenantFullName || settings?.tenantName || "—"],
    ["Email", settings?.email || "—"],
    ["Phone", settings?.phone || "—"],
    ["Website", settings?.website || "—"],
    ["Address", settings?.address || "—"],
  ];

  const renderStripeStatus = () => {
    if (!stripe || !stripe.connected) {
      return (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Connect your bank to accept payments</h3>
              <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                OLIVER sends invoices and collects payments through Stripe. Money flows directly to your
                bank — never to Intelligent Analytics. Setup takes about 5 minutes: business name, EIN,
                bank account, and an ID photo.
              </p>
            </div>
            <button
              onClick={startStripeConnect}
              disabled={stripeAction !== "idle"}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {stripeAction === "connecting" ? "Opening Stripe…" : "Connect Stripe"}
            </button>
          </div>
        </div>
      );
    }

    const ready = stripe.readyToCharge;
    const incomplete = stripe.connected && !ready;

    return (
      <div className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">
              Stripe — {stripe.type === "express" ? "Express" : "Standard"} account
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-y-2 gap-x-6 text-sm max-w-md">
              <div className="text-slate-500">Account ID</div>
              <div className="text-slate-700 font-mono text-xs">{stripe.stripeAccountId}</div>

              <div className="text-slate-500">Charges enabled</div>
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  stripe.chargesEnabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {stripe.chargesEnabled ? "Yes" : "Pending"}
                </span>
              </div>

              <div className="text-slate-500">Payouts enabled</div>
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  stripe.payoutsEnabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {stripe.payoutsEnabled ? "Yes" : "Pending"}
                </span>
              </div>

              <div className="text-slate-500">Onboarding submitted</div>
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  stripe.detailsSubmitted ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {stripe.detailsSubmitted ? "Yes" : "Incomplete"}
                </span>
              </div>
            </div>

            {incomplete && (
              <p className="mt-4 text-sm text-amber-700">
                Onboarding isn't quite complete. Click "Continue Setup" to finish in Stripe — once charges
                are enabled, OLIVER can start sending invoices on your behalf.
              </p>
            )}
            {ready && (
              <p className="mt-4 text-sm text-green-700">
                Ready to accept payments. Invoices you send through OLIVER will route directly to your bank.
              </p>
            )}
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            {incomplete && (
              <button
                onClick={startStripeConnect}
                disabled={stripeAction !== "idle"}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Continue Setup
              </button>
            )}
            <button
              onClick={syncStripe}
              disabled={stripeAction !== "idle"}
              className="rounded-lg bg-white ring-1 ring-gray-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {stripeAction === "syncing" ? "Syncing…" : "Refresh Status"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <OliverPageWrapper title="Settings" subtitle="Tenant configuration" error={error} loading={loading}>
      <div className="space-y-6">
        {stripeMessage && (
          <div className="rounded-lg bg-blue-50 ring-1 ring-blue-200 px-4 py-3 text-sm text-blue-800">
            {stripeMessage}
          </div>
        )}

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500 mb-3">Payments</h2>
          {renderStripeStatus()}
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500 mb-3">Business Profile</h2>
          <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {businessRows.map(([key, value]) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-slate-700 w-48">{key}</td>
                    <td className="px-4 py-3 text-slate-600">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </OliverPageWrapper>
  );
}
