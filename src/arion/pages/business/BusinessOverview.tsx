import React from 'react';
import { Link } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, StatCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { GbpStatusCard } from './GbpStatusCard';
import { MultiLineChart } from '../../components/Charts';
import PhoneInput from '../../../components/PhoneInput';
import { IadmModal, IadmButton } from '../../../components/IadmModal';
import type { GbpVerificationOption } from '../../../lib/arionApi';

function fmtNum(n: any): string { return n == null || isNaN(Number(n)) ? '--' : Number(n).toLocaleString(); }

export function BusinessOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const { data, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getGbpBusiness(activeSiteId).catch(e => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId]
  );

  // 2026-06-20 — pull the tenant-wide multi-location count so we can hint at
  // the new Locations page when more than one listing was auto-imported.
  // Backend: GET /arion/business-locations (commit c296d6b).
  const { data: locData } = useArionData(
    () => arionApi.listBusinessLocations().catch(() => null),
    [activeSiteId],
  );

  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>(null);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;
  const connected = d?.connected === true && !d?.error;
  const business = d?.business || {};
  const metrics = d?.metrics || {};
  const daily = (d?.dailyBreakdown || []) as any[];
  const locCount: number = Array.isArray((locData as any)?.data) ? (locData as any).data.length : 0;
  const primaryLocId: string | null = (locData as any)?.meta?.primary || null;

  const openEdit = () => {
    setForm({
      name: business.name || '',
      phone: business.phone || '',
      website: business.website || '',
      description: business.description || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!activeSiteId || !form) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (form.name !== (business.name || '')) body.name = form.name;
      if (form.phone !== (business.phone || '')) body.phone = form.phone;
      if (form.website !== (business.website || '')) body.website = form.website;
      if (form.description !== (business.description || '')) body.description = form.description;
      if (Object.keys(body).length === 0) { setEditing(false); setSaving(false); return; }
      await arionApi.updateGbpBusiness(activeSiteId, body);
      setToast('Saved. Changes may take a few minutes to appear on Google.');
      setEditing(false);
      refetch?.();
    } catch (e: any) {
      setToast(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!connected) {
    // GBP Connect Batch B (2026-07-22): the hard failure codes (quota
    // pending / API disabled / auth expired / no listing on the account)
    // keep the shared GbpStatusCard explainer. The two states a client can
    // act on RIGHT HERE — plain not-connected and connected-but-no-listing-
    // selected — get the two-option connect surface instead of a pointer to
    // Settings.
    const err = d?.error as string | null | undefined;
    const HARD_GBP_ERRORS = ['gbp_quota_exceeded', 'gbp_api_disabled', 'gbp_auth_expired', 'location_not_found'];
    if (err && HARD_GBP_ERRORS.includes(err)) {
      return (
        <div>
          <GbpStatusCard error={err} surface="overview" />
        </div>
      );
    }
    if (!activeSiteId) return <EmptyPanel message="No ARION site selected." />;
    return (
      <GbpConnectChooser
        siteId={activeSiteId}
        connectedNoLocation={err === 'gbp_location_not_selected'}
        onDone={() => refetch?.()}
      />
    );
  }

  const trend = daily.slice(-30).map(r => ({
    label: (r.date || '').slice(5),
    Impressions: r.impressions || 0,
    Calls: r.calls || 0,
    'Website clicks': r.websiteClicks || 0,
    Directions: r.directions || 0,
  }));

  // Batch B: surface the verification panel on the CONNECTED view too when
  // the selected listing is stored unverified (a just-created listing lands
  // here once its business info starts resolving). Gated on the already-
  // fetched business_location rows so verified tenants pay zero extra
  // Google calls — fail-quiet when the row is missing.
  const locRows: any[] = Array.isArray((locData as any)?.data) ? (locData as any).data : [];
  const selRow = business.locationName ? locRows.find((r: any) => r.location_name === business.locationName) : null;
  const needsVerification = !!selRow && !(selRow.is_verified === true || selRow.is_verified === 1);

  return (
    <div>
      <div className="stat-row" style={{ marginTop: 8 }}>
        <StatCard label="Impressions (30d)" value={fmtNum(metrics.impressions)} />
        <StatCard label="Website Clicks" value={fmtNum(metrics.websiteClicks)} />
        <StatCard label="Directions" value={fmtNum(metrics.directionsRequests)} />
        <StatCard label="Phone Calls" value={fmtNum(metrics.calls)} />
      </div>

      {needsVerification && activeSiteId && (
        <GbpVerificationPanel siteId={activeSiteId} onVerified={() => refetch?.()} />
      )}

      <Card title="Google Business Profile">
        {!editing ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 12, fontSize: 13, alignItems: 'start' }}>
              <div style={{ color: '#5A7A8A' }}>Business name</div><div>{business.name ?? '--'}</div>
              <div style={{ color: '#5A7A8A' }}>Phone</div><div>{business.phone ?? '--'}</div>
              <div style={{ color: '#5A7A8A' }}>Website</div><div style={{ wordBreak: 'break-all' }}>{business.website ? <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{business.website}</a> : '--'}</div>
              <div style={{ color: '#5A7A8A' }}>Address</div><div>{business.address ?? '--'}</div>
              <div style={{ color: '#5A7A8A' }}>Primary category</div><div>{business.primaryCategory ?? '--'}</div>
              <div style={{ color: '#5A7A8A' }}>Description</div><div style={{ whiteSpace: 'pre-wrap' }}>{business.description ?? '--'}</div>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="abtn abtn-sky" onClick={openEdit}>Edit</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 10, columnGap: 12, fontSize: 13, alignItems: 'center' }}>
            <div style={{ color: '#5A7A8A' }}>Business name</div>
            <input className="field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div style={{ color: '#5A7A8A' }}>Phone</div>
            <PhoneInput className="field-input" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            <div style={{ color: '#5A7A8A' }}>Website</div>
            <input className="field-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
            <div style={{ color: '#5A7A8A', alignSelf: 'start', paddingTop: 6 }}>Description</div>
            <div>
              <textarea className="field-input" rows={4} maxLength={750} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div style={{ fontSize: 10, color: '#5A7A8A', textAlign: 'right', marginTop: 2 }}>{(form.description || '').length}/750</div>
            </div>
            <div />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="abtn abtn-sky" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="abtn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}
        {toast && <div style={{ marginTop: 10, fontSize: 12, color: '#5A7A8A' }}>{toast}</div>}
      </Card>

      {locCount > 1 && (
        <Card title="Multiple business locations detected">
          <p style={{ margin: 0, marginBottom: 10, fontSize: 13, color: '#334155' }}>
            {locCount} Google Business Profile location{locCount === 1 ? '' : 's'} are imported for this tenant.
            {primaryLocId ? ' The current primary anchors the Overview, Reviews, and Insights tabs.' : ' Pick a primary to anchor the Overview, Reviews, and Insights tabs.'}
          </p>
          <Link to="/app/services/arion_business_locations" className="abtn abtn-sky" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Manage locations →
          </Link>
        </Card>
      )}

      {trend.length > 0 && (
        <Card title="30-day trend">
          <MultiLineChart
            data={trend}
            lines={[
              { dataKey: 'Impressions', color: '#2D9CDB', name: 'Impressions' },
              { dataKey: 'Website clicks', color: '#EF6C33', name: 'Website clicks' },
              { dataKey: 'Directions', color: '#0C4A60', name: 'Directions' },
              { dataKey: 'Calls', color: '#FEC82C', name: 'Calls' },
            ]}
            height={240}
          />
        </Card>
      )}

      <ConsultingUpsell
        headline="Dominate local search. IA manages your entire local presence — GBP, Bing, Apple Maps."
        subtext="Full-service local SEO management included with Pro+ plans."
        serviceType="Local SEO"
        triggerPage="business-overview"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GBP Connect Batch B (2026-07-22)

   Two-option connect surface for the plain not-connected and no-listing-
   selected states:

   Option 1 "I already have a listing" → OAuth (client's own Google account)
   → location picker → select.

   Option 2 "I need one created" → intake form → OAuth → arion-api creates
   the listing ON THE CLIENT'S TOKEN under the CLIENT'S account, so the
   client is PRIMARY_OWNER (never the IA master account) → in-portal
   verification: options → request → PIN → VoiceOfMerchant status.

   The intake draft survives the OAuth round-trip in sessionStorage; the
   return URL carries ?gbpCreate=1 so this page knows to finish the create.
   ═══════════════════════════════════════════════════════════════════════ */

type GbpDraft = {
  title: string; category: string; phone: string; website: string;
  line1: string; line2: string; city: string; state: string; zip: string;
  serviceArea: boolean;
};

const EMPTY_GBP_DRAFT: GbpDraft = {
  title: '', category: '', phone: '', website: '',
  line1: '', line2: '', city: '', state: '', zip: '', serviceArea: false,
};

function gbpDraftKey(siteId: string) { return `arion.gbpCreateDraft.${siteId}`; }

function loadGbpDraft(siteId: string): GbpDraft | null {
  try {
    const raw = sessionStorage.getItem(gbpDraftKey(siteId));
    return raw ? { ...EMPTY_GBP_DRAFT, ...JSON.parse(raw) } : null;
  } catch { return null; }
}

function gbpDraftToBody(draft: GbpDraft, accountName?: string) {
  const body: any = {
    title: draft.title.trim(),
    primary_category: draft.category.trim(),
    phone: draft.phone.trim(),
  };
  if (draft.website.trim()) body.website_uri = draft.website.trim();
  if (draft.serviceArea) body.service_area = true;
  const lines = [draft.line1, draft.line2].map(s => (s || '').trim()).filter(Boolean);
  if (lines.length > 0) {
    body.address = {
      addressLines: lines,
      ...(draft.city.trim() ? { locality: draft.city.trim() } : {}),
      ...(draft.state.trim() ? { administrativeArea: draft.state.trim() } : {}),
      ...(draft.zip.trim() ? { postalCode: draft.zip.trim() } : {}),
      regionCode: 'US',
    };
  }
  if (accountName) body.account_name = accountName;
  return body;
}

const fieldLabel: React.CSSProperties = { color: '#5A7A8A', fontSize: 13 };

function GbpConnectChooser({ siteId, connectedNoLocation, onDone }: {
  siteId: string;
  connectedNoLocation: boolean;
  onDone: () => void;
}) {
  const { arionApi } = useArionContext();
  const returnBase = window.location.origin + window.location.pathname;
  const isCreateReturn = React.useMemo(
    () => new URLSearchParams(window.location.search).get('gbpCreate') === '1', []
  );

  const [connecting, setConnecting] = React.useState<null | 'have' | 'create'>(null);
  const [showIntake, setShowIntake] = React.useState(false);
  const [draft, setDraft] = React.useState<GbpDraft>(() => loadGbpDraft(siteId) || EMPTY_GBP_DRAFT);
  const [intakeError, setIntakeError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<{ location_name: string; title: string } | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [accountChoices, setAccountChoices] = React.useState<Array<{ name: string; accountName: string; type: string | null }> | null>(null);

  const runCreate = React.useCallback(async (d: GbpDraft, accountName?: string) => {
    setCreating(true); setCreateError(null); setAccountChoices(null);
    try {
      const r = await arionApi.createGbpListing(siteId, gbpDraftToBody(d, accountName));
      try { sessionStorage.removeItem(gbpDraftKey(siteId)); } catch { /* non-fatal */ }
      setCreated({ location_name: r.data.location_name, title: r.data.title });
    } catch (e: any) {
      const body = e?.body as any;
      if (e?.status === 409 && body?.error === 'multiple_accounts' && Array.isArray(body.accounts)) {
        setAccountChoices(body.accounts);
      } else {
        setCreateError(e?.message || 'Could not create the listing. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  }, [arionApi, siteId]);

  // Returning from the create-flow OAuth round-trip: Google is now connected
  // and the intake draft survived in sessionStorage — finish the create.
  const autoRanRef = React.useRef(false);
  React.useEffect(() => {
    if (!connectedNoLocation || !isCreateReturn || autoRanRef.current) return;
    const saved = loadGbpDraft(siteId);
    if (!saved) return;
    autoRanRef.current = true;
    runCreate(saved);
  }, [connectedNoLocation, isCreateReturn, siteId, runCreate]);

  const startConnect = async (mode: 'have' | 'create') => {
    setConnecting(mode); setCreateError(null);
    try {
      if (mode === 'create') {
        try { sessionStorage.setItem(gbpDraftKey(siteId), JSON.stringify(draft)); } catch { /* non-fatal */ }
      }
      const returnUrl = mode === 'create' ? `${returnBase}?gbpCreate=1` : returnBase;
      const r = await arionApi.connectGoogle(siteId, returnUrl);
      if (r?.authUrl) { window.location.href = r.authUrl; return; }
      setCreateError('Google sign-in could not be started. Please try again.');
      setConnecting(null);
    } catch (e: any) {
      setCreateError(e?.message || 'Google sign-in could not be started.');
      setConnecting(null);
    }
  };

  const submitIntake = () => {
    if (!draft.title.trim() || !draft.category.trim() || !draft.phone.trim()) {
      setIntakeError('Business name, category, and phone are required.');
      return;
    }
    if (!draft.serviceArea && !draft.line1.trim()) {
      setIntakeError('Enter a street address, or check "customers come to me" below if you serve customers at their locations.');
      return;
    }
    setIntakeError(null);
    setShowIntake(false);
    startConnect('create');
  };

  // ── Listing created — hand off to the verification panel ──
  if (created) {
    return (
      <div>
        <Card title="Your Google Business Profile was created">
          <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
            "{created.title}" is now on Google, owned by <strong>your</strong> Google account.
            One step left: Google needs to verify your business before the listing appears publicly.
          </p>
        </Card>
        <GbpVerificationPanel siteId={siteId} onVerified={onDone} />
      </div>
    );
  }

  // ── Create in flight (post-OAuth) ──
  if (creating) {
    return <Loading message="Creating your Google Business Profile..." />;
  }

  // ── Google returned several Business Profile accounts — ask which one ──
  if (accountChoices) {
    return (
      <Card title="Which Google Business Profile account?">
        <p style={{ margin: 0, marginBottom: 12, fontSize: 13, color: '#334155' }}>
          Your Google login manages more than one Business Profile account. Choose where the new listing should live — you stay the owner either way.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accountChoices.map((a) => (
            <button
              key={a.name}
              className="abtn"
              style={{ textAlign: 'left' }}
              onClick={() => runCreate(loadGbpDraft(siteId) || draft, a.name)}
            >
              {a.accountName}{a.type ? ` (${a.type.toLowerCase()})` : ''}
            </button>
          ))}
        </div>
        {createError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{createError}</div>}
      </Card>
    );
  }

  // ── Connected but no listing selected yet → picker + create fallback ──
  if (connectedNoLocation) {
    return (
      <div>
        <GbpLocationPickerCard siteId={siteId} onSelected={onDone} />
        <Card title="Don't have a listing yet?">
          <p style={{ margin: 0, marginBottom: 10, fontSize: 13, color: '#334155' }}>
            If your business isn't on Google yet, we can create the listing for you — it will belong to your Google account.
          </p>
          <button className="abtn abtn-sky" onClick={() => setShowIntake(true)}>Create my Business Profile</button>
          {createError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{createError}</div>}
        </Card>
        <GbpIntakeModal
          open={showIntake}
          draft={draft}
          setDraft={setDraft}
          error={intakeError}
          busy={connecting === 'create'}
          onClose={() => { setShowIntake(false); setIntakeError(null); }}
          onSubmit={submitIntake}
        />
      </div>
    );
  }

  // ── Not connected at all → the two-option chooser ──
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch', marginTop: 8 }}>
        <Card title="I already have a Google Business Profile" style={{ flex: '1 1 320px', minWidth: 300 }}>
          <p style={{ margin: 0, marginBottom: 12, fontSize: 13, color: '#334155' }}>
            Connect the Google account that manages your business listing, then pick your listing. ARION pulls in your reviews, insights, and profile so you can manage everything from here.
          </p>
          <button className="abtn abtn-sky" onClick={() => startConnect('have')} disabled={connecting !== null}>
            {connecting === 'have' ? 'Opening Google...' : 'Connect Google'}
          </button>
        </Card>
        <Card title="I need one created" style={{ flex: '1 1 320px', minWidth: 300 }}>
          <p style={{ margin: 0, marginBottom: 12, fontSize: 13, color: '#334155' }}>
            Not on Google yet? Tell us about your business and we'll create your Business Profile — owned by <strong>your</strong> Google account, verified from right here.
          </p>
          <button className="abtn abtn-sky" onClick={() => setShowIntake(true)} disabled={connecting !== null}>
            Get started
          </button>
        </Card>
      </div>
      {createError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{createError}</div>}
      <GbpIntakeModal
        open={showIntake}
        draft={draft}
        setDraft={setDraft}
        error={intakeError}
        busy={connecting === 'create'}
        onClose={() => { setShowIntake(false); setIntakeError(null); }}
        onSubmit={submitIntake}
      />
    </div>
  );
}

function GbpIntakeModal({ open, draft, setDraft, error, busy, onClose, onSubmit }: {
  open: boolean;
  draft: GbpDraft;
  setDraft: React.Dispatch<React.SetStateAction<GbpDraft>>;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = (patch: Partial<GbpDraft>) => setDraft(prev => ({ ...prev, ...patch }));
  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="arion"
      size="info"
      title="Create your Google Business Profile"
      subtitle="Owned by your Google account — you approve everything with your own Google sign-in."
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose} disabled={busy}>Cancel</IadmButton>
          <IadmButton variant="primary" onClick={onSubmit} disabled={busy}>
            {busy ? 'Opening Google...' : 'Connect Google & Create'}
          </IadmButton>
        </>
      }
    >
      <div style={{ padding: 20, maxWidth: 720 }}>
        <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: '#334155' }}>
          Fill in the basics, then sign in with Google. The listing is created under <strong>your</strong> Google account, so your business stays yours. Google will then ask to verify the business (usually a phone call, text, or postcard) — you can do that from this page too.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', rowGap: 12, columnGap: 12, alignItems: 'center' }}>
          <div style={fieldLabel}>Business name *</div>
          <input className="field-input" value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Summit Lawn & Landscape LLC" />

          <div style={fieldLabel}>Business category *</div>
          <input className="field-input" value={draft.category} onChange={e => set({ category: e.target.value })} placeholder='e.g. "Plumber", "Marketing agency", "Dentist"' />

          <div style={fieldLabel}>Business phone *</div>
          <PhoneInput className="field-input" value={draft.phone} onChange={v => set({ phone: v })} />

          <div style={fieldLabel}>Website</div>
          <input className="field-input" value={draft.website} onChange={e => set({ website: e.target.value })} placeholder="https:// (optional)" />

          <div style={{ ...fieldLabel, alignSelf: 'start', paddingTop: 6 }}>Business address</div>
          <div style={{ display: 'grid', rowGap: 8 }}>
            <input className="field-input" value={draft.line1} onChange={e => set({ line1: e.target.value })} placeholder="Street address" disabled={draft.serviceArea} />
            <input className="field-input" value={draft.line2} onChange={e => set({ line2: e.target.value })} placeholder="Suite / unit (optional)" disabled={draft.serviceArea} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field-input" style={{ flex: 2 }} value={draft.city} onChange={e => set({ city: e.target.value })} placeholder="City" disabled={draft.serviceArea} />
              <input className="field-input" style={{ flex: 1 }} value={draft.state} onChange={e => set({ state: e.target.value })} placeholder="State" disabled={draft.serviceArea} />
              <input className="field-input" style={{ flex: 1 }} value={draft.zip} onChange={e => set({ zip: e.target.value })} placeholder="ZIP" disabled={draft.serviceArea} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.serviceArea} onChange={e => set({ serviceArea: e.target.checked })} />
              I serve customers at their locations (no storefront address shown on Google)
            </label>
          </div>
        </div>
        {error && <div style={{ marginTop: 14, fontSize: 12, color: '#dc2626' }}>{error}</div>}
      </div>
    </IadmModal>
  );
}

