// SocialContentPage — My Brand > Social Content (re-cut §1, 2026-07-22).
//
// Meta-Business-Suite-style content view: every post as a card —
// thumbnail · platforms · date · status — with per-post general metrics
// (impressions, reach, likes, comments, shares, clicks) from
// lumen.social_post_metric, platform/status filters, and the
// "View full report →" affordance that lands on the first-pass report page
// (the deep reporting grows THERE, feeding toward IA Insights — not a new
// A/B-test product).
//
// Status vocabulary (re-cut §2, locked): Draft · Scheduled · Published.
// `failed` is NOT a lane — a failed post renders in place with a red
// "didn't publish — retry" marker (silent failures are the catch→swallow
// pattern; the marker keeps them visible).
//
// Data: GET /api/v1/my-brand/social/content (posts + targets + LEFT-joined
// metric rollup). Thumbnails: one-shot /api/v1/my-brand/assets fetch
// (contract: {data:{rows}} — NOT {items,total}) joined client-side by asset
// id; the days toggle refetches (deliberate user action), platform/status
// filter client-side per the fetch-once convention.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Image as ImageIcon, ExternalLink, AlertCircle, BarChart3,
  Eye, Users, ThumbsUp, MessageCircle, Share2, MousePointerClick,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

// Platform glyph colors — mirrors SocialChannelsPage's defs.
const PLATFORM_BRAND: Record<string, { color: string; label: string }> = {
  facebook:  { color: "#1877F2", label: "Facebook" },
  instagram: { color: "#E4405F", label: "Instagram" },
  x:         { color: "#0F1419", label: "X" },
  linkedin:  { color: "#0A66C2", label: "LinkedIn" },
};

interface ContentTarget {
  platform: string;
  status: string;
  permalink: string | null;
  error_class: string | null;
  published_at: string | null;
}

interface ContentMetrics {
  impressions: number; reach: number; likes: number; comments: number;
  shares: number; clicks: number; saves: number; engagement: number;
}

interface ContentRow {
  post_id: string;
  status: string;
  body_default: string | null;
  asset_ids: string[];
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  voice_score: number | null;
  targets: ContentTarget[];
  metrics: ContentMetrics | null;
}

interface SummaryData {
  posts: { published: number; scheduled: number; draft: number; failed: number; total: number };
  impressions: number; reach: number; engagement: number;
}

type AssetRow = { asset_id: string; url?: string | null; read_url?: string | null; blob_url?: string | null };

