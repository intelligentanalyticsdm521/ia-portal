import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';

export function SettingsViewPage() {
  const navigate = useNavigate();
  const { session } = useAppState();

  const welcomeName = useMemo(() => {
    return session?.tenant?.tenantFullName || session?.tenant?.tenantName || 'Welcome';
  }, [session?.tenant?.tenantFullName, session?.tenant?.tenantName]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">Account and billing settings (placeholders in v1).</p>
        <p className="mt-1 text-sm text-gray-600">
          <span className="text-gray-500">Welcome:</span> <span className="font-medium">{welcomeName}</span>
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Current settings</h2>
            <p className="mt-1 text-sm text-gray-600">These sections are placeholders until v1.x.</p>
          </div>

          <button type="button" onClick={() => navigate('/app/settings/edit')} className="iadm-btn-primary">
            Edit
          </button>
        </div>

        <div className="mt-4 grid gap-4 text-sm">
          <div>
            <div className="text-gray-500">Subscription</div>
            <div className="font-medium">Placeholder</div>
          </div>

          <div>
            <div className="text-gray-500">Email / Password</div>
            <div className="font-medium">Managed by CIAM (placeholder links)</div>
          </div>

          <div>
            <div className="text-gray-500">Delete account</div>
            <div className="font-medium">Placeholder</div>
          </div>
        </div>
      </section>
    </div>
  );
}
