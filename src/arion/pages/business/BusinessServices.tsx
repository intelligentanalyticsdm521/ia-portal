import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { GbpStatusCard } from './GbpStatusCard';

// Business Profile → Services (built 2026-07-22, Brandon: "why is this
// coming soon instead of just a feature?"). Reads/writes the location's
// serviceItems via the Business Information API — same OAuth grant as the
// rest of GBP, editable even before the listing is verified. Google's
// model is a full-list replace, so we edit locally and Save once.

type UiService = {
  type: 'structured' | 'free';
  serviceTypeId?: string;
  displayName: string;
  description?: string | null;
};

export function BusinessServices() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getGbpServices(activeSiteId).catch((e: any) => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId]
  );

  const [items, setItems] = React.useState<UiService[] | null>(null);
  const [customName, setCustomName] = React.useState('');
  const [customDesc, setCustomDesc] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  // Seed the editable list from the fetch exactly once per load.
  React.useEffect(() => {
    const d = data as any;
    if (d && !d.error && d.connected !== false && Array.isArray(d.services)) {
      setItems(d.services as UiService[]);
    }
  }, [data]);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;
  if (!d || d.error || d.connected === false) {
    return <GbpStatusCard error={d?.error} surface="overview" />;
  }

  const suggested: Array<{ serviceTypeId: string; displayName: string }> = d.suggested || [];
  const list = items || [];
  const has = (sid: string) => list.some((s) => s.type === 'structured' && s.serviceTypeId === sid);

  const save = async (next: UiService[]) => {
    setSaving(true);
    setToast(null);
    try {
      await arionApi.saveGbpServices(activeSiteId!, next as any);
      setItems(next);
      setToast('Saved to Google.');
      refetch();
    } catch (e: any) {
      setToast(`Save failed: ${e?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const addSuggested = (s: { serviceTypeId: string; displayName: string }) => {
    if (has(s.serviceTypeId)) return;
    void save([...list, { type: 'structured', serviceTypeId: s.serviceTypeId, displayName: s.displayName }]);
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    void save([...list, { type: 'free', displayName: name, description: customDesc.trim() || null }]);
    setCustomName('');
    setCustomDesc('');
  };

  const remove = (idx: number) => {
    void save(list.filter((_, i) => i !== idx));
  };

  return (
    <TierGate featureKey="arion_business_services" featureName="Services & products management">
      {toast && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: toast.startsWith('Save failed') ? '#FEE2E2' : '#DCFCE7', color: toast.startsWith('Save failed') ? '#991B1B' : '#166534' }}>
          {toast}
        </div>
      )}

      <Card title={`Your services${d.categoryName ? ` — ${d.categoryName}` : ''}`}>
        {list.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No services listed yet. Add from the suggestions below or create your own —
            they appear on your Google Business Profile.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((s, i) => (
              <li key={`${s.type}-${s.serviceTypeId || s.displayName}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border, #E2E8F0)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.displayName}</div>
                  {s.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.description}</div>}
                </div>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
                  {s.type === 'structured' ? 'Google service' : 'Custom'}
                </span>
                <button className="abtn" style={{ fontSize: 12, padding: '4px 10px', color: '#B91C1C' }} disabled={saving} onClick={() => remove(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {suggested.filter((s) => !has(s.serviceTypeId)).length > 0 && (
        <Card title="Suggested for your category">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suggested.filter((s) => !has(s.serviceTypeId)).map((s) => (
              <button key={s.serviceTypeId} className="abtn" style={{ fontSize: 12, padding: '6px 12px' }} disabled={saving} onClick={() => addSuggested(s)}>
                + {s.displayName}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card title="Add a custom service">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="field-input"
            style={{ flex: 2, minWidth: 200 }}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Service name — e.g. Emergency call-outs"
            maxLength={120}
          />
          <input
            className="field-input"
            style={{ flex: 3, minWidth: 240 }}
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="Short description (optional)"
            maxLength={300}
          />
          <button className="abtn abtn-sky" style={{ fontSize: 13, padding: '8px 16px' }} disabled={saving || !customName.trim()} onClick={addCustom}>
            {saving ? 'Saving…' : 'Add service'}
          </button>
        </div>
      </Card>

      <ConsultingUpsell
        headline="Complete service listings drive more leads. IA manages your business services."
        subtext="Service listing optimization for local search."
        serviceType="Local SEO"
        triggerPage="business-services"
      />
    </TierGate>
  );
}
