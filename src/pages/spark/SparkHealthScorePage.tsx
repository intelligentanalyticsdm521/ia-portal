// SparkHealthScorePage — Tenant-wide customer health score distribution + per-contact lookup.
//
// Renders two views:
//   1. Distribution: tier counts across the most recently active contacts,
//      with average score, per-tier samples, and a stacked bar.
//   2. Per-contact lookup: type a contact ID, see full breakdown.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import {
  Award,
  Flame,
  Sun,
  Snowflake,
  AlertTriangle,
  Search,
  type LucideIcon,
} from "lucide-react";

type Tier = "champion" | "engaged" | "warm" | "cold" | "at_risk";

interface DistributionResponse {
  data: {
    total_scored: number;
    average: number;
    distribution: Record<Tier, number>;
    top_samples_by_tier: Record<Tier, Array<{ contact_id: number; score: number }>>;
    sampled_top: number;
  };
}

interface ContactScoreResponse {
  data: {
    contact_id: number;
    score: number;
    tier: Tier;
    breakdown: {
      engagement: { pts: number; opens: number; clicks: number; visits: number };
      recency: { pts: number; days_since_update: number };
      tenure: { pts: number; days_since_created: number };
      behavioral: { pts: number; lead_score: number };
      negative: { pts: number; unsubscribed: boolean; unsubs: number; bounces: number; complaints: number };
    };
  };
}

const TIER_META: Record<Tier, { label: string; color: string; icon: LucideIcon; range: string }> = {
  champion: { label: "Champion", color: "#16A34A", icon: Award, range: "70-100" },
  engaged: { label: "Engaged", color: "#65A30D", icon: Flame, range: "50-69" },
  warm: { label: "Warm", color: "#EAB308", icon: Sun, range: "30-49" },
  cold: { label: "Cold", color: "#94A3B8", icon: Snowflake, range: "10-29" },
  at_risk: { label: "At Risk", color: "#DC2626", icon: AlertTriangle, range: "0-9" },
};

const TIER_ORDER: Tier[] = ["champion", "engaged", "warm", "cold", "at_risk"];

