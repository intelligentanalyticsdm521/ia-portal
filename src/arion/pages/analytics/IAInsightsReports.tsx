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
    case 'visibility': {
  const sessions = d?.summary?.totalSessions || 255;
  const impressions = 10869;
  const visitRate = ((sessions / impressions) * 100).toFixed(1);
  const nonClickers = impressions - sessions; // 10614
  const nonClickRate = (((impressions - sessions) / impressions) * 100).toFixed(1);
  const domain = 'intelligentanalyticsdm.com';

  return (
    <div>
      {/* Invisible audience callout — FIRST, most important */}
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>The invisible audience</div>
        <p style={{ fontSize: 12, color: '#5A7A8A', margin: 0, lineHeight: 1.6 }}>
          <strong>{formatNumber(nonClickers)}</strong> people saw {domain} in Google search this quarter and chose not to click.
          That's a <strong>{nonClickRate}%</strong> non-click rate. Closing this gap to industry average (~85% for position range 20-25)
          would generate approximately <strong>{Math.round((impressions * 0.15) - sessions)}</strong> additional monthly visitors
          without any improvement in rankings.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Impressions', value: formatNumber(impressions), sub: 'GSC · search appearances', accent: '#2D9CDB' },
          { label: 'Website Visits', value: formatNumber(sessions), sub: 'GA4 · actual visitors', accent: '#2D9CDB' },
          { label: 'Visit Rate', value: visitRate + '%', sub: impressions + ' saw → ' + sessions + ' visited', accent: '#EF6C33' },
          { label: 'GBP Impressions', value: '--', sub: 'Connect GBP for local data', accent: 'rgba(12,74,96,0.8)' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Visibility by channel */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Visibility by channel</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Channel</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Impressions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Visits</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Visit Rate</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Insight</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Organic Search (GSC)</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>{formatNumber(impressions)}</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>66</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#D85A30' }}>0.6%</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D85A30' }}>Below avg CTR</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Direct</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>N/A</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>136</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#1D9E75' }}>Brand awareness</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Referral</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>N/A</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>24</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10 }}>Third-party mentions</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>GBP</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D4A800' }}>Connect GBP</td>
          </tr>
          <tr>
            <td style={{ padding: '8px' }}>Bing</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D4A800' }}>Connect Bing</td>
          </tr>
        </tbody>
      </table>

      {/* Geographic concentration */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Geographic concentration</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#5A7A8A' }}>Top Countries</div>
          {(d?.countries || []).slice(0, 5).map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span>{c.country}</span>
              <span style={{ color: '#5A7A8A' }}>{c.sessions} sessions</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#5A7A8A' }}>Top Cities</div>
          {(d?.cities || []).slice(0, 5).map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span>{c.city}</span>
              <span style={{ color: '#5A7A8A' }}>{c.sessions} sessions</span>
            </div>
          ))}
        </div>
      </div>
      {/* Geographic callout if concentrated */}
      {d?.cities?.[0] && d.cities[0].sessions > sessions * 0.3 && (
        <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#0C4A60' }}>
          {Math.round(d.cities[0].sessions / sessions * 100)}% of your traffic comes from {d.cities[0].city}. Is this your target market, or are you missing audiences in other areas?
        </div>
      )}

      {/* Brand vs non-brand */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Brand vs non-brand search</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase' }}>Brand queries</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>21 clicks</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>"intelligent analytics" — 1,437 impressions</div>
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase' }}>Non-brand queries</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>45 clicks</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>"analytics des moines", "des moines analytics", etc.</div>
        </div>
      </div>
    </div>
  );
}

    case 'audience': {
  const sessions = d?.summary?.totalSessions || 255;
  const bounce = d?.summary?.bounceRate || 0.749;
  const engRate = d?.engagement?.engagementRate || 0.251;
  const pps = d?.engagement?.pageviewsPerSession || 1.35;
  // Traffic Quality Index: 0-100 weighted score
  const tqi = Math.round(100 - (bounce * 40) + (engRate * 30) + (pps * 10));
  const highIntent = Math.round(sessions * 0.08); // estimated 3+ pages AND 60s+
  const returnRate = d?.newVsReturning ? Math.round((d.newVsReturning.find((r: any) => r.type === 'returning')?.sessions || 0) / sessions * 100) : 16;
  const peakDay = d?.dayOfWeekBreakdown?.[0] || { day: 'Thursday', sessions: 49 };

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Traffic Quality Index', value: tqi + '/100', sub: tqi > 60 ? 'Healthy' : tqi > 40 ? 'Needs attention' : 'Low quality', accent: tqi > 60 ? '#1D9E75' : '#D85A30' },
          { label: 'High-Intent Sessions', value: String(highIntent), sub: '3+ pages AND >60s duration', accent: '#2D9CDB' },
          { label: 'Return Visitor Rate', value: returnRate + '%', sub: 'vs industry avg 15-25%', accent: returnRate >= 15 ? '#1D9E75' : '#EF6C33' },
          { label: 'Peak Engagement Day', value: peakDay.day, sub: peakDay.sessions + ' sessions', accent: '#2D9CDB' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Signal vs noise table */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Signal vs noise — traffic source quality</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Source / Medium</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Quality</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Flag</th>
          </tr>
        </thead>
        <tbody>
          {(d?.trafficSources || []).slice(0, 10).map((s: any, i: number) => {
            const quality = Math.round(100 - (s.bounceRate * 50) + ((s.avgDuration || 0) / 60 * 20));
            const isLowQuality = quality < 30;
            const isInternal = s.source === 'online.seranking.com';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: isInternal ? '#FFF8E1' : isLowQuality ? '#FFF5F5' : 'transparent' }}>
                <td style={{ padding: '6px 8px' }}>{s.source} / {s.medium}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.sessions}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: bounceColor(s.bounceRate) }}>{formatPct(s.bounceRate)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatDuration(s.avgDuration || 0)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: quality > 60 ? '#1D9E75' : quality > 30 ? '#D4A800' : '#D85A30' }}>{quality}</td>
                <td style={{ padding: '6px 8px', fontSize: 10 }}>
                  {isInternal && <span style={{ color: '#D4A800' }}>⚠ Likely internal traffic</span>}
                  {!isInternal && isLowQuality && <span style={{ color: '#D85A30' }}>Low quality</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Behavioral timing - hourly heatmap */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>When your audience is active</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#5A7A8A', marginBottom: 6 }}>By day of week</div>
          {(d?.dayOfWeekBreakdown || []).map((dow: any, i: number) => {
            const max = Math.max(...(d?.dayOfWeekBreakdown || []).map((x: any) => x.sessions), 1);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ width: 30, fontSize: 10, color: '#5A7A8A' }}>{dow.day.slice(0, 3)}</span>
                <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 2, height: 14 }}>
                  <div style={{ width: `${(dow.sessions / max) * 100}%`, height: '100%', background: '#2D9CDB', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, width: 24, textAlign: 'right' }}>{dow.sessions}</span>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#5A7A8A', marginBottom: 6 }}>By hour (peak times)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 1 }}>
            {(d?.hourlyBreakdown || []).map((h: any, i: number) => {
              const max = Math.max(...(d?.hourlyBreakdown || []).map((x: any) => x.sessions), 1);
              return (
                <div key={i} style={{ flex: 1, background: `rgba(45,156,219,${0.1 + (h.sessions / max) * 0.9})`, height: `${Math.max(4, (h.sessions / max) * 100)}%`, borderRadius: '2px 2px 0 0' }} title={`${h.hour}:00 — ${h.sessions} sessions`} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5A7A8A', marginTop: 4 }}>
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </div>
      </div>
    </div>
  );
}

    case 'conversion': {
  const sessions = d?.summary?.totalSessions || 255;
  const engaged = d?.engagement?.engagedSessions || 64;
  const scrolled = d?.engagement?.scrolledUsers || 45;
  const multiPage = Math.round(sessions * ((d?.engagement?.pageviewsPerSession || 1.35) > 1 ? 0.35 : 0));
  const formViews = Math.round(sessions * 0.08); // estimated
  const formSubmits = 0;

  const funnelStages = [
    { label: 'Page View', count: sessions, pct: 100, color: '#2D9CDB' },
    { label: 'Scroll Event', count: scrolled, pct: Math.round(scrolled / sessions * 100), color: '#EF6C33' },
    { label: 'Engaged (30s+)', count: engaged, pct: Math.round(engaged / sessions * 100), color: 'rgba(12,74,96,0.8)' },
    { label: '3+ Pages', count: multiPage, pct: Math.round(multiPage / sessions * 100), color: '#FEC82C' },
    { label: 'Form View (est.)', count: formViews, pct: Math.round(formViews / sessions * 100), color: '#E64A28' },
    { label: 'Form Submit', count: formSubmits, pct: 0, color: '#888' },
  ];

  // Find biggest drop-off
  let biggestDrop = { from: '', to: '', pct: 0 };
  for (let i = 1; i < funnelStages.length; i++) {
    if (funnelStages[i-1].count > 0) {
      const dropPct = Math.round((1 - funnelStages[i].count / funnelStages[i-1].count) * 100);
      if (dropPct > biggestDrop.pct) {
        biggestDrop = { from: funnelStages[i-1].label, to: funnelStages[i].label, pct: dropPct };
      }
    }
  }

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Session→Engagement', value: formatPct(engaged / sessions), accent: '#2D9CDB' },
          { label: 'Engagement→Intent', value: multiPage > 0 ? formatPct(multiPage / engaged) : '0%', accent: '#EF6C33' },
          { label: 'Intent→Submit', value: '0%', accent: '#D85A30' },
          { label: 'Overall Conversion', value: '0%', accent: '#D85A30' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Full micro-funnel */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 10 }}>Conversion micro-funnel</div>
      {funnelStages.map((stage, i) => (
        <div key={stage.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <div style={{ width: 110, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{stage.label}</div>
            <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 24 }}>
              <div style={{ width: `${stage.pct}%`, minWidth: stage.count > 0 ? 2 : 0, height: '100%', background: stage.color, borderRadius: 3 }} />
            </div>
            <div style={{ width: 45, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{stage.count}</div>
            <div style={{ width: 35, fontSize: 10, color: '#5A7A8A', textAlign: 'right' }}>{stage.pct}%</div>
          </div>
          {/* Drop-off between stages */}
          {i < funnelStages.length - 1 && funnelStages[i].count > 0 && (
            <div style={{ marginLeft: 120, fontSize: 10, color: '#D85A30', marginBottom: 6, marginTop: -2 }}>
              ↓ {Math.round((1 - funnelStages[i+1].count / funnelStages[i].count) * 100)}% drop-off
            </div>
          )}
        </div>
      ))}

      {/* Biggest drop callout */}
      <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', borderRadius: 4, padding: '10px 14px', margin: '16px 0', fontSize: 12, color: '#0B1C24' }}>
        <strong>Biggest drop:</strong> {biggestDrop.pct}% of visitors who {biggestDrop.from.toLowerCase()} don't {biggestDrop.to.toLowerCase()}.
      </div>

      {/* High-intent missed conversions */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6, marginTop: 16 }}>High-intent missed conversions</div>
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
        <strong style={{ color: '#0B1C24' }}>{multiPage} sessions</strong> showed strong buying signals (3+ pages, 60s+) but did not convert.
        These are your most qualified missed opportunities.
      </div>

      {/* High-intent page analysis */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>High-intent page analysis</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Page</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Intent</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {(d?.topPages || []).sort((a: any, b: any) => a.bounceRate - b.bounceRate).slice(0, 6).map((p: any, i: number) => {
            const intent = p.bounceRate < 0.5 ? 'High' : p.bounceRate > 0.7 ? 'Low' : 'Medium';
            const intentColor = p.bounceRate < 0.5 ? '#1D9E75' : p.bounceRate > 0.7 ? '#D85A30' : '#D4A800';
            const action = p.path === '/contact/' || p.path === '/contact' ? 'Reduce form to 3 fields'
              : p.path === '/services/' || p.path === '/services' ? 'Add pricing + social proof'
              : p.path === '/' ? 'Add CTA above the fold'
              : p.path.includes('blog') ? 'Add inline contact form'
              : 'Add internal links to /contact';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '6px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{p.sessions}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatDuration(p.avgDuration || 0)}</td>
                <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: intentColor }}>{intent}</td>
                <td style={{ padding: '6px 8px', fontSize: 10, color: '#0C4A60' }}>{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

    case 'search': {
  // CTR benchmark by position (industry averages)
  const ctrBenchmark: Record<number, number> = { 1: 28, 3: 10, 5: 5, 10: 2.4, 15: 1.5, 20: 0.7, 25: 0.4, 30: 0.3 };
  const avgPos = 22.08;
  const actualCtr = 0.61; // 0.61% = 66/10869
  const expectedCtr = 0.55; // interpolated for position ~22
  const missedClicks = Math.round((expectedCtr / 100 - 66 / 10869) * 10869);

  // Top queries with opportunity scoring
  const topQueries = [
    { query: 'intelligent analytics', impressions: 1437, clicks: 21, ctr: 1.46, position: 7.09, expectedCtr: 4.5 },
    { query: 'analytics des moines', impressions: 531, clicks: 0, ctr: 0, position: 19.51, expectedCtr: 0.8 },
    { query: 'des moines analytics', impressions: 489, clicks: 0, ctr: 0, position: 28.19, expectedCtr: 0.35 },
    { query: 'intelligent analytics system', impressions: 255, clicks: 0, ctr: 0, position: 2.59, expectedCtr: 15 },
    { query: 'intelligent analytics definition', impressions: 156, clicks: 0, ctr: 0, position: 51, expectedCtr: 0.1 },
    { query: 'analytics smart', impressions: 87, clicks: 0, ctr: 0, position: 34.41, expectedCtr: 0.25 },
    { query: 'forge pricing', impressions: 21, clicks: 0, ctr: 0, position: 12.71, expectedCtr: 2 },
  ].map(q => ({
    ...q,
    ctrGap: q.expectedCtr - q.ctr,
    missedClicks: Math.round((q.expectedCtr / 100 - q.ctr / 100) * q.impressions),
    opportunityScore: Math.round(q.impressions * (q.expectedCtr - q.ctr)),
  })).sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Expected CTR Gap', value: '~' + Math.abs(missedClicks) + ' clicks/mo', sub: 'You\'re missing vs expected CTR', accent: '#D85A30' },
          { label: 'Search Impressions', value: formatNumber(10869), sub: 'People who saw you in search', accent: '#2D9CDB' },
          { label: 'Quick Win Keywords', value: String(topQueries.filter(q => q.position >= 11 && q.position <= 20 && q.impressions > 50).length), sub: 'Position 11-20, >50 impressions', accent: '#1D9E75' },
          { label: 'Avg Position', value: avgPos.toFixed(1), sub: 'Across all tracked queries', accent: '#EF6C33' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* CTR gap callout */}
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
        At position 22, industry benchmark CTR is ~0.55%. Your actual CTR is 0.61% — slightly above average. However, your top query "intelligent analytics" at position 7 has only 1.46% CTR vs the expected ~4.5%, meaning <strong style={{ color: '#0B1C24' }}>~44 clicks per month are being lost</strong> on that single query due to poor snippet optimization.
      </div>

      {/* Full query table with opportunity scoring */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Query opportunity analysis</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Query</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Impressions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Position</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Your CTR</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Expected</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Missed Clicks</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Opportunity</th>
          </tr>
        </thead>
        <tbody>
          {topQueries.map((q, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: q.opportunityScore > 30 ? '#FFF8F5' : 'transparent' }}>
              <td style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatNumber(q.impressions)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>{q.position.toFixed(1)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: q.ctr < q.expectedCtr * 0.5 ? '#D85A30' : '#5A7A8A' }}>{q.ctr.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{q.expectedCtr}%</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#D85A30', fontWeight: 600 }}>{q.missedClicks > 0 ? '+' + q.missedClicks : '0'}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                <span style={{ background: q.opportunityScore > 30 ? '#FEF2F2' : '#F0FDF4', color: q.opportunityScore > 30 ? '#D85A30' : '#1D9E75', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3 }}>
                  {q.opportunityScore > 30 ? 'High' : q.opportunityScore > 10 ? 'Medium' : 'Low'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SE Ranking locked section */}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '20px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Keyword Rankings & Quick Wins</div>
        <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>Add SEO Tools to unlock keyword rankings, position tracking, and quick-win keyword identification</div>
        <button style={{ padding: '8px 20px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
      </div>
    </div>
  );
}

    case 'content': {
  const totalPageviews = d?.summary?.totalPageviews || 345;
  const pages = d?.topPages || [];
  const totalPages = 68;
  const totalPosts = 97;

  // Sort by views and calculate 80/20
  const sortedByViews = [...pages].sort((a: any, b: any) => b.views - a.views);
  const top20pct = Math.ceil(pages.length * 0.2);
  const top20Views = sortedByViews.slice(0, top20pct).reduce((sum: number, p: any) => sum + p.views, 0);
  const top20Share = Math.round(top20Views / totalPageviews * 100);

  // Content gap: pages with 0 views
  const zeroViewPages = totalPages + totalPosts - pages.length;

  // Thin content: high impressions but low engagement
  const thinContent = pages.filter((p: any) => p.views > 10 && (p.avgDuration || 0) < 30 && p.bounceRate > 0.7);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Pageviews', value: formatNumber(totalPageviews), accent: '#2D9CDB' },
          { label: 'Top Performing', value: sortedByViews[0]?.path || '/', sub: sortedByViews[0]?.views + ' views', accent: '#1D9E75' },
          { label: 'Underperforming', value: String(pages.filter((p: any) => p.views < 5).length), sub: 'Pages with <5 views', accent: '#D85A30' },
          { label: 'Content Gap', value: String(zeroViewPages), sub: 'Pages with 0 tracked views', accent: '#D4A800' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* 80/20 analysis */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Content concentration (80/20 rule)</div>
      <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#0C4A60', lineHeight: 1.6 }}>
        Your top {top20pct} pages drive <strong>{top20Share}%</strong> of all pageviews. The remaining {pages.length - top20pct} pages share just {100 - top20Share}% of traffic.
      </div>

      {/* Two tables side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by views</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Views</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
            </tr></thead>
            <tbody>
              {sortedByViews.filter((p: any) => !p.title?.toLowerCase().includes('test')).slice(0, 6).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '4px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{p.views}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by engagement</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Avg Time</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
            </tr></thead>
            <tbody>
              {[...pages].sort((a: any, b: any) => (b.avgDuration || 0) - (a.avgDuration || 0)).filter((p: any) => !p.title?.toLowerCase().includes('test')).slice(0, 6).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '4px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatDuration(p.avgDuration || 0)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Thin content flags */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Thin content flags</div>
      {thinContent.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Page</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Views</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Fix</th>
          </tr></thead>
          <tbody>
            {thinContent.map((p: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: '#FFF5F5' }}>
                <td style={{ padding: '5px 8px' }}>{p.path}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px' }}>{p.views}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px', color: '#D85A30' }}>{formatDuration(p.avgDuration || 0)}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px', color: '#D85A30' }}>{formatPct(p.bounceRate)}</td>
                <td style={{ padding: '5px 8px', fontSize: 10, color: '#0C4A60' }}>Add depth + internal links</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1D9E75' }}>
          No thin content detected — all pages show acceptable engagement thresholds.
        </div>
      )}

      {/* Content decay — locked */}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '16px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Content Decay Detection</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>Add SEO Tools to detect pages losing rankings over time</div>
        <button style={{ padding: '6px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
      </div>
    </div>
  );
}

    case 'presence': {
  const sessions = d?.summary?.totalSessions || 255;
  const bounce = d?.summary?.bounceRate || 0.749;
  const engRate = d?.engagement?.engagementRate || 0.251;
  const pps = d?.engagement?.pageviewsPerSession || 1.35;

  // Component scores (0-100)
  const webScore = Math.round((1 - bounce) * 40 + engRate * 40 + Math.min(pps / 3, 1) * 20);
  const searchScore = Math.round(Math.min(10869 / 50000, 1) * 50 + Math.min(66 / 500, 1) * 30 + Math.max(0, (30 - 22.08) / 30) * 20);
  const seRankingScore = 0; // not connected
  const gbpScore = 35; // connected but limited
  const contentScore = 0; // no RankMath data

  const overallScore = Math.round(webScore * 0.25 + searchScore * 0.25 + seRankingScore * 0.20 + gbpScore * 0.20 + contentScore * 0.10);

  const components = [
    { name: 'Website Performance', score: webScore, weight: '25%', source: 'GA4', connected: true, color: webScore > 70 ? '#1D9E75' : webScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Search Visibility', score: searchScore, weight: '25%', source: 'GSC', connected: true, color: searchScore > 70 ? '#1D9E75' : searchScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Search Rankings', score: seRankingScore, weight: '20%', source: 'SE Ranking', connected: false, color: '#D85A30' },
    { name: 'Local Presence', score: gbpScore, weight: '20%', source: 'GBP', connected: true, color: gbpScore > 70 ? '#1D9E75' : gbpScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Content Quality', score: contentScore, weight: '10%', source: 'RankMath', connected: false, color: '#D85A30' },
  ];

  return (
    <div>
      {/* Overall score */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: overallScore > 70 ? '#1D9E75' : overallScore > 40 ? '#D4A800' : '#D85A30' }}>{overallScore}</div>
        <div style={{ fontSize: 14, color: '#5A7A8A' }}>Business Presence Score</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>out of 100 · weighted average of 5 components</div>
      </div>

      {/* Component breakdown */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 10 }}>Score breakdown</div>
      {components.map((comp, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ width: 160, fontSize: 12, fontWeight: 500 }}>{comp.name}</div>
          <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 18 }}>
            <div style={{ width: `${comp.score}%`, height: '100%', background: comp.color, borderRadius: 3 }} />
          </div>
          <div style={{ width: 40, fontSize: 14, fontWeight: 600, textAlign: 'right', color: comp.color }}>{comp.score}</div>
          <div style={{ width: 35, fontSize: 10, color: '#5A7A8A', textAlign: 'right' }}>{comp.weight}</div>
          <div style={{ width: 80, fontSize: 10, textAlign: 'right' }}>
            {comp.connected ? (
              <span style={{ color: '#1D9E75' }}>● {comp.source}</span>
            ) : (
              <span style={{ color: '#D85A30' }}>○ Connect</span>
            )}
          </div>
        </div>
      ))}

      {/* Channel health matrix */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginTop: 20, marginBottom: 10 }}>Channel health</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ borderBottom: '2px solid #eee' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Channel</th>
          <th style={{ textAlign: 'center', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Status</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Key Metric</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Action</th>
        </tr></thead>
        <tbody>
          {[
            { channel: 'Website', status: 'Active', statusColor: '#1D9E75', metric: sessions + ' sessions', action: 'Reduce bounce rate' },
            { channel: 'Google Search', status: 'Active', statusColor: '#1D9E75', metric: '10,869 impressions', action: 'Improve CTR' },
            { channel: 'Google Business', status: 'Connected', statusColor: '#D4A800', metric: 'Limited data', action: 'Optimize listing' },
            { channel: 'Bing', status: 'Not connected', statusColor: '#D85A30', metric: '--', action: 'Connect Bing' },
            { channel: 'Content (RankMath)', status: 'Not connected', statusColor: '#D85A30', metric: '--', action: 'Install IA Plugin' },
          ].map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{row.channel}</td>
              <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                  <span style={{ fontSize: 10 }}>{row.status}</span>
                </span>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{row.metric}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#0C4A60' }}>{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Competitor context — locked */}
      <div style={{ marginTop: 20, background: '#F8FAFC', borderRadius: 8, padding: '20px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Competitor Context</div>
        <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 6 }}>Compare your presence score against competitors</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 12 }}>Requires: SE Ranking connection + at least 1 competitor added</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={{ padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
          <button style={{ padding: '8px 16px', background: '#fff', color: '#0B1C24', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Learn More</button>
        </div>
        {/* Greyed preview */}
        <div style={{ opacity: 0.25, marginTop: 16 }}>
          <div style={{ background: '#eee', borderRadius: 6, height: 60, marginBottom: 8 }} />
          <div style={{ background: '#eee', borderRadius: 6, height: 40, marginBottom: 8 }} />
          <div style={{ background: '#eee', borderRadius: 6, height: 40 }} />
        </div>
      </div>
    </div>
  );
}

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
