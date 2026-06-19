/**
 * SignupPage — public, unauthenticated self-serve checkout.
 *
 * Mounted at /pricing (was /signup pre-2026-05-20 — renamed per
 * IA_Portal_GetStarted_PlanManagement_Spec_v1_0).
 *
 * One page, every product. OLIVER + SPARK go through the unified oliver-api
 * /signup endpoint (the single Stripe account that holds all products'
 * prices). ARION keeps its existing arion-api onboarding path (website build).
 * Nothing server-side fires until Stripe checkout completes.
 *
 *   ?platform=arion|oliver|spark|stella|consulting (per spec param name)
 *   ?product=… (legacy param name; still honoured)
 *   ?plan=     · ?billing=monthly|annual
 *
 * Phase 1 (June 1, 2026): single-platform checkout only — exactly what
 * this component currently does. Phase 2 adds the multi-item cart per the
 * IA Portal: Get Started & Plan Management spec.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  fetchPlanCatalog, fetchArionSeoAddons,
  type PlanCatalogEntry, type ArionSeoAddonEntry, type BillingCycle, type SignupProduct,
} from '../../lib/onboardingApi';
import {
  fetchSignupCatalog, createSignupCheckout, createSignupCartCheckout, type SignupCatalog,
} from '../../lib/signupCheckout';
import {
  readCart, setCartItem as cartSet, removeCartItem as cartRemove,
  readCycle as cartReadCycle, writeCycle as cartWriteCycle,
  readBuyer as cartReadBuyer, writeBuyer as cartWriteBuyer,
  bundleDiscountPercent, type CartItem, type CartProduct,
} from '../../lib/signupCart';
import { WaitlistModal } from '../../components/signup/WaitlistModal';

const PRODUCT_COPY: Record<SignupProduct, { title: string; sub: string }> = {
  arion:  { title: 'Get your AI-built website live in minutes', sub: "Pick a plan. Pay. Answer a few questions — we handle the rest." },
  oliver: { title: 'Run your field service on OLIVER', sub: 'Pick a plan and pay — a quick setup and you can send your first invoice.' },
  spark:  { title: 'Grow with SPARK CRM & marketing', sub: 'Choose your volume, pay, and start importing contacts and sending.' },
};

/** Every platform that appears on State 1 (the selector grid). Only the
 *  three "real" platforms (arion/oliver/spark) flow through to State 2
 *  checkout — the rest are either greyed out (stella/forge/argus) or
 *  route off to the marketing site quote form (consulting). */
type PlatformKey = 'arion' | 'spark' | 'oliver' | 'stella' | 'forge' | 'argus' | 'consulting';

interface PlatformCardSpec {
  key: PlatformKey;
  name: string;
  tagline: string;
  /** Starting price displayed on the card. null = grey/non-priced. */
  fromUsd: number | null;
  /** Accent color used for the card border + button. */
  accent: string;
  /** Tertiary label when the platform isn't yet purchasable. */
  status?: 'active' | 'coming-soon' | 'proposal-only';
  /** Where the Select button leads. 'state2' = inline State 2 render. */
  select:
    | { kind: 'state2'; platform: SignupProduct }
    | { kind: 'external'; url: string }
    | { kind: 'disabled'; reason: string };
}

// fromUsd is null on every active platform card — the live "From $X/mo"
// price is computed from the catalog API on State 1 mount (per
// feedback_no_fabricated_catalog: never hardcode prices). The fallback path
// shows "Loading…" until the catalog responds, then locks in the real min
// monthly. Coming-soon / proposal-only cards stay null forever.
const PLATFORM_CARDS: PlatformCardSpec[] = [
  {
    key: 'arion',
    name: 'ARION',
    tagline: 'AI-built websites + SEO automation. Done in minutes.',
    fromUsd: null,
    accent: '#EF6C33',
    status: 'active',
    select: { kind: 'state2', platform: 'arion' },
  },
  {
    key: 'spark',
    name: 'SPARK',
    tagline: 'CRM, email marketing, and lead capture in one workspace.',
    fromUsd: null,
    accent: '#F4B400',
    status: 'active',
    select: { kind: 'state2', platform: 'spark' },
  },
  {
    key: 'oliver',
    name: 'OLIVER',
    tagline: 'Field-service operations: jobs, scheduling, invoicing.',
    fromUsd: null,
    accent: '#FEC82C',
    status: 'active',
    select: { kind: 'state2', platform: 'oliver' },
  },
  {
    key: 'stella',
    name: 'STELLA',
    tagline: 'Customer-experience intelligence — coming soon.',
    fromUsd: null,
    accent: '#7C3AED',
    status: 'coming-soon',
    select: { kind: 'disabled', reason: 'Pricing announced soon.' },
  },
  {
    key: 'forge',
    name: 'FORGE',
    tagline: 'Enterprise build platform — proposal-based, launching 2027.',
    fromUsd: null,
    accent: '#0F766E',
    status: 'proposal-only',
    select: { kind: 'disabled', reason: 'Proposal-based engagement.' },
  },
  {
    key: 'argus',
    name: 'ARGUS',
    tagline: 'Cross-platform intelligence — proposal-based, launching 2027.',
    fromUsd: null,
    accent: '#475569',
    status: 'proposal-only',
    select: { kind: 'disabled', reason: 'Proposal-based engagement.' },
  },
  {
    key: 'consulting',
    name: 'IA Consulting',
    tagline: 'Custom analytics, growth, and software engagements.',
    fromUsd: null,
    accent: '#1A3A4A',
    status: 'active',
    select: {
      kind: 'external',
      url: 'https://intelligentanalyticsdm.com/get-started/',
    },
  },
];

/** Initial selected platform from URL params. Accepts both ?platform= (per
 *  IA_Portal_GetStarted_PlanManagement_Spec_v1_0) and ?product= (legacy).
 *  Returns null = render State 1 selector. Returns a SignupProduct =
 *  render State 2 for that product. */
