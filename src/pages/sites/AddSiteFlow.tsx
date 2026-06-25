/**
 * AddSiteFlow — in-app wizard for EXISTING tenants adding a 2nd+ site.
 *
 * Pairs with POST /arion/sites/provision on the backend (tenant JWT auth).
 * For new-customer signup, see OnboardingFlow at /pricing/onboarding.
 *
 * Routes:
 *   /app/sites/new
 *
 * Differences from OnboardingFlow:
 *   - Authenticated via tenant JWT + activeTenantId (no session_id)
 *   - No Stripe checkout — site is added under the existing subscription
 *     (with site-limit enforcement server-side)
 *   - Submit redirects to /app/sites/:siteId/provisioning instead of /pricing/status
 *   - Header shows "Add another site" instead of plan name
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, provisionNewSite } from '../../lib/arionApi';
import {
  StepIndicator,
  DomainStep,
  QuestionnaireStep,
  BrandIntakeWizardStep,
  BrandingStep,
  CenteredMessage,
  DEFAULT_ANSWERS,
  type WizardStep,
  type QuestionnaireAnswers,
  type DomainSelection,
  type WhoisContact,
} from '../../components/onboardingWizard';

export function AddSiteFlow() {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>('domain');
  const [domain, setDomain] = useState<DomainSelection | null>(null);
  const [whois, setWhois] = useState<WhoisContact | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(DEFAULT_ANSWERS);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!activeTenantId) {
    return <CenteredMessage title="No active tenant" body="Please pick a tenant from the menu before adding a site." />;
  }

  async function handleSubmit() {
    setSubmitError(null);
    setStep('submitting');
    try {
      const token = await getToken();
      const result = await provisionNewSite({
        baseUrl: apiBaseUrl,
        bearerToken: token.accessToken,
        tenantId: activeTenantId!,
        body: {
          domain: domain!,
          answers: answers as unknown as Record<string, unknown>,
          whois: whois as unknown as Record<string, unknown> | null,
        },
      });
      navigate(`/app/sites/${encodeURIComponent(result.site_id)}/provisioning`);
    } catch (err) {
      let msg: string;
      if (err instanceof ArionApiError) {
        msg = err.status === 403
          ? `Site limit reached on your current plan. Upgrade to add another site.`
          : err.status === 425
          ? `Domain DNS hasn't propagated yet. We'll keep checking — try again in a few minutes, or come back when the nameserver change has spread.`
          : `Couldn't start the site build (${err.status}): ${err.message}`;
      } else {
        msg = (err as Error).message;
      }
      setSubmitError(msg);
      setStep('branding');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <div>
            <a href="/app/overview" className="text-sm text-gray-500 hover:text-gray-900">← Back to dashboard</a>
            <h1 className="text-xl font-bold text-gray-900 mt-1">Add another site</h1>
          </div>
          <StepIndicator current={step} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {submitError && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-900">
            {submitError}
          </div>
        )}

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
            onContinue={() => setStep('brand_intake')}
          />
        )}
        {step === 'brand_intake' && (
          <BrandIntakeWizardStep
            value={answers}
            onChange={setAnswers}
            onBack={() => setStep('questionnaire')}
            onContinue={() => setStep('branding')}
          />
        )}
        {step === 'branding' && (
          <BrandingStep
            value={answers}
            onChange={setAnswers}
            onBack={() => setStep('brand_intake')}
            onSubmit={handleSubmit}
            submitLabel="Build my new site →"
          />
        )}
        {step === 'submitting' && (
          <CenteredMessage title="Starting your build…" body="Setting up your second site. This takes a few seconds." />
        )}
      </main>
    </div>
  );
}
