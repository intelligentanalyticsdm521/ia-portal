import { useCallback, useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

const TABS = [
  'Organization',
  'Subscription & Billing',
  'Team',
  'Connected Accounts',
  'Notification Rules',
  'Security & Compliance',
  'Data & Privacy',
] as const;
type Tab = typeof TABS[number];

const LS_PREFIX = 'iadm.tenant.';

function lsGet(key: string, fallback = ''): string {
  return localStorage.getItem(LS_PREFIX + key) || fallback;
}
function lsSet(key: string, value: string) {
  localStorage.setItem(LS_PREFIX + key, value);
}
function lsBool(key: string, fallback = false): boolean {
  const v = localStorage.getItem(LS_PREFIX + key);
  if (v === null) return fallback;
  return v === 'true';
}
function lsSetBool(key: string, v: boolean) {
  localStorage.setItem(LS_PREFIX + key, String(v));
}

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
      {message}
    </div>
  );
}

function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-black' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </label>
  );
}

function SectionLabel({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Organization                                                  */
/* ------------------------------------------------------------------ */

function OrganizationTab() {
  const [companyName, setCompanyName] = useState(() => lsGet('org.name'));
  const [website, setWebsite] = useState(() => lsGet('org.website'));
  const [phone, setPhone] = useState(() => lsGet('org.phone'));
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const handleSave = useCallback(() => {
    lsSet('org.name', companyName);
    lsSet('org.website', website);
    lsSet('org.phone', phone);
    setToast('Organization details saved');
  }, [companyName, website, phone]);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="ts-company" className="block text-sm font-medium text-gray-700">Company name</label>
        <input
          id="ts-company"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          placeholder="Acme Corp"
        />
      </div>

      <div>
        <label htmlFor="ts-website" className="block text-sm font-medium text-gray-700">Website URL</label>
        <input
          id="ts-website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label htmlFor="ts-phone" className="block text-sm font-medium text-gray-700">Phone</label>
        <input
          id="ts-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          placeholder="+1 (555) 000-0000"
        />
      </div>

      {/* Logo upload placeholder */}
      <div>
        <label htmlFor="ts-logo" className="block text-sm font-medium text-gray-700">Company logo</label>
        <input
          id="ts-logo"
          type="file"
          accept="image/*"
          onChange={(e) => setLogoFile(e.target.files?.[0]?.name || null)}
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />
        {logoFile && <p className="mt-1 text-xs text-gray-500">Selected: {logoFile}</p>}
        <p className="mt-1 text-xs text-gray-400">Logo upload processing will be available in a future release.</p>
      </div>

      <div>
        <button type="button" onClick={handleSave} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Save organization
        </button>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Subscription & Billing                                        */
/* ------------------------------------------------------------------ */

const PRODUCTS = [
  { name: 'ARION', desc: 'Website intelligence & SEO', tier: 'Professional' },
  { name: 'OLIVER', desc: 'Field service management', tier: 'Starter' },
  { name: 'SPARK', desc: 'Marketing automation', tier: 'Free' },
] as const;

function SubscriptionBillingTab() {
  return (
    <div className="space-y-6">
      <SectionLabel title="Current subscriptions" />

      {/* Product tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PRODUCTS.map((p) => (
          <div key={p.name} className="rounded-lg border bg-gray-50 p-4">
            <div className="text-sm font-semibold text-gray-900">{p.name}</div>
            <div className="mt-0.5 text-xs text-gray-500">{p.desc}</div>
            <div className="mt-3">
              <span className="inline-block rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-white">
                {p.tier}
              </span>
            </div>
            <a
              href="https://intelligentanalyticsdm.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline"
            >
              Upgrade plan &rarr;
            </a>
          </div>
        ))}
      </div>

      {/* Invoice history */}
      <div className="border-t pt-4">
        <SectionLabel title="Invoice history" />

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-medium uppercase text-gray-400">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-gray-400">
                  No invoices yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Team                                                          */
/* ------------------------------------------------------------------ */

function TeamTab() {
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [toast, setToast] = useState('');

  const handleInvite = useCallback(() => {
    if (!inviteEmail.trim()) return;
    setToast(`Invitation sent to ${inviteEmail}`);
    setInviteEmail('');
    setInviteRole('viewer');
    setModalOpen(false);
  }, [inviteEmail]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <SectionLabel title="Team members" description="Manage who has access to your organization." />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Invite user
        </button>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-medium uppercase text-gray-400">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2">Last active</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b last:border-0">
              <td className="py-3 pr-4">
                <span className="font-medium text-gray-900">Current User</span>
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  You
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-600">user@example.com</td>
              <td className="py-3 pr-4 text-gray-600">Owner</td>
              <td className="py-3 text-gray-500">Just now</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">Invite team member</h3>
            <p className="mt-1 text-sm text-gray-500">Send an invitation email to add someone to your organization.</p>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700">Email address</label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  placeholder="colleague@company.com"
                />
              </div>

              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Send invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Connected Accounts                                            */
/* ------------------------------------------------------------------ */

const INTEGRATIONS = [
  { key: 'ga', name: 'Google Analytics', connected: false },
  { key: 'gsc', name: 'Google Search Console', connected: false },
  { key: 'gbp', name: 'Google Business Profile', connected: false },
  { key: 'bwt', name: 'Bing Webmaster', connected: false },
  { key: 'abc', name: 'Apple Business Connect', connected: false },
] as const;

function ConnectedAccountsTab() {
  const [toast, setToast] = useState('');

  return (
    <div className="space-y-6">
      <SectionLabel title="Third-party integrations" description="Connect your external accounts to enable data syncing." />

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map((int) => (
          <div key={int.key} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">{int.name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${int.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-xs text-gray-500">{int.connected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToast('Coming soon')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  int.connected
                    ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'bg-black text-white hover:bg-gray-800'
                }`}
              >
                {int.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Notification Rules                                            */
/* ------------------------------------------------------------------ */

interface NotifRule {
  key: string;
  label: string;
}

const NOTIF_RULES: NotifRule[] = [
  { key: 'ssl', label: 'SSL Expiry' },
  { key: 'perf', label: 'Performance Drop' },
  { key: 'review', label: 'New Review' },
  { key: 'rankings', label: 'Weekly Rankings' },
  { key: 'security', label: 'Security Scan' },
];

function NotificationRulesTab() {
  const [rules, setRules] = useState<Record<string, { enabled: boolean; email: string }>>(() => {
    const stored = localStorage.getItem(LS_PREFIX + 'notifRules');
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    const init: Record<string, { enabled: boolean; email: string }> = {};
    for (const r of NOTIF_RULES) init[r.key] = { enabled: true, email: '' };
    return init;
  });
  const [toast, setToast] = useState('');

  const updateRule = useCallback((key: string, field: 'enabled' | 'email', value: boolean | string) => {
    setRules((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem(LS_PREFIX + 'notifRules', JSON.stringify(rules));
    setToast('Notification rules saved');
  }, [rules]);

  return (
    <div className="space-y-6">
      <SectionLabel title="Notification rules" description="Configure which events trigger alerts and who receives them." />

      <div className="divide-y">
        {NOTIF_RULES.map((r) => {
          const rule = rules[r.key] || { enabled: true, email: '' };
          return (
            <div key={r.key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-[180px] items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled}
                  onClick={() => updateRule(r.key, 'enabled', !rule.enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${rule.enabled ? 'bg-black' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">{r.label}</span>
              </div>
              <input
                type="email"
                value={rule.email}
                onChange={(e) => updateRule(r.key, 'email', e.target.value)}
                placeholder="recipient@company.com"
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
          );
        })}
      </div>

      <div>
        <button type="button" onClick={handleSave} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Save rules
        </button>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Security & Compliance                                         */
/* ------------------------------------------------------------------ */

function SecurityComplianceTab() {
  const [minLen, setMinLen] = useState(() => lsGet('sec.minLen', '8'));
  const [specialChars, setSpecialChars] = useState(() => lsBool('sec.specialChars', true));
  const [sessionTimeout, setSessionTimeout] = useState(() => lsGet('sec.sessionTimeout', '4'));
  const [toast, setToast] = useState('');

  const handleSave = useCallback(() => {
    lsSet('sec.minLen', minLen);
    lsSetBool('sec.specialChars', specialChars);
    lsSet('sec.sessionTimeout', sessionTimeout);
    setToast('Security settings saved');
  }, [minLen, specialChars, sessionTimeout]);

  return (
    <div className="space-y-6">
      <SectionLabel title="Password policy" description="Set password requirements for your organization." />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ts-min-len" className="block text-sm font-medium text-gray-700">Minimum password length</label>
          <select
            id="ts-min-len"
            value={minLen}
            onChange={(e) => setMinLen(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="8">8 characters</option>
            <option value="10">10 characters</option>
            <option value="12">12 characters</option>
          </select>
        </div>

        <div>
          <label htmlFor="ts-timeout" className="block text-sm font-medium text-gray-700">Session timeout</label>
          <select
            id="ts-timeout"
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="1">1 hour</option>
            <option value="4">4 hours</option>
            <option value="8">8 hours</option>
            <option value="24">24 hours</option>
          </select>
        </div>
      </div>

      <Toggle id="toggle-special" checked={specialChars} onChange={setSpecialChars} label="Require special characters" />

      <div>
        <button type="button" onClick={handleSave} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Save security settings
        </button>
      </div>

      {/* Audit log */}
      <div className="border-t pt-4">
        <SectionLabel title="Audit log" />
        <p className="mt-2 text-sm text-gray-600">
          Audit log is captured automatically. Contact IA to request a log export.
        </p>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Data & Privacy                                                */
/* ------------------------------------------------------------------ */

function DataPrivacyTab() {
  const [toast, setToast] = useState('');

  const handleExport = useCallback(() => {
    setToast('Data export requested. You will receive an email when the export is ready.');
  }, []);

  return (
    <div className="space-y-6">
      <SectionLabel title="Data export" description="Request a copy of all data associated with your organization." />

      <div>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Request data export
        </button>
      </div>

      {/* Data retention */}
      <div className="border-t pt-4">
        <SectionLabel title="Data retention policy" />
        <div className="mt-2 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
          <p>
            Your data is retained for the duration of your active subscription plus 90 days after cancellation.
            After the retention period, all personally identifiable information is permanently deleted.
            Aggregated, anonymized analytics data may be retained for product improvement purposes.
          </p>
          <p className="mt-2">
            For questions about data retention or to request early deletion, contact{' '}
            <span className="font-medium text-gray-900">privacy@intelligentanalyticsdm.com</span>.
          </p>
        </div>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main: TenantSettings                                               */
/* ------------------------------------------------------------------ */

export function TenantSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('Organization');

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Page header */}
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Organization Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your organization, team, integrations, and compliance.</p>
      </section>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-black text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <section className="rounded-lg border bg-white p-5">
        {activeTab === 'Organization' && <OrganizationTab />}
        {activeTab === 'Subscription & Billing' && <SubscriptionBillingTab />}
        {activeTab === 'Team' && <TeamTab />}
        {activeTab === 'Connected Accounts' && <ConnectedAccountsTab />}
        {activeTab === 'Notification Rules' && <NotificationRulesTab />}
        {activeTab === 'Security & Compliance' && <SecurityComplianceTab />}
        {activeTab === 'Data & Privacy' && <DataPrivacyTab />}
      </section>
    </div>
  );
}
