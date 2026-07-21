// MyBrandLandingPage — overview hub for the My Brand product area.
//
// "My Brand" is the in-house, IL-powered creative studio: image generation,
// brand voice monitoring, template (mini-canva) studio, asset library, and
// the social channels stack (connections, composer, calendar, analytics).
// Schema landed in LUMEN-API migration 050 (brand_voice_profile,
// brand_image_generation_job, template_studio_template, brand_asset,
// social_post_metric…) and core.tenant_social_connection / post / target.
//
// Rebuilt to the canonical SparkPageShell skeleton (2026-07-21): this is now
// a REAL overview — fetch-once stats (assets, scheduled/published posts, AI
// credits) in the shell stat strip, a recent-activity feed, and the feature
// tiles kept as quick-links. Tiles follow the locked dashboard-card rule:
// never fully clickable — navigation only via the explicit inline "Open →"
// control.
//
// Data (one load() on mount, gated on api readiness — no render-driven
// refetch, per convention_data_fetching):
//   GET /api/v1/my-brand/assets?sort=newest&limit=6   → count + recent assets
//   GET /api/v1/my-brand/social/posts?from=&to=       → scheduled/published
//   GET /tenants/me/argus-credits (oliver-api)        → AI credit balance
//     (same endpoint/pattern as ArgusBalanceBadge — see that component)
// Each call fails soft (stat shows "—") so a partial outage never blocks the
// quick-links: this page is the front door.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon,
  Mic2,
  LayoutTemplate,
  FolderOpen,
  Share2,
  Edit3,
  Calendar,
  BarChart3,
  ArrowRight,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip, type SparkStat } from "../../components/spark/SparkStatStrip";

// My Brand pages carry the SPARK product accent (#EF6C33) — see PRODUCT_ACCENT
// in IadmModal.tsx. The old bespoke ink-teal (#1A3A4A) is retired.
const ACCENT = "#EF6C33";
// Ink — the dark drilldown-pill color shared with the ARION hero-card
// "See Details →" convention (SecurityOverview.tsx).
const INK = "#0B1C24";

// ── Types (lenient — partial backend fields still render) ──────────────────

interface BrandAssetSummary {
  asset_id: string;
  kind: string;
  title: string | null;
  filename: string | null;
  created_at: string | null;
}
interface AssetListResponse {
  items: BrandAssetSummary[];
  total: number;
}

type PostStatus =
  | "scheduled" | "published" | "failed" | "draft"
  | "cancelled" | "pending_approval" | "rejected";

interface SocialPostSummary {
  id: number;
  scheduled_for: string | null;
  published_at: string | null;
  status: PostStatus;
  body: string;
  platforms: string[];
  created_at: string;
}

// Same response shape ArgusBalanceBadge consumes from oliver-api.
interface ArgusCreditsResponse {
  balance_credits: number;
  balance_dollar_estimate: number;
}
const LOW_CREDIT_THRESHOLD = 100; // keep in lockstep with ArgusBalanceBadge

interface ActivityItem {
  key: string;
  kind: "asset" | "post";
  label: string;
  status?: PostStatus;
  at: string | null;   // when it happened (sort key)
  route: string;
}

