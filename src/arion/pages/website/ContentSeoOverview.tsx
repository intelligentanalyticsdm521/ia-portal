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

  if (loading || aggLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const env = (aggEnv as any) || {};
  const pluginConnected = env.plugin_status === 'connected';
  const seo = env.data?.seo || null;
  const summary = env.data?.summary || null;
  const d = (detailData as any)?.data || {};
  const pages: any[] = Array.isArray(d.pages) ? d.pages : [];
  const posts: any[] = Array.isArray(d.posts) ? d.posts : [];
  const items: any[] = [...pages, ...posts];

  if (!pluginConnected || !seo?.installed) {
    return (
      <div>
        <InfoCard title="Content SEO">
          <p style={{ margin: 0, fontSize: 13 }}>
            Content SEO intelligence is powered by Rank Math SEO inside the IA Plugin. Make sure the IA Plugin is connected and Rank Math is active on your WordPress site to see per-page SEO scores, focus keywords, and meta-completeness tracking.
          </p>
        </InfoCard>
        <div style={{ marginTop: 14, padding: 40, background: '#F8FAFC', borderRadius: 10, textAlign: 'center', border: '1px dashed #d5e0e8' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>Awaiting plugin + Rank Math connection</div>
          <div style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
            {!pluginConnected
              ? 'The IA Plugin is not currently reachable. Visit Website → Overview for connection status.'
              : 'Rank Math SEO is not active on this site. Install it via WP Admin → Plugins → Add New → search "Rank Math".'}
          </div>
        </div>
      </div>
    );
  }

  // Derived narrative numbers
  const totalPublished = seo.total_published || 0;
  const postsWithScore = seo.posts_with_seo_score || 0;
  const coveragePct = totalPublished > 0 ? Math.round((postsWithScore / totalPublished) * 100) : 0;
  const avgScore = seo.avg_seo_score != null ? Number(seo.avg_seo_score) : null;
  const lowScoreCount = seo.posts_score_below_50 || 0;
  const missingMeta = seo.posts_missing_meta_desc || 0;
  const missingFK = seo.posts_missing_focus_kw || 0;
  const noindexCount = seo.posts_noindex || 0;

  // Build score-bucket distribution from live detail data (if available)
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

  // Problem donut
  const problemData = [
    { name: 'Missing meta desc', value: missingMeta, color: '#D85A30' },
    { name: 'Missing focus keyword', value: missingFK, color: '#EF6C33' },
    { name: 'Low score (<50)', value: lowScoreCount, color: '#F59E0B' },
    { name: 'Marked noindex', value: noindexCount, color: '#5A7A8A' },
  ].filter((d) => d.value > 0);
  const problemTotal = problemData.reduce((s, d) => s + d.value, 0);

  // Top opportunity table: lowest-score items + pages missing meta
  const topOpportunities = useMemo(() => {
    const scored = items.filter((it) => it.seo_score != null);
    return [...scored]
      .sort((a, b) => (Number(a.seo_score) || 0) - (Number(b.seo_score) || 0))
      .slice(0, 10);
  }, [items]);

  return (
    <div>
      {/* Hero narrative */}
      <InfoCard title="Content SEO">
        <p style={{ margin: 0, fontSize: 13 }}>
          Live SEO health for every page and post on your site. Scores come from Rank Math's on-page analysis — content readability, keyword usage, meta completeness, schema markup, and more. Higher scores correlate with better search rankings.
        </p>
      </InfoCard>

      {/* Hero stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 14 }}>
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
        <HeroTile
          label="Low-score posts"
          value={String(lowScoreCount)}
          sub={lowScoreCount > 0 ? 'Score below 50' : 'None'}
          tone={lowScoreCount > 0 ? 'err' : 'ok'}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 14 }}>
        <Card title="SEO Score Distribution">
          <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10, lineHeight: 1.5 }}>
            How your {items.length} published pages + posts spread across score bands. The goal is to shift everything into the green "Good" / "Excellent" ranges.
          </div>
          {detailLoading ? (
            <div style={{ padding: 20, color: '#5A7A8A', fontSize: 12, textAlign: 'center' }}>Loading per-page scores…</div>
          ) : scoreBuckets.every((b) => b.count === 0) ? (
            <div style={{ padding: 20, color: '#5A7A8A', fontSize: 12, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
              No individual SEO scores captured yet. Rank Math auto-scores content on save/publish.
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={scoreBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} width={30} />
                  <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any, _n: any, p: any) => [`${v} content pieces`, p.payload.label]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Problem Breakdown">
          {problemTotal === 0 ? (
            <div style={{ padding: 16, color: '#065F46', fontSize: 12, textAlign: 'center', background: '#F0FDF4', borderRadius: 6 }}>
              ✓ No critical SEO problems on any published content.
            </div>
          ) : (
            <div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={problemData} dataKey="value" innerRadius={40} outerRadius={70} paddingAngle={2} stroke="none">
                      {problemData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                {problemData.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                    <span style={{ width: 8, height: 8, background: d.color, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#0B1C24' }}>{d.name}</span>
                    <span style={{ fontWeight: 600, color: d.color }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Coverage narrative */}
      <div style={{ marginTop: 14, padding: '14px 16px', background: coveragePct >= 80 ? '#F0FDF4' : '#FEF3C7', borderLeft: `3px solid ${coveragePct >= 80 ? '#1D9E75' : '#D97706'}`, borderRadius: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>
          {coveragePct >= 80 ? 'Strong content SEO coverage' : coveragePct >= 50 ? 'Content SEO coverage needs expansion' : 'Most content lacks SEO analysis'}
        </div>
        <div style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.6 }}>
          {coveragePct >= 80 ? (
            <>You're analyzing <strong>{postsWithScore}</strong> of <strong>{totalPublished}</strong> published pieces. Focus on lifting scores on the remaining low-score posts — see Top Opportunities below.</>
          ) : (
            <>Only <strong>{postsWithScore}</strong> of <strong>{totalPublished}</strong> published pieces have Rank Math scores. Adding focus keywords + meta descriptions to the uncovered posts is the fastest way to improve overall SEO health. Rank Math will auto-score once you fill in the required fields.</>
          )}
        </div>
      </div>

      {/* Top opportunities table */}
      <div style={{ marginTop: 14 }}>
        <Card title="Top SEO Opportunities">
          <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
            The lowest-scoring content on your site. Fixing these first gives you the biggest overall score lift with the least effort.
          </div>
          {detailLoading ? (
            <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
          ) : topOpportunities.length === 0 ? (
            <div style={{ padding: 16, color: '#065F46', fontSize: 12, textAlign: 'center', background: '#F0FDF4', borderRadius: 6 }}>
              No scored content to prioritize. Run Rank Math analysis on your content.
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead><tr><th>Title</th><th>Type</th><th style={{ textAlign: 'right' }}>Score</th><th>Meta desc</th><th>Focus KW</th></tr></thead>
              <tbody>
                {topOpportunities.map((it, i) => (
                  <tr key={it.id || i}>
                    <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{it.title || '—'}</a>
                    </td>
                    <td style={{ textTransform: 'capitalize', color: '#5A7A8A' }}>{it.type || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: it.seo_score >= 70 ? '#1D9E75' : it.seo_score >= 50 ? '#D4A800' : '#D85A30',
                      }}>{it.seo_score ?? '—'}</span>
                    </td>
                    <td style={{ fontSize: 10 }}>
                      {it.meta_desc ? (
                        <span style={{ color: '#065F46' }}>✓ {it.meta_desc_length}ch</span>
                      ) : (
                        <span style={{ color: '#991B1B' }}>Missing</span>
                      )}
                    </td>
                    <td style={{ fontSize: 10 }}>
                      {it.focus_keyword ? (
                        <span style={{ color: '#065F46' }}>✓ {it.focus_keyword}</span>
                      ) : (
                        <span style={{ color: '#991B1B' }}>Missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Details — all pages + posts →
            </button>
          </div>
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

function ContentSeoDetailsModal({ pages, posts, onClose }: { pages: any[]; posts: any[]; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'pages' | 'posts' | 'issues'>('pages');
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
