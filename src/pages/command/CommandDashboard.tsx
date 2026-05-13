import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";

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

export function CommandDashboard() {
  const { enabledServices } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [oliverToday, setOliverToday] = useState<OliverDashboardToday | null>(null);
  const [oliverStats, setOliverStats] = useState<OliverDashboardStats | null>(null);
  const [sparkNps, setSparkNps] = useState<SparkNpsSummary | null>(null);
  const [sparkGrowth, setSparkGrowth] = useState<SparkGrowth | null>(null);

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
