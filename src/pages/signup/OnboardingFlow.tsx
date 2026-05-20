/**
 * OnboardingFlow — public, post-Stripe-checkout wizard for NEW customers.
 *
 * Pairs with /onboarding/submit on the backend (session_id auth).
 * For existing customers adding a 2nd site, see AddSiteFlow at /app/sites/new.
 *
 * Routes:
 *   /pricing/onboarding?session_id=cs_test_... (was /signup/onboarding pre-2026-05-20)
 *
 * The actual form steps are shared via components/onboardingWizard.tsx.
 * This page handles only:
 *   - Reading session_id from URL
 *   - Hydrating from /onboarding/session-info
 *   - localStorage persistence keyed by session_id
 *   - Submit → POST /onboarding/submit, redirect to /pricing/status
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchSessionInfo, type SignupSessionInfo } from '../../lib/onboardingApi';
import { fetchSignupSession, createSignupComplete } from '../../lib/signupCheckout';
import {
  StepIndicator,
  DomainStep,
  QuestionnaireStep,
  BrandingStep,
  CenteredMessage,
  DEFAULT_ANSWERS,
  type WizardStep,
  type QuestionnaireAnswers,
  type DomainSelection,
  type WhoisContact,
} from '../../components/onboardingWizard';

const API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

// Legacy ARION website-build wizard (domain/questionnaire/branding) —
// unchanged. Reached only when the session is NOT an OLIVER/SPARK signup.
function ArionOnboardingFlow() {
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('session_id') || '', []);

  const [step, setStep] = useState<WizardStep>('domain');
  const [domain, setDomain] = useState<DomainSelection | null>(null);
  const [whois, setWhois] = useState<WhoisContact | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SignupSessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(DEFAULT_ANSWERS);

  // Hydrate from server session-info — Stripe webhooks can take a few sec
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let attempt = 0;
    async function load() {
      while (!cancelled && attempt < 5) {
        try {
          const info = await fetchSessionInfo(sessionId);
          if (!cancelled) {
            setSessionInfo(info);
            if (info.saved_questionnaire) {
              setAnswers((a) => ({ ...a, ...(info.saved_questionnaire as Partial<QuestionnaireAnswers>) }));
            } else if (info.shared_profile) {
              // No resumed progress — prefill canonical fields from the
              // SHARED platform profile so the customer reviews instead of
              // re-typing. Only fill fields the user hasn't already set.
              const sp = info.shared_profile;
              setAnswers((a) => ({
                ...a,
                businessName: a.businessName || sp.businessName || a.businessName,
                primaryColor:
                  a.primaryColor && a.primaryColor !== DEFAULT_ANSWERS.primaryColor
                    ? a.primaryColor
                    : sp.primaryColor || a.primaryColor,
              }));
            }
            if (info.saved_domain) {
              setDomain(info.saved_domain as DomainSelection);
            }
            if (info.already_submitted) {
              window.location.href = `/pricing/status?session_id=${encodeURIComponent(sessionId)}`;
              return;
            }
          }
          return;
        } catch (err) {
          attempt += 1;
          if (attempt >= 5) {
            if (!cancelled) setSessionError((err as Error).message);
            return;
          }
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  // localStorage progress fallback
  useEffect(() => {
    const saved = localStorage.getItem(`iadm_onboarding_${sessionId}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.domain && !domain) setDomain(data.domain);
        if (data.answers) setAnswers((a) => ({ ...a, ...data.answers }));
        if (data.step) setStep(data.step);
        if (data.whois && !whois) setWhois(data.whois);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Persist on every change
  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem(
      `iadm_onboarding_${sessionId}`,
      JSON.stringify({ domain, answers, step, whois })
    );
  }, [domain, answers, step, whois, sessionId]);

  if (!sessionId) {
    return <CenteredMessage title="Session not found" body="We couldn't find your signup session. Please start signup again." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-xl font-bold text-gray-900">Intelligent Analytics</span>
            {sessionInfo && (
              <span className="ml-3 inline-flex items-center rounded-full bg-[#EF6C33]/10 px-3 py-1 text-xs font-medium text-[#EF6C33]">
                {sessionInfo.plan.name} · {sessionInfo.billing_cycle}
              </span>
            )}
          </div>
          <StepIndicator current={step} />
        </div>
        {sessionError && (
          <div className="mx-auto max-w-3xl px-6 py-2 text-xs text-red-600">{sessionError}</div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {step === 'domain' && (
          <DomainStep
            value={domain}
            whois={whois}
            onWhoisChange={setWhois}
            onChange={setDomain}
            onContinue={() => setStep('questionnaire')}
          />
        )}
        {step === 'questionnaire' && (
          <QuestionnaireStep
            value={answers}
            onChange={setAnswers}
            onBack={() => setStep('domain')}
            onContinue={() => setStep('branding')}
          />
        )}
        {step === 'branding' && (
          <BrandingStep
            value={answers}
            onChange={setAnswers}
            onBack={() => setStep('questionnaire')}
            onSubmit={async () => {
              setStep('submitting');
              try {
                await fetch(`${API_BASE}/onboarding/submit`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_id: sessionId, domain, answers, whois }),
                });
                window.location.href = `/pricing/status?session_id=${encodeURIComponent(sessionId)}`;
              } catch (err) {
                alert('Submit failed: ' + (err as Error).message);
                setStep('branding');
              }
            }}
          />
        )}
        {step === 'submitting' && (
          <CenteredMessage title="Saving your answers…" body="One moment." />
        )}
      </main>
    </div>
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────
// OLIVER/SPARK self-serve = simple post-payment flow (the single Stripe
// account / oliver-api). ARION self-serve = the legacy website wizard above.
export function OnboardingFlow() {
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('session_id') || '', []);
  const [kind, setKind] = useState<'loading' | 'product' | 'arion'>('loading');
  const [sess, setSess] = useState<{ email: string; product: string; plan: string } | null>(null);

  useEffect(() => {
    if (!sessionId) { setKind('arion'); return; }
    let cancelled = false;
    let tries = 0;
    (async function poll() {
      while (!cancelled && tries < 8) {
        try {
          const s = await fetchSignupSession(sessionId);
          if ('product' in s && (s.product === 'oliver' || s.product === 'spark')) {
            if (!cancelled) { setSess({ email: s.email, product: s.product, plan: s.plan }); setKind('product'); }
            return;
          }
          if ('status' in s && (s as { status: string }).status === 'pending') {
            tries += 1; await new Promise((r) => setTimeout(r, 2000)); continue;
          }
          if (!cancelled) setKind('arion'); // not an oliver/spark intent
          return;
        } catch {
          // 404 / not a unified-signup session → it's the ARION flow.
          if (!cancelled) setKind('arion');
          return;
        }
      }
      if (!cancelled && kind === 'loading') setKind('product'); // webhook slow; still product
    })();
    return () => { cancelled = true; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (kind === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Activating your account…</div>;
  }
  if (kind === 'arion') return <ArionOnboardingFlow />;
  return <ProductSignupFlow sessionId={sessionId} email={sess?.email || ''} product={sess?.product || 'oliver'} />;
}

// ── OLIVER/SPARK post-payment: company profile → create tenant → sign in ──
function ProductSignupFlow({ sessionId, email, product }: { sessionId: string; email: string; product: string }) {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [stateProv, setStateProv] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    setBusy(true);
    try {
      await createSignupComplete(sessionId, {
        businessName: businessName.trim(),
        primaryContactPhone: phone || undefined,
        websiteUrl: website || undefined,
        city: city || undefined,
        stateProvince: stateProv || undefined,
      });
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  const productLabel = product === 'spark' ? 'SPARK' : 'OLIVER';

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow p-8">
          <div className="text-3xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">You're all set</h1>
          <p className="mt-2 text-gray-600">
            Your {productLabel} account is ready. Sign in with <strong>{email}</strong> to finish setup —
            you'll be prompted to create your password.
          </p>
          <a href="/" className="inline-block mt-6 rounded-lg bg-[#EF6C33] px-6 py-3 text-white font-semibold hover:bg-[#d75a25]">
            Sign in to your account →
          </a>
          <p className="mt-3 text-xs text-gray-500">Use the same email you paid with so we link your subscription.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 text-xl font-bold text-gray-900">Intelligent Analytics</div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12">
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-wide text-[#EF6C33] font-bold">Payment received · {productLabel}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Tell us about your business</h1>
          <p className="mt-2 text-gray-600">This sets up your account. You enter it once — it's shared across every product.</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <Field label="Business name *">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Rolling In It LLC" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
            <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="https://" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
            <Field label="State / Region"><input value={stateProv} onChange={(e) => setStateProv(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button disabled={busy} onClick={submit}
            className="w-full rounded-lg bg-[#EF6C33] px-6 py-3 text-white font-semibold disabled:opacity-50 hover:bg-[#d75a25]">
            {busy ? 'Setting up your account…' : 'Finish setup →'}
          </button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
