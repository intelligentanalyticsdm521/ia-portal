// ConsultingOnboardClientPageV2 — Founder onboarding wizard.
//
// REBUILT 2026-06-17 (commit after wizard-v1-fabricated-cart incident):
// The cart picker in step 2 is now CATALOG-DRIVEN — it uses the SAME
// `fetchPlanCatalog('arion')` + `fetchSignupCatalog('oliver'|'spark', cycle)`
// APIs that public /pricing uses, and the SAME canonical CartItem types
// from `lib/signupCart.ts`. Hardcoded plan lists / prices have been removed.
// Don't reintroduce them — they will fall out of sync with Stripe.
//
// Backend dependency table:
//   GET  /onboarding/checkout/catalog?product=arion      → arionPlans
//   GET  /signup/catalog?product=oliver&billing=...      → cat.plans
//   GET  /signup/catalog?product=spark&billing=...       → cat.volumes/featureAddons/leads
//   GET  /admin/onboard-client/coupons?q=                → coupon autocomplete (founder only)
//   GET  /admin/onboard-client/consulting-products       → consulting Stripe products
//   GET  /admin/onboard-client/stripe-customer-search    → existing-customer lookup
//   POST /admin/onboard-client                           → tenant + Stripe customer + coupon
//                                                          + subscription_items (consulting price_data)
//                                                          + business_profile + owner_account
//   POST /signup/checkout-cart  ← Stripe Checkout URL for ARION/SPARK/OLIVER
//                                  (bundle coupon auto-applied server-side)

