/**
 * PersonalSettings — /app/account
 *
 * 2026-09-01 REBUILT after a full audit of the hamburger settings.
 *
 * What this page used to be: five tabs, every one of them a mockup.
 *   - Profile         → `const email = 'user@example.com'` was HARDCODED, so
 *                       every user of every business saw the same fake address.
 *                       "Save changes" wrote the display name to localStorage
 *                       and toasted "Profile saved successfully". The real
 *                       name in core.users never changed.
 *   - Appearance      → dark mode + compact spacing wrote `iadm.theme` /
 *                       `iadm.spacing`. NOTHING in the app ever read either key
 *                       (verified by grep), and there is no dark stylesheet.
 *                       Two switches that did nothing at all.
 *   - Language & TZ   → English was the only enabled language; the timezone
 *                       went to a localStorage key nothing reads.
 *   - Notifications   → four rows labelled "Set by your organization" naming
 *                       alerts that are not implemented anywhere, plus a push
 *                       toggle with no push implementation.
 *   - Security        → an "Active sessions" list built from navigator.userAgent,
 *                       i.e. it could only ever show the browser you were
 *                       already looking at, presented as a session registry.
 *
 * What it is now: the two things we can actually do, done for real.
 *   - Profile   → GET/PUT /me/profile on platform-api (core.users
 *                 first_name/last_name/full_name), and the signed-in email read
 *                 from the live MSAL account instead of a placeholder.
 *   - Sign-in   → states plainly where the account lives and what can and
 *                 cannot be changed from here, and offers a real sign-out.
 *
 * The deleted tabs are not "coming soon" — they were never wired to anything.
 * Per the standing rule, a replacement deletes what it replaces rather than
 * leaving a dead surface next to a working one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { authScopes } from '../../auth/msalConfig';
import { useAppState } from '../../app/AppState';
import { getProfile, updateProfile } from '../../lib/platformApi';

const TABS = ['Profile', 'Sign-in'] as const;
type Tab = typeof TABS[number];

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
/*  Tab: Profile — real read/write against core.users                  */
/* ------------------------------------------------------------------ */

function ProfileTab() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const tenantId = active?.tenant?.tenantId ?? null;

  // The signed-in address comes from the token, not from a constant. `username`
  // is the UPN/email MSAL resolved at sign-in; the claims are the fallback for
  // identity providers that leave username blank.
  const email = useMemo(() => {
    const claims = (account?.idTokenClaims ?? {}) as Record<string, unknown>;
    return (
      account?.username ||
      (typeof claims.email === 'string' ? claims.email : '') ||
      (typeof claims.preferred_username === 'string' ? claims.preferred_username : '') ||
      ''
    );
  }, [account]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loadedFirst, setLoadedFirst] = useState('');
  const [loadedLast, setLoadedLast] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!account || !tenantId) return;
    setLoading(true);
    setErrMsg(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const p = await getProfile({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId,
      });
      const f = p?.user?.firstName ?? '';
      const l = p?.user?.lastName ?? '';
      setFirstName(f); setLastName(l);
      setLoadedFirst(f); setLoadedLast(l);
    } catch (e) {
      // A failed load is shown, never swallowed — an empty form that silently
      // failed to load is how a good record gets overwritten with blanks.
      setErrMsg((e as Error).message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [account, instance, tenantId]);

  useEffect(() => { load(); }, [load]);

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const changed = firstName !== loadedFirst || lastName !== loadedLast;

  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.length) return parts[0][0].toUpperCase();
    return email ? email[0].toUpperCase() : 'U';
  }, [displayName, email]);

  const handleSave = useCallback(async () => {
    if (!account || !tenantId) return;
    setSaving(true);
    setErrMsg(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const p = await updateProfile({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId,
        payload: { user: { firstName: firstName.trim(), lastName: lastName.trim() } },
      });
      // Re-seed from the server's response so what is shown is what was stored.
      const f = p?.user?.firstName ?? firstName.trim();
      const l = p?.user?.lastName ?? lastName.trim();
      setFirstName(f); setLastName(l);
      setLoadedFirst(f); setLoadedLast(l);
      setToast('Name saved');
    } catch (e) {
      setErrMsg('Save failed: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [account, instance, tenantId, firstName, lastName]);

  if (!tenantId) {
    return <div className="py-8 text-center text-sm text-gray-500">Select a business to edit your profile.</div>;
  }
  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading your profile…</div>;
  }

  const cls = 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black';

  return (
    <div className="space-y-6">
      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>
      )}

      <div className="flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
          {initials}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900">{displayName || 'No name set'}</div>
          <div className="text-xs text-gray-500">{email || 'No email on this account'}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ps-first" className="block text-sm font-medium text-gray-700">First name</label>
          <input id="ps-first" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={cls} placeholder="First name" />
        </div>
        <div>
          <label htmlFor="ps-last" className="block text-sm font-medium text-gray-700">Last name</label>
          <input id="ps-last" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={cls} placeholder="Last name" />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        This is the name shown on anything you send or approve inside the platform.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {email || '—'}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          This is the address you signed in with. It is managed by your sign-in provider, so it cannot be
          changed here — see the Sign-in tab.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !changed}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {!changed && !saving && <span className="text-xs text-gray-400">No unsaved changes</span>}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Sign-in                                                       */
/* ------------------------------------------------------------------ */

function SignInTab() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const email = account?.username || '';

  const signOut = useCallback(() => {
    void instance.logoutRedirect({ account: account ?? undefined });
  }, [instance, account]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">How you sign in</h3>
        <p className="mt-1 text-sm text-gray-600">
          Your account is held by our sign-in provider, not inside this app. That is why there is no password
          field here — we never store or see your password.
        </p>
      </div>

      <dl className="divide-y rounded-lg border">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-gray-600">Signed in as</dt>
          <dd className="text-sm font-medium text-gray-900">{email || '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-gray-600">Password &amp; two-factor</dt>
          <dd className="text-sm text-gray-900">Managed by your sign-in provider</dd>
        </div>
      </dl>

      <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900">Need to change your password?</p>
        <p className="mt-1">
          Sign out, then choose <span className="font-medium">Forgot password</span> on the sign-in screen. That
          sends a reset to the address above, and it is the only supported way to change it — nobody here,
          including us, can set it for you.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
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
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Personal Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Your name and how you sign in. Business-wide settings live under Settings.</p>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="rounded-lg border bg-white p-5">
        {activeTab === 'Profile' && <ProfileTab />}
        {activeTab === 'Sign-in' && <SignInTab />}
      </section>
    </div>
  );
}
