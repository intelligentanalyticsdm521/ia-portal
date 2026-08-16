import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCard, Card, Loading, EmptyPanel, ConsultingUpsell, meetsMinTier } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { AiBlockGenerator } from '../../components/AiBlockGenerator';
import { AiPageAssembler } from '../../components/AiPageAssembler';
import { ReportButton } from '../../../components/insights/ReportButton';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/**
 * Website Content — analytics-first story of your content library.
 * Visualizes publishing momentum, content freshness, author output,
 * depth (word count), category mix, and activity heatmap.
 * SEO metadata lives on the Content SEO page.
 */
export function WebsiteContent() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const navigate = useNavigate();
  const [genOpen, setGenOpen] = useState(false);
  const [asmOpen, setAsmOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // This page is the high-level view of the content library. The BUTTON is the
  // depth: every page reviewed the way a consultant would — thin, stale, no
  // meta description, competing focus keywords. Same report the Trends
  // drill-down and the Reports catalog render (Brandon 2026-08-14).
  const insights = useArionInsightsPayload();

  // F-AI-WB Phase 1 (2026-06-20) — Pro+ gate on the IL block generator.
  // Shows the buttons greyed-out with a link to the full AI Builder page
  // (which carries the standard TierGate overlay + upgrade CTA) for lower tiers.
  const arionTier = (selectedSite?.arionTier || 'lite') as string;
  const ilEnabled = meetsMinTier(arionTier, 'pro');

  const fetchIfId = <T,>(fn: (s: string) => Promise<T>) =>
    activeSiteId ? fn(activeSiteId) : Promise.resolve(null);

  const { data: hosting, loading: hL } = useArionData(() => fetchIfId(arionApi.getHosting), [activeSiteId]);
  const { data: paceEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentPace), [activeSiteId]);
  const { data: ageEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentAgeDist), [activeSiteId]);
  const { data: authorEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentAuthors), [activeSiteId]);
  const { data: catEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentCategories), [activeSiteId]);
  const { data: wcEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentWordCountDist), [activeSiteId]);
  const { data: activityEnv } = useArionData(() => fetchIfId(arionApi.getPluginContentActivityCalendar), [activeSiteId]);
  const { data: contentAgg } = useArionData(() => fetchIfId(arionApi.getPluginContentAggregate), [activeSiteId]);

  const paceData = useMemo(() => (paceEnv as any)?.data?.months || [], [paceEnv]);
  const ageData = useMemo(() => (ageEnv as any)?.data || {}, [ageEnv]);
  const authors = useMemo(() => (authorEnv as any)?.data?.authors || [], [authorEnv]);
  const categories = useMemo(() => (catEnv as any)?.data?.categories || [], [catEnv]);
  const wcData = useMemo(() => (wcEnv as any)?.data || {}, [wcEnv]);
  const activityDays = useMemo(() => (activityEnv as any)?.data?.days || [], [activityEnv]);

  const contentData = (contentAgg as any)?.data || {};
  const summary = contentData.summary || {};

  if (loading || hL) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const content = h.content ?? {};
  const pages = summary.pages_published ?? content.pages ?? 0;
  const posts = summary.posts_published ?? content.posts ?? 0;

  // Age buckets for pie
  const agePie = [
    { name: 'Fresh (<30d)', value: ageData.fresh?.count ?? 0, color: '#1D9E75' },
    { name: 'Current (30-90d)', value: ageData.current?.count ?? 0, color: '#0284c7' },
    { name: 'Aging (90d-1y)', value: ageData.aging?.count ?? 0, color: '#D97706' },
    { name: 'Stale (>1y)', value: ageData.stale?.count ?? 0, color: '#D85A30' },
  ].filter((d) => d.value > 0);

  // Word count histogram data
  const wcBuckets = wcData.buckets || {};
  const wcHistogram = [
    { name: 'Thin', count: wcBuckets.thin?.count ?? 0, fill: '#D85A30' },
    { name: 'Standard', count: wcBuckets.standard?.count ?? 0, fill: '#0284c7' },
    { name: 'Long-form', count: wcBuckets.long?.count ?? 0, fill: '#1D9E75' },
    { name: 'Pillar', count: wcBuckets.pillar?.count ?? 0, fill: '#7c3aed' },
  ];

  const totalPaceLast12 = paceData.reduce((s: number, m: any) => s + (m.posts || 0) + (m.pages || 0), 0);
  const activeAuthorCount = authors.filter((a: any) => a.posts + a.pages > 0).length;

  // Storytelling header
  const totalContent = (ageData.fresh?.count || 0) + (ageData.current?.count || 0) + (ageData.aging?.count || 0) + (ageData.stale?.count || 0);
  const freshRatio = totalContent > 0 ? (((ageData.fresh?.count || 0) + (ageData.current?.count || 0)) / totalContent) : 0;
  const storyBand = (() => {
    if (totalContent === 0) return { tone: 'warn' as const, text: 'No published content detected yet.' };
    if (freshRatio >= 0.5) return { tone: 'ok' as const, text: `Your library is fresh — ${Math.round(freshRatio * 100)}% of content is under 90 days old.` };
    if (freshRatio >= 0.25) return { tone: 'warn' as const, text: `About ${Math.round(freshRatio * 100)}% of your content is fresh. Consider updating aging articles to keep rankings strong.` };
    return { tone: 'err' as const, text: `Only ${Math.round(freshRatio * 100)}% of content is under 90 days old. Stale content hurts rankings — prioritize updates.` };
  })();

  const toneColors: Record<string, { bg: string; border: string }> = {
    ok: { bg: '#F0FDF4', border: '#1D9E75' },
    warn: { bg: '#FFFBEB', border: '#D97706' },
    err: { bg: '#FEF2F2', border: '#D85A30' },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ReportButton detail={insights?.detail} reportId="content_library" />
      </div>

      {/* F-AI-WB Phase 1 (2026-06-20) — IL block-generation entry points.
          Sits at top of the page so admins can launch the drawer or hop to
          the dedicated AI Builder workspace without scrolling past analytics. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, padding: '12px 14px',
        background: ilEnabled ? 'rgba(56,189,248,0.06)' : '#F8FAFC',
        border: `1px solid ${ilEnabled ? 'rgba(56,189,248,0.25)' : '#E5EEF2'}`,
        borderRadius: 6,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            ARION Intelligence Layer
          </div>
          <div style={{ fontSize: 12, color: '#0B1C24', marginTop: 2 }}>
            {ilEnabled
              ? 'Generate Elementor blocks with IL and assemble them into a page.'
              : 'Upgrade to Pro to generate Elementor blocks with IL.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => ilEnabled ? setGenOpen(true) : navigate('/app/services/arion_website_ai_builder')}
            disabled={!activeSiteId}
            style={{
              background: ilEnabled ? '#38BDF8' : '#fff',
              color: ilEnabled ? '#fff' : '#0B1C24',
              border: ilEnabled ? 'none' : '1px solid #CBD5E1',
              borderRadius: 6, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: activeSiteId ? 'pointer' : 'not-allowed',
              opacity: activeSiteId ? 1 : 0.5,
            }}
          >Generate with IL</button>
          <button
            onClick={() => ilEnabled ? setAsmOpen(true) : navigate('/app/services/arion_website_ai_builder')}
            disabled={!activeSiteId}
            style={{
              background: '#fff', color: '#0B1C24',
              border: '1px solid #CBD5E1', borderRadius: 6, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: activeSiteId ? 'pointer' : 'not-allowed',
              opacity: activeSiteId ? 1 : 0.5,
            }}
          >Assemble & publish</button>
        </div>
      </div>

      {/* Storytelling band */}
      <div style={{ ...toneColors[storyBand.tone], padding: '14px 18px', marginBottom: 16, borderRadius: 6, borderLeft: `4px solid ${toneColors[storyBand.tone].border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{storyBand.text}</div>
      </div>

      {/* Top stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard label="Posts published" value={String(posts)} />
        <StatCard label="Pages published" value={String(pages)} />
        <StatCard label="Published in 12 mo" value={String(totalPaceLast12)} deltaType="positive" />
        <StatCard label="Active authors" value={String(activeAuthorCount)} />
        <StatCard label="Avg words / post" value={wcData.avg_words != null ? String(wcData.avg_words) : '—'} />
      </div>

      {/* Publishing pace chart */}
      <Card title="Publishing pace (last 12 months)">
        {paceData.length === 0 ? (
          <Empty message="No publishing history yet." />
        ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={paceData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="posts" name="Posts" stackId="1" stroke="#0284c7" fill="#0284c7" fillOpacity={0.6} />
                <Area type="monotone" dataKey="pages" name="Pages" stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Age distribution pie + Word count histogram */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Card title="Content freshness">
          {agePie.length === 0 ? (
            <Empty message="No content yet." />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={agePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {agePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>
                {agePie.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <span style={{ width: 10, height: 10, background: d.color, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <strong>{d.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Content depth (word count)">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wcHistogram} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {wcHistogram.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 8 }}>
            {wcData.posts_counted || 0} posts analyzed · {wcData.total_words != null ? `${wcData.total_words.toLocaleString()} total words` : ''}
          </div>
        </Card>
      </div>

      {/* Authors + Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Card title="Author output">
          {authors.length === 0 ? (
            <Empty message="No author data." />
          ) : (
            <div style={{ height: Math.max(160, Math.min(authors.length, 8) * 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={authors.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="display_name" tick={{ fontSize: 10, fill: '#5A7A8A' }} width={120} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="posts" name="Posts" stackId="a" fill="#0284c7" />
                  <Bar dataKey="pages" name="Pages" stackId="a" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Category mix">
          {categories.length === 0 ? (
            <Empty message="No categorized content yet." />
          ) : (
            <div>
              {categories.slice(0, 8).map((c: any) => {
                const max = categories[0].count || 1;
                const pct = (c.count / max) * 100;
                return (
                  <div key={c.term_id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <span style={{ color: '#5A7A8A' }}>{c.count}</span>
                    </div>
                    <div style={{ background: '#E5EEF2', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#0284c7', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Activity calendar */}
      <div style={{ marginTop: 14 }}>
        <Card title="90-day activity">
          {activityDays.length === 0 ? (
            <Empty message="No recent edits or publishes." />
          ) : (
            <ActivityHeatmap days={activityDays} />
          )}
        </Card>
      </div>

      <ConsultingUpsell
        headline="Content that doesn't get updated stops ranking"
        subtext="IA's content team runs quarterly refresh sprints — updating aging articles, rebuilding thin content, and adding schema + internal links to your pillar pages."
        serviceType="Content Strategy & Refresh"
        triggerPage="website-content"
      />

      {/* F-AI-WB Phase 1 (2026-06-20) — IL drawers mount once, opened from the header CTA. */}
      {ilEnabled && (
        <>
          <AiBlockGenerator
            open={genOpen}
            onClose={() => setGenOpen(false)}
            onAccepted={() => setRefreshKey((k) => k + 1)}
          />
          <AiPageAssembler
            open={asmOpen}
            onClose={() => setAsmOpen(false)}
            refreshKey={refreshKey}
          />
        </>
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>{message}</div>;
}

function ActivityHeatmap({ days }: { days: Array<{ day: string; count: number }> }) {
  // Build a 90-day grid (13 weeks × 7 days)
  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d.day, d.count);
  const cells: Array<{ date: string; count: number }> = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const iso = date.toISOString().slice(0, 10);
    cells.push({ date: iso, count: byDay.get(iso) || 0 });
  }
  const max = Math.max(1, ...cells.map((c) => c.count));
  const colorFor = (n: number) => {
    if (n === 0) return '#E5EEF2';
    const intensity = Math.min(1, n / max);
    const alpha = 0.25 + intensity * 0.75;
    return `rgba(2, 132, 199, ${alpha})`;
  };
  // Render as horizontal scrollable grid of columns
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3, maxWidth: 520 }}>
        {Array.from({ length: 13 }).map((_, week) => (
          <div key={week} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Array.from({ length: 7 }).map((__, dayInWeek) => {
              const idx = week * 7 + dayInWeek;
              if (idx >= cells.length) return <div key={dayInWeek} style={{ width: 14, height: 14 }} />;
              const c = cells[idx];
              return (
                <div
                  key={dayInWeek}
                  title={`${c.date}: ${c.count} edit${c.count === 1 ? '' : 's'}`}
                  style={{ width: 14, height: 14, borderRadius: 2, background: colorFor(c.count) }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 10, color: '#5A7A8A' }}>
        Less
        {[0, 1, 3, 6, 10].map((n) => (
          <div key={n} style={{ width: 12, height: 12, borderRadius: 2, background: colorFor(n) }} />
        ))}
        More
      </div>
    </div>
  );
}
