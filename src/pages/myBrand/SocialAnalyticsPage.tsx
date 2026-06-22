// SocialAnalyticsPage — wave 2 of My Brand. Answers two business questions:
//
//   1. "Is my social ROI improving?" — KPIs + 90-day engagement trend.
//   2. "Do on-brand posts perform better?" — voice-score vs engagement
//       scatter (paired with a posts-vs-engagement scatter to control for
//       outlier reach).
//
// Reads from three LUMEN-API my-brand routes already in production
// (migration 050):
//
//   GET /api/v1/my-brand/social/analytics/summary?platform=&days=30
//   GET /api/v1/my-brand/social/analytics/posts?platform=&days=30&order=engagement&limit=5
//   GET /api/v1/my-brand/social/analytics/trends?platform=&days=90
//
// Refresh is rate-limited server-side to 1/hr — the UI exposes a manual
// refresh button next to the "Last refreshed Xh ago" stamp, which is
// disabled (and tooltipped) while the hour hasn't elapsed.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCcw, TrendingUp, Activity, Eye, Volume2, BarChart3,
  Share2, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, CartesianGrid, ZAxis,
} from "recharts";
import { useSparkApi } from "../../hooks/useSparkApi";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";

// ── Types ─────────────────────────────────────────────────────────────────
interface AnalyticsSummary {
  posts_published: number;
  total_impressions: number;
  total_engagement: number;
  average_voice_score: number | null;
  last_refreshed_at: string | null;
  // Per-platform breakdown for the small platform tabs strip.
  platforms_with_data?: string[];
}

interface TopPost {
  id: number;
  body: string;
  primary_platform: string;
  published_at: string;
  impressions: number;
  engagement: number;
  voice_score: number | null;
}

interface TrendPoint {
  date: string;           // YYYY-MM-DD
  engagement: number;
  impressions: number;
  posts: number;
}

interface ScatterPostPoint {
  posts: number;          // posts on day
  engagement: number;     // total engagement that day
  voice: number | null;   // average voice score that day
  date: string;
}

type Platform = "all" | "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "youtube" | "gbp";

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  facebook:  { label: "Facebook",        color: "#1877F2" },
  instagram: { label: "Instagram",       color: "#E4405F" },
  linkedin:  { label: "LinkedIn",        color: "#0A66C2" },
  x:         { label: "X",               color: "#0F1419" },
  tiktok:    { label: "TikTok",          color: "#000000" },
  youtube:   { label: "YouTube",         color: "#FF0000" },
  gbp:       { label: "Google Business", color: "#34A853" },
};
function platformMeta(p: string) {
  return PLATFORM_META[p] || { label: p, color: "#64748B" };
}

