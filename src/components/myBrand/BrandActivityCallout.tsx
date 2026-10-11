// BrandActivityCallout — the My Brand call-out that replaced the deleted
// Overview page (scope MY_BRAND_CALENDAR_CALLOUTS_SCOPE_2026-07-21, locked
// 2026-07-22). Two placements:
//   variant="today" — home Command Center → Calendar tab, above the grid
//   variant="week"  — ARION dashboard, compact "My Brand this week" card
//
// Self-hiding: renders nothing while loading, when the tenant has no ARION
// (My Brand is ARION's brand section — same signal that puts it in the nav),
// when the My Brand APIs are unavailable (launch gate / tier → calls fail
// soft), or when there is genuinely nothing to call out. No new gate
// mechanisms (locked D2) — absence of data is the guard.
//
// Data (one load() on mount, gated on api readiness — no render-driven
// refetch, per convention_data_fetching; every call fails soft):
//   GET /api/v1/my-brand/social/posts?from=today&to=+7d   (LUMEN)
//   GET /api/v1/my-brand/assets?sort=newest&limit=6       (LUMEN)
//   GET /tenants/me/argus-credits                         (oliver-api)
//
// Cards are never fully clickable — inline "Open →" links only (locked
// hero-card convention).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calendar, FolderOpen, Palette, Share2, Zap } from "lucide-react";
import { useEnabledServices } from "../../hooks/useEnabledServices";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";

// My Brand carries the SPARK product accent — see PRODUCT_ACCENT in IadmModal.tsx.
const ACCENT = "#EF6C33";
const LOW_CREDIT_THRESHOLD = 100; // keep in lockstep with ArgusBalanceBadge

