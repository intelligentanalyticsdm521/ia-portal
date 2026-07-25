import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";
import { Sparkline } from "../../components/iainsights/Sparkline";
import { demoBusinessPulse } from "../../analytics/healthSummary";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";
import { GetStartedCard } from "../../components/command/GetStartedCard";
import { UnifiedSetupCard } from "../../components/command/UnifiedSetupCard";
// Onboarding V3 Phase 3 — personalized "do your first X" task list. NEW
// surface; co-exists with UnifiedSetupCard (F-87/F-124) and GetStartedCard
// (v7.0) per Brandon's "don't break existing banners" rule.
import { WalkthroughPanel } from "../../components/walkthroughs/WalkthroughPanel";

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
  active_subscribed?: string[];
  active_with_data?: string[];
  // v7 — 6 components (was 3). STELLA/FORGE may stay null but the type
  // must surface them so the platform-api payload doesn't get truncated
  // at the TypeScript boundary.
  components: {
    arion: number | null;
    spark: number | null;
    oliver: number | null;
    argus: number | null;
    stella: number | null;
    forge: number | null;
  };
}

interface PulseBanner {
  severity: "info" | "warn" | "error";
  message: string;
}

export function CommandDashboard() {
  const { enabledServices, activeTenantId } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [oliverToday, setOliverToday] = useState<OliverDashboardToday | null>(null);
  const [oliverStats, setOliverStats] = useState<OliverDashboardStats | null>(null);
  const [sparkNps, setSparkNps] = useState<SparkNpsSummary | null>(null);
  const [sparkGrowth, setSparkGrowth] = useState<SparkGrowth | null>(null);

  // v13.0 (2026-07-25) — scores come from the SAME client-side roll-up the
  // Health pages compute (healthSummary.demoBusinessPulse), so the home strip
  // can never disagree with the Health/Trends pages it links to. Reverts to
  // the platform-api /argus/business-pulse endpoint once the monthly snapshot
  // jobs land. Sparkline history returns with the snapshot jobs too.
  const arionPayload = useArionInsightsPayload();
  const pulse = useMemo<PulseData | null>(() => {
    if (!activeTenantId) return null;
    const bp = demoBusinessPulse(activeTenantId, { arionPayload });
    return {
      pulse: bp.pulse,
      previous_pulse: bp.prior,
      components: {
        arion: bp.components.arion, spark: bp.components.spark, oliver: bp.components.oliver,
        argus: bp.argus.score, stella: null, forge: null,
      },
    };
  }, [activeTenantId, arionPayload]);

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

  return (
    <div className="space-y-4">
      {/* Onboarding — ONE unified card opens the unified ClientTenantModal.
          Replaces the three legacy per-product setup cards. */}
      <UnifiedSetupCard />

      {/* v7.0 — Get Started checklist (moved here from per-product Trends pages). */}
      <GetStartedCard />

      {/* Onboarding V3 Phase 3 — personalized "do your first X" task list. */}
      <WalkthroughPanel variant="dashboard" />

      {/* v6.10 — IA Insights cross-product strip */}
      <IAInsightsStrip pulse={pulse} banners={[]} arionHist={[]} sparkHist={[]} oliverHist={[]} />

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
            <Card label="MTD revenue" value={oliverStats ? `$${Number(oliverStats.revenue).toLocaleString()}` : "—"} accent="emerald" href="/app/services/oliver_billing_overview" />
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
  banners,
  arionHist,
  sparkHist,
  oliverHist,
}: {
  pulse: PulseData | null;
  banners: PulseBanner[];
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
          <Link to="/app/services/argus_cross_platform" className="text-xs text-[#EF6C33] hover:underline flex items-center gap-0.5">
            ARGUS Intelligence <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          {/* v13.0 — these are the PLATFORM scores (50/50 Trend + Intelligence),
              the same numbers the Health pages show. */}
          <ProductScoreCard
            label="ARION Score"
            score={pulse?.components.arion ?? null}
            history={arionHist}
            bandColor={bandColor(pulse?.components.arion ?? null)}
            href="/app/services/arion_ia_insights_health"
          />
          <ProductScoreCard
            label="SPARK Score"
            score={pulse?.components.spark ?? null}
            history={sparkHist}
            bandColor={bandColor(pulse?.components.spark ?? null)}
            href="/app/services/spark_ia_insights_health"
          />
          <ProductScoreCard
            label="OLIVER Score"
            score={pulse?.components.oliver ?? null}
            history={oliverHist}
            bandColor={bandColor(pulse?.components.oliver ?? null)}
            href="/app/services/oliver_ia_insights_health"
          />
          {/* v7 — ARGUS card. STELLA/FORGE intentionally hidden when null
              to avoid clutter; render when scoring lands. */}
          <ProductScoreCard
            label="ARGUS Score"
            score={pulse?.components.argus ?? null}
            history={[]}
            bandColor={bandColor(pulse?.components.argus ?? null)}
            href="/app/services/argus_health"
          />
        </div>
        {/* v7 — surface the API banners[] so users see WHY a component is
            still dashes (e.g. "ARION is active but has not emitted a
            Platform Pulse yet"). Falls back to empty when caches are warm. */}
        {banners.length > 0 && (
          <div className="mt-3 space-y-1">
            {banners.map((b, i) => (
              <div key={i} className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                {b.message}
              </div>
            ))}
          </div>
        )}
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
        {score != null ? "This month · matches the Health page" : "Connect product to populate"}
      </div>
    </Link>
  );
}
