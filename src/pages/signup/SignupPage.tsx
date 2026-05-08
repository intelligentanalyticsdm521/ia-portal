/**
 * SignupPage — public, unauthenticated.
 *
 * The first thing a prospective client sees. Three logical sections:
 *
 *   1. Email capture (required for Stripe + tenant identity)
 *   2. Billing-cycle toggle (Monthly / Annual — annual saves 10%)
 *   3. Plan picker (Starter / Essentials / Growth / Authority cards)
 *
 * Submit posts to /onboarding/checkout/create-session and redirects to
 * Stripe Checkout. After payment, Stripe redirects back to /signup/onboarding
 * which picks up via session_id query param.
 *
 * Design notes:
 *   - The domain step is intentionally NOT here — it lives in OnboardingFlow
 *     after Stripe success. This keeps SignupPage one decision, one click.
 *   - We don't pre-collect domain because (a) the flow is shorter, and
 *     (b) avoiding domain choice before payment reduces drop-off.
 */

import { useEffect, useState } from 'react';
import { fetchPlanCatalog, createCheckoutSession, type PlanCatalogEntry, type BillingCycle } from '../../lib/onboardingApi';

export function SignupPage() {
  const [plans, setPlans] = useState<PlanCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [selectedPlan, setSelectedPlan] = useState<PlanCatalogEntry['key']>('growth');

  useEffect(() => {
    fetchPlanCatalog()
      .then((data) => setPlans(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleContinue() {
    setError(null);
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const session = await createCheckoutSession({
        email,
        name: name || undefined,
        plan: selectedPlan,
        billing_cycle: cycle,
        // Domain decision is deferred until after Stripe success.
        // We send a "byod" placeholder so the API doesn't reject the request;
        // the real domain step happens in OnboardingFlow.
        domain: { mode: 'byod' },
      });
      window.location.href = session.checkout_url;
    } catch (err) {
      setError((err as Error).message);
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
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900">Get your AI-built website live in minutes</h1>
          <p className="mt-3 text-lg text-gray-600">Pick a plan. Pay. Answer a few questions. We'll handle everything else.</p>
        </div>

        {/* Email */}
        <div className="mx-auto max-w-md mb-10 grid gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com *"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
          />
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-full bg-gray-100 p-1">
            <button
              onClick={() => setCycle('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle('annual')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
            >
              Annual <span className="text-[#EF6C33] ml-1">save 10%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading plans…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-4">
            {plans.map((plan) => {
              const isSelected = selectedPlan === plan.key;
              const price = cycle === 'annual' ? plan.pricing.annual_per_month_usd : plan.pricing.monthly_usd;
              return (
                <button
                  key={plan.key}
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`text-left rounded-xl p-6 border-2 transition ${isSelected ? 'border-[#EF6C33] bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{plan.name}</div>
                  <div className="mt-3 flex items-baseline">
                    <span className="text-3xl font-bold text-gray-900">${price.toFixed(0)}</span>
                    <span className="ml-1 text-sm text-gray-500">/ mo</span>
                  </div>
                  {cycle === 'annual' && (
                    <div className="text-xs text-gray-500">billed annually (${plan.pricing.annual_usd.toFixed(0)}/yr)</div>
                  )}
                  <p className="mt-3 text-sm text-gray-600">{plan.description}</p>
                  <ul className="mt-4 space-y-2 text-xs text-gray-700">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-[#EF6C33]">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}

        {/* Free first year on annual notice */}
        {cycle === 'annual' && (
          <div className="mx-auto max-w-2xl mt-8 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-900 text-center">
            <strong>Annual plan bonus:</strong> Your first year of domain registration is on us when you choose to buy a new domain.
          </div>
        )}

        {/* Continue button */}
        <div className="mt-10 flex flex-col items-center gap-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            disabled={submitting || !email}
            onClick={handleContinue}
            className="rounded-lg bg-[#EF6C33] px-8 py-3 text-base font-semibold text-white shadow disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d75a25]"
          >
            {submitting ? 'Redirecting to checkout…' : 'Continue to checkout →'}
          </button>
          <p className="text-xs text-gray-500">You'll pick your domain on the next step.</p>
        </div>
      </main>
    </div>
  );
}
