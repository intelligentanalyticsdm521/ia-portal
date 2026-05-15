// OliverOnboardingWizard — guided modal that gets a tenant from "just signed
// up" to "can send a paid invoice".
//
// Business profile is the SHARED platform profile (core.tenants) captured at
// account setup and reused by ARION/SPARK/OLIVER/STELLA. This wizard does NOT
// re-collect it — step 1 is a read-only COMPLETENESS CHECK that deep-links to
// the shared profile editor for any gaps. The remaining steps are the genuinely
// OLIVER-specific setup: Stripe (Express), invoice/quote template, catalog.
//
// Steps:
//   1. Business profile  — completeness check vs shared profile (no re-entry)
//   2. Connect Stripe    — Express hosted onboarding
//   3. Invoice template  — prefix / terms / footer / review link
//   4. First offerings   — catalog quick-add
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui";

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

const STEPS = ["Business profile", "Payments", "Template", "Catalog"] as const;
const PROFILE_EDITOR_ROUTE = "/app/services/oliver_settings";

export function OliverOnboardingWizard({
  api, onClose, onFinished,
}: {
  api: Api;
  onClose: () => void;
  onFinished: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [offerings, setOfferings] = useState<OfferingDraft[]>([{ name: "", price: "" }]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [s, st, t] = await Promise.all([
        api.get<Settings>("/settings"),
        api.get<StripeStatus>("/settings/stripe").catch(() => ({ connected: false })),
        api.get<Template>("/settings/invoice-template").catch(() => null),
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
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const setT = (patch: Partial<Template>) => setTpl((p) => p ? { ...p, ...patch } : p);

  // Completeness of the SHARED profile. Required gates the step; recommended
  // is surfaced but doesn't block.
  const profileChecklist = settings ? [
    { label: "Business name", value: settings.tenantFullName, required: true },
    { label: "Contact email", value: settings.email, required: true },
    { label: "Phone", value: settings.phone, required: true },
    { label: "Address", value: settings.address, required: true },
    { label: "Website", value: settings.website, required: false },
    { label: "Logo", value: settings.logoUrl || "", required: false },
    { label: "Brand color", value: settings.brandColor || "", required: false },
  ].map((f) => ({ ...f, ok: !!(f.value && String(f.value).trim()) })) : [];
  const requiredMissing = profileChecklist.filter((f) => f.required && !f.ok);
  const profileComplete = requiredMissing.length === 0;

  async function persistStep(i: number): Promise<boolean> {
    setErr(null);
    try {
      setSaving(true);
      // Step 0 (profile) is read-only — nothing to persist; it's a check.
      if (i === 2 && tpl) {
        await api.patch("/settings/invoice-template", tpl);
      } else if (i === 3) {
        const valid = offerings.filter((o) => o.name.trim());
        for (const o of valid) {
          const r = await api.post<{ offering_id: string }>("/catalog/offerings", {
            name: o.name.trim(), requiresQuote: false, isSelfBookable: false,
          });
          const amt = Number(o.price);
          if (r.offering_id && amt > 0) {
            await api.post(`/catalog/offerings/${r.offering_id}/prices`, {
              pricingModel: "one_time", unitAmount: amt, currency: "USD", isDefault: true,
            }).catch(() => { /* offering still created; price best-effort */ });
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

  function goEditProfile() {
    onClose();
    navigate(PROFILE_EDITOR_ROUTE);
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
                <Section
                  title="Business profile"
                  blurb="This is your shared profile — set once at account level and reused across ARION, SPARK, and your customer portal. We just confirm it's complete here; nothing to re-enter."
                >
                  <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden" }}>
                    {profileChecklist.map((f, i) => (
                      <div key={f.label} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 12px", fontSize: 12,
                        borderBottom: i < profileChecklist.length - 1 ? "1px solid #F1F5F9" : "none",
                        background: f.ok ? "#fff" : f.required ? "#FEF2F2" : "#FFFBEB",
                      }}>
                        <span style={{ color: "#0B1C24" }}>
                          {f.label}
                          {!f.required && <span style={{ color: "#94A3B8", fontSize: 10 }}> · recommended</span>}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {f.ok ? (
                            <span style={{ fontSize: 11, color: "#5A7A8A", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {String(f.value)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 600, color: f.required ? "#B91C1C" : "#B45309" }}>
                              {f.required ? "Missing" : "Not set"}
                            </span>
                          )}
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%", display: "inline-flex",
                            alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                            background: f.ok ? "#059669" : f.required ? "#FCA5A5" : "#FCD34D",
                            color: f.ok ? "#fff" : "#7C2D12",
                          }}>{f.ok ? "✓" : "!"}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    {profileComplete ? (
                      <Callout tone="ok">
                        <strong>Profile complete.</strong> Everything OLIVER needs is on file — invoices, quotes,
                        and your portal will use it automatically.
                      </Callout>
                    ) : (
                      <Callout tone="warn">
                        <strong>{requiredMissing.length} required field{requiredMissing.length === 1 ? "" : "s"} missing</strong>
                        {" "}({requiredMissing.map((f) => f.label).join(", ")}). Complete your business profile once
                        and it's done for every product.
                        <div style={{ marginTop: 10 }}>
                          <Button variant="primary" onClick={goEditProfile}>Complete business profile →</Button>
                        </div>
                      </Callout>
                    )}
                  </div>
                </Section>
              )}

              {step === 1 && (
                <Section
                  title="Connect Stripe to get paid"
                  blurb="Money flows directly from your customers to your bank — it never touches Intelligent Analytics."
                >
                  {stripe?.connected && stripe?.readyToCharge ? (
                    <Callout tone="ok"><strong>Stripe is connected and ready.</strong> Invoices route straight to your bank.</Callout>
                  ) : stripe?.connected ? (
                    <Callout tone="warn">
                      <strong>Almost there.</strong> Your Stripe account exists but onboarding isn't finished.
                      <div style={{ marginTop: 10 }}>
                        <Button variant="primary" onClick={connectStripe} loading={saving}>Continue Stripe setup</Button>
                      </div>
                    </Callout>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: "#0B1C24", lineHeight: 1.6, marginTop: 0 }}>
                        Setup takes about 5 minutes — business name, EIN, bank account, and an ID photo.
                        Stripe creates and manages the account for you; you stay the merchant of record and
                        your customers stay yours.
                      </p>
                      <Button variant="primary" onClick={connectStripe} loading={saving}>
                        Connect Stripe (opens Stripe)
                      </Button>
                      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
                        You can also skip this and connect before sending your first invoice.
                      </p>
                    </div>
                  )}
                </Section>
              )}

              {step === 2 && tpl && (
                <Section
                  title="Customize your invoice & quote template"
                  blurb="Your logo and brand color carry over automatically from your business profile. These show on every invoice, quote, and proposal."
                >
                  <Grid>
                    <FieldRow label="Invoice number prefix">
                      <input style={{ ...inp, fontFamily: "monospace" }} value={tpl.invoiceNumberPrefix}
                        onChange={(e) => setT({ invoiceNumberPrefix: e.target.value })} placeholder="INV-" />
                    </FieldRow>
                    <FieldRow label="Payment terms">
                      <input style={inp} value={tpl.terms}
                        onChange={(e) => setT({ terms: e.target.value })} placeholder="Due upon receipt" />
                    </FieldRow>
                  </Grid>
                  <FieldRow label="Footer note">
                    <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={tpl.footerNote}
                      onChange={(e) => setT({ footerNote: e.target.value })} placeholder="Thank you for your business!" />
                  </FieldRow>
                  <FieldRow label="Google review link (used by review-request automation)">
                    <input style={inp} value={tpl.googleReviewUrl ?? ""}
                      onChange={(e) => setT({ googleReviewUrl: e.target.value || null })}
                      placeholder="https://g.page/r/.../review" />
                  </FieldRow>
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: accent, color: "#fff" }}>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>Preview</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <strong style={{ fontSize: 14 }}>{settings?.tenantFullName || "Your Business"}</strong>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{tpl.invoiceNumberPrefix || "INV-"}00042</span>
                    </div>
                  </div>
                </Section>
              )}

              {step === 3 && (
                <Section
                  title="Add your first services or products"
                  blurb="This makes quotes and invoices one-click. You can add more (and recurring pricing) later in the Catalog."
                >
                  {offerings.map((o, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 32px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <input style={inp} value={o.name} placeholder="e.g. Standard House Cleaning"
                        onChange={(e) => setOfferings((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 9, top: 7, fontSize: 12, color: "#94A3B8" }}>$</span>
                        <input style={{ ...inp, paddingLeft: 18 }} type="number" min="0" step="0.01" value={o.price} placeholder="0.00"
                          onChange={(e) => setOfferings((p) => p.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                      </div>
                      <button onClick={() => setOfferings((p) => p.filter((_, j) => j !== i))}
                        disabled={offerings.length === 1}
                        style={{ background: "none", border: 0, color: "#94A3B8", cursor: offerings.length === 1 ? "not-allowed" : "pointer", fontSize: 17 }}>×</button>
                    </div>
                  ))}
                  {offerings.length < 5 && (
                    <button onClick={() => setOfferings((p) => [...p, { name: "", price: "" }])}
                      style={{ fontSize: 11, fontWeight: 600, color: "#0C4A60", background: "none", border: 0, cursor: "pointer", padding: 0 }}>
                      + Add another
                    </button>
                  )}
                  <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 12 }}>
                    No catalog items yet? You can skip — quotes still let you type free-form line items.
                  </p>
                </Section>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose}
            style={{ background: "none", border: 0, fontSize: 12, color: "#5A7A8A", cursor: "pointer" }}>
            Save & finish later
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <Button variant="secondary" onClick={() => { setErr(null); setStep(step - 1); }} disabled={saving}>
                Back
              </Button>
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
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
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
