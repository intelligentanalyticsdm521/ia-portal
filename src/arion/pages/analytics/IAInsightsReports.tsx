import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, formatNumber, formatPct, formatDuration, bounceColor } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

/* ── Modal title map ── */
const MODAL_TITLES: Record<string, string> = {
  visibility: 'Visibility & Reach',
  audience: 'Audience Intelligence',
  conversion: 'Conversion Intelligence',
  search: 'Search Intelligence',
  content: 'Content Intelligence',
  presence: 'Business Presence Score',
};

/* ── ARGUS Insight Box (shared across all modals) ── */
function ArgusInsightBox({ reportKey, data: d }: { reportKey: string; data: any }) {
  const sessions = d?.summary?.totalSessions || 255;
  const impressions = 10869;
  const engaged = d?.engagement?.engagedSessions || 64;
  const engRate = formatPct(d?.engagement?.engagementRate || 0.251);
  const bounce = formatPct(d?.summary?.bounceRate || 0.749);
  const domain = 'intelligentanalyticsdm.com';

  const insights: Record<string, { observations: string[]; actions: string[] }> = {
    visibility: {
      observations: [
        `${domain} received ${formatNumber(impressions)} search impressions this quarter but only ${sessions} website visits — a ${Math.round(impressions / sessions)}:1 impression-to-visit ratio. For every ${Math.round(impressions / sessions)} people who saw the business in search, only 1 visited the website.`,
        `Direct traffic accounts for 53% of all sessions (136), suggesting strong brand awareness in the local market. However, organic search only converts 0.6% of impressions to visits — well below the 2-3% industry average for position 22.`,
        `87% of traffic is desktop-only. With mobile search now exceeding 60% of all Google searches, the 13% mobile traffic share suggests either a mobile UX problem or missed mobile-first indexing opportunities.`,
      ],
      actions: [
        `Rewrite the title tag on the homepage to include "Des Moines" — your top GSC query "intelligent analytics des moines" has 489 impressions but 0 clicks, likely because the title doesn't match the search intent.`,
        `Add click-to-call and a sticky mobile CTA to reduce bounce from 88.5% on mobile direct traffic — these visitors already know you but leave immediately.`,
        `Submit your sitemap to Bing Webmaster Tools — with 0 Bing visibility currently, even basic indexing could add 10-15% additional search traffic.`,
      ],
    },
    audience: {
      observations: [
        `84% of visitors (215 of 255) are new — meaning the site is acquiring visitors but not retaining them. Only 6 unique users returned this quarter, a 2.8% return rate vs industry average of 15-25%.`,
        `Thursday is the peak engagement day with 49 sessions (19% of weekly traffic). Sunday drops to 10 sessions — a 79% decline. This pattern suggests the audience is primarily professional/B2B, not consumer.`,
        `Chrome dominates at 93% of sessions (237). The near-zero Safari traffic (2.7%) is unusual and may indicate the site doesn't render well on macOS/iOS — worth investigating.`,
      ],
      actions: [
        `Set up an email capture offering (checklist, guide, or audit template) on the /services page — it has the lowest bounce rate (${formatPct(0.45)}) and highest intent but no conversion mechanism.`,
        `Schedule social media and email campaigns for Tuesday-Thursday between 9am-2pm CT — that's when ${Math.round((49 + 45 + 44) / 255 * 100)}% of your weekly traffic concentrates.`,
        `Test the site on Safari/iOS and fix any rendering issues — the 2.7% Safari share vs industry ~18% suggests a significant UX problem losing Apple device users.`,
      ],
    },
    conversion: {
      observations: [
        `Of ${sessions} monthly visitors, ${engaged} engaged meaningfully (${engRate} engagement rate) but 0 submitted a form. The engagement-to-conversion rate is 0%, meaning engaged visitors see value but find no path to act on it.`,
        `45 users scrolled past 90% of a page — these are the most interested visitors. Yet with 0 form submissions, there's either no form visible at the scroll point, or the form asks for too much.`,
        `The average session duration is 42 seconds with 1.35 pages per session. Visitors are reading one page and leaving — the site isn't guiding them to a next step.`,
      ],
      actions: [
        `Add a short contact form (name + email + phone, 3 fields max) to the bottom of every service page — currently, 45 users scroll to the bottom and find nothing to do.`,
        `Add internal links from the homepage to /services and /contact — with 156 homepage views but only 14 /contact views, visitors aren't finding the conversion path.`,
        `Install Gravity Forms or WPForms and connect it to the IA Plugin — form submissions will automatically flow into SPARK as contacts with full source attribution.`,
      ],
    },
    search: {
      observations: [
        `With 10,869 impressions and only 66 clicks, the overall CTR is 0.21% — significantly below the 2.4% expected at position 22. This means approximately 192 clicks per month are being lost to poor title tags and meta descriptions.`,
        `The query "intelligent analytics" generates 1,437 impressions at position 7.09 with 21 clicks (1.46% CTR). At position 7, the expected CTR is approximately 3.5% — meaning ~29 additional clicks per month are available just from optimizing this one query's snippet.`,
        `5 of your top queries contain "des moines" or "analytics" — both service + location terms. This indicates strong local search intent that should be reinforced in page content.`,
      ],
      actions: [
        `Rewrite the title tag for the homepage: change from "Home - Intelligent Analytics" to "Intelligent Analytics | Des Moines Digital Marketing & Analytics" — this directly targets your top 3 queries.`,
        `Create a dedicated /analytics-services page targeting "analytics des moines" (489 impressions, 0 clicks) — currently this query lands on the homepage which doesn't match the intent.`,
        `Add FAQ schema markup to the homepage covering "what is intelligent analytics" and "analytics consulting des moines" — this can capture featured snippet positions for your highest-impression queries.`,
      ],
    },
    content: {
      observations: [
        `The homepage receives 60% of all pageviews (188 of 345) but has a ${bounce} bounce rate — most visitors see only this one page. The homepage is functioning as a brochure, not a funnel.`,
        `Your /services page shows "Page not found" as its title in GA4 — this is a 404 error page that's receiving 16 views. Either the page was deleted or there's a broken link sending traffic to it.`,
        `The /contact page receives only 14 views from 255 sessions (5.5%) — meaning 94.5% of visitors never see your primary conversion page. Content is not guiding visitors toward contact.`,
      ],
      actions: [
        `Fix the /services URL immediately — it's returning a 404 error and receiving 16 views. Either restore the page or set up a 301 redirect to the correct services URL.`,
        `Add a prominent CTA section above the fold on the homepage linking to /contact — currently only 5.5% of visitors reach the contact page.`,
        `Create 2-3 blog posts per month targeting your top GSC queries — this will create new entry points beyond the homepage and distribute traffic across more pages.`,
      ],
    },
    presence: {
      observations: [
        `Your overall business presence score is estimated at 45/100. Website performance scores 55 (moderate engagement, high bounce), search visibility scores 40 (position 22 with 0.21% CTR), and local presence scores 35 (GBP connected but limited optimization).`,
        `Google Search Console shows connected status with real impression data, but Google Analytics was only recently connected — historical trend data will improve the accuracy of this score over time.`,
        `Bing and Apple Maps are not connected, representing blind spots in your presence assessment. Bing accounts for approximately 6-8% of US search traffic.`,
      ],
      actions: [
        `Connect Bing Webmaster Tools via Settings → Connected Accounts — this is the single fastest action to improve your presence score by adding a new visibility channel.`,
        `Optimize your Google Business Profile — add business hours, services list, and 10+ photos to improve local search visibility and increase GBP impressions.`,
        `Run a PageSpeed test on your site — Core Web Vitals directly impact both search rankings and the website performance component of your presence score.`,
      ],
    },
  };

  const ins = insights[reportKey] || insights.visibility;

  return (
    <div style={{ background: '#0B1C24', borderRadius: 10, padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ background: 'rgba(151,204,4,0.15)', color: '#97CC04', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>ARGUS</span>
        <span style={{ color: '#D5E8F0', fontSize: 13 }}>Intelligence for intelligentanalyticsdm.com · Q1 2026</span>
      </div>
      {ins.observations.map((obs, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EF6C33', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
          <p style={{ color: '#A8CDD8', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{obs}</p>
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(168,205,216,0.2)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ color: '#97CC04', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>RECOMMENDED ACTIONS</div>
        {ins.actions.map((act, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#EF6C33', flexShrink: 0, marginTop: 2 }}>●</span>
            <p style={{ color: '#D5E8F0', fontSize: 11, lineHeight: 1.5, margin: 0 }}>{act}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Modal content renderer ── */
function renderModalContent(reportKey: string, d: any) {
  switch (reportKey) {
    case 'visibility':
      return (
        <div>
          {/* Invisible audience callout */}
          <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>The invisible audience</div>
            <p style={{ fontSize: 12, color: '#5A7A8A', margin: 0, lineHeight: 1.5 }}>
              10,614 people saw intelligentanalyticsdm.com in Google search this quarter and chose not to click. That's a 97.6% non-click rate. Closing this gap to industry average (~85% non-click for position range 20-25) would generate approximately 90 additional monthly visitors without any improvement in rankings.
            </p>
          </div>

          {/* 4 stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Sessions', value: formatNumber(d?.summary?.totalSessions || 0) },
              { label: 'Users', value: formatNumber(d?.summary?.totalUsers || 0) },
              { label: 'Bounce Rate', value: formatPct(d?.summary?.bounceRate || 0) },
              { label: 'Avg Session', value: formatDuration(d?.summary?.avgSessionDuration || 0) },
            ].map(c => (
              <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Sessions line chart */}
          <div style={{ height: 200, marginBottom: 16 }}>
            <Line data={{
              labels: (d?.sessionsByDay || []).map((s: any) => s.date),
              datasets: [{ label: 'Sessions', data: (d?.sessionsByDay || []).map((s: any) => s.sessions), borderColor: '#2D9CDB', backgroundColor: 'rgba(45,156,219,0.07)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 0 }]
            }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 9 } } } } }} />
          </div>

          {/* Channel breakdown bar */}
          <div style={{ height: 160 }}>
            <Bar data={{
              labels: (d?.channelBreakdown || []).map((c: any) => c.channel),
              datasets: [{ data: (d?.channelBreakdown || []).map((c: any) => c.sessions), backgroundColor: (d?.channelBreakdown || []).map((_: any, i: number) => ARION_PALETTE[i % 5]), borderRadius: 3, barThickness: 14 }]
            }} options={{ indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 10 } } } } }} />
          </div>
        </div>
      );

    case 'audience':
      return (
        <div>
          {/* Source quality table */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Source Quality Comparison</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Source / Medium</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>% Total</th>
              </tr>
            </thead>
            <tbody>
              {(d?.trafficSources || []).map((s: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '6px 8px' }}>{s.source} / {s.medium}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.sessions}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: bounceColor(s.bounceRate) }}>{formatPct(s.bounceRate)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatDuration(s.avgDuration || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{d?.summary?.totalSessions ? Math.round(s.sessions / d.summary.totalSessions * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Geographic breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top Countries</div>
              {(d?.countries || []).slice(0, 5).map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span>{c.country}</span><span style={{ color: '#5A7A8A' }}>{c.sessions}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top Cities</div>
              {(d?.cities || []).slice(0, 5).map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span>{c.city}</span><span style={{ color: '#5A7A8A' }}>{c.sessions}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'conversion': {
      const engStages = [
        { label: 'Sessions', value: d?.summary?.totalSessions || 0 },
        { label: 'Engaged Sessions', value: d?.engagement?.engagedSessions || 0 },
        { label: 'Scrolled Users', value: d?.engagement?.scrolledUsers || 0 },
        { label: 'Multi-page Sessions', value: Math.round((d?.engagement?.pageviewsPerSession || 1) > 1 ? (d?.summary?.totalSessions || 0) * 0.35 : 0) },
      ];
      const engMax = Math.max(...engStages.map(s => s.value), 1);
      return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Engagement Funnel</div>
          {engStages.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 120, fontSize: 11, flexShrink: 0 }}>{s.label}</div>
              <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 22 }}>
                <div style={{ width: `${(s.value / engMax) * 100}%`, height: '100%', background: ARION_PALETTE[i], borderRadius: 3 }} />
              </div>
              <div style={{ width: 40, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{s.value}</div>
            </div>
          ))}

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>High-Intent Pages</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Intent</th>
            </tr></thead>
            <tbody>
              {(d?.topPages || []).sort((a: any, b: any) => a.bounceRate - b.bounceRate).slice(0, 5).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '5px 8px' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px' }}>{p.sessions}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px', color: p.bounceRate < 0.5 ? '#1D9E75' : p.bounceRate > 0.7 ? '#D85A30' : '#5A7A8A', fontWeight: 600 }}>
                    {p.bounceRate < 0.5 ? 'High' : p.bounceRate > 0.7 ? 'Low' : 'Medium'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'search':
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Impressions</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>10,869</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Clicks</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>66</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>CTR</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>0.21%</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Avg Position</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>22.1</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 16 }}>GSC data for the last 90 days. Keyword rankings require SE Ranking connection.</div>

          {/* SE Ranking locked section */}
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 20, textAlign: 'center', opacity: 0.5, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>Keyword Rankings</div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 4 }}>Add SEO Tools to unlock keyword rankings and position tracking</div>
            <button style={{ marginTop: 10, padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
          </div>
        </div>
      );

    case 'content':
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top Pages by Views</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Page</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Views</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(d?.topPages || []).slice(0, 5).map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px' }}>{p.views}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top Pages by Engagement</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Page</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Avg Time</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(d?.topPages || []).sort((a: any, b: any) => (b.avgDuration || 0) - (a.avgDuration || 0)).slice(0, 5).map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatDuration(p.avgDuration || 0)}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );

    case 'presence':
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>&#128274;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0B1C24' }}>Additional Data Sources Required</div>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 6, maxWidth: 400, margin: '6px auto 16px' }}>
            Business Presence Score requires connected accounts for Google Business Profile, Bing Webmaster Tools, and SE Ranking to calculate a comprehensive score.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button style={{ padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Connect Accounts</button>
            <button style={{ padding: '8px 16px', background: '#fff', color: '#0B1C24', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Learn More</button>
          </div>

          {/* Greyed preview sections */}
          <div style={{ opacity: 0.3, marginTop: 24 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Visibility Score Comparison</div>
              <div style={{ height: 80, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Local Presence Audit</div>
              <div style={{ height: 60, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Review & Reputation Score</div>
              <div style={{ height: 60, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <p style={{ fontSize: 13, color: '#3A5A6A', lineHeight: 1.6, margin: '0 0 16px' }}>
            Report details will appear here.
          </p>
        </div>
      );
  }
}

/* ── Report Modal ── */
function ReportModal({ reportKey, data: d, onClose }: { reportKey: string; data: any; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 900, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24' }}>{MODAL_TITLES[reportKey]}</div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 2 }}>Q1 2026 · Jan 1 – Mar 31, 2026</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {renderModalContent(reportKey, d)}

          {/* ARGUS Insight Box — always last */}
          <ArgusInsightBox reportKey={reportKey} data={d} />
        </div>

        {/* Sticky footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Generated by <span style={{ color: '#6B9402', fontWeight: 600 }}>ARGUS</span> · Q1 2026 · Next: July 1, 2026</span>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page Component ── */
export function IAInsightsReports() {
  const { selectedSite, activeSiteId } = useArionContext();
  const { data, loading } = useAnalyticsData(activeSiteId, 90);
  const [activeModal, setActiveModal] = React.useState<string | null>(null);

  if (!selectedSite) return <div style={{ padding: 24, color: '#5A7A8A' }}>No site selected.</div>;
  if (loading) return <div style={{ padding: 24, color: '#5A7A8A' }}>Loading...</div>;

  const reports = [
    { key: 'visibility', title: 'Visibility & Reach', desc: 'How findable you are across every channel — and who you\'re invisible to', color: '#2D9CDB', hasData: true },
    { key: 'audience', title: 'Audience Intelligence', desc: 'Who\'s visiting, whether they\'re the right people, and when to reach them', color: '#EF6C33', hasData: true },
    { key: 'conversion', title: 'Conversion Intelligence', desc: 'The complete path from visit to action — and exactly where it breaks', color: 'rgba(12,74,96,0.8)', hasData: true },
    { key: 'search', title: 'Search Intelligence', desc: 'Your full search presence, quick wins, and the clicks you should be getting', color: '#2D9CDB', hasData: true },
    { key: 'content', title: 'Content Intelligence', desc: 'Which content earns its place and which is wasted effort', color: 'rgba(12,74,96,0.8)', hasData: true },
    { key: 'presence', title: 'Business Presence Score', desc: 'Your holistic online health across search, maps, website, and reviews', color: '#999', hasData: false },
  ];

  return (
    <div>
      {/* Intelligence Banner */}
      <div style={{ background: '#0B1C24', borderRadius: 10, padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, flexShrink: 0, color: '#2D9CDB' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
            <path d="M12 2a7 7 0 017 7c0 2.5-1.5 4.5-3 6l-1 4H9l-1-4c-1.5-1.5-3-3.5-3-6a7 7 0 017-7z" />
            <path d="M9 19h6M10 22h4" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>IA Insights</span>
            <span style={{ background: 'rgba(151,204,4,0.15)', color: '#97CC04', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>Powered by ARGUS</span>
          </div>
          <p style={{ color: '#A8CDD8', fontSize: 13, marginTop: 6, lineHeight: 1.5, maxWidth: 700 }}>
            ARION's intelligence layer. ARGUS analyzes every data point collected across your website, search presence, business profile, and content to surface the insights that matter.
          </p>
          <p style={{ color: '#667788', fontSize: 11, marginTop: 8 }}>Reports auto-generate quarterly · Next: July 1, 2026</p>
        </div>
      </div>

      {/* Report cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {reports.map(r => (
          <div key={r.key} style={{ background: '#fff', border: '1px solid rgba(45,156,219,0.12)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.hasData ? '#1D9E75' : '#ccc' }} />
              <span style={{ fontSize: 10, color: r.hasData ? '#1D9E75' : '#999' }}>{r.hasData ? 'Q1 2026 · Ready' : 'Requires additional data sources'}</span>
            </div>

            {/* Mini sparkline */}
            <div style={{ height: 48, marginTop: 10, background: '#F8FAFC', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
              {r.key === 'presence' ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  {[{ label: 'Web', color: '#1D9E75' }, { label: 'Search', color: '#1D9E75' }, { label: 'GBP', color: '#D4A800' }, { label: 'Bing', color: '#D85A30' }, { label: 'Content', color: '#D4A800' }].map(dot => (
                    <div key={dot.label} style={{ textAlign: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot.color, margin: '0 auto 2px' }} />
                      <div style={{ fontSize: 8, color: '#5A7A8A' }}>{dot.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: r.color, opacity: 0.2 + Math.random() * 0.8, height: `${15 + Math.random() * 85}%` }} />
                ))
              )}
            </div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6 }}>Jan 1 – Mar 31, 2026</div>

            <button onClick={() => setActiveModal(r.key)} style={{ marginTop: 8, padding: '6px 12px', fontSize: 11, fontWeight: 500, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', width: '100%' }}>
              View full report
            </button>
          </div>
        ))}
      </div>

      {/* STELLA upgrade nudge */}
      <div style={{ background: '#F8FAFC', border: '1px solid rgba(45,156,219,0.12)', borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontSize: 12, color: '#5A7A8A' }}>
        Want predictive analytics, automated anomaly alerts, and revenue forecasting? Add <span style={{ color: '#4C5BD4', fontWeight: 600 }}>STELLA</span> for advanced BI dashboards powered by <span style={{ color: '#6B9402', fontWeight: 600 }}>ARGUS</span>.
      </div>

      <ConsultingUpsell headline="Want IA to interpret your reports and build a growth plan?" subtext="Strategy sessions with your data." serviceType="Analytics Consulting" triggerPage="ia-insights" />

      {/* Modal */}
      {activeModal && <ReportModal reportKey={activeModal} data={data} onClose={() => setActiveModal(null)} />}
    </div>
  );
}
