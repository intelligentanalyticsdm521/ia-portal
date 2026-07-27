import { useIsAuthenticated } from '@azure/msal-react';
import { Link } from 'react-router-dom';
import { useAccessToken } from '../auth/useAccessToken';

// Public welcome / sign-in page (OUR code). The Sign In / Create account
// actions hand off to the CIAM (Entra External ID) hosted credential page —
// that form is styled in Azure, not here.
export function LandingPage() {
  const isAuthenticated = useIsAuthenticated();
  const { login } = useAccessToken();

  return (
    <div className="min-h-screen bg-iadm-background text-gray-900 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        {/* Crisp vector lockup (ia-lockup-horiz-blue.svg, 760×200) at a fixed
            height — replaces the upscaled raster PNG that rendered blurry. */}
        <div className="flex justify-center">
          <img src="/ia-lockup-horiz-blue.svg" alt="Intelligent Analytics" className="h-14 w-auto" />
        </div>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-center text-2xl font-semibold text-gray-900">Welcome</h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Sign in to your account
          </p>

          {isAuthenticated ? (
            <Link to="/app/overview" className="iadm-btn-primary mt-6 flex w-full items-center justify-center">
              Go to portal
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => login()}
                className="iadm-btn-primary mt-6 flex w-full items-center justify-center"
              >
                Sign In
              </button>
              <p className="mt-4 text-center text-sm text-gray-600">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => login({ create: true })}
                  className="font-semibold text-[#EF6C33] hover:underline"
                >
                  Create an account
                </button>
              </p>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <span className="font-medium text-gray-700">Need a new service?</span>{' '}
          <a
            href="mailto:info@intelligentanalyticsdm.com?subject=New%20service%20request"
            className="font-semibold text-[#EF6C33] hover:underline"
          >
            Contact us
          </a>
        </div>
      </div>
    </div>
  );
}
