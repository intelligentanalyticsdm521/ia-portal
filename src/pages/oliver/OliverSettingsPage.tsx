import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";

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
    <div style={{ background: "#fff", borderRadius: 6, overflow: "hidden", fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "16px 18px", background: accent, color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {tpl.logoUrl ? (
              <img
                src={tpl.logoUrl} alt="logo"
                style={{ height: 28, marginBottom: 6, background: "#fff", borderRadius: 3, padding: 2 }}
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : null}
            <div style={{ fontWeight: 700, fontSize: 14 }}>{businessName}</div>
            <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{email}{email && phone ? " · " : ""}{phone}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>INVOICE</div>
            <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{sample.invoiceNumber}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10 }}>
        <div>
          <div style={{ fontWeight: 700, textTransform: "uppercase", color: "#5A7A8A", letterSpacing: 0.3 }}>Bill to</div>
          <div style={{ color: "#0B1C24", marginTop: 2 }}>{sample.customer}</div>
          <div style={{ color: "#5A7A8A" }}>{sample.customerAddr}</div>
        </div>
        <div style={{ textAlign: "right", color: "#5A7A8A" }}>
          <div>Issued: <span style={{ color: "#0B1C24", fontWeight: 500 }}>{sample.issued}</span></div>
          <div style={{ marginTop: 2 }}>Due: <span style={{ color: "#0B1C24", fontWeight: 500 }}>{sample.due}</span></div>
        </div>
      </div>

      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
        <thead style={{ background: accent, color: "#fff" }}>
          <tr>
            <th style={{ padding: "5px 12px", textAlign: "left", fontWeight: 600 }}>Description</th>
            <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, width: 36 }}>Qty</th>
            <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, width: 56 }}>Unit</th>
            <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, width: 56 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sample.items.map((it, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f4f6", background: it.isTax ? "#FEF9E7" : "transparent" }}>
              <td style={{ padding: "5px 12px" }}>{it.desc}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{it.qty}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>${it.price.toFixed(2)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>${it.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: "10px 18px", display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: 180, fontSize: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#5A7A8A" }}>
            <span>Subtotal</span><span style={{ fontFamily: "monospace" }}>${sample.subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#5A7A8A", marginTop: 2 }}>
            <span>Tax</span><span style={{ fontFamily: "monospace" }}>${sample.tax.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", marginTop: 4, paddingTop: 4, color: accent }}>
            <span>Total</span><span style={{ fontFamily: "monospace" }}>${sample.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={{ margin: "0 18px 12px", background: accent, color: "#fff", textAlign: "center", padding: "6px 0", borderRadius: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>PAY THIS INVOICE ONLINE</div>
        <div style={{ fontSize: 9, opacity: 0.9, marginTop: 1 }}>buy.stripe.com/your-link-here</div>
      </div>

      {(tpl.terms || tpl.footerNote) && (
        <div style={{ padding: "8px 18px 14px", fontSize: 9, color: "#5A7A8A", borderTop: "1px solid #f0f4f6" }}>
          {tpl.terms && <div><strong>Terms:</strong> {tpl.terms}</div>}
          {tpl.footerNote && <div style={{ marginTop: 2 }}>{tpl.footerNote}</div>}
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

  return (
    <OliverPageWrapper title="Business Setup" subtitle="Tenant configuration" error={error} loading={loading}>
      <PageHeader
        title="Business Setup"
        subtitle="Stripe Connect, invoice template, and business profile"
      />

      {stripeMessage && (
        <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)" }}>
          <div style={{ fontSize: 12, color: "#0C4A60" }}>{stripeMessage}</div>
        </div>
      )}

      {/* Payments / Stripe Connect */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Payments — Stripe Connect</div>
            <div className="card-sub">Money flows directly from your customers to your bank — never to Intelligent Analytics</div>
          </div>
        </div>

        {!stripe || !stripe.connected ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "8px 0" }}>
            <div style={{ flex: 1, fontSize: 12, color: "#0B1C24", lineHeight: 1.5 }}>
              OLIVER sends invoices and collects payments through Stripe. Setup takes about 5 minutes:
              business name, EIN, bank account, and an ID photo. Once connected, you can send invoices,
              accept card / ACH payments, and Stripe sends money directly to your bank.
            </div>
            <Button variant="primary" onClick={startStripeConnect} disabled={stripeAction !== "idle"}>
              {stripeAction === "connecting" ? "Opening Stripe…" : "Connect Stripe"}
            </Button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", marginBottom: 6 }}>
                  {stripe.type === "express" ? "Stripe Express" : "Stripe Standard"} — {stripe.stripeAccountId}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "5px 16px", fontSize: 11, alignItems: "center" }}>
                  <span style={{ color: "#5A7A8A" }}>Charges enabled</span>
                  <StatusPill ok={!!stripe.chargesEnabled} />
                  <span style={{ color: "#5A7A8A" }}>Payouts enabled</span>
                  <StatusPill ok={!!stripe.payoutsEnabled} />
                  <span style={{ color: "#5A7A8A" }}>Onboarding submitted</span>
                  <StatusPill ok={!!stripe.detailsSubmitted} />
                </div>

                {!stripe.readyToCharge && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#B45309", padding: "8px 10px", background: "#FEF3C7", borderRadius: 6 }}>
                    Onboarding isn't quite complete. Click <strong>Continue setup</strong> to finish in Stripe —
                    once charges are enabled, OLIVER can start sending invoices on your behalf.
                  </div>
                )}
                {stripe.readyToCharge && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#047857", padding: "8px 10px", background: "#D1FAE5", borderRadius: 6 }}>
                    Ready to accept payments. Invoices you send through OLIVER will route directly to your bank.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                {!stripe.readyToCharge && (
                  <Button variant="primary" onClick={startStripeConnect} disabled={stripeAction !== "idle"}>
                    Continue setup
                  </Button>
                )}
                <Button variant="secondary" onClick={syncStripe} disabled={stripeAction !== "idle"}>
                  {stripeAction === "syncing" ? "Syncing…" : "Refresh status"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Template */}
      {tplDraft && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Invoice template</div>
              <div className="card-sub">Customize the logo, colors, prefix, terms, and footer that appear on every invoice you send</div>
            </div>
            {tplMessage && <span style={{ fontSize: 11, color: "#5A7A8A" }}>{tplMessage}</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Editor */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Logo URL">
                <input
                  type="url" placeholder="https://yourdomain.com/logo.png"
                  value={tplDraft.logoUrl ?? ""}
                  onChange={(e) => setTplDraft({ ...tplDraft, logoUrl: e.target.value || null })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Accent color">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={tplDraft.accentColor}
                    onChange={(e) => setTplDraft({ ...tplDraft, accentColor: e.target.value })}
                    style={{ height: 32, width: 50, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, padding: 0, cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={tplDraft.accentColor}
                    onChange={(e) => setTplDraft({ ...tplDraft, accentColor: e.target.value })}
                    style={{ ...inputStyle, fontFamily: "monospace", flex: 1 }}
                  />
                </div>
              </Field>
              <Field label="Invoice number prefix">
                <input
                  type="text" placeholder="INV-"
                  value={tplDraft.invoiceNumberPrefix}
                  onChange={(e) => setTplDraft({ ...tplDraft, invoiceNumberPrefix: e.target.value })}
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                />
              </Field>
              <Field label="Payment terms">
                <input
                  type="text" placeholder="Due upon receipt"
                  value={tplDraft.terms}
                  onChange={(e) => setTplDraft({ ...tplDraft, terms: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Footer note">
                <textarea
                  rows={2} placeholder="Thank you for your business!"
                  value={tplDraft.footerNote}
                  onChange={(e) => setTplDraft({ ...tplDraft, footerNote: e.target.value })}
                  style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
              </Field>
              <Field label="Google review URL (review-request automation)">
                <input
                  type="url" placeholder="https://g.page/r/.../review"
                  value={tplDraft.googleReviewUrl ?? ""}
                  onChange={(e) => setTplDraft({ ...tplDraft, googleReviewUrl: e.target.value || null })}
                  style={inputStyle}
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" onClick={saveTemplate} disabled={tplSaving || !tplChanged()}>
                  {tplSaving ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>

            {/* Live preview */}
            <div style={{ background: "#f3f6f8", padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Live preview
              </div>
              <InvoicePreview
                tpl={tplDraft}
                businessName={settings?.tenantFullName || settings?.tenantName || "Your Business"}
                email={settings?.email} phone={settings?.phone}
              />
            </div>
          </div>
        </div>
      )}

      {/* Business Profile */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Business profile</div>
            <div className="card-sub">Contact info shown on invoices, quotes, and the customer portal</div>
          </div>
        </div>
        <table className="tbl" style={{ marginTop: 0 }}>
          <tbody>
            {businessRows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 180, fontWeight: 500, color: "#5A7A8A" }}>{k}</td>
                <td style={{ color: "#0B1C24" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OliverPageWrapper>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 500,
      padding: "2px 8px", borderRadius: 999,
      background: ok ? "#D1FAE5" : "#FEF3C7",
      color: ok ? "#047857" : "#B45309",
    }}>
      {ok ? "Yes" : "Pending"}
    </span>
  );
}