// ── Page ──────────────────────────────────────────────────────────────────
export function SocialAnalyticsPage() {
  const { get, post, ready } = useSparkApi();
  // Tier gate — analytics requires Standard (30d window). 90d trends and CSV
  // export are further gated below where they render. Lite tenants see the
  // full-page upgrade card.
  const gate = useMyBrandTier();
  if (gate.ready && !gate.meets("social_analytics_30d")) {
    return (
      <div className="p-6">
        <MyBrandUpgradeGate
          featureName="Social Analytics"
          requiredTier={gate.requiredTier("social_analytics_30d")}
          currentTier={gate.tier}
        />
      </div>
    );
  }
  const [platform, setPlatform] = useState<Platform>("all");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const platformQ = platform === "all" ? "" : `platform=${platform}&`;
      // useSparkApi.get auto-unwraps {data:...} envelopes — read direct.
      const [s, p, t] = await Promise.all([
        get<AnalyticsSummary>(`/api/v1/my-brand/social/analytics/summary?${platformQ}days=30`),
        get<TopPost[]>(`/api/v1/my-brand/social/analytics/posts?${platformQ}days=30&order=engagement&limit=5`),
        get<TrendPoint[]>(`/api/v1/my-brand/social/analytics/trends?${platformQ}days=90`),
      ]);
      setSummary(s || null);
      setTopPosts(Array.isArray(p) ? p : []);
      setTrends(Array.isArray(t) ? t : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, platform]);

  useEffect(() => { load(); }, [load]);

  // Manual refresh — fires the LUMEN-API "ingest now" job which pulls from
  // each connected channel. Server enforces a 1/hr rate-limit per tenant,
  // so we surface that lockout as an inline message rather than swallowing
  // the 429.
  async function manualRefresh() {
    if (!ready || refreshing) return;
    setRefreshing(true); setRefreshMessage(null);
    try {
      await post(`/api/v1/my-brand/social/analytics/refresh`, { platform: platform === "all" ? null : platform });
      setRefreshMessage("Refresh queued — data will repopulate in ~60 seconds.");
      // Pull fresh summary after a short delay so the "last refreshed" stamp
      // updates without making the user click again.
      setTimeout(() => { load(); }, 4000);
    } catch (e) {
      const msg = (e as Error).message || "Refresh failed";
      if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
        setRefreshMessage("Already refreshed recently. Try again in an hour.");
      } else {
        setRefreshMessage(msg);
      }
    } finally {
      setRefreshing(false);
    }
  }

  // ── Render guards ───────────────────────────────────────────────────────
  const hasAnyData = !!summary && (summary.posts_published || 0) > 0;
  const lastRefreshLabel = useMemo(() => formatRelativeTime(summary?.last_refreshed_at), [summary?.last_refreshed_at]);
  const canRefresh = useMemo(() => {
    if (!summary?.last_refreshed_at) return true;
    const last = new Date(summary.last_refreshed_at).getTime();
    return Date.now() - last >= 3600_000;
  }, [summary?.last_refreshed_at]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Social Analytics</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            See what's working — total impressions, engagement, voice fidelity, and your top posts of the last 30 days.
          </p>
        </div>
        <Link
          to="/app/services/my_brand_calendar"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View calendar
        </Link>
      </header>

      <PlatformTabs
        platform={platform}
        onChange={setPlatform}
        available={summary?.platforms_with_data || []}
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {loading && !summary ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading analytics…</div>
      ) : !hasAnyData ? (
        <EmptyState />
      ) : (
        <>
          <KpiRow summary={summary!} />
          <TrendChartCard trends={trends} platform={platform} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopPostsCard posts={topPosts} platform={platform} />
            <PostsVsEngagementCard trends={trends} />
          </div>
          <VoiceVsEngagementCard trends={trends} />
        </>
      )}

      <RefreshFooter
        lastLabel={lastRefreshLabel}
        canRefresh={canRefresh}
        refreshing={refreshing}
        onRefresh={manualRefresh}
        message={refreshMessage}
      />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
      <BarChart3 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
      <h3 className="text-sm font-semibold text-slate-900">No analytics yet</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
        Connect a channel and publish your first post to see analytics here. Per-platform metrics flow in within an hour of publish.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          to="/app/services/my_brand_social_channels"
          className="inline-flex items-center rounded-md bg-[#1A3A4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B1C24]"
        >
          Connect a channel
        </Link>
        <Link
          to="/app/services/my_brand_compose"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open composer
        </Link>
      </div>
    </div>
  );
}

