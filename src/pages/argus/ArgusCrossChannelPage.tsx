// ArgusCrossChannelPage — refactored 2026-06-21 per Brandon's locked
// Insights hierarchy:
//   Platform-specific data → per-platform Trend + Intelligence scores →
//   Platform Pulse = (Trend + Intel)/2 → Business Pulse = avg(active Pulses).
//
// Cross-Channel Intelligence is ARGUS's domain — the ONLY place we are
// permitted to use multi-platform data. It outputs 6 reports:
//   3 relocated from ARION Intelligence:
//     1. Acquisition Flow Score        (was Lead Source Quality)
//     2. Content-to-Revenue Attribution (was Content ROI)
//     3. Reputation Revenue Index       (was Reputation→Revenue)
//   3 new:
//     4. Channel Attribution Mix
//     5. Cross-Product Customer LTV
//     6. Platform Health Trajectory
//
// Source endpoint: platform-api
//   GET /argus/cross-channel-intelligence/:tenantId/reports
//     returns { data: { reports: IntelligenceReport[], tier, generated_at } }
//
// Tier gating:
//   - free + standard: 3 relocated reports unlocked; 3 new locked
//   - pro / data_plan: all 6 unlocked
//
// Empty state when data not yet collected ("Activate a second product to
// enable this report"). Lock state for cards above the tenant's ARGUS tier.

import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import {
  Lock, TrendingUp, Users, DollarSign, BarChart3, Activity, MessageSquare, ArrowRight, X,
} from "lucide-react";

// ── Shared types matching the platform-api payload shape ──────────────
interface IntelligenceComponent {
  key: string;
  value: number;
  weight: number;
  note?: string;
}

interface IntelligenceReport {
  reportKey: string;
  score: number | null;
  tier: "A" | "B" | "C" | "D" | null;
  state: "ok" | "partial" | "insufficient_data" | "locked";
  locked?: boolean;
  requiredTier?: string;
  components: IntelligenceComponent[];
  narrative: string;
  observations: string[];
  actions: string[];
  dataGap?: string;
  dataChain?: string;
  last_calculated_at: string;
}

interface BundleResponse {
  reports: IntelligenceReport[];
  tier: string;
  cache_states: Record<string, string>;
  ttl_seconds: number;
  generated_at: string;
}

// ── Canonical 6-report metadata (Brandon's spec, 2026-06-21) ──────────
const REPORT_METADATA: Record<string, {
  num: number;
  label: string;
  question: string;
  icon: typeof Users;
  group: "ARION → SPARK → OLIVER" | "ARION → OLIVER" | "Full-stack";
  category: "relocated" | "new";
  minTier: "free" | "standard" | "pro" | "data_plan";
  dataChain: string;
}> = {
  acquisition_flow_score: {
    num: 1,
    label: "Acquisition Flow Score",
    question: "Across the full website → lead → paying customer funnel, how cleanly is the business acquiring revenue?",
    icon: Users,
    group: "ARION → SPARK → OLIVER",
    category: "relocated",
    minTier: "free",
    dataChain: "arion.gsc_data + arion.site_form_submission → lumen.contact → oliver.job + invoice",
  },
  content_to_revenue: {
    num: 2,
    label: "Content-to-Revenue Attribution",
    question: "Which content channels (organic search, GBP, email) are actually producing revenue?",
    icon: Activity,
    group: "ARION → SPARK → OLIVER",
    category: "relocated",
    minTier: "free",
    dataChain: "arion.gsc_data + arion.gbp_insights → lumen.email_event + campaign → oliver.invoice (by source)",
  },
  reputation_revenue_index: {
    num: 3,
    label: "Reputation Revenue Index",
    question: "Does online reputation (rating + review velocity) correlate with repeat-customer revenue?",
    icon: MessageSquare,
    group: "ARION → OLIVER",
    category: "relocated",
    minTier: "free",
    dataChain: "arion.gbp_review + arion.gbp_profile → oliver.job (repeat rate) → oliver.invoice",
  },
  channel_attribution_mix: {
    num: 4,
    label: "Channel Attribution Mix",
    question: "Which channels (organic, paid, direct, referral, email) drive what % of revenue — and how concentrated are we?",
    icon: BarChart3,
    group: "Full-stack",
    category: "new",
    minTier: "pro",
    dataChain: "arion.gsc_data + arion.site_form_submission (utm) + lumen.email_event → oliver.invoice channel %",
  },
  cross_product_ltv: {
    num: 5,
    label: "Cross-Product Customer LTV",
    question: "What is each customer worth across our products? Are we one-customer-loss away from a bad month?",
    icon: DollarSign,
    group: "Full-stack",
    category: "new",
    minTier: "pro",
    dataChain: "oliver.job + invoice (revenue per contact) + arion.site_form_submission + lumen.email_event (engagement multiplier)",
  },
  platform_health_trajectory: {
    num: 6,
    label: "Platform Health Trajectory",
    question: "Across all 6 Platform Pulses, which scores are heading the wrong way? Where is the early-warning signal?",
    icon: TrendingUp,
    group: "Full-stack",
    category: "new",
    minTier: "pro",
    dataChain: "arion/lumen/oliver.ia_insights_score_history + argus.business_pulse_cache (each as Platform Pulse trajectory)",
  },
};

