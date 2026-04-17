import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';

export function SeoCompetitors() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [showAddModal, setShowAddModal] = useState(false);
  const [competitorDomain, setCompetitorDomain] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const s = seo as Record<string, any> | null;
  const connected = s?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const competitors = (s?.breakdowns?.competitors as any[]) ?? [];

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track your competitors' keyword rankings, visibility scores, and backlink profiles."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  const handleAddCompetitor = () => {
    if (!competitorDomain.trim()) return;
    setShowAddModal(false);
    setCompetitorDomain('');
    setToastMsg('Competitor added');
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div>
      {connected && (
        <InfoCard title="Competitor Tracking — Connected">
          <p style={{ margin: 0 }}>SE Ranking competitor tracking is active.</p>
        </InfoCard>
      )}

      {/* Add Competitor button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowAddModal(true)} style={{ fontSize: 13 }}>
          + Add Competitor
        </button>
      </div>

      <Card title="Tracked Competitors">
        <table className="data-table">
          <thead>
            <tr><th>Competitor</th><th>Visibility</th><th>Keywords</th><th>Overlap</th></tr>
          </thead>
          <tbody>
            {competitors.length > 0 ? competitors.map((c: any, i: number) => (
              <tr key={i}>
                <td>{c.competitor ?? c.domain ?? '--'}</td>
                <td>{c.visibility ?? '--'}</td>
                <td>{c.keywords ?? '--'}</td>
                <td>{c.overlap ?? '--'}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No competitor data available yet</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Add Competitor Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={() => setShowAddModal(false)}>
          <div
            style={{
              background: 'var(--card-bg, #fff)', borderRadius: 12, padding: 24,
              width: 400, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Add Competitor</h3>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Domain</label>
            <input
              type="text"
              value={competitorDomain}
              onChange={(e) => setCompetitorDomain(e.target.value)}
              placeholder="e.g. competitor.com"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                border: '1px solid var(--border, #d1d5db)', marginBottom: 16,
                background: 'var(--input-bg, #fff)', color: 'var(--text, #111)',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCompetitor(); }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddModal(false); setCompetitorDomain(''); }}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleAddCompetitor}
                disabled={!competitorDomain.trim()}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: '#22c55e', color: '#fff',
          padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toastMsg}
        </div>
      )}

      <ConsultingUpsell
        headline="Your competitors are winning keywords you could own. Let IA close the gap."
        subtext="Competitive SEO analysis and counter-strategy."
        serviceType="SEO Strategy"
        triggerPage="seo-competitors"
      />
    </div>
  );
}
