import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  TimeRangeSelector, rangeForPreset,
  type Column, type TimeRange,
} from "../../components/oliver/ui";

interface CrewStat {
  worker_id: string;
  first_name: string;
  last_name: string;
  type: string;
  total_assignments: number;
  completed_jobs: number;
  revenue_generated: number;
  paid_invoice_count: number;
  avg_job_value: number;
}

function fmtMoneyShort(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "type:employee", label: "Employees" },
  { key: "type:contractor", label: "Contractors" },
];

function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function OliverCrewPerformancePage() {
  const { get, ready } = useOliverApi();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [crew, setCrew] = useState<CrewStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<CrewStat[]>(`/reports/crew${rangeToQuery(range)}`);
      setCrew(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, range]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = crew;
    if (filter.startsWith("type:")) {
      const t = filter.split(":")[1];
      list = list.filter((c) => c.type === t);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [crew, filter, search]);

  const maxAssignments = Math.max(1, ...crew.map((c) => c.total_assignments));
  const totalCompleted = crew.reduce((s, c) => s + c.completed_jobs, 0);
  const totalAssigned = crew.reduce((s, c) => s + c.total_assignments, 0);
  const avgCompletion = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
  const totalRevenue = crew.reduce((s, c) => s + Number(c.revenue_generated || 0), 0);
  const top = [...crew].sort((a, b) => Number(b.revenue_generated || 0) - Number(a.revenue_generated || 0))[0];

  const columns: Column<CrewStat>[] = [
    {
      key: "name",
      header: "Worker",
      sortable: true,
      sortAccessor: (c) => `${c.last_name} ${c.first_name}`.toLowerCase(),
      render: (c) => <strong style={{ color: "#0B1C24" }}>{c.first_name} {c.last_name}</strong>,
    },
    {
      key: "type",
      header: "Type",
      render: (c) => (
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 500,
          padding: "2px 8px", borderRadius: 999,
          background: c.type === "employee" ? "#E0E7FF" : "#FEF3C7",
          color: c.type === "employee" ? "#4338CA" : "#B45309",
          textTransform: "uppercase",
        }}>{c.type}</span>
      ),
    },
    {
      key: "assigned",
      header: "Assigned",
      align: "right",
      sortable: true,
      sortAccessor: (c) => c.total_assignments,
      render: (c) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.total_assignments}</span>,
    },
    {
      key: "completed",
      header: "Completed",
      align: "right",
      sortable: true,
      sortAccessor: (c) => c.completed_jobs,
      render: (c) => <span style={{ fontFamily: "monospace", fontSize: 12, color: "#059669", fontWeight: 600 }}>{c.completed_jobs}</span>,
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortable: true,
      sortAccessor: (c) => Number(c.revenue_generated || 0),
      render: (c) => Number(c.revenue_generated || 0) > 0
        ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#059669", fontWeight: 600 }}>{fmtMoneyShort(c.revenue_generated)}</span>
        : <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>,
    },
    {
      key: "avg_job",
      header: "Avg job",
      align: "right",
      sortable: true,
      sortAccessor: (c) => Number(c.avg_job_value || 0),
      render: (c) => Number(c.avg_job_value || 0) > 0
        ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5A7A8A" }}>{fmtMoneyShort(c.avg_job_value)}</span>
        : <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>,
    },
    {
      key: "completion",
      header: "Completion rate",
      render: (c) => {
        const pct = c.total_assignments > 0 ? Math.round((c.completed_jobs / c.total_assignments) * 100) : 0;
        const barWidth = (c.total_assignments / maxAssignments) * 100;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              flex: 1, height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden", position: "relative",
            }}>
              <div style={{
                position: "absolute", inset: 0, width: `${barWidth}%`,
                background: "#CBD5E1", borderRadius: 999,
              }} />
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${(c.completed_jobs / maxAssignments) * 100}%`,
                background: "#059669", borderRadius: 999,
              }} />
            </div>
            <span style={{ fontSize: 11, color: "#5A7A8A", width: 36, textAlign: "right" }}>{pct}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <OliverPageWrapper title="Team Performance" subtitle="Per-worker completion stats" error={error} loading={loading}>
      <PageHeader
        title="Team Performance"
        subtitle="See assignment volume and completion rate per team member"
        actions={<TimeRangeSelector value={range} onChange={setRange} />}
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Team revenue</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoneyShort(totalRevenue)}</div>
          <div className="stat-delta neu">paid invoices in range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Active workers</div>
          <div className="stat-val">{crew.length}</div>
          <div className="stat-delta neu">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Jobs completed</div>
          <div className="stat-val">{totalCompleted}</div>
          <div className="stat-delta neu">{avgCompletion}% completion rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Top by revenue</div>
          <div className="stat-val" style={{ fontSize: 14 }}>{top ? `${top.first_name} ${top.last_name}` : "—"}</div>
          <div className="stat-delta neu">{top ? fmtMoneyShort(top.revenue_generated) : "—"}</div>
        </div>
      </div>

      {!crew.length ? (
        <EmptyState
          title="No performance data yet"
          description="Once jobs are assigned to your team and completed, performance metrics appear here. Pro+ tenants can view crew performance reports."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.worker_id}
            initialSort={{ key: "revenue", direction: "desc" }}
            emptyMessage="No workers match these filters."
          />
        </>
      )}
    </OliverPageWrapper>
  );
}
