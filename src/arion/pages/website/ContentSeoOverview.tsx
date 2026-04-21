import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ConsultingUpsell, InfoCard } from '../../components/Ui';

/**
 * Content SEO — the consolidated storytelling page.
 *
 * Single page that replaces the previous four-page setup (Overview / Pages /
 * Posts / Schema). Clients land here and get the full SEO-health story in
 * one view:
 *
 *   1. Hero tiles: 5 big numbers you care about most
 *   2. Score distribution bar chart (how SEO scores spread across content)
 *   3. Problem breakdown donut (missing meta, no FK, low score, noindex)
 *   4. Focus-keyword coverage ring
 *   5. Top-opportunity table (pages worth fixing first)
 *   6. "See full details" button → modal with every page + post + filterable
 */
export function ContentSeoOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [drillDownType, setDrillDownType] = useState<'pages' | 'posts' | 'issues' | 'readability' | 'all'>('all');

  // Live Rank Math aggregate from the IA Plugin
  const { data: aggEnv, loading: aggLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginContentAggregate(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  // Per-page/per-post SEO detail (wp/v2 + rankmath/v1 via backend)
  const { data: detailData, loading: detailLoading } = useArionData(
    () => activeSiteId ? arionApi.getContentSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  // v2.0.7 — comprehensive per-post SEO with schema + readability
  const { data: seoFullDetail } = useArionData(
    () => activeSiteId ? arionApi.getPluginContentSeoDetail(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  // ALL derivations happen above any early return so the hook order stays
  // stable across renders (React Rules of Hooks).
  const env = (aggEnv as any) || {};
  const pluginConnected = env.plugin_status === 'connected';
  const seo = env.data?.seo || null;
  const d = (detailData as any)?.data || {};
  const pages: any[] = Array.isArray(d.pages) ? d.pages : [];
  const posts: any[] = Array.isArray(d.posts) ? d.posts : [];
  const items: any[] = useMemo(() => [...pages, ...posts], [pages, posts]);

  // Build score-bucket distribution from live detail data
  const scoreBuckets = useMemo(() => {
    const buckets = { '0-30': 0, '30-50': 0, '50-70': 0, '70-90': 0, '90-100': 0 };
    for (const it of items) {
      const s = it.seo_score;
      if (s == null || isNaN(Number(s))) continue;
      const score = Number(s);
      if (score < 30) buckets['0-30']++;
      else if (score < 50) buckets['30-50']++;
      else if (score < 70) buckets['50-70']++;
      else if (score < 90) buckets['70-90']++;
      else buckets['90-100']++;
    }
    return [
      { range: '0-30', count: buckets['0-30'], color: '#D85A30', label: 'Poor' },
      { range: '30-50', count: buckets['30-50'], color: '#F59E0B', label: 'Weak' },
      { range: '50-70', count: buckets['50-70'], color: '#D4A800', label: 'Average' },
      { range: '70-90', count: buckets['70-90'], color: '#1D9E75', label: 'Good' },
      { range: '90-100', count: buckets['90-100'], color: '#065F46', label: 'Excellent' },
    ];
  }, [items]);

  // Top opportunity table: lowest-score items + pages missing meta
  const topOpportunities = useMemo(() => {
    const scored = items.filter((it) => it.seo_score != null);
    return [...scored]
      .sort((a, b) => (Number(a.seo_score) || 0) - (Number(b.seo_score) || 0))
      .slice(0, 10);
  }, [items]);

  // v2.0.7 — schema + readability from per-post detail
  const detailFull = useMemo(() => (seoFullDetail as any)?.data || {}, [seoFullDetail]);
  const schemaEntries = useMemo(() => {
    const sc = detailFull.schema_counts || {};
    const palette = ['#0284c7', '#7c3aed', '#1D9E75', '#D97706', '#D85A30', '#64748B', '#EC4899', '#14B8A6'];
    return Object.entries(sc)
      .sort((a: any, b: any) => b[1] - a[1])
      .map(([name, count], i) => ({
        name: name === 'none' ? 'No schema' : name,
        value: count as number,
        color: name === 'none' ? '#94A3B8' : palette[i % palette.length],
      }));
  }, [detailFull]);
  const avgReadability = detailFull.avg_readability ?? null;
  const detailRows: any[] = useMemo(() => detailFull.rows || [], [detailFull]);

  // Pages vs Posts comparison (grouped bars)
  const typeComparison = useMemo(() => {
    const stats = { pages: { count: 0, withScore: 0, scoreSum: 0, missingMeta: 0, missingFk: 0 }, posts: { count: 0, withScore: 0, scoreSum: 0, missingMeta: 0, missingFk: 0 } };
    for (const r of detailRows) {
      const t = r.type === 'page' ? 'pages' : 'posts';
      stats[t].count++;
      if (r.seo_score > 0) { stats[t].withScore++; stats[t].scoreSum += r.seo_score; }
      if (!r.has_meta_desc) stats[t].missingMeta++;
      if (!r.focus_keyword) stats[t].missingFk++;
    }
    return [
      { metric: 'Count',        Pages: stats.pages.count,       Posts: stats.posts.count },
      { metric: 'Avg score',    Pages: stats.pages.withScore ? Math.round(stats.pages.scoreSum / stats.pages.withScore) : 0, Posts: stats.posts.withScore ? Math.round(stats.posts.scoreSum / stats.posts.withScore) : 0 },
      { metric: 'Missing meta', Pages: stats.pages.missingMeta, Posts: stats.posts.missingMeta },
      { metric: 'Missing FK',   Pages: stats.pages.missingFk,   Posts: stats.posts.missingFk },
    ];
  }, [detailRows]);

  // Readability histogram (buckets of 10)
  const readabilityBuckets = useMemo(() => {
    const buckets = { '<40': 0, '40-60': 0, '60-80': 0, '80-100': 0 };
    for (const r of detailRows) {
      const s = r.readability;
      if (!s || s <= 0) continue;
      if (s < 40) buckets['<40']++;
      else if (s < 60) buckets['40-60']++;
      else if (s < 80) buckets['60-80']++;
      else buckets['80-100']++;
    }
    return [
      { range: '<40',   count: buckets['<40'],    color: '#D85A30', label: 'Difficult' },
      { range: '40-60', count: buckets['40-60'],  color: '#F59E0B', label: 'Fair' },
      { range: '60-80', count: buckets['60-80'],  color: '#1D9E75', label: 'Good' },
      { range: '80-100',count: buckets['80-100'], color: '#065F46', label: 'Excellent' },
    ];
  }, [detailRows]);

  // NOW the early returns are safe — all hooks already ran
  if (loading || aggLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  if (!pluginConnected || !seo?.installed) {
    return (
      <div>
        <InfoCard title="Content SEO">
          <p style={{ margin: 0, fontSize: 13 }}>
            Content SEO intelligence is powered by Rank Math SEO inside the IA Plugin. Make sure the IA Plugin is connected and Rank Math is active on your WordPress site to see per-page SEO scores, focus keywords, and meta-completeness tracking.
          </p>
        </InfoCard>
        <div style={{ marginTop: 14, padding: 40, background: '#F8FAFC', borderRadius: 10, textAlign: 'center', border: '1px dashed #d5e0e8' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>
            {!pluginConnected ? 'Waiting on the IA Plugin' : 'Rank Math not detected'}
          </div>
          <div style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 550, margin: '0 auto', lineHeight: 1.6 }}>
            {!pluginConnected
              ? 'The IA Plugin is not currently reachable. Visit Website → Overview for connection status.'
              : (
                <>
                  We checked for Rank Math (free + Pro) and the global <code>RANK_MATH_VERSION</code> constant — none are present on this site. Install it via WP Admin → Plugins → Add New → search "Rank Math SEO", activate it, then refresh this page.
                  <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8' }}>
                    If Rank Math is installed but you're still seeing this message, the plugin folder might be renamed. Reinstall from the WP Plugins directory and it should auto-detect.
                  </div>
                </>
              )}
          </div>
        </div>
      </div>
    );
  }

  // Derived narrative numbers (post-guard — these can safely use seo.* now)
  const totalPublished = seo.total_published || 0;
  const postsWithScore = seo.posts_with_seo_score || 0;
  const coveragePct = totalPublished > 0 ? Math.round((postsWithScore / totalPublished) * 100) : 0;
  const avgScore = seo.avg_seo_score != null ? Number(seo.avg_seo_score) : null;
  const lowScoreCount = seo.posts_score_below_50 || 0;
  const missingMeta = seo.posts_missing_meta_desc || 0;
  const missingFK = seo.posts_missing_focus_kw || 0;
  const noindexCount = seo.posts_noindex || 0;

  // Problem donut (computed after guard — no hook needed)
  const problemData = [
    { name: 'Missing meta desc', value: missingMeta, color: '#D85A30' },
    { name: 'Missing focus keyword', value: missingFK, color: '#EF6C33' },
    { name: 'Low score (<50)', value: lowScoreCount, color: '#F59E0B' },
    { name: 'Marked noindex', value: noindexCount, color: '#5A7A8A' },
  ].filter((d) => d.value > 0);
  const problemTotal = problemData.reduce((s, d) => s + d.value, 0);

  // Per-type counts for the Pages / Posts cards
  const pagesOnly = items.filter((it) => (it.type || '').toLowerCase() === 'page');
  const postsOnly = items.filter((it) => (it.type || '').toLowerCase() === 'post');
  const pagesWithScoreArr = pagesOnly.filter((it) => it.seo_score != null);
  const postsWithScoreArr = postsOnly.filter((it) => it.seo_score != null);
  const pagesAvg = pagesWithScoreArr.length ? Math.round(pagesWithScoreArr.reduce((s, it) => s + Number(it.seo_score || 0), 0) / pagesWithScoreArr.length) : null;
  const postsAvg = postsWithScoreArr.length ? Math.round(postsWithScoreArr.reduce((s, it) => s + Number(it.seo_score || 0), 0) / postsWithScoreArr.length) : null;
  const pagesMissing = pagesOnly.filter((it) => !it.meta_desc || !it.focus_keyword).length;
  const postsMissing = postsOnly.filter((it) => !it.meta_desc || !it.focus_keyword).length;

  // Top 5 problem items per type (worst scores first, then missing meta/FK)
  const scoreRank = (it: any) => (it.seo_score != null ? Number(it.seo_score) : 100) + (it.meta_desc ? 0 : -10) + (it.focus_keyword ? 0 : -10);
  const pagesTop5 = [...pagesOnly].sort((a, b) => scoreRank(a) - scoreRank(b)).slice(0, 5);
  const postsTop5 = [...postsOnly].sort((a, b) => scoreRank(a) - scoreRank(b)).slice(0, 5);

  // Composite Content SEO Health Score — weighted blend
  //   Coverage   30% | Avg Score  40% | Missing meta/FK (inverse) 20% | Low-score (inverse) 10%
  const healthScore = (() => {
    const parts: Array<{ value: number | null; weight: number }> = [];
    parts.push({ value: coveragePct, weight: 30 });
    parts.push({ value: avgScore, weight: 40 });
    const missingRatio = totalPublished > 0 ? ((missingMeta + missingFK) / (totalPublished * 2)) : 0;
    parts.push({ value: Math.max(0, 100 - missingRatio * 100), weight: 20 });
    const lowRatio = totalPublished > 0 ? (lowScoreCount / totalPublished) : 0;
    parts.push({ value: Math.max(0, 100 - lowRatio * 100), weight: 10 });
    const usable = parts.filter((p) => p.value != null);
    if (usable.length === 0) return null;
    const total = usable.reduce((s, p) => s + p.weight, 0);
    return Math.round(usable.reduce((s, p) => s + (p.value as number) * p.weight, 0) / total);
  })();

  // Readability problem flag
  const hardToReadCount = detailRows.filter((r: any) => r.readability != null && r.readability > 0 && r.readability < 40).length;
  const noReadabilityCount = detailRows.filter((r: any) => !r.readability || r.readability === 0).length;

  return (
    <div>
      {/* Hero stat tiles — compact summary numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <HeroTile
          label="Average SEO Score"
          value={avgScore != null ? String(Math.round(avgScore)) : '—'}
          sub={avgScore != null && avgScore >= 70 ? 'Strong' : avgScore != null && avgScore >= 50 ? 'Improving' : 'Needs work'}
          tone={avgScore != null && avgScore >= 70 ? 'ok' : avgScore != null && avgScore >= 50 ? 'warn' : 'err'}
        />
        <HeroTile
          label="Coverage"
          value={`${coveragePct}%`}
          sub={`${postsWithScore} of ${totalPublished} analyzed`}
          tone={coveragePct >= 80 ? 'ok' : 'warn'}
        />
        <HeroTile
          label="Missing meta desc"
          value={String(missingMeta)}
          sub={missingMeta > 0 ? 'Quick fix' : 'Clean'}
          tone={missingMeta > 0 ? 'warn' : 'ok'}
        />
        <HeroTile
          label="Missing focus keyword"
          value={String(missingFK)}
          sub={missingFK > 0 ? 'Priority fix' : 'Clean'}
          tone={missingFK > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* Coverage narrative banner — moved under hero tiles with embedded See Full Details link */}
      <div style={{
        padding: '14px 16px', marginBottom: 14, borderRadius: 4,
        background: coveragePct >= 80 ? '#F0FDF4' : '#FEF3C7',
        borderLeft: `3px solid ${coveragePct >= 80 ? '#1D9E75' : '#D97706'}`,
        display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>
            {coveragePct >= 80 ? 'Strong content SEO coverage' : coveragePct >= 50 ? 'Content SEO coverage needs expansion' : 'Most content lacks SEO analysis'}
          </div>
          <div style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.6 }}>
            {coveragePct >= 80 ? (
              <>You're analyzing <strong>{postsWithScore}</strong> of <strong>{totalPublished}</strong> published pieces. Focus on lifting scores on the remaining low-score posts.</>
            ) : (
              <>Only <strong>{postsWithScore}</strong> of <strong>{totalPublished}</strong> published pieces have Rank Math scores. Adding focus keywords + meta descriptions to the uncovered posts is the fastest way to improve overall SEO health.</>
            )}
          </div>
        </div>
        <button
          onClick={() => { setDrillDownType('all'); setModalOpen(true); }}
          style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          See Full Details →
        </button>
      </div>

      {/* Pages + Posts cards with top 5 items each */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Card title={`Pages (${pagesOnly.length})`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'baseline' }}>
            <div style={{ fontSize: 11, color: '#5A7A8A' }}>
              Avg score <strong style={{ color: pagesAvg == null ? '#94A3B8' : pagesAvg >= 70 ? '#1D9E75' : pagesAvg >= 50 ? '#D97706' : '#D85A30', fontSize: 14 }}>{pagesAvg ?? '—'}</strong>
              {pagesMissing > 0 && <> · <strong style={{ color: '#D85A30' }}>{pagesMissing}</strong> need attention</>}
            </div>
          </div>
          {pagesTop5.length === 0 ? (
            <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12, textAlign: 'center', background: '#F8FAFC', borderRadius: 4 }}>No pages found.</div>
          ) : (
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <tbody>
                {pagesTop5.map((it, i) => (
                  <tr key={it.id || i}>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{it.title || '—'}</a>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: it.seo_score == null ? '#94A3B8' : it.seo_score >= 70 ? '#1D9E75' : it.seo_score >= 50 ? '#D4A800' : '#D85A30' }}>{it.seo_score ?? '—'}</td>
                    <td style={{ fontSize: 9, width: 60 }}>
                      {!it.meta_desc && <span style={{ color: '#991B1B' }}>no meta</span>}
                      {!it.focus_keyword && <span style={{ color: '#991B1B', marginLeft: 4 }}>no kw</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            onClick={() => { setDrillDownType('pages'); setModalOpen(true); }}
            style={{ marginTop: 10, padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', width: '100%' }}
          >
            See Page details →
          </button>
        </Card>

        <Card title={`Posts (${postsOnly.length})`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'baseline' }}>
            <div style={{ fontSize: 11, color: '#5A7A8A' }}>
              Avg score <strong style={{ color: postsAvg == null ? '#94A3B8' : postsAvg >= 70 ? '#1D9E75' : postsAvg >= 50 ? '#D97706' : '#D85A30', fontSize: 14 }}>{postsAvg ?? '—'}</strong>
              {postsMissing > 0 && <> · <strong style={{ color: '#D85A30' }}>{postsMissing}</strong> need attention</>}
            </div>
          </div>
          {postsTop5.length === 0 ? (
            <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12, textAlign: 'center', background: '#F8FAFC', borderRadius: 4 }}>No posts found.</div>
          ) : (
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <tbody>
                {postsTop5.map((it, i) => (
                  <tr key={it.id || i}>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{it.title || '—'}</a>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: it.seo_score == null ? '#94A3B8' : it.seo_score >= 70 ? '#1D9E75' : it.seo_score >= 50 ? '#D4A800' : '#D85A30' }}>{it.seo_score ?? '—'}</td>
                    <td style={{ fontSize: 9, width: 60 }}>
                      {!it.meta_desc && <span style={{ color: '#991B1B' }}>no meta</span>}
                      {!it.focus_keyword && <span style={{ color: '#991B1B', marginLeft: 4 }}>no kw</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            onClick={() => { setDrillDownType('posts'); setModalOpen(true); }}
            style={{ marginTop: 10, padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', width: '100%' }}
          >
            See Post details →
          </button>
        </Card>
      </div>

      {/* Health Score + Problem Breakdown horizontal bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
        <Card title="Content SEO Health">
          {healthScore == null ? (
            <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12 }}>Computing…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
              <div style={{
                fontSize: 56, fontWeight: 700, lineHeight: 1,
                color: healthScore >= 80 ? '#1D9E75' : healthScore >= 50 ? '#D97706' : '#D85A30',
              }}>
                {healthScore}
              </div>
              <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>out of 100</div>
              <div style={{ fontSize: 11, color: '#0B1C24', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
                {healthScore >= 80 && 'Content SEO is in great shape.'}
                {healthScore >= 50 && healthScore < 80 && 'Good foundation, with room to improve.'}
                {healthScore < 50 && 'Needs attention — start with the missing meta + focus keywords.'}
              </div>
              <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
                Coverage 30% · Avg score 40% · Completeness 20% · Low-score 10%
              </div>
            </div>
          )}
        </Card>

        <Card title="Problem breakdown">
          {problemTotal === 0 ? (
            <div style={{ padding: 16, color: '#065F46', fontSize: 12, textAlign: 'center', background: '#F0FDF4', borderRadius: 6 }}>
              ✓ No critical SEO problems on any published content.
            </div>
          ) : (
            <>
              <div style={{ height: 140 }}>
                <ResponsiveContainer>
                  <BarChart data={problemData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} width={160} />
                    <RTooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {problemData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => { setDrillDownType('issues'); setModalOpen(true); }}
                  style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                >
                  See Full Details → Issues
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Readability flag card */}
      <div style={{ marginBottom: 14 }}>
        <Card title={`Readability ${avgReadability != null ? `(avg ${avgReadability})` : ''}`}>
          {hardToReadCount > 0 ? (
            <div style={{ padding: '12px 14px', background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 4, fontSize: 12, color: '#0B1C24', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#78350F' }}>{hardToReadCount} post{hardToReadCount === 1 ? '' : 's'} hard to read</strong> — Rank Math readability score below 40. Hard-to-read content loses engagement + rankings faster than thin content.
              </div>
              <button
                onClick={() => { setDrillDownType('readability'); setModalOpen(true); }}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 12, flexShrink: 0 }}
              >
                See Full Details → Readability
              </button>
            </div>
          ) : avgReadability != null ? (
            <div style={{ padding: '12px 14px', background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, fontSize: 12, color: '#065F46' }}>
              ✓ Readability looks good across your content. Average score {avgReadability}.
            </div>
          ) : noReadabilityCount > 0 ? (
            <div style={{ padding: '12px 14px', background: '#EFF6FF', borderLeft: '3px solid #0284c7', borderRadius: 4, fontSize: 12, color: '#0B1C24', lineHeight: 1.6 }}>
              <strong style={{ color: '#0C4A60' }}>Readability scores not yet generated.</strong> Rank Math only creates readability scores when posts are opened + saved in the WordPress editor. Your {noReadabilityCount} existing posts haven't been re-saved since Rank Math was installed, so they don't have scores yet.
              <div style={{ marginTop: 6, fontSize: 11, color: '#5A7A8A' }}>
                Fix: open each post in WP admin and click Update (no content changes needed) — Rank Math analyzes and stores the score. OR use bulk regeneration via Rank Math → Status &amp; Tools → Database Tools → Update Keywords/Scores.
              </div>
            </div>
          ) : (
            <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12 }}>No posts to analyze.</div>
          )}
        </Card>
      </div>

      <ConsultingUpsell
        headline="Struggling to lift SEO scores? IA's content team specializes in on-page optimization."
        subtext="We rewrite underperforming pages with Rank Math's recommendations baked in — typical lift: 40-60 points per page."
        serviceType="Content Writing"
        triggerPage="content-seo-overview"
      />

      {modalOpen && (
        <ContentSeoDetailsModal
          pages={pages}
          posts={posts}
          detailRows={detailRows}
          initialTab={drillDownType === 'all' ? 'pages' : drillDownType}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function HeroTile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'ok' | 'warn' | 'err' }) {
  const colors: Record<string, { bg: string; border: string; text: string; value: string }> = {
    ok:   { bg: '#F0FDF4', border: '#1D9E75', text: '#065F46', value: '#0B1C24' },
    warn: { bg: '#FEF3C7', border: '#D97706', text: '#78350F', value: '#92400E' },
    err:  { bg: '#FEF2F2', border: '#D85A30', text: '#991B1B', value: '#991B1B' },
  };
  const c = colors[tone];
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 6, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: c.text, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: c.value, marginTop: 4, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: c.text, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ContentSeoDetailsModal({ pages, posts, detailRows, initialTab, onClose }: { pages: any[]; posts: any[]; detailRows: any[]; initialTab: 'pages' | 'posts' | 'issues' | 'readability'; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'pages' | 'posts' | 'issues' | 'readability'>(initialTab);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low_score' | 'missing_meta' | 'missing_fk' | 'noindex'>('all');

  const applyFilter = (items: any[]) => {
    let rows = items;
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter((it) => (it.title || '').toLowerCase().includes(s) || (it.url || '').toLowerCase().includes(s));
    }
    if (filter === 'low_score') rows = rows.filter((it) => it.seo_score != null && Number(it.seo_score) < 50);
    if (filter === 'missing_meta') rows = rows.filter((it) => !it.meta_desc);
    if (filter === 'missing_fk') rows = rows.filter((it) => !it.focus_keyword);
    if (filter === 'noindex') rows = rows.filter((it) => String(it.robots || '').includes('noindex'));
    return rows;
  };

  const data = activeTab === 'pages' ? pages : posts;
  const filtered = applyFilter(data);

  // Aggregate issues list across both pages + posts
  const allItems = [...pages, ...posts];
  const issueItems = useMemo(() => {
    return allItems.map((it) => ({
      ...it,
      issues: [
        !it.meta_desc && 'Missing meta description',
        !it.focus_keyword && 'Missing focus keyword',
        it.seo_score != null && Number(it.seo_score) < 50 && 'Low SEO score',
        String(it.robots || '').includes('noindex') && 'Marked noindex',
        it.meta_title_length > 60 && 'Title too long',
        it.meta_title_length > 0 && it.meta_title_length < 30 && 'Title too short',
        it.meta_desc_length > 160 && 'Meta desc too long',
        it.meta_desc_length > 0 && it.meta_desc_length < 70 && 'Meta desc too short',
      ].filter(Boolean),
    })).filter((it) => it.issues.length > 0);
  }, [allItems]);

  const activeItems = activeTab === 'issues' ? issueItems : filtered;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column', minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Content SEO</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>Full Details</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 6px' }}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          {[
            { id: 'pages', label: `Pages (${pages.length})` },
            { id: 'posts', label: `Posts (${posts.length})` },
            { id: 'issues', label: `Issues (${issueItems.length})` },
            { id: 'readability', label: 'Readability' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: 600,
                background: 'transparent',
                color: activeTab === t.id ? '#0B1C24' : '#94A3B8',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #0B1C24' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
          {activeTab === 'readability' ? (
            <ReadabilityTab detailRows={detailRows} />
          ) : (
          <>
          {activeTab !== 'issues' && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search title or URL…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4, width: 260 }}
              />
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
                <option value="all">All items</option>
                <option value="low_score">Low score (&lt;50)</option>
                <option value="missing_meta">Missing meta description</option>
                <option value="missing_fk">Missing focus keyword</option>
                <option value="noindex">Noindexed</option>
              </select>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A', alignSelf: 'center' }}>
                {activeItems.length} of {data.length}
              </div>
            </div>
          )}

          {activeItems.length === 0 ? (
            <div style={{ padding: 40, color: '#5A7A8A', fontSize: 13, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
              {activeTab === 'issues' ? 'No SEO issues detected. Clean!' : 'No items match these filters.'}
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '30%' }}>Title</th>
                  <th style={{ textAlign: 'right', width: '6%' }}>Score</th>
                  <th style={{ textAlign: 'left', width: '20%' }}>Focus KW</th>
                  <th style={{ textAlign: 'left', width: '10%' }}>Title len</th>
                  <th style={{ textAlign: 'left', width: '10%' }}>Meta len</th>
                  {activeTab === 'issues' && <th style={{ textAlign: 'left' }}>Issues</th>}
                </tr>
              </thead>
              <tbody>
                {activeItems.map((it, i) => (
                  <tr key={it.id || i}>
                    <td style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>
                        {it.title || '—'}
                      </a>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {it.seo_score != null ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: it.seo_score >= 70 ? '#1D9E75' : it.seo_score >= 50 ? '#D4A800' : '#D85A30',
                        }}>{it.seo_score}</span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                    <td>
                      {it.focus_keyword ? (
                        <code style={{ fontSize: 10, background: '#F0FDF4', color: '#065F46', padding: '1px 6px', borderRadius: 3 }}>{it.focus_keyword}</code>
                      ) : (
                        <span style={{ fontSize: 10, color: '#991B1B' }}>Missing</span>
                      )}
                    </td>
                    <td>
                      {it.meta_title_length > 0 ? (
                        <LenIndicator length={it.meta_title_length} min={30} max={60} />
                      ) : <span style={{ color: '#94A3B8' }}>—</span>}
                    </td>
                    <td>
                      {it.meta_desc_length > 0 ? (
                        <LenIndicator length={it.meta_desc_length} min={70} max={160} />
                      ) : <span style={{ color: '#991B1B', fontSize: 10 }}>Missing</span>}
                    </td>
                    {activeTab === 'issues' && (
                      <td style={{ fontSize: 10 }}>
                        {(it as any).issues.map((iss: string, j: number) => (
                          <span key={j} style={{ display: 'inline-block', background: '#FEF3C7', color: '#78350F', padding: '1px 6px', borderRadius: 3, marginRight: 4, marginBottom: 2 }}>
                            {iss}
                          </span>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadabilityTab({ detailRows }: { detailRows: any[] }) {
  const scored = detailRows.filter((r: any) => r.readability != null && r.readability > 0);
  const buckets = { '<40': 0, '40-60': 0, '60-80': 0, '80-100': 0 };
  for (const r of scored) {
    const s = r.readability;
    if (s < 40) buckets['<40']++;
    else if (s < 60) buckets['40-60']++;
    else if (s < 80) buckets['60-80']++;
    else buckets['80-100']++;
  }
  const histData = [
    { range: '<40',    count: buckets['<40'],    color: '#D85A30', label: 'Difficult' },
    { range: '40-60',  count: buckets['40-60'],  color: '#F59E0B', label: 'Fair' },
    { range: '60-80',  count: buckets['60-80'],  color: '#1D9E75', label: 'Good' },
    { range: '80-100', count: buckets['80-100'], color: '#065F46', label: 'Excellent' },
  ];
  const hardRows = scored.filter((r: any) => r.readability < 40).sort((a, b) => a.readability - b.readability);

  if (scored.length === 0) {
    return <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>No readability scores yet. Rank Math generates readability scores when posts are saved or analyzed.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12, lineHeight: 1.5 }}>
        Rank Math readability measures how easy your content is to read based on sentence length, word complexity, and structure. Higher scores = more accessible content. Aim for 60+ on all published pieces.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Distribution</div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={histData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} width={30} />
                <RTooltip contentStyle={{ fontSize: 11 }} formatter={(v: any, _n: any, p: any) => [`${v} posts`, p.payload.label]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histData.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Hardest-to-read content ({hardRows.length})
          </div>
          {hardRows.length === 0 ? (
            <div style={{ padding: 16, color: '#065F46', fontSize: 12, background: '#F0FDF4', borderRadius: 4 }}>
              ✓ No posts scored as Difficult. Good readability across your content.
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <thead><tr><th>Title</th><th style={{ textAlign: 'right' }}>Score</th><th>Type</th></tr></thead>
              <tbody>
                {hardRows.slice(0, 15).map((r: any) => (
                  <tr key={r.post_id}>
                    <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={r.permalink} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{r.title || '—'}</a>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#D85A30' }}>{r.readability}</td>
                    <td style={{ textTransform: 'capitalize', color: '#5A7A8A' }}>{r.type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function LenIndicator({ length, min, max }: { length: number; min: number; max: number }) {
  const good = length >= min && length <= max;
  const tooShort = length < min;
  const tooLong = length > max;
  const color = good ? '#065F46' : '#D4A800';
  const note = good ? 'good' : tooShort ? 'short' : tooLong ? 'long' : '';
  return (
    <span style={{ fontSize: 10, color }}>
      {length}ch {note && <span style={{ color: '#5A7A8A' }}>· {note}</span>}
    </span>
  );
}