function GbpLocationPickerCard({ siteId, onSelected }: { siteId: string; onSelected: () => void }) {
  const { arionApi } = useArionContext();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [locations, setLocations] = React.useState<any[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const [choice, setChoice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async (all: boolean) => {
    setLoading(true); setError(null);
    try {
      const r = await arionApi.listGbpLocations(siteId, all || undefined);
      const data = r?.data;
      // The backend auto-picks when there's no ambiguity (single listing or
      // unique domain match) and reports it here — nothing left to choose.
      if (data?.auto_selected || data?.currently_selected) { onSelected(); return; }
      setLocations(Array.isArray(data?.locations) ? data.locations : []);
      setTotalCount(Number(data?.locations_total || 0));
    } catch (e: any) {
      setError(e?.message || 'Could not load your Google listings.');
    } finally {
      setLoading(false);
    }
  }, [arionApi, siteId, onSelected]);

  React.useEffect(() => { load(showAll); }, [load, showAll]);

  const select = async () => {
    if (!choice) return;
    setSaving(true); setError(null);
    try {
      await arionApi.selectGbpLocation(siteId, choice);
      onSelected();
    } catch (e: any) {
      setError(e?.message || 'Could not save your selection. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Card title="Choose your business listing">
      {loading ? (
        <Loading message="Loading your Google Business Profile listings..." />
      ) : locations.length === 0 ? (
        <div>
          <p style={{ margin: 0, marginBottom: 10, fontSize: 13, color: '#334155' }}>
            {showAll
              ? 'No Business Profile listings were found on the Google account you connected.'
              : totalCount > 0
                ? `None of the ${totalCount} listing${totalCount === 1 ? '' : 's'} on your Google account match this website's domain.`
                : 'No Business Profile listings were found on the Google account you connected.'}
          </p>
          {!showAll && totalCount > 0 && (
            <button className="abtn" onClick={() => setShowAll(true)}>Show all listings on my Google account</button>
          )}
        </div>
      ) : (
        <div>
          {showAll && (
            <p style={{ margin: 0, marginBottom: 10, fontSize: 12, color: '#B45309' }}>
              Showing every listing your Google account can manage — make sure you pick the business this website belongs to.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {locations.map((l: any) => (
              <label key={l.location_name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid ' + (choice === l.location_name ? 'var(--arion-sky, #38BDF8)' : '#E2E8F0'), borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="gbp-location"
                  checked={choice === l.location_name}
                  onChange={() => setChoice(l.location_name)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>{l.title}</strong>
                  {l.is_verified === true && <span style={{ marginLeft: 8, fontSize: 11, color: '#15803D' }}>Verified</span>}
                  {l.address && <><br /><span style={{ color: '#5A7A8A' }}>{l.address}</span></>}
                  {l.website_uri && <><br /><span style={{ color: '#5A7A8A', wordBreak: 'break-all' }}>{l.website_uri}</span></>}
                </span>
              </label>
            ))}
          </div>
          <button className="abtn abtn-sky" onClick={select} disabled={!choice || saving}>
            {saving ? 'Saving...' : 'Use this listing'}
          </button>
          {!showAll && totalCount > locations.length && (
            <button className="abtn" style={{ marginLeft: 8 }} onClick={() => setShowAll(true)}>
              Show all {totalCount} listings
            </button>
          )}
        </div>
      )}
      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
    </Card>
  );
}

function gbpVerificationOptionLabel(o: GbpVerificationOption): string {
  const m = o.verificationMethod || '';
  if (m === 'PHONE_CALL') return `Phone call to ${o.phoneNumber || 'your business phone'}`;
  if (m === 'SMS') return `Text message to ${o.phoneNumber || 'your business phone'}`;
  if (m === 'EMAIL') return `Email to ${o.emailData?.user && o.emailData?.domain ? `${o.emailData.user}@${o.emailData.domain}` : 'your business email'}`;
  if (m === 'ADDRESS') return 'Postcard by mail to your business address (arrives in about 5 days)';
  if (m === 'AUTO') return 'Instant verification (no code needed)';
  if (m === 'VETTED_PARTNER') return 'Verification through a Google-vetted partner';
  return m || 'Verification';
}

function GbpVerificationPanel({ siteId, onVerified }: { siteId: string; onVerified?: () => void }) {
  const { arionApi } = useArionContext();
  const [phase, setPhase] = React.useState<'loading' | 'options' | 'pin' | 'verified' | 'error'>('loading');
  const [options, setOptions] = React.useState<GbpVerificationOption[]>([]);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [choiceIdx, setChoiceIdx] = React.useState<number | null>(null);
  const [requesting, setRequesting] = React.useState(false);
  const [verificationName, setVerificationName] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState('');
  const [completing, setCompleting] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const loadOptions = React.useCallback(async () => {
    setOptionsLoading(true);
    try {
      const r = await arionApi.getGbpVerificationOptions(siteId);
      setOptions(Array.isArray(r?.data?.options) ? r.data.options : []);
    } catch (e: any) {
      setMsg(e?.message || 'Could not load verification options from Google.');
    } finally {
      setOptionsLoading(false);
    }
  }, [arionApi, siteId]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await arionApi.getGbpVerificationStatus(siteId);
        if (!alive) return;
        const s = r.data;
        if (s.is_verified) { setPhase('verified'); return; }
        // A verification is already in flight (e.g. a postcard on its way) —
        // jump straight to PIN entry using the stored tracking id.
        if (s.verification?.name && s.verification?.state === 'PENDING') {
          setVerificationName(s.verification.name);
          setPhase('pin');
          return;
        }
        setPhase('options');
        loadOptions();
      } catch (e: any) {
        if (!alive) return;
        setMsg(e?.message || 'Could not check verification status.');
        setPhase('error');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const requestSelected = async () => {
    if (choiceIdx == null || !options[choiceIdx]) return;
    setRequesting(true); setMsg(null);
    try {
      const r = await arionApi.requestGbpVerification(siteId, options[choiceIdx]);
      const v = r?.data?.verification;
      setVerificationName(v?.name || null);
      setAnnouncement(v?.announcement || null);
      if (v?.state === 'COMPLETED') {
        // AUTO verification — no code round-trip needed.
        await checkStatus();
        return;
      }
      setPhase('pin');
    } catch (e: any) {
      setMsg(e?.message || 'Could not request verification.');
    } finally {
      setRequesting(false);
    }
  };

  const submitPin = async () => {
    if (!verificationName || !pin.trim()) return;
    setCompleting(true); setMsg(null);
    try {
      const r = await arionApi.completeGbpVerification(siteId, verificationName, pin.trim());
      if (r?.data?.has_voice_of_merchant === true) {
        setPhase('verified');
        onVerified?.();
      } else {
        setMsg('Code accepted. Google can take a few minutes to activate the listing — use "Check status" below.');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Google rejected that code. Double-check it and try again.');
    } finally {
      setCompleting(false);
    }
  };

  const checkStatus = async () => {
    setChecking(true); setMsg(null);
    try {
      const r = await arionApi.getGbpVerificationStatus(siteId);
      if (r?.data?.is_verified) {
        setPhase('verified');
        onVerified?.();
      } else {
        setMsg('Not verified yet — Google still shows this listing as pending.');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Could not check verification status.');
    } finally {
      setChecking(false);
    }
  };

  if (phase === 'verified') {
    return (
      <Card title="Google Business Profile verified">
        <p style={{ margin: 0, fontSize: 13, color: '#15803D' }}>
          Your business is verified with Google. Your listing is live — reviews, insights, and profile edits all flow through this page.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Verify your Google Business Profile">
      {phase === 'loading' ? (
        <Loading message="Checking verification status..." />
      ) : phase === 'error' ? (
        <div style={{ fontSize: 13, color: '#334155' }}>
          <p style={{ margin: 0, marginBottom: 10 }}>{msg || 'Could not check verification status.'}</p>
          <button className="abtn" onClick={checkStatus} disabled={checking}>{checking ? 'Checking...' : 'Try again'}</button>
        </div>
      ) : phase === 'options' ? (
        <div style={{ fontSize: 13, color: '#334155' }}>
          <p style={{ margin: 0, marginBottom: 12 }}>
            Google needs to confirm your business is real before the listing appears publicly. Choose how you'd like to receive your verification code:
          </p>
          {optionsLoading ? (
            <Loading message="Loading verification options from Google..." />
          ) : options.length === 0 ? (
            <div>
              <p style={{ margin: 0, marginBottom: 10 }}>
                Google didn't return any verification options yet — a brand-new listing can take a few minutes to become verifiable.
              </p>
              <button className="abtn" onClick={loadOptions}>Reload options</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {options.map((o, i) => (
                  <label key={`${o.verificationMethod}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid ' + (choiceIdx === i ? 'var(--arion-sky, #38BDF8)' : '#E2E8F0'), borderRadius: 8, cursor: 'pointer' }}>
                    <input type="radio" name="gbp-verify-method" checked={choiceIdx === i} onChange={() => setChoiceIdx(i)} />
                    <span>{gbpVerificationOptionLabel(o)}</span>
                  </label>
                ))}
              </div>
              <button className="abtn abtn-sky" onClick={requestSelected} disabled={choiceIdx == null || requesting}>
                {requesting ? 'Requesting...' : 'Send my verification code'}
              </button>
            </div>
          )}
        </div>
      ) : (
        // phase === 'pin'
        <div style={{ fontSize: 13, color: '#334155' }}>
          <p style={{ margin: 0, marginBottom: 12 }}>
            {announcement
              ? announcement
              : 'Enter the verification code from Google below. Phone and text codes arrive right away; postcards take about 5 days.'}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="field-input"
              style={{ maxWidth: 200 }}
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Verification code"
              inputMode="numeric"
            />
            <button className="abtn abtn-sky" onClick={submitPin} disabled={!pin.trim() || !verificationName || completing}>
              {completing ? 'Verifying...' : 'Verify'}
            </button>
            <button className="abtn" onClick={checkStatus} disabled={checking}>
              {checking ? 'Checking...' : 'Check status'}
            </button>
            <button className="abtn" onClick={() => { setPhase('options'); setPin(''); if (options.length === 0) loadOptions(); }}>
              Choose a different method
            </button>
          </div>
          {!verificationName && (
            <p style={{ margin: 0, marginTop: 10, fontSize: 12, color: '#B45309' }}>
              We couldn't find the tracking id for your pending verification. Use "Choose a different method" to restart, or "Check status" if you already verified elsewhere.
            </p>
          )}
        </div>
      )}
      {msg && phase !== 'error' && <div style={{ marginTop: 10, fontSize: 12, color: '#5A7A8A' }}>{msg}</div>}
    </Card>
  );
}