type StatusFilter = "all" | "published" | "scheduled" | "draft";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scheduled: { label: "Scheduled", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-600 border-slate-200" },
  publishing:{ label: "Publishing…", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

export function SocialContentPage() {
  const sparkApi = useSparkApi();
  const navigate = useNavigate();

  const [days, setDays] = useState<30 | 90>(30);
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [assetUrlById, setAssetUrlById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [contentR, summaryR, assetsR] = await Promise.all([
          sparkApi.get<{ data: ContentRow[] }>(`/api/v1/my-brand/social/content?days=${days}&limit=120`),
          sparkApi.get<{ data: SummaryData }>(`/api/v1/my-brand/social/analytics/summary?days=${days}`),
          sparkApi.get<{ data: { rows: AssetRow[] } }>(`/api/v1/my-brand/assets?kind=image&limit=200`),
        ]);
        if (cancelled) return;
        setRows(contentR?.data || []);
        setSummary(summaryR?.data || null);
        const map: Record<string, string> = {};
        for (const a of assetsR?.data?.rows || []) {
          const url = a.url || a.read_url || a.blob_url;
          if (a.asset_id && url) map[String(a.asset_id).toLowerCase()] = url;
        }
        setAssetUrlById(map);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sparkApi, days]);

  const filtered = useMemo(() => {
    let out = rows || [];
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (platformFilter !== "all") out = out.filter((r) => r.targets.some((t) => t.platform === platformFilter));
    return out;
  }, [rows, statusFilter, platformFilter]);

  const thumbFor = (r: ContentRow): string | null => {
    const first = (r.asset_ids || [])[0];
    return first ? assetUrlById[String(first).toLowerCase()] || null : null;
  };

  const statusChips: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "published", label: "Published" },
    { key: "scheduled", label: "Scheduled" },
    { key: "draft", label: "Drafts" },
  ];

  return (
    <SparkPageShell
      title="Social Content"
      subtitle="Everything you've published and scheduled, with how each post performed."
      help="Cards show each post with its platforms, date, and per-post metrics once they arrive. Use the full report for totals and daily trends."
      loading={loading}
      error={error}
      actions={
        <button
          type="button"
          className="spark-btn spark-btn-primary spark-btn-sm"
          onClick={() => navigate("/app/services/my_brand_social_report")}
        >
          <BarChart3 size={14} className="mr-1.5" /> View full report →
        </button>
      }
      stats={summary ? (
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span><strong>{fmtNum(summary.posts.published)}</strong> published</span>
          <span><strong>{fmtNum(summary.posts.scheduled)}</strong> scheduled</span>
          <span><strong>{fmtNum(summary.impressions)}</strong> impressions</span>
          <span><strong>{fmtNum(summary.reach)}</strong> reach</span>
          <span><strong>{fmtNum(summary.engagement)}</strong> engagement</span>
          {summary.posts.failed > 0 && (
            <span className="text-red-600 font-medium">{summary.posts.failed} didn't publish</span>
          )}
        </div>
      ) : null}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          {statusChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatusFilter(c.key)}
              className={`spark-pill ${statusFilter === c.key ? "spark-pill-active" : ""}`}
            >
              {c.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button type="button" onClick={() => setPlatformFilter("all")}
            className={`spark-pill ${platformFilter === "all" ? "spark-pill-active" : ""}`}>All platforms</button>
          {Object.entries(PLATFORM_BRAND).map(([key, def]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlatformFilter(key)}
              className={`spark-pill ${platformFilter === key ? "spark-pill-active" : ""}`}
            >
              {def.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {[30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d as 30 | 90)}
              className={`spark-pill ${days === d ? "spark-pill-active" : ""}`}
            >
              Last {d} days
            </button>
          ))}
        </div>
      }
    >
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">
          No posts in this view yet. Schedule your first post from <button
            type="button"
            className="text-sky-600 underline"
            onClick={() => navigate("/app/services/my_brand_calendar")}
          >Social Hub</button>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const chip = STATUS_CHIP[r.status] || STATUS_CHIP.draft;
            const failed = r.status === "failed";
            const thumb = thumbFor(r);
            const when = r.published_at || r.scheduled_for || r.created_at;
            const permalink = r.targets.find((t) => t.permalink)?.permalink || null;
            return (
              <div key={r.post_id} className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col">
                <div className="h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {failed ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        <AlertCircle size={11} /> Didn't publish — retry from Social Hub
                      </span>
                    ) : (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}>{chip.label}</span>
                    )}
                    {r.targets.map((t, i) => {
                      const b = PLATFORM_BRAND[t.platform] || { color: "#64748B", label: t.platform };
                      return (
                        <span key={i} title={`${b.label}${t.error_class ? ` — ${t.error_class}` : ""}`}
                          style={{ background: `${b.color}18`, color: b.color }}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          {b.label}{t.error_class ? " !" : ""}
                        </span>
                      );
                    })}
                    <span className="ml-auto text-[11px] text-slate-500">{fmtDate(when)}</span>
                  </div>
                  <div className="text-[13px] text-slate-800 line-clamp-3 whitespace-pre-wrap">
                    {r.body_default || <span className="text-slate-400 italic">No text</span>}
                  </div>
                  <div className="mt-auto">
                    {r.metrics ? (
                      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
                        <span className="inline-flex items-center gap-1"><Eye size={11} /> {fmtNum(r.metrics.impressions)}</span>
                        <span className="inline-flex items-center gap-1"><Users size={11} /> {fmtNum(r.metrics.reach)}</span>
                        <span className="inline-flex items-center gap-1"><ThumbsUp size={11} /> {fmtNum(r.metrics.likes)}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle size={11} /> {fmtNum(r.metrics.comments)}</span>
                        <span className="inline-flex items-center gap-1"><Share2 size={11} /> {fmtNum(r.metrics.shares)}</span>
                        <span className="inline-flex items-center gap-1"><MousePointerClick size={11} /> {fmtNum(r.metrics.clicks)}</span>
                      </div>
                    ) : r.status === "published" ? (
                      <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">Metrics arrive after the next ingest pass.</div>
                    ) : null}
                    {permalink && (
                      <a href={permalink} target="_blank" rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline">
                        <ExternalLink size={11} /> View on platform
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SparkPageShell>
  );
}