export function SparkHealthScorePage() {
  const insightsPayload = useProductInsightsPayload('spark').payload;
  const { get, ready } = useSparkApi();
  const [dist, setDist] = useState<DistributionResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Per-contact lookup state
  const [lookupInput, setLookupInput] = useState("");
  const [lookup, setLookup] = useState<ContactScoreResponse["data"] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const fetchDist = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<DistributionResponse>("/api/v1/health-score/distribution?limit=300");
      setDist(r.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);
  useEffect(() => { fetchDist(); }, [fetchDist]);

  async function lookupContact() {
    const id = lookupInput.trim();
    if (!/^\d+$/.test(id)) { setLookupError("Enter a numeric contact ID."); return; }
    setLookupLoading(true);
    setLookupError(null);
    setLookup(null);
    try {
      const r = await get<ContactScoreResponse>(`/api/v1/health-score/${id}`);
      setLookup(r.data);
    } catch (err) {
      setLookupError((err as Error).message || "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  const stats = useMemo(() => {
    if (!dist) return null;
    const total = dist.total_scored || 1;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Average</div>
          <div className="mt-1 text-2xl font-bold" style={{ color: "#EF6C33" }}>{dist.average}</div>
          <div className="text-[10px] text-slate-400">across {dist.total_scored.toLocaleString()} contacts</div>
        </div>
        {TIER_ORDER.map((t) => {
          const n = dist.distribution[t] || 0;
          const pct = Math.round((n / total) * 100);
          const Icon = TIER_META[t].icon;
          return (
            <div key={t} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wide" style={{ color: TIER_META[t].color }}>
                <Icon className="h-3 w-3" />
                {TIER_META[t].label}
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{n.toLocaleString()}</div>
              <div className="text-[10px] text-slate-400">{pct}% · score {TIER_META[t].range}</div>
            </div>
          );
        })}
      </div>
    );
  }, [dist]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Contact ID</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="e.g. 1234"
          className="w-28 text-xs border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
          onKeyDown={(e) => { if (e.key === "Enter") lookupContact(); }}
        />
      </label>
      <button
        onClick={lookupContact}
        disabled={lookupLoading || !lookupInput}
        className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50"
      >
        <Search className="h-3.5 w-3.5" /> {lookupLoading ? "Looking up…" : "Look up"}
      </button>
      {lookup && (
        <button onClick={() => { setLookup(null); setLookupInput(""); setLookupError(null); }} className="text-xs text-slate-500 hover:text-slate-700 underline">
          Clear
        </button>
      )}
    </div>
  );

  return (
    <SparkPageShell
      title="Customer Health Score"
      subtitle={dist ? `${dist.total_scored.toLocaleString()} contacts scored` : ""}
      help="0-100 score combining engagement, recency, tenure, behavioral lead score, and negative signals. Champions ≥70 are your best customers. At-risk ≤9 need attention."
      stats={stats}
      filters={filters}
      loading={loading}
      error={error}
    >
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_contact_scoring', label: 'Engagement scores' },
        { id: 'spark_list_health', label: 'List health' },
      ]} />
      {lookupError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {lookupError}
        </div>
      )}

      {lookup ? (
        <ContactScoreCard score={lookup} />
      ) : dist ? (
        <DistributionStackedBar dist={dist} />
      ) : null}

      {dist && !lookup && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {TIER_ORDER.map((t) => {
            const samples = dist.top_samples_by_tier[t] || [];
            const Icon = TIER_META[t].icon;
            return (
              <div key={t} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-sm" style={{ color: TIER_META[t].color }}>
                    <Icon className="h-4 w-4" /> {TIER_META[t].label}
                  </div>
                  <span className="text-[10px] text-slate-400">{(dist.distribution[t] || 0).toLocaleString()} contacts</span>
                </div>
                {samples.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No samples in this tier.</div>
                ) : (
                  <ul className="space-y-1">
                    {samples.map((s) => (
                      <li key={s.contact_id} className="flex items-center justify-between text-xs">
                        <button
                          onClick={() => { setLookupInput(String(s.contact_id)); setTimeout(lookupContact, 0); }}
                          className="text-blue-600 hover:underline tabular-nums"
                        >
                          Contact #{s.contact_id}
                        </button>
                        <span className="font-mono tabular-nums text-slate-700">{s.score}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SparkPageShell>
  );
}

function DistributionStackedBar({ dist }: { dist: DistributionResponse["data"] }) {
  const total = TIER_ORDER.reduce((s, t) => s + (dist.distribution[t] || 0), 0) || 1;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tier distribution</div>
      <div className="flex h-8 w-full rounded overflow-hidden border border-slate-200">
        {TIER_ORDER.map((t) => {
          const n = dist.distribution[t] || 0;
          const pct = (n / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={t}
              className="flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${pct}%`, background: TIER_META[t].color }}
              title={`${TIER_META[t].label}: ${n.toLocaleString()} (${pct.toFixed(1)}%)`}
            >
              {pct >= 8 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-600">
        {TIER_ORDER.map((t) => (
          <div key={t} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full inline-block" style={{ background: TIER_META[t].color }} />
            {TIER_META[t].label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactScoreCard({ score }: { score: ContactScoreResponse["data"] }) {
  const Icon = TIER_META[score.tier].icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs uppercase font-semibold tracking-wide text-slate-500">Contact #{score.contact_id}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums" style={{ color: TIER_META[score.tier].color }}>
              {score.score}
            </span>
            <span className="text-sm text-slate-400">/ 100</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: TIER_META[score.tier].color }}>
          <Icon className="h-3.5 w-3.5" /> {TIER_META[score.tier].label}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <BreakdownRow label="Engagement (max 40)" pts={score.breakdown.engagement.pts} detail={`${score.breakdown.engagement.opens} opens · ${score.breakdown.engagement.clicks} clicks · ${score.breakdown.engagement.visits} visits (90d)`} />
        <BreakdownRow label="Recency (max 20)" pts={score.breakdown.recency.pts} detail={`Updated ${score.breakdown.recency.days_since_update} day${score.breakdown.recency.days_since_update === 1 ? "" : "s"} ago`} />
        <BreakdownRow label="Tenure (max 15)" pts={score.breakdown.tenure.pts} detail={`${score.breakdown.tenure.days_since_created} day${score.breakdown.tenure.days_since_created === 1 ? "" : "s"} since first contact`} />
        <BreakdownRow label="Behavioral score (max 15)" pts={score.breakdown.behavioral.pts} detail={`Lead score ${score.breakdown.behavioral.lead_score}`} />
        <BreakdownRow label="Negative signals" pts={score.breakdown.negative.pts} detail={`${score.breakdown.negative.unsubs} unsub · ${score.breakdown.negative.bounces} bounce · ${score.breakdown.negative.complaints} complaint${score.breakdown.negative.unsubscribed ? " · sms_opt_out" : ""}`} negative />
      </div>
    </div>
  );
}

function BreakdownRow({ label, pts, detail, negative }: { label: string; pts: number; detail: string; negative?: boolean }) {
  const color = negative ? "#DC2626" : "#0F766E";
  return (
    <div className="rounded border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="font-mono text-sm tabular-nums" style={{ color }}>
          {pts > 0 ? `+${pts}` : pts}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>
    </div>
  );
}

export default SparkHealthScorePage;
