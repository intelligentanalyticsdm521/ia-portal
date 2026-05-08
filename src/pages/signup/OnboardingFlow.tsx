/**
 * OnboardingFlow — multi-step wizard shown after Stripe checkout success.
 *
 * Routes:
 *   /signup/onboarding?session_id=cs_test_...
 *
 * Steps:
 *   1. Domain — Search & buy OR Bring Your Own Domain
 *   2. Questionnaire — 11 fields that drive the Hostinger AI Builder prompt
 *   3. Branding — primary color + logo upload (or "AI choose")
 *   4. Submit — kicks off provisioning, redirects to ProvisioningStatus
 *
 * Each step persists answers to localStorage so a refresh doesn't lose data.
 * Final submit POSTs to /onboarding/submit (server-side TBD) which:
 *   - Stores questionnaire on signup_session
 *   - Issues domain purchase / starts BYOD verification
 *   - Enqueues a provisioning job for the Playwright worker
 */

import { useEffect, useMemo, useState } from 'react';
import {
  checkDomainAvailability,
  startByodVerification,
  pollByodStatus,
  type DomainCheckResult,
  type DomainMode,
  type ByodInstructions,
} from '../../lib/onboardingApi';

type Step = 'domain' | 'questionnaire' | 'branding' | 'submitting';

interface QuestionnaireAnswers {
  businessName: string;
  industry: string;
  description: string;
  services: string[];
  targetAudience: string;
  location: string;
  brandVoice: 'Professional' | 'Friendly' | 'Bold' | 'Premium' | 'Casual';
  stylePreference: 'Modern' | 'Classic' | 'Minimal' | 'Bold';
  pages: string[];
  primaryColor: string;
  tagline: string;
}

interface DomainSelection {
  mode: DomainMode;
  domain: string;
  pricePerYear?: number;
}

const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Contact', 'Blog', 'Shop', 'Portfolio', 'FAQ'];
const VOICE_OPTIONS: QuestionnaireAnswers['brandVoice'][] = ['Professional', 'Friendly', 'Bold', 'Premium', 'Casual'];
const STYLE_OPTIONS: QuestionnaireAnswers['stylePreference'][] = ['Modern', 'Classic', 'Minimal', 'Bold'];

