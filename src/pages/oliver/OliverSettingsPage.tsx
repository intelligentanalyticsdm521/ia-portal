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

interface InvoiceTemplate {
  logoUrl: string | null;
  accentColor: string;
  invoiceNumberPrefix: string;
  terms: string;
  footerNote: string;
  googleReviewUrl: string | null;
}

function InvoicePreview({ tpl, businessName, email, phone }: { tpl: InvoiceTemplate; businessName: string; email?: string; phone?: string }) {
  const accent = tpl.accentColor || "#1A3A4A";
  const sample = {
    invoiceNumber: `${tpl.invoiceNumberPrefix || "INV-"}00042`,
    issued: new Date().toLocaleDateString(),
    due: new Date(Date.now() + 14 * 86400000).toLocaleDateString(),
    customer: "Sample Customer Inc.",
    customerAddr: "123 Main St, Springfield IL 62701",
    items: [
      { desc: "Premium service package", qty: 1, price: 299, total: 299 },
      { desc: "Setup fee (one-time)", qty: 1, price: 99, total: 99 },
      { desc: "Sales tax 6%", qty: 1, price: 23.88, total: 23.88, isTax: true },
    ],
    subtotal: 398,
    tax: 23.88,
    total: 421.88,
  };

  return (
    <div className="bg-white rounded shadow-md overflow-hidden text-xs">
      {/* Header strip in tenant's accent color */}
      <div className="px-5 py-4" style={{ backgroundColor: accent, color: "#FFFFFF" }}>
        <div className="flex items-start justify-between">
          <div>
            {tpl.logoUrl ? (
              <img src={tpl.logoUrl} alt="logo" className="h-8 mb-2 bg-white rounded p-1" onError={(e) => (e.currentTarget.style.display = "none")} />
            ) : null}
            <div className="font-bold text-base">{businessName}</div>
            <div className="text-[10px] opacity-90 mt-0.5">{email}{email && phone ? " · " : ""}{phone}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tracking-wide">INVOICE</div>
            <div className="text-[10px] opacity-90 mt-0.5">{sample.invoiceNumber}</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Bill to</div>
          <div className="text-slate-800 mt-1">{sample.customer}</div>
          <div className="text-slate-500">{sample.customerAddr}</div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="text-slate-500">Issued: <span className="text-slate-800 font-medium">{sample.issued}</span></div>
          <div className="text-slate-500">Due: <span className="text-slate-800 font-medium">{sample.due}</span></div>
        </div>
      </div>

      <table className="w-full text-[10px]">
        <thead style={{ backgroundColor: accent, color: "#FFFFFF" }}>
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">Description</th>
            <th className="px-2 py-1.5 text-right font-semibold w-10">Qty</th>
            <th className="px-2 py-1.5 text-right font-semibold w-16">Unit</th>
            <th className="px-2 py-1.5 text-right font-semibold w-16">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sample.items.map((it, i) => (
            <tr key={i} className={`border-b border-gray-100 ${it.isTax ? "bg-amber-50/60" : ""}`}>
              <td className="px-3 py-1.5">{it.desc}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{it.qty}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">${it.price.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">${it.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-5 py-3 flex justify-end">
        <div className="w-44 space-y-1 text-[10px]">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">${sample.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Tax</span><span className="tabular-nums">${sample.tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold border-t border-gray-200 pt-1" style={{ color: accent }}>
            <span>Total</span><span className="tabular-nums">${sample.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mx-5 mb-3 rounded text-center py-2" style={{ backgroundColor: accent, color: "#FFFFFF" }}>
        <div className="text-[10px] font-bold tracking-wide">PAY THIS INVOICE ONLINE</div>
        <div className="text-[9px] opacity-90 mt-0.5">buy.stripe.com/your-link-here</div>
      </div>

      {(tpl.terms || tpl.footerNote) && (
        <div className="px-5 pb-4 text-[9px] text-slate-500 border-t border-gray-100 pt-2">
          {tpl.terms && <div><span className="font-semibold">Terms:</span> {tpl.terms}</div>}
          {tpl.footerNote && <div className="mt-0.5">{tpl.footerNote}</div>}
        </div>
      )}
    </div>
  );
}

export function OliverSettingsPage() {
  const { get, post, patch, ready } = useOliverApi();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [tpl, setTpl] = useState<InvoiceTemplate | null>(null);
  const [tplDraft, setTplDraft] = useState<InvoiceTemplate | null>(null);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMessage, setTplMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [stripeAction, setStripeAction] = useState<"idle" | "connecting" | "syncing">("idle");
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st, t] = await Promise.all([
        get<TenantSettings>("/settings"),
        get<StripeStatus>("/settings/stripe"),
        get<InvoiceTemplate>("/settings/invoice-template"),
      ]);
      setSettings(s);
      setStripe(st);
      setTpl(t);
      setTplDraft(t);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  async function saveTemplate() {
    if (!tplDraft) return;
    setTplSaving(true);
    setTplMessage(null);
    try {
      await patch("/settings/invoice-template", tplDraft);
      setTpl(tplDraft);
      setTplMessage("Saved.");
      setTimeout(() => setTplMessage(null), 2500);
    } catch (err) {
      setTplMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setTplSaving(false);
    }
  }

  function tplChanged(): boolean {
    if (!tpl || !tplDraft) return false;
    return tpl.logoUrl !== tplDraft.logoUrl
      || tpl.accentColor !== tplDraft.accentColor
      || tpl.invoiceNumberPrefix !== tplDraft.invoiceNumberPrefix
      || tpl.terms !== tplDraft.terms
      || tpl.footerNote !== tplDraft.footerNote
      || tpl.googleReviewUrl !== tplDraft.googleReviewUrl;
  }

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Invoice template</h2>
            {tplMessage && <span className="text-xs text-slate-500">{tplMessage}</span>}
          </div>
          {tplDraft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Editor */}
              <div className="rounded-xl bg-white ring-1 ring-gray-200 p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Logo URL</span>
                    <input
                      type="url"
                      placeholder="https://yourdomain.com/logo.png"
                      value={tplDraft.logoUrl ?? ""}
                      onChange={(e) => setTplDraft({ ...tplDraft, logoUrl: e.target.value || null })}
                      className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Accent color</span>
                    <div className="flex gap-2 mt-1 items-center">
                      <input
                        type="color"
                        value={tplDraft.accentColor}
                        onChange={(e) => setTplDraft({ ...tplDraft, accentColor: e.target.value })}
                        className="h-9 w-14 rounded ring-1 ring-gray-300"
                      />
                      <input
                        type="text"
                        value={tplDraft.accentColor}
                        onChange={(e) => setTplDraft({ ...tplDraft, accentColor: e.target.value })}
                        className="flex-1 rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Invoice number prefix</span>
                    <input
                      type="text"
                      placeholder="INV-"
                      value={tplDraft.invoiceNumberPrefix}
                      onChange={(e) => setTplDraft({ ...tplDraft, invoiceNumberPrefix: e.target.value })}
                      className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Payment terms</span>
                    <input
                      type="text"
                      placeholder="Due upon receipt"
                      value={tplDraft.terms}
                      onChange={(e) => setTplDraft({ ...tplDraft, terms: e.target.value })}
                      className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Footer note</span>
                    <textarea
                      rows={2}
                      placeholder="Thank you for your business!"
                      value={tplDraft.footerNote}
                      onChange={(e) => setTplDraft({ ...tplDraft, footerNote: e.target.value })}
                      className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">Google review URL <span className="text-slate-400 font-normal">(used in review-request automation)</span></span>
                    <input
                      type="url"
                      placeholder="https://g.page/r/.../review"
                      value={tplDraft.googleReviewUrl ?? ""}
                      onChange={(e) => setTplDraft({ ...tplDraft, googleReviewUrl: e.target.value || null })}
                      className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={saveTemplate}
                    disabled={tplSaving || !tplChanged()}
                    className="rounded-lg bg-oliver-teal text-white px-4 py-2 text-sm font-medium hover:bg-oliver-teal-600 disabled:opacity-50"
                  >
                    {tplSaving ? "Saving…" : "Save template"}
                  </button>
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-xl bg-slate-100 ring-1 ring-gray-200 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Live preview</div>
                <InvoicePreview tpl={tplDraft} businessName={settings?.tenantFullName || settings?.tenantName || "Your Business"} email={settings?.email} phone={settings?.phone} />
              </div>
            </div>
          )}
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
