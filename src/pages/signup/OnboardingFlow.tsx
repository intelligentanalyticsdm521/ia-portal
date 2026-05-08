/**
 * OnboardingFlow — public, post-Stripe-checkout wizard for NEW customers.
 *
 * Pairs with /onboarding/submit on the backend (session_id auth).
 * For existing customers adding a 2nd site, see AddSiteFlow at /app/sites/new.
 *
 * Routes:
 *   /signup/onboarding?session_id=cs_test_...
 *
 * The actual form steps are shared via components/onboardingWizard.tsx.
 * This page handles only:
 *   - Reading session_id from URL
 *   - Hydrating from /onboarding/session-info
 *   - localStorage persistence keyed by session_id
 *   - Submit → POST /onboarding/submit, redirect to /signup/status
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchSessionInfo, type SignupSessionInfo } from '../../lib/onboardingApi';
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

export function OnboardingFlow() {
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
            }
            if (info.saved_domain) {
              setDomain(info.saved_domain as DomainSelection);
            }
            if (info.already_submitted) {
              window.location.href = `/signup/status?session_id=${encodeURIComponent(sessionId)}`;
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
                window.location.href = `/signup/status?session_id=${encodeURIComponent(sessionId)}`;
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
