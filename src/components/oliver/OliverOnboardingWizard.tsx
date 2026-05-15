// OliverOnboardingWizard — the guided modal that gets a tenant from signup to
// "can send a paid invoice". Everything that needs connecting/configuring is
// here so a client understands all their settings in one pass.
//
// Steps:
//   1. Business Profile — editable; pulls the SHARED profile (core.tenants),
//      lets them fill/update, saves back to it (same data Organization
//      Settings shows). Flags incomplete if required fields missing.
//   2. Connect Stripe — Express hosted onboarding.
//   3. Templates — invoice/quote/proposal; branding pulled from the profile.
//   4. Customer Portal — what the customer sees; branding per tier.
//   5. Product Catalog — first offerings.
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { LogoPicker } from "./LogoPicker";
import { formatPhone } from "../../lib/formatPhone";

interface Api {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
  patch: <T>(p: string, body: unknown) => Promise<T>;
}

interface Settings {
  tenantFullName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  brandColorAccent?: string | null;
}
interface StripeStatus { connected: boolean; chargesEnabled?: boolean; readyToCharge?: boolean; }
interface Template {
  logoUrl: string | null;
  accentColor: string;
  invoiceNumberPrefix: string;
  terms: string;
  footerNote: string;
  googleReviewUrl: string | null;
}
interface OfferingDraft { name: string; price: string; }

const STEPS = ["Business Profile", "Payments", "Templates", "Customer Portal", "Catalog"] as const;

