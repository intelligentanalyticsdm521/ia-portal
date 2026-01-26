import { useIsAuthenticated } from '@azure/msal-react';
import { Link } from 'react-router-dom';
import { useAccessToken } from '../auth/useAccessToken';

export function LandingPage() {
  const isAuthenticated = useIsAuthenticated();
  const { login } = useAccessToken();

  return (
    <div className="min-h-screen bg-iadm-background text-gray-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-20">
        <img src="/iadm-logo.png" alt="IADM" className="h-10 w-auto" />
        <div>
          <h1 className="text-3xl font-semibold">Welcome to the IADM Portal</h1>
          <p className="mt-3 text-gray-600">
            Access your IADM services and Intelligence Layers in one place.
          </p>
        </div>

        {isAuthenticated ? (
          <Link
            to="/app/overview"
            className="iadm-btn-primary w-fit"
          >
            Go to portal
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => login()}
            className="iadm-btn-primary w-fit"
          >
            Sign in / Create account
          </button>
        )}

        <div className="iadm-card text-sm text-gray-700">
          <div className="iadm-card-body">
          <div className="font-medium">Need a new service?</div>
          <div className="mt-1">
            Contact <span className="font-medium">info@intelligentanalyticsdm.com</span> to request setup.
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
