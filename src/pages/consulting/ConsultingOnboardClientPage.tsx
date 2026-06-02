// ConsultingOnboardClientPage — F-137 (refactored simpler)
//
// 4-step founder-only client onboarding flow:
//   1  New or Existing client?
//   2  Pick platforms (multi-select ARION/OLIVER/SPARK)
//   3  Client details + optional coupon
//   4  Confirm → execute → handoff checklist
//
// Backend auto-detects whether the email exists in Stripe (links if yes,
// creates new if no). Coupon works in both cases — applied to existing
// customer's next invoice OR to new customer.

import { useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { useOliverApi } from "../../hooks/useOliverApi";

type ClientType = "new" | "existing";
type Platform = "arion" | "oliver" | "spark";

interface OnboardResult {
  tenant_id: string;
  slug: string;
  stripe_customer_id?: string;
  site_id?: string;
  provision_code?: string;
  steps: Array<{ step: string; status: string; detail: string }>;
  handoff: {
    arion?: {
      site_url: string;
      site_id: string;
      provision_code: string;
      plugin_download_url: string;
      manual_install: {
        method_a_hostinger_ssh: string[];
        method_b_manual_zip: string[];
        users: string[];
      };
    };
  };
}

export function ConsultingOnboardClientPage() {
  const { post, ready } = useOliverApi();

  const [step, setStep] = useState(1);
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (p: Platform) => {
    const next = new Set(platforms);
    if (next.has(p)) next.delete(p); else next.add(p);
    setPlatforms(next);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        business_name: businessName,
        contact_email: contactEmail,
        contact_name: contactName || undefined,
        contact_phone: contactPhone || undefined,
        wp_site_url: platforms.has("arion") ? wpSiteUrl : undefined,
        products: Array.from(platforms),
        // Backend auto-detects: lookup by email → link if found, create if not.
        // Coupon (if provided) applied either way.
        stripe_action: "auto",
        coupon_code: couponCode || undefined,
      };
      const r = await post<{ data: OnboardResult }>("/admin/onboard-client", body);
      setResult(r.data);
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setClientType(null); setPlatforms(new Set());
    setBusinessName(""); setContactEmail(""); setContactName(""); setContactPhone("");
    setWpSiteUrl(""); setCouponCode(""); setResult(null);
  };

  const canProceedStep1 = clientType !== null;
  const canProceedStep2 = platforms.size > 0;
  const canProceedStep3 =
    businessName.trim().length > 1 &&
    contactEmail.includes("@") &&
    (!platforms.has("arion") || wpSiteUrl.trim().length > 0);

  return (
    <OliverPageWrapper title="Onboard Client" subtitle="IA Consulting · Platform Operations" error={error} loading={submitting}>
      <div className="max-w-2xl mx-auto">
        {/* Progress strip */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n}
              className={`h-1 flex-1 rounded ${n <= step ? "bg-[#EF6C33]" : "bg-gray-200"}`} />
          ))}
        </div>

        {/* Step 1 — New / Existing */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">New or existing client?</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setClientType("new")}
                className={`p-6 rounded-xl border-2 text-center ${clientType === "new" ? "border-[#EF6C33] bg-white shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <div className="text-lg font-bold text-slate-900">New</div>
              </button>
              <button onClick={() => setClientType("existing")}
                className={`p-6 rounded-xl border-2 text-center ${clientType === "existing" ? "border-[#EF6C33] bg-white shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <div className="text-lg font-bold text-slate-900">Existing</div>
              </button>
            </div>
            <div className="pt-4 flex justify-end">
              <button disabled={!canProceedStep1} onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Platforms */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Which platforms?</h2>
            <p className="text-xs text-slate-500">Multi-select. Coupons + Stripe handled automatically on the next step.</p>
            <div className="grid grid-cols-3 gap-3">
              {(["arion", "oliver", "spark"] as Platform[]).map((p) => (
                <button key={p} onClick={() => togglePlatform(p)}
                  className={`p-6 rounded-xl border-2 text-center ${platforms.has(p) ? "border-[#EF6C33] bg-white shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="text-base font-bold uppercase tracking-wide text-slate-700">{p}</div>
                </button>
              ))}
            </div>
            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={!canProceedStep2} onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Details + optional coupon */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Client details</h2>
            <div className="grid gap-3">
              <Field label="Business name *" value={businessName} onChange={setBusinessName} />
              <Field label="Contact email *" value={contactEmail} onChange={setContactEmail} type="email" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact name" value={contactName} onChange={setContactName} />
                <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} />
              </div>
              {platforms.has("arion") && (
                <Field label="WordPress site URL *" value={wpSiteUrl} onChange={setWpSiteUrl}
                  placeholder="https://midwestagservices.com" />
              )}
              <Field label="Coupon code (optional)" value={couponCode} onChange={setCouponCode}
                placeholder="e.g. SIX_MONTHS_FREE" />
              <p className="text-[11px] text-slate-500 -mt-2">
                Stripe coupon ID. Works for both new and existing clients — applied to next invoice.
              </p>
            </div>
            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={!canProceedStep3} onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">Review →</button>
            </div>
          </div>
        )}

        {/* Step 4 — Confirm */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Confirm</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 text-sm">
              <div><span className="text-slate-500 w-32 inline-block">Type:</span> <strong>{clientType === "new" ? "New" : "Existing"}</strong></div>
              <div><span className="text-slate-500 w-32 inline-block">Business:</span> <strong>{businessName}</strong></div>
              <div><span className="text-slate-500 w-32 inline-block">Email:</span> {contactEmail}</div>
              {contactName && <div><span className="text-slate-500 w-32 inline-block">Name:</span> {contactName}</div>}
              {contactPhone && <div><span className="text-slate-500 w-32 inline-block">Phone:</span> {contactPhone}</div>}
              <div><span className="text-slate-500 w-32 inline-block">Platforms:</span> {Array.from(platforms).join(", ").toUpperCase()}</div>
              {platforms.has("arion") && <div><span className="text-slate-500 w-32 inline-block">WP site:</span> {wpSiteUrl}</div>}
              {couponCode && <div><span className="text-slate-500 w-32 inline-block">Coupon:</span> {couponCode}</div>}
            </div>
            {error && <div className="text-sm text-rose-600">{error}</div>}
            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={submitting} onClick={submit}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">
                {submitting ? "Onboarding…" : "Onboard client →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 — Done */}
        {step === 5 && result && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">✓ {businessName} onboarded</h2>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
              <div><strong>Tenant ID:</strong> <code>{result.tenant_id}</code></div>
              <div><strong>Slug:</strong> {result.slug}</div>
              {result.stripe_customer_id && <div><strong>Stripe customer:</strong> <code>{result.stripe_customer_id}</code></div>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="font-semibold text-slate-900 mb-2">Steps executed:</div>
              <ul className="text-sm space-y-1">
                {result.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`text-xs font-bold uppercase mt-0.5 ${
                      s.status === "ok" || s.status === "created" || s.status === "linked" || s.status === "reused"
                        ? "text-emerald-600" : s.status === "warn" ? "text-amber-600" : "text-rose-600"
                    }`}>{s.status}</span>
                    <span><strong>{s.step}</strong> — {s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {result.handoff.arion && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="font-semibold text-slate-900 mb-2">ARION plugin install</div>
                <details className="mb-3" open>
                  <summary className="cursor-pointer font-semibold text-sm">Method A — Hostinger SSH + WP-CLI</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.method_a_hostinger_ssh.join("\n")}
                  </pre>
                </details>
                <details className="mb-3">
                  <summary className="cursor-pointer font-semibold text-sm">Method B — manual .zip upload</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.method_b_manual_zip.join("\n")}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer font-semibold text-sm">User setup (IA admin + editor downgrade)</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.users.join("\n")}
                  </pre>
                </details>
                <div className="mt-3 text-xs text-slate-600">
                  <strong>Provision code (14d):</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">{result.handoff.arion.provision_code}</code>
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button onClick={reset}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">
                Onboard another client
              </button>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </div>
  );
}

export default ConsultingOnboardClientPage;
