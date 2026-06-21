import React from 'react';
import { Link } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, StatCard, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { MultiLineChart } from '../../components/Charts';

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
    const err = d?.error;
    const title = err === 'gbp_quota_exceeded' || err === 'gbp_api_disabled'
      ? 'Google Business Profile — API Access Pending'
      : 'Google Business Profile — Not Connected';
    return (
      <div>
        <InfoCard title={title}>
          <p style={{ margin: 0 }}>
            {err === 'gbp_quota_exceeded'
              ? 'The Google Business Profile APIs are enabled for this project but have a zero-quota limit. Request quota in Google Cloud Console → APIs & Services → enable quota on My Business Account Management API, My Business Business Information API, and Business Profile Performance API. Google typically approves within minutes.'
              : err === 'gbp_api_disabled'
              ? 'The Google Business Profile APIs are not enabled for this Google Cloud project. Enable them in Google Cloud Console → APIs & Services.'
              : err === 'gbp_auth_expired'
              ? 'Your Google authentication has expired. Reconnect Google in Settings → Connected Accounts.'
              : err === 'location_not_found'
              ? 'No Google Business Profile location found for this Google account.'
              : 'Connect your Google Business Profile in Settings → Connected Accounts to see live reviews, insights, and manage your listing.'}
          </p>
        </InfoCard>
      </div>
    );
  }

  const trend = daily.slice(-30).map(r => ({
    label: (r.date || '').slice(5),
    Impressions: r.impressions || 0,
    Calls: r.calls || 0,
    'Website clicks': r.websiteClicks || 0,
    Directions: r.directions || 0,
  }));

  return (
    <div>
      <div className="stat-row" style={{ marginTop: 8 }}>
        <StatCard label="Impressions (30d)" value={fmtNum(metrics.impressions)} />
        <StatCard label="Website Clicks" value={fmtNum(metrics.websiteClicks)} />
        <StatCard label="Directions" value={fmtNum(metrics.directionsRequests)} />
        <StatCard label="Phone Calls" value={fmtNum(metrics.calls)} />
      </div>

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
            <input className="field-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
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
