import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  source: "oliver" | "spark" | "arion" | "system";
  title: string;
  description: string;
  href?: string;
}

export function CommandAlerts() {
  const { enabledServices } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const next: Alert[] = [];

    // OLIVER signals
    if (hasOliver && oliver.ready) {
      try {
        type OliverToday = { overdue_invoices: number; overdue_amount: number; open_requests: number; disputes_open: number; };
        const r = await oliver.get<{ data: OliverToday }>("/dashboard/today");
        const d = r.data;
        if (d?.overdue_invoices && d.overdue_invoices > 0) {
          next.push({
            id: "oliver-invoices-overdue", severity: d.overdue_invoices > 5 ? "critical" : "warning", source: "oliver",
            title: `${d.overdue_invoices} overdue invoices (${d.overdue_amount > 0 ? `$${Number(d.overdue_amount).toLocaleString()}` : "amount n/a"})`,
            description: "Cash flow at risk. Send reminders or escalate.",
            href: "/app/services/oliver_invoices",
          });
        }
        if (d?.open_requests && d.open_requests > 5) {
          next.push({
            id: "oliver-open-requests", severity: "warning", source: "oliver",
            title: `${d.open_requests} service requests waiting`,
            description: "Inbound requests stay hot for ~24 hours. Respond before they go cold.",
            href: "/app/services/oliver_service_requests",
          });
        }
        if (d?.disputes_open && d.disputes_open > 0) {
          next.push({
            id: "oliver-disputes-open", severity: "critical", source: "oliver",
            title: `${d.disputes_open} Stripe disputes need response`,
            description: "Disputes default to a loss if not responded to in time. Review and contest.",
            href: "/app/services/oliver_disputes",
          });
        }
      } catch { /* skip */ }
    }

    // SPARK signals
    if (hasSpark && spark.ready) {
      try {
        type CommPerf = { open_rate: number; bounce_rate: number; click_rate: number; totals: { sent: number } };
        const r = await spark.get<{ data: CommPerf }>("/api/v1/insights/communication-performance?days=30");
        const c = r.data;
        if (c?.bounce_rate > 3 && c.totals.sent > 50) {
          next.push({
            id: "spark-bounce-high", severity: "critical", source: "spark",
            title: `Email bounce rate is ${c.bounce_rate}% (>3%)`,
            description: "Sender reputation will degrade. Clean your list now.",
            href: "/app/services/spark_campaigns",
          });
        }
        if (c?.open_rate < 12 && c.totals.sent > 200) {
          next.push({
            id: "spark-open-low", severity: "warning", source: "spark",
            title: `Email open rate is ${c.open_rate}% (low)`,
            description: "Subject lines or sender reputation may need attention.",
            href: "/app/services/spark_insights",
          });
        }
      } catch { /* skip */ }

      try {
        type NpsSummary = { nps: number; total: number; detractors: number; };
        const r = await spark.get<{ data: NpsSummary }>("/api/v1/nps/summary?days=30");
        const n = r.data;
        if (n?.nps != null && n.nps < 0 && n.total >= 5) {
          next.push({
            id: "spark-nps-negative", severity: "critical", source: "spark",
            title: `NPS is ${n.nps} (negative)`,
            description: `${n.detractors} detractors in the last 30 days. Reach out personally before they leave public reviews.`,
            href: "/app/services/spark_nps",
          });
        }
      } catch { /* skip */ }

      try {
        type LeadSummary = { total_leads: number; accepted: number };
        const r = await spark.get<{ data: LeadSummary }>("/api/v1/insights/lead-gen-roi");
        const l = r.data;
        if (l && l.total_leads > 20 && l.accepted < l.total_leads * 0.1) {
          next.push({
            id: "spark-lead-acceptance-low", severity: "warning", source: "spark",
            title: `Lead acceptance rate is below 10%`,
            description: "Search profile is returning low-fit leads. Tighten geography or categories.",
            href: "/app/services/spark_search_profiles",
          });
        }
      } catch { /* skip */ }
    }

    // Always-on system signal
    if (next.length === 0) {
      next.push({
        id: "system-all-clear", severity: "info", source: "system",
        title: "All clear",
        description: "No critical alerts at this time. Keep up the great work.",
      });
    }

    setAlerts(next);
    setLoading(false);
  }, [oliver, spark, hasOliver, hasSpark]);

  useEffect(() => { load(); }, [load]);

  const colors = {
    critical: "border-rose-400 bg-rose-50 text-rose-900",
    warning: "border-amber-400 bg-amber-50 text-amber-900",
    info: "border-blue-300 bg-blue-50 text-blue-900",
  };
  const icons = {
    critical: "🔴",
    warning: "⚠️",
    info: "ℹ️",
  };

  return (
    <div className="space-y-3">
      {loading && <div className="text-sm text-gray-500 py-8 text-center">Scanning signals…</div>}
      {alerts.map(a => (
        <div key={a.id} className={`border-l-4 rounded-md p-4 ${colors[a.severity]}`}>
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">{icons[a.severity]}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{a.title}</div>
                <span className="text-xs uppercase tracking-wide text-gray-600">{a.source}</span>
              </div>
              <div className="mt-1 text-sm">{a.description}</div>
              {a.href && (
                <Link to={a.href} className="mt-2 inline-block text-sm underline">View → </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
