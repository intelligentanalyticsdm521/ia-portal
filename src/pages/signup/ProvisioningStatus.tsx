/**
 * ProvisioningStatus — live progress page shown after onboarding submit.
 *
 * Routes:
 *   /pricing/status?session_id=cs_...
 *
 * Polls /onboarding/status every 4 seconds. The arion-api now runs the
 * orchestration asynchronously and writes the current phase + percent into
 * arion.site.provisioning_details_json, so this UI just renders whatever
 * the API returns.
 *
 * On `ready`, shows a "Take me to my portal" CTA and redirects after a
 * brief celebration. On `failed`, shows the error + "Contact support" CTA.
 *
 * ETA per platform (rough):
 *   ARION:  10–30 min worst-case (Kodee AI build is the slow step)
 *   OLIVER: 5–15 min (Stripe Connect + customer import)
 *   SPARK:  ~5 min (sender domain + contact import)
 *   STELLA: TBD
 */

import { useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

type Phase =
  | 'queued'
  | 'dns_verifying'
  | 'creating_hosting'
  | 'creating_database'
  | 'installing_wordpress'
  | 'waiting_for_wp'
  | 'resetting_admin_password'
  | 'kodee_building'
  | 'stripping_hostinger'
  | 'creating_editor_user'
  | 'installing_plugins'
  | 'applying_branding'
  | 'finishing_up'
  | 'sending_welcome'
  | 'ready'
  | 'failed'
  // legacy phases that still come from the old worker path
  | 'started'
  | 'wp_login'
  | 'ai_builder_prompt'
  | 'ai_builder_confirm'
  | 'ai_builder_finalize'
  | 'plugin_deploy'
  | 'auto_redeem_trigger'
  | 'bootstrap_running'
  | 'ready_partial';

interface StatusData {
  phase: Phase;
  progress_percent: number;
  message?: string;
  error?: string | null;
  wp_admin_url?: string | null;
  wp_login_url?: string | null;
  preview_url?: string | null;
  provisioning_state?: string | null;
}

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  queued: 'Preparing your site',
  dns_verifying: 'Verifying your domain',
  creating_hosting: 'Setting up your hosting',
  creating_database: 'Provisioning your database',
  installing_wordpress: 'Installing WordPress',
  waiting_for_wp: 'Waiting for your site to come online',
  resetting_admin_password: 'Setting up admin access',
  kodee_building: 'AI is designing your site',
  stripping_hostinger: 'Cleaning up provisioning tools',
  creating_editor_user: 'Creating your login',
  installing_plugins: 'Installing your plugin suite',
  applying_branding: 'Integrating your brand',
  finishing_up: 'Wrapping things up',
  sending_welcome: 'Sending your welcome email',
  ready: "Your site is ready!",
  failed: 'Something went wrong',
  // legacy
  started: 'Starting the AI Builder',
  wp_login: 'Connecting to WordPress',
  ai_builder_prompt: 'Telling the AI about your business',
  ai_builder_confirm: 'Confirming site essentials',
  ai_builder_finalize: 'AI is generating your pages',
  plugin_deploy: 'Installing IA Plugin',
  auto_redeem_trigger: 'Linking your site',
  bootstrap_running: 'Configuring plugins and security',
  ready_partial: 'Your site is ready (with warnings)',
};

const VISIBLE_PHASES: Phase[] = [
  'queued',
  'creating_hosting',
  'installing_wordpress',
  'kodee_building',
  'installing_plugins',
  'applying_branding',
  'sending_welcome',
  'ready',
];

const PHASE_INDEX: Partial<Record<Phase, number>> = (() => {
  const out: Partial<Record<Phase, number>> = {};
  VISIBLE_PHASES.forEach((p, i) => { out[p] = i; });
  out.dns_verifying = 0;
  out.creating_database = 1;
  out.waiting_for_wp = 2;
  out.resetting_admin_password = 2;
  out.stripping_hostinger = 4;
  out.creating_editor_user = 4;
  out.finishing_up = 6;
  return out;
})();

const ARION_MAX_ESTIMATE_SECONDS = 30 * 60;

