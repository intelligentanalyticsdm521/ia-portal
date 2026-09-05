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
 *
 * 2026-09-05 — Notifications comes BACK, this time real (Foundation A2).
 * The tab that was deleted held a push switch backed by
 * localStorage['iadm.personal.pushNotifications'] and nothing else. The one
 * below asks the browser for permission, registers /sw.js, subscribes with the
 * platform's VAPID key and stores the subscription in core.push_subscription —
 * and reads its own state back from that table, so a reload, a second laptop,
 * or a revoked browser permission all show the truth instead of a remembered
 * click.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useActiveAccount } from '../../auth/useAccessToken';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import {
  getProfile,
  updateProfile,
  getPushPublicKey,
  listPushSubscriptions,
  savePushSubscription,
  deletePushSubscription,
  type PushSubscriptionRow,
} from '../../lib/platformApi';
import {
  checkSupport,
  currentSubscription,
  isIosBrowserWithoutHomeScreen,
  permissionState,
  subscribe as browserSubscribe,
  unsubscribe as browserUnsubscribe,
  PushError,
} from '../../lib/push';
import { InstallPrompt } from '../../components/InstallPrompt';

const TABS = ['Profile', 'Notifications', 'Sign-in'] as const;
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
  // useAccessToken, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there is
  // no MSAL session and `accounts` is permanently empty, so a load gated on
  // accounts[0] never ran and this tab sat on "Loading your profile…" forever
  // in local dev. The hook hands back the dev stand-in (dev-tester@local.test)
  // and compiles down to accounts[0] in a production build.
  const { activeAccount: account, getToken } = useAccessToken();
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
      const r = await getToken();
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
  }, [account, getToken, tenantId]);

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
      const r = await getToken();
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
  }, [account, getToken, tenantId, firstName, lastName]);

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
/*  Tab: Notifications — real web push (Foundation A2)                 */
/* ------------------------------------------------------------------ */

