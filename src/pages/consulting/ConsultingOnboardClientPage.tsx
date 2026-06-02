// ConsultingOnboardClientPage — F-137
//
// Founder-only flow for "IA Consulting → Onboard Client". Walks the operator
// (you) through:
//
//   Step 1  New or Existing client?
//   Step 2  Which platforms (ARION / OLIVER / SPARK — multi-select)?
//   Step 3  Client details (business name, email, phone, WP URL if ARION)
//   Step 4  Stripe action — link existing customer / create new w/ coupon
//   Step 5  Confirm + execute
//   Step 6  Done — operator handoff checklist (provision code, WP-CLI commands,
//           plugin .zip URL, next steps)
//
// Backend orchestrator: POST /admin/onboard-client on oliver-api.

import { useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { useOliverApi } from "../../hooks/useOliverApi";

type ClientType = "new" | "existing";
type Platform = "arion" | "oliver" | "spark";
type StripeAction = "link_existing" | "create_new_with_coupon" | "no_charge";

interface StripeMatch {
  id: string;
  email: string | null;
  name: string | null;
  subscriptions?: Array<{
    id: string;
    items: Array<{ price_id: string; nickname?: string; unit_amount?: number; recurring?: string }>;
  }>;
}

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
  const { get, post, ready } = useOliverApi();

  const [step, setStep] = useState(1);
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [stripeAction, setStripeAction] = useState<StripeAction>("link_existing");
  const [couponCode, setCouponCode] = useState("");
  const [stripeMatches, setStripeMatches] = useState<StripeMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (p: Platform) => {
    const next = new Set(platforms);
    if (next.has(p)) next.delete(p); else next.add(p);
    setPlatforms(next);
  };

  const searchStripe = async () => {
    if (!contactEmail || !ready) return;
    setSearching(true);
    setError(null);
    try {
      const r = await get<{ data: StripeMatch[] }>(
        `/admin/onboard-client/stripe-customer-search?email=${encodeURIComponent(contactEmail)}`
      );
      setStripeMatches(r.data || []);
    } catch (e) {
      setError((e as Error).message);
      setStripeMatches([]);
    } finally {
      setSearching(false);
    }
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
        stripe_action: stripeAction,
        coupon_code: couponCode || undefined,
      };
      const r = await post<{ data: OnboardResult }>("/admin/onboard-client", body);
      setResult(r.data);
      setStep(6);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceedStep1 = clientType !== null;
  const canProceedStep2 = platforms.size > 0;
  const canProceedStep3 =
    businessName.trim().length > 1 &&
    contactEmail.includes("@") &&
    (!platforms.has("arion") || wpSiteUrl.trim().length > 0);
  const canSubmit =
    canProceedStep3 &&
    (stripeAction === "no_charge" ||
      (stripeAction === "create_new_with_coupon") ||
      (stripeAction === "link_existing" && stripeMatches !== null && stripeMatches.length > 0));

  return (
    <OliverPageWrapper title="Onboard Client" subtitle="IA Consulting · Platform Operations" error={error} loading={submitting || searching}>
      <div className="max-w-3xl mx-auto">
        {/* Progress strip */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n}
              className={`h-1 flex-1 rounded ${n <= step ? "bg-[#EF6C33]" : "bg-gray-200"}`} />
          ))}
        </div>

        {/* Step 1 — New / Existing */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Is this a new or existing client?</h2>
            <p className="text-sm text-slate-600">
              "Existing" = they're already a customer in Stripe (e.g. Midwest Ag Services).
              "New" = brand new — we'll create their Stripe customer (with optional coupon for free months).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setClientType("existing")}
                className={`p-5 rounded-xl border-2 text-left ${clientType === "existing" ? "border-[#EF6C33] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <div className="font-semibold text-slate-900">Existing in Stripe</div>
                <div className="mt-1 text-xs text-slate-500">Customer + subscription already exist. We link and onboard.</div>
              </button>
              <button onClick={() => setClientType("new")}
                className={`p-5 rounded-xl border-2 text-left ${clientType === "new" ? "border-[#EF6C33] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <div className="font-semibold text-slate-900">New (create Stripe customer)</div>
                <div className="mt-1 text-xs text-slate-500">Optional coupon for N months free. Good for partners + testers.</div>
              </button>
            </div>
            <div className="pt-4">
              <button disabled={!canProceedStep1} onClick={() => {
                setStripeAction(clientType === "existing" ? "link_existing" : "create_new_with_coupon");
                setStep(2);
              }} className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Platforms */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Which platforms?</h2>
            <p className="text-sm text-slate-600">Multi-select what they're getting access to.</p>
            <div className="grid grid-cols-3 gap-3">
              {(["arion", "oliver", "spark"] as Platform[]).map((p) => (
                <button key={p} onClick={() => togglePlatform(p)}
                  className={`p-5 rounded-xl border-2 text-center ${platforms.has(p) ? "border-[#EF6C33] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="text-sm font-bold uppercase tracking-wide text-slate-700">{p}</div>
                </button>
              ))}
            </div>
            <div className="pt-4 flex gap-2">
              <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={!canProceedStep2} onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Client details */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Client details</h2>
            <div className="grid gap-3">
              <Field label="Business name *" value={businessName} onChange={setBusinessName} />
              <Field label="Contact email *" value={contactEmail} onChange={setContactEmail} type="email" />
              <Field label="Contact name (optional)" value={contactName} onChange={setContactName} />
              <Field label="Contact phone (optional)" value={contactPhone} onChange={setContactPhone} />
              {platforms.has("arion") && (
                <Field label="WordPress site URL * (required for ARION)" value={wpSiteUrl} onChange={setWpSiteUrl}
                  placeholder="https://midwestagservices.com" />
              )}
            </div>
            <div className="pt-4 flex gap-2">
              <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={!canProceedStep3} onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 4 — Stripe action */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Stripe</h2>
            <div className="space-y-2">
              {(["link_existing", "create_new_with_coupon", "no_charge"] as StripeAction[]).map((a) => (
                <label key={a} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${stripeAction === a ? "border-[#EF6C33] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <input type="radio" checked={stripeAction === a} onChange={() => setStripeAction(a)} className="mt-1" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      {a === "link_existing" && "Link existing Stripe customer (by email)"}
                      {a === "create_new_with_coupon" && "Create new Stripe customer (optional coupon for free months)"}
                      {a === "no_charge" && "Skip Stripe — manual billing"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {a === "link_existing" && "Looks up the customer by email + links to the new tenant."}
                      {a === "create_new_with_coupon" && "Creates a new Stripe customer. Apply a coupon ID (e.g. SIX_MONTHS_FREE) for free trial periods."}
                      {a === "no_charge" && "No Stripe touch. Use when invoicing offline or running a fully-free relationship."}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {stripeAction === "link_existing" && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={searchStripe} disabled={!contactEmail || searching}
                    className="px-3 py-1.5 rounded border border-slate-300 text-sm font-semibold bg-white hover:bg-slate-50 disabled:opacity-50">
                    {searching ? "Searching…" : `Find Stripe customer for ${contactEmail}`}
                  </button>
                </div>
                {stripeMatches !== null && (
                  <div className="text-xs">
                    {stripeMatches.length === 0 && (
                      <div className="text-rose-600">No Stripe customer found for {contactEmail}. They may need to be created — switch to "Create new" above.</div>
                    )}
                    {stripeMatches.map((m) => (
                      <div key={m.id} className="bg-white border border-slate-200 rounded p-2 mb-1">
                        <div className="font-semibold">{m.name || "(no name)"} · {m.email}</div>
                        <div className="text-slate-500">{m.id}</div>
                        {m.subscriptions && m.subscriptions.length > 0 && (
                          <ul className="mt-1 pl-3 list-disc text-slate-700">
                            {m.subscriptions.flatMap((s) => s.items).map((it, i) => (
                              <li key={i}>{it.nickname || it.price_id} — ${((it.unit_amount || 0) / 100).toFixed(2)}/{it.recurring || "?"}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {stripeAction === "create_new_with_coupon" && (
              <Field label="Stripe coupon ID (optional, e.g. SIX_MONTHS_FREE)" value={couponCode} onChange={setCouponCode} />
            )}

            <div className="pt-4 flex gap-2">
              <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={!canSubmit} onClick={() => setStep(5)}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">Review →</button>
            </div>
          </div>
        )}

        {/* Step 5 — Confirm */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Confirm</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 text-sm">
              <div><span className="text-slate-500 w-32 inline-block">Business:</span> <strong>{businessName}</strong></div>
              <div><span className="text-slate-500 w-32 inline-block">Email:</span> {contactEmail}</div>
              {contactName && <div><span className="text-slate-500 w-32 inline-block">Name:</span> {contactName}</div>}
              {contactPhone && <div><span className="text-slate-500 w-32 inline-block">Phone:</span> {contactPhone}</div>}
              <div><span className="text-slate-500 w-32 inline-block">Platforms:</span> {Array.from(platforms).join(", ").toUpperCase()}</div>
              {platforms.has("arion") && <div><span className="text-slate-500 w-32 inline-block">WP site:</span> {wpSiteUrl}</div>}
              <div><span className="text-slate-500 w-32 inline-block">Stripe:</span> {stripeAction.replace(/_/g, " ")}{couponCode ? ` (coupon: ${couponCode})` : ""}</div>
            </div>
            {error && <div className="text-sm text-rose-600">{error}</div>}
            <div className="pt-4 flex gap-2">
              <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">← Back</button>
              <button disabled={submitting} onClick={submit}
                className="px-6 py-2.5 rounded-lg bg-[#EF6C33] text-white font-semibold disabled:opacity-50">
                {submitting ? "Onboarding…" : "Onboard client →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 6 — Done */}
        {step === 6 && result && (
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
                    <span className={`text-xs font-bold uppercase mt-0.5 ${s.status === "ok" || s.status === "created" || s.status === "linked" || s.status === "reused" ? "text-emerald-600" : s.status === "warn" ? "text-amber-600" : "text-rose-600"}`}>{s.status}</span>
                    <span><strong>{s.step}</strong> — {s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {result.handoff.arion && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="font-semibold text-slate-900 mb-2">ARION plugin install — operator handoff</div>
                <div className="text-xs text-slate-600 mb-3">Two paths. Pick whichever fits the client's host.</div>

                <details className="mb-3" open>
                  <summary className="cursor-pointer font-semibold text-sm">Method A — Hostinger SSH + WP-CLI (auto)</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.method_a_hostinger_ssh.join("\n")}
                  </pre>
                </details>

                <details className="mb-3">
                  <summary className="cursor-pointer font-semibold text-sm">Method B — manual .zip upload via WP-admin</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.method_b_manual_zip.join("\n")}
                  </pre>
                </details>

                <details>
                  <summary className="cursor-pointer font-semibold text-sm">User setup (create IA admin + downgrade client to editor)</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-300 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {result.handoff.arion.manual_install.users.join("\n")}
                  </pre>
                </details>

                <div className="mt-3 text-xs text-slate-600">
                  <strong>Plugin .zip:</strong>{" "}
                  <a href={result.handoff.arion.plugin_download_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {result.handoff.arion.plugin_download_url}
                  </a>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  <strong>Provision code (single-use, 14d):</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">{result.handoff.arion.provision_code}</code>
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button onClick={() => { setStep(1); setClientType(null); setPlatforms(new Set()); setBusinessName(""); setContactEmail(""); setContactName(""); setContactPhone(""); setWpSiteUrl(""); setCouponCode(""); setStripeMatches(null); setResult(null); }}
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