const POST_STATUS_META: Record<PostStatus, { label: string; cls: string }> = {
  scheduled:        { label: "Scheduled",        cls: "bg-amber-100 text-amber-800" },
  published:        { label: "Published",        cls: "bg-emerald-100 text-emerald-800" },
  failed:           { label: "Failed",           cls: "bg-rose-100 text-rose-700" },
  draft:            { label: "Draft",            cls: "bg-slate-100 text-slate-700" },
  cancelled:        { label: "Cancelled",        cls: "bg-slate-100 text-slate-500" },
  pending_approval: { label: "Pending approval", cls: "bg-amber-100 text-amber-900" },
  rejected:         { label: "Rejected",         cls: "bg-rose-100 text-rose-700" },
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Static tile config ─────────────────────────────────────────────────────

interface BrandTile {
  key: string;
  name: string;
  description: string;
  route: string;
  icon: LucideIcon;
}

// IA re-cut 2026-07-21 (Brandon): tiles = FEATURES only — things a tenant
// does with their brand. Voice profile + channel connections are SETTINGS
// surfaces (linked below, not tiles); social analytics is a REPORT (ARION IA
// Insights); the approval queue is the IA↔client project workflow
// (Consulting domain) and does not appear here at all.
// Tier surfacing is shell-level on the gated sub-pages (TierGateError →
// upgrade gate) — no hardcoded tier badges here (no-fabricated-catalog rule).
const TILES: BrandTile[] = [
  {
    key: "my_brand_image_studio",
    name: "Image Studio",
    description: "Generate on-brand images from a prompt — uses your brand colors, fonts, and logo.",
    route: "/app/services/my_brand_image_studio",
    icon: ImageIcon,
  },
  {
    key: "my_brand_templates",
    name: "Template Studio",
    description: "Mini-canva: design social posts, ads, and email banners from reusable templates.",
    route: "/app/services/my_brand_templates",
    icon: LayoutTemplate,
  },
  {
    key: "my_brand_assets",
    name: "Asset Library",
    description: "Central library for logos, photos, generated images, and finished designs.",
    route: "/app/services/my_brand_assets",
    icon: FolderOpen,
  },
  {
    key: "my_brand_compose",
    name: "Composer",
    description: "Compose once, publish to every connected channel with per-channel preview.",
    route: "/app/services/my_brand_compose",
    icon: Edit3,
  },
  {
    key: "my_brand_calendar",
    name: "Calendar",
    description: "Schedule and re-arrange upcoming posts across every connected channel.",
    route: "/app/services/my_brand_calendar",
    icon: Calendar,
  },
];

// Settings + reporting surfaces that RELATE to My Brand but live elsewhere.
const ELSEWHERE: { name: string; description: string; route: string; icon: LucideIcon }[] = [
  { name: "Brand Voice & Identity", description: "Your voice profile, tone, logo, and colors — settings every product reads.", route: "/app/services/my_brand_voice", icon: Mic2 },
  { name: "Social Channels", description: "Connect Facebook, Instagram, LinkedIn, and X — integration settings.", route: "/app/services/my_brand_social_channels", icon: Share2 },
  { name: "Social Analytics", description: "Engagement, reach, and follower trends — in ARION IA Insights.", route: "/app/services/arion_ia_insights_trends", icon: BarChart3 },
];

// ── Page ───────────────────────────────────────────────────────────────────

export function MyBrandLandingPage() {
  const { get, ready: sparkReady } = useSparkApi();
  const oliverApi = useOliverApi();
  const ready = sparkReady && oliverApi.ready;

  const [assetsTotal, setAssetsTotal] = useState<number | null>(null);
  const [recentAssets, setRecentAssets] = useState<BrandAssetSummary[]>([]);
  const [posts, setPosts] = useState<SocialPostSummary[] | null>(null);
  const [credits, setCredits] = useState<ArgusCreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // Activity/pipeline window: 30 days back (published) → 60 days forward
      // (scheduled), same window the Calendar list view uses.
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setDate(to.getDate() + 60);
      const postsQs = new URLSearchParams({ from: ymd(from), to: ymd(to) });

      const [assetsRes, postsRes, creditsRes] = await Promise.all([
        get<AssetListResponse>("/api/v1/my-brand/assets?sort=newest&limit=6&offset=0").catch(() => null),
        // useSparkApi.get auto-unwraps {data:...} — but the calendar page saw
        // both shapes in the wild, so accept either (envelope-unwrap memory).
        get<SocialPostSummary[] | { data: SocialPostSummary[] }>(`/api/v1/my-brand/social/posts?${postsQs}`).catch(() => null),
        oliverApi.get<ArgusCreditsResponse>("/tenants/me/argus-credits").catch(() => null),
      ]);

      setAssetsTotal(assetsRes ? assetsRes.total ?? (assetsRes.items?.length ?? 0) : null);
      setRecentAssets(assetsRes?.items ?? []);
      setPosts(postsRes ? (Array.isArray(postsRes) ? postsRes : postsRes.data || []) : null);
      setCredits(creditsRes);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, oliverApi, ready]);

  useEffect(() => { load(); }, [load]);

  const scheduledCount = useMemo(
    () => (posts ? posts.filter((p) => p.status === "scheduled").length : null),
    [posts],
  );
  const publishedCount = useMemo(
    () => (posts ? posts.filter((p) => p.status === "published").length : null),
    [posts],
  );

  const stats: SparkStat[] = useMemo(() => {
    const low = credits != null && credits.balance_credits < LOW_CREDIT_THRESHOLD;
    return [
      { label: "Assets", value: assetsTotal ?? "—", icon: FolderOpen },
      { label: "Scheduled posts", value: scheduledCount ?? "—", icon: Calendar },
      { label: "Published (30d)", value: publishedCount ?? "—", icon: Share2 },
      {
        label: "AI credits",
        value: credits != null ? credits.balance_credits.toLocaleString() : "—",
        icon: Zap,
        accent: low ? "amber" : "default",
      },
    ];
  }, [assetsTotal, scheduledCount, publishedCount, credits]);

  // Recent activity — merge newest assets + post lifecycle events, newest first.
  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];
    for (const a of recentAssets) {
      items.push({
        key: `asset-${a.asset_id}`,
        kind: "asset",
        label: a.title || a.filename || `${a.kind} asset`,
        at: a.created_at,
        route: "/app/services/my_brand_assets",
      });
    }
    for (const p of posts ?? []) {
      items.push({
        key: `post-${p.id}`,
        kind: "post",
        label: (p.body || "").trim().slice(0, 80) || "(no text)",
        status: p.status,
        at: p.published_at || p.created_at,
        route: "/app/services/my_brand_calendar",
      });
    }
    return items
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
      .slice(0, 6);
  }, [recentAssets, posts]);

  return (
    <SparkPageShell
      title="My Brand"
      subtitle="Your creative studio — generate visuals, lock in your voice, design templates, and publish everywhere."
      help="The front door for your brand tools. The strip shows your library, social pipeline, and AI credit balance at a glance; recent activity lists what was created or published lately. Jump into any studio with its Open button."
      stats={!loading ? <SparkStatStrip stats={stats} /> : undefined}
      loading={loading}
      error={error}
    >
      {/* Feature quick-links — dashboard tiles, never fully clickable: the
          inline dark "Open →" pill is the sole navigation control (locked
          hero-card convention). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <TileCard key={tile.key} tile={tile} />
        ))}
      </div>

      {/* Recent activity */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Sparkles className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No activity yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Generate your first on-brand image or schedule a post — everything you create shows up here.
            </p>
            <Link
              to="/app/services/my_brand_image_studio"
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
            >
              <Sparkles className="h-3.5 w-3.5" /> Open Image Studio
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {activity.map((item) => {
              const Icon = item.kind === "asset" ? ImageIcon : Share2;
              const statusMeta = item.status ? POST_STATUS_META[item.status] : null;
              return (
                <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${ACCENT}1A` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {item.kind === "asset" ? <span className="text-slate-500">Asset added — </span> : null}
                    {item.label}
                  </span>
                  {statusMeta && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(item.at)}</span>
                  <Link
                    to={item.route}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#EF6C33] hover:text-[#d75a25]"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings + reports that relate to My Brand but live elsewhere */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Settings &amp; reports for your brand
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ELSEWHERE.map((e) => {
            const Icon = e.icon;
            return (
              <div
                key={e.name}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{e.name}</span>
                  <span className="block text-xs text-slate-500">{e.description}</span>
                  <Link
                    to={e.route}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#EF6C33] hover:text-[#d75a25]"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SparkPageShell>
  );
}

// Dashboard tile — static card (no whole-card link, no hover motion); the
// dark ink pill is the only click target, per the locked hero-card rule.
function TileCard({ tile }: { tile: BrandTile }) {
  const Icon = tile.icon;
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-md"
        style={{ background: `${ACCENT}1A` }}
      >
        <Icon className="h-5 w-5" style={{ color: ACCENT }} />
      </div>

      <div className="mb-1 text-base font-semibold text-slate-900">{tile.name}</div>
      <div className="mb-4 flex-1 text-xs text-slate-600">{tile.description}</div>

      <Link
        to={tile.route}
        className="inline-flex w-fit items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
        style={{ background: INK }}
      >
        Open <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ComingSoonOverlay HOC removed 2026-06-22 — see VoicePage.tsx note.
export default MyBrandLandingPage;
