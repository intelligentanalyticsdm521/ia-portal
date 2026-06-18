/**
 * Welcome page — landing for the post-onboarding "Activate your account" email
 * link. Verifies the welcome_token via arion-api, then redirects to the
 * existing signup flow with the email prefilled so the CIAM/MSAL signup can
 * finish account creation.
 *
 * URL: /welcome?email=...&setup_token=...&tenant_id=...
 *
 * Failure modes shown to the user:
 *   - Bad/missing params         → "This link is malformed. Check the email or contact support."
 *   - Token mismatch (422)       → same as above
 *   - Token already used (409)   → "Looks like you already activated. Sign in."
 *   - Site not found (404)       → "We can't find this account. Contact support."
 *   - Network / 500              → retry button
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

type Status = 'loading' | 'success' | 'used' | 'invalid' | 'error';

export function WelcomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [site, setSite] = useState<{ domain?: string; wp_admin_url?: string } | null>(null);

  const email = params.get('email') || '';
  const setupToken = params.get('setup_token') || '';
  const tenantId = params.get('tenant_id') || '';

  useEffect(() => {
    if (!email || !setupToken || !tenantId) {
      setStatus('invalid');
      setErrorMsg('Missing parameters in the activation link.');
      return;
    }
    const baseUrl = (import.meta.env.VITE_ARION_API_BASE_URL as string)?.replace(/\/$/, '')
      || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/onboarding/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, setup_token: setupToken, tenant_id: tenantId }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 200 && body.ok) {
          setSite(body.site || null);
          setStatus('success');
          // Brief pause so the customer sees confirmation, then bounce to signup.
          // signup completes MSAL → routes to /app/services/command which
          // auto-opens the unified onboarding modal via ?welcome=1 query param.
          // Result: the customer never leaves a guided flow.
          setTimeout(() => {
            const target = body.signup_url || `/signup?prefill_email=${encodeURIComponent(email)}&activated=1&post_signup_redirect=${encodeURIComponent("/app/services/command?welcome=1")}`;
            // External URL or in-app? The activate endpoint always returns an
            // absolute https URL on portal.intelligentanalyticsdm.com — if the
            // current host matches, use the in-app navigator to avoid a full
            // page reload.
            try {
              const url = new URL(target);
              if (url.host === window.location.host) {
                navigate(url.pathname + url.search);
              } else {
                window.location.href = target;
              }
            } catch {
              navigate(target);
            }
          }, 1800);
        } else if (res.status === 409) {
          setStatus('used');
        } else if (res.status === 404 || res.status === 422) {
          setStatus('invalid');
          setErrorMsg(body?.error?.code || `HTTP ${res.status}`);
        } else {
          setStatus('error');
          setErrorMsg(body?.error?.message || `HTTP ${res.status}`);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [email, setupToken, tenantId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-iadm-gold/10 text-iadm-gold mb-3">
            {status === 'loading' && <Spinner />}
            {status === 'success' && <Check />}
            {status === 'used' && <Info />}
            {(status === 'invalid' || status === 'error') && <Cross />}
          </div>
          <h1 className="text-2xl font-semibold text-iadm-ink mb-1">
            {status === 'loading' && 'Activating your account…'}
            {status === 'success' && "You're all set."}
            {status === 'used' && 'This activation was already used.'}
            {status === 'invalid' && 'Activation link invalid'}
            {status === 'error' && "Something went wrong"}
          </h1>
        </div>

        {status === 'loading' && (
          <p className="text-sm text-slate-600">Verifying your invitation. This takes a second.</p>
        )}

        {status === 'success' && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Taking you to the password setup screen.
            </p>
            {site?.wp_admin_url && (
              <div className="bg-slate-50 rounded-lg p-4 text-left text-sm text-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  Your WordPress admin
                </div>
                <a href={site.wp_admin_url} className="text-iadm-ink underline break-all">
                  {site.wp_admin_url}
                </a>
              </div>
            )}
          </>
        )}

        {status === 'used' && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Looks like you already activated this link. Sign in below.
            </p>
            <a
              href="/signup"
              className="inline-block bg-iadm-gold text-iadm-ink rounded-lg px-6 py-2.5 font-medium hover:opacity-90"
            >
              Sign in
            </a>
          </>
        )}

        {status === 'invalid' && (
          <p className="text-sm text-slate-600">
            We couldn't verify this activation link. Double-check the email or contact{' '}
            <a href="mailto:support@intelligentanalyticsdm.com" className="underline">support</a>.
            {errorMsg && <span className="block mt-2 text-xs text-slate-400">code: {errorMsg}</span>}
          </p>
        )}

        {status === 'error' && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              {errorMsg || 'A network or server error blocked activation.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-iadm-ink text-white rounded-lg px-6 py-2.5 font-medium hover:opacity-90"
            >
              Try again
            </button>
          </>
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
function Check() {
  return (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
function Info() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}
