/**
 * SignupPage — public, unauthenticated self-serve checkout.
 *
 * One page, every product. OLIVER + SPARK go through the unified oliver-api
 * /signup endpoint (the single Stripe account that holds all products'
 * prices). ARION keeps its existing arion-api onboarding path (website build).
 * Nothing server-side fires until Stripe checkout completes.
 *
 *   ?product=oliver|spark|arion & ?plan= & ?billing=monthly|annual
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

function readParams(): { product: SignupProduct; plan: string | null; billing: BillingCycle; cancelled: boolean } {
  const q = new URLSearchParams(window.location.search);
  const p = (q.get('product') || 'oliver').toLowerCase();
  const product: SignupProduct = (p === 'oliver' || p === 'spark' || p === 'arion') ? p : 'oliver';
  const billing = q.get('billing') === 'annual' ? 'annual' : 'monthly';
  return { product, plan: q.get('plan'), billing, cancelled: q.get('cancelled') === '1' };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SignupPage() {
  const params = useMemo(readParams, []);
  const product = params.product;
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
  }, [product, cycle, params.plan]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">Intelligent Analytics</a>
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Already have an account? Sign in</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
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
