import { useEffect, useMemo, useState } from "react";
import {
  Share2, Search, Mail, MessageSquare,
  Globe, MousePointerClick, MapPin, Clock, ArrowRight,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

// LeadAttributionCard — "where did this lead come from?" (Release A.2, P4 item 6).
//
// Reads GET /api/v1/attribution/lead/:leadId and shows, in the reading order
// Brandon locked in §8.1: SOURCE first (what it is — an ARION form, a landing
// page, a B2B search), then CHANNEL (where they came from — Facebook, Google,
// an email), then the path they actually walked before they got in touch.
//
// The honest empty state matters as much as the full one. A B2B Lead Gen lead
// was never a website visitor: it has no journey, and saying "Direct" would be
// a lie dressed as data. When there is nothing to show, the card says so.
//
// Self-fetching so it can be dropped anywhere a lead id is known.
//   Job page:   <LeadAttributionCard leadId={id} />          (mounted below)
//   Lead inbox: the same one line — see the note in the header comment of
//               SparkLeadGenJobPage.tsx for the inbox owner.

interface Touch {
  channel: string;
  channel_label: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  page_url: string | null;
  referrer: string | null;
  occurred_at: string;
}

interface AttributionData {
  lead_id: number;
  business_name: string | null;
  source: string | null;
  source_label: string;
  contact_id: number | null;
  has_journey: boolean;
  channel: string | null;
  channel_label: string | null;
  first_touch: Touch | null;
  last_touch: Touch | null;
  campaign: { campaign: string | null; source: string | null; medium: string | null; content: string | null } | null;
  landing_page: string | null;
  path: { url: string; title: string | null; occurred_at: string }[];
  page_count: number;
  duration_minutes: number | null;
}

// This icon set carries no brand marks (lucide dropped them for trademark
// reasons) — the network's NAME does that work in the headline, so a social
// visit just needs to look like a social visit.
const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook: Share2,
  instagram: Share2,
  linkedin: Share2,
  youtube: Share2,
  x: Share2,
  tiktok: Share2,
  nextdoor: Share2,
  pinterest: Share2,
  reddit: Share2,
  organic: Search,
  paid_search: Search,
  google_business_profile: MapPin,
  email: Mail,
  sms: MessageSquare,
  referral: Globe,
  direct: MousePointerClick,
};

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function LeadAttributionCard({ leadId, className = "" }: { leadId: number | string; className?: string }) {
  const { get, ready } = useSparkApi();
  const [data, setData] = useState<AttributionData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !leadId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ data: AttributionData }>(`/api/v1/attribution/lead/${encodeURIComponent(String(leadId))}`);
        if (!cancelled) { setData(r?.data ?? null); setFailed(false); }
      } catch {
        // Attribution is context, not the lead itself: a failure hides the
        // card rather than breaking the page around it.
        if (!cancelled) { setData(null); setFailed(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready, leadId]);

  const Icon = useMemo(() => {
    const key = data?.first_touch?.channel || data?.channel || "direct";
    return CHANNEL_ICON[key] || Globe;
  }, [data]);

  if (failed || !data) return null;

  const headline = data.channel_label
    ? `${data.source_label} · via ${data.channel_label}`
    : data.source_label;

  return (
    <div className={`rounded-xl bg-white border border-slate-200 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <div className="text-sm font-semibold text-slate-900">Where this lead came from</div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="text-base font-semibold text-slate-900">{headline}</div>

        {!data.has_journey ? (
          <p className="text-[12px] text-slate-500">
            {data.source === "leadgen"
              ? "This business came from a B2B lead search, so there is no website journey to show — nobody browsed your site before they landed here."
              : "No website visits are linked to this lead yet. They appear once the visitor tracking pixel has seen this person on your site."}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
              {data.first_touch && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">First touch</dt>
                  <dd className="text-slate-800">
                    {data.first_touch.channel_label}
                    {when(data.first_touch.occurred_at) && <span className="text-slate-400"> · {when(data.first_touch.occurred_at)}</span>}
                  </dd>
                </div>
              )}
              {data.last_touch && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last touch</dt>
                  <dd className="text-slate-800">
                    {data.last_touch.channel_label}
                    {when(data.last_touch.occurred_at) && <span className="text-slate-400"> · {when(data.last_touch.occurred_at)}</span>}
                  </dd>
                </div>
              )}
              {data.campaign?.campaign && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Campaign or post</dt>
                  <dd className="text-slate-800 break-words">
                    {data.campaign.campaign}
                    {data.campaign.content && <span className="text-slate-400"> · {data.campaign.content}</span>}
                  </dd>
                </div>
              )}
              {data.landing_page && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Landing page</dt>
                  <dd className="text-slate-800 break-all">
                    <a href={data.landing_page} target="_blank" rel="noreferrer noopener" className="hover:text-[#EF6C33]">
                      {shortPath(data.landing_page)}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {data.path.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                  Path
                  <span className="font-normal normal-case tracking-normal text-slate-400 inline-flex items-center gap-1">
                    · {data.page_count} page{data.page_count === 1 ? "" : "s"}
                    {data.duration_minutes != null && (
                      <>
                        <Clock className="h-3 w-3" />
                        {data.duration_minutes} min
                      </>
                    )}
                  </span>
                </div>
                <ol className="flex flex-wrap items-center gap-1">
                  {data.path.map((p, i) => (
                    <li key={`${p.url}-${i}`} className="flex items-center gap-1">
                      <span
                        title={p.title || p.url}
                        className="text-[11px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 max-w-[220px] truncate"
                      >
                        {shortPath(p.url)}
                      </span>
                      {i < data.path.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                    </li>
                  ))}
                  <li className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-slate-300" />
                    <span className="text-[11px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 font-medium">submitted</span>
                  </li>
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default LeadAttributionCard;
