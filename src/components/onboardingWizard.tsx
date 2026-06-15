/**
 * Onboarding wizard — shared step components for both signup and add-site flows.
 *
 * The new-customer signup at /pricing/onboarding and the existing-customer
 * add-site at /app/sites/new use IDENTICAL forms — only the surrounding page
 * shell, auth model, and submit endpoint differ. This module exposes the
 * step components (DomainStep, QuestionnaireStep, BrandingStep, WhoisForm)
 * + their shared types so each page can compose them with its own logic.
 */

import { useEffect, useState } from 'react';
import {
  checkDomainAvailability,
  startByodVerification,
  pollByodStatus,
  type DomainCheckResult,
  type DomainMode,
  type ByodInstructions,
} from '../lib/onboardingApi';

export type WizardStep = 'domain' | 'questionnaire' | 'branding' | 'submitting';

export interface QuestionnaireAnswers {
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

export interface DomainSelection {
  mode: DomainMode;
  domain: string;
  pricePerYear?: number;
}

export interface WhoisContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  entity_type: 'individual' | 'organization';
  organization?: string;
}

export const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Contact', 'Blog', 'Shop', 'Portfolio', 'FAQ'];
export const VOICE_OPTIONS: QuestionnaireAnswers['brandVoice'][] = ['Professional', 'Friendly', 'Bold', 'Premium', 'Casual'];
export const STYLE_OPTIONS: QuestionnaireAnswers['stylePreference'][] = ['Modern', 'Classic', 'Minimal', 'Bold'];

// Maps directly to arion-api/lib/templateRegistry.js bucket keys.
// "Other" routes to the generic_business fallback.
export const INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'service_business', label: 'Service business (plumber, electrician, HVAC, cleaner, contractor)' },
  { value: 'consulting', label: 'Consulting / professional services' },
  { value: 'healthcare', label: 'Healthcare / wellness (dental, chiro, gym, therapy)' },
  { value: 'restaurant', label: 'Restaurant / food' },
  { value: 'tech_saas', label: 'Tech / SaaS / software' },
  { value: 'retail', label: 'Retail / online shop' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'creative', label: 'Creative / agency / portfolio' },
  { value: 'other', label: 'Other (describe below)' },
];

export const DEFAULT_ANSWERS: QuestionnaireAnswers = {
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
};

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------
export function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
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

// ---------------------------------------------------------------------------
// DomainStep — search/buy or BYOD with verification + WHOIS form
// ---------------------------------------------------------------------------
export function DomainStep({ value, whois, onWhoisChange, onChange, onContinue }: {
  value: DomainSelection | null;
  whois: WhoisContact | null;
  onWhoisChange: (w: WhoisContact | null) => void;
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

  const whoisComplete = !whois ? false : !!(
    whois.first_name && whois.last_name && whois.email && whois.phone &&
    whois.address1 && whois.city && whois.state && whois.zip && whois.country &&
    (whois.entity_type === 'individual' || (whois.entity_type === 'organization' && whois.organization))
  );
  const canContinue = mode === 'purchase'
    ? !!(value && value.mode === 'purchase' && value.domain && whoisComplete)
    : !!(value && value.mode === 'byod' && byodVerified);

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

      {mode === 'purchase' && value?.mode === 'purchase' && value.domain && (
        <WhoisForm value={whois} onChange={onWhoisChange} />
      )}

      <div className="mt-10 flex justify-end">
        <button
          disabled={!canContinue}
          onClick={onContinue}
          className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhoisForm — embedded inside DomainStep when mode='purchase'
// ---------------------------------------------------------------------------
export function WhoisForm({ value, onChange }: {
  value: WhoisContact | null;
  onChange: (w: WhoisContact) => void;
}) {
  const w: WhoisContact = value || {
    first_name: '', last_name: '', email: '', phone: '',
    address1: '', city: '', state: '', zip: '', country: 'US',
    entity_type: 'individual', organization: '',
  };
  const set = <K extends keyof WhoisContact>(k: K, v: WhoisContact[K]) =>
    onChange({ ...w, [k]: v });

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">Domain registration contact info</h3>
      <p className="mt-1 text-sm text-gray-600">Required by the domain registry. We enable WHOIS privacy automatically so this isn't published publicly.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Type</span>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.entity_type} onChange={(e) => set('entity_type', e.target.value as 'individual' | 'organization')}>
            <option value="individual">Individual</option>
            <option value="organization">Organization (LLC, Inc, etc.)</option>
          </select>
        </label>
        {w.entity_type === 'organization' && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Organization name *</span>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.organization || ''} onChange={(e) => set('organization', e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">First name *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Last name *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </label>
        <label className="block col-span-2">
          <span className="block text-xs font-medium text-gray-700 mb-1">Email *</span>
          <input type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label className="block col-span-2">
          <span className="block text-xs font-medium text-gray-700 mb-1">Phone *</span>
          <input type="tel" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+15125551234" />
        </label>
        <label className="block col-span-2">
          <span className="block text-xs font-medium text-gray-700 mb-1">Street address *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.address1} onChange={(e) => set('address1', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">City *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.city} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">State / Region *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.state} onChange={(e) => set('state', e.target.value)} placeholder="TX" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">ZIP / Postal code *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.zip} onChange={(e) => set('zip', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Country *</span>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={w.country} onChange={(e) => set('country', e.target.value.toUpperCase().slice(0, 2))} placeholder="US" maxLength={2} />
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionnaireStep
// ---------------------------------------------------------------------------
export function QuestionnaireStep({ value, onChange, onBack, onContinue }: {
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
    if (page === 'Home') return;
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
          <select
            className="ia-input"
            value={INDUSTRY_OPTIONS.find((o) => o.value === value.industry)
              ? value.industry
              : (value.industry ? 'other' : '')}
            onChange={(e) => {
              const v = e.target.value;
              // For preset buckets, store the bucket key directly.
              // For "other", clear so the user fills the free-text field below.
              set('industry', v === 'other' ? '' : v);
            }}
          >
            <option value="">Select an industry…</option>
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(!INDUSTRY_OPTIONS.find((o) => o.value === value.industry)) && (
            <input
              className="ia-input mt-2"
              value={value.industry}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="Describe your business type (e.g. boutique gym, art studio)"
            />
          )}
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

// ---------------------------------------------------------------------------
// BrandingStep
// ---------------------------------------------------------------------------
export function BrandingStep({ value, onChange, onBack, onSubmit, submitLabel = 'Build my site →' }: {
  value: QuestionnaireAnswers;
  onChange: (a: QuestionnaireAnswers) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitLabel?: string;
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
        <button onClick={onSubmit} className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white">{submitLabel}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-900 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-600">{body}</p>
    </div>
  );
}