export function OnboardingFlow() {
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('session_id') || '', []);

  const [step, setStep] = useState<Step>('domain');
  const [domain, setDomain] = useState<DomainSelection | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({
    businessName: '',
    industry: '',
    description: '',
    services: ['', '', ''],
    targetAudience: '',
    location: '',
    brandVoice: 'Professional',
    stylePreference: 'Modern',
    pages: ['Home', 'About', 'Services', 'Contact'],
    primaryColor: '#1a73e8',
    tagline: '',
  });

  // Restore progress on reload
  useEffect(() => {
    const saved = localStorage.getItem(`iadm_onboarding_${sessionId}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.domain) setDomain(data.domain);
        if (data.answers) setAnswers((a) => ({ ...a, ...data.answers }));
        if (data.step) setStep(data.step);
      } catch { /* ignore */ }
    }
  }, [sessionId]);

  // Persist on every change
  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem(
      `iadm_onboarding_${sessionId}`,
      JSON.stringify({ domain, answers, step })
    );
  }, [domain, answers, step, sessionId]);

  if (!sessionId) {
    return <CenteredMessage title="Session not found" body="We couldn't find your signup session. Please start signup again." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">Intelligent Analytics</span>
          <StepIndicator current={step} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {step === 'domain' && (
          <DomainStep
            value={domain}
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
                await fetch(`${(import.meta.env.VITE_ARION_API_BASE as string) || ''}/onboarding/submit`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_id: sessionId, domain, answers }),
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

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'domain', label: 'Domain' },
    { key: 'questionnaire', label: 'About' },
    { key: 'branding', label: 'Branding' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, idx) => (
        <span key={s.key} className={`px-3 py-1 rounded-full ${idx <= currentIdx ? 'bg-[#EF6C33] text-white' : 'bg-gray-200 text-gray-500'}`}>
          {idx + 1}. {s.label}
        </span>
      ))}
    </div>
  );
}

function DomainStep({ value, onChange, onContinue }: {
  value: DomainSelection | null;
  onChange: (v: DomainSelection) => void;
  onContinue: () => void;
}) {
  const [mode, setMode] = useState<DomainMode>(value?.mode || 'purchase');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DomainCheckResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [byodDomain, setByodDomain] = useState(value?.mode === 'byod' ? value.domain : '');
  const [byodVerified, setByodVerified] = useState(false);
  const [byodInstructions, setByodInstructions] = useState<ByodInstructions | null>(null);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await checkDomainAvailability(query);
      setResults(data.results);
    } catch (err) {
      alert((err as Error).message);
    }
    setSearching(false);
  }

  async function startByod() {
    if (!byodDomain.includes('.')) {
      alert('Enter a valid domain (e.g. yourbusiness.com)');
      return;
    }
    try {
      const data = await startByodVerification(byodDomain);
      setByodVerified(data.verified);
      setByodInstructions(data.instructions);
      onChange({ mode: 'byod', domain: byodDomain });
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // Periodic re-check for BYOD verification
  useEffect(() => {
    if (mode !== 'byod' || !byodDomain || byodVerified) return;
    const interval = setInterval(async () => {
      try {
        const status = await pollByodStatus(byodDomain);
        if (status.verified) setByodVerified(true);
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [mode, byodDomain, byodVerified]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Choose your domain</h2>
      <p className="mt-2 text-sm text-gray-600">You can buy a fresh one or use a domain you already own.</p>

      <div className="mt-6 inline-flex rounded-full bg-gray-100 p-1">
        <button onClick={() => setMode('purchase')} className={`px-4 py-2 rounded-full text-sm ${mode === 'purchase' ? 'bg-white shadow' : 'text-gray-600'}`}>I want a new domain</button>
        <button onClick={() => setMode('byod')} className={`px-4 py-2 rounded-full text-sm ${mode === 'byod' ? 'bg-white shadow' : 'text-gray-600'}`}>I already own one</button>
      </div>

      {mode === 'purchase' && (
        <div className="mt-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="yourbusiness"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
            />
            <button onClick={search} disabled={searching} className="rounded-lg bg-gray-900 text-white px-6 py-3 text-sm font-medium disabled:opacity-50">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-6 space-y-2">
              {results.map((r) => (
                <div key={r.domain} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
                  <div>
                    <div className="font-medium text-gray-900">{r.domain}</div>
                    <div className="text-xs text-gray-500">
                      {r.available
                        ? `Available — $${r.price_per_year?.toFixed(2) || '14.99'}/yr`
                        : 'Taken'}
                    </div>
                  </div>
                  {r.available && (
                    <button
                      onClick={() => onChange({ mode: 'purchase', domain: r.domain, pricePerYear: r.price_per_year || undefined })}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${value?.domain === r.domain ? 'bg-[#EF6C33] text-white' : 'bg-gray-900 text-white'}`}
                    >
                      {value?.domain === r.domain ? 'Selected ✓' : 'Select'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'byod' && (
        <div className="mt-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={byodDomain}
              onChange={(e) => setByodDomain(e.target.value.toLowerCase().trim())}
              placeholder="yourbusiness.com"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
            />
            <button onClick={startByod} className="rounded-lg bg-gray-900 text-white px-6 py-3 text-sm font-medium">
              Use this domain
            </button>
          </div>

          {byodInstructions && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Update your nameservers</h3>
              <p className="mt-1 text-sm text-gray-600">{byodInstructions.step1}</p>
              <p className="mt-3 text-sm text-gray-600">{byodInstructions.step2}</p>
              <ul className="mt-3 rounded-md bg-gray-50 p-3 font-mono text-sm text-gray-900">
                {byodInstructions.nameservers.map((ns) => <li key={ns}>{ns}</li>)}
              </ul>
              <p className="mt-4 text-xs text-gray-500">{byodInstructions.note}</p>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className={`inline-block w-2 h-2 rounded-full ${byodVerified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span>{byodVerified ? 'Verified! Your domain points to us.' : 'Waiting for nameserver change to propagate…'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <button
          disabled={!value}
          onClick={onContinue}
          className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function QuestionnaireStep({ value, onChange, onBack, onContinue }: {
  value: QuestionnaireAnswers;
  onChange: (a: QuestionnaireAnswers) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const set = <K extends keyof QuestionnaireAnswers>(k: K, v: QuestionnaireAnswers[K]) => onChange({ ...value, [k]: v });
  const setService = (idx: number, v: string) => {
    const next = [...value.services];
    next[idx] = v;
    set('services', next);
  };
  const togglePage = (page: string) => {
    if (page === 'Home') return; // Home is locked
    set('pages', value.pages.includes(page) ? value.pages.filter((p) => p !== page) : [...value.pages, page]);
  };

  const valid = value.businessName && value.industry && value.description.length >= 20 && value.services.filter(Boolean).length >= 2;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Tell us about your business</h2>
      <p className="mt-2 text-sm text-gray-600">This drives what your AI-built site will look like and say.</p>

      <div className="mt-6 grid gap-5">
        <Field label="Business name *">
          <input className="ia-input" value={value.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Acme Plumbing" />
        </Field>
        <Field label="Industry / business type *">
          <input className="ia-input" value={value.industry} onChange={(e) => set('industry', e.target.value)} placeholder="HVAC services, dental practice, boutique gym, etc." />
        </Field>
        <Field label="Brief description * (1-2 sentences)">
          <textarea className="ia-input" rows={2} value={value.description} onChange={(e) => set('description', e.target.value)} placeholder="What you do, who you serve, what makes you different." />
        </Field>
        <Field label="Tagline (optional)">
          <input className="ia-input" value={value.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Short slogan for the hero" />
        </Field>
        <Field label="Top 3 services *">
          {value.services.map((s, i) => (
            <input key={i} className="ia-input mb-2" value={s} onChange={(e) => setService(i, e.target.value)} placeholder={`Service ${i + 1}`} />
          ))}
        </Field>
        <Field label="Target customer">
          <input className="ia-input" value={value.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} placeholder="Homeowners in suburban Dallas, e.g." />
        </Field>
        <Field label="Location served">
          <input className="ia-input" value={value.location} onChange={(e) => set('location', e.target.value)} placeholder="Austin, TX" />
        </Field>

        <Field label="Brand voice">
          <div className="flex flex-wrap gap-2">
            {VOICE_OPTIONS.map((v) => (
              <button key={v} onClick={() => set('brandVoice', v)} className={`rounded-full px-4 py-2 text-sm border ${value.brandVoice === v ? 'bg-[#EF6C33] text-white border-[#EF6C33]' : 'bg-white border-gray-300 text-gray-700'}`}>{v}</button>
            ))}
          </div>
        </Field>

        <Field label="Visual style">
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((v) => (
              <button key={v} onClick={() => set('stylePreference', v)} className={`rounded-full px-4 py-2 text-sm border ${value.stylePreference === v ? 'bg-[#EF6C33] text-white border-[#EF6C33]' : 'bg-white border-gray-300 text-gray-700'}`}>{v}</button>
            ))}
          </div>
        </Field>

        <Field label="Pages to include">
          <div className="flex flex-wrap gap-2">
            {PAGE_OPTIONS.map((p) => {
              const sel = value.pages.includes(p);
              const locked = p === 'Home';
              return (
                <button
                  key={p}
                  disabled={locked}
                  onClick={() => togglePage(p)}
                  className={`rounded-full px-4 py-2 text-sm border ${sel ? 'bg-[#EF6C33] text-white border-[#EF6C33]' : 'bg-white border-gray-300 text-gray-700'} ${locked ? 'opacity-70' : ''}`}
                >
                  {p}{locked ? ' (always)' : ''}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="mt-10 flex justify-between">
        <button onClick={onBack} className="text-sm text-gray-600">← Back</button>
        <button disabled={!valid} onClick={onContinue} className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">Continue →</button>
      </div>

      <style>{`.ia-input { width: 100%; border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.625rem 0.875rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function BrandingStep({ value, onChange, onBack, onSubmit }: {
  value: QuestionnaireAnswers;
  onChange: (a: QuestionnaireAnswers) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Branding</h2>
      <p className="mt-2 text-sm text-gray-600">A few quick visual choices. We'll handle the rest.</p>

      <div className="mt-6 grid gap-5">
        <Field label="Primary brand color">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={value.primaryColor}
              onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
              className="h-12 w-16 cursor-pointer rounded"
            />
            <input
              type="text"
              value={value.primaryColor}
              onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            />
            <span className="text-xs text-gray-500">We'll match buttons, headers, and accents to this.</span>
          </div>
        </Field>

        <Field label="Logo (optional)">
          <p className="text-xs text-gray-500">You can upload a logo after signup — we'll use a clean text logo until then.</p>
        </Field>
      </div>

      <div className="mt-10 flex justify-between">
        <button onClick={onBack} className="text-sm text-gray-600">← Back</button>
        <button onClick={onSubmit} className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white">Build my site →</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-900 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-600">{body}</p>
    </div>
  );
}
