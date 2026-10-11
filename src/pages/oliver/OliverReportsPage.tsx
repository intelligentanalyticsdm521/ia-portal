import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { ByLocationToggle, LocationBreakdownCard } from "../../components/oliver/LocationBreakdown";
import { withLocation, withQuery, extractLocationRows, type LocationBreakdownRow } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader,
  TimeRangeSelector,
  rangeForPreset,
  type TimeRange,
} from "../../components/oliver/ui";

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
interface OfferingRevenue { offering_id: string; name: string; category_name: string; revenue: number; units_sold: number; line_count: number; }
interface ProfitBucket { bucket: string; label: string; job_count: number; total_revenue: number; total_labor_cost: number; total_profit: number; }
interface QuoteConversion { month: string; total_quotes: number; accepted: number; declined: number; still_open: number; conversion_pct: number; }
interface TopClient { contactName: string | null; contactEmail: string | null; total_revenue: number; invoice_count: number; }

const PIE_COLORS = ["#10B981", "#EF4444", "#F59E0B"];
const STATUS_COLORS: Record<string, string> = {
  draft: "#9CA3AF", inquiry: "#94A3B8", quoted: "#6366F1", scheduled: "#3B82F6",
  dispatched: "#06B6D4", assigned: "#06B6D4", in_progress: "#F59E0B",
  completed: "#10B981", invoiced: "#3B82F6", paid: "#059669", cancelled: "#EF4444",
};

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function OliverReportsPage() {
  const { get, ready } = useOliverApi();
  const loc = useOliverLocations();
  const sel = loc.selectedLocationId;
  const [byLocation, setByLocation] = useState(false);
  const [locationRows, setLocationRows] = useState<LocationBreakdownRow[]>([]);
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [rev, setRev] = useState<RevenueSummary | null>(null);
  const [jobs, setJobs] = useState<JobsReport | null>(null);
  const [comp, setComp] = useState<CompletionReport | null>(null);
  const [trend, setTrend] = useState<RevenueTrendBucket[]>([]);
  const [breakdown, setBreakdown] = useState<ServiceBreakdown[]>([]);
  const [offerings, setOfferings] = useState<OfferingRevenue[]>([]);
  const [profitDist, setProfitDist] = useState<ProfitBucket[]>([]);
  const [conversion, setConversion] = useState<QuoteConversion[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    const qs = rangeToQuery(range);
    (async () => {
      setLoading(true); setError(null);
      try {
        const [r, j, c, t, b, q, o, pd] = await Promise.all([
          get<RevenueSummary>(withLocation(`/reports/revenue${qs}`, sel)),
          get<JobsReport>(withLocation(`/reports/jobs${qs}`, sel)),
          get<CompletionReport>(withLocation(`/reports/completion${qs}`, sel)),
          get<RevenueTrendBucket[]>(withLocation(`/reports/revenue-trend${qs}`, sel)),
          get<ServiceBreakdown[]>(withLocation(`/reports/service-breakdown${qs}`, sel)),
          get<QuoteConversion[]>(withLocation(`/reports/quote-conversion${qs}`, sel)),
          get<OfferingRevenue[]>(withLocation(`/reports/offering-revenue${qs}`, sel)).catch(() => [] as OfferingRevenue[]),
          get<{ buckets: ProfitBucket[] }>(withLocation(`/reports/profit-distribution${qs}`, sel)).catch(() => ({ buckets: [] })),
        ]);
        setRev(r); setJobs(j); setComp(c); setTrend(t || []); setBreakdown(b || []); setConversion(q || []); setOfferings(o || []); setProfitDist(pd?.buckets || []);
        try {
          const top = await get<TopClient[]>(withLocation(`/reports/top-clients${qs}`, sel));
          setTopClients(top || []);
        } catch { /* tier-gated */ }
      } catch (err) { setError(err); }
      finally { setLoading(false); }
    })();
  }, [get, ready, range, sel]);

  // "By location" breakdown — three group_by=location calls merged per
  // location_id. Only when the toggle is on, only for multi-location.
  useEffect(() => {
    if (!ready || !byLocation || !loc.multi) { setLocationRows([]); return; }
    const qs = rangeToQuery(range);
    let cancelled = false;
    (async () => {
      const [r, j, c] = await Promise.all([
        get<unknown>(withQuery(`/reports/revenue${qs}`, { group_by: "location" })).catch(() => null),
        get<unknown>(withQuery(`/reports/jobs${qs}`, { group_by: "location" })).catch(() => null),
        get<unknown>(withQuery(`/reports/completion${qs}`, { group_by: "location" })).catch(() => null),
      ]);
      if (cancelled) return;
      const merged = new Map<string, LocationBreakdownRow>();
      for (const row of [...extractLocationRows(r), ...extractLocationRows(j), ...extractLocationRows(c)]) {
        const key = row.location_id.toLowerCase();
        const prev = merged.get(key);
        merged.set(key, prev ? { ...prev, ...row, location_name: prev.location_name || row.location_name } : row);
      }
      setLocationRows(Array.from(merged.values()));
    })();
    return () => { cancelled = true; };
  }, [get, ready, byLocation, loc.multi, range]);

  const completionPie = comp ? [
    { name: "Completed", value: comp.completed_jobs },
    { name: "Cancelled", value: comp.cancelled_jobs },
    { name: "In progress", value: Math.max(0, comp.total_jobs - comp.completed_jobs - comp.cancelled_jobs) },
  ] : [];
  const jobsBarData = jobs?.by_status?.map((s) => ({ status: s.status, count: s.count })) || [];

  return (
    <OliverPageWrapper title="Reports" subtitle="Analytics & insights" error={error} loading={loading}>
      <PageHeader
        title="Reports"
        subtitle="Revenue, conversion, and operational performance"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loc.multi && <ByLocationToggle on={byLocation} onChange={setByLocation} />}
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>
        }
      />

      {loc.multi && byLocation && (
        <LocationBreakdownCard
          title="By location"
          subtitle="Revenue, jobs and completion per location in the selected range"
          rows={locationRows}
          locations={loc.locations}
          metrics={[
            { label: "Revenue", keys: ["total_revenue", "revenue"], money: true },
            { label: "Outstanding", keys: ["total_outstanding", "outstanding"], money: true },
            { label: "Jobs", keys: ["total", "total_jobs", "job_count", "jobs"] },
            { label: "Completed", keys: ["completed_jobs", "completed"] },
            { label: "Completion", keys: ["completion_rate_pct", "completion_pct", "completion_rate"], pct: true },
          ]}
        />
      )}

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Revenue</div>
          <div className="stat-val">{fmtMoney(rev?.total_revenue)}</div>
          <div className="stat-delta neu">{rev?.payment_count ?? 0} paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding</div>
          <div className="stat-val">{fmtMoney(rev?.total_outstanding)}</div>
          <div className="stat-delta neu">{rev?.open_invoices ?? 0} open</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Total jobs</div>
          <div className="stat-val">{jobs?.total ?? 0}</div>
          <div className="stat-delta neu">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Completion rate</div>
          <div className="stat-val">{Number(comp?.completion_rate_pct ?? 0).toFixed(0)}%</div>
          <div className="stat-delta neu">{comp?.completed_jobs ?? 0} of {comp?.total_jobs ?? 0}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Monthly revenue</div>
            <div className="card-sub">Paid invoices, bucketed by month</div>
          </div>
        </div>
        {trend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Line type="monotone" dataKey="revenue" stroke="#1A7DB5" strokeWidth={3} dot={{ fill: "#0C4A60", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Job volume by status</div>
              <div className="card-sub">Jobs created in selected range</div>
            </div>
          </div>
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
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Completion breakdown</div>
              <div className="card-sub">Completed vs. cancelled vs. in-flight</div>
            </div>
          </div>
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
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Revenue by service type</div>
              <div className="card-sub">Top 8 service categories by revenue</div>
            </div>
          </div>
          {breakdown.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={breakdown.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#64748B" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="job_type" stroke="#64748B" fontSize={11} width={80} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Bar dataKey="revenue" fill="#0C4A60" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Quote conversion rate</div>
              <div className="card-sub">Accepted ÷ (Accepted + Declined)</div>
            </div>
          </div>
          {conversion.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={conversion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${Number(v)}%`} />
                <Line type="monotone" dataKey="conversion_pct" stroke="#10B981" strokeWidth={3} dot={{ fill: "#0C4A60", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {offerings.length > 0 && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Revenue by service offering</div>
              <div className="card-sub">Top 10 catalog offerings · paid invoices, tax lines excluded</div>
            </div>
          </div>
          <table className="tbl" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Offering</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Units</th>
                <th style={{ textAlign: "right" }}>Line count</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {offerings.slice(0, 10).map((o, i) => (
                <tr key={`${o.offering_id}-${i}`}>
                  <td><strong style={{ color: "#0B1C24" }}>{o.name}</strong></td>
                  <td style={{ color: "#5A7A8A", fontSize: 12 }}>{o.category_name}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{Number(o.units_sold || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#5A7A8A" }}>{o.line_count}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#059669" }}>{fmtMoney(o.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {profitDist.length > 0 && profitDist.some((b) => b.job_count > 0) && (
        <ProfitDistributionCard buckets={profitDist} />
      )}

      {topClients.length > 0 && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Top clients by revenue</div>
              <div className="card-sub">Limited to the selected range</div>
            </div>
          </div>
          {topClients.slice(0, 10).map((c, i) => (
            <div key={i} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{c.contactName || "—"}</div>
                {c.contactEmail && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{c.contactEmail}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>{fmtMoney(c.total_revenue)}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>{c.invoice_count} invoice{c.invoice_count === 1 ? "" : "s"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </OliverPageWrapper>
  );
}

function Empty() {
  return (
    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
      No data yet
    </div>
  );
}

function ProfitDistributionCard({ buckets }: { buckets: ProfitBucket[] }) {
  // Tally counts only across tracked buckets so the % is "of jobs we can classify"
  const tracked = buckets.filter((b) => b.bucket !== "untracked");
  const totalTracked = tracked.reduce((s, b) => s + b.job_count, 0);
  const maxCount = Math.max(1, ...tracked.map((b) => b.job_count));
  const untracked = buckets.find((b) => b.bucket === "untracked");

  // Color each bucket by health
  const colors: Record<string, string> = {
    "loss": "#DC2626",
    "0-20": "#F59E0B",
    "20-50": "#10B981",
    "50+": "#059669",
  };

  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">Job profit distribution</div>
          <div className="card-sub">
            {totalTracked} job{totalTracked === 1 ? "" : "s"} classified
            {untracked && untracked.job_count > 0 ? ` · ${untracked.job_count} untracked (need rate or hours)` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {tracked.map((b) => {
          const pctOfMax = (b.job_count / maxCount) * 100;
          const pctOfTotal = totalTracked > 0 ? Math.round((b.job_count / totalTracked) * 100) : 0;
          return (
            <div key={b.bucket}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#0B1C24", fontWeight: 500 }}>{b.label}</span>
                <span style={{ color: "#5A7A8A" }}>
                  {b.job_count} job{b.job_count === 1 ? "" : "s"} ({pctOfTotal}%) · {fmtMoney(b.total_profit)} profit
                </span>
              </div>
              <div style={{ height: 14, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: `${pctOfMax}%`, height: "100%",
                  background: colors[b.bucket] || "#94A3B8",
                  transition: "width 300ms ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
