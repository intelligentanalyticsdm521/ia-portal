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

type Status = 'loading' | 'success' | 'used' | 'expired' | 'invalid' | 'error';
type ResendStatus = 'idle' | 'sending' | 'sent' | 'rate_limited' | 'failed';

export function WelcomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [site, setSite] = useState<{ domain?: string; wp_admin_url?: string } | null>(null);
  // 2026-06-27 — Resend-verification flow state. When activate.js returns
  // 409 TOKEN_EXPIRED + can_resend, the page surfaces a "Send me a new link"
  // button that POSTs the same (email, tenant_id, expired_token) to
  // /onboarding/activate/resend. The endpoint rotates the stored hash and
  // sends a fresh 48h activation email.
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');
  const [resendRetryAfter, setResendRetryAfter] = useState<number | null>(null);

  const email = params.get('email') || '';
  const setupToken = params.get('setup_token') || '';
  const tenantId = params.get('tenant_id') || '';

  // F-SEC1.4 (2026-06-21): Defense-in-depth fallback for Referrer-Policy.
  // The SWA staticwebapp.config.json sets the header authoritatively for
  // /welcome*, but we also inject a <meta name="referrer" content="no-referrer">
  // here in case the SWA route config drifts. This prevents the activation URL
  // (which carries email + setup_token + tenant_id) from leaking via the
  // Referer header when the user clicks any outbound link from this page —
  // including the CIAM/MSAL signup redirect.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { try { document.head.removeChild(meta); } catch { /* ignore */ } };
  }, []);

  // 2026-07-31 — SELF-HEAL. The welcome_token is 48h + single-use, and for
  // months clients clicked dead links (expired, already-consumed, or a token
  // that was never persisted) and hit an error page with nowhere to go.
  //
  // The token was never load-bearing: /onboarding/activate's only output is a
  // signup_url pointing at exactly the URL below. Tenant access comes from the
  // PENDING core.tenant_invitations row (scoped to this email + tenant), and
  // Entra requires an emailed one-time code before creating the account — so
  // mailbox control, not the token, is the real gate.
  //
  // Therefore: on ANY token failure (missing / expired / used / mismatch), send
  // them to the durable registration URL instead of a dead end. Every link we
  // have ever emailed now works. `location.replace` (not navigate) forces a
  // fresh load so AppGate reads `welcome=1` cleanly, and drops the token URL
  // from history. See overnight-report/CLIENT_PORTAL_LOGIN_SOP.md.
  const goToRegistration = (reason: string) => {
    if (!email) return false;
    console.info(`[welcome] falling through to registration (${reason})`);
    window.location.replace(`/app?welcome=1&prefill_email=${encodeURIComponent(email)}`);
    return true;
  };

  useEffect(() => {
    // New-style link (no token) or a partial legacy link — go straight to
    // the CIAM registration page with the email pre-filled.
    if (!setupToken || !tenantId) {
      if (goToRegistration('no_token')) return;
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
          // F-SEC1.5 (2026-06-19): PRG scrub. Token validation succeeded
          // server-side; drop setup_token (and the rest of the activation
          // params) from the URL so they don't leak via Referer, browser
          // history, third-party scripts, or window.location reads. The
          // server-side records token-used-at, so even if the token
          // resurfaces it's already rotated/consumed.
          try { window.history.replaceState({}, '', '/welcome'); } catch { /* ignore */ }
          // Brief pause so the customer sees confirmation, then bounce to
          // the authenticated app shell. AppGate triggers the CIAM (Entra
          // External ID) signup/signin flow, and on return continues to the
          // welcome=1 query the UnifiedSetupCard reads to auto-open the
          // orientation modal. (2026-06-30 fix: the old `/signup` URL was
          // renamed to `/pricing`, the public checkout — clicking welcome
          // emails landed clients on a "Pick a plan and pay" page.)
          setTimeout(() => {
            const target = body.signup_url || `/app/services/command?welcome=1&prefill_email=${encodeURIComponent(email)}`;
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
          // Expired OR already-used: both self-heal to registration. If they
          // already have an account, Entra's create-account page tells them so
          // and offers sign-in — still a better dead end than an error page.
          if (goToRegistration(`409_${body?.error?.code || 'conflict'}`)) return;
          const code = body?.error?.code || '';
          if (code === 'TOKEN_EXPIRED' && body?.error?.can_resend) {
            setStatus('expired');
          } else {
            setStatus('used');
          }
        } else if (res.status === 404 || res.status === 422) {
          // Token mismatch / no site row. Tenant access comes from the
          // invitation, not the site record — so still send them to register.
          if (goToRegistration(`${res.status}`)) return;
          setStatus('invalid');
          setErrorMsg(body?.error?.code || `HTTP ${res.status}`);
        } else {
          if (goToRegistration(`http_${res.status}`)) return;
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

        {status === 'expired' && (
          <>
            {resendStatus === 'sent' ? (
              <p className="text-sm text-slate-600">
                We just sent a fresh activation link to your inbox. It's good
                for the next 48 hours. You can close this tab.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  This activation link expired. Activation links are good for
                  48 hours after we send them. Send yourself a fresh one and
                  we'll keep going from there.
                </p>
                {resendStatus === 'failed' && (
                  <p className="text-xs text-rose-600 mb-3">
                    We couldn't send a new link just now. Please try again, or
                    email{' '}
                    <a href="mailto:support@intelligentanalyticsdm.com" className="underline">support</a>.
                  </p>
                )}
                {resendStatus === 'rate_limited' && (
                  <p className="text-xs text-amber-600 mb-3">
                    Too many resend attempts. Try again in{' '}
                    {resendRetryAfter ? `${Math.ceil(resendRetryAfter / 60)} min` : 'a bit'}.
                  </p>
                )}
                <button
                  type="button"
                  disabled={resendStatus === 'sending'}
                  onClick={async () => {
                    setResendStatus('sending');
                    setResendRetryAfter(null);
                    try {
                      const baseUrl = (import.meta.env.VITE_ARION_API_BASE_URL as string)?.replace(/\/$/, '')
                        || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';
                      const r = await fetch(`${baseUrl}/onboarding/activate/resend`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          email,
                          tenant_id: tenantId,
                          expired_token: setupToken,
                        }),
                      });
                      const b = await r.json().catch(() => ({}));
                      if (r.status === 200 && b.ok) {
                        setResendStatus('sent');
                      } else if (r.status === 429) {
                        setResendStatus('rate_limited');
                        setResendRetryAfter(Number(b?.retry_after_seconds) || null);
                      } else {
                        setResendStatus('failed');
                      }
                    } catch {
                      setResendStatus('failed');
                    }
                  }}
                  className="inline-block bg-iadm-gold text-iadm-ink rounded-lg px-6 py-2.5 font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {resendStatus === 'sending' ? 'Sending…' : 'Send me a new link'}
                </button>
              </>
            )}
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
