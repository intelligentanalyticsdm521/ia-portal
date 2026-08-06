import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { Navigate } from 'react-router-dom';
import { useAccessToken } from '../auth/useAccessToken';

// Public welcome / sign-in page (OUR code). Sign In / Create account hand off
// to the CIAM (Entra External ID) hosted credential page.
export function LandingPage() {
  const isAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();
  const { login } = useAccessToken();

  // Already signed in (valid MSAL session / SSO) → go straight into the
  // portal. No "Sign In → Go to Portal" two-step, and no button flip.
  if (isAuthenticated) {
    return <Navigate to="/app/overview" replace />;
  }

  // MSAL still starting up or processing a redirect — we don't yet KNOW the
  // auth state. Show a minimal branded splash instead of flashing the Sign In
  // button (which is what made it look like it "flipped").
  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <img src="/ia-lockup.png" alt="Intelligent Analytics" className="w-60 h-auto opacity-90" />
        <div className="mt-8 h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#EF6C33]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Brand lockup — the real IA horizontal lockup, exported crisp. */}
        <img src="/ia-lockup.png" alt="Intelligent Analytics" className="w-60 h-auto" />

        <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-tight text-gray-900">
          Welcome to Intelligent Analytics
        </h1>
        <p className="mt-2 text-[15px] text-gray-500">
          Smarter software that grows with you
        </p>

        <button
          type="button"
          onClick={() => login()}
          className="mt-9 w-full rounded-xl bg-[#EF6C33] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#d95d27]"
        >
          Sign In
        </button>
        <p className="mt-4 text-sm text-gray-500">
          New here?{' '}
          <button
            type="button"
            onClick={() => login({ create: true })}
            className="font-semibold text-gray-900 underline-offset-2 hover:underline"
          >
            Create an account
          </button>
        </p>
      </div>

      <div className="mt-14 text-center text-sm text-gray-400">
        Need a new service?{' '}
        <a
          href="mailto:info@intelligentanalyticsdm.com?subject=New%20service%20request"
          className="font-medium text-gray-600 underline-offset-2 hover:underline"
        >
          Contact us
        </a>
      </div>
    </div>
  );
}
