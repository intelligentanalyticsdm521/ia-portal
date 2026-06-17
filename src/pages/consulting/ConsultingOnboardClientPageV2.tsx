// ConsultingOnboardClientPageV2 — Founder onboarding wizard, 7-step rebuild.
//
// Brandon's scoping 2026-06-17:
//   1. Customer mode (New/Existing + Stripe lookup)
//   2. Product cart (multi-select ARION/SPARK/OLIVER/Consulting + tiers/add-ons)
//   3. Checkout — coupon autocomplete + payment method
//   4. Business profile (deep — address drives ARION SE Ranking region binding)
//   5. Owner account (beefed)
//   6. Review
//   7. Submit + per-product onboarding progress
//
// Backend: POST /admin/onboard-client (extended 2026-06-17 to accept
// subscription_items[], business_profile{}, owner_account{}, collection_method).
// Coupon autocomplete: GET /admin/onboard-client/coupons?q=
// Consulting prices: GET /admin/onboard-client/consulting-products

import { useEffect, useMemo, useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { useOliverApi } from "../../hooks/useOliverApi";

// ─── Types ────────────────────────────────────────────────────────────────

type CustomerMode = "new" | "existing";
type Product = "arion" | "oliver" | "spark" | "consulting";
type ArionSiteType = "new" | "existing" | "migrate";
type Interval = "month" | "year";

interface CartConfig {
  arion?: {
    plan: "lite" | "standard" | "pro" | "business";
    seo: "" | "starter" | "essentials" | "growth" | "authority";
    siteType: ArionSiteType;
    wpSiteUrl?: string;
  };
  spark?: {
    volume: "5k" | "10k" | "25k" | "50k" | "100k" | "250k" | "500k";
    addon: "" | "pro" | "business";
  };
  oliver?: {
    tier: "lite" | "standard" | "pro" | "business";
  };
  consulting?: {
    productId: string;
    productName: string;
    interval: Interval;
    unitAmount: number; // cents — founder-overridable
  };
}

interface ConsultingProduct {
  product_id: string;
  name: string;
  prices: Array<{ id: string; unit_amount: number; interval?: string; nickname?: string | null }>;
}

interface CouponOption {
  id: string;
  name: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: "once" | "forever" | "repeating";
  duration_in_months: number | null;
  valid: boolean;
}

interface BusinessProfile {
  address_street: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string;
  website: string;
  industry: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
}

interface OwnerAccount {
  first_name: string;
  last_name: string;
  display_name: string;
  title: string;
  mobile: string;
  time_zone: string;
  billing_email_same: boolean;
  billing_email: string;
  notif_email: boolean;
  notif_sms: boolean;
}

interface StripeCustomerMatch {
  id: string;
  email: string | null;
  name: string | null;
  subscriptions?: Array<{ id: string; items: Array<{ price_id: string; nickname: string | null; unit_amount: number | null; recurring: string | null }> }>;
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
      provision_code: string;
      manual_install: { method_a_hostinger_ssh: string[]; method_b_manual_zip: string[]; users: string[] };
    };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────

const ARION_PLANS = [
  { id: "lite", label: "Lite", price: "$19" },
  { id: "standard", label: "Standard", price: "$29" },
  { id: "pro", label: "Pro", price: "$49" },
  { id: "business", label: "Business", price: "$99" },
] as const;

const ARION_SEO_ADDONS = [
  { id: "", label: "No SEO add-on", price: "—" },
  { id: "starter", label: "SEO Starter", price: "+$29" },
  { id: "essentials", label: "SEO Essentials", price: "+$49" },
  { id: "growth", label: "SEO Growth (AI Mode)", price: "+$99" },
  { id: "authority", label: "SEO Authority (full AI)", price: "+$199" },
] as const;

const SPARK_VOLUMES = ["5k", "10k", "25k", "50k", "100k", "250k", "500k"] as const;

const OLIVER_TIERS = [
  { id: "lite", label: "Lite", price: "$19.99" },
  { id: "standard", label: "Standard", price: "$29.99" },
  { id: "pro", label: "Pro", price: "$49.99" },
  { id: "business", label: "Business", price: "$99.99" },
] as const;

const ACCENT = "#EF6C33";
const INK = "#0B1C24";

// ─── Component ────────────────────────────────────────────────────────────

export function ConsultingOnboardClientPageV2() {
  const { post, get } = useOliverApi();

  // Wizard state
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Customer mode
  const [customerMode, setCustomerMode] = useState<CustomerMode | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<StripeCustomerMatch[] | null>(null);
  const [searchedYet, setSearchedYet] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step 2 — Cart
  const [cart, setCart] = useState<CartConfig>({});
  const [consultingProducts, setConsultingProducts] = useState<ConsultingProduct[] | null>(null);

  // Step 3 — Checkout
  const [couponQuery, setCouponQuery] = useState("");
  const [couponOptions, setCouponOptions] = useState<CouponOption[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponOption | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [collectionMethod, setCollectionMethod] = useState<"charge_automatically" | "send_invoice">("charge_automatically");

  // Step 4 — Business profile
  const [profile, setProfile] = useState<BusinessProfile>({
    address_street: "", address_line2: "", address_city: "", address_state: "", address_zip: "",
    phone: "", website: "", industry: "", primary_color: "#EF6C33", accent_color: "#0B1C24", logo_url: "",
  });

  // Required top-level identity (drives tenant create)
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Step 5 — Owner account
  const tzGuess = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago", []);
  const [account, setAccount] = useState<OwnerAccount>({
    first_name: "", last_name: "", display_name: "", title: "", mobile: "",
    time_zone: tzGuess, billing_email_same: true, billing_email: "",
    notif_email: true, notif_sms: false,
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  // Prefill cart with sensible defaults when product toggled on.
  const toggleProduct = (p: Product) => {
    const next = { ...cart };
    if (p in next) { delete (next as Record<string, unknown>)[p]; setCart(next); return; }
    if (p === "arion") next.arion = { plan: "standard", seo: "", siteType: "new" };
    if (p === "spark") next.spark = { volume: "5k", addon: "" };
    if (p === "oliver") next.oliver = { tier: "standard" };
    if (p === "consulting") {
      const first = consultingProducts?.[0];
      const monthly = first?.prices.find((pr) => pr.interval === "month");
      next.consulting = {
        productId: first?.product_id || "",
        productName: first?.name || "",
        interval: "month",
        unitAmount: monthly?.unit_amount ?? 0,
      };
    }
    setCart(next);
  };

  // Stripe customer search (existing-mode)
  const runStripeSearch = async () => {
    if (!searchEmail.includes("@")) return;
    setSearchLoading(true);
    setSearchedYet(true);
    try {
      const r = await get<{ data: StripeCustomerMatch[] }>(`/admin/onboard-client/stripe-customer-search?email=${encodeURIComponent(searchEmail)}`);
      setSearchResults(r.data || []);
    } catch (e) {
      setError((e as Error).message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Coupon autocomplete (debounced)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setCouponLoading(true);
      try {
        const r = await get<{ data: CouponOption[] }>(`/admin/onboard-client/coupons?q=${encodeURIComponent(couponQuery)}`);
        if (!cancelled) setCouponOptions(r.data || []);
      } catch { /* swallow */ }
      finally { if (!cancelled) setCouponLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [couponQuery, get]);

  // Load consulting products on mount (used in step 2)
  useEffect(() => {
    (async () => {
      try {
        const r = await get<{ data: ConsultingProduct[] }>("/admin/onboard-client/consulting-products");
        setConsultingProducts(r.data || []);
      } catch { /* swallow */ }
    })();
  }, [get]);

  // Compute submit body
  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const products: Product[] = [];
      if (cart.arion) products.push("arion");
      if (cart.oliver) products.push("oliver");
      if (cart.spark) products.push("spark");
      if (cart.consulting) products.push("consulting");

      // subscription_items — single subscription, multiple line items.
      // Stripe constraint: items must share interval. UI in step 3
      // enforces a single billing interval globally.
      const subscriptionItems: Array<Record<string, unknown>> = [];
      // TODO: map ARION/SPARK/OLIVER tier → real Stripe price_id catalogue.
      // For Rolling In It (100%-off path) the items array can be empty if
      // the operator opts for "no_charge" — subscription create skips.
      if (cart.consulting && cart.consulting.unitAmount > 0) {
        subscriptionItems.push({
          product_id: cart.consulting.productId,
          unit_amount: cart.consulting.unitAmount,
          interval: cart.consulting.interval,
        });
      }

      const body = {
        // Identity
        business_name: businessName,
        contact_email: contactEmail,
        contact_name: account.display_name || `${account.first_name} ${account.last_name}`.trim() || undefined,
        contact_phone: account.mobile || undefined,
        // Cart
        products: products.filter((p) => p !== "consulting"), // products[] = legacy (arion/oliver/spark)
        arion_plan: cart.arion?.plan,
        arion_seo: cart.arion?.seo || undefined,
        oliver_tier: cart.oliver?.tier,
        spark_volume: cart.spark?.volume,
        spark_addon: cart.spark?.addon || undefined,
        wp_site_url: cart.arion?.wpSiteUrl || undefined,
        arion_site_type: cart.arion?.siteType,
        // Stripe
        stripe_action: customerMode === "existing" ? "link_existing" : "create_new_with_coupon",
        coupon_code: selectedCoupon?.id,
        subscription_items: subscriptionItems.length > 0 ? subscriptionItems : undefined,
        collection_method: collectionMethod,
        // Profile + account passthroughs
        business_profile: profile,
        owner_account: account,
      };
      const r = await post<{ data: OnboardResult }>("/admin/onboard-client", body);
      setResult(r.data);
      setStep(7);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Validation gates per step
  const canProceedStep1 = customerMode === "new" || (customerMode === "existing" && selectedExistingId !== null);
  const cartCount = (cart.arion ? 1 : 0) + (cart.spark ? 1 : 0) + (cart.oliver ? 1 : 0) + (cart.consulting ? 1 : 0);
  const canProceedStep2 = cartCount > 0 && (!cart.arion || cart.arion.siteType === "new" || (cart.arion.wpSiteUrl || "").length > 5);
  const canProceedStep3 = true; // coupon and payment are both optional
  const canProceedStep4 = businessName.trim().length > 1 && contactEmail.includes("@") && profile.address_city && profile.address_state;
  const canProceedStep5 = account.first_name.trim().length > 0 && account.last_name.trim().length > 0;
  const canProceedStep6 = canProceedStep1 && canProceedStep2 && canProceedStep4 && canProceedStep5;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <OliverPageWrapper title="Onboard Client (V2)" subtitle="IA Consulting · 7-step founder wizard">
      <div className="max-w-4xl mx-auto">
        <ProgressStrip current={step} total={7} />

        {step === 1 && (
          <Step1Customer
            mode={customerMode} setMode={setCustomerMode}
            searchEmail={searchEmail} setSearchEmail={setSearchEmail}
            results={searchResults} loading={searchLoading} searchedYet={searchedYet}
            selectedId={selectedExistingId} setSelectedId={setSelectedExistingId}
            onSearch={runStripeSearch}
            onContinue={() => setStep(2)} canContinue={canProceedStep1}
          />
        )}

        {step === 2 && (
          <Step2Cart
            cart={cart} setCart={setCart} toggle={toggleProduct}
            consultingProducts={consultingProducts}
            onBack={() => setStep(1)} onContinue={() => setStep(3)} canContinue={canProceedStep2}
          />
        )}

        {step === 3 && (
          <Step3Checkout
            couponQuery={couponQuery} setCouponQuery={setCouponQuery}
            couponOptions={couponOptions} couponLoading={couponLoading}
            selectedCoupon={selectedCoupon} setSelectedCoupon={setSelectedCoupon}
            collectionMethod={collectionMethod} setCollectionMethod={setCollectionMethod}
            onBack={() => setStep(2)} onContinue={() => setStep(4)} canContinue={canProceedStep3}
          />
        )}

        {step === 4 && (
          <Step4BusinessProfile
            profile={profile} setProfile={setProfile}
            businessName={businessName} setBusinessName={setBusinessName}
            contactEmail={contactEmail} setContactEmail={setContactEmail}
            cart={cart}
            onBack={() => setStep(3)} onContinue={() => setStep(5)} canContinue={canProceedStep4}
          />
        )}

        {step === 5 && (
          <Step5Account
            account={account} setAccount={setAccount} fallbackEmail={contactEmail}
            onBack={() => setStep(4)} onContinue={() => setStep(6)} canContinue={canProceedStep5}
          />
        )}

        {step === 6 && (
          <Step6Review
            cart={cart} profile={profile} account={account}
            businessName={businessName} contactEmail={contactEmail}
            coupon={selectedCoupon} customerMode={customerMode}
            collectionMethod={collectionMethod}
            onBack={() => setStep(5)} onSubmit={submit} submitting={submitting} error={error}
            canSubmit={canProceedStep6}
          />
        )}

        {step === 7 && result && (
          <Step7Progress result={result} businessName={businessName} onReset={() => { setStep(1); setResult(null); setCart({}); setBusinessName(""); setContactEmail(""); setSelectedCoupon(null); setCustomerMode(null); }} />
        )}
      </div>
    </OliverPageWrapper>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function ProgressStrip({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1 flex-1 rounded ${i + 1 <= current ? "" : "bg-gray-200"}`}
          style={i + 1 <= current ? { background: ACCENT } : {}}
        />
      ))}
    </div>
  );
}

function StepShell({ title, subtitle, children, onBack, onNext, nextLabel = "Continue →", backLabel = "← Back", canNext = true, nextBusy }: {
  title: string; subtitle?: string; children: React.ReactNode;
  onBack?: () => void; onNext?: () => void; nextLabel?: string; backLabel?: string; canNext?: boolean; nextBusy?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: INK }}>{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children}
      <div className="pt-4 flex justify-between">
        {onBack ? (
          <button onClick={onBack} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">{backLabel}</button>
        ) : <span />}
        {onNext && (
          <button onClick={onNext} disabled={!canNext || !!nextBusy}
            className="px-6 py-2.5 rounded-lg text-white font-semibold disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {nextBusy ? "Working…" : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

// ─── Step 1 — Customer mode ──────────────────────────────────────────────

function Step1Customer({ mode, setMode, searchEmail, setSearchEmail, results, loading, searchedYet, selectedId, setSelectedId, onSearch, onContinue, canContinue }: {
  mode: CustomerMode | null; setMode: (m: CustomerMode) => void;
  searchEmail: string; setSearchEmail: (v: string) => void;
  results: StripeCustomerMatch[] | null; loading: boolean; searchedYet: boolean;
  selectedId: string | null; setSelectedId: (id: string | null) => void;
  onSearch: () => void; onContinue: () => void; canContinue: boolean;
}) {
  return (
    <StepShell title="New or existing client?" subtitle="Existing = already has a Stripe customer record (we'll link the new tenant to them)." onNext={onContinue} canNext={canContinue}>
      <div className="grid grid-cols-2 gap-3">
        <ModeCard active={mode === "new"} onClick={() => setMode("new")} title="New" desc="Brand new client. We'll create a Stripe customer + send onboarding link." />
        <ModeCard active={mode === "existing"} onClick={() => setMode("existing")} title="Existing" desc="Already in Stripe. We'll link a new tenant to the existing customer record." />
      </div>
      {mode === "existing" && (
        <div className="space-y-2 mt-4 p-4 bg-slate-50 rounded-xl">
          <div className="flex gap-2">
            <input type="email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="search by email…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button onClick={onSearch} disabled={!searchEmail.includes("@") || loading}
              className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: INK }}
            >
              {loading ? "Searching…" : "Search Stripe"}
            </button>
          </div>
          {searchedYet && results && results.length === 0 && (
            <div className="text-xs text-rose-600">No Stripe customers found for that email.</div>
          )}
          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((c) => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 rounded-lg border-2 ${selectedId === c.id ? "bg-white" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  style={selectedId === c.id ? { borderColor: ACCENT } : {}}
                >
                  <div className="text-sm font-semibold">{c.name || "(no name)"} · {c.email}</div>
                  <div className="text-[10px] text-slate-500">{c.id} · {(c.subscriptions || []).length} active subs</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}

function ModeCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button onClick={onClick}
      className={`p-5 rounded-xl border-2 text-left ${active ? "bg-white shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}
      style={active ? { borderColor: ACCENT } : {}}
    >
      <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </button>
  );
}

// ─── Step 2 — Cart ───────────────────────────────────────────────────────

function Step2Cart({ cart, setCart, toggle, consultingProducts, onBack, onContinue, canContinue }: {
  cart: CartConfig; setCart: (c: CartConfig) => void; toggle: (p: Product) => void;
  consultingProducts: ConsultingProduct[] | null;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  return (
    <StepShell title="Which products?" subtitle="Multi-select. One subscription, one line item per product (Brandon's rule)." onBack={onBack} onNext={onContinue} canNext={canContinue}>
      <ProductRow active={!!cart.arion} onToggle={() => toggle("arion")} name="ARION" tagline="AI-built websites + SEO automation"
        expanded={
          cart.arion && (
            <div className="space-y-3 mt-3">
              <Picker label="Plan" options={ARION_PLANS.map((p) => ({ id: p.id, label: `${p.label} (${p.price})` }))}
                value={cart.arion.plan}
                onChange={(v) => setCart({ ...cart, arion: { ...cart.arion!, plan: v as typeof cart.arion.plan } })}
              />
              <Picker label="SEO add-on" options={ARION_SEO_ADDONS.map((s) => ({ id: s.id, label: `${s.label} (${s.price})` }))}
                value={cart.arion.seo}
                onChange={(v) => setCart({ ...cart, arion: { ...cart.arion!, seo: v as typeof cart.arion.seo } })}
              />
              <Picker label="Site type" options={[
                { id: "new", label: "New site (we build it)" },
                { id: "existing", label: "Existing WP on Hostinger (we plugin-install only)" },
                { id: "migrate", label: "Migrate from elsewhere (founder-assisted)" },
              ]} value={cart.arion.siteType}
                onChange={(v) => setCart({ ...cart, arion: { ...cart.arion!, siteType: v as ArionSiteType } })}
              />
              {(cart.arion.siteType === "existing" || cart.arion.siteType === "migrate") && (
                <Field label="WordPress site URL" required value={cart.arion.wpSiteUrl || ""}
                  onChange={(v) => setCart({ ...cart, arion: { ...cart.arion!, wpSiteUrl: v } })}
                  placeholder="https://example.com" />
              )}
            </div>
          )
        }
      />
      <ProductRow active={!!cart.oliver} onToggle={() => toggle("oliver")} name="OLIVER" tagline="Field service + jobs + invoicing"
        expanded={
          cart.oliver && (
            <Picker label="Tier" options={OLIVER_TIERS.map((t) => ({ id: t.id, label: `${t.label} (${t.price})` }))}
              value={cart.oliver.tier}
              onChange={(v) => setCart({ ...cart, oliver: { tier: v as typeof cart.oliver.tier } })}
            />
          )
        }
      />
      <ProductRow active={!!cart.spark} onToggle={() => toggle("spark")} name="SPARK" tagline="CRM + email marketing"
        expanded={
          cart.spark && (
            <div className="space-y-3">
              <Picker label="Contact volume" options={SPARK_VOLUMES.map((v) => ({ id: v, label: v }))}
                value={cart.spark.volume}
                onChange={(v) => setCart({ ...cart, spark: { ...cart.spark!, volume: v as typeof cart.spark.volume } })}
              />
              <Picker label="Add-on" options={[{ id: "", label: "None" }, { id: "pro", label: "Pro" }, { id: "business", label: "Business" }]}
                value={cart.spark.addon}
                onChange={(v) => setCart({ ...cart, spark: { ...cart.spark!, addon: v as typeof cart.spark.addon } })}
              />
            </div>
          )
        }
      />
      <ProductRow active={!!cart.consulting} onToggle={() => toggle("consulting")} name="Consulting" tagline="Monthly retainer — Build Your Brand/Clarity/Engine/Foundation"
        expanded={
          cart.consulting && consultingProducts && (
            <div className="space-y-3">
              <Picker label="Engagement" options={consultingProducts.map((p) => ({ id: p.product_id, label: p.name }))}
                value={cart.consulting.productId}
                onChange={(v) => {
                  const prod = consultingProducts.find((p) => p.product_id === v);
                  const interval = cart.consulting!.interval;
                  const matchingPrice = prod?.prices.find((pr) => pr.interval === interval);
                  setCart({ ...cart, consulting: { ...cart.consulting!, productId: v, productName: prod?.name || "", unitAmount: matchingPrice?.unit_amount ?? cart.consulting!.unitAmount } });
                }}
              />
              <Picker label="Billing interval" options={[{ id: "month", label: "Monthly" }, { id: "year", label: "Annual" }]}
                value={cart.consulting.interval}
                onChange={(v) => {
                  const prod = consultingProducts.find((p) => p.product_id === cart.consulting!.productId);
                  const matchingPrice = prod?.prices.find((pr) => pr.interval === v);
                  setCart({ ...cart, consulting: { ...cart.consulting!, interval: v as Interval, unitAmount: matchingPrice?.unit_amount ?? cart.consulting!.unitAmount } });
                }}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom price (this tenant only) — USD
                </label>
                <input type="number" min={0} step={0.01} value={(cart.consulting.unitAmount / 100).toFixed(2)}
                  onChange={(e) => setCart({ ...cart, consulting: { ...cart.consulting!, unitAmount: Math.round(parseFloat(e.target.value || "0") * 100) } })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <div className="text-[10px] text-slate-500 mt-1">
                  Stripe inline price_data override — base product price stays unchanged.
                </div>
              </div>
            </div>
          )
        }
      />
    </StepShell>
  );
}

function ProductRow({ active, onToggle, name, tagline, expanded }: {
  active: boolean; onToggle: () => void; name: string; tagline: string; expanded?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border-2 ${active ? "" : "border-slate-200"}`} style={active ? { borderColor: ACCENT } : {}}>
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center gap-3">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0`}
          style={active ? { borderColor: ACCENT, background: ACCENT } : { borderColor: "#cbd5e1" }}
        >
          {active && <span className="text-white text-xs">✓</span>}
        </div>
        <div className="flex-1">
          <div className="text-base font-bold" style={{ color: INK }}>{name}</div>
          <div className="text-xs text-slate-500">{tagline}</div>
        </div>
      </button>
      {active && expanded && <div className="px-4 pb-4">{expanded}</div>}
    </div>
  );
}

function Picker({ label, options, value, onChange }: {
  label: string; options: Array<{ id: string; label: string }>;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Step 3 — Checkout (coupon + payment method) ─────────────────────────

function Step3Checkout({ couponQuery, setCouponQuery, couponOptions, couponLoading, selectedCoupon, setSelectedCoupon, collectionMethod, setCollectionMethod, onBack, onContinue, canContinue }: {
  couponQuery: string; setCouponQuery: (v: string) => void;
  couponOptions: CouponOption[]; couponLoading: boolean;
  selectedCoupon: CouponOption | null; setSelectedCoupon: (c: CouponOption | null) => void;
  collectionMethod: "charge_automatically" | "send_invoice"; setCollectionMethod: (m: "charge_automatically" | "send_invoice") => void;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  return (
    <StepShell title="Checkout" subtitle="Apply a coupon and choose how the client pays." onBack={onBack} onNext={onContinue} canNext={canContinue}>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Coupon (optional)</label>
        <input type="text" value={couponQuery} onChange={(e) => setCouponQuery(e.target.value)}
          placeholder="Search by code or name…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {couponLoading && <div className="text-[10px] text-slate-500 mt-1">Searching…</div>}
        {couponOptions.length > 0 && (
          <div className="mt-2 space-y-1 max-h-48 overflow-auto">
            {couponOptions.map((c) => (
              <button key={c.id} onClick={() => { setSelectedCoupon(c); setCouponQuery(c.id); }}
                className={`w-full text-left p-2 rounded-lg border-2 ${selectedCoupon?.id === c.id ? "bg-white" : "border-slate-200 bg-white hover:border-slate-300"}`}
                style={selectedCoupon?.id === c.id ? { borderColor: ACCENT } : {}}
              >
                <div className="text-sm font-semibold">
                  {c.id} {c.name && <span className="text-slate-500 font-normal">· {c.name}</span>}
                </div>
                <div className="text-[10px] text-slate-500">
                  {c.percent_off != null ? `${c.percent_off}% off` : `$${(c.amount_off ?? 0) / 100} off`}
                  {" · "}{c.duration === "forever" ? "forever" : c.duration === "once" ? "once" : `${c.duration_in_months} months`}
                </div>
              </button>
            ))}
          </div>
        )}
        {selectedCoupon && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-emerald-600 font-semibold">✓ {selectedCoupon.id}</span>
            <button onClick={() => { setSelectedCoupon(null); setCouponQuery(""); }} className="text-rose-500 underline">remove</button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <label className="block text-xs font-semibold text-slate-700 mb-2">Payment method</label>
        <div className="space-y-2">
          <PaymentChoice active={collectionMethod === "charge_automatically"}
            onClick={() => setCollectionMethod("charge_automatically")}
            title="Charge automatically"
            desc="Client enters card via secure Stripe link. Card stays on file for recurring billing." />
          <PaymentChoice active={collectionMethod === "send_invoice"}
            onClick={() => setCollectionMethod("send_invoice")}
            title="Send invoice"
            desc="Stripe emails an invoice. Useful when payment is happening offline or coupon covers full amount." />
        </div>
      </div>
    </StepShell>
  );
}

function PaymentChoice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 ${active ? "bg-white" : "border-slate-200 bg-white hover:border-slate-300"}`}
      style={active ? { borderColor: ACCENT } : {}}
    >
      <div className="text-sm font-bold" style={{ color: INK }}>{title}</div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </button>
  );
}

// ─── Step 4 — Business profile ───────────────────────────────────────────

function Step4BusinessProfile({ profile, setProfile, businessName, setBusinessName, contactEmail, setContactEmail, cart, onBack, onContinue, canContinue }: {
  profile: BusinessProfile; setProfile: (p: BusinessProfile) => void;
  businessName: string; setBusinessName: (v: string) => void;
  contactEmail: string; setContactEmail: (v: string) => void;
  cart: CartConfig;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  const arionSelected = !!cart.arion;
  return (
    <StepShell title="Business profile" subtitle="Drives ARION region binding (city/state for Google D/M), WP brand swap, and SPARK sender." onBack={onBack} onNext={onContinue} canNext={canContinue}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business name" required value={businessName} onChange={setBusinessName} />
        <Field label="Primary contact email" type="email" required value={contactEmail} onChange={setContactEmail} />
      </div>
      <Field label="Street address" value={profile.address_street} onChange={(v) => setProfile({ ...profile, address_street: v })} placeholder="123 Main St" />
      <Field label="Suite / unit" value={profile.address_line2} onChange={(v) => setProfile({ ...profile, address_line2: v })} placeholder="optional" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" required value={profile.address_city} onChange={(v) => setProfile({ ...profile, address_city: v })}
          hint={arionSelected ? "Used as ARION SE Ranking region" : undefined} />
        <Field label="State" required value={profile.address_state} onChange={(v) => setProfile({ ...profile, address_state: v })}
          placeholder="IA, AZ, CA …" />
        <Field label="ZIP" value={profile.address_zip} onChange={(v) => setProfile({ ...profile, address_zip: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
        <Field label="Website" value={profile.website} onChange={(v) => setProfile({ ...profile, website: v })} placeholder="https://…" />
      </div>
      <Field label="Industry" value={profile.industry} onChange={(v) => setProfile({ ...profile, industry: v })} placeholder="e.g. Roller skating rink, Roofing, Restaurant" />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Primary color</label>
          <input type="color" value={profile.primary_color} onChange={(e) => setProfile({ ...profile, primary_color: e.target.value })}
            className="w-full h-10 rounded-lg border border-gray-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Accent color</label>
          <input type="color" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })}
            className="w-full h-10 rounded-lg border border-gray-300" />
        </div>
        <Field label="Logo URL" value={profile.logo_url} onChange={(v) => setProfile({ ...profile, logo_url: v })} placeholder="https://…" />
      </div>
    </StepShell>
  );
}

// ─── Step 5 — Owner account ──────────────────────────────────────────────

function Step5Account({ account, setAccount, fallbackEmail, onBack, onContinue, canContinue }: {
  account: OwnerAccount; setAccount: (a: OwnerAccount) => void;
  fallbackEmail: string;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  return (
    <StepShell title="Owner account" subtitle="The owner identity that lands in the CIAM directory. Beefed from display-name-only." onBack={onBack} onNext={onContinue} canNext={canContinue}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required value={account.first_name} onChange={(v) => setAccount({ ...account, first_name: v })} />
        <Field label="Last name" required value={account.last_name} onChange={(v) => setAccount({ ...account, last_name: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name" value={account.display_name} onChange={(v) => setAccount({ ...account, display_name: v })} hint="How they're addressed across products" />
        <Field label="Title / role" value={account.title} onChange={(v) => setAccount({ ...account, title: v })} placeholder="Owner, Founder, GM…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile phone" value={account.mobile} onChange={(v) => setAccount({ ...account, mobile: v })} />
        <Field label="Time zone" value={account.time_zone} onChange={(v) => setAccount({ ...account, time_zone: v })} hint="Auto-detected from your browser" />
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={account.billing_email_same} onChange={(e) => setAccount({ ...account, billing_email_same: e.target.checked })} />
          Billing email same as contact email ({fallbackEmail || "—"})
        </label>
        {!account.billing_email_same && (
          <Field label="Billing email" type="email" value={account.billing_email} onChange={(v) => setAccount({ ...account, billing_email: v })} />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={account.notif_email} onChange={(e) => setAccount({ ...account, notif_email: e.target.checked })} />
          Email notifications (operational + product updates)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={account.notif_sms} onChange={(e) => setAccount({ ...account, notif_sms: e.target.checked })} />
          SMS notifications (urgent only — appointment confirmations, etc.)
        </label>
      </div>
    </StepShell>
  );
}

// ─── Step 6 — Review ─────────────────────────────────────────────────────

function Step6Review({ cart, profile, account, businessName, contactEmail, coupon, customerMode, collectionMethod, onBack, onSubmit, submitting, error, canSubmit }: {
  cart: CartConfig; profile: BusinessProfile; account: OwnerAccount;
  businessName: string; contactEmail: string;
  coupon: CouponOption | null; customerMode: CustomerMode | null;
  collectionMethod: "charge_automatically" | "send_invoice";
  onBack: () => void; onSubmit: () => void; submitting: boolean; error: string | null; canSubmit: boolean;
}) {
  return (
    <StepShell title="Review" subtitle="Last chance before we provision." onBack={onBack} onNext={onSubmit} canNext={canSubmit} nextLabel="Onboard client →" nextBusy={submitting}>
      <Card>
        <Row label="Customer mode" value={customerMode === "new" ? "New" : "Existing (linked)"} />
        <Row label="Business" value={businessName} />
        <Row label="Email" value={contactEmail} />
        <Row label="Owner" value={`${account.first_name} ${account.last_name} (${account.title || "—"})`} />
        <Row label="Location" value={`${profile.address_city}, ${profile.address_state} ${profile.address_zip}`} />
      </Card>
      <Card title="Cart">
        {cart.arion && <Row label="ARION" value={`${cart.arion.plan}${cart.arion.seo ? ` + SEO ${cart.arion.seo}` : ""} · ${cart.arion.siteType} site`} />}
        {cart.oliver && <Row label="OLIVER" value={cart.oliver.tier} />}
        {cart.spark && <Row label="SPARK" value={`${cart.spark.volume}${cart.spark.addon ? ` + ${cart.spark.addon} add-on` : ""}`} />}
        {cart.consulting && <Row label="Consulting" value={`${cart.consulting.productName} · $${(cart.consulting.unitAmount / 100).toFixed(2)}/${cart.consulting.interval}`} />}
      </Card>
      <Card title="Billing">
        <Row label="Coupon" value={coupon ? `${coupon.id} (${coupon.percent_off != null ? `${coupon.percent_off}% off` : `$${(coupon.amount_off ?? 0) / 100} off`}, ${coupon.duration})` : "None"} />
        <Row label="Method" value={collectionMethod === "charge_automatically" ? "Charge automatically (Stripe link)" : "Send invoice"} />
      </Card>
      {error && <div className="text-sm text-rose-600">{error}</div>}
    </StepShell>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
      {title && <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</div>}
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-slate-500 w-32 inline-block">{label}:</span> <strong>{value || "—"}</strong>
    </div>
  );
}

// ─── Step 7 — Progress + handoff ─────────────────────────────────────────

function Step7Progress({ result, businessName, onReset }: { result: OnboardResult; businessName: string; onReset: () => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: INK }}>✓ {businessName} onboarded</h2>
      <Card>
        <div className="text-sm"><strong>Tenant ID:</strong> <code className="text-xs">{result.tenant_id}</code></div>
        <div className="text-sm"><strong>Slug:</strong> {result.slug}</div>
        {result.stripe_customer_id && <div className="text-sm"><strong>Stripe customer:</strong> <code className="text-xs">{result.stripe_customer_id}</code></div>}
      </Card>
      <Card title="Steps executed">
        <ul className="text-sm space-y-1">
          {result.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`text-[10px] font-bold uppercase mt-1 px-1.5 py-0.5 rounded ${
                ["ok", "created", "linked", "reused", "saved"].includes(s.status) ? "bg-emerald-100 text-emerald-700" :
                s.status === "warn" ? "bg-amber-100 text-amber-700" :
                s.status === "skipped" ? "bg-slate-100 text-slate-600" :
                "bg-rose-100 text-rose-700"
              }`}>{s.status}</span>
              <span><strong>{s.step}</strong> — {s.detail}</span>
            </li>
          ))}
        </ul>
      </Card>
      {result.handoff?.arion && (
        <Card title="ARION plugin install handoff">
          <details open>
            <summary className="cursor-pointer text-xs font-semibold">Method A — Hostinger SSH + WP-CLI</summary>
            <pre className="mt-2 bg-slate-900 text-emerald-300 text-[11px] p-3 rounded overflow-x-auto whitespace-pre-wrap">{result.handoff.arion.manual_install.method_a_hostinger_ssh.join("\n")}</pre>
          </details>
          <details>
            <summary className="cursor-pointer text-xs font-semibold">Method B — manual .zip upload</summary>
            <pre className="mt-2 bg-slate-900 text-emerald-300 text-[11px] p-3 rounded overflow-x-auto whitespace-pre-wrap">{result.handoff.arion.manual_install.method_b_manual_zip.join("\n")}</pre>
          </details>
          <div className="mt-3 text-xs">
            <strong>Provision code (14 days):</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">{result.handoff.arion.provision_code}</code>
          </div>
        </Card>
      )}
      <button onClick={onReset} className="px-6 py-2.5 rounded-lg border border-gray-300 text-slate-700 font-semibold">
        Onboard another client
      </button>
    </div>
  );
}

export default ConsultingOnboardClientPageV2;