export function OliverOnboardingWizard({
  api, onClose, onFinished,
}: {
  api: Api;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [offerings, setOfferings] = useState<OfferingDraft[]>([{ name: "", price: "" }]);

  // Load ONCE on mount. Deliberately NOT keyed on `api`/props: the parent
  // passes a fresh api object every render and something on the dashboard
  // polls, so a prop-keyed effect would re-fetch every ~15s and wipe whatever
  // the user is typing. apiRef keeps the latest funcs without retriggering.
  const apiRef = useRef(api);
  apiRef.current = api;
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const a = apiRef.current;
        const [s, st, t] = await Promise.all([
          a.get<Settings>("/settings"),
          a.get<StripeStatus>("/settings/stripe").catch(() => ({ connected: false })),
          a.get<Template>("/settings/invoice-template").catch(() => null),
        ]);
        setSettings(s);
        setStripe(st);
        setTpl(t || {
          logoUrl: s.logoUrl ?? null,
          accentColor: s.brandColor || "#1A3A4A",
          invoiceNumberPrefix: "INV-",
          terms: "Due upon receipt",
          footerNote: "",
          googleReviewUrl: null,
        });
      } catch (e) {
        setErr((e as Error).message || "Failed to load your business profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setS = (patch: Partial<Settings>) => setSettings((p) => p ? { ...p, ...patch } : p);
  const setT = (patch: Partial<Template>) => setTpl((p) => p ? { ...p, ...patch } : p);

  const requiredMissing = settings ? [
    !settings.tenantFullName?.trim() && "Business name",
    !settings.email?.trim() && "Contact email",
    !settings.phone?.trim() && "Phone",
    !settings.address?.trim() && "Address",
  ].filter(Boolean) as string[] : [];

  async function persistStep(i: number): Promise<boolean> {
    setErr(null);
    try {
      setSaving(true);
      if (i === 0 && settings) {
        // Writes to the SHARED profile (core.tenants) — same record
        // Organization Settings edits.
        await api.patch("/settings", {
          tenantFullName: settings.tenantFullName ?? "",
          email: settings.email ?? "",
          phone: settings.phone ?? "",
          website: settings.website ?? "",
          address: settings.address ?? "",
          logoUrl: settings.logoUrl ?? "",
          brandColor: settings.brandColor ?? "",
          brandColorSecondary: settings.brandColorSecondary ?? "",
          brandColorAccent: settings.brandColorAccent ?? "",
        });
      } else if (i === 2 && tpl) {
        await api.patch("/settings/invoice-template", tpl);
      } else if (i === 4) {
        const valid = offerings.filter((o) => o.name.trim());
        for (const o of valid) {
          const r = await api.post<{ offering_id: string }>("/catalog/offerings", {
            name: o.name.trim(), requiresQuote: false, isSelfBookable: false,
          });
          const amt = Number(o.price);
          if (r.offering_id && amt > 0) {
            await api.post(`/catalog/offerings/${r.offering_id}/prices`, {
              pricingModel: "one_time", unitAmount: amt, currency: "USD", isDefault: true,
            }).catch(() => { /* offering created; price best-effort */ });
          }
        }
      }
      return true;
    } catch (e) {
      setErr((e as Error).message || "Could not save this step");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    const ok = await persistStep(step);
    if (!ok) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }

  async function finish() {
    setSaving(true);
    try {
      await api.post("/onboarding/complete");
      onFinished();
    } catch (e) {
      setErr((e as Error).message || "Could not mark onboarding complete");
      setSaving(false);
    }
  }

  async function connectStripe() {
    setSaving(true); setErr(null);
    try {
      const r = await api.post<{ onboardingUrl: string }>("/settings/stripe/connect");
      if (r?.onboardingUrl) window.location.href = r.onboardingUrl;
      else setErr("Stripe did not return an onboarding link. Try again shortly.");
    } catch (e) {
      setErr((e as Error).message || "Could not start Stripe onboarding");
    } finally {
      setSaving(false);
    }
  }

  const accent = tpl?.accentColor || settings?.brandColor || "#1A3A4A";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1A3A4A" }}>Get OLIVER ready</h2>
            <button onClick={onClose} aria-label="Close"
              style={{ background: "none", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 99, background: i < step ? "#059669" : i === step ? "#0C4A60" : "#E2E8F0" }} />
                <div style={{ fontSize: 10, marginTop: 5, fontWeight: i === step ? 700 : 500, color: i === step ? "#0C4A60" : i < step ? "#059669" : "#94A3B8" }}>
                  {i + 1}. {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#5A7A8A", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {err && (
                <div style={{ padding: "8px 12px", marginBottom: 14, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
                  {err}
                </div>
              )}

              {step === 0 && settings && (
                <Section title="Your business profile"
                  blurb="This is shared everywhere — invoices, quotes, your customer portal, and other Intelligent Analytics products. Set it once; you can edit it anytime under Organization Settings.">
                  <Grid>
                    <FieldRow label="Business name" req missing={!settings.tenantFullName?.trim()}>
                      <input style={inp} value={settings.tenantFullName || ""} onChange={(e) => setS({ tenantFullName: e.target.value })} placeholder="Your customer-facing name" />
                    </FieldRow>
                    <FieldRow label="Website">
                      <input style={inp} value={settings.website || ""} onChange={(e) => setS({ website: e.target.value })} placeholder="https://yourbusiness.com" />
                    </FieldRow>
                    <FieldRow label="Contact email" req missing={!settings.email?.trim()}>
                      <input style={inp} type="email" value={settings.email || ""} onChange={(e) => setS({ email: e.target.value })} placeholder="hello@yourbusiness.com" />
                    </FieldRow>
                    <FieldRow label="Phone" req missing={!settings.phone?.trim()}>
                      <input style={inp} value={settings.phone || ""} onChange={(e) => setS({ phone: formatPhone(e.target.value) })} placeholder="+1 (555) 555-5555" />
                    </FieldRow>
                  </Grid>
                  <FieldRow label="Address" req missing={!settings.address?.trim()}>
                    <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={settings.address || ""} onChange={(e) => setS({ address: e.target.value })} placeholder="123 Main St, Springfield IL 62701" />
                  </FieldRow>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 6 }}>Logo</div>
                    <LogoPicker
                      value={settings.logoUrl ?? null}
                      onChange={(url) => { setS({ logoUrl: url }); setT({ logoUrl: url }); }}
                      api={api}
                      website={settings.website}
                    />
                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 6 }}>Brand colors</div>
                    <ColorRow label="Primary" value={settings.brandColor || ""} fallback="#1A3A4A"
                      onChange={(v) => { setS({ brandColor: v }); setT({ accentColor: v }); }} />
                    <ColorRow label="Secondary" value={settings.brandColorSecondary || ""} fallback="#FEC82C"
                      onChange={(v) => setS({ brandColorSecondary: v })} />
                    <ColorRow label="Accent" optional value={settings.brandColorAccent || ""} fallback="#1A7DB5"
                      onChange={(v) => setS({ brandColorAccent: v })} />
                  </div>
                  {requiredMissing.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Callout tone="warn">Required: {requiredMissing.join(", ")}. You can continue and finish later, but invoices need these.</Callout>
                    </div>
                  )}
                </Section>
              )}

              {step === 1 && (
                <Section title="Connect Stripe to get paid"
                  blurb="Money flows directly from your customers to your bank — it never touches Intelligent Analytics.">
                  {stripe?.connected && stripe?.readyToCharge ? (
                    <Callout tone="ok"><strong>Stripe is connected and ready.</strong> Invoices route straight to your bank.</Callout>
                  ) : stripe?.connected ? (
                    <Callout tone="warn">
                      <strong>Almost there.</strong> Your Stripe account exists but onboarding isn't finished.
                      <div style={{ marginTop: 10 }}><Button variant="primary" onClick={connectStripe} loading={saving}>Continue Stripe setup</Button></div>
                    </Callout>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: "#0B1C24", lineHeight: 1.6, marginTop: 0 }}>
                        Setup takes about 5 minutes — business name, EIN, bank account, ID photo. Stripe creates
                        and manages the account for you; you stay merchant of record and your customers stay yours.
                      </p>
                      <Button variant="primary" onClick={connectStripe} loading={saving}>Connect Stripe (opens Stripe)</Button>
                      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>You can skip and connect before sending your first invoice.</p>
                    </div>
                  )}
                </Section>
              )}

              {step === 2 && tpl && (
                <Section title="Your document template"
                  blurb="One branded template powers your invoices, quotes, and proposals. Logo & color come from your business profile above.">
                  <Grid>
                    <FieldRow label="Invoice number prefix">
                      <input style={{ ...inp, fontFamily: "monospace" }} value={tpl.invoiceNumberPrefix} onChange={(e) => setT({ invoiceNumberPrefix: e.target.value })} placeholder="INV-" />
                    </FieldRow>
                    <FieldRow label="Payment / acceptance terms">
                      <input style={inp} value={tpl.terms} onChange={(e) => setT({ terms: e.target.value })} placeholder="Due upon receipt" />
                    </FieldRow>
                  </Grid>
                  <FieldRow label="Footer note">
                    <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={tpl.footerNote} onChange={(e) => setT({ footerNote: e.target.value })} placeholder="Thank you for your business!" />
                  </FieldRow>
                  <FieldRow label="Google review link (review-request automation)">
                    <input style={inp} value={tpl.googleReviewUrl ?? ""} onChange={(e) => setT({ googleReviewUrl: e.target.value || null })} placeholder="https://g.page/r/.../review" />
                  </FieldRow>
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: accent, color: "#fff" }}>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>Preview — applies to invoices, quotes & proposals</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <strong style={{ fontSize: 14 }}>{settings?.tenantFullName || "Your Business"}</strong>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{tpl.invoiceNumberPrefix || "INV-"}00042</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
                    Manage these anytime under <strong>Template Library</strong>.
                  </p>
                </Section>
              )}

              {step === 3 && (
                <Section title="Your customer portal"
                  blurb="Customers get a portal to view jobs, accept quotes, and pay invoices online.">
                  <Callout tone="ok">
                    Your customer portal is live automatically. Customers see jobs, quotes (accept/decline),
                    and pay invoices via Stripe.
                  </Callout>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#0B1C24", lineHeight: 1.6 }}>
                    <strong>Branding:</strong> on Lite the portal uses Intelligent Analytics styling with a
                    "Powered by" footer. On Standard and above it uses your logo and brand color from your
                    business profile. On Pro the Intelligent Analytics attribution is removed entirely.
                  </div>
                </Section>
              )}

              {step === 4 && (
                <Section title="Add your first services or products"
                  blurb="Makes quotes and invoices one-click. Add more (and recurring pricing) later in the Catalog.">
                  {offerings.map((o, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 32px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <input style={inp} value={o.name} placeholder="e.g. Standard House Cleaning"
                        onChange={(e) => setOfferings((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 9, top: 7, fontSize: 12, color: "#94A3B8" }}>$</span>
                        <input style={{ ...inp, paddingLeft: 18 }} type="number" min="0" step="0.01" value={o.price} placeholder="0.00"
                          onChange={(e) => setOfferings((p) => p.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                      </div>
                      <button onClick={() => setOfferings((p) => p.filter((_, j) => j !== i))} disabled={offerings.length === 1}
                        style={{ background: "none", border: 0, color: "#94A3B8", cursor: offerings.length === 1 ? "not-allowed" : "pointer", fontSize: 17 }}>×</button>
                    </div>
                  ))}
                  {offerings.length < 5 && (
                    <button onClick={() => setOfferings((p) => [...p, { name: "", price: "" }])}
                      style={{ fontSize: 11, fontWeight: 600, color: "#0C4A60", background: "none", border: 0, cursor: "pointer", padding: 0 }}>
                      + Add another
                    </button>
                  )}
                  <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 12 }}>Optional — quotes still let you type free-form line items.</p>
                </Section>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose} style={{ background: "none", border: 0, fontSize: 12, color: "#5A7A8A", cursor: "pointer" }}>
            Save & finish later
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <Button variant="secondary" onClick={() => { setErr(null); setStep(step - 1); }} disabled={saving}>Back</Button>
            )}
            <Button variant="primary" onClick={next} loading={saving} disabled={loading}>
              {step === STEPS.length - 1 ? "Finish setup" : "Save & continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#1A3A4A" }}>{title}</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#5A7A8A", lineHeight: 1.5 }}>{blurb}</p>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px", marginBottom: 12 }}>{children}</div>;
}
function FieldRow({ label, req, missing, children }: { label: string; req?: boolean; missing?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>
        {label}
        {req && missing && <span style={{ fontSize: 9, fontWeight: 700, color: "#B91C1C" }}>REQUIRED</span>}
      </span>
      {children}
    </label>
  );
}
function ColorRow({ label, value, fallback, optional, onChange }: {
  label: string; value: string; fallback: string; optional?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <span style={{ width: 78, fontSize: 11, color: "#5A7A8A" }}>
        {label}{optional && <span style={{ color: "#94A3B8" }}> (opt)</span>}
      </span>
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)}
        style={{ width: 38, height: 28, padding: 0, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff" }} />
      <input style={{ ...inp, flex: 1, fontFamily: "monospace" }} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={fallback} />
    </div>
  );
}

function Callout({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const c = tone === "ok"
    ? { bg: "#D1FAE5", bd: "#6EE7B7", fg: "#065F46" }
    : { bg: "#FEF3C7", bd: "#FCD34D", fg: "#78350F" };
  return (
    <div style={{ padding: "10px 12px", fontSize: 12, lineHeight: 1.5, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: 6 }}>
      {children}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(11,28,36,0.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modal: React.CSSProperties = {
  width: 720, maxWidth: "100%", maxHeight: "90vh", background: "#fff",
  borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12, boxSizing: "border-box",
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24",
};
