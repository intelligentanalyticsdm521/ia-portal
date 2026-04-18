/**
 * Phase 3.5 Competitors page — visual summary + detail modal pattern.
 *
 * Summary view: tracked-competitor cards with visibility compare, gap
 * analysis preview, head-to-head keywords. "See Full Details" opens modal
 * with the full competitor tracking table + add flow.
 */
import React, { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryPanel } from '../../components/Glossary';

export function SeoCompetitors() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
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
  const competitors: any[] = s?.breakdowns?.competitors ?? [];

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track your competitors' keyword rankings, visibility scores, and content gaps."
        price="$29"
        planName="Starter"
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

  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  const maxCompetitors = tier === 'authority' ? 10 : tier === 'growth' || tier === 'essentials' ? 5 : 2;
  const slotsUsed = competitors.length;
  const slotsAvailable = Math.max(0, maxCompetitors - slotsUsed);

  return (
    <div>
      <InfoCard title="Competitor Tracking">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12 }}>
            {slotsUsed} of {maxCompetitors} competitor slots used ({slotsAvailable} available on your {tier} tier).
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={slotsAvailable === 0}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 6, cursor: slotsAvailable === 0 ? 'not-allowed' : 'pointer', opacity: slotsAvailable === 0 ? 0.5 : 1 }}
            >
              + Add Competitor
            </button>
            <button
              onClick={() => setShowDetails(true)}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Details →
            </button>
          </div>
        </div>
      </InfoCard>

      {/* Hero stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <SeoStatCard label="Tracked Competitors" value={slotsUsed} sub={`of ${maxCompetitors} on your plan`} accent="#2D9CDB" />
        <SeoStatCard label="Your Visibility" value={s?.snapshot?.searchVisibility != null ? `${s.snapshot.searchVisibility}%` : '—'} sub="CTR-weighted" accent="#1D9E75" termKey="search_visibility" />
        <SeoStatCard label="Top 10 Keywords" value={s?.snapshot?.top10Count ?? '—'} sub="yours on page 1" accent="#EF6C33" termKey="top10_keywords" />
        <SeoStatCard label="Content Gap" value={'—'} sub="keywords they own, you don't" accent="#FEC82C" />
      </div>

      {/* Competitor cards */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginTop: 22, marginBottom: 10 }}>
        Your tracked competitors
      </div>
      {competitors.length === 0 ? (
        <Card>
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#5A7A8A' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>No competitors tracked yet</div>
            <p style={{ fontSize: 12, maxWidth: 460, margin: '0 auto 14px', lineHeight: 1.6 }}>
              Add competitor domains to see how your visibility compares, find keywords they rank for that you don't, and identify content gaps.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              + Add Your First Competitor
            </button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(competitors.length, 3)}, 1fr)`, gap: 12 }}>
          {competitors.map((c: any, i: number) => {
            const vis = c.visibility ?? c.visibility_score ?? null;
            return (
              <div key={c.id ?? i} style={{ background: '#fff', borderLeft: '3px solid #EF6C33', borderRadius: 8, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.competitor ?? c.domain ?? '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: '#0B1C24' }}>
                    {vis != null ? `${typeof vis === 'number' ? vis.toFixed(1) : vis}%` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: '#5A7A8A' }}>visibility</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5A7A8A' }}>Tracked keywords</span>
                    <span style={{ color: '#0B1C24', fontWeight: 500 }}>{c.keywords ?? c.keywords_count ?? c.total_keywords ?? '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5A7A8A' }}>Keyword overlap</span>
                    <span style={{ color: '#0B1C24', fontWeight: 500 }}>{c.overlap ?? c.overlap_percent ?? '—'}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content gap teaser */}
      <Card title="Content gap analysis" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 4px', fontSize: 13, color: '#5A7A8A', lineHeight: 1.6 }}>
          This is where we show keywords competitors rank in the top 10 for that you don't rank for at all — your content opportunity list. It requires tracked competitors and unlocks automatically once you add at least one.
        </div>
      </Card>

      <GlossaryPanel termKeys={['search_visibility', 'top10_keywords', 'position']} title="What do these competitor terms mean?" />

      <ConsultingUpsell
        headline="Your competitors are winning keywords you could own. Let IA close the gap."
        subtext="Competitive SEO analysis and counter-strategy."
        serviceType="SEO Strategy"
        triggerPage="seo-competitors"
      />

      {/* Add competitor modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Add Competitor</h3>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Competitor domain</label>
            <input
              type="text"
              value={competitorDomain}
              onChange={(e) => setCompetitorDomain(e.target.value)}
              placeholder="e.g. competitor.com"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border, #d1d5db)', marginBottom: 12, background: 'var(--input-bg, #fff)', color: 'var(--text, #111)', boxSizing: 'border-box' }}
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
              <button className="btn btn-secondary" onClick={() => { setShowAddModal(false); setCompetitorDomain(''); setAddError(null); }} style={{ fontSize: 13, padding: '6px 16px' }} disabled={submitting}>
                Cancel
              </button>
              <button className="btn" onClick={handleAddCompetitor} disabled={!competitorDomain.trim() || submitting} style={{ fontSize: 13, padding: '6px 16px' }}>
                {submitting ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1D9E75', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toastMsg}
        </div>
      )}

      {/* Full details modal */}
      {showDetails && (
        <SeoCompetitorsDetailsModal competitors={competitors} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
}

function SeoCompetitorsDetailsModal({ competitors, onClose }: { competitors: any[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 1100, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Competitors — Full Details</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{competitors.length} tracked</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th>Competitor</th>
                <th style={{ textAlign: 'right' }}>Visibility</th>
                <th style={{ textAlign: 'right' }}>Keywords</th>
                <th style={{ textAlign: 'right' }}>Overlap</th>
                <th style={{ textAlign: 'right' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {competitors.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#5A7A8A', padding: 20 }}>No competitors tracked yet.</td></tr>
              ) : competitors.map((c: any, i: number) => {
                const vis = c.visibility ?? c.visibility_score ?? null;
                const kwCount = c.keywords ?? c.keywords_count ?? c.total_keywords ?? null;
                const overlap = c.overlap ?? c.overlap_percent ?? c.keyword_overlap ?? null;
                const added = c.added_at ?? c.created_at ?? null;
                return (
                  <tr key={c.id ?? i}>
                    <td style={{ fontWeight: 500 }}>{c.competitor ?? c.domain ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{vis != null ? (typeof vis === 'number' ? `${Number(vis).toFixed(1)}%` : String(vis)) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{kwCount ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{overlap != null ? (typeof overlap === 'number' ? `${Math.round(overlap)}%` : String(overlap)) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{added ? new Date(added).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 16, padding: 16, background: '#F8FAFC', borderRadius: 8, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
            <strong style={{ color: '#0B1C24' }}>Coming next:</strong> per-competitor detail — head-to-head keyword comparison (where they rank vs where you rank), their top-traffic pages, their visibility trend over time, and the "keywords they rank for that you don't" gap list. These populate as SE Ranking data accumulates.
          </div>
        </div>
      </div>
    </div>
  );
}
