import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { Sparkline } from "../../components/iainsights/Sparkline";
import { GetStartedCard } from "../../components/command/GetStartedCard";
import { OliverSetupCard } from "../../components/command/OliverSetupCard";

// Each card pulls one piece of data; failures degrade gracefully (card shows "—").
interface OliverDashboardToday {
  jobs_today: number;
  jobs_done_today: number;
  revenue_today: number;
  open_requests: number;
  overdue_invoices: number;
  overdue_amount: number;
  disputes_open: number;
  revenue_this_week: number;
  revenue_last_week: number;
}
interface OliverDashboardStats {
  activeJobs: number;
  revenue: number;        // month-to-date
  openInvoices: number;
  workers: number;
}
interface SparkNpsSummary { nps: number; total: number; }
interface SparkGrowth { growth_velocity_score: number; new_contacts: number; deals_won: number; }

interface PulseData {
  pulse: number | null;
  previous_pulse: number | null;
  components: { arion: number | null; spark: number | null; oliver: number | null };
}

export function CommandDashboard() {
  const { enabledServices, activeTenantId } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();
  const { getToken } = useAccessToken();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [oliverToday, setOliverToday] = useState<OliverDashboardToday | null>(null);
  const [oliverStats, setOliverStats] = useState<OliverDashboardStats | null>(null);
  const [sparkNps, setSparkNps] = useState<SparkNpsSummary | null>(null);
  const [sparkGrowth, setSparkGrowth] = useState<SparkGrowth | null>(null);
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [arionHist, setArionHist] = useState<Array<{ period_end: string; score: number }>>([]);
  const [sparkHist, setSparkHist] = useState<Array<{ period_end: string; score: number }>>([]);
  const [oliverHist, setOliverHist] = useState<Array<{ period_end: string; score: number }>>([]);

  const load = useCallback(async () => {
    if (hasOliver && oliver.ready) {
      try { setOliverToday((await oliver.get<{ data: OliverDashboardToday }>("/dashboard/today"))?.data); } catch { /* skip */ }
      try { setOliverStats((await oliver.get<{ data: OliverDashboardStats }>("/dashboard/stats"))?.data); } catch { /* skip */ }
    }
    if (hasSpark && spark.ready) {
      try {
        const r = await spark.get<{ data: { nps: number; total: number } }>("/api/v1/nps/summary?days=30");
        setSparkNps(r.data);
      } catch { /* skip */ }
      try {
        const r = await spark.get<{ data: SparkGrowth }>("/api/v1/insights/growth-velocity?days=30");
        setSparkGrowth(r.data);
      } catch { /* skip */ }
    }
  }, [oliver, spark, hasOliver, hasSpark]);

  useEffect(() => { load(); }, [load]);

  // v6.10 — IA Insights composite scores across products + per-product
  // 12-period history for the sparkline cards. Business Pulse from
  // platform-api, per-product history from LUMEN-API.
  useEffect(() => {
    if (!activeTenantId || !spark.ready) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const platformBase = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string).replace(/\/$/, "");
        const headers: HeadersInit = {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
        };
        const pulseRes = await globalThis.fetch(`${platformBase}/argus/business-pulse`, { headers });
        if (pulseRes.ok && !cancelled) {
          const body = await pulseRes.json();
          setPulse(body?.data || null);
        }
        // Per-product histories — SPARK + OLIVER live in LUMEN-API; ARION
        // lives in arion-api. All three accept the same shape.
        const [sH, oH] = await Promise.all([
          spark.get<{ data: Array<{ period_end: string; score: number }> }>("/api/v1/ia-insights/score-history?product=spark&reportKey=presence&limit=12").catch(() => null),
          spark.get<{ data: Array<{ period_end: string; score: number }> }>("/api/v1/ia-insights/score-history?product=oliver&reportKey=presence&limit=12").catch(() => null),
        ]);
        if (!cancelled) {
          setSparkHist((sH?.data || []).filter((r) => r && r.period_end));
          setOliverHist((oH?.data || []).filter((r) => r && r.period_end));
        }
        // ARION history requires a siteId we don't have at the platform level;
        // skip for now — the score card still shows the composite value from
        // pulse.components.arion.
        setArionHist([]);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, spark, getToken]);

  return (
    <div className="space-y-4">
      {/* OLIVER account/billing setup nudge — opens the guided wizard. */}
      <OliverSetupCard />

      {/* v7.0 — Get Started checklist (moved here from per-product Trends pages). */}
      <GetStartedCard />

      {/* v6.10 — IA Insights cross-product strip */}
      <IAInsightsStrip
        pulse={pulse}
        arionHist={arionHist}
        sparkHist={sparkHist}
        oliverHist={oliverHist}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* OLIVER cards */}
        {hasOliver && (
          <>
            <Card label="Jobs today" value={oliverToday?.jobs_today ?? "—"} accent="blue" href="/app/services/oliver_job_board" />
            <Card label="Overdue invoices" value={oliverToday?.overdue_invoices ?? "—"} accent={oliverToday?.overdue_invoices ? "rose" : "gray"} href="/app/services/oliver_invoices" />
            <Card label="Open service requests" value={oliverToday?.open_requests ?? "—"} accent="amber" href="/app/services/oliver_service_requests" />
            <Card label="Disputes open" value={oliverToday?.disputes_open ?? "—"} accent={oliverToday?.disputes_open ? "rose" : "gray"} href="/app/services/oliver_disputes" />
            <Card label="Active jobs" value={oliverStats?.activeJobs ?? "—"} href="/app/services/oliver_job_board" />
            <Card label="Revenue today" value={oliverToday ? `$${Number(oliverToday.revenue_today).toLocaleString()}` : "—"} accent="emerald" href="/app/services/oliver_billing_overview" />
            <Card label="MTD revenue" value={oliverStats ? `$${Number(oliverStats.revenue).toLocaleString()}` : "—"} accent="emerald" href="/app/services/oliver_reports" />
            <Card label="Workers active" value={oliverStats?.workers ?? "—"} accent="blue" href="/app/services/oliver_workers" />
          </>
        )}
        {/* SPARK cards */}
        {hasSpark && (
          <>
            <Card label="Velocity score" value={sparkGrowth?.growth_velocity_score ?? "—"} accent="emerald" href="/app/services/spark_insights" />
            <Card label="New contacts (30d)" value={sparkGrowth?.new_contacts ?? "—"} accent="blue" href="/app/services/spark_contacts" />
            <Card label="Deals won (30d)" value={sparkGrowth?.deals_won ?? "—"} accent="emerald" href="/app/services/spark_deals" />
            <Card label="NPS (30d)" value={sparkNps?.nps != null ? sparkNps.nps : "—"} accent={sparkNps && sparkNps.nps >= 50 ? "emerald" : sparkNps && sparkNps.nps < 0 ? "rose" : "amber"} href="/app/services/spark_nps" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="iadm-card">
          <div className="iadm-card-body">
            <h3 className="text-base font-semibold">Quick actions</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {hasOliver && <Link to="/app/services/oliver_job_board" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ New job</Link>}
              {hasOliver && <Link to="/app/services/oliver_proposals" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ New proposal</Link>}
              {hasSpark && <Link to="/app/services/spark_campaigns" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ New campaign</Link>}
              {hasSpark && <Link to="/app/services/spark_deals" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ New deal</Link>}
              {hasSpark && <Link to="/app/services/spark_newsletter" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ Newsletter issue</Link>}
              {hasSpark && <Link to="/app/services/spark_ai_writer" className="px-3 py-2 border rounded-md hover:bg-gray-50">AI Writer</Link>}
            </div>
          </div>
        </div>

        <div className="iadm-card">
          <div className="iadm-card-body">
            <h3 className="text-base font-semibold">Today's focus</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {oliverToday?.overdue_invoices ? <li>💰 {oliverToday.overdue_invoices} overdue invoices (${Number(oliverToday.overdue_amount).toLocaleString()}) — send reminders.</li> : null}
              {oliverToday?.open_requests ? <li>📋 {oliverToday.open_requests} new service requests waiting — respond before they go cold.</li> : null}
              {oliverToday?.disputes_open ? <li>⚠ {oliverToday.disputes_open} Stripe disputes need response.</li> : null}
              {sparkGrowth?.new_contacts === 0 ? <li>👥 No new contacts in 30 days — capture forms may need attention.</li> : null}
              {sparkNps && sparkNps.nps < 0 ? <li>🔴 NPS is negative — talk to a detractor today.</li> : null}
              {!oliverToday && !sparkGrowth && <li className="text-gray-500">Loading focus items…</li>}
              {oliverToday && !oliverToday.overdue_invoices && !oliverToday.open_requests && !oliverToday.disputes_open && sparkGrowth && sparkGrowth.new_contacts > 0 && (!sparkNps || sparkNps.nps >= 0) && <li className="text-emerald-700">✅ No critical signals — keep going.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, accent = "gray", href }: { label: string; value: string | number; accent?: "gray" | "emerald" | "amber" | "rose" | "blue"; href: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
    gray: "text-gray-900",
  };
  return (
    <Link to={href} className="iadm-card hover:bg-gray-50 transition-colors">
      <div className="iadm-card-body p-3">
        <div className="text-xs uppercase text-gray-500">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${colors[accent]}`}>{value}</div>
      </div>
    </Link>
  );
}

// ─ v6.10 — Cross-product IA Insights strip ────────────────────────────────
function IAInsightsStrip({
  pulse,
  arionHist,
  sparkHist,
  oliverHist,
}: {
  pulse: { pulse: number | null; previous_pulse: number | null; components: { arion: number | null; spark: number | null; oliver: number | null } } | null;
  arionHist: Array<{ period_end: string; score: number }>;
  sparkHist: Array<{ period_end: string; score: number }>;
  oliverHist: Array<{ period_end: string; score: number }>;
}) {
  function bandColor(s: number | null) {
    if (s == null) return "#94A3B8";
    if (s >= 70) return "#16A34A";
    if (s >= 50) return "#EAB308";
    return "#DC2626";
  }
  function delta(curr: number | null, prev: number | null): number | null {
    if (curr == null || prev == null) return null;
    return curr - prev;
  }
  const pulseScore = pulse?.pulse ?? null;
  const pulseDelta = delta(pulseScore, pulse?.previous_pulse ?? null);
  return (
    <div className="iadm-card">
      <div className="iadm-card-body p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#EF6C33]" />
            <span className="font-semibold text-slate-900 text-sm">IA Insights — Business Health</span>
          </div>
          <Link to="/app/services/argus_cross_channel" className="text-xs text-[#EF6C33] hover:underline flex items-center gap-0.5">
            ARGUS Cross-Channel <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/app/services/argus_health" className="rounded-lg border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-3 hover:border-emerald-300">
            <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">Business Pulse</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tabular-nums" style={{ color: bandColor(pulseScore) }}>
                {pulseScore ?? "—"}
              </div>
              {pulseDelta != null && (
                <div className={`text-[10px] ${pulseDelta > 0 ? "text-emerald-600" : pulseDelta < 0 ? "text-red-600" : "text-slate-400"}`}>
                  {pulseDelta > 0 ? `+${pulseDelta}` : pulseDelta} vs prior
                </div>
              )}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5">ARGUS composite across active products</div>
          </Link>
          <ProductScoreCard
            label="ARION Trend"
            score={pulse?.components.arion ?? null}
            history={arionHist}
            bandColor={bandColor(pulse?.components.arion ?? null)}
            href="/app/services/arion_ia_insights_trends"
          />
          <ProductScoreCard
            label="SPARK Trend"
            score={pulse?.components.spark ?? null}
            history={sparkHist}
            bandColor={bandColor(pulse?.components.spark ?? null)}
            href="/app/services/spark_ia_insights_trends"
          />
          <ProductScoreCard
            label="OLIVER Trend"
            score={pulse?.components.oliver ?? null}
            history={oliverHist}
            bandColor={bandColor(pulse?.components.oliver ?? null)}
            href="/app/services/oliver_ia_insights_trends"
          />
        </div>
      </div>
    </div>
  );
}

function ProductScoreCard({
  label, score, history, bandColor, href,
}: {
  label: string; score: number | null;
  history: Array<{ period_end: string; score: number }>;
  bandColor: string; href: string;
}) {
  return (
    <Link to={href} className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50">
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-2xl font-bold tabular-nums" style={{ color: bandColor }}>
          {score ?? "—"}
        </div>
        {history.length > 1 && (
          <Sparkline data={history} color={bandColor} width={80} height={24} showBands={false} />
        )}
      </div>
      <div className="text-[9px] text-slate-400 mt-0.5">
        {score != null ? "Last computed period" : "Connect product to populate"}
      </div>
    </Link>
  );
}