import { useEffect, useMemo, useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { useOliverApi } from "../../hooks/useOliverApi";
import { fetchPlanCatalog, type PlanCatalogEntry } from "../../lib/onboardingApi";
import {
  fetchSignupCatalog, createSignupCartCheckout,
  type SignupCatalog,
} from "../../lib/signupCheckout";
import { bundleDiscountPercent, type CartItem } from "../../lib/signupCart";

// ─── Types ────────────────────────────────────────────────────────────────

type CustomerMode = "new" | "existing";
type ArionSiteType = "new" | "existing" | "migrate";
type BillingCycle = "monthly" | "annual";

interface ConsultingProduct {
  product_id: string;
  name: string;
  prices: Array<{ id: string; unit_amount: number; interval?: string; nickname?: string | null }>;
}
interface ConsultingPick {
  productId: string;
  productName: string;
  interval: "month" | "year";
  unitAmount: number; // cents (founder-overridable)
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
  subscriptions?: Array<{ id: string; items: Array<{ price_id: string; nickname: string | null }> }>;
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

// ARION = uses `arion` product type; SPARK/OLIVER use their own.
// Cart shape mirrors signupCart.ts canonically.

const ACCENT = "#EF6C33";
const INK = "#0B1C24";

function money(usd: number) { return `$${usd.toFixed(2)}`; }

// ─── Component ────────────────────────────────────────────────────────────

export function ConsultingOnboardClientPageV2() {
  const { post, get } = useOliverApi();

  // Wizard state
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [customerMode, setCustomerMode] = useState<CustomerMode | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<StripeCustomerMatch[] | null>(null);
  const [searchedYet, setSearchedYet] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step 2 — Catalog-driven cart
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [consultingPick, setConsultingPick] = useState<ConsultingPick | null>(null);
  const [arionPlans, setArionPlans] = useState<PlanCatalogEntry[]>([]);
  const [oliverCat, setOliverCat] = useState<SignupCatalog | null>(null);
  const [sparkCat, setSparkCat] = useState<SignupCatalog | null>(null);
  const [consultingProducts, setConsultingProducts] = useState<ConsultingProduct[] | null>(null);
  const [consultingError, setConsultingError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [arionSiteType, setArionSiteType] = useState<ArionSiteType>("new");
  const [arionSiteUrl, setArionSiteUrl] = useState("");

  // Step 3 — Coupon
  const [couponQuery, setCouponQuery] = useState("");
  const [couponOptions, setCouponOptions] = useState<CouponOption[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponOption | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [collectionMethod, setCollectionMethod] = useState<"charge_automatically" | "send_invoice">("charge_automatically");

  // Step 4 — Profile
  const [profile, setProfile] = useState<BusinessProfile>({
    address_street: "", address_line2: "", address_city: "", address_state: "", address_zip: "",
    phone: "", website: "", industry: "", primary_color: "#EF6C33", accent_color: "#0B1C24", logo_url: "",
  });
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Step 5 — Account
  const tzGuess = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago", []);
  const [account, setAccount] = useState<OwnerAccount>({
    first_name: "", last_name: "", display_name: "", title: "", mobile: "",
    time_zone: tzGuess, billing_email_same: true, billing_email: "",
    notif_email: true, notif_sms: false,
  });

  // ─── Catalog fetch (single source of truth — DO NOT hardcode prices) ──

  useEffect(() => {
    let cancelled = false;
    setCatLoading(true);
    setConsultingError(null);
    Promise.all([
      fetchPlanCatalog("arion").catch(() => []),
      fetchSignupCatalog("oliver", cycle).catch(() => null),
      fetchSignupCatalog("spark", cycle).catch(() => null),
      // NOTE: useOliverApi().get auto-unwraps the {data:...} envelope inside
      // oliverApi.ts (see "data" in json check at line ~74). So the returned
      // value is the ConsultingProduct[] directly — do NOT access .data on it.
      get<ConsultingProduct[]>("/admin/onboard-client/consulting-products")
        .then((r) => ({ data: Array.isArray(r) ? r : [], err: null as string | null }))
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("[wizard] consulting-products FAILED:", e);
          return { data: [] as ConsultingProduct[], err: (e as Error).message || String(e) };
        }),
    ]).then(([ap, oc, sc, cp]) => {
      if (cancelled) return;
      setArionPlans(ap || []);
      setOliverCat(oc);
      setSparkCat(sc);
      setConsultingProducts(cp.data || []);
      setConsultingError(cp.err);
      setCatLoading(false);
    });
    return () => { cancelled = true; };
  }, [cycle, get]);

  // ─── Cart helpers (work against canonical CartItem types) ─────────────

  const findCart = <P extends CartItem["product"]>(p: P) =>
    cart.find((it) => it.product === p) as Extract<CartItem, { product: P }> | undefined;

  const upsertCart = (item: CartItem) => {
    setCart((prev) => [...prev.filter((it) => it.product !== item.product), item]);
  };

  const removeCart = (product: CartItem["product"]) => {
    setCart((prev) => prev.filter((it) => it.product !== product));
  };

  // ─── Stripe customer search (existing mode) ───────────────────────────

  const runStripeSearch = async () => {
    if (!searchEmail.includes("@")) return;
    setSearchLoading(true);
    setSearchedYet(true);
    try {
      // oliverFetch auto-unwraps the {data:...} envelope; r IS the array.
      const r = await get<StripeCustomerMatch[]>(`/admin/onboard-client/stripe-customer-search?email=${encodeURIComponent(searchEmail)}`);
      setSearchResults(Array.isArray(r) ? r : []);
    } catch (e) {
      setError((e as Error).message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // ─── Coupon autocomplete (debounced) ──────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setCouponLoading(true);
      try {
        // oliverFetch auto-unwraps {data:...}; r IS the CouponOption array.
        const r = await get<CouponOption[]>(`/admin/onboard-client/coupons?q=${encodeURIComponent(couponQuery)}`);
        if (!cancelled) setCouponOptions(Array.isArray(r) ? r : []);
      } catch { /* swallow */ }
      finally { if (!cancelled) setCouponLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [couponQuery, get]);

  // ─── Submit ───────────────────────────────────────────────────────────

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const arion = findCart("arion");
      const oliver = findCart("oliver");
      const spark = findCart("spark");

      // 1. Founder tenant create (+ Stripe customer + coupon + profile + consulting sub)
      const adminBody: Record<string, unknown> = {
        business_name: businessName,
        contact_email: contactEmail,
        contact_name: account.display_name || `${account.first_name} ${account.last_name}`.trim() || undefined,
        contact_phone: account.mobile || undefined,
        products: [arion, oliver, spark].filter(Boolean).map((it) => it!.product),
        arion_plan: arion?.plan,
        arion_seo: arion?.seo || undefined,
        oliver_tier: oliver?.plan,
        spark_volume: spark?.volume,
        spark_addon: spark?.featureAddon || undefined,
        wp_site_url: arion ? arionSiteUrl || undefined : undefined,
        arion_site_type: arion ? arionSiteType : undefined,
        stripe_action: customerMode === "existing" ? "link_existing" : "create_new_with_coupon",
        coupon_code: selectedCoupon?.id,
        collection_method: collectionMethod,
        business_profile: profile,
        owner_account: account,
      };
      // Consulting flows through subscription_items (uses price_data override).
      // Send whatever unit_amount the founder typed (including 0 for fully
      // discounted engagements). The backend handles 0-amount by not creating
      // a Stripe subscription line item.
      if (consultingPick) {
        adminBody.subscription_items = [{
          product_id: consultingPick.productId,
          unit_amount: consultingPick.unitAmount,
          interval: consultingPick.interval,
        }];
      }
      // oliverFetch auto-unwraps {data:...}; adminResp IS the OnboardResult.
      const adminResp = await post<OnboardResult>("/admin/onboard-client", adminBody);
      setResult(adminResp);

      // 2. For ARION/SPARK/OLIVER, fire createSignupCartCheckout to get
      // the real Stripe Checkout URL (bundle discount auto-applied). The
      // URL gets shown to the founder to copy/send to the client.
      // Public /pricing uses the exact same endpoint — single source of truth.
      const cartItems = cart.map((it) => {
        if (it.product === "arion")  return { product: "arion" as const,  plan: it.plan, seo: it.seo || null };
        if (it.product === "oliver") return { product: "oliver" as const, plan: it.plan };
        return {
          product: "spark" as const, volume: it.volume,
          featureAddon: it.featureAddon || null,
          leads: it.leads || null,
          ...(it.leads ? { leadsSelected: it.leadsSelected } : {}),
        };
      });
      if (cartItems.length > 0) {
        const r = await createSignupCartCheckout({
          email: contactEmail,
          name: account.display_name || businessName,
          billing_cycle: cycle,
          items: cartItems,
          // Founder override — wins over the auto-applied MP5R/MP7R bundle
          // when present. Bundle still auto-applies if founder picks no coupon.
          coupon_code: selectedCoupon?.id,
        });
        setCheckoutUrl(r.checkout_url);
      }
      setStep(7);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Gates ────────────────────────────────────────────────────────────

  const canProceedStep1 = customerMode === "new" || (customerMode === "existing" && selectedExistingId !== null);
  const cartCount = cart.length + (consultingPick ? 1 : 0);
  const canProceedStep2 = cartCount > 0 && (
    !findCart("arion")
    || arionSiteType === "new"
    || arionSiteUrl.trim().length > 5
  );
  const canProceedStep3 = true;
  const canProceedStep4 = Boolean(
    businessName.trim().length > 1
    && contactEmail.includes("@")
    && profile.address_city.trim()
    && profile.address_state.trim()
  );
  const canProceedStep5 = account.first_name.trim().length > 0 && account.last_name.trim().length > 0;
  const canProceedStep6 = Boolean(canProceedStep1 && canProceedStep2 && canProceedStep4 && canProceedStep5);

  return (
    <OliverPageWrapper title="Onboard Client (V2)" subtitle="IA Consulting · 7-step founder wizard" error={error} loading={submitting}>
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
            cart={cart} upsertCart={upsertCart} removeCart={removeCart}
            cycle={cycle} setCycle={setCycle}
            arionPlans={arionPlans}
            oliverCat={oliverCat} sparkCat={sparkCat}
            consultingProducts={consultingProducts} consultingPick={consultingPick} setConsultingPick={setConsultingPick}
            consultingError={consultingError}
            loading={catLoading}
            arionSiteType={arionSiteType} setArionSiteType={setArionSiteType}
            arionSiteUrl={arionSiteUrl} setArionSiteUrl={setArionSiteUrl}
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
            arionInCart={!!findCart("arion")}
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
            cart={cart} consultingPick={consultingPick} cycle={cycle}
            profile={profile} account={account}
            businessName={businessName} contactEmail={contactEmail}
            coupon={selectedCoupon} customerMode={customerMode}
            collectionMethod={collectionMethod}
            onBack={() => setStep(5)} onSubmit={submit} submitting={submitting} error={error}
            canSubmit={canProceedStep6}
          />
        )}

        {step === 7 && result && (
          <Step7Progress
            result={result}
            checkoutUrl={checkoutUrl}
            businessName={businessName}
            onReset={() => {
              setStep(1); setResult(null); setCheckoutUrl(null); setCart([]); setConsultingPick(null);
              setBusinessName(""); setContactEmail(""); setSelectedCoupon(null); setCustomerMode(null);
            }}
          />
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

// ─── Step 2 — Catalog-driven cart ────────────────────────────────────────

function Step2Cart({ cart, upsertCart, removeCart, cycle, setCycle, arionPlans, oliverCat, sparkCat, consultingProducts, consultingPick, setConsultingPick, consultingError, loading, arionSiteType, setArionSiteType, arionSiteUrl, setArionSiteUrl, onBack, onContinue, canContinue }: {
  cart: CartItem[];
  upsertCart: (it: CartItem) => void;
  removeCart: (p: CartItem["product"]) => void;
  cycle: BillingCycle; setCycle: (c: BillingCycle) => void;
  arionPlans: PlanCatalogEntry[];
  oliverCat: SignupCatalog | null;
  sparkCat: SignupCatalog | null;
  consultingProducts: ConsultingProduct[] | null;
  consultingPick: ConsultingPick | null;
  setConsultingPick: (p: ConsultingPick | null) => void;
  consultingError: string | null;
  loading: boolean;
  arionSiteType: ArionSiteType; setArionSiteType: (t: ArionSiteType) => void;
  arionSiteUrl: string; setArionSiteUrl: (v: string) => void;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  const arionInCart = cart.find((it) => it.product === "arion") as Extract<CartItem, { product: "arion" }> | undefined;
  const oliverInCart = cart.find((it) => it.product === "oliver") as Extract<CartItem, { product: "oliver" }> | undefined;
  const sparkInCart = cart.find((it) => it.product === "spark") as Extract<CartItem, { product: "spark" }> | undefined;
  const bundle = bundleDiscountPercent(cart);

  if (loading) return <StepShell title="Configure cart" onBack={onBack}><div className="text-center text-gray-500 py-12">Loading catalog from OLIVER Products &amp; Services…</div></StepShell>;

  return (
    <StepShell title="Configure cart" subtitle="Live prices from OLIVER Products & Services. Bundle discount auto-applies (5% for 2 platforms, 7% for 3+)." onBack={onBack} onNext={onContinue} canNext={canContinue}>
      {/* Billing cycle toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-semibold text-slate-700">Billing cycle:</span>
        <div className="inline-flex rounded-full bg-gray-100 p-1">
          <button onClick={() => setCycle("monthly")} className={`px-4 py-1.5 rounded-full text-xs font-medium ${cycle === "monthly" ? "bg-white shadow text-gray-900" : "text-gray-600"}`}>Monthly</button>
          <button onClick={() => setCycle("annual")} className={`px-4 py-1.5 rounded-full text-xs font-medium ${cycle === "annual" ? "bg-white shadow text-gray-900" : "text-gray-600"}`}>Annual <span className="text-[#EF6C33] ml-0.5">save 10%</span></button>
        </div>
        {bundle > 0 && (
          <span className="ml-auto inline-block rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[10px] font-bold uppercase">
            Bundle −{bundle}%
          </span>
        )}
      </div>

      {/* ARION — driven by fetchPlanCatalog('arion') */}
      <ProductSection title="ARION" tagline="AI-built websites + SEO automation" inCart={!!arionInCart} onRemove={() => removeCart("arion")}>
        {arionPlans.length === 0 ? (
          <div className="text-xs text-amber-600">ARION plans not available — check arion-api /onboarding/checkout/catalog.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {arionPlans.map((p) => {
                const active = arionInCart?.plan === p.key;
                // catalog returns monthly_usd + annual_per_month_usd.
                // For annual mode, show the FULL annual cost with /yr label.
                const price = cycle === "annual"
                  ? (p.pricing.annual_per_month_usd ?? 0) * 12
                  : (p.pricing.monthly_usd ?? 0);
                return (
                  <button key={p.key}
                    onClick={() => upsertCart({ product: "arion", plan: p.key, seo: arionInCart?.seo || "" })}
                    className={`p-3 rounded-lg border-2 text-left text-xs ${active ? "bg-white shadow" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    style={active ? { borderColor: ACCENT } : {}}
                  >
                    <div className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">{p.name}</div>
                    <div className="text-base font-bold text-slate-900 mt-1">{money(price)}<span className="text-[10px] font-normal text-slate-500">/{cycle === "annual" ? "yr" : "mo"}</span></div>
                  </button>
                );
              })}
            </div>
            {arionInCart && (
              <>
                {/* SEO add-on — surfaced labels match public /pricing
                    (essentials/growth/authority). Exact pricing comes from
                    Stripe at checkout time. */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">SEO add-on (optional)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["", "essentials", "growth", "authority"] as const).map((k) => (
                      <button key={k || "none"}
                        onClick={() => upsertCart({ product: "arion", plan: arionInCart.plan, seo: k })}
                        className={`p-2 rounded-lg border-2 text-xs ${arionInCart.seo === k || (!arionInCart.seo && k === "") ? "bg-white shadow" : "border-slate-200 bg-white hover:border-slate-300"}`}
                        style={(arionInCart.seo === k || (!arionInCart.seo && k === "")) ? { borderColor: "#38BDF8" } : {}}
                      >
                        {k === "" ? "None" : k[0].toUpperCase() + k.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Site type */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Site type</label>
                  <select value={arionSiteType} onChange={(e) => setArionSiteType(e.target.value as ArionSiteType)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                    <option value="new">New site (we build it)</option>
                    <option value="existing">Existing WP on Hostinger (plugin install)</option>
                    <option value="migrate">Migrate from elsewhere (founder-assisted)</option>
                  </select>
                </div>
                {(arionSiteType === "existing" || arionSiteType === "migrate") && (
                  <Field label="WordPress site URL" required value={arionSiteUrl} onChange={setArionSiteUrl} placeholder="https://example.com" />
                )}
              </>
            )}
          </div>
        )}
      </ProductSection>

      {/* OLIVER — driven by fetchSignupCatalog('oliver') */}
      <ProductSection title="OLIVER" tagline="Field service + jobs + invoicing" inCart={!!oliverInCart} onRemove={() => removeCart("oliver")}>
        {!oliverCat?.plans || oliverCat.plans.length === 0 ? (
          <div className="text-xs text-amber-600">OLIVER plans not available — Stripe prices not configured.</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {oliverCat.plans.map((p) => {
              const active = oliverInCart?.plan === p.key;
              // fetchSignupCatalog(product, cycle) returns monthly_usd that
              // represents the per-month-equivalent for the selected cycle.
              // Multiply by 12 for the full annual cost when in annual mode.
              const displayPrice = cycle === "annual" ? p.monthly_usd * 12 : p.monthly_usd;
              return (
                <button key={p.key}
                  onClick={() => upsertCart({ product: "oliver", plan: p.key })}
                  className={`p-3 rounded-lg border-2 text-left text-xs ${active ? "bg-white shadow" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  style={active ? { borderColor: ACCENT } : {}}
                >
                  <div className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">{p.name}</div>
                  <div className="text-base font-bold text-slate-900 mt-1">{money(displayPrice)}<span className="text-[10px] font-normal text-slate-500">/{cycle === "annual" ? "yr" : "mo"}</span></div>
                </button>
              );
            })}
          </div>
        )}
      </ProductSection>

      {/* SPARK — driven by fetchSignupCatalog('spark') */}
      <ProductSection title="SPARK" tagline="CRM + email marketing + Lead Gen add-on" inCart={!!sparkInCart} onRemove={() => removeCart("spark")}>
        <SparkPicker cat={sparkCat} item={sparkInCart} upsert={(it) => upsertCart(it)} cycle={cycle} />
      </ProductSection>

      {/* Consulting — founder-only, separate from /pricing */}
      <ProductSection title="Consulting" tagline="Retainer engagements — sourced from OLIVER service offerings. Founder picks engagement; price overridable per tenant. Cycle toggle above changes the default."
        inCart={!!consultingPick} onRemove={() => setConsultingPick(null)}>
        {!consultingProducts || consultingProducts.length === 0 ? (
          <div className="text-xs space-y-1">
            <div className="text-amber-700 font-semibold">No consulting offerings returned.</div>
            {consultingError ? (
              <div className="text-rose-600">Endpoint error: <code className="text-[11px]">{consultingError}</code></div>
            ) : (
              <div className="text-slate-600">
                Endpoint returned an empty list. Make sure OLIVER has offerings under the founder tenant
                whose name starts with "Build Your" or contains "Consulting", and that they're set to is_active.
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-2">
              Debug: open browser devtools → Network tab → look at <code>/admin/onboard-client/consulting-products</code> response.
            </div>
          </div>
        ) : (
          <ConsultingPicker products={consultingProducts} pick={consultingPick} setPick={setConsultingPick} cycle={cycle} />
        )}
      </ProductSection>
    </StepShell>
  );
}

function ProductSection({ title, tagline, inCart, onRemove, children }: {
  title: string; tagline: string; inCart: boolean; onRemove: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border-2 p-4 ${inCart ? "" : "border-slate-200"}`} style={inCart ? { borderColor: ACCENT } : {}}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-base font-bold" style={{ color: INK }}>{title}</div>
          <div className="text-xs text-slate-500">{tagline}</div>
        </div>
        {inCart && (
          <button onClick={onRemove} className="text-[11px] text-rose-600 hover:text-rose-700 underline">Remove</button>
        )}
      </div>
      {children}
    </div>
  );
}

function SparkPicker({ cat, item, upsert, cycle }: {
  cat: SignupCatalog | null;
  item: Extract<CartItem, { product: "spark" }> | undefined;
  upsert: (it: CartItem) => void;
  cycle: BillingCycle;
}) {
  const unitLabel = cycle === "annual" ? "yr" : "mo";
  const multiplier = cycle === "annual" ? 12 : 1;
  const volumes = cat?.volumes || [];
  const currentVolume = item?.volume || volumes[0]?.volume || "";
  const volIndex = Math.max(0, volumes.findIndex((v) => v.volume === currentVolume));
  const currentVol = volumes[volIndex];
  const leadsMeta = item?.leads && cat?.leads ? cat.leads[item.leads] : null;
  const leadsCount = item?.leadsSelected ?? (leadsMeta?.included || 0);

  const setItem = (patch: Partial<Extract<CartItem, { product: "spark" }>>) => {
    upsert({
      product: "spark",
      volume: currentVolume,
      featureAddon: "",
      leads: "",
      ...(item || {}),
      ...patch,
    } as CartItem);
  };

  if (volumes.length === 0) {
    return <div className="text-xs text-amber-600">SPARK volumes not available — Stripe prices not configured.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Volume slider */}
      <div>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-xl font-bold text-slate-900">{currentVolume}</span>
          <span className="text-xs text-slate-500">emails/mo</span>
          <span className="ml-auto text-lg font-bold text-[#EF6C33]">{money((currentVol?.monthly_usd || 0) * multiplier)}<span className="text-[10px] font-normal text-slate-500">/{unitLabel}</span></span>
        </div>
        <input type="range" min={0} max={volumes.length - 1} step={1} value={volIndex}
          onChange={(e) => setItem({ volume: volumes[Number(e.target.value)].volume })}
          className="w-full accent-[#EF6C33]" />
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 px-0.5">
          {volumes.map((v) => <span key={v.volume} className={v.volume === currentVolume ? "font-bold text-[#EF6C33]" : ""}>{v.volume}</span>)}
        </div>
      </div>

      {/* Feature add-on */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Feature add-on</label>
        <div className="grid grid-cols-3 gap-2">
          {(["", "pro", "business"] as const).map((k) => {
            const meta = k ? cat?.featureAddons?.[k] : null;
            const active = (item?.featureAddon || "") === k;
            const disabled = k !== "" && !meta;
            return (
              <button key={k || "std"} disabled={disabled}
                onClick={() => !disabled && setItem({ featureAddon: k })}
                className={`p-2 rounded-lg border-2 text-xs ${active ? "bg-white shadow" : "border-slate-200 bg-white hover:border-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                style={active ? { borderColor: ACCENT } : {}}
              >
                <div className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">{k === "" ? "Standard" : k}</div>
                <div className="text-xs text-slate-900 mt-0.5">{k === "" ? "Included" : meta ? `+${money(meta.monthly_usd * multiplier)}/${unitLabel}` : "—"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lead Gen */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Lead Generation (optional)</label>
        <select value={item?.leads || ""}
          onChange={(e) => setItem({ leads: e.target.value as "" | "essentials" | "growth" | "authority", leadsSelected: 0 })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
          <option value="">No lead generation</option>
          {Object.entries(cat?.leads || {}).map(([k, v]) => (
            <option key={k} value={k}>{v.name} — {money(v.monthly_usd * multiplier)}/{unitLabel} (incl. {v.included} leads)</option>
          ))}
        </select>
        {leadsMeta && (
          <div className="mt-2">
            <label className="block text-[10px] text-slate-600 mb-1">
              Leads/mo: <strong>{leadsCount}</strong>
              {" "}(incl. {leadsMeta.included}; +{money(leadsMeta.addon_unit_usd || 0)} per {leadsMeta.increment})
            </label>
            <input type="range"
              min={leadsMeta.included}
              max={leadsMeta.included + leadsMeta.increment * 40}
              step={leadsMeta.increment}
              value={leadsCount}
              onChange={(e) => setItem({ leadsSelected: Number(e.target.value) })}
              className="w-full accent-[#EF6C33]" />
          </div>
        )}
      </div>
    </div>
  );
}

function ConsultingPicker({ products, pick, setPick, cycle }: {
  products: ConsultingProduct[];
  pick: ConsultingPick | null;
  setPick: (p: ConsultingPick | null) => void;
  cycle: BillingCycle;
}) {
  // Click a product card → instantly add to cart with the cycle-appropriate
  // default price (monthly or annual). Mirrors ARION/OLIVER pickers —
  // implicit add, not explicit "Add to cart" button. Interval + price edit
  // inline and auto-save.
  const defaultInterval: "month" | "year" = cycle === "annual" ? "year" : "month";
  const selectProduct = (p: ConsultingProduct, interval: "month" | "year" = defaultInterval) => {
    const defaultPrice = p.prices.find((pr) => pr.interval === interval)
      ?? p.prices.find((pr) => pr.interval === "month")
      ?? p.prices[0];
    setPick({
      productId: p.product_id,
      productName: p.name,
      interval,
      unitAmount: defaultPrice?.unit_amount ?? 0,
    });
  };

  // When the cycle toggle changes globally, re-sync any existing pick to the
  // new interval's catalog price so the user sees the right default.
  useEffect(() => {
    if (!pick) return;
    const prod = products.find((p) => p.product_id === pick.productId);
    if (!prod) return;
    if (pick.interval !== defaultInterval) {
      const newDefault = prod.prices.find((pr) => pr.interval === defaultInterval);
      if (newDefault) {
        setPick({ ...pick, interval: defaultInterval, unitAmount: newDefault.unit_amount });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  const updateInterval = (newInterval: "month" | "year") => {
    if (!pick) return;
    const prod = products.find((p) => p.product_id === pick.productId);
    if (!prod) return;
    const defaultPrice = prod.prices.find((pr) => pr.interval === newInterval);
    setPick({
      ...pick,
      interval: newInterval,
      // Pull the catalog default for the new interval so the price input
      // reflects what's actually configured in OLIVER for monthly vs annual.
      unitAmount: defaultPrice?.unit_amount ?? pick.unitAmount,
    });
  };

  const updateAmount = (newCents: number) => {
    if (!pick) return;
    setPick({ ...pick, unitAmount: newCents });
  };

  const activeProd = pick ? products.find((p) => p.product_id === pick.productId) : null;
  const catalogPriceForInterval = activeProd?.prices.find((pr) => pr.interval === pick?.interval);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {products.map((p) => {
          const active = pick?.productId === p.product_id;
          // Card shows the cycle-appropriate price so the toggle is visible.
          const displayPrice = p.prices.find((pr) => pr.interval === defaultInterval)
            ?? p.prices.find((pr) => pr.interval === "month")
            ?? p.prices[0];
          const unitLabel = displayPrice?.interval === "year" ? "yr" : "mo";
          return (
            <button key={p.product_id}
              onClick={() => selectProduct(p)}
              className={`p-3 rounded-lg border-2 text-left ${active ? "bg-white shadow" : "border-slate-200 bg-white hover:border-slate-300"}`}
              style={active ? { borderColor: ACCENT } : {}}
            >
              <div className="font-bold text-slate-900 text-[11px]">{p.name}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {displayPrice ? `from ${money(displayPrice.unit_amount / 100)}/${unitLabel}` : "price TBD"}
              </div>
            </button>
          );
        })}
      </div>

      {pick && activeProd && (
        <div className="space-y-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-[11px] font-semibold text-slate-700">
            Configuring: <span style={{ color: ACCENT }}>{pick.productName}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Billing interval</label>
              <select value={pick.interval} onChange={(e) => updateInterval(e.target.value as "month" | "year")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                <option value="month">Monthly</option>
                <option value="year">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Price (this tenant only) — USD
              </label>
              <input type="number" min={0} step={0.01} value={(pick.unitAmount / 100).toFixed(2)}
                onChange={(e) => updateAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="text-[10px] text-slate-500 mt-0.5">
                OLIVER default: {catalogPriceForInterval ? money(catalogPriceForInterval.unit_amount / 100) : "—"}/{pick.interval === "month" ? "mo" : "yr"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3 — Coupon + payment method ────────────────────────────────────

function Step3Checkout({ couponQuery, setCouponQuery, couponOptions, couponLoading, selectedCoupon, setSelectedCoupon, collectionMethod, setCollectionMethod, onBack, onContinue, canContinue }: {
  couponQuery: string; setCouponQuery: (v: string) => void;
  couponOptions: CouponOption[]; couponLoading: boolean;
  selectedCoupon: CouponOption | null; setSelectedCoupon: (c: CouponOption | null) => void;
  collectionMethod: "charge_automatically" | "send_invoice"; setCollectionMethod: (m: "charge_automatically" | "send_invoice") => void;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
  return (
    <StepShell title="Checkout setup" subtitle="Apply a coupon (optional) and choose how the client pays." onBack={onBack} onNext={onContinue} canNext={canContinue}>
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
            title="Charge automatically (Stripe Checkout link)"
            desc="Stripe Checkout URL is generated. Client clicks it, enters card, card stays on file for recurring billing." />
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

function Step4BusinessProfile({ profile, setProfile, businessName, setBusinessName, contactEmail, setContactEmail, arionInCart, onBack, onContinue, canContinue }: {
  profile: BusinessProfile; setProfile: (p: BusinessProfile) => void;
  businessName: string; setBusinessName: (v: string) => void;
  contactEmail: string; setContactEmail: (v: string) => void;
  arionInCart: boolean;
  onBack: () => void; onContinue: () => void; canContinue: boolean;
}) {
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
          hint={arionInCart ? "Used as ARION SE Ranking region" : undefined} />
        <Field label="State" required value={profile.address_state} onChange={(v) => setProfile({ ...profile, address_state: v })}
          placeholder="IA, AZ, CA…" />
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
          <input type="color" value={profile.primary_color} onChange={(e) => setProfile({ ...profile, primary_color: e.target.value })} className="w-full h-10 rounded-lg border border-gray-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Accent color</label>
          <input type="color" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} className="w-full h-10 rounded-lg border border-gray-300" />
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
    <StepShell title="Owner account" subtitle="The owner identity that lands in the CIAM directory." onBack={onBack} onNext={onContinue} canNext={canContinue}>
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
          Email notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={account.notif_sms} onChange={(e) => setAccount({ ...account, notif_sms: e.target.checked })} />
          SMS notifications
        </label>
      </div>
    </StepShell>
  );
}

// ─── Step 6 — Review ─────────────────────────────────────────────────────

function Step6Review({ cart, consultingPick, cycle, profile, account, businessName, contactEmail, coupon, customerMode, collectionMethod, onBack, onSubmit, submitting, error, canSubmit }: {
  cart: CartItem[]; consultingPick: ConsultingPick | null;
  cycle: BillingCycle;
  profile: BusinessProfile; account: OwnerAccount;
  businessName: string; contactEmail: string;
  coupon: CouponOption | null; customerMode: CustomerMode | null;
  collectionMethod: "charge_automatically" | "send_invoice";
  onBack: () => void; onSubmit: () => void; submitting: boolean; error: string | null; canSubmit: boolean;
}) {
  const labelFor = (it: CartItem): string => {
    if (it.product === "oliver") return `OLIVER ${it.plan}`;
    if (it.product === "arion")  return `ARION ${it.plan}${it.seo ? ` + SEO ${it.seo}` : ""}`;
    const fa = it.featureAddon ? ` + ${it.featureAddon}` : "";
    const lg = it.leads ? ` + Leads ${it.leads}${it.leadsSelected ? ` (${it.leadsSelected}/mo)` : ""}` : "";
    return `SPARK ${it.volume}${fa}${lg}`;
  };
  return (
    <StepShell title="Review" subtitle="Last chance before we provision." onBack={onBack} onNext={onSubmit} canNext={canSubmit} nextLabel="Onboard client →" nextBusy={submitting}>
      <Card>
        <Row label="Customer mode" value={customerMode === "new" ? "New" : "Existing (linked)"} />
        <Row label="Business" value={businessName} />
        <Row label="Email" value={contactEmail} />
        <Row label="Owner" value={`${account.first_name} ${account.last_name} (${account.title || "—"})`} />
        <Row label="Location" value={`${profile.address_city}, ${profile.address_state} ${profile.address_zip}`} />
      </Card>
      <Card title={`Cart (${cycle})`}>
        {cart.map((it) => <Row key={it.product} label={it.product.toUpperCase()} value={labelFor(it)} />)}
        {consultingPick && <Row label="CONSULTING" value={`${consultingPick.productName} · ${money(consultingPick.unitAmount / 100)}/${consultingPick.interval}`} />}
        {cart.length === 0 && !consultingPick && <Row label="—" value="No items" />}
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

function Step7Progress({ result, checkoutUrl, businessName, onReset }: {
  result: OnboardResult; checkoutUrl: string | null; businessName: string; onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: INK }}>✓ {businessName} onboarded</h2>
      <Card>
        <div className="text-sm"><strong>Tenant ID:</strong> <code className="text-xs">{result.tenant_id}</code></div>
        <div className="text-sm"><strong>Slug:</strong> {result.slug}</div>
        {result.stripe_customer_id && <div className="text-sm"><strong>Stripe customer:</strong> <code className="text-xs">{result.stripe_customer_id}</code></div>}
      </Card>
      {checkoutUrl && (
        <Card title="Stripe Checkout link for the client">
          <div className="text-xs text-slate-600 mb-2">
            Send this to the client so they can complete payment + start recurring billing. Bundle discount auto-applied if 2+ platforms.
          </div>
          <div className="flex gap-2 items-stretch">
            <input readOnly value={checkoutUrl} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs bg-slate-50" />
            <button onClick={() => navigator.clipboard?.writeText(checkoutUrl)}
              className="px-3 py-2 rounded-lg text-white font-semibold text-xs"
              style={{ background: INK }}
            >
              Copy
            </button>
            <a href={checkoutUrl} target="_blank" rel="noreferrer"
              className="px-3 py-2 rounded-lg text-white font-semibold text-xs"
              style={{ background: ACCENT }}
            >
              Open
            </a>
          </div>
        </Card>
      )}
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
