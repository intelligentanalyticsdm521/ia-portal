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
  fetchPlanCatalog, createCheckoutSession,
  type PlanCatalogEntry, type BillingCycle, type SignupProduct,
} from '../../lib/onboardingApi';
import {
  fetchSignupCatalog, createSignupCheckout, type SignupCatalog,
} from '../../lib/signupCheckout';

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

const PLATFORM_CARDS: PlatformCardSpec[] = [
  {
    key: 'arion',
    name: 'ARION',
    tagline: 'AI-built websites + SEO automation. Done in minutes.',
    fromUsd: 29,
    accent: '#EF6C33',
    status: 'active',
    select: { kind: 'state2', platform: 'arion' },
  },
  {
    key: 'spark',
    name: 'SPARK',
    tagline: 'CRM, email marketing, and lead capture in one workspace.',
    fromUsd: 19,
    accent: '#F4B400',
    status: 'active',
    select: { kind: 'state2', platform: 'spark' },
  },
  {
    key: 'oliver',
    name: 'OLIVER',
    tagline: 'Field-service operations: jobs, scheduling, invoicing.',
    // LOCKED 2026-05-26 — Lite respec from $39.99 to $19.99 (invoicing + jobs only)
    fromUsd: 19.99,
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

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>(params.billing);

  // ARION (existing arion-api catalog)
  const [arionPlans, setArionPlans] = useState<PlanCatalogEntry[]>([]);
  const [arionPlan, setArionPlan] = useState<string>(params.plan || '');

  // OLIVER / SPARK (unified oliver-api catalog)
  const [cat, setCat] = useState<SignupCatalog | null>(null);
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
      fetchPlanCatalog('arion')
        .then((d) => { setArionPlans(d); if (!d.some((x) => x.key === params.plan)) setArionPlan(d.find((x) => x.key === 'growth') ? 'growth' : (d[0]?.key || '')); })
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

  // SPARK leads: snap count to >= included and step by increment
  const leadsMeta = leadsPkg && cat?.leads ? cat.leads[leadsPkg] : null;
  useEffect(() => {
    if (leadsMeta) setLeadsCount(leadsMeta.included);
    else setLeadsCount(0);
  }, [leadsPkg]); // eslint-disable-line react-hooks/exhaustive-deps

  const sparkTotal = useMemo(() => {
    if (product !== 'spark' || !cat) return 0;
    let t = cat.volumes?.find((v) => v.volume === volume)?.monthly_usd || 0;
    if (featureAddon) t += cat.featureAddons?.[featureAddon]?.monthly_usd || 0;
    if (leadsPkg && leadsMeta) {
      t += leadsMeta.monthly_usd;
      const extra = Math.max(0, leadsCount - leadsMeta.included);
      const qty = Math.ceil(extra / leadsMeta.increment);
      if (qty > 0 && leadsMeta.addon_unit_usd) t += qty * leadsMeta.addon_unit_usd;
    }
    return t;
  }, [product, cat, volume, featureAddon, leadsPkg, leadsCount, leadsMeta]);

  async function handleContinue() {
    setError(null);
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setSubmitting(true);
    try {
      if (product === 'arion') {
        const s = await createCheckoutSession({ email, name: name || undefined, plan: arionPlan, billing_cycle: cycle, domain: { mode: 'byod' } });
        window.location.href = s.checkout_url;
        return;
      }
      const s = await createSignupCheckout({
        product: product as 'oliver' | 'spark',
        email, name: name || undefined, billing_cycle: cycle,
        ...(product === 'oliver'
          ? { plan: oliverPlan }
          : { volume, featureAddon: featureAddon || null, leads: leadsPkg || null, leadsSelected: leadsPkg ? leadsCount : undefined }),
      });
      window.location.href = s.checkout_url;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

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

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_CARDS.map((card) => {
              const disabled = card.select.kind === 'disabled';
              const onSelect = () => {
                if (card.select.kind === 'state2') gotoPlatform(card.select.platform);
                else if (card.select.kind === 'external') window.location.href = card.select.url;
              };
              return (
                <div
                  key={card.key}
                  className={`rounded-2xl border-2 p-6 flex flex-col bg-white transition ${
                    disabled
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
                  {card.fromUsd != null && (
                    <div className="mt-4 text-sm text-gray-500">
                      From <span className="text-gray-900 font-semibold">{money(card.fromUsd)}</span>/mo
                    </div>
                  )}
                  <button
                    onClick={onSelect}
                    disabled={disabled}
                    className="mt-5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-gray-300"
                    style={disabled ? undefined : { background: card.accent }}
                    title={disabled ? card.select.kind === 'disabled' ? card.select.reason : '' : ''}
                  >
                    {disabled ? card.select.kind === 'disabled' ? card.select.reason : 'Unavailable' :
                      card.select.kind === 'external' ? 'Request a quote →' : 'Select →'}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-10 text-center text-xs text-gray-500">
            Already a customer? <a href="/" className="underline">Sign in</a> to manage your plan from the portal.
          </p>
        </main>
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

        <div className="mx-auto max-w-md mb-8 grid gap-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com *"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
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
          <div className="grid gap-4 lg:grid-cols-4">
            {arionPlans.map((p) => (
              <button key={p.key} onClick={() => setArionPlan(p.key)}
                className={`text-left rounded-xl p-6 border-2 transition ${arionPlan === p.key ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{p.name}</div>
                <div className="mt-3 text-3xl font-bold text-gray-900">${cycle === 'annual' ? p.pricing.annual_per_month_usd.toFixed(0) : p.pricing.monthly_usd.toFixed(0)}<span className="ml-1 text-sm text-gray-500">/mo</span></div>
                <p className="mt-3 text-sm text-gray-600">{p.description}</p>
                <ul className="mt-4 space-y-2 text-xs text-gray-700">{p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#EF6C33]">✓</span><span>{f}</span></li>)}</ul>
              </button>
            ))}
          </div>
        ) : product === 'oliver' ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {(cat?.plans || []).map((p) => (
              <button key={p.key} onClick={() => setOliverPlan(p.key)}
                className={`text-left rounded-xl p-6 border-2 transition ${oliverPlan === p.key ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{p.name}</div>
                <div className="mt-3 text-3xl font-bold text-gray-900">{money(p.monthly_usd)}<span className="ml-1 text-sm text-gray-500">/mo</span></div>
                <p className="mt-3 text-sm text-gray-600">{p.description}</p>
                <ul className="mt-4 space-y-2 text-xs text-gray-700">{p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#EF6C33]">✓</span><span>{f}</span></li>)}</ul>
              </button>
            ))}
            {(cat?.plans || []).length === 0 && <div className="col-span-4 text-center text-amber-600 text-sm">No plans available — Stripe prices not configured.</div>}
          </div>
        ) : (
          // SPARK — volume + optional feature add-on + optional leads package
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email volume / contacts</label>
              <select value={volume} onChange={(e) => setVolume(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {(cat?.volumes || []).map((v) => <option key={v.volume} value={v.volume}>{v.name} — {money(v.monthly_usd)}/mo</option>)}
              </select>
              {(cat?.volumes || []).length === 0 && <p className="text-xs text-amber-600 mt-1">No SPARK volumes available — Stripe prices not configured.</p>}
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Feature tier add-on (optional)</label>
              <select value={featureAddon} onChange={(e) => setFeatureAddon(e.target.value as '' | 'pro' | 'business')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Standard (included)</option>
                {Object.entries(cat?.featureAddons || {}).map(([k, v]) => <option key={k} value={k}>{v.name} — +{money(v.monthly_usd)}/mo</option>)}
              </select>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lead Generation (optional)</label>
              <select value={leadsPkg} onChange={(e) => setLeadsPkg(e.target.value as '' | 'essentials' | 'growth' | 'authority')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">No lead generation</option>
                {Object.entries(cat?.leads || {}).map(([k, v]) => <option key={k} value={k}>{v.name} — {money(v.monthly_usd)}/mo (incl. {v.included} leads)</option>)}
              </select>
              {leadsMeta && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-600 mb-1">Leads per month: <strong>{leadsCount}</strong> (includes {leadsMeta.included}; extra billed per {leadsMeta.increment} at {leadsMeta.addon_unit_usd != null ? money(leadsMeta.addon_unit_usd) : '—'})</label>
                  <input type="range" min={leadsMeta.included} max={leadsMeta.included + leadsMeta.increment * 40} step={leadsMeta.increment}
                    value={leadsCount} onChange={(e) => setLeadsCount(Number(e.target.value))} className="w-full" />
                </div>
              )}
            </div>

            <div className="rounded-xl bg-[#0B1C24] text-white p-5 flex items-center justify-between">
              <span className="text-sm text-white/70">Estimated {cycle}</span>
              <span className="text-2xl font-bold">{money(sparkTotal)}<span className="text-sm font-normal text-white/60">/mo</span></span>
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button disabled={submitting || !email} onClick={handleContinue}
            className="rounded-lg bg-[#EF6C33] px-8 py-3 text-base font-semibold text-white shadow disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d75a25]">
            {submitting ? 'Redirecting to checkout…' : 'Continue to checkout →'}
          </button>
          <p className="text-xs text-gray-500">Secure checkout via Stripe. You'll set up your account right after payment.</p>
        </div>
      </main>
    </div>
  );
}

export default SignupPage;
