import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";

// Each card pulls one piece of data; failures degrade gracefully (card shows "—").
interface OliverJobBoard { kpis: { jobs_today: number; jobs_overdue: number; revenue_today: number }; }
interface OliverDashboard { kpis: { jobs_open: number; quotes_pending: number; invoices_due: number; cash_in_30d: number; }; }
interface SparkNpsSummary { nps: number; total: number; }
interface SparkGrowth { growth_velocity_score: number; new_contacts: number; deals_won: number; }

export function CommandDashboard() {
  const { enabledServices } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [oliverDash, setOliverDash] = useState<OliverDashboard | null>(null);
  const [oliverBoard, setOliverBoard] = useState<OliverJobBoard | null>(null);
  const [sparkNps, setSparkNps] = useState<SparkNpsSummary | null>(null);
  const [sparkGrowth, setSparkGrowth] = useState<SparkGrowth | null>(null);

  const load = useCallback(async () => {
    if (hasOliver && oliver.ready) {
      try { setOliverDash((await oliver.get<{ data: OliverDashboard }>("/dashboard"))?.data); } catch { /* skip */ }
      try { setOliverBoard((await oliver.get<{ data: OliverJobBoard }>("/job-board?days=1"))?.data); } catch { /* skip */ }
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
            <Card label="Jobs today" value={oliverBoard?.kpis?.jobs_today ?? "—"} accent="blue" href="/app/services/oliver_jobs" />
            <Card label="Overdue jobs" value={oliverBoard?.kpis?.jobs_overdue ?? "—"} accent={oliverBoard?.kpis?.jobs_overdue ? "rose" : "gray"} href="/app/services/oliver_jobs" />
            <Card label="Quotes pending" value={oliverDash?.kpis?.quotes_pending ?? "—"} accent="amber" href="/app/services/oliver_quotes" />
            <Card label="Invoices due" value={oliverDash?.kpis?.invoices_due ?? "—"} accent="amber" href="/app/services/oliver_invoices" />
            <Card label="Open jobs" value={oliverDash?.kpis?.jobs_open ?? "—"} href="/app/services/oliver_jobs" />
            <Card label="Cash next 30d" value={oliverDash?.kpis?.cash_in_30d != null ? `$${Number(oliverDash.kpis.cash_in_30d).toLocaleString()}` : "—"} accent="emerald" href="/app/services/oliver_insights" />
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
              {hasOliver && <Link to="/app/services/oliver_jobs" className="px-3 py-2 border rounded-md hover:bg-gray-50">+ New job</Link>}
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
              {oliverBoard?.kpis?.jobs_overdue ? <li>⚠ {oliverBoard.kpis.jobs_overdue} overdue jobs — reschedule or close out.</li> : null}
              {oliverDash?.kpis?.quotes_pending ? <li>📋 {oliverDash.kpis.quotes_pending} quotes pending — follow up before they go cold.</li> : null}
              {oliverDash?.kpis?.invoices_due ? <li>💰 {oliverDash.kpis.invoices_due} invoices due — send reminders.</li> : null}
              {sparkGrowth?.new_contacts === 0 ? <li>👥 No new contacts in 30 days — capture forms may need attention.</li> : null}
              {sparkNps && sparkNps.nps < 0 ? <li>🔴 NPS is negative — talk to a detractor today.</li> : null}
              {!oliverBoard && !sparkGrowth && <li className="text-gray-500">Loading focus items…</li>}
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