// ── Platform tabs ─────────────────────────────────────────────────────────
function PlatformTabs({ platform, onChange, available }: {
  platform: Platform;
  onChange: (p: Platform) => void;
  available: string[];
}) {
  const all: Platform[] = ["all", "facebook", "instagram", "x", "linkedin"];
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
      {all.map((p) => {
        const isActive = platform === p;
        const isAvailable = p === "all" || available.includes(p);
        const meta = p === "all" ? { label: "All", color: "#1A3A4A" } : platformMeta(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => isAvailable && onChange(p)}
            disabled={!isAvailable}
            className={`relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              isActive
                ? "text-slate-900"
                : isAvailable
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 cursor-not-allowed"
            }`}
            style={isActive ? { borderBottom: `2px solid ${meta.color}` } : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              {p !== "all" && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: meta.color }}
                />
              )}
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── KPI row ───────────────────────────────────────────────────────────────
function KpiRow({ summary }: { summary: AnalyticsSummary }) {
  const kpis = [
    {
      label: "Posts published",
      value: fmtNum(summary.posts_published),
      icon: Share2,
      tone: "blue",
      sub: "last 30 days",
    },
    {
      label: "Total impressions",
      value: fmtNum(summary.total_impressions),
      icon: Eye,
      tone: "amber",
      sub: "last 30 days",
    },
    {
      label: "Total engagement",
      value: fmtNum(summary.total_engagement),
      icon: Activity,
      tone: "emerald",
      sub: "last 30 days",
    },
    {
      label: "Avg voice score",
      value: summary.average_voice_score == null ? "—" : `${Math.round(summary.average_voice_score)}/100`,
      icon: Volume2,
      tone: "purple",
      sub: summary.average_voice_score == null
        ? "set up your brand voice"
        : "last 30 days",
    },
  ] as const;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div key={k.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k.label}</div>
              <Icon className={`h-4 w-4 ${toneText(k.tone)}`} />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{k.value}</div>
            <div className="text-xs text-slate-500 mt-1">{k.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function toneText(tone: string): string {
  switch (tone) {
    case "blue":    return "text-blue-500";
    case "amber":   return "text-amber-500";
    case "emerald": return "text-emerald-500";
    case "purple":  return "text-purple-500";
    default:        return "text-slate-500";
  }
}

// ── Trend chart card ──────────────────────────────────────────────────────
function TrendChartCard({ trends, platform }: { trends: TrendPoint[]; platform: Platform }) {
  if (!trends.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Engagement trend (90 days)</h3>
        </div>
        <div className="py-8 text-center text-xs text-slate-500">
          Not enough data for a trend yet. Publish a few posts to see this fill in.
        </div>
      </div>
    );
  }

  // Format dates as "MMM d" for the X-axis so it stays readable at 90 points.
  const data = trends.map((t) => ({
    ...t,
    label: formatShortDate(t.date),
  }));
  const platMeta = platform === "all" ? { color: "#1A3A4A", label: "All" } : platformMeta(platform);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Engagement trend (90 days)</h3>
        </div>
        <span className="text-xs text-slate-500">{platMeta.label}</span>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#64748b" }}
              interval={Math.max(0, Math.floor(data.length / 8))}
            />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="engagement"
              stroke={platMeta.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Top posts card ────────────────────────────────────────────────────────
function TopPostsCard({ posts, platform }: { posts: TopPost[]; platform: Platform }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Top 5 posts by engagement</h3>
        <span className="text-xs text-slate-500 ml-auto">
          {platform === "all" ? "All platforms" : platformMeta(platform).label}
        </span>
      </div>
      {posts.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">No posts with engagement yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="text-left py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Post</th>
              <th className="text-right py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Engagement</th>
              <th className="text-right py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Impressions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 max-w-md">
                  <div className="flex items-start gap-2">
                    <span
                      className="inline-block mt-1 h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: platformMeta(p.primary_platform).color }}
                      title={platformMeta(p.primary_platform).label}
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-800 line-clamp-2">{p.body}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{formatShortDate(p.published_at)}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right text-sm font-semibold text-slate-800 whitespace-nowrap">
                  {fmtNum(p.engagement)}
                </td>
                <td className="py-2 text-right text-xs text-slate-600 whitespace-nowrap">
                  {fmtNum(p.impressions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Posts vs engagement scatter ───────────────────────────────────────────
function PostsVsEngagementCard({ trends }: { trends: TrendPoint[] }) {
  const data: ScatterPostPoint[] = trends
    .filter((t) => t.posts > 0)
    .map((t) => ({
      posts: t.posts,
      engagement: t.engagement,
      voice: null,
      date: t.date,
    }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">Posts vs engagement</h3>
        <span className="text-xs text-slate-500">Per day · 90d window</span>
      </div>
      {data.length < 3 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Need a few more days of posting to plot this — publish steadily and check back.
        </div>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="posts"
                name="Posts"
                tick={{ fontSize: 10, fill: "#64748b" }}
                label={{ value: "Posts that day", position: "insideBottom", offset: -8, fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                type="number"
                dataKey="engagement"
                name="Engagement"
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Scatter data={data} fill="#2563eb" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Voice score vs engagement scatter ─────────────────────────────────────
// Answers "do on-brand posts perform better?" — each point is a day where
// we had at least one post with a voice score (set up brand voice first).
function VoiceVsEngagementCard({ trends }: { trends: TrendPoint[] }) {
  // Filter to days with a voice score (trends API includes voice when the
  // tenant has set up a brand voice profile and run a check on each post).
  type T = TrendPoint & { voice_score?: number | null };
  const withVoice = trends as T[];
  const data = withVoice
    .filter((t) => typeof t.voice_score === "number" && (t.voice_score as number) > 0 && t.engagement > 0)
    .map((t) => ({
      voice: t.voice_score as number,
      engagement: t.engagement,
      posts: t.posts,
      date: t.date,
    }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Voice score vs engagement</h3>
          <p className="text-xs text-slate-500 mt-0.5">Do on-brand posts get more engagement?</p>
        </div>
        <span className="text-xs text-slate-500">Per day · 90d window</span>
      </div>
      {data.length < 3 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          {trends.length === 0
            ? "No data yet."
            : "Capture a brand voice profile to start scoring posts — then this chart fills in."}
          {trends.length > 0 && (
            <div className="mt-2">
              <Link
                to="/app/services/my_brand_voice"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Set up brand voice →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="voice"
                name="Voice score"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#64748b" }}
                label={{ value: "Voice score (0–100)", position: "insideBottom", offset: -8, fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                type="number"
                dataKey="engagement"
                name="Engagement"
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <ZAxis type="number" dataKey="posts" range={[40, 240]} name="Posts" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Scatter data={data} fill="#9333EA" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Refresh footer ────────────────────────────────────────────────────────
function RefreshFooter({
  lastLabel, canRefresh, refreshing, onRefresh, message,
}: {
  lastLabel: string;
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  message: string | null;
}) {
  return (
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200">
      <div className="text-xs text-slate-500">Last refreshed: {lastLabel}</div>
      <div className="flex items-center gap-3">
        {message && <span className="text-xs text-slate-600">{message}</span>}
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || refreshing}
          title={canRefresh ? "Pull the latest metrics from each platform" : "Available again 1h after last refresh"}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
            canRefresh && !refreshing
              ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
          }`}
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────
function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.round(ms / 3600_000)}h ago`;
  return `${Math.round(ms / 86400_000)}d ago`;
}

export default SocialAnalyticsPage;