function readSelectedPlatform(): SignupProduct | null {
  const q = new URLSearchParams(window.location.search);
  const raw = (q.get('platform') || q.get('product') || '').toLowerCase();
  if (raw === 'arion' || raw === 'spark' || raw === 'oliver') return raw;
  return null;
}

function readParams(): { plan: string | null; billing: BillingCycle; cancelled: boolean } {
  const q = new URLSearchParams(window.location.search);
  const billing = q.get('billing') === 'annual' ? 'annual' : 'monthly';
  return { plan: q.get('plan'), billing, cancelled: q.get('cancelled') === '1' };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 2026-06-20 cycle-aware price rendering helpers. Brandon flagged that the
// public /pricing page was showing the FULL ANNUAL price with a /mo label
// when the toggle was on Annual. Root cause: oliver-api `/signup/catalog?
// billing=annual` returns `monthly_usd = unit_amount / 100` of the
// year-interval Stripe price (the full yearly total) — see
// `lib/signupPricing.js` and the gotcha comment in
// `overnight-report/43_FOUNDER_WIZARD_CATALOG_ARCHITECTURE.md` lines 146-163.
// Backend now returns a `pricing` envelope on every row carrying both
// monthly_usd and annual_per_month_usd, so the UI just picks the right one.
//
// The `monthly_usd` fallback path (when `p.pricing` is absent) preserves
// the OLD buggy behavior so this code keeps working against a stale
// upstream — but with the pricing envelope present, /mo is correct.
type CatalogEntryWithPricing = {
  monthly_usd?: number | null;
  pricing?: {
    monthly_usd?: number | null;
    annual_usd?: number | null;
    annual_per_month_usd?: number | null;
    annual_savings_pct?: number | null;
  } | null;
};
function perMonth(row: CatalogEntryWithPricing | null | undefined, cycle: 'monthly' | 'annual'): number {
  if (!row) return 0;
  const sp = row.pricing;
  if (cycle === 'annual') {
    if (sp && typeof sp.annual_per_month_usd === 'number') return sp.annual_per_month_usd;
    if (sp && typeof sp.monthly_usd === 'number') return sp.monthly_usd;
    return Number(row.monthly_usd) || 0;
  }
  if (sp && typeof sp.monthly_usd === 'number') return sp.monthly_usd;
  return Number(row.monthly_usd) || 0;
}
function perYear(row: CatalogEntryWithPricing | null | undefined, cycle: 'monthly' | 'annual'): number {
  if (!row) return 0;
  const sp = row.pricing;
  if (sp && typeof sp.annual_usd === 'number') return sp.annual_usd;
  const m = perMonth(row, cycle === 'annual' ? 'monthly' : cycle) || 0;
  // Fall back to ARION's locked 10% annual discount when the backend
  // hasn't supplied the actual annual amount.
  return Math.round(m * 12 * 0.9 * 100) / 100;
}

export function SignupPage() {
  const params = useMemo(readParams, []);

  /** State 1 (selector) ↔ State 2 (platform pricing) is driven by this
   *  single piece of state. null = render the selector. */
  const [selectedPlatform, setSelectedPlatform] = useState<SignupProduct | null>(
    () => readSelectedPlatform()
  );

  /** Update the URL when the user picks a platform on State 1, so that
   *  refresh + browser back/forward and deep-links all behave correctly.
   *  Using replaceState (not pushState) for the initial pick so Back goes
   *  back to the marketing site, not to an empty State 1. */
  function gotoPlatform(p: SignupProduct) {
    const url = new URL(window.location.href);
    url.searchParams.set('platform', p);
    url.searchParams.delete('product'); // legacy alias
    window.history.replaceState(null, '', url.toString());
    setSelectedPlatform(p);
  }

  function backToSelector() {
    const url = new URL(window.location.href);
    url.searchParams.delete('platform');
    url.searchParams.delete('product');
    url.searchParams.delete('plan');
    window.history.replaceState(null, '', url.toString());
    setSelectedPlatform(null);
  }

  // When State 1 is showing we don't load any catalog — the platform
  // cards are static. State 2 loads via useEffect below using `product`.
  const product = selectedPlatform || 'oliver'; // safe default when null; effects gated by selectedPlatform
  const copy = PRODUCT_COPY[product];

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // F-108 — cart state. Hydrated from sessionStorage on first render so
  // navigating State 1 ↔ State 2 preserves the user's progress + the
  // bundle discount preview stays current.
  const [cart, setCart] = useState<CartItem[]>(() => readCart());
  const initialBuyer = useMemo(() => cartReadBuyer(), []);
  const [email, setEmail] = useState(initialBuyer.email);
  const [name, setName] = useState(initialBuyer.name);
  // Promo code field — passed straight through to oliver-api as
  // body.coupon_code (per 43_FOUNDER_WIZARD_CATALOG_ARCHITECTURE coupon
  // precedence: founder coupon overrides auto-bundle). Use cases the user
  // cares about: FF_100 = 100% off first invoice (friends-and-family),
  // kgzALoKz = permanent 100% off (founder testing). Marketing campaigns
  // can issue any custom Stripe coupon.
  const [couponCode, setCouponCode] = useState('');
  const [showCoupon, setShowCoupon] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>(() => {
    const stored = cartReadCycle();
    return stored || params.billing;
  });
  // Persist buyer + cycle on change so the cart survives full-page navigations.
  useEffect(() => { cartWriteBuyer({ email, name }); }, [email, name]);
  useEffect(() => { cartWriteCycle(cycle); }, [cycle]);

  // ARION (existing arion-api catalog)
  const [arionPlans, setArionPlans] = useState<PlanCatalogEntry[]>([]);
  const [arionSeoAddons, setArionSeoAddons] = useState<Record<string, ArionSeoAddonEntry> | null>(null);
  const [arionPlan, setArionPlan] = useState<string>(params.plan || '');
  // F-109 — optional ARION SEO add-on selected at signup. Auth'd
  // ArionUsagePage has its own picker; this is the public mirror so new
  // tenants can buy ARION + SEO in one go instead of post-signup upsell.
  const [arionSeo, setArionSeo] = useState<'' | 'essentials' | 'growth' | 'authority'>('');

  // F-110 — waitlist modal state. STELLA/FORGE/ARGUS cards open this in
  // place of being disabled.
  const [waitlist, setWaitlist] = useState<{ key: string; name: string } | null>(null);

  // OLIVER / SPARK (unified oliver-api catalog)
  const [cat, setCat] = useState<SignupCatalog | null>(null);

  // State 1 live "From $X/mo" prices — fetched once on mount so the selector
  // grid never shows a stale or fabricated number. Per
  // feedback_no_fabricated_catalog: ALWAYS pull from catalog APIs. The
  // resulting prices are the MIN monthly across each product's catalog,
  // applied to PLATFORM_CARDS.fromUsd at render time.
  const [livePrices, setLivePrices] = useState<{ arion: number | null; oliver: number | null; spark: number | null }>({
    arion: null, oliver: null, spark: null,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [arionP, oliverP, sparkP] = await Promise.all([
        fetchPlanCatalog('arion').catch(() => []),
        fetchSignupCatalog('oliver', 'monthly').catch(() => null),
        fetchSignupCatalog('spark', 'monthly').catch(() => null),
      ]);
      if (cancelled) return;
      const arionMin = arionP
        .map((p: PlanCatalogEntry) => p.pricing?.monthly_usd ?? null)
        .filter((n: number | null): n is number => typeof n === 'number')
        .sort((a, b) => a - b)[0] ?? null;
      const oliverMin = oliverP?.plans
        ?.map((p) => p.monthly_usd)
        .filter((n): n is number => typeof n === 'number')
        .sort((a, b) => a - b)[0] ?? null;
      const sparkMin = sparkP?.volumes
        ?.map((v) => v.monthly_usd)
        .filter((n): n is number => typeof n === 'number')
        .sort((a, b) => a - b)[0] ?? null;
      setLivePrices({ arion: arionMin, oliver: oliverMin, spark: sparkMin });
    })();
    return () => { cancelled = true; };
  }, []);
  const [oliverPlan, setOliverPlan] = useState<string>(params.plan || 'standard');
  const [volume, setVolume] = useState<string>('5k');
  const [featureAddon, setFeatureAddon] = useState<'' | 'pro' | 'business'>('');
  const [leadsPkg, setLeadsPkg] = useState<'' | 'essentials' | 'growth' | 'authority'>('');
  const [leadsCount, setLeadsCount] = useState<number>(0);

  useEffect(() => {
    // Don't fetch catalogs while we're on State 1 — the selector is static.
    if (!selectedPlatform) { setLoading(false); return; }
    setLoading(true); setError(null);
    if (product === 'arion') {
      Promise.all([
        fetchPlanCatalog('arion'),
        fetchArionSeoAddons().catch(() => ({})),
      ])
        .then(([d, seo]) => {
          setArionPlans(d);
          setArionSeoAddons(seo);
          if (!d.some((x) => x.key === params.plan)) setArionPlan(d.find((x) => x.key === 'standard') ? 'standard' : (d[0]?.key || ''));
        })
        .catch((e) => setError(e.message)).finally(() => setLoading(false));
    } else {
      fetchSignupCatalog(product as 'oliver' | 'spark', cycle)
        .then((d) => {
          setCat(d);
          if (product === 'oliver') {
            const valid = d.plans?.some((p) => p.key === params.plan);
            if (!valid) setOliverPlan(d.plans?.some((p) => p.key === 'standard') ? 'standard' : (d.plans?.[0]?.key || ''));
          } else if (product === 'spark') {
            const v = d.volumes?.[0]?.volume || '5k';
            setVolume(d.volumes?.some((x) => x.volume === '5k') ? '5k' : v);
          }
        })
        .catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  }, [selectedPlatform, product, cycle, params.plan]);

  // F-108 — when entering State 2 with an existing cart row for that
  // product, hydrate the picker fields from the saved config so the user
  // sees what they previously chose. New picks overwrite on save.
  useEffect(() => {
    if (!selectedPlatform) return;
    const existing = cart.find((it) => it.product === product);
    if (!existing) return;
    if (existing.product === 'arion') {
      setArionPlan(existing.plan);
      setArionSeo((existing.seo || '') as '' | 'essentials' | 'growth' | 'authority');
    } else if (existing.product === 'oliver') {
      setOliverPlan(existing.plan);
    } else if (existing.product === 'spark') {
      setVolume(existing.volume);
      setFeatureAddon((existing.featureAddon || '') as '' | 'pro' | 'business');
      setLeadsPkg((existing.leads || '') as '' | 'essentials' | 'growth' | 'authority');
      if (existing.leadsSelected != null) setLeadsCount(existing.leadsSelected);
    }
    // Run only on platform change — manual edits to the pickers should not
    // re-trigger this and snap back to the saved values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatform]);

  // SPARK leads: snap count to >= included and step by increment
  const leadsMeta = leadsPkg && cat?.leads ? cat.leads[leadsPkg] : null;
  useEffect(() => {
    if (leadsMeta) setLeadsCount(leadsMeta.included);
    else setLeadsCount(0);
  }, [leadsPkg]); // eslint-disable-line react-hooks/exhaustive-deps

  const sparkTotal = useMemo(() => {
    // Returns the per-month total (so /mo label is always accurate). Annual
    // mode uses each row's annual_per_month_usd; monthly mode uses
    // monthly_usd. Caller multiplies by 12 to display "billed annually $Y/yr".
    if (product !== 'spark' || !cat) return 0;
    const vol = cat.volumes?.find((v) => v.volume === volume);
    let t = perMonth(vol, cycle);
    if (featureAddon) t += perMonth(cat.featureAddons?.[featureAddon] || null, cycle);
    if (leadsPkg && leadsMeta) {
      t += perMonth(leadsMeta, cycle);
      const extra = Math.max(0, leadsCount - leadsMeta.included);
      const qty = Math.ceil(extra / leadsMeta.increment);
      if (qty > 0) {
        const addonPerUnit = leadsMeta.addon_pricing
          ? perMonth({ monthly_usd: leadsMeta.addon_unit_usd, pricing: leadsMeta.addon_pricing }, cycle)
          : (leadsMeta.addon_unit_usd || 0);
        t += qty * addonPerUnit;
      }
    }
    return t;
  }, [product, cat, volume, featureAddon, leadsPkg, leadsCount, leadsMeta, cycle]);

  // F-108 — build the cart item for the currently-configured State 2 platform.
  function snapshotCurrentItem(): CartItem | null {
    if (!selectedPlatform) return null;
    if (product === 'arion') {
      return { product: 'arion', plan: arionPlan, seo: arionSeo || '' };
    }
    if (product === 'oliver') {
      return { product: 'oliver', plan: oliverPlan };
    }
    return {
      product: 'spark',
      volume,
      featureAddon: featureAddon || '',
      leads: leadsPkg || '',
      ...(leadsPkg ? { leadsSelected: leadsCount } : {}),
    };
  }

  // Save the current State 2 configuration into the cart. Re-used by both
  // "Save & pick another" and "Save & checkout".
  function saveCurrentToCart(): CartItem[] {
    const snap = snapshotCurrentItem();
    if (!snap) return cart;
    const next = cartSet(snap);
    setCart(next);
    return next;
  }

  function removeFromCart(p: CartProduct) {
    const next = cartRemove(p);
    setCart(next);
  }

  // Drop the current item into the cart and return to State 1 so the user
  // can pick another platform.
  function saveAndPickAnother() {
    saveCurrentToCart();
    backToSelector();
  }

  // Checkout from the cart. Uses the multi-product cart endpoint when the
  // cart holds 2+ items (one Stripe customer, one invoice, bundle discount
  // auto-applied). Falls back to the single-product endpoint for 1-item
  // carts so the existing flow keeps working unchanged.
  async function startCartCheckout() {
    setError(null);
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setSubmitting(true);
    try {
      // If we're still on State 2 with unsaved config, fold it into the
      // cart first so the user doesn't have to click "Save" before "Checkout".
      const baseCart = selectedPlatform ? saveCurrentToCart() : cart;

      if (baseCart.length === 0) {
        setError('Pick at least one platform to add to your plan.');
        setSubmitting(false);
        return;
      }

      // F-133 — every guest-checkout path goes through oliver-api
      // /signup/checkout-cart (single Stripe owner, single customer, single
      // invoice). createSignupCartCheckout handles 1+ items; the multi-item
      // bundle discount auto-applies server-side. Promo code from the UI
      // field is passed through as coupon_code (founder coupon overrides
      // auto-bundle per 43_FOUNDER_WIZARD_CATALOG_ARCHITECTURE.md). The
      // legacy single-product /signup/checkout was kept for OLIVER + SPARK
      // historically; now retired — every product flows through the cart.
      const trimmedCoupon = couponCode.trim() || undefined;
      const s = await createSignupCartCheckout({
        email, name: name || undefined,
        billing_cycle: cycle,
        ...(trimmedCoupon ? { coupon_code: trimmedCoupon } : {}),
        items: baseCart.map((it) => {
          if (it.product === 'arion') return { product: 'arion', plan: it.plan, seo: it.seo || null };
          if (it.product === 'oliver') return { product: 'oliver', plan: it.plan };
          return {
            product: 'spark', volume: it.volume,
            featureAddon: it.featureAddon || null,
            leads: it.leads || null,
            ...(it.leads ? { leadsSelected: it.leadsSelected } : {}),
          };
        }),
      });
      window.location.href = s.checkout_url;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // Alias kept so the existing "Continue to checkout →" button on State 2
  // still works without renaming.
  const handleContinue = startCartCheckout;

  // State 1 — platform selector. Renders when no ?platform=/?product= is set
  // (or after the user clicks "Back to All Platforms").
  if (!selectedPlatform) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-gray-900">Intelligent Analytics</a>
            <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Already have an account? Sign in</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900">Pick the platform that fits your business</h1>
            <p className="mt-3 text-lg text-gray-600">
              Start with one. Add more later — bundle 2 platforms and save 5%, or 3+ and save 7%.
            </p>
          </div>

          {params.cancelled && (
            <div className="mx-auto max-w-2xl mb-8 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 text-center">
              Checkout cancelled — nothing was charged. Pick a platform to try again.
            </div>
          )}

          {/* F-108 — cart preview banner. Shows what's queued so far +
              bundle discount + a button to head straight to checkout
              without configuring another product. */}
          <CartBanner
            cart={cart}
            email={email} name={name}
            cycle={cycle}
            submitting={submitting}
            error={error}
            onEmailChange={setEmail}
            onNameChange={setName}
            onRemove={removeFromCart}
            onCheckout={startCartCheckout}
            onEdit={(p) => gotoPlatform(p as SignupProduct)}
          />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_CARDS.map((card) => {
              const disabled = card.select.kind === 'disabled';
              const cardPlatform = card.select.kind === 'state2' ? card.select.platform : null;
              const inCart = cardPlatform != null
                && cart.some((it) => it.product === cardPlatform);
              // F-110 — coming-soon / proposal-only cards (STELLA, FORGE,
              // ARGUS) open the waitlist modal instead of being dead.
              const waitlistKeys: Record<string, string> = {
                stella: 'STELLA', forge: 'FORGE', argus: 'ARGUS',
              };
              const isWaitlist = disabled && waitlistKeys[card.key];
              const onSelect = () => {
                if (card.select.kind === 'state2') gotoPlatform(card.select.platform);
                else if (card.select.kind === 'external') window.location.href = card.select.url;
                else if (isWaitlist) setWaitlist({ key: card.key, name: waitlistKeys[card.key] });
              };
              return (
                <div
                  key={card.key}
                  className={`rounded-2xl border-2 p-6 flex flex-col bg-white transition ${
                    disabled && !isWaitlist
                      ? 'border-gray-200 opacity-60'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      aria-hidden
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ background: card.accent }}
                    >
                      {card.name[0]}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">{card.name}</div>
                      {card.status === 'coming-soon' && (
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Coming soon</div>
                      )}
                      {card.status === 'proposal-only' && (
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Proposal-based</div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 flex-1">{card.tagline}</p>
                  {(() => {
                    // Live price from State 1 catalog fetch, falls back to
                    // the static card.fromUsd (which is null for active
                    // products — they wait for the catalog). Coming-soon
                    // cards have no price and skip the block entirely.
                    const live = card.key === 'arion' ? livePrices.arion
                               : card.key === 'oliver' ? livePrices.oliver
                               : card.key === 'spark' ? livePrices.spark
                               : null;
                    const price = live ?? card.fromUsd;
                    if (price == null) {
                      // Active products that haven't loaded yet — show
                      // skeleton instead of a fake number.
                      if (card.status === 'active') {
                        return <div className="mt-4 text-sm text-gray-400">Loading price…</div>;
                      }
                      return null;
                    }
                    return (
                      <div className="mt-4 text-sm text-gray-500">
                        From <span className="text-gray-900 font-semibold">{money(price)}</span>/mo
                      </div>
                    );
                  })()}
                  <button
                    onClick={onSelect}
                    disabled={disabled && !isWaitlist}
                    className={`mt-5 rounded-lg px-4 py-2 text-sm font-semibold shadow disabled:cursor-not-allowed disabled:bg-gray-300 ${
                      inCart ? 'text-emerald-700 border-2 border-emerald-500 bg-emerald-50' :
                      isWaitlist ? 'text-white bg-slate-700 hover:bg-slate-800' :
                      'text-white'
                    }`}
                    style={(disabled && !isWaitlist) || inCart || isWaitlist ? undefined : { background: card.accent }}
                    title={disabled && !isWaitlist ? (card.select.kind === 'disabled' ? card.select.reason : '') : ''}
                  >
                    {disabled
                      ? (isWaitlist ? '🔔 Get notified at launch' : (card.select.kind === 'disabled' ? card.select.reason : 'Unavailable'))
                      : inCart ? '✓ In your plan — edit' :
                        card.select.kind === 'external' ? 'Request a quote →' : 'Add to your plan →'}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-10 text-center text-xs text-gray-500">
            Already a customer? <a href="/" className="underline">Sign in</a> to manage your plan from the portal.
          </p>
        </main>

        {/* F-110 — waitlist capture for STELLA/FORGE/ARGUS */}
        <WaitlistModal
          open={waitlist !== null}
          onClose={() => setWaitlist(null)}
          productKey={waitlist?.key || ''}
          productName={waitlist?.name || ''}
          defaultEmail={email}
          defaultName={name}
        />
      </div>
    );
  }

  // State 2 — selected platform's pricing component.
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">Intelligent Analytics</a>
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Already have an account? Sign in</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <button
          onClick={backToSelector}
          className="mb-6 text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          ← Back to all platforms
        </button>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">{copy.title}</h1>
          <p className="mt-3 text-lg text-gray-600">{copy.sub}</p>
        </div>

        {params.cancelled && (
          <div className="mx-auto max-w-2xl mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 text-center">
            Checkout cancelled — nothing was charged. Pick a plan to try again.
          </div>
        )}

        {/* F-108 — cart banner persists on State 2 too so the user sees
            their queued items + bundle discount while configuring the
            current platform. */}
        <CartBanner
          cart={cart}
          email={email} name={name}
          cycle={cycle}
          submitting={submitting}
          error={null}
          onEmailChange={setEmail}
          onNameChange={setName}
          onRemove={removeFromCart}
          onCheckout={startCartCheckout}
          onEdit={(p) => gotoPlatform(p as SignupProduct)}
          hideEmailFields
        />

        <div className="mx-auto max-w-md mb-8 grid gap-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com *"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
          {!showCoupon ? (
            <button type="button" onClick={() => setShowCoupon(true)}
              className="text-xs text-gray-500 hover:text-gray-700 self-start underline">
              Have a promo code?
            </button>
          ) : (
            <div className="flex gap-2">
              {/* 2026-06-20 — removed .toUpperCase(). Stripe coupon IDs are
                  CASE-SENSITIVE (e.g. 'kgzALoKz' is a valid auto-generated
                  Coupon ID — uppercasing it to 'KGZALOKZ' silently 404s).
                  Promotion codes are also case-sensitive at the Stripe
                  Checkout page. Let the user type whatever they were sent. */}
              <input type="text" value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Promo code"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] tracking-wide" />
              <button type="button" onClick={() => { setShowCoupon(false); setCouponCode(''); }}
                className="text-xs text-gray-500 hover:text-gray-700 px-2">
                Remove
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-full bg-gray-100 p-1">
            <button onClick={() => setCycle('monthly')} className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>Monthly</button>
            <button onClick={() => setCycle('annual')} className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>Annual <span className="text-[#EF6C33] ml-1">save 10%</span></button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading plans…</div>
        ) : product === 'arion' ? (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              {arionPlans.map((p) => {
                const perMo = cycle === 'annual' ? p.pricing.annual_per_month_usd : p.pricing.monthly_usd;
                const perYr = p.pricing.annual_per_month_usd * 12;
                return (
                  <button key={p.key} onClick={() => setArionPlan(p.key)}
                    className={`text-left rounded-xl p-6 border-2 transition ${arionPlan === p.key ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{p.name}</div>
                    <div className="mt-3 text-3xl font-bold text-gray-900">{money(perMo)}<span className="ml-1 text-sm text-gray-500">/mo</span></div>
                    {cycle === 'annual' && (
                      <div className="mt-1 text-xs text-gray-500">billed annually {money(perYr)}/yr</div>
                    )}
                    <p className="mt-3 text-sm text-gray-600">{p.description}</p>
                    <ul className="mt-4 space-y-2 text-xs text-gray-700">{p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#EF6C33]">✓</span><span>{f}</span></li>)}</ul>
                  </button>
                );
              })}
            </div>

            {/* F-109 — ARION SEO add-on selector. Optional; default "Skip".
                Auth'd ArionUsagePage has the full SEO catalog; here we just
                surface the 3 main tiers so the buyer can bundle at signup
                instead of being redirected to upsell after sign-in. */}
            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">SEO add-on (optional)</div>
                  <p className="text-xs text-gray-500 mt-0.5">Keyword tracking, site-audit, competitor monitoring + AI search visibility. Layered on top of the website plan above.</p>
                </div>
                {arionSeo && (
                  <button type="button" onClick={() => setArionSeo('')} className="text-xs text-gray-500 hover:text-gray-700 underline">Remove</button>
                )}
              </div>
              {/* SEO add-on cards. Prices come from oliver-api /signup/catalog?product=arion
                  via arion-api proxy — see lib/signupPricing.js arionSeoPriceByTier()
                  resolving Stripe products matching /^arion seo\b/ + tier. Keyword
                  counts pulled from arion-api/lib/seoOnboardingsig.js TIER_CONFIG via
                  the canonical pricing matrix (50_PRICING_TIER_MATRIX_CANONICAL.md §1B):
                  Starter = 10 / Essentials = 25 / Growth = 60 / Authority = 150. */}
              {(() => {
                const SEO_BLURBS: Record<string, string> = {
                  starter: '10 keywords · site audit · monthly report',
                  essentials: '25 keywords · competitors · monthly report',
                  growth: '60 keywords · Google AI Mode · weekly digest',
                  authority: '150 keywords · all AI engines · daily digest',
                };
                const SEO_LABELS: Record<string, string> = {
                  starter: 'Starter', essentials: 'Essentials', growth: 'Growth', authority: 'Authority',
                };
                const seoCat = arionSeoAddons;
                const tiers = seoCat && Object.keys(seoCat).length > 0
                  ? Object.keys(seoCat)
                  : ['starter', 'essentials', 'growth', 'authority'];
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {tiers.map((key) => {
                        const row = seoCat?.[key] || null;
                        const perMo = row ? (cycle === 'annual'
                          ? (row.pricing.annual_per_month_usd ?? row.pricing.monthly_usd ?? 0)
                          : (row.pricing.monthly_usd ?? 0)) : 0;
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!row || perMo === 0}
                            onClick={() => setArionSeo(key as 'essentials' | 'growth' | 'authority')}
                            className={`text-left rounded-lg border-2 p-3 transition ${
                              arionSeo === key ? 'border-[#38BDF8] bg-sky-50' : 'border-gray-200 bg-white hover:border-gray-300'
                            } ${!row || perMo === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-baseline justify-between">
                              <div className="text-sm font-bold text-gray-900">{SEO_LABELS[key] || key}</div>
                              <div className="text-xs text-gray-500">{row && perMo > 0 ? `${money(perMo)}/mo` : '—'}</div>
                            </div>
                            <p className="mt-1 text-[11px] text-gray-600 leading-snug">{SEO_BLURBS[key] || ''}</p>
                          </button>
                        );
                      })}
                    </div>
                    {!seoCat && (
                      <p className="mt-3 text-[11px] text-amber-600">
                        SEO add-on prices loading from catalog…
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        ) : product === 'oliver' ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {(cat?.plans || []).map((p) => {
              const perMo = perMonth(p, cycle);
              const perYr = perYear(p, cycle);
              return (
                <button key={p.key} onClick={() => setOliverPlan(p.key)}
                  className={`text-left rounded-xl p-6 border-2 transition ${oliverPlan === p.key ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{p.name}</div>
                  <div className="mt-3 text-3xl font-bold text-gray-900">{money(perMo)}<span className="ml-1 text-sm text-gray-500">/mo</span></div>
                  {cycle === 'annual' && (
                    <div className="mt-1 text-xs text-gray-500">billed annually {money(perYr)}/yr</div>
                  )}
                  <p className="mt-3 text-sm text-gray-600">{p.description}</p>
                  <ul className="mt-4 space-y-2 text-xs text-gray-700">{p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#EF6C33]">✓</span><span>{f}</span></li>)}</ul>
                </button>
              );
            })}
            {(cat?.plans || []).length === 0 && <div className="col-span-4 text-center text-amber-600 text-sm">No plans available — Stripe prices not configured.</div>}
          </div>
        ) : (
          // SPARK — F-135: volume slider (auto-selects the matching Standard
          // tier price) + Standard/Pro/Business upgrade cards + lead generation.
          // Slider is index-based (volumes are non-uniform: 5/10/15/25/50/
          // 100/150/250/500 thousand emails) — the position picks the volume
          // and the price updates live.
          (() => {
            const volumes = cat?.volumes || [];
            const volIndex = Math.max(0, volumes.findIndex((v) => v.volume === volume));
            const currentVol = volumes[volIndex] || volumes[0];
            const addonMeta = (k: 'pro' | 'business') => cat?.featureAddons?.[k] || null;
            const proAddon = addonMeta('pro');
            const bizAddon = addonMeta('business');
            return (
              <div className="mx-auto max-w-3xl space-y-6">
                {/* Volume slider */}
                <div className="rounded-xl bg-white border border-gray-200 p-6">
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">Email volume per month</label>
                    <span className="text-xs text-gray-500">{volumes.length > 0 ? `${volumes[0].volume} – ${volumes[volumes.length - 1].volume}` : ''}</span>
                  </div>
                  {volumes.length === 0 ? (
                    <p className="text-sm text-amber-600">No SPARK volumes available — Stripe prices not configured.</p>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-3 mb-3">
                        <span className="text-4xl font-bold text-gray-900">{currentVol?.volume}</span>
                        <span className="text-base text-gray-500">emails/mo</span>
                        <span className="ml-auto text-2xl font-bold text-[#EF6C33]">{money(perMonth(currentVol, cycle))}<span className="text-sm font-normal text-gray-500">/mo</span></span>
                      </div>
                      {cycle === 'annual' && currentVol && (
                        <div className="-mt-2 mb-3 text-xs text-gray-500 text-right">billed annually {money(perYear(currentVol, cycle))}/yr</div>
                      )}
                      <input
                        type="range"
                        min={0}
                        max={volumes.length - 1}
                        step={1}
                        value={volIndex}
                        onChange={(e) => setVolume(volumes[Number(e.target.value)].volume)}
                        className="w-full accent-[#EF6C33]"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                        {volumes.map((v) => (
                          <span key={v.volume} className={v.volume === volume ? 'font-bold text-[#EF6C33]' : ''}>{v.volume}</span>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-gray-500">
                        Includes the full SPARK CRM (contacts, email + SMS campaigns, forms, automations).
                        Adjustable anytime in Settings post-signup.
                      </p>
                    </>
                  )}
                </div>

                {/* Feature tier upgrade cards */}
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Upgrade for more features (optional)</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Standard (included) */}
                    {/* Standard card — pull features from catalog 5k volume row.
                        Falls back to canonical bullet list if catalog omits them. */}
                    <button
                      type="button"
                      onClick={() => setFeatureAddon('')}
                      className={`text-left rounded-xl p-4 border-2 transition ${featureAddon === '' ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Standard</div>
                      <div className="mt-1 text-base font-bold text-gray-900">Included</div>
                      <ul className="mt-3 space-y-1.5 text-[11px] text-gray-700">
                        {((cat?.volumes?.find((v) => v.volume === '5k')?.features) || ['Full CRM + contacts', 'Email + SMS campaigns', 'Forms + UTM tracking', 'ARION form → SPARK auto-flow']).map((f) => (
                          <li key={f} className="flex gap-1.5"><span className="text-[#EF6C33]">✓</span>{f}</li>
                        ))}
                      </ul>
                    </button>
                    {/* Pro — price + features both from catalog */}
                    <button
                      type="button"
                      disabled={!proAddon}
                      onClick={() => setFeatureAddon('pro')}
                      className={`text-left rounded-xl p-4 border-2 transition ${featureAddon === 'pro' ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'} ${!proAddon ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Pro</div>
                      <div className="mt-1 text-base font-bold text-gray-900">+{money(perMonth(proAddon, cycle))}<span className="text-xs font-normal text-gray-500">/mo</span></div>
                      {cycle === 'annual' && proAddon && (
                        <div className="text-[10px] text-gray-500">+{money(perYear(proAddon, cycle))}/yr</div>
                      )}
                      <ul className="mt-3 space-y-1.5 text-[11px] text-gray-700">
                        {(proAddon?.features || ['Sales Pipeline + Deals', 'Newsletter Studio + WP publish', 'Social scheduler', 'Landing pages, NPS, referrals']).map((f) => (
                          <li key={f} className="flex gap-1.5"><span className="text-[#EF6C33]">✓</span>{f}</li>
                        ))}
                      </ul>
                    </button>
                    {/* Business — price + features both from catalog */}
                    <button
                      type="button"
                      disabled={!bizAddon}
                      onClick={() => setFeatureAddon('business')}
                      className={`text-left rounded-xl p-4 border-2 transition ${featureAddon === 'business' ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'} ${!bizAddon ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Business</div>
                      <div className="mt-1 text-base font-bold text-gray-900">+{money(perMonth(bizAddon, cycle))}<span className="text-xs font-normal text-gray-500">/mo</span></div>
                      {cycle === 'annual' && bizAddon && (
                        <div className="text-[10px] text-gray-500">+{money(perYear(bizAddon, cycle))}/yr</div>
                      )}
                      <ul className="mt-3 space-y-1.5 text-[11px] text-gray-700">
                        {(bizAddon?.features || ['Everything in Pro', 'AI Writer (full)', 'OLIVER-cross segments', 'Revenue attribution + B2B']).map((f) => (
                          <li key={f} className="flex gap-1.5"><span className="text-[#EF6C33]">✓</span>{f}</li>
                        ))}
                      </ul>
                    </button>
                  </div>
                </div>

                {/* Lead Generation — optional separate add-on */}
                <div className="rounded-xl bg-white border border-gray-200 p-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Lead Generation (optional)</label>
                  <select value={leadsPkg} onChange={(e) => setLeadsPkg(e.target.value as '' | 'essentials' | 'growth' | 'authority')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="">No lead generation</option>
                    {Object.entries(cat?.leads || {}).map(([k, v]) => <option key={k} value={k}>{v.name} — {money(perMonth(v, cycle))}/mo (incl. {v.included} leads)</option>)}
                  </select>
                  {leadsMeta && (() => {
                    const addonPerUnit = leadsMeta.addon_pricing
                      ? perMonth({ monthly_usd: leadsMeta.addon_unit_usd, pricing: leadsMeta.addon_pricing }, cycle)
                      : leadsMeta.addon_unit_usd;
                    return (
                      <div className="mt-3">
                        <label className="block text-xs text-gray-600 mb-1">Leads per month: <strong>{leadsCount}</strong> (includes {leadsMeta.included}; extra billed per {leadsMeta.increment} at {addonPerUnit != null ? money(addonPerUnit) : '—'}/mo)</label>
                        <input type="range" min={leadsMeta.included} max={leadsMeta.included + leadsMeta.increment * 40} step={leadsMeta.increment}
                          value={leadsCount} onChange={(e) => setLeadsCount(Number(e.target.value))} className="w-full accent-[#EF6C33]" />
                      </div>
                    );
                  })()}
                </div>

                {/* Total — sparkTotal is the per-month equivalent; multiply by
                    12 in annual mode to show the actual yearly invoice amount.
                    Brandon's locked rule: /mo number is the comparison number;
                    the secondary line shows what they actually pay annually. */}
                <div className="rounded-xl bg-[#0B1C24] text-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">{cycle === 'annual' ? 'Estimated /mo (billed annually)' : 'Estimated monthly'}</span>
                    <span className="text-2xl font-bold">{money(sparkTotal)}<span className="text-sm font-normal text-white/60">/mo</span></span>
                  </div>
                  {cycle === 'annual' && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-white/50">Annual invoice</span>
                      <span className="text-sm font-semibold text-white/80">{money(sparkTotal * 12)}<span className="text-xs font-normal text-white/50">/yr</span></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {/* F-108 — two-button checkout: save the current config to the
              cart and either pick another platform (bundle discount) or
              go straight to Stripe. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={saveAndPickAnother}
              className="rounded-lg border-2 border-[#EF6C33] bg-white px-6 py-3 text-sm font-semibold text-[#EF6C33] hover:bg-[#FFF7F2]"
            >
              ＋ Add another platform
            </button>
            <button disabled={submitting || !email} onClick={handleContinue}
              className="rounded-lg bg-[#EF6C33] px-8 py-3 text-base font-semibold text-white shadow disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d75a25]">
              {submitting ? 'Redirecting to checkout…' : (
                cart.length > 0
                  ? `Continue to checkout (${cart.some((c) => c.product === product) ? cart.length : cart.length + 1} items) →`
                  : 'Continue to checkout →'
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500">Secure checkout via Stripe. You'll set up your account right after payment.</p>
        </div>
      </main>
    </div>
  );
}

// ── CartBanner (F-108) ────────────────────────────────────────────────

/**
 * Multi-product cart preview. Shown on both State 1 and State 2 above the
 * fold whenever the cart has at least one item. Lists each item with a
 * remove × button + edit link, shows the bundle discount when it would
 * apply, and offers a "Checkout (N items)" button that routes through
 * /signup/checkout-cart (or the legacy single-product /signup/checkout
 * when the cart only has one row).
 *
 * Buyer fields (email + name) live here too — entered ONCE rather than
 * once per platform — and are persisted to sessionStorage so they
 * survive page refreshes during configuration.
 */
function CartBanner({
  cart, email, name, cycle, submitting, error,
  onEmailChange, onNameChange, onRemove, onCheckout, onEdit,
  hideEmailFields,
}: {
  cart: CartItem[];
  email: string;
  name: string;
  cycle: BillingCycle;
  submitting: boolean;
  error: string | null;
  onEmailChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onRemove: (p: CartProduct) => void;
  onCheckout: () => void;
  onEdit: (p: string) => void;
  hideEmailFields?: boolean;
}) {
  if (cart.length === 0) return null;
  const bundle = bundleDiscountPercent(cart);
  const labelFor = (it: CartItem): string => {
    if (it.product === 'oliver') return `OLIVER ${it.plan.charAt(0).toUpperCase()}${it.plan.slice(1)}`;
    if (it.product === 'arion')  return `ARION ${it.plan.charAt(0).toUpperCase()}${it.plan.slice(1)}${it.seo ? ` + SEO ${it.seo}` : ''}`;
    const fa = it.featureAddon ? ` + ${it.featureAddon}` : '';
    const lg = it.leads ? ` + Leads ${it.leads}` : '';
    return `SPARK ${it.volume}${fa}${lg}`;
  };
  const accentFor: Record<string, string> = { oliver: '#FEC82C', spark: '#EF6C33', arion: '#38BDF8' };
  return (
    <div className="mx-auto max-w-3xl mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gradient-to-r from-[#0B1C24] to-[#1a3540] px-5 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">Your plan</div>
            <div className="text-sm font-semibold">
              {cart.length} platform{cart.length === 1 ? '' : 's'} queued
              {bundle > 0 && (
                <span className="ml-2 inline-block rounded-full bg-emerald-500/20 text-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                  Bundle −{bundle}%
                </span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-white/60">{cycle === 'annual' ? 'Annual billing' : 'Monthly billing'}</div>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {cart.map((it) => (
          <li key={it.product} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: accentFor[it.product] }} />
              <div className="text-sm font-medium text-gray-900 truncate">{labelFor(it)}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => onEdit(it.product)}
                className="text-[11px] text-gray-500 hover:text-gray-700 underline"
              >Edit</button>
              <button
                type="button"
                onClick={() => onRemove(it.product as CartProduct)}
                className="text-[11px] text-rose-600 hover:text-rose-700"
                aria-label={`Remove ${it.product} from your plan`}
              >Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {!hideEmailFields && (
        <div className="px-5 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text" value={name} onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
          />
          <input
            type="email" value={email} onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@yourbusiness.com *"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
          />
        </div>
      )}
      {error && <div className="px-5 py-2 text-sm text-red-600">{error}</div>}
      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          {bundle > 0
            ? `Bundle discount auto-applies at checkout — ${bundle}% off every recurring invoice for as long as you keep ${cart.length} platforms.`
            : 'Add a second platform to unlock 5% off, or a third for 7% off.'}
        </p>
        <button
          type="button"
          disabled={submitting || !email}
          onClick={onCheckout}
          className="rounded-lg bg-[#EF6C33] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#d75a25] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {submitting ? 'Redirecting…' : `Checkout (${cart.length} item${cart.length === 1 ? '' : 's'}) →`}
        </button>
      </div>
    </div>
  );
}

export default SignupPage;
