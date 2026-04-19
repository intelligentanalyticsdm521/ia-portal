/**
 * Phase 3.5 Competitors page (rebuild 2026-04-20 — expansive edition).
 *
 * Layout:
 *   1. Metadata bar: tracked count / slots / See Full Report button
 *   2. Hero cards (6, two rows): Competitors Tracked · Your Domain Trust ·
 *      Top Competitor DT · Your Visibility · Top Keywords · Keyword Overlap
 *   3. Competitor Leaderboard — ranked bar chart by Domain Trust
 *   4. Per-Competitor card grid — each with DT, position, keywords, CTA
 *   5. Share of Voice donut — you vs each competitor
 *   6. Full Report modal (5 tabs):
 *        Added Competitors · Domain Trust Analysis · Content Gap Opportunities ·
 *        Share of Voice · Add Competitor
 */
import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryIcon } from '../../components/Glossary';

type ModalTab = 'added' | 'trust-analysis' | 'content-gap' | 'share-of-voice' | 'add';

export function SeoCompetitors() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [activeTab, setActiveTab] = useState<ModalTab | null>(null);
  const [competitorDomain, setCompetitorDomain] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: compData, loading: compLoading, refetch: refetchComps } = useArionData(
    () => activeSiteId ? arionApi.getSeoCompetitors(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading || compLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const s = seo as Record<string, any> | null;
  const connected = (compData as any)?.connected === true || s?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const competitors: any[] = ((compData as any)?.competitors as any[]) ?? [];
  const compUpstreamErrors: any[] = ((compData as any)?.upstreamErrors as any[]) ?? [];

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

  const tier = (selectedSite?.seoAddonTier || 'starter').toLowerCase();
  const maxCompetitors = tier === 'authority' ? 10 : tier === 'growth' || tier === 'essentials' ? 5 : 2;
  const ourDomainTrust = s?.snapshot?.domainTrust ?? s?.domain?.domainTrust ?? null;
  const ourVisibility = s?.snapshot?.searchVisibility ?? null;
  const ourTop10 = s?.snapshot?.top10Count ?? 0;

  // Enrich competitors with metrics (sort by DT for leaderboard)
  const sortedByDT = [...competitors].sort((a, b) => (Number(b.domainTrust) || 0) - (Number(a.domainTrust) || 0));
  const topComp = sortedByDT[0] ?? null;
  const avgCompDT = competitors.length > 0
    ? Math.round(competitors.reduce((sum, c) => sum + (Number(c.domainTrust) || 0), 0) / competitors.length)
    : 0;
  const maxCompKeywords = Math.max(1, ...competitors.map((c) => Number(c.keywords) || 0));

  const handleAddCompetitor = async () => {
    const domain = competitorDomain.trim();
    if (!domain || !activeSiteId) return;
    setSubmitting(true);
    setAddError(null);
    try {
      await arionApi.addSeoCompetitor(activeSiteId, domain);
      setActiveTab(null);
      setCompetitorDomain('');
      setToastMsg(`Competitor ${domain} added`);
      setTimeout(() => setToastMsg(null), 3000);
      refetchComps();
    } catch (err: any) {
      setAddError(err?.message || 'Could not add competitor. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {compUpstreamErrors.length > 0 && (
        <ErrorBanner message={`SE Ranking returned errors for ${compUpstreamErrors.length} engine(s). The competitor list below may be incomplete until the upstream recovers.`} />
      )}

      <InfoCard title="Competitor Tracking">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12 }}>
            {competitors.length} of {maxCompetitors} competitor slots used ({Math.max(0, maxCompetitors - competitors.length)} available on your {tier} tier).
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setActiveTab('add')}
              disabled={competitors.length >= maxCompetitors}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 6, cursor: competitors.length >= maxCompetitors ? 'not-allowed' : 'pointer', opacity: competitors.length >= maxCompetitors ? 0.5 : 1 }}
            >
              + Add Competitor
            </button>
            <button
              onClick={() => setActiveTab('added')}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Report →
            </button>
          </div>
        </div>
      </InfoCard>

      {/* Hero cards — 6 cards, 2 rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
        <SeoStatCard
          label="Competitors Tracked"
          value={competitors.length}
          sub={`of ${maxCompetitors} on your plan`}
          accent="#2D9CDB"
        />
        <SeoStatCard
          label="Your Domain Trust"
          value={ourDomainTrust ?? '—'}
          sub="0-100 scale"
          accent="#1D9E75"
        />
        <SeoStatCard
          label="Top Competitor DT"
          value={topComp?.domainTrust ?? '—'}
          sub={topComp?.domain || 'No competitors yet'}
          accent="#EF6C33"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        <SeoStatCard
          label="Your Visibility"
          value={ourVisibility != null ? `${Number(ourVisibility).toFixed(1)}%` : '—'}
          sub="CTR-weighted"
          accent="#FEC82C"
          termKey="search_visibility"
        />
        <SeoStatCard
          label="Top 10 Keywords"
          value={ourTop10}
          sub="yours on page 1"
          accent="#7B61FF"
          termKey="top10_keywords"
        />
        <SeoStatCard
          label="Avg Competitor DT"
          value={avgCompDT || '—'}
          sub={`across ${competitors.length} competitors`}
          accent="#0C4A60"
        />
      </div>

      {/* Competitor Leaderboard — Domain Trust bar chart */}
      {competitors.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <WidgetContainer title="Domain Trust Leaderboard" subtitle="Your site vs tracked competitors — higher DT = stronger SEO authority" action={
            <button onClick={() => setActiveTab('trust-analysis')} style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}>See Full Analysis →</button>
          }>
            <DomainTrustLeaderboard competitors={sortedByDT} ourTrust={ourDomainTrust} ourDomain={selectedSite.primaryDomain || 'Your site'} />
          </WidgetContainer>
        </div>
      )}

      {/* Per-competitor card grid */}
      {competitors.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <WidgetContainer title="Tracked Competitors" subtitle="Click any competitor to drill into their detail" action={null}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(competitors.length, 3)}, 1fr)`, gap: 12 }}>
              {sortedByDT.slice(0, 6).map((c, i) => (
                <CompetitorCard
                  key={c.id ?? i}
                  competitor={c}
                  rank={i + 1}
                  maxKeywords={maxCompKeywords}
                  onClick={() => setActiveTab('added')}
                />
              ))}
            </div>
          </WidgetContainer>
        </div>
      )}

      {/* Share of Voice */}
      {competitors.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <WidgetContainer title="Share of Voice" subtitle="Domain authority share across your competitive set (DT-weighted)" action={
            <button onClick={() => setActiveTab('share-of-voice')} style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}>See Full Breakdown →</button>
          }>
            <ShareOfVoice competitors={sortedByDT} ourTrust={ourDomainTrust} ourDomain={selectedSite.primaryDomain || 'Your site'} />
          </WidgetContainer>
        </div>
      )}

      {/* Content Gap teaser */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Content Gap Opportunities" subtitle="Keywords competitors rank for that you don't — your content roadmap" action={
          <button onClick={() => setActiveTab('content-gap')} style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}>See Full Gap →</button>
        }>
          <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Content gap analysis populates from competitor position data</div>
            <p style={{ margin: '0 auto', maxWidth: 520 }}>
              Once we've captured 2 weeks of competitor position history, we can identify keywords where competitors rank top-10 but you don't — your highest-ROI content targets. First batch lands on your next Market Monitor cycle.
            </p>
          </div>
        </WidgetContainer>
      </div>

      <ConsultingUpsell
        headline="Your competitors are winning keywords you could own. Let IA close the gap."
        subtext="Competitive SEO analysis and counter-strategy, custom content plans per quarter."
        serviceType="SEO Strategy"
        triggerPage="seo-competitors"
      />

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1D9E75', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toastMsg}
        </div>
      )}

      {activeTab && (
        <CompetitorsDetailsModal
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => { setActiveTab(null); setAddError(null); }}
          competitors={sortedByDT}
          ourTrust={ourDomainTrust}
          ourDomain={selectedSite.primaryDomain || 'Your site'}
          ourVisibility={ourVisibility}
          competitorDomain={competitorDomain}
          setCompetitorDomain={setCompetitorDomain}
          submitting={submitting}
          addError={addError}
          onAddCompetitor={handleAddCompetitor}
          maxCompetitors={maxCompetitors}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Widget components
// ────────────────────────────────────────────────────────────────

function WidgetContainer({ title, subtitle, action, children }: { title: string; subtitle?: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function DomainTrustLeaderboard({ competitors, ourTrust, ourDomain }: { competitors: any[]; ourTrust: number | null; ourDomain: string }) {
  // Build a ranked list including "us" for visual comparison
  const entries = [
    { name: ourDomain, dt: Number(ourTrust) || 0, isYou: true },
    ...competitors.map((c) => ({ name: c.domain || c.competitor, dt: Number(c.domainTrust) || 0, isYou: false })),
  ].sort((a, b) => b.dt - a.dt);

  return (
    <div style={{ height: Math.max(220, 40 * entries.length) }}>
      <ResponsiveContainer>
        <BarChart data={entries} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#5A7A8A' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#0B1C24' }} width={180} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any) => [`DT ${v}`, 'Domain Trust']} />
          <Bar dataKey="dt" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#0B1C24', fontWeight: 600 }}>
            {entries.map((e, i) => (
              <Cell key={i} fill={e.isYou ? '#EF6C33' : '#2D9CDB'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompetitorCard({ competitor, rank, maxKeywords, onClick }: { competitor: any; rank: number; maxKeywords: number; onClick: () => void }) {
  const dt = Number(competitor.domainTrust) || 0;
  const kw = Number(competitor.keywords) || 0;
  const dtColor = dt >= 70 ? '#1D9E75' : dt >= 40 ? '#EF6C33' : '#D85A30';
  const kwPct = maxKeywords > 0 ? (kw / maxKeywords) * 100 : 0;
  return (
    <button
      onClick={onClick}
      style={{ background: '#F8FAFC', borderLeft: `3px solid ${dtColor}`, borderRadius: 8, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
          {competitor.domain}
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>#{rank}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: dtColor }}>{dt}</span>
        <span style={{ fontSize: 10, color: '#5A7A8A' }}>domain trust</span>
      </div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginBottom: 4 }}>
        Tracked keywords: <strong style={{ color: '#0B1C24' }}>{kw || '—'}</strong>
      </div>
      {kw > 0 && (
        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 99, marginBottom: 8 }}>
          <div style={{ width: `${kwPct}%`, height: '100%', background: dtColor, borderRadius: 99 }} />
        </div>
      )}
      <div style={{ fontSize: 10, color: '#2D9CDB', fontWeight: 600, marginTop: 6 }}>View comparison →</div>
    </button>
  );
}

function ShareOfVoice({ competitors, ourTrust, ourDomain }: { competitors: any[]; ourTrust: number | null; ourDomain: string }) {
  const entries = [
    { name: ourDomain, value: Number(ourTrust) || 0, isYou: true },
    ...competitors.map((c) => ({ name: c.domain || c.competitor, value: Number(c.domainTrust) || 0, isYou: false })),
  ].filter((e) => e.value > 0);

  const COLORS = ['#EF6C33', '#2D9CDB', '#1D9E75', '#7B61FF', '#FEC82C', '#D85A30', '#0C4A60', '#4285F4', '#94A3B8', '#6B9402', '#C55'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={entries} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} stroke="#fff" strokeWidth={2}>
              {entries.map((e, i) => <Cell key={i} fill={e.isYou ? '#EF6C33' : COLORS[(i + 1) % COLORS.length]} />)}
            </Pie>
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any, n: any) => [`DT ${v}`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        {entries.map((e, i) => {
          const totalDT = entries.reduce((s, x) => s + x.value, 0);
          const pct = totalDT > 0 ? ((e.value / totalDT) * 100).toFixed(1) : '0';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: e.isYou ? '#EF6C33' : COLORS[(i + 1) % COLORS.length] }} />
              <span style={{ flex: 1, color: '#0B1C24', fontWeight: e.isYou ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}{e.isYou ? ' (you)' : ''}</span>
              <span style={{ color: '#5A7A8A', fontSize: 10 }}>DT {e.value}</span>
              <span style={{ width: 40, textAlign: 'right', fontWeight: 600, color: '#0B1C24' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Full Report modal
// ────────────────────────────────────────────────────────────────

function CompetitorsDetailsModal({
  activeTab, setActiveTab, onClose, competitors, ourTrust, ourDomain, ourVisibility,
  competitorDomain, setCompetitorDomain, submitting, addError, onAddCompetitor, maxCompetitors,
}: {
  activeTab: ModalTab;
  setActiveTab: (t: ModalTab) => void;
  onClose: () => void;
  competitors: any[];
  ourTrust: number | null;
  ourDomain: string;
  ourVisibility: number | null;
  competitorDomain: string;
  setCompetitorDomain: (s: string) => void;
  submitting: boolean;
  addError: string | null;
  onAddCompetitor: () => void;
  maxCompetitors: number;
}) {
  const tabs: Array<{ id: ModalTab; label: string }> = [
    { id: 'added', label: 'Added Competitors' },
    { id: 'trust-analysis', label: 'Domain Trust Analysis' },
    { id: 'content-gap', label: 'Content Gap' },
    { id: 'share-of-voice', label: 'Share of Voice' },
    { id: 'add', label: '+ Add Competitor' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Competitors</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>Full Report</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 6px' }}>&times;</button>
        </div>

        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: 600,
                background: 'transparent',
                color: activeTab === t.id ? '#0B1C24' : '#94A3B8',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #0B1C24' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {activeTab === 'added' && <AddedCompetitorsTab competitors={competitors} />}
          {activeTab === 'trust-analysis' && <TrustAnalysisTab competitors={competitors} ourTrust={ourTrust} ourDomain={ourDomain} />}
          {activeTab === 'content-gap' && <ContentGapTab competitors={competitors} ourVisibility={ourVisibility} />}
          {activeTab === 'share-of-voice' && <ShareOfVoiceTab competitors={competitors} ourTrust={ourTrust} ourDomain={ourDomain} />}
          {activeTab === 'add' && (
            <AddCompetitorTab
              competitorDomain={competitorDomain}
              setCompetitorDomain={setCompetitorDomain}
              submitting={submitting}
              addError={addError}
              onAddCompetitor={onAddCompetitor}
              maxCompetitors={maxCompetitors}
              currentCount={competitors.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AddedCompetitorsTab({ competitors }: { competitors: any[] }) {
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Competitor</th>
          <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Domain Trust</th>
          <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Tracked Keywords</th>
          <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Added</th>
        </tr>
      </thead>
      <tbody>
        {competitors.length === 0 ? (
          <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#94A3B8' }}>No competitors tracked yet.</td></tr>
        ) : competitors.map((c, i) => (
          <tr key={c.id ?? i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 6px', fontWeight: 500 }}>
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{c.domain}</a> : c.domain}
            </td>
            <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{c.domainTrust ?? '—'}</td>
            <td style={{ textAlign: 'right', padding: '8px 6px' }}>{c.keywords ?? '—'}</td>
            <td style={{ textAlign: 'right', padding: '8px 6px', color: '#5A7A8A' }}>{c.added_at ? new Date(c.added_at).toLocaleDateString() : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrustAnalysisTab({ competitors, ourTrust, ourDomain }: { competitors: any[]; ourTrust: number | null; ourDomain: string }) {
  const ours = Number(ourTrust) || 0;
  const above = competitors.filter((c) => (Number(c.domainTrust) || 0) > ours);
  const below = competitors.filter((c) => (Number(c.domainTrust) || 0) < ours);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#F8FAFC', borderLeft: '3px solid #EF6C33', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Your DT</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{ours}</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{ourDomain}</div>
        </div>
        <div style={{ background: '#F8FAFC', borderLeft: '3px solid #D85A30', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Stronger than you</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#D85A30', marginTop: 4 }}>{above.length}</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>need to close the gap</div>
        </div>
        <div style={{ background: '#F8FAFC', borderLeft: '3px solid #1D9E75', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Weaker than you</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1D9E75', marginTop: 4 }}>{below.length}</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>you outrank them</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Gap vs your domain trust</div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Competitor</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Their DT</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Gap</th>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Position</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c, i) => {
            const theirs = Number(c.domainTrust) || 0;
            const gap = theirs - ours;
            const color = gap > 0 ? '#D85A30' : gap < 0 ? '#1D9E75' : '#5A7A8A';
            return (
              <tr key={c.id ?? i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 6px', fontWeight: 500 }}>{c.domain}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{theirs}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', color, fontWeight: 600 }}>{gap > 0 ? `+${gap}` : gap}</td>
                <td style={{ padding: '8px 6px', fontSize: 11, color }}>
                  {gap > 0 ? 'Above you — close the gap' : gap < 0 ? 'Below you — maintain lead' : 'Tied'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContentGapTab({ competitors, ourVisibility }: { competitors: any[]; ourVisibility: number | null }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.6, marginBottom: 16 }}>
        Content gap analysis surfaces keywords your competitors rank top-10 for but you don't — your highest-ROI content targets. Data populates once the Market Monitor has captured 2 weeks of competitor position history (currently building — check back after next weekly cycle).
      </div>
      <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Data accumulating</div>
        <p style={{ fontSize: 12, color: '#5A7A8A', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Market Monitor is capturing daily competitor positions. With 2+ weeks of data we can reliably identify keywords where competitors rank well (top 10) but you don't — along with estimated traffic impact if you captured them.
        </p>
      </div>
      <ConsultingUpsell
        headline="IA can identify your top content gap opportunities now using manual research"
        subtext="Our strategists combine SE Ranking's real-time SERP data, Ahrefs competitor intel, and human insight to surface 20+ high-opportunity keywords immediately."
        serviceType="SEO Strategy"
        triggerPage="seo-competitors-gap"
      />
    </div>
  );
}

function ShareOfVoiceTab({ competitors, ourTrust, ourDomain }: { competitors: any[]; ourTrust: number | null; ourDomain: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.6, marginBottom: 16 }}>
        Share of voice approximated from domain trust. For keyword-weighted share of voice (counting impressions and CTR across your tracked keyword set), we need 2+ weeks of competitor position history — check back after next weekly Market Monitor cycle.
      </div>
      <ShareOfVoice competitors={competitors} ourTrust={ourTrust} ourDomain={ourDomain} />
    </div>
  );
}

function AddCompetitorTab({
  competitorDomain, setCompetitorDomain, submitting, addError, onAddCompetitor, maxCompetitors, currentCount,
}: {
  competitorDomain: string;
  setCompetitorDomain: (s: string) => void;
  submitting: boolean;
  addError: string | null;
  onAddCompetitor: () => void;
  maxCompetitors: number;
  currentCount: number;
}) {
  const atLimit = currentCount >= maxCompetitors;
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ fontSize: 13, color: '#0B1C24', marginBottom: 14 }}>
        Track a new competitor's SEO performance alongside yours. {maxCompetitors - currentCount} slots remaining on your tier.
      </div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 500, color: '#0B1C24' }}>Competitor domain</label>
      <input
        type="text"
        value={competitorDomain}
        onChange={(e) => setCompetitorDomain(e.target.value)}
        placeholder="e.g. competitor.com"
        disabled={submitting || atLimit}
        onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) onAddCompetitor(); }}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, border: '1px solid #d5e0e8', marginBottom: 12, boxSizing: 'border-box' }}
      />
      {addError && (
        <div style={{ fontSize: 12, color: '#D85A30', marginBottom: 12, padding: '6px 10px', background: 'rgba(216,90,48,0.08)', borderRadius: 4 }}>
          {addError}
        </div>
      )}
      {atLimit && (
        <div style={{ fontSize: 12, color: '#EF6C33', marginBottom: 12, padding: '6px 10px', background: 'rgba(239,108,51,0.08)', borderRadius: 4 }}>
          You've reached your tier's competitor limit. Upgrade to Authority for up to 10 competitors, or contact IA Consulting for custom tracking.
        </div>
      )}
      <button
        onClick={onAddCompetitor}
        disabled={!competitorDomain.trim() || submitting || atLimit}
        style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: atLimit ? '#CBD5E1' : '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: atLimit || submitting ? 'not-allowed' : 'pointer' }}
      >
        {submitting ? 'Adding…' : 'Add Competitor'}
      </button>
    </div>
  );
}
