import { useCallback, useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

const TABS = ['Profile', 'Appearance', 'Language & Timezone', 'Notifications', 'Security'] as const;
type Tab = typeof TABS[number];

const LS_KEYS = {
  theme: 'iadm.theme',
  spacing: 'iadm.spacing',
  displayName: 'iadm.personal.displayName',
  timezone: 'iadm.personal.timezone',
  pushNotifications: 'iadm.personal.pushNotifications',
} as const;

/* ------------------------------------------------------------------ */
/*  Toast                                                              */
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

/* ------------------------------------------------------------------ */
/*  Toggle switch                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Tab: Profile                                                       */
/* ------------------------------------------------------------------ */

function ProfileTab() {
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(LS_KEYS.displayName) || '');
  const email = 'user@example.com'; // placeholder until auth wiring
  const [toast, setToast] = useState('');

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.length) return parts[0][0].toUpperCase();
    return 'U';
  }, [displayName]);

  const handleSave = useCallback(() => {
    localStorage.setItem(LS_KEYS.displayName, displayName);
    setToast('Profile saved successfully');
  }, [displayName]);

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
          {initials}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900">{displayName || 'No name set'}</div>
          <div className="text-xs text-gray-500">Profile photo coming soon</div>
        </div>
      </div>

      {/* Display name */}
      <div>
        <label htmlFor="ps-display-name" className="block text-sm font-medium text-gray-700">
          Display name
        </label>
        <input
          id="ps-display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          placeholder="Your name"
        />
      </div>

      {/* Email (read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {email}
        </div>
        <p className="mt-1 text-xs text-gray-400">Managed by your identity provider</p>
      </div>

      {/* Save */}
      <div>
        <button type="button" onClick={handleSave} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Save changes
        </button>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Appearance                                                    */
/* ------------------------------------------------------------------ */

function AppearanceTab() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(LS_KEYS.theme) === 'dark');
  const [compact, setCompact] = useState(() => localStorage.getItem(LS_KEYS.spacing) === 'compact');

  const handleTheme = useCallback((v: boolean) => {
    setDarkMode(v);
    localStorage.setItem(LS_KEYS.theme, v ? 'dark' : 'light');
  }, []);

  const handleSpacing = useCallback((v: boolean) => {
    setCompact(v);
    localStorage.setItem(LS_KEYS.spacing, v ? 'compact' : 'default');
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">Customize how the portal looks and feels.</p>
      <div className="divide-y">
        <Toggle id="toggle-dark" checked={darkMode} onChange={handleTheme} label="Dark mode" />
        <Toggle id="toggle-compact" checked={compact} onChange={handleSpacing} label="Compact spacing" />
      </div>
      <p className="pt-2 text-xs text-gray-400">Changes are saved automatically and persist across sessions.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Language & Timezone                                           */
/* ------------------------------------------------------------------ */

function LanguageTimezoneTab() {
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'UTC'];
    }
  }, []);

  const [tz, setTz] = useState(() => localStorage.getItem(LS_KEYS.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [toast, setToast] = useState('');

  const handleSave = useCallback(() => {
    localStorage.setItem(LS_KEYS.timezone, tz);
    setToast('Language & timezone preferences saved');
  }, [tz]);

  return (
    <div className="space-y-6">
      {/* Language */}
      <div>
        <label htmlFor="ps-lang" className="block text-sm font-medium text-gray-700">
          Language
        </label>
        <select
          id="ps-lang"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          defaultValue="en"
        >
          <option value="en">English</option>
          <option disabled>Spanish &mdash; Coming soon</option>
          <option disabled>French &mdash; Coming soon</option>
          <option disabled>German &mdash; Coming soon</option>
          <option disabled>Portuguese &mdash; Coming soon</option>
        </select>
      </div>

      {/* Timezone */}
      <div>
        <label htmlFor="ps-tz" className="block text-sm font-medium text-gray-700">
          Timezone
        </label>
        <select
          id="ps-tz"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        >
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <button type="button" onClick={handleSave} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Save preferences
        </button>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Notifications                                                 */
/* ------------------------------------------------------------------ */

function NotificationsTab() {
  const [pushEnabled, setPushEnabled] = useState(
    () => localStorage.getItem(LS_KEYS.pushNotifications) === 'true'
  );

  const handlePush = useCallback((v: boolean) => {
    setPushEnabled(v);
    localStorage.setItem(LS_KEYS.pushNotifications, String(v));
  }, []);

  const orgRows = [
    'Weekly performance digest',
    'SSL certificate expiry alerts',
    'Security scan results',
    'Billing & invoice notifications',
  ];

  return (
    <div className="space-y-6">
      {/* Org-controlled notifications */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Email notifications</h3>
        <p className="mt-1 text-xs text-gray-500">These notifications are managed by your organization.</p>

        <div className="mt-3 divide-y">
          {orgRows.map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-gray-700">{row}</span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Set by your organization</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Push notifications */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Push notifications</h3>
        <p className="mt-1 text-xs text-gray-500">Receive in-browser push notifications for important events.</p>
        <div className="mt-2">
          <Toggle id="toggle-push" checked={pushEnabled} onChange={handlePush} label="Enable push notifications" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Security                                                      */
/* ------------------------------------------------------------------ */

function parseUserAgent(ua: string): string {
  let browser = 'Unknown browser';
  let os = 'Unknown OS';

  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}

function SecurityTab() {
  const ua = navigator.userAgent;
  const browserOs = useMemo(() => parseUserAgent(ua), [ua]);
  const timestamp = useMemo(() => new Date().toLocaleString(), []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Active sessions</h3>
        <p className="mt-1 text-xs text-gray-500">Devices that are currently signed in to your account.</p>
      </div>

      {/* Current session */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-gray-900">{browserOs}</div>
            <div className="mt-1 text-xs text-gray-500">Last active: {timestamp}</div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            This device
          </span>
        </div>
      </div>

      {/* Placeholder for more sessions */}
      <p className="text-xs text-gray-400">
        Additional session management and sign-out-all-devices will be available in a future release.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main: PersonalSettings                                             */
/* ------------------------------------------------------------------ */

export function PersonalSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Page header */}
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Personal Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account preferences and personal information.</p>
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
        {activeTab === 'Profile' && <ProfileTab />}
        {activeTab === 'Appearance' && <AppearanceTab />}
        {activeTab === 'Language & Timezone' && <LanguageTimezoneTab />}
        {activeTab === 'Notifications' && <NotificationsTab />}
        {activeTab === 'Security' && <SecurityTab />}
      </section>
    </div>
  );
}
