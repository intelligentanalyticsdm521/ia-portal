import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { connectGoogle, getGoogleProperties, selectGoogleProperties, listArionSites, listGbpLocations, selectGbpLocation, disconnectGbp } from '../../lib/arionApi';
import { useOliverApi } from '../../hooks/useOliverApi';
import { LogoPicker } from '../../components/oliver/LogoPicker';
import { formatPhone } from '../../lib/formatPhone';

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

interface OrgProfile {
  tenantFullName?: string;
  /** Optional shorthand used on customer-facing surfaces (booking pages,
   *  email From display name, customer portal). Falls back to
   *  tenantFullName when blank. */
  preferredBusinessName?: string;
  /** Tenant URL slug — drives subdomains on *.book.ia-dm.com,
   *  *.customer.ia-dm.com, *.crew.ia-dm.com. 1-63 chars, a-z 0-9 hyphens. */
  slug?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  brandColorAccent?: string | null;
  billingEmail?: string | null;
  supportEmail?: string | null;
}

// Canonical shared business profile (core.tenants) — the single record reused
// by OLIVER invoices/quotes/portal, ARION, SPARK, STELLA. Read/write via the
// shared /settings API (served by oliver-api, which owns core.tenants R/W).
//
// Exported so per-route page wrappers in pages/settings/SettingsRoutes.tsx
// can render this single tab standalone (Phase 1A — hamburger menu = one
// route per setting). The original tabbed TenantSettings page still works
// at /app/settings for back-compat + deep links.
export function OrganizationTab() {
  const { get, post, patch, ready } = useOliverApi();
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [draft, setDraft] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErrMsg(null);
    try {
      const s = await get<OrgProfile>('/settings');
      setProfile(s); setDraft(s);
    } catch (e) {
      setErrMsg((e as Error).message || 'Failed to load your business profile');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const set = (p: Partial<OrgProfile>) => setDraft((d) => d ? { ...d, ...p } : d);
  const changed = !!profile && !!draft && JSON.stringify(profile) !== JSON.stringify(draft);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true); setErrMsg(null);
    try {
      const updated = await patch<OrgProfile>('/settings', {
        tenantFullName: draft.tenantFullName ?? '',
        preferredBusinessName: draft.preferredBusinessName ?? '',
        slug: draft.slug ?? '',
        website: draft.website ?? '',
        email: draft.email ?? '',
        phone: draft.phone ?? '',
        address: draft.address ?? '',
        logoUrl: draft.logoUrl ?? '',
        brandColor: draft.brandColor ?? '',
        brandColorSecondary: draft.brandColorSecondary ?? '',
        brandColorAccent: draft.brandColorAccent ?? '',
        billingEmail: draft.billingEmail ?? '',
        supportEmail: draft.supportEmail ?? '',
      });
      setProfile(updated); setDraft(updated);
      setToast('Business profile saved — shared across all products');
    } catch (e) {
      setErrMsg(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [draft, patch]);

  if (loading || !draft) {
    return <div className="py-10 text-center text-sm text-gray-500">{errMsg || 'Loading business profile…'}</div>;
  }

  const cls = 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black';

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        This profile is shared everywhere — OLIVER invoices/quotes/portal, ARION, SPARK. Set it once here.
      </p>

      {errMsg && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Business name <span className="text-red-500">*</span>
          </label>
          <input type="text" value={draft.tenantFullName || ''} onChange={(e) => set({ tenantFullName: e.target.value })} className={cls} placeholder="Acme Corp" />
          <p className="mt-1 text-xs text-gray-500">Your full legal/registered name. Used on invoices, Stripe, and contracts.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Preferred business name <span className="text-gray-400">(optional)</span>
          </label>
          <input type="text" value={draft.preferredBusinessName || ''} onChange={(e) => set({ preferredBusinessName: e.target.value })} className={cls} placeholder="e.g. Acme" />
          <p className="mt-1 text-xs text-gray-500">Shorter brand name shown on booking pages, customer portal, and emails. Defaults to your full business name.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Website</label>
          <input type="url" value={draft.website || ''} onChange={(e) => set({ website: e.target.value })} className={cls} placeholder="https://example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contact email</label>
          <input type="email" value={draft.email || ''} onChange={(e) => set({ email: e.target.value })} className={cls} placeholder="hello@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input type="tel" value={draft.phone || ''} onChange={(e) => set({ phone: formatPhone(e.target.value) })} className={cls} placeholder="+1 (555) 555-5555" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Billing email <span className="text-gray-400">(optional)</span></label>
          <input type="email" value={draft.billingEmail || ''} onChange={(e) => set({ billingEmail: e.target.value })} className={cls} placeholder="Defaults to contact email" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Support email <span className="text-gray-400">(optional)</span></label>
          <input type="email" value={draft.supportEmail || ''} onChange={(e) => set({ supportEmail: e.target.value })} className={cls} placeholder="Defaults to contact email" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Address</label>
        <textarea rows={2} value={draft.address || ''} onChange={(e) => set({ address: e.target.value })} className={cls} placeholder="123 Main St, Springfield IL 62701" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo</label>
        <LogoPicker value={draft.logoUrl ?? null} onChange={(u) => set({ logoUrl: u })} api={{ get, post }} website={draft.website} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Brand Colors</label>
        <p className="mt-0.5 text-xs text-gray-500">Used across invoices, quotes, portals, and other products. Primary &amp; secondary always apply; accent is optional (portal highlights).</p>
        <div className="mt-2 space-y-2">
          {([
            ['Primary', 'brandColor', '#1A3A4A', false],
            ['Secondary', 'brandColorSecondary', '#FEC82C', false],
            ['Accent', 'brandColorAccent', '#1A7DB5', true],
          ] as [string, 'brandColor' | 'brandColorSecondary' | 'brandColorAccent', string, boolean][]).map(([label, key, fb, opt]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-24 text-sm text-gray-700">{label}{opt && <span className="text-gray-400"> (opt)</span>}</span>
              <input type="color" value={draft[key] || fb} onChange={(e) => set({ [key]: e.target.value } as Partial<OrgProfile>)} className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
              <input type="text" value={draft[key] || ''} onChange={(e) => set({ [key]: e.target.value } as Partial<OrgProfile>)} className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono" placeholder={fb} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <button type="button" onClick={handleSave} disabled={saving || !changed}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save business profile'}
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

export function SubscriptionBillingTab() {
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

export function TeamTab() {
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

interface GooglePropertyModalProps {
  ga4Properties: Array<{ propertyId: string; displayName: string; account: string }>;
  gscSites: Array<{ siteUrl: string; permissionLevel: string }>;
  currentGa4PropertyId: string | null;
  loading: boolean;
  onSelect: (ga4PropertyId: string, gscSiteUrl: string) => void;
  onClose: () => void;
}

function GooglePropertyModal({ ga4Properties, gscSites, currentGa4PropertyId, loading, onSelect, onClose }: GooglePropertyModalProps) {
  const [selectedGa4, setSelectedGa4] = useState(currentGa4PropertyId || '');
  const [selectedGsc, setSelectedGsc] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
        <h3 className="text-lg font-semibold text-gray-900">Select Google Properties</h3>
        <p className="mt-1 text-sm text-gray-500">Choose which GA4 property and Search Console site to connect.</p>

        <div className="mt-4 space-y-4">
          {/* GA4 Property */}
          <div>
            <label htmlFor="ga4-select" className="block text-sm font-medium text-gray-700">GA4 Property</label>
            {ga4Properties.length === 0 ? (
              <p className="mt-1 text-sm text-gray-400">No GA4 properties found for this Google account.</p>
            ) : (
              <select
                id="ga4-select"
                value={selectedGa4}
                onChange={(e) => setSelectedGa4(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              >
                <option value="">-- Select a property --</option>
                {ga4Properties.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.displayName} ({p.account}) - {p.propertyId}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* GSC Site */}
          <div>
            <label htmlFor="gsc-select" className="block text-sm font-medium text-gray-700">Search Console Site</label>
            {gscSites.length === 0 ? (
              <p className="mt-1 text-sm text-gray-400">No Search Console sites found for this Google account.</p>
            ) : (
              <select
                id="gsc-select"
                value={selectedGsc}
                onChange={(e) => setSelectedGsc(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              >
                <option value="">-- Select a site --</option>
                {gscSites.map((s) => (
                  <option key={s.siteUrl} value={s.siteUrl}>
                    {s.siteUrl} ({s.permissionLevel})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || (!selectedGa4 && !selectedGsc)}
            onClick={() => onSelect(selectedGa4, selectedGsc)}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save selections'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConnectedAccountsTab() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;

  const [toast, setToast] = useState('');
  const [gaConnecting, setGaConnecting] = useState(false);
  const [gaConnected, setGaConnected] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);

  // Property selector modal state
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [propertyModalLoading, setPropertyModalLoading] = useState(false);
  const [ga4Properties, setGa4Properties] = useState<Array<{ propertyId: string; displayName: string; account: string }>>([]);
  const [gscSites, setGscSites] = useState<Array<{ siteUrl: string; permissionLevel: string }>>([]);
  const [currentGa4PropertyId, setCurrentGa4PropertyId] = useState<string | null>(null);

  // Load the first ARION site on mount so we have a siteId for API calls
  const siteLoadedRef = useRef(false);
  useEffect(() => {
    if (siteLoadedRef.current || !activeTenantId || !apiBaseUrl) return;
    siteLoadedRef.current = true;
    (async () => {
      try {
        const token = await getToken();
        const resp = await listArionSites({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId });
        const first = resp.sites?.[0];
        if (first) {
          setSiteId(first.siteId);
        }
      } catch (e) {
        console.warn('[ConnectedAccounts] Failed to load sites:', e);
      }
    })();
  }, [activeTenantId, apiBaseUrl, getToken]);

  // Once we have a siteId, probe Google connection state in the background. If the site
  // already has an OAuth token, getGoogleProperties() returns a currentGa4PropertyId (or at
  // least a non-error response), so we can reflect real "Connected" status in the UI
  // rather than always showing "Not connected".
  const probedRef = useRef(false);
  useEffect(() => {
    if (probedRef.current || !siteId || !activeTenantId || !apiBaseUrl) return;
    probedRef.current = true;
    (async () => {
      try {
        const token = await getToken();
        const resp = await getGoogleProperties({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
        const hasProperty = !!resp?.data?.currentGa4PropertyId;
        const hasGscSites = Array.isArray(resp?.data?.gscSites) && resp.data.gscSites.length > 0;
        if (hasProperty || hasGscSites) setGaConnected(true);
      } catch {
        // Endpoint returns an error when Google isn't connected — that's the normal "not connected" path.
      }
    })();
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  // Detect OAuth return: if google_connected=1 is in the URL, show property selector
  useEffect(() => {
    if (searchParams.get('google_connected') === '1' && siteId) {
      // Clear the param from the URL
      const next = new URLSearchParams(searchParams);
      next.delete('google_connected');
      setSearchParams(next, { replace: true });
      // Open property selector
      openPropertySelector();
    }
  }, [searchParams, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPropertySelector = useCallback(async () => {
    if (!siteId || !activeTenantId || !apiBaseUrl) return;
    setPropertyModalLoading(true);
    setShowPropertyModal(true);
    try {
      const token = await getToken();
      const resp = await getGoogleProperties({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      setGa4Properties(resp.data.ga4Properties || []);
      setGscSites(resp.data.gscSites || []);
      setCurrentGa4PropertyId(resp.data.currentGa4PropertyId || null);
      if (resp.data.currentGa4PropertyId) setGaConnected(true);
    } catch (e: any) {
      console.error('[ConnectedAccounts] Failed to load Google properties:', e);
      setToast(e.message || 'Failed to load Google properties');
      setShowPropertyModal(false);
    } finally {
      setPropertyModalLoading(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handleGoogleConnect = useCallback(async () => {
    if (!siteId || !activeTenantId || !apiBaseUrl) {
      setToast('No ARION site found. Create a site first.');
      return;
    }
    setGaConnecting(true);
    try {
      const token = await getToken();
      const returnUrl = window.location.origin + window.location.pathname + '?google_connected=1';
      const resp = await connectGoogle({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId, setupMode: 'ARION_AUTO_SETUP', returnUrl });
      if (resp.authUrl) {
        window.location.href = resp.authUrl;
      }
    } catch (e: any) {
      console.error('[ConnectedAccounts] Google connect failed:', e);
      setToast(e.message || 'Failed to start Google connection');
      setGaConnecting(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handlePropertySelect = useCallback(async (ga4PropertyId: string, gscSiteUrl: string) => {
    if (!siteId || !activeTenantId || !apiBaseUrl) return;
    setPropertyModalLoading(true);
    try {
      const token = await getToken();
      await selectGoogleProperties({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId, ga4PropertyId, gscSiteUrl });
      setGaConnected(true);
      setShowPropertyModal(false);
      setToast('Google properties saved successfully');
    } catch (e: any) {
      console.error('[ConnectedAccounts] Failed to save property selection:', e);
      setToast(e.message || 'Failed to save property selection');
    } finally {
      setPropertyModalLoading(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  // Bing Webmaster Tools — Phase 2: one-click auto-connect via master account.
  const [bingStatus, setBingStatus] = useState<any>(null);
  const [bingAutoConnecting, setBingAutoConnecting] = useState(false);
  const [bingAutoResult, setBingAutoResult] = useState<any>(null);
  // Advanced path: client can still paste their own API key if they'd rather use their own account
  const [bingAdvancedOpen, setBingAdvancedOpen] = useState(false);
  const [bingKeyInput, setBingKeyInput] = useState('');
  const [bingVerifying, setBingVerifying] = useState(false);
  const [bingResult, setBingResult] = useState<any>(null);
  const bingLoadedRef = useRef(false);
  useEffect(() => {
    if (bingLoadedRef.current || !siteId || !activeTenantId || !apiBaseUrl) return;
    bingLoadedRef.current = true;
    (async () => {
      try {
        const token = await getToken();
        const { getBingStatus } = await import('../../lib/arionApi');
        const s = await getBingStatus({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
        setBingStatus(s);
      } catch { /* ignore */ }
    })();
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handleBingAutoConnect = useCallback(async () => {
    if (!siteId || !activeTenantId || !apiBaseUrl) return;
    setBingAutoConnecting(true);
    setBingAutoResult(null);
    try {
      const token = await getToken();
      const { autoConnectBing, checkBingVerification, getBingStatus } = await import('../../lib/arionApi');
      // Phase 1: kick off — fast, writes DNS, returns immediately
      const kickoff = await autoConnectBing({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      setBingAutoResult(kickoff);
      // Short-circuit if already verified
      if (kickoff.connected) {
        const s = await getBingStatus({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
        setBingStatus(s);
        setToast('Bing Webmaster Tools connected');
        return;
      }
      // Bail on non-pending failure
      if (!kickoff.pending) return;

      // Phase 2: poll check-verification every 8 s for up to 3 min. Each call is fast
      // (one Bing API roundtrip) so the portal timeout is not an issue.
      const deadline = Date.now() + 3 * 60 * 1000;
      let pollAttempts = 0;
      while (Date.now() < deadline) {
        pollAttempts += 1;
        await new Promise(r => setTimeout(r, 8000));
        try {
          const token2 = await getToken();
          const check = await checkBingVerification({ baseUrl: apiBaseUrl, bearerToken: token2.accessToken, tenantId: activeTenantId, siteId });
          if (check.connected) {
            const s = await getBingStatus({ baseUrl: apiBaseUrl, bearerToken: token2.accessToken, tenantId: activeTenantId, siteId });
            setBingStatus(s);
            setBingAutoResult({ ...kickoff, connected: true, pending: false });
            setToast('Bing Webmaster Tools connected');
            return;
          }
        } catch (e: any) {
          // One failed poll isn't fatal — keep trying until the deadline
          console.warn('[bing:poll]', pollAttempts, e?.message);
        }
      }
      // Hit the deadline without verification
      setBingAutoResult({
        ...kickoff,
        connected: false,
        stage: 'verify_timeout',
        error: 'DNS record is in place but Bing has not verified yet. This sometimes takes up to 15 minutes. Check back soon and click Connect again — the key is already written, so it should complete quickly.',
      });
    } catch (e: any) {
      setBingAutoResult({ connected: false, error: e.message || 'Auto-connect failed' });
    } finally {
      setBingAutoConnecting(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handleBingVerify = useCallback(async () => {
    if (!siteId || !activeTenantId || !apiBaseUrl) return;
    const trimmed = bingKeyInput.trim();
    if (!trimmed) return;
    setBingVerifying(true);
    setBingResult(null);
    try {
      const token = await getToken();
      const { verifyBingKey, getBingStatus } = await import('../../lib/arionApi');
      const r = await verifyBingKey({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId, apiKey: trimmed });
      setBingResult(r);
      if (r.verified) {
        setBingKeyInput('');
        setBingAdvancedOpen(false);
        const s = await getBingStatus({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
        setBingStatus(s);
        setToast('Bing Webmaster Tools connected' + (r.warning ? ' — with warnings' : ''));
      }
    } catch (e: any) {
      setBingResult({ verified: false, error: e.message || 'Verification failed' });
    } finally {
      setBingVerifying(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken, bingKeyInput]);

  const handleBingDisconnect = useCallback(async () => {
    if (!siteId || !activeTenantId || !apiBaseUrl) return;
    if (!confirm('Disconnect Bing Webmaster Tools? Your stored API key will be removed from ARION.')) return;
    try {
      const token = await getToken();
      const { disconnectBing, getBingStatus } = await import('../../lib/arionApi');
      await disconnectBing({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      const s = await getBingStatus({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      setBingStatus(s);
      setToast('Bing disconnected');
    } catch (e: any) {
      setToast(e.message || 'Disconnect failed');
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const bingConnected = !!bingStatus?.connected;

  // GSC and GBP share the same Google OAuth token as Google Analytics, so their
  // connection state follows gaConnected and their Connect/Reconnect buttons trigger
  // the same Google OAuth flow (which now requests the expanded `webmasters` write scope).
  // Bing Webmaster has its own per-site API-key flow (inline panel below).
  type Integration = { key: string; name: string; connected: boolean; sharesGoogleAuth: boolean; comingSoon: boolean };
  const OTHER_INTEGRATIONS: Integration[] = [
    { key: 'gsc', name: 'Google Search Console', connected: gaConnected, sharesGoogleAuth: true, comingSoon: false },
    { key: 'abc', name: 'Apple Business Connect', connected: false, sharesGoogleAuth: false, comingSoon: true },
  ];

  return (
    <div className="space-y-6">
      <SectionLabel title="Third-party integrations" description="Connect your external accounts to enable data syncing." />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Google Analytics card -- functional */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Google Analytics</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${gaConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-500">{gaConnected ? 'Connected' : 'Not connected'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {gaConnected && (
                <button
                  type="button"
                  onClick={openPropertySelector}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Change property
                </button>
              )}
              <button
                type="button"
                disabled={gaConnecting || !siteId}
                onClick={handleGoogleConnect}
                title={gaConnected ? 'Run Google OAuth again to refresh scopes or switch accounts' : 'Start Google OAuth'}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {gaConnecting ? 'Connecting...' : gaConnected ? 'Reconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </div>

        {/* Bing Webmaster Tools — one-click auto-connect via master Bing account.
            Behind the scenes: adds the site under our master Bing account, writes a
            verification CNAME via Hostinger DNS, polls Bing until verified. Client
            sees only a Connect button. */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Bing Webmaster Tools</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${bingConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-500">{bingConnected ? 'Connected' : 'Not connected'}</span>
              </div>
              {bingConnected && bingStatus?.siteUrl && (
                <div className="mt-1 text-[10px] text-gray-400">{bingStatus.siteUrl}</div>
              )}
            </div>
            {bingConnected ? (
              <button type="button" onClick={handleBingDisconnect} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBingAutoConnect}
                disabled={bingAutoConnecting || !siteId}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {bingAutoConnecting ? 'Connecting — verifying ownership...' : 'Connect'}
              </button>
            )}
          </div>

          {bingAutoConnecting && (
            <div className="mt-3 rounded border-l-2 border-blue-400 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              Adding your site to Bing · writing DNS verification · checking every 8 seconds for Bing to confirm. This typically takes 30-90 seconds but can take up to 3 minutes.
            </div>
          )}

          {bingAutoResult && !bingAutoResult.connected && !bingAutoConnecting && (
            <div className="mt-3 rounded border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              {bingAutoResult.stage === 'verify_timeout'
                ? bingAutoResult.error
                : bingAutoResult.stage === 'dns_write'
                ? `Couldn't write the DNS record automatically (${bingAutoResult.error || 'unknown error'}). Click Connect again in a few minutes, or use the advanced option below to paste your own Bing API key.`
                : (bingAutoResult.error || 'Auto-connect failed. Try again or use the advanced option below.')}
            </div>
          )}

          {!bingConnected && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setBingAdvancedOpen(v => !v)}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                {bingAdvancedOpen ? '▾ Hide advanced' : '▸ Advanced — use my own Bing account'}
              </button>
              {bingAdvancedOpen && (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-900">Paste your Bing Webmaster API key</div>
                  <ol className="mt-2 ml-4 list-decimal text-[11px] text-gray-600 space-y-0.5">
                    <li>Open <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">bing.com/webmasters</a> and sign in</li>
                    <li>Your site → Settings → API Access → API Key → Copy</li>
                  </ol>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Bing API key"
                      value={bingKeyInput}
                      onChange={e => setBingKeyInput(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleBingVerify}
                      disabled={bingVerifying || !bingKeyInput.trim()}
                      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {bingVerifying ? 'Verifying...' : 'Verify & Connect'}
                    </button>
                  </div>
                  {bingResult && !bingResult.verified && (
                    <div className="mt-2 rounded border-l-2 border-red-400 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                      {bingResult.error === 'invalid_key' ? 'Bing rejected this key as invalid.' : (bingResult.error || 'Verification failed')}
                    </div>
                  )}
                  {bingResult?.verified && bingResult.warning && (
                    <div className="mt-2 rounded border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      {bingResult.warning}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Other integration cards */}
        {OTHER_INTEGRATIONS.map((int) => (
          <div key={int.key} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">{int.name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${int.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-xs text-gray-500">{int.connected ? 'Connected' : int.comingSoon ? 'Coming soon' : 'Not connected'}</span>
                </div>
                {int.sharesGoogleAuth && (
                  <div className="mt-1 text-[10px] text-gray-400">Uses the same Google connection as Analytics</div>
                )}
              </div>
              {int.sharesGoogleAuth ? (
                <button
                  type="button"
                  disabled={gaConnecting || !siteId}
                  onClick={handleGoogleConnect}
                  title={int.connected ? 'Re-run Google OAuth to refresh scopes' : 'Start Google OAuth'}
                  className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {gaConnecting ? 'Connecting...' : int.connected ? 'Reconnect' : 'Connect'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setToast('Coming soon')}
                  className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Google Business Profile — has its own location picker for security.
            Separate from the shared-Google-OAuth flow because each tenant must
            explicitly choose WHICH GBP listing belongs to this site. */}
        <GbpIntegrationCard
          siteId={siteId}
          gaConnected={gaConnected}
          gaConnecting={gaConnecting}
          onConnectGoogle={handleGoogleConnect}
        />

        {/* OLIVER payment + lead-intake connections — moved here from the
            deprecated "Business Setup" page so every connection lives in one
            place. */}
        <OliverStripeConnectCard />
        <OliverLeadIntakeCard />
      </div>

      {/* Google property selector modal */}
      {showPropertyModal && (
        <GooglePropertyModal
          ga4Properties={ga4Properties}
          gscSites={gscSites}
          currentGa4PropertyId={currentGa4PropertyId}
          loading={propertyModalLoading}
          onSelect={handlePropertySelect}
          onClose={() => setShowPropertyModal(false)}
        />
      )}

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

/* ------------------------------------------------------------------ */
/*  GBP Integration Card — explicit location picker (security fix)     */
/* ------------------------------------------------------------------ */

function GbpIntegrationCard({ siteId, gaConnected, gaConnecting, onConnectGoogle }: {
  siteId: string | null;
  gaConnected: boolean;
  gaConnecting: boolean;
  onConnectGoogle: () => void;
}) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [currentlySelected, setCurrentlySelected] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  const openPicker = useCallback(async () => {
    if (!siteId || !activeTenantId) return;
    setPickerOpen(true);
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await listGbpLocations({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      setLocations(res.data.locations || []);
      setCurrentlySelected(res.data.currently_selected);
      setSuggestion(res.data.suggestion);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handleSelect = useCallback(async (locationName: string) => {
    if (!siteId || !activeTenantId) return;
    setSaving(locationName);
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await selectGbpLocation({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId, locationName });
      setCurrentlySelected(locationName);
      setSavedTitle(res.data.title);
      setTimeout(() => { setPickerOpen(false); setSavedTitle(null); }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save location');
    } finally {
      setSaving(null);
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  const handleDisconnect = useCallback(async () => {
    if (!siteId || !activeTenantId) return;
    if (!confirm('Disconnect Google Business Profile? You will need to reconnect via Google OAuth to use GBP again.')) return;
    try {
      const token = await getToken();
      await disconnectGbp({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId });
      setCurrentlySelected(null);
      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to disconnect');
    }
  }, [siteId, activeTenantId, apiBaseUrl, getToken]);

  return (
    <>
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Google Business Profile</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${gaConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">{gaConnected ? 'Connected' : 'Not connected'}</span>
            </div>
            <div className="mt-1 text-[10px] text-gray-400">Uses the same Google connection as Analytics</div>
            {gaConnected && (
              <div className="mt-1 text-[10px] text-blue-600">⚠ Each site must explicitly select its GBP location</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {gaConnected && (
              <button
                type="button"
                onClick={openPicker}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Select Business
              </button>
            )}
            <button
              type="button"
              disabled={gaConnecting || !siteId}
              onClick={onConnectGoogle}
              title={gaConnected ? 'Re-run Google OAuth (use a different account if needed)' : 'Start Google OAuth'}
              className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {gaConnecting ? 'Connecting...' : gaConnected ? 'Reconnect' : 'Connect'}
            </button>
            {gaConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[10px] text-red-600 hover:underline"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-[94vw] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b">
              <div className="text-xs uppercase text-gray-500 tracking-wide">Google Business Profile</div>
              <div className="text-base font-bold text-gray-900 mt-0.5">Select the business for this site</div>
              <div className="text-xs text-gray-500 mt-1">Pick the GBP listing that represents this website. ARION will only show data for the listing you select.</div>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {loading ? (
                <div className="text-sm text-gray-500 py-4 text-center">Loading your GBP listings...</div>
              ) : errorMsg ? (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-800 text-sm p-3 rounded">{errorMsg}</div>
              ) : locations.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">No GBP listings found on this Google account. If you manage your business on a different account, click Reconnect with that account.</div>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc) => {
                    const isCurrent = currentlySelected === loc.location_name;
                    const isSuggested = suggestion === loc.location_name;
                    const isSaving = saving === loc.location_name;
                    return (
                      <div key={loc.location_name} className={`rounded-lg border p-3 ${isCurrent ? 'border-green-500 bg-green-50' : isSuggested ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{loc.title}</span>
                              {isSuggested && !isCurrent && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">Suggested (domain match)</span>}
                              {isCurrent && <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded">✓ Currently selected</span>}
                            </div>
                            {loc.address && <div className="text-xs text-gray-600 mt-0.5">{loc.address}</div>}
                            {loc.website_uri && <div className="text-xs text-gray-500 mt-0.5">{loc.website_uri}</div>}
                            {loc.category && <div className="text-[10px] text-gray-500 mt-0.5">{loc.category}</div>}
                          </div>
                          <button
                            type="button"
                            disabled={isSaving || isCurrent}
                            onClick={() => handleSelect(loc.location_name)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${isCurrent ? 'bg-gray-200 text-gray-500 cursor-default' : 'bg-black text-white hover:bg-gray-800'} disabled:opacity-50`}
                          >
                            {isSaving ? 'Saving...' : isCurrent ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {savedTitle && (
                <div className="mt-3 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm p-3 rounded">
                  ✓ Saved. Now showing data for "{savedTitle}".
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center">
              <div className="text-[10px] text-gray-500">
                Don't see your business? Click Reconnect to switch Google accounts.
              </div>
              <button onClick={() => setPickerOpen(false)} className="text-sm text-gray-600 hover:underline">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  OLIVER connections — Stripe Connect + Lead Intake                   */
/* ------------------------------------------------------------------ */

function OliverStripeConnectCard() {
  const { get, post, ready } = useOliverApi();
  const [st, setSt] = useState<{ connected: boolean; type?: string; stripeAccountId?: string; chargesEnabled?: boolean; payoutsEnabled?: boolean; readyToCharge?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSt(await get<NonNullable<typeof st>>('/settings/stripe')); }
    catch { setSt({ connected: false }); }
  }, [get]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function connect() {
    setBusy(true); setErr(null);
    try {
      const r = await post<{ onboardingUrl: string }>('/settings/stripe/connect');
      if (r?.onboardingUrl) window.location.href = r.onboardingUrl;
      else setErr('No onboarding link returned. Try again shortly.');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const connected = !!st?.connected;
  const ready2 = !!st?.readyToCharge;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Stripe (Payments)</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ready2 ? 'bg-green-500' : connected ? 'bg-amber-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              {ready2 ? 'Connected — ready to charge' : connected ? 'Connected — finish onboarding' : 'Not connected'}
            </span>
          </div>
          {connected && st?.stripeAccountId && (
            <div className="mt-1 text-[10px] text-gray-400">{st.type === 'express' ? 'Express' : 'Standard'} · {st.stripeAccountId}</div>
          )}
        </div>
        <button type="button" onClick={connect} disabled={busy}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {busy ? 'Opening…' : ready2 ? 'Manage' : connected ? 'Continue setup' : 'Connect'}
        </button>
      </div>
      {err && <div className="mt-2 rounded border-l-2 border-red-400 bg-red-50 px-3 py-2 text-[11px] text-red-700">{err}</div>}
    </div>
  );
}

interface LeadIntake { intake_key: string; post_url: string; header_name: string }

function OliverLeadIntakeCard() {
  const { get, post, ready } = useOliverApi();
  const [data, setData] = useState<LeadIntake | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await get<LeadIntake>('/settings/lead-intake')); setShown(true); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }, [get]);

  async function rotate() {
    if (!confirm('Rotate the lead intake key? Existing integrations must be updated.')) return;
    setBusy(true);
    try { setData(await post<LeadIntake>('/settings/lead-intake/rotate')); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Lead Intake (forms / Zapier)</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${data ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{data ? 'Endpoint active' : 'Reveal endpoint'}</span>
          </div>
          <div className="mt-1 text-[10px] text-gray-400">External form submissions create OLIVER service requests.</div>
        </div>
        {!shown ? (
          <button type="button" onClick={load} disabled={busy}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {busy ? 'Loading…' : 'Show'}
          </button>
        ) : (
          <button type="button" onClick={rotate} disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy ? '…' : 'Rotate key'}
          </button>
        )}
      </div>
      {data && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">POST URL</div>
            <input readOnly value={data.post_url} onClick={(e) => (e.target as HTMLInputElement).select()}
              className="mt-0.5 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{data.header_name}</div>
            <input readOnly value={data.intake_key} onClick={(e) => (e.target as HTMLInputElement).select()}
              className="mt-0.5 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
}

const NOTIF_RULES: NotifRule[] = [
  { key: 'ssl', label: 'SSL Expiry' },
  { key: 'perf', label: 'Performance Drop' },
  { key: 'review', label: 'New Review' },
  { key: 'rankings', label: 'Weekly Rankings' },
  { key: 'security', label: 'Security Scan' },
];

export function NotificationRulesTab() {
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

export function SecurityComplianceTab() {
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

export function DataPrivacyTab() {
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
  // Allow deep-linking to a specific tab via ?tab=Connected%20Accounts etc.
  const [urlParams] = useSearchParams();
  const tabFromUrl = urlParams.get('tab');
  const isValidTab = (t: string | null): t is Tab => !!t && (TABS as readonly string[]).includes(t);
  const [activeTab, setActiveTab] = useState<Tab>(isValidTab(tabFromUrl) ? tabFromUrl : 'Organization');

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