interface PostTarget {
  platform: string;
}
interface SocialPost {
  post_id: string;
  status: string;
  body_default: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  targets?: PostTarget[];
}
interface BrandAsset {
  asset_id: string;
  kind: string;
  created_at: string | null;
}
// Real /my-brand/assets list shape (verified against the live endpoint
// 2026-07-22): { data: { rows, limit, offset } } — sparkApi NEVER unwraps the
// {data:…} envelope (lib/sparkApi.ts "Never unwrap" comment; only useOliverApi
// strips it). The deleted landing page assumed both auto-unwrap AND an
// { items, total } body — its Assets stat silently never rendered.
interface AssetListResponse {
  data: { rows: BrandAsset[] };
}
interface ArgusCreditsResponse {
  balance_credits: number;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BrandActivityCallout({ variant, className }: { variant: "today" | "week"; className?: string }) {
  const { enabledServices } = useEnabledServices();
  const { get, ready: sparkReady } = useSparkApi();
  const oliverApi = useOliverApi();

  // Same availability signal GetStartedCard uses: My Brand lives under ARION.
  const hasArion = enabledServices.has("arion_dashboard");

  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [assets, setAssets] = useState<BrandAsset[] | null>(null);
  const [credits, setCredits] = useState<ArgusCreditsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!sparkReady || !hasArion) return;
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 7);
    const postsQs = new URLSearchParams({ from: ymd(from), to: ymd(to) });

    const [postsRes, assetsRes, creditsRes] = await Promise.all([
      // sparkApi NEVER unwraps the {data:…} envelope — the enveloped branch
      // below is the real path; the bare-array branch is kept defensively.
      get<SocialPost[] | { data: SocialPost[] }>(`/api/v1/my-brand/social/posts?${postsQs}`).catch(() => null),
      get<AssetListResponse>("/api/v1/my-brand/assets?sort=newest&limit=6&offset=0").catch(() => null),
      oliverApi.ready
        ? oliverApi.get<ArgusCreditsResponse>("/tenants/me/argus-credits").catch(() => null)
        : Promise.resolve(null),
    ]);

    setPosts(postsRes ? (Array.isArray(postsRes) ? postsRes : postsRes.data || []) : null);
    setAssets(assetsRes?.data?.rows ?? null);
    setCredits(creditsRes);
    setLoaded(true);
  }, [get, oliverApi, sparkReady, hasArion]);

  useEffect(() => { load(); }, [load]);

  const today = ymd(new Date());
  const derived = useMemo(() => {
    const all = posts ?? [];
    const dueToday = all.filter(
      (p) => p.status === "scheduled" && p.scheduled_for && ymd(new Date(p.scheduled_for)) === today,
    );
    const publishedToday = all.filter(
      (p) => p.status === "published" && p.published_at && ymd(new Date(p.published_at)) === today,
    );
    const scheduledWeek = all
      .filter((p) => p.status === "scheduled" && p.scheduled_for)
      .sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || ""));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newAssets = (assets ?? []).filter(
      (a) => a.created_at && new Date(a.created_at).getTime() >= weekAgo.getTime(),
    );
    return { dueToday, publishedToday, scheduledWeek, newAssets };
  }, [posts, assets, today]);

  const lowCredits = credits != null && credits.balance_credits < LOW_CREDIT_THRESHOLD;

  // Self-hide: not loaded yet, no ARION, both My Brand calls failed (feature
  // dark or API down), or nothing to say.
  if (!loaded || !hasArion) return null;
  if (posts === null && assets === null) return null;
  const hasAnything =
    derived.dueToday.length > 0 ||
    derived.publishedToday.length > 0 ||
    derived.scheduledWeek.length > 0 ||
    derived.newAssets.length > 0 ||
    lowCredits;
  if (!hasAnything) return null;

  const chips: Array<{ icon: typeof Calendar; label: string; amber?: boolean }> = [];
  if (variant === "today") {
    if (derived.dueToday.length > 0) chips.push({ icon: Calendar, label: `${derived.dueToday.length} post${derived.dueToday.length === 1 ? "" : "s"} due today` });
    if (derived.publishedToday.length > 0) chips.push({ icon: Share2, label: `${derived.publishedToday.length} published today` });
    if (derived.scheduledWeek.length > 0) chips.push({ icon: Calendar, label: `${derived.scheduledWeek.length} scheduled this week` });
  } else {
    if (derived.scheduledWeek.length > 0) chips.push({ icon: Calendar, label: `${derived.scheduledWeek.length} post${derived.scheduledWeek.length === 1 ? "" : "s"} scheduled this week` });
  }
  if (derived.newAssets.length > 0) {
    chips.push({ icon: FolderOpen, label: `${derived.newAssets.length}${derived.newAssets.length === 6 ? "+" : ""} new asset${derived.newAssets.length === 1 ? "" : "s"} (7d)` });
  }
  if (lowCredits) chips.push({ icon: Zap, label: `Low AI credits: ${credits!.balance_credits.toLocaleString()}`, amber: true });

  return (
    <div
      className={`rounded-xl border border-slate-200 px-4 py-3${className ? ` ${className}` : ""}`}
      style={{ background: "linear-gradient(90deg, rgba(239,108,51,0.08), #ffffff)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4" style={{ color: ACCENT }} />
          <span className="font-semibold text-slate-900 text-sm">
            {variant === "today" ? "Today's brand activity" : "My Brand this week"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/app/services/my_brand_calendar"
            className="text-xs font-semibold hover:underline flex items-center gap-0.5"
            style={{ color: ACCENT }}
          >
            Open Calendar <ArrowUpRight className="h-3 w-3" />
          </Link>
          {derived.newAssets.length > 0 && (
            <Link
              to="/app/services/my_brand_assets"
              className="text-xs text-slate-600 hover:underline flex items-center gap-0.5"
            >
              Asset Library <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((c) => {
          const Icon = c.icon;
          return (
            <span
              key={c.label}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
                c.amber
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <Icon className="h-3 w-3" style={c.amber ? undefined : { color: ACCENT }} />
              {c.label}
            </span>
          );
        })}
      </div>

      {variant === "week" && derived.scheduledWeek.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {derived.scheduledWeek.slice(0, 3).map((p) => {
            const when = new Date(p.scheduled_for!);
            const day = ymd(when) === today
              ? "Today"
              : when.toLocaleDateString(undefined, { weekday: "short" });
            const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            const body = (p.body_default || "").trim();
            const snippet = body ? (body.length > 60 ? `${body.slice(0, 60)}…` : body) : "(no text)";
            const platforms = (p.targets || []).map((t) => t.platform).join(", ");
            return (
              <div key={p.post_id} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="shrink-0 font-semibold text-slate-800 w-14">{day} {""}</span>
                <span className="shrink-0 text-slate-500">{time}</span>
                <span className="min-w-0 flex-1 truncate">{snippet}</span>
                {platforms && <span className="shrink-0 text-[10px] uppercase font-semibold text-slate-400">{platforms}</span>}
              </div>
            );
          })}
          {derived.scheduledWeek.length > 3 && (
            <div className="text-[11px] text-slate-500">+{derived.scheduledWeek.length - 3} more this week</div>
          )}
        </div>
      )}
    </div>
  );
}

export default BrandActivityCallout;
