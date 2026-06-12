// @deprecated 2026-06-12 � orphan after refactor. Superseded by F-86 + F-93 cross-product Settings SubNav � pages\settings\TenantSettings.tsx. Confirm with founder before deletion (task #174).
import { useMemo } from 'react';
import { useAppState } from '../app/AppState';

export function SettingsPage() {
  const { active } = useAppState();

  const tenantLabel = useMemo(() => {
    return active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'Tenant';
  }, [active?.tenant?.tenantFullName, active?.tenant?.tenantName]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Settings surfaces are placeholders until subscription and billing UIs are wired into backend systems.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">Subscriptions</h2>
        <p className="mt-2 text-sm text-gray-700">
          Current subscriptions for <span className="font-medium">{tenantLabel}</span> — placeholder.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">Billing</h2>
        <div className="mt-2 text-sm text-gray-700">
          <div>
            <span className="text-gray-500">Current billing total:</span> <span className="font-medium">—</span>{' '}
            <span className="text-gray-500">(placeholder)</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">Account</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Update email — placeholder</li>
          <li>Update password — placeholder</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          Note: changing email/password requires identity provider flows and/or backend support. This page intentionally
          does not attempt to implement those flows.
        </p>
      </section>
    </div>
  );
}
