import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function SettingsEditPage() {
  const navigate = useNavigate();
  const { session } = useAppState();

  const welcomeName = useMemo(() => {
    return session?.tenant?.tenantFullName || session?.tenant?.tenantName || 'Welcome';
  }, [session?.tenant?.tenantFullName, session?.tenant?.tenantName]);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const openConfirm = (cfg: Omit<ConfirmState, 'open'>) => {
    setConfirm({ open: true, ...cfg });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Edit Settings</h1>
        <p className="mt-2 text-sm text-gray-600">Placeholders in v1. No real actions are performed yet.</p>
        <p className="mt-1 text-sm text-gray-600">
          <span className="text-gray-500">Welcome:</span> <span className="font-medium">{welcomeName}</span>
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Subscription</h2>
            <p className="mt-1 text-sm text-gray-600">Placeholder actions.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/settings')}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              openConfirm({
                title: 'Cancel subscription',
                message: 'This is a placeholder action. In v1, no subscription will be changed.',
                confirmLabel: 'Confirm',
                onConfirm: () => setConfirm(null)
              });
            }}
          >
            Cancel subscription (placeholder)
          </button>

          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              // Placeholder
              openConfirm({
                title: 'Manage subscription',
                message: 'This is a placeholder action. In v1, no subscription will be changed.',
                confirmLabel: 'OK',
                onConfirm: () => setConfirm(null)
              });
            }}
          >
            Manage subscription (placeholder)
          </button>
        </div>

        <div className="border-t pt-6 space-y-3">
          <h2 className="text-base font-semibold">Email & Password</h2>
          <p className="text-sm text-gray-600">
            These will later redirect to CIAM user flows. For now they are placeholders.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                // Placeholder for future CIAM flow redirect
                openConfirm({
                  title: 'Update email',
                  message: 'Placeholder. This will later redirect to the CIAM email update flow.',
                  confirmLabel: 'OK',
                  onConfirm: () => setConfirm(null)
                });
              }}
            >
              Update email (placeholder)
            </button>

            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                // Placeholder for future CIAM flow redirect
                openConfirm({
                  title: 'Update password',
                  message: 'Placeholder. This will later redirect to the CIAM password update flow.',
                  confirmLabel: 'OK',
                  onConfirm: () => setConfirm(null)
                });
              }}
            >
              Update password (placeholder)
            </button>
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
          <p className="text-sm text-gray-600">
            Delete account will be implemented later. This placeholder requires confirmation.
          </p>

          <button
            type="button"
            className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            onClick={() => {
              openConfirm({
                title: 'Delete account',
                message:
                  'Are you sure? This is a placeholder action in v1. No data will be deleted until implemented in a later version.',
                confirmLabel: 'Yes, delete (placeholder)',
                onConfirm: () => setConfirm(null)
              });
            }}
          >
            Delete account (placeholder)
          </button>
        </div>
      </section>

      {confirm?.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <div className="text-lg font-semibold">{confirm.title}</div>
            <div className="mt-2 text-sm text-gray-700">{confirm.message}</div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="iadm-btn-secondary" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="iadm-btn-primary"
                onClick={() => confirm.onConfirm()}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
