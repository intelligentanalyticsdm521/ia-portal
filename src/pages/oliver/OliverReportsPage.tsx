import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader } from "../../components/oliver/ui";

interface RevenueSummary {
  total_revenue: number;
  payment_count: number;
  revenue_last_30d: number;
  revenue_last_7d: number;
  open_invoices: number;
  total_outstanding: number;
}
interface JobsReport {
  by_status: Array<{ status: string; count: number }>;
  total: number;
  reporting_window: string;
}
interface CompletionReport {
  total_jobs: number;
  completed_jobs: number;
  cancelled_jobs: number;
  completion_rate_pct: number;
}
interface RevenueTrendBucket { month: string; revenue: number; paid_count: number; }
interface ServiceBreakdown { job_type: string; revenue: number; invoice_count: number; }
interface QuoteConversion { month: string; total_quotes: number; accepted: number; declined: number; still_open: number; conversion_pct: number; }
interface TopClient { contactName: string | null; contactEmail: string | null; total_revenue: number; invoice_count: number; }

const PIE_COLORS = ["#10B981", "#EF4444", "#F59E0B"];
const STATUS_COLORS: Record<string, string> = {
  draft: "#9CA3AF", inquiry: "#94A3B8", quoted: "#6366F1", scheduled: "#3B82F6",
  dispatched: "#06B6D4", assigned: "#06B6D4", in_progress: "#F59E0B",
  completed: "#10B981", invoiced: "#3B82F6", paid: "#059669", cancelled: "#EF4444",
};

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function OliverReportsPage() {
  const { get, ready } = useOliverApi();
  const [rev, setRev] = useState<RevenueSummary | null>(null);
  const [jobs, setJobs] = useState<JobsReport | null>(null);
  const [comp, setComp] = useState<CompletionReport | null>(null);
  const [trend, setTrend] = useState<RevenueTrendBucket[]>([]);
  const [breakdown, setBreakdown] = useState<ServiceBreakdown[]>([]);
  const [conversion, setConversion] = useState<QuoteConversion[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [r, j, c, t, b, q] = await Promise.all([
          get<RevenueSummary>("/reports/revenue"),
          get<JobsReport>("/reports/jobs"),
          get<CompletionReport>("/reports/completion"),
          get<RevenueTrendBucket[]>("/reports/revenue-trend"),
          get<ServiceBreakdown[]>("/reports/service-breakdown"),
          get<QuoteConversion[]>("/reports/quote-conversion"),
        ]);
        setRev(r); setJobs(j); setComp(c); setTrend(t || []); setBreakdown(b || []); setConversion(q || []);
        try {
          const top = await get<TopClient[]>("/reports/top-clients");
          setTopClients(top || []);
        } catch { /* tier-gated */ }
      } catch (err) { setError(err); }
      finally { setLoading(false); }
    })();
  }, [get, ready]);

  const completionPie = comp ? [
    { name: "Completed", value: comp.completed_jobs },
    { name: "Cancelled", value: comp.cancelled_jobs },
    { name: "In progress", value: Math.max(0, comp.total_jobs - comp.completed_jobs - comp.cancelled_jobs) },
  ] : [];
  const jobsBarData = jobs?.by_status?.map((s) => ({ status: s.status, count: s.count })) || [];

  return (
    <OliverPageWrapper title="Reports" subtitle="Analytics & insights" error={error} loading={loading}>
      <PageHeader title="Reports" subtitle="Revenue, conversion, and operational performance" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Kpi label="Total revenue" value={fmtMoney(rev?.total_revenue)} tone="emerald" />
        <Kpi label="Last 30 days" value={fmtMoney(rev?.revenue_last_30d)} tone="emerald" />
        <Kpi label="Outstanding" value={fmtMoney(rev?.total_outstanding)} hint={`${rev?.open_invoices ?? 0} open`} tone="teal" />
        <Kpi label="Completion rate" value={`${Number(comp?.completion_rate_pct ?? 0).toFixed(0)}%`} hint={`${comp?.completed_jobs ?? 0} of ${comp?.total_jobs ?? 0}`} tone="teal" />
      </div>

      <ChartCard title="Monthly revenue (last 12 months)">
        {trend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#FEC82C" strokeWidth={3} dot={{ fill: "#1A3A4A", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Job volume by status">
          {jobsBarData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={jobsBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="status" stroke="#64748B" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="#64748B" fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {jobsBarData.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.status] || "#1A3A4A"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Completion breakdown">
          {completionPie.every((d) => d.value === 0) ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={completionPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {completionPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={28} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Revenue by service type">
          {breakdown.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={breakdown.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#64748B" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="job_type" stroke="#64748B" fontSize={11} width={80} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="revenue" fill="#1A3A4A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Quote conversion (12 months)">
          {conversion.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={conversion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="conversion_pct" stroke="#10B981" strokeWidth={3} dot={{ fill: "#1A3A4A", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {topClients.length > 0 && (
        <div className="mt-4 rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal mb-3">Top clients by revenue (Pro+)</h3>
          <div className="divide-y divide-gray-100">
            {topClients.slice(0, 10).map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{c.contactName || "—"}</div>
                  {c.contactEmail && <div className="text-xs text-slate-500">{c.contactEmail}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-oliver-teal tabular-nums">{fmtMoney(c.total_revenue)}</div>
                  <div className="text-xs text-slate-500">{c.invoice_count} invoice{c.invoice_count === 1 ? "" : "s"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}

function Kpi({ label, value, hint, tone = "teal" }: { label: string; value: string; hint?: string; tone?: "teal" | "emerald" | "amber" | "red" }) {
  const colors: Record<string, string> = {
    teal: "text-oliver-teal", emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-600",
  };
  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${colors[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Empty() { return <div className="h-[260px] flex items-center justify-center text-sm text-slate-400 italic">No data yet</div>; }
