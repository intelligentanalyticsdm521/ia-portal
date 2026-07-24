// SectionDetail — the DETAIL REPORTS behind one key section.
//
// The funnel (Brandon, 2026-07-24):
//
//   Business Score
//     -> Platform Score            (ARION, SPARK, OLIVER, STELLA)
//        -> Trend / Intelligence / Reporting dashboards
//           -> KEY SECTIONS        (5-8 per report; the score contributors)
//              -> DETAIL REPORTS   (groups of like metrics)  <-- THIS FILE
//                 -> DATA POINTS   (each trended month over month)
//
// A key section is NOT one table. It is several detail reports, each grouping
// like metrics, each metric carrying its own month-over-month movement. That
// is what makes the funnel navigable: a business owner sees a score fall,
// opens the platform, opens the dashboard, opens the section that dropped, and
// lands on the specific detail report — and ultimately the specific data point
// — that caused it.
//
// Every detail report answers: how is this calculated, what is underneath it,
// and what moved.

import { sectionMeta, formatSectionValue } from "../../arion/analytics/sectionMeta";

export interface SectionDetailProps {
  sectionKey: string;
  value: number | string | null;
  priorValue?: number | string | null;
  /** All ARION sources — each detail report pulls only what it needs. */
  data?: any;
  searchData?: any;
  gbpData?: any;
  gbpReviews?: any;
  gbpPosts?: any;
  seoData?: any;
  pluginData?: any;
}

const num = (v: any) => (typeof v === "number" ? v : Number(v) || 0);
const bare = (key: string) => (key.includes(".") ? key.split(".").slice(1).join(".") : key);

