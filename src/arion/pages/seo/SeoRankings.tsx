import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, AddonUpsell, EmptyPanel, Loading, InfoCard, PlatformTabs, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { TrendChart } from '../../components/Charts';
import { SeoDiagnosticPanel } from '../../components/SeoDiagnosticPanel';

/**
 * Phase 3 / Step 4.1 — uses the dedicated /arion/seo/rankings endpoint
 * which joins /positions with /keywords so keyword NAMES always populate.
 */
export function SeoRankings() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [engine, setEngine] = React.useState<'all' | 'google' | 'bing'>('all');

  const { data: rankings, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoRankings(activeSiteId, engine) : Promise.resolve(null),
    [activeSiteId, engine]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const r = rankings as any;
  const connected = r?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Powered by SE Ranking. Track keyword positions, run site audits, monitor competitors, and discover ranking opportunities."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  const keywords: any[] = r?.keywords || [];
  const visibility = r?.visibilityScore != null ? `${Number(r.visibilityScore).toFixed(1)}%` : '--';
  const avgPos = r?.avgPosition != null ? Number(r.avgPosition).toFixed(1) : '--';
  const top10 = r?.top10Count ?? keywords.filter(k => typeof k.currentPosition === 'number' && k.currentPosition <= 10).length;
  const upstreamError = r?.upstreamError as { positions?: string | null; keywords?: string | null; project?: string | null; keyConfigured?: boolean } | null;
  const hasUpstreamFailure = upstreamError != null && (upstreamError.positions || upstreamError.keywords || upstreamError.project);

  // Top 20 by best rank for trend chart
  const trendData = [...keywords]
    .filter(k => typeof k.currentPosition === 'number')
    .sort((a, b) => a.currentPosition - b.currentPosition)
    .slice(0, 20)
    .map(k => ({ keyword: (k.keyword || '').slice(0, 15), position: k.currentPosition }));

  return (
    <div>
      {connected && (
        <InfoCard title="SE Ranking — Connected">
          <p style={{ margin: 0 }}>
            Tracked Keywords: <strong>{keywords.length}</strong> | Avg Position: <strong>{avgPos}</strong> | Search Visibility: <strong>{visibility}</strong> | Top 10: <strong>{top10}</strong>
          </p>
        </InfoCard>
      )}

      {hasUpstreamFailure && upstreamError && (
        <ErrorBanner
          message={
            `SE Ranking API returned errors for this project. ${upstreamError.keyConfigured === false ? 'The project API key is not configured on this server — add SERANKING_API_SYSTEM_KEY in App Settings. ' : ''}${[
              upstreamError.positions && `positions: ${upstreamError.positions}`,
              upstreamError.keywords && `keywords: ${upstreamError.keywords}`,
              upstreamError.project && `project: ${upstreamError.project}`,
            ].filter(Boolean).join(' · ')}`
          }
        />
      )}

      <SeoDiagnosticPanel siteId={activeSiteId ?? null} />

      <div className="grid3" style={{ marginTop: connected ? 12 : 0 }}>
        <StatCard label="Tracked Keywords" value={String(keywords.length)} deltaType="neutral" />
        <StatCard label="Avg Position" value={String(avgPos)} deltaType="neutral" />
        <StatCard label="Search Visibility" value={String(visibility)} deltaType="neutral" />
      </div>

      <PlatformTabs
        tabs={[
          { key: 'all', label: 'All Engines' },
          { key: 'google', label: 'Google' },
          { key: 'bing', label: 'Bing' },
        ]}
        active={engine}
        onChange={(k) => setEngine(k as any)}
      />

      <Card title="Keyword Rankings">
        <table className="data-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Position</th>
              <th>Change</th>
              <th>Volume</th>
              <th>Difficulty</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {keywords.length > 0 ? keywords.map((k: any, i: number) => {
              const change = Number(k.positionChange || 0);
              const changeColor = change > 0 ? '#1D9E75' : change < 0 ? '#D85A30' : 'var(--text-muted, #64748b)';
              const changeText = change > 0 ? `+${change}` : change < 0 ? String(change) : '—';
              return (
                <tr key={k.keywordId ?? i}>
                  <td>{k.keyword || '--'}</td>
                  <td>{k.currentPosition ?? '--'}</td>
                  <td style={{ color: changeColor, fontWeight: change !== 0 ? 600 : 400 }}>{changeText}</td>
                  <td>{k.searchVolume ?? '--'}</td>
                  <td>{k.difficulty ?? '--'}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{k.url ? <a href={k.url} target="_blank" rel="noopener noreferrer">{k.url}</a> : '--'}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Ranking data is being collected. Check back soon.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {trendData.length > 0 && (
        <Card title="Position Distribution (Top 20 Keywords)" style={{ marginTop: 12 }}>
          <TrendChart data={trendData} dataKey="position" xKey="keyword" height={200} />
        </Card>
      )}

      <ConsultingUpsell
        headline="These rankings are your growth roadmap. IA builds a 90-day plan to reach page 1."
        subtext="Our SEO strategists analyze your keyword landscape and build a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-rankings"
      />
    </div>
  );
}