const REPORT_ORDER = [
  "acquisition_flow_score",
  "content_to_revenue",
  "reputation_revenue_index",
  "channel_attribution_mix",
  "cross_product_ltv",
  "platform_health_trajectory",
];

const GROUP_ORDER: Array<{ label: string; description: string }> = [
  { label: "ARION → SPARK → OLIVER", description: "Funnel integrity: traffic → contact → revenue" },
  { label: "ARION → OLIVER", description: "Reputation → revenue connection" },
  { label: "Full-stack", description: "Cross-product attribution + customer economics + early-warning" },
];

// ── Visual helpers ───────────────────────────────────────────────────
function stateColor(state: IntelligenceReport["state"]) {
  return state === "ok" ? "#16A34A"
    : state === "partial" ? "#EAB308"
    : state === "locked" ? "#94A3B8"
    : "#94A3B8";
}
function stateLabel(state: IntelligenceReport["state"]) {
  return state === "ok" ? "Live"
    : state === "partial" ? "Partial"
    : state === "locked" ? "Locked"
    : "Awaiting data";
}
function stateBg(state: IntelligenceReport["state"]) {
  return state === "ok" ? "border-emerald-200 bg-white"
    : state === "partial" ? "border-amber-200 bg-amber-50/30"
    : state === "locked" ? "border-slate-200 bg-slate-100"
    : "border-slate-200 bg-slate-50";
}