export function ProvisioningStatus() {
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('session_id') || '', []);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [startedAt] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!sessionId) {
      setPollError('No session_id in URL');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/onboarding/status?session_id=${encodeURIComponent(sessionId)}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPollError(body?.error?.message || `HTTP ${res.status}`);
        } else {
          setStatus(body.data as StatusData);
          setPollError(null);
        }
        const phase = body.data?.phase as Phase | undefined;
        const terminal = phase === 'ready' || phase === 'ready_partial' || phase === 'failed';
        if (!terminal && !cancelled) {
          timer = setTimeout(poll, 4000);
        }
      } catch (err) {
        if (!cancelled) {
          setPollError(err instanceof Error ? err.message : String(err));
          timer = setTimeout(poll, 8000);
        }
      }
    }

    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId]);

  // Redirect on ready after a brief celebration.
  useEffect(() => {
    if (status?.phase === 'ready' || status?.phase === 'ready_partial') {
      const t = setTimeout(() => {
        window.location.href = '/app/overview';
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [status?.phase]);

  const phase: Phase = (status?.phase as Phase) || 'queued';
  const percent = status?.progress_percent ?? 0;
  const friendlyLabel = PHASE_LABEL[phase] || phase;
  const isFailed = phase === 'failed';
  const isReady = phase === 'ready' || phase === 'ready_partial';

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const remainingSec = Math.max(0, ARION_MAX_ESTIMATE_SECONDS - elapsedSec);
  const etaText = isReady
    ? 'Done!'
    : isFailed
    ? '—'
    : `~${Math.ceil(remainingSec / 60)} min remaining (upper bound)`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-10">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-iadm-gold/10 text-iadm-gold mb-3">
            {isReady ? <CheckIcon /> : isFailed ? <CrossIcon /> : <Spinner />}
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-iadm-ink mb-1">
            {isReady
              ? "We're ready for you."
              : isFailed
              ? 'Something hit a snag'
              : 'Building your site'}
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            {isReady
              ? 'Redirecting to your portal in a moment...'
              : isFailed
              ? 'Please reach out and we will sort this out manually.'
              : 'This may take up to 30 minutes for ARION sites. You can close this tab — we will email you when it is done.'}
          </p>
        </div>

        {/* Big progress bar */}
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium text-iadm-ink">{friendlyLabel}</span>
          <span className="text-slate-500 tabular-nums">{percent}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden mb-4" aria-label="progress">
          <div
            className={`h-full transition-all duration-500 ${
              isFailed ? 'bg-rose-500' : isReady ? 'bg-emerald-500' : 'bg-iadm-gold'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mb-8 text-right">{etaText}</p>

        {/* Step list */}
        {!isFailed && (
          <div className="space-y-2 mb-6">
            {VISIBLE_PHASES.map((p) => {
              const currentIdx = PHASE_INDEX[phase] ?? -1;
              const myIdx = PHASE_INDEX[p] ?? 999;
              const reached = myIdx < currentIdx;
              const isCurrent = myIdx === currentIdx;
              return (
                <div
                  key={p}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    reached
                      ? 'bg-emerald-50/60'
                      : isCurrent
                      ? 'bg-iadm-gold/5'
                      : 'bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      reached
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                        ? 'bg-iadm-gold text-iadm-ink'
                        : 'bg-slate-300 text-white'
                    }`}
                  >
                    {reached ? <SmallCheck /> : isCurrent ? <DotPulse /> : null}
                  </div>
                  <span
                    className={`text-sm ${
                      reached
                        ? 'text-emerald-700 font-medium'
                        : isCurrent
                        ? 'text-iadm-ink font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    {PHASE_LABEL[p]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Failure detail */}
        {isFailed && status?.error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-6">
            <div className="text-xs uppercase text-rose-700 font-semibold mb-1">Error</div>
            <pre className="text-sm text-rose-900 whitespace-pre-wrap break-words">{status.error}</pre>
          </div>
        )}

        {/* Ready actions */}
        {isReady && (
          <div className="space-y-3">
            <a
              href="/app/overview"
              className="block w-full text-center bg-iadm-gold text-iadm-ink rounded-lg px-6 py-3 font-semibold hover:opacity-90"
            >
              Take me to my portal
            </a>
            {status?.wp_admin_url && (
              <a
                href={status.wp_admin_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center bg-white border border-slate-300 text-iadm-ink rounded-lg px-6 py-3 font-medium hover:bg-slate-50"
              >
                Open my WordPress admin →
              </a>
            )}
          </div>
        )}

        {pollError && (
          <p className="text-xs text-amber-600 mt-4 text-right">
            Connection hiccup: {pollError} (retrying)
          </p>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-7 h-7 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CrossIcon() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
function SmallCheck() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DotPulse() {
  return <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />;
}