/** A plain-English name for a browser, from its user-agent string. */
function describeDevice(userAgent: string | null): string {
  const ua = userAgent || '';
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

function NotificationsTab() {
  // useAccessToken, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there is
  // no MSAL session and `accounts` is permanently empty, so anything gated on
  // accounts[0] sits on "Loading…" forever in local dev.
  const { activeAccount: account, getToken } = useAccessToken();
  const { active } = useAppState();
  const tenantId = active?.tenant?.tenantId ?? null;

  const support = useMemo(() => checkSupport(), []);
  const iosNeedsHomeScreen = useMemo(() => isIosBrowserWithoutHomeScreen(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [rows, setRows] = useState<PushSubscriptionRow[]>([]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState(permissionState());

  const call = useCallback(async () => {
    if (!account || !tenantId) return null;
    const r = await getToken();
    return {
      baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
      bearerToken: r.accessToken,
      tenantId,
    };
  }, [account, getToken, tenantId]);

  /**
   * The toggle's state is the AND of two facts: this browser holds a
   * subscription, and the server knows about that exact endpoint. Either one
   * alone lies — see src/lib/push.ts.
   */
  const load = useCallback(async () => {
    if (!account || !tenantId) return;
    setLoading(true);
    setErrMsg(null);
    try {
      const p = await call();
      if (!p) return;
      const [key, list, sub] = await Promise.all([
        getPushPublicKey(p),
        listPushSubscriptions(p),
        support.supported ? currentSubscription() : Promise.resolve(null),
      ]);
      setPublicKey(key.publicKey);
      setConfigured(key.configured);
      setRows(list.subscriptions || []);
      setThisEndpoint(sub?.endpoint ?? null);
      setPermission(permissionState());
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not load your notification settings.');
    } finally {
      setLoading(false);
    }
  }, [account, tenantId, call, support.supported]);

  useEffect(() => { void load(); }, [load]);

  const thisDeviceRow = useMemo(
    () => (thisEndpoint ? rows.find((r) => r.endpoint === thisEndpoint) ?? null : null),
    [rows, thisEndpoint],
  );
  const enabled = Boolean(thisDeviceRow && !thisDeviceRow.disabledAt);
  const otherDevices = useMemo(
    () => rows.filter((r) => r.endpoint !== thisEndpoint),
    [rows, thisEndpoint],
  );

  const turnOn = useCallback(async () => {
    setBusy(true);
    setErrMsg(null);
    try {
      const p = await call();
      if (!p) return;
      const payload = await browserSubscribe(publicKey || '');
      try {
        await savePushSubscription({ ...p, subscription: payload });
      } catch (apiErr) {
        // The server did not take it, so this browser must not keep a
        // subscription nobody can send to — otherwise the toggle would read ON
        // off a browser fact the server has never heard of.
        await browserUnsubscribe();
        throw apiErr;
      }
      setToast('Alerts are on for this device');
      await load();
    } catch (e) {
      setPermission(permissionState());
      if (e instanceof PushError && e.kind === 'permission-denied') {
        setErrMsg('Your browser blocked notifications for this site, so alerts stay off.');
      } else {
        setErrMsg((e as Error).message || 'Could not turn on alerts.');
      }
    } finally {
      setBusy(false);
    }
  }, [call, publicKey, load]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setErrMsg(null);
    try {
      const p = await call();
      if (!p) return;
      // Capture the endpoint before unsubscribing — it is unreachable after.
      const endpoint = (await browserUnsubscribe()) || thisDeviceRow?.endpoint || null;
      if (endpoint) await deletePushSubscription({ ...p, endpoint });
      setToast('Alerts are off for this device');
      await load();
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not turn off alerts.');
    } finally {
      setBusy(false);
    }
  }, [call, load, thisDeviceRow]);

  const removeDevice = useCallback(async (endpoint: string) => {
    setBusy(true);
    setErrMsg(null);
    try {
      const p = await call();
      if (!p) return;
      await deletePushSubscription({ ...p, endpoint });
      setToast('Device removed');
      await load();
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not remove that device.');
    } finally {
      setBusy(false);
    }
  }, [call, load]);

  if (!tenantId) {
    return <div className="py-8 text-center text-sm text-gray-500">Select a business to manage alerts.</div>;
  }
  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading your notification settings…</div>;
  }

  const blocked = permission === 'denied';
  const canToggle = support.supported && configured && !blocked && !busy;

  const unsupportedReason =
    support.supported
      ? null
      : support.reason === 'insecure'
        ? 'Alerts need a secure (https) connection.'
        : 'This browser cannot receive alerts.';

  return (
    <div className="space-y-6">
      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Alerts</h3>
        <p className="mt-1 text-sm text-gray-600">
          We can pop a notification on this device when something happens in your business — a new
          enquiry, or a lead search finishing. Nothing else is sent here.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div>
          <div className="text-sm font-medium text-gray-900">Get alerts on this device</div>
          <div className="mt-1 text-xs text-gray-500">
            {enabled
              ? 'On. Turning this off only affects this device.'
              : 'Off. Your browser will ask for permission the first time you turn this on.'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Get alerts on this device"
          disabled={!canToggle}
          onClick={() => (enabled ? void turnOff() : void turnOn())}
          /* PHONE PASS 2026-09-06: the switch stays 24px tall because that is
             what a switch looks like; the ::after gives it a 40px TAP target
             (-8px above, -8px below) so a thumb on a 375px screen hits it.
             Nothing visual changes — the pseudo-element has no background. */
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 after:absolute after:-top-2 after:-bottom-2 after:left-0 after:right-0 after:content-[''] ${
            enabled ? 'bg-black' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Ops scope P5. This was an iPhone-only paragraph of advice with no
          button: right about Apple, silent on Android where one tap installs
          the app, and offering nothing to press on either. InstallPrompt is
          the same wording plus the button, and it hides itself once the Portal
          IS installed — which is the state that makes iPhone push work, so
          leaving the note up afterwards would be telling somebody to do a
          thing they have already done.

          `iosNeedsHomeScreen` still gates the REASON line: Apple's
          Home-Screen requirement is an iPhone fact and saying it on a desktop
          would be wrong. The prompt itself decides its own visibility. */}
      <InstallPrompt
        reason={
          iosNeedsHomeScreen
            ? 'On iPhone and iPad, Apple only sends alerts to apps on the Home Screen. Add the Portal, open it from that icon, and turn the switch on there.'
            : 'Open the Portal like an app, and get alerts without keeping a tab open.'
        }
      />

      {blocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">This browser is blocking notifications for the Portal.</p>
          <p className="mt-1">
            We cannot turn them back on from here — the block lives in your browser. Click the padlock (or
            the icon beside the web address), set Notifications to <span className="font-medium">Allow</span>,
            then reload this page.
          </p>
        </div>
      )}

      {unsupportedReason && (
        <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">{unsupportedReason}</div>
      )}

      {support.supported && !configured && (
        <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
          Alerts are not switched on for this environment yet. Nothing is wrong with your account.
        </div>
      )}

      {otherDevices.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Your other devices</h4>
          <p className="mt-1 text-xs text-gray-500">
            Each device is separate. Removing one here stops alerts on it.
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {otherDevices.map((d) => (
              <li key={d.subscriptionId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-sm text-gray-900">{describeDevice(d.userAgent)}</div>
                  <div className="text-xs text-gray-500">
                    Added {new Date(d.createdAt).toLocaleDateString()}
                    {d.disabledAt ? ' · not responding' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeDevice(d.endpoint)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Alerts are per device and per browser, so signing in somewhere else does not carry them across.
        Emails are separate and are not affected by this switch.
      </p>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Sign-in                                                       */
/* ------------------------------------------------------------------ */

function SignInTab() {
  const { instance } = useMsal();
  // useActiveAccount, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there is
  // no MSAL session, so this tab showed a blank email address and a Sign out
  // button with no account behind it.
  const account = useActiveAccount();
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
        <p className="mt-1 text-sm text-gray-500">Your name, your alerts, and how you sign in. Business-wide settings live under Settings.</p>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-md px-4 py-2 max-md:min-h-[40px] text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="rounded-lg border bg-white p-5">
        {activeTab === 'Profile' && <ProfileTab />}
        {activeTab === 'Notifications' && <NotificationsTab />}
        {activeTab === 'Sign-in' && <SignInTab />}
      </section>
    </div>
  );
}