// ── Main page ────────────────────────────────────────────────────────
export function ArgusCrossChannelPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [bundle, setBundle] = useState<BundleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!base) {
          setError("VITE_PLATFORM_API_BASE_URL is not configured.");
          setLoading(false);
          return;
        }
        const url = `${base}/argus/cross-channel-intelligence/${encodeURIComponent(activeTenantId)}/reports`;
        const headers: HeadersInit = {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
        };
        const r = await globalThis.fetch(url, { headers });
        if (!r.ok) {
          setError(`Failed to load cross-channel reports (HTTP ${r.status}).`);
          setLoading(false);
          return;
        }
        const json = await r.json();
        if (cancelled) return;
        setBundle(json?.data || null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  // Map report key → IntelligenceReport for fast lookup.
  const reportsByKey = useMemo(() => {
    const m: Record<string, IntelligenceReport> = {};
    for (const r of bundle?.reports ?? []) m[r.reportKey] = r;
    return m;
  }, [bundle]);

  const tier = bundle?.tier || "free";

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Cross-Channel Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          6 reports combining ARION, SPARK, and OLIVER data. Per-platform Intelligence reports are single-source — these are the only ones permitted to use multi-platform signals.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] uppercase font-bold text-slate-500">ARGUS Tier</div>
          <div className="text-sm font-bold text-slate-900">{tier.toUpperCase()}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] uppercase font-bold text-slate-500">Reports unlocked</div>
          <div className="text-sm font-bold text-slate-900">
            {REPORT_ORDER.filter((k) => reportsByKey[k]?.state !== "locked").length} / 6
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] uppercase font-bold text-slate-500">Refresh cadence</div>
          <div className="text-sm font-bold text-slate-900">12h cache · daily sweep</div>
        </div>
      </div>

      {loading && (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Loading cross-channel intelligence…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>Could not load:</strong> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {GROUP_ORDER.map((group) => {
            const keys = REPORT_ORDER.filter((k) => REPORT_METADATA[k].group === group.label);
            if (keys.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-base font-bold text-slate-900">{group.label}</h2>
                  <span className="text-xs text-slate-500">{group.description}</span>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 ml-auto">
                    {keys.length} report{keys.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {keys.map((key) => {
                    const meta = REPORT_METADATA[key];
                    const report = reportsByKey[key];
                    if (!report) {
                      // Loading state — endpoint did not return this key.
                      return (
                        <div key={key} className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
                          <div className="text-[10px] font-bold text-slate-400">#{meta.num}</div>
                          <div className="font-semibold text-sm text-slate-900">{meta.label}</div>
                          <div className="text-xs text-slate-500 mt-1">Activate a second product to enable this report.</div>
                        </div>
                      );
                    }
                    return (
                      <ReportCard key={key} meta={meta} report={report} onOpen={() => setOpen(key)} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && reportsByKey[open] && (() => {
        const meta = REPORT_METADATA[open];
        const report = reportsByKey[open];
        return <CCModal meta={meta} report={report} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

// ── Single Report Card ────────────────────────────────────────────────
function ReportCard({ meta, report, onOpen }: {
  meta: typeof REPORT_METADATA[keyof typeof REPORT_METADATA];
  report: IntelligenceReport;
  onOpen: () => void;
}) {
  const color = stateColor(report.state);
  const bg = stateBg(report.state);
  const Icon = meta.icon;
  const isLocked = report.state === "locked";
  const isInsuf = report.state === "insufficient_data";

  return (
    <button
      onClick={onOpen}
      className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400">#{meta.num}</span>
            <span className="font-semibold text-sm text-slate-900">{meta.label}</span>
            {meta.category === "new" && (
              <span className="text-[9px] font-bold uppercase px-1 py-0.5 bg-blue-100 text-blue-700 rounded">NEW</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{meta.question}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex items-center gap-2">
          {report.state === "ok" || report.state === "partial" ? (
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</span>
          ) : (
            <span className="text-xl font-bold text-slate-300">—</span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
            {report.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            {report.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            {isLocked && <Lock className="h-3 w-3" />}
            {stateLabel(report.state)}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400" />
      </div>

      {/* Components bars */}
      {report.components && report.components.length > 0 && (
        <div className="space-y-1 mb-2">
          {report.components.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: color }} />
              </div>
              <span className="text-[9px] text-slate-500 w-20 truncate">{c.note || c.key}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-700 leading-snug line-clamp-2">{report.narrative}</p>
      {report.dataGap && (
        <div className="mt-2 text-[10px] text-amber-800 italic">→ {report.dataGap}</div>
      )}
      {isLocked && report.requiredTier && (
        <div className="mt-2 text-[10px] text-slate-500 italic">
          Upgrade to ARGUS {report.requiredTier.toUpperCase()}+ to unlock this report.
        </div>
      )}
      {isInsuf && !report.dataGap && (
        <div className="mt-2 text-[10px] text-slate-500 italic">
          Activate a second product to enable this report.
        </div>
      )}
    </button>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────
function CCModal({ meta, report, onClose }: {
  meta: typeof REPORT_METADATA[keyof typeof REPORT_METADATA];
  report: IntelligenceReport;
  onClose: () => void;
}) {
  const Icon = meta.icon;
  const color = stateColor(report.state);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">#{meta.num} {meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.question}</p>
              <p className="text-[10px] text-slate-400 mt-1 italic">Data chain: {report.dataChain || meta.dataChain}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {(report.state === "ok" || report.state === "partial") ? (
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>
              ) : (
                <div className="text-xl text-slate-300">—</div>
              )}
              <div className="text-[9px] uppercase text-slate-400">{stateLabel(report.state)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {report.dataGap && (
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div>
              <p className="text-sm text-slate-800">{report.dataGap}</p>
            </div>
          )}
          {report.components && report.components.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wide mb-2">Score breakdown</div>
              <div className="space-y-2">
                {report.components.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 capitalize">{c.key.replace(/_/g, " ")}</span>
                        {c.note && <span className="text-slate-500">· {c.note}</span>}
                      </div>
                      <div className="text-slate-700 font-mono">
                        {c.value} <span className="text-slate-400">× {(c.weight * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.observations.length > 0 && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "#84CC1620", color: "#A3E635" }}>ARGUS</span>
                <span className="text-sm">Cross-Channel · {meta.label}</span>
              </div>
              <ol className="space-y-3">
                {report.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#EA580C", color: "white" }}>{i + 1}</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
              {report.actions.length > 0 && (
                <div className="border-t border-slate-700 mt-4 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>Recommended actions</div>
                  <ul className="space-y-2">
                    {report.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                        <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full" style={{ background: "#EA580C" }} />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span> · category: <span className="font-semibold">{meta.category}</span> · min tier: <span className="font-semibold uppercase">{meta.minTier}</span>
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArgusCrossChannelPage;