/** One data point's month-over-month move. null when there is no prior value. */
function pointDelta(current: number, prior: number | null | undefined) {
  if (prior == null || !isFinite(prior) || prior === 0 || !isFinite(current)) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function DeltaCell({ pct, higherIsBetter = true }: { pct: number | null; higherIsBetter?: boolean }) {
  if (pct == null) return <span className="text-slate-300">—</span>;
  if (Math.abs(pct) < 1) return <span className="text-slate-400">flat</span>;
  const good = higherIsBetter ? pct > 0 : pct < 0;
  return (
    <span className={good ? "text-green-600" : "text-red-600"}>
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

export interface DetailColumn {
  header: string;
  /** Right-aligned + tabular for numbers. */
  numeric?: boolean;
}

/**
 * One DETAIL REPORT: a titled group of like metrics.
 * `rows` may include a trailing delta cell rendered by the caller.
 */
function DetailReport({
  title, description, columns, rows, empty,
}: {
  title: string;
  description?: string;
  columns: DetailColumn[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white">
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="text-[11px] font-semibold text-slate-800">{title}</div>
        {description && <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{description}</div>}
      </div>
      <div className="px-3 py-2">
        {rows.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-1">{empty || "No data for this period yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  {columns.map((c, i) => (
                    <th key={i} className={`py-1.5 font-semibold ${c.numeric ? "text-right" : ""}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    {r.map((cell, j) => (
                      <td key={j} className={`py-1.5 text-slate-700 ${columns[j]?.numeric ? "text-right tabular-nums" : "truncate max-w-[240px]"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** How each section is calculated — owner's language, not a formula. */
const HOW: Record<string, string> = {
  impression_to_visit: "Search Console impressions compared against sessions arriving from search. Where we know your service area we use local-only sessions, so out-of-area traffic does not flatter the rate.",
  local_traffic_share: "Sessions whose city or region falls inside your service area, divided by all sessions.",
  channel_diversity: "One minus the share held by your largest single traffic channel. A site living entirely off one channel scores low even when traffic looks healthy.",
  non_brand_impressions: "Search Console impressions for queries that do not contain your business name — demand from people who did not already know you.",
  avg_position: "Impression-weighted average position across every query you appear for, so a query with 5,000 impressions counts more than one with 5.",
  ctr_vs_benchmark: "Your click-through rate against the rate typical for the positions you hold. Above 100% means your titles and descriptions outperform your ranking.",
  quick_win_count: "Tracked keywords in positions 11-20 — page two. These need the least work to reach page one.",
  engagement_rate: "GA4 engaged sessions divided by total sessions. Engaged means over 10 seconds, a conversion, or two or more page views.",
  bounce_rate: "Sessions that left without engaging — the inverse of engagement rate, shown separately because it is the number most owners already track.",
  mobile_share: "Sessions from phones, divided by all sessions.",
  visit_to_submit: "Form submissions divided by sessions — the share of visitors who make contact.",
  form_completion: "Form submissions divided by form starts. A low number means the form is the obstacle, not your traffic.",
  rating: "Average star rating across every review on your Google Business Profile.",
  review_velocity_30d: "New reviews in the last 30 days, against the previous two 30-day windows to establish direction.",
  response_rate: "Reviews with an owner reply, divided by total reviews. Google publishes this as a profile quality signal.",
  customer_action_rate: "Calls, direction requests and website clicks from your listing, divided by the people who saw it. Unlike profile completeness this keeps moving as your listing, photos and reviews improve.",
  posts_30d: "Posts published across connected accounts in the last 30 days, against a healthy cadence for your industry.",
  follower_growth: "Change in total followers across connected accounts over the comparison window.",
  content_gap_count: "Queries drawing impressions where no page on your site is the clear answer.",
  thin_content_ratio: "Pages below the word count needed to rank or convince, as a share of all pages.",
  mobile_perf: "Google PageSpeed Insights performance score for the mobile version of your site.",
  cwv_score: "Google Core Web Vitals — loading, interactivity and visual stability, measured on real visits where traffic allows.",
  security_score: "Firewall status, blocked attacks and known vulnerabilities reported by the IA plugin.",
  plugins_updates: "Plugins and core versions behind their latest release.",
};

export function SectionDetail(props: SectionDetailProps) {
  const { sectionKey, value, priorValue, searchData, gbpReviews, gbpPosts, gbpData, seoData, data, pluginData } = props;
  const k = bare(sectionKey);
  const meta = sectionMeta(sectionKey);
  const reports: React.ReactNode[] = [];

  // ── Search Visibility sections ──
  if (["impression_to_visit", "non_brand_impressions", "avg_position", "ctr_vs_benchmark"].includes(k)) {
    const queries: any[] = searchData?.breakdowns?.queries || [];
    const pages: any[] = searchData?.breakdowns?.pages || [];
    const devices: any[] = searchData?.breakdowns?.devices || [];

    reports.push(
      <DetailReport
        key="queries"
        title="Query performance"
        description="The searches you appear for. Each row is a data point with its own trend."
        columns={[{ header: "Query" }, { header: "Impr.", numeric: true }, { header: "Clicks", numeric: true }, { header: "CTR", numeric: true }, { header: "Pos.", numeric: true }]}
        rows={queries.slice(0, 12).map((q) => [
          q.query || q.keys?.[0] || "—",
          num(q.impressions).toLocaleString(),
          num(q.clicks).toLocaleString(),
          `${(num(q.ctr) * (num(q.ctr) < 1 ? 100 : 1)).toFixed(2)}%`,
          num(q.position ?? q.avgPosition).toFixed(1),
        ])}
      />,
    );
    if (pages.length) {
      reports.push(
        <DetailReport
          key="pages"
          title="Landing page performance"
          description="Which pages are earning the impressions and the clicks."
          columns={[{ header: "Page" }, { header: "Impr.", numeric: true }, { header: "Clicks", numeric: true }, { header: "Pos.", numeric: true }]}
          rows={pages.slice(0, 10).map((p) => [
            p.page || p.keys?.[0] || "—",
            num(p.impressions).toLocaleString(),
            num(p.clicks).toLocaleString(),
            num(p.position ?? p.avgPosition).toFixed(1),
          ])}
        />,
      );
    }
    if (devices.length) {
      reports.push(
        <DetailReport
          key="devices"
          title="Device split"
          description="Mobile and desktop often behave very differently in search."
          columns={[{ header: "Device" }, { header: "Impr.", numeric: true }, { header: "Clicks", numeric: true }, { header: "CTR", numeric: true }]}
          rows={devices.map((d) => [
            d.device || d.keys?.[0] || "—",
            num(d.impressions).toLocaleString(),
            num(d.clicks).toLocaleString(),
            `${(num(d.ctr) * (num(d.ctr) < 1 ? 100 : 1)).toFixed(2)}%`,
          ])}
        />,
      );
    }
  }

  // ── Traffic / audience sections ──
  if (["local_traffic_share", "channel_diversity", "mobile_share", "engagement_rate", "bounce_rate", "session_quality", "new_returning_balance"].includes(k)) {
    const channels: any[] = data?.channelBreakdown || [];
    const cmp = data?.comparison?.channelBreakdown || [];
    const priorOf = (name: string) => cmp.find((c: any) => (c.channel || c.name) === name);
    if (channels.length) {
      reports.push(
        <DetailReport
          key="channels"
          title="Traffic by channel"
          description="Where your visitors come from, and how each channel moved."
          columns={[{ header: "Channel" }, { header: "Sessions", numeric: true }, { header: "Share", numeric: true }, { header: "MoM", numeric: true }]}
          rows={(() => {
            const total = channels.reduce((s, c) => s + num(c.sessions), 0) || 1;
            return channels.slice(0, 10).map((c) => {
              const name = c.channel || c.name || "—";
              const d = pointDelta(num(c.sessions), num(priorOf(name)?.sessions) || null);
              return [name, num(c.sessions).toLocaleString(), `${Math.round((num(c.sessions) / total) * 100)}%`, <DeltaCell key="d" pct={d} />];
            });
          })()}
        />,
      );
    }
    const dev = data?.deviceSplit || {};
    reports.push(
      <DetailReport
        key="devices"
        title="Device mix"
        description="What people are using when they reach you."
        columns={[{ header: "Device" }, { header: "Share", numeric: true }]}
        rows={[["Mobile", `${num(dev.mobile)}%`], ["Desktop", `${num(dev.desktop)}%`], ["Tablet", `${num(dev.tablet)}%`]]}
      />,
    );
    const geo: any[] = data?.cities || data?.countries || [];
    if (geo.length) {
      reports.push(
        <DetailReport
          key="geo"
          title="Where visitors are"
          description="Traffic outside your service area rarely converts."
          columns={[{ header: "Location" }, { header: "Sessions", numeric: true }]}
          rows={geo.slice(0, 8).map((g) => [g.city || g.country || g.name || "—", num(g.sessions ?? g.users).toLocaleString()])}
        />,
      );
    }
  }

  // ── Conversion sections ──
  if (["visit_to_submit", "form_completion", "form_to_contact", "cta_placement"].includes(k)) {
    const s = data?.summary || {};
    reports.push(
      <DetailReport
        key="funnel"
        title="Conversion funnel"
        description="Each step is a data point. The biggest drop between two steps is where to work."
        columns={[{ header: "Step" }, { header: "Count", numeric: true }, { header: "Rate", numeric: true }]}
        rows={(() => {
          const sessions = num(s.totalSessions);
          const forms = num(s.formSubmissions);
          return [
            ["Sessions", sessions.toLocaleString(), "100%"],
            ["Form submissions", forms.toLocaleString(), sessions ? `${((forms / sessions) * 100).toFixed(2)}%` : "—"],
          ];
        })()}
      />,
    );
    const landing: any[] = data?.landingPages || [];
    if (landing.length) {
      reports.push(
        <DetailReport
          key="landing"
          title="Entry pages"
          description="The pages people arrive on — the first chance to convert them."
          columns={[{ header: "Page" }, { header: "Sessions", numeric: true }]}
          rows={landing.slice(0, 10).map((p) => [p.page || p.path || "—", num(p.sessions ?? p.views).toLocaleString()])}
        />,
      );
    }
  }

  // ── Local Presence sections ──
  if (["rating", "review_velocity_30d", "response_rate"].includes(k)) {
    const reviews: any[] = gbpReviews?.reviews || [];
    reports.push(
      <DetailReport
        key="dist"
        title="Rating distribution"
        description="A handful of low ratings drags the average further than most owners expect."
        columns={[{ header: "Rating" }, { header: "Reviews", numeric: true }, { header: "Share", numeric: true }]}
        rows={[5, 4, 3, 2, 1].map((stars) => {
          const n = reviews.filter((r) => num(r.starRating ?? r.rating) === stars).length;
          return [`${stars} star`, String(n), reviews.length ? `${Math.round((n / reviews.length) * 100)}%` : "0%"];
        })}
      />,
    );
    const unanswered = reviews.filter((r) => !r.replyComment);
    reports.push(
      <DetailReport
        key="unanswered"
        title="Awaiting a reply"
        description="Replying is a published Google quality signal and visibly affects trust."
        columns={[{ header: "Reviewer" }, { header: "Rating", numeric: true }, { header: "Received", numeric: true }]}
        rows={unanswered.slice(0, 10).map((r) => [
          r.reviewer?.displayName || "Anonymous",
          String(num(r.starRating ?? r.rating)),
          String(r.createTime || "").slice(0, 10),
        ])}
        empty="Every review has a reply. Well done."
      />,
    );
  }

  if (k === "customer_action_rate") {
    const m = gbpData?.metrics || {};
    reports.push(
      <DetailReport
        key="actions"
        title="What people did after finding you"
        description="Discovery views are how many saw your listing; the rest are what they did next."
        columns={[{ header: "Action" }, { header: "Count", numeric: true }, { header: "Of views", numeric: true }]}
        rows={(() => {
          const views = num(m.impressions);
          const row = (label: string, v: number) => [label, v.toLocaleString(), views ? `${((v / views) * 100).toFixed(2)}%` : "—"];
          return [
            ["Discovery views", views.toLocaleString(), "100%"],
            row("Calls", num(m.calls)),
            row("Direction requests", num(m.directions)),
            row("Website clicks", num(m.websiteClicks)),
          ];
        })()}
      />,
    );
  }

  // ── Content sections ──
  if (["content_gap_count", "thin_content_ratio", "avg_post_depth", "engagement_pct"].includes(k)) {
    const pages: any[] = data?.topPages || data?.breakdowns?.pages || [];
    reports.push(
      <DetailReport
        key="pages"
        title="Page performance"
        description="Which content is earning traffic and which is not."
        columns={[{ header: "Page" }, { header: "Views", numeric: true }]}
        rows={pages.slice(0, 12).map((p) => [p.page || p.path || "—", num(p.views ?? p.sessions).toLocaleString()])}
      />,
    );
    const age = pluginData?.age;
    if (age) {
      reports.push(
        <DetailReport
          key="age"
          title="Content freshness"
          description="Older pages decay in search unless refreshed."
          columns={[{ header: "Age band" }, { header: "Pages", numeric: true }]}
          rows={Object.entries(age).slice(0, 8).map(([band, n]) => [band, String(n)])}
        />,
      );
    }
  }

  // ── Technical sections ──
  if (["mobile_perf", "cwv_score", "security_score", "plugins_updates"].includes(k)) {
    const snaps: any[] = pluginData?.psi || [];
    reports.push(
      <DetailReport
        key="psi"
        title="PageSpeed history"
        description="Each run is a data point. Google scores mobile and desktop separately."
        columns={[{ header: "Run date" }, { header: "Mobile", numeric: true }, { header: "Desktop", numeric: true }]}
        rows={snaps.slice(-8).reverse().map((s) => [
          String(s.run_date || "").slice(0, 10),
          s.mobile_performance ?? "—",
          s.desktop_performance ?? "—",
        ])}
        empty="No PageSpeed runs recorded yet."
      />,
    );
  }

  if (k === "quick_win_count") {
    const kws: any[] = Array.isArray(seoData?.keywords) ? seoData.keywords : [];
    const wins = kws.filter((x) => num(x.currentPosition) >= 11 && num(x.currentPosition) <= 20)
                    .sort((a, b) => num(b.searchVolume) - num(a.searchVolume));
    reports.push(
      <DetailReport
        key="wins"
        title="Keywords on page two"
        description="Ordered by search volume — the top rows are worth the most if they reach page one."
        columns={[{ header: "Keyword" }, { header: "Position", numeric: true }, { header: "Volume", numeric: true }]}
        rows={wins.slice(0, 12).map((x) => [x.keyword || x.name || "—", num(x.currentPosition).toFixed(0), num(x.searchVolume).toLocaleString()])}
        empty="No keywords currently sitting on page two."
      />,
    );
  }

  if (k === "posts_30d") {
    const posts: any[] = gbpPosts?.posts || [];
    reports.push(
      <DetailReport
        key="posts"
        title="Recent posts"
        columns={[{ header: "Published" }, { header: "Summary" }]}
        rows={posts.slice(0, 10).map((p) => [String(p.createTime || "").slice(0, 10), (p.summary || p.content || "—").slice(0, 70)])}
        empty="Nothing published in this period."
      />,
    );
  }

  const how = HOW[k];

  return (
    <div className="space-y-3">
      {/* What moved — the section's own month-over-month, restated up front. */}
      {priorValue != null && (
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-slate-500">Last month <span className="font-semibold text-slate-700">{formatSectionValue(priorValue as any, meta.format)}</span></span>
          <span className="text-slate-300">&rarr;</span>
          <span className="text-slate-500">This month <span className="font-semibold text-slate-900">{formatSectionValue(value, meta.format)}</span></span>
        </div>
      )}

      {how && (
        <div className="rounded border border-slate-200 bg-white px-3 py-2">
          <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-400 mb-1">How this is calculated</div>
          <p className="text-[11px] text-slate-600 leading-relaxed">{how}</p>
        </div>
      )}

      {reports.length > 0
        ? reports
        : <p className="text-[11px] text-slate-500">Detail reports for this section become available once its data source is connected.</p>}
    </div>
  );
}

export default SectionDetail;
