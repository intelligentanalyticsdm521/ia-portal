import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';

export function SeoCompetitors() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [showAddModal, setShowAddModal] = useState(false);
  const [competitorDomain, setCompetitorDomain] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: seo, loading: seoLoading, refetch } = useArionData(
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

  const handleAddCompetitor = async () => {
    const domain = competitorDomain.trim();
    if (!domain || !activeSiteId) return;
    setSubmitting(true);
    setAddError(null);
    try {
      await arionApi.addSeoCompetitor(activeSiteId, domain);
      setShowAddModal(false);
      setCompetitorDomain('');
      setToastMsg(`Competitor ${domain} added`);
      setTimeout(() => setToastMsg(null), 3000);
      refetch();
    } catch (err: any) {
      setAddError(err?.message || 'Could not add competitor. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
            <tr>
              <th>Competitor</th>
              <th>Visibility Score</th>
              <th>Keywords</th>
              <th>Keyword Overlap</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {competitors.length > 0 ? competitors.map((c: any, i: number) => {
              const vis = c.visibility ?? c.visibility_score ?? null;
              const kwCount = c.keywords ?? c.keywords_count ?? c.total_keywords ?? null;
              const overlap = c.overlap ?? c.overlap_percent ?? c.keyword_overlap ?? null;
              const added = c.added_at ?? c.created_at ?? null;
              return (
                <tr key={c.id ?? i}>
                  <td>{c.competitor ?? c.domain ?? '--'}</td>
                  <td>{vis != null ? (typeof vis === 'number' ? `${Number(vis).toFixed(1)}%` : String(vis)) : '--'}</td>
                  <td>{kwCount ?? '--'}</td>
                  <td>{overlap != null ? (typeof overlap === 'number' ? `${Math.round(overlap)}%` : String(overlap)) : '--'}</td>
                  <td>{added ? new Date(added).toLocaleDateString() : '--'}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No competitors tracked yet. Click "Add Competitor" above to start.</td></tr>
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
                border: '1px solid var(--border, #d1d5db)', marginBottom: 12,
                background: 'var(--input-bg, #fff)', color: 'var(--text, #111)',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleAddCompetitor(); }}
              autoFocus
              disabled={submitting}
            />
            {addError && (
              <div style={{ fontSize: 12, color: '#D85A30', marginBottom: 12, padding: '6px 10px', background: 'rgba(216,90,48,0.08)', borderRadius: 4 }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddModal(false); setCompetitorDomain(''); setAddError(null); }}
                style={{ fontSize: 13, padding: '6px 16px' }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleAddCompetitor}
                disabled={!competitorDomain.trim() || submitting}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                {submitting ? 'Adding…' : 'Add'}
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
