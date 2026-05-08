/**
 * ProvisioningStatus — live progress page shown after onboarding submit.
 *
 * Routes:
 *   /signup/status?session_id=cs_test_...
 *
 * Polls /onboarding/status?session_id=... every 5 seconds and renders a
 * step-by-step progress UI. The states map to the worker's progress callbacks:
 *
 *   queued → started → wp_login → ai_builder_prompt → ai_builder_confirm
 *     → kodee_skip → ai_builder_finalize → plugin_deploy → auto_redeem_trigger
 *     → bootstrap_running → ready
 *
 * On `ready`, redirect to /app/overview with their new login link.
 * On `failed`, show the error and a "Contact support" CTA.
 */

import { useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_ARION_API_BASE as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

type ProvisioningPhase =
  | 'queued'
  | 'dns_verifying'
  | 'started'
  | 'wp_login'
  | 'ai_builder_prompt'
  | 'ai_builder_confirm'
  | 'kodee_skip'
  | 'ai_builder_finalize'
  | 'plugin_deploy'
  | 'auto_redeem_trigger'
  | 'bootstrap_running'
  | 'ready'
  | 'ready_partial'
  | 'failed';

interface StatusResponse {
  phase: ProvisioningPhase;
  progress_percent: number;
  message?: string;
  details?: Record<string, unknown>;
  wp_admin_url?: string | null;
  wp_login_url?: string | null;
  preview_url?: string | null;
  error?: string;
}

const PHASE_LABELS: Record<ProvisioningPhase, string> = {
  queued: 'Preparing your site',
  dns_verifying: 'Verifying domain',
  started: 'Starting AI Builder',
  wp_login: 'Connecting to WordPress',
  ai_builder_prompt: 'Telling the AI about your business',
  ai_builder_confirm: 'Confirming site essentials',
  kodee_skip: 'Skipping optional questions',
  ai_builder_finalize: 'AI is generating your pages',
  plugin_deploy: 'Installing IA Plugin',
  auto_redeem_trigger: 'Linking your site',
  bootstrap_running: 'Configuring plugins and security',
  ready: 'Site ready!',
  ready_partial: 'Site ready (with warnings)',
  failed: 'Something went wrong',
};

const VISIBLE_PHASES: ProvisioningPhase[] = [
  'queued',
  'dns_verifying',
  'started',
  'wp_login',
  'ai_builder_prompt',
  'ai_builder_finalize',
  'plugin_deploy',
  'bootstrap_running',
  'ready',
];

export function ProvisioningStatus() {
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('session_id') || '', []);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/onboarding/status?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'failed');
        if (cancelled) return;
        setStatus(data.data);
        if (data.data.phase !== 'ready' && data.data.phase !== 'ready_partial' && data.data.phase !== 'failed') {
          timer = setTimeout(poll, 5000);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          timer = setTimeout(poll, 10_000);
        }
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);

  if (!sessionId) {
    return <div className="p-8 text-center">Session not found.</div>;
  }

  const phase = status?.phase || 'queued';
  const isFinished = phase === 'ready' || phase === 'ready_partial';
  const isFailed = phase === 'failed';
  const phaseIdx = Math.max(0, VISIBLE_PHASES.findIndex((p) => p === phase));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <span className="text-xl font-bold text-gray-900">Intelligent Analytics</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {!isFinished && !isFailed && (
          <>
            <h1 className="text-3xl font-bold text-gray-900">Building your site…</h1>
            <p className="mt-2 text-gray-600">This usually takes 3-5 minutes. You can leave this page open or come back later — we'll email you when it's ready.</p>

            <div className="mt-8 rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-900">{PHASE_LABELS[phase]}</span>
                <span className="text-gray-500">{status?.progress_percent ?? Math.round((phaseIdx / VISIBLE_PHASES.length) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-[#EF6C33] transition-all"
                  style={{ width: `${status?.progress_percent ?? Math.round((phaseIdx / VISIBLE_PHASES.length) * 100)}%` }}
                />
              </div>

              <ul className="mt-6 space-y-2 text-sm">
                {VISIBLE_PHASES.map((p, idx) => (
                  <li key={p} className="flex items-center gap-3">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${idx < phaseIdx ? 'bg-green-100 text-green-700' : idx === phaseIdx ? 'bg-[#EF6C33]/20 text-[#EF6C33]' : 'bg-gray-100 text-gray-400'}`}>
                      {idx < phaseIdx ? '✓' : idx === phaseIdx ? '•' : ''}
                    </span>
                    <span className={idx <= phaseIdx ? 'text-gray-900' : 'text-gray-400'}>
                      {PHASE_LABELS[p]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900">
                Connection hiccup — retrying… ({error})
              </div>
            )}
          </>
        )}

        {isFinished && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold text-gray-900">Your site is live!</h1>
            <p className="mt-2 text-gray-600">Sign in to your dashboard to see your new website and start customizing.</p>
            <div className="mt-8 grid gap-3 max-w-sm mx-auto">
              <a href="/app/overview" className="rounded-lg bg-[#EF6C33] px-6 py-3 text-sm font-semibold text-white">Open your dashboard →</a>
              {status?.preview_url && (
                <a href={status.preview_url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900">View your site</a>
              )}
              {status?.wp_login_url && (
                <a href={status.wp_login_url} target="_blank" rel="noreferrer" className="text-sm text-gray-600 underline">Log in to WordPress admin</a>
              )}
            </div>
          </div>
        )}

        {isFailed && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
            <h1 className="text-xl font-bold text-red-900">We hit a snag building your site</h1>
            <p className="mt-2 text-sm text-red-800">{status?.error || 'An unexpected error occurred during provisioning.'}</p>
            <p className="mt-4 text-sm text-red-800">Don't worry — your subscription is fine. Our team has been notified and will reach out within 1 hour.</p>
            <div className="mt-6 flex gap-3">
              <a href="mailto:support@intelligentanalyticsdm.com" className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white">Contact support</a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
