/**
 * OliverJobsArchivePage — `OLIVER > Jobs > Archive`
 *
 * Closed jobs only (paid + cancelled). Surfaces records older than the
 * rolling 7-day window the Job Board shows. Default date range = "All time"
 * so the page stays useful even if the tenant rarely opens it; presets +
 * a free-form range narrow it down.
 *
 * Data source: same GET /jobs endpoint as the board — we filter client-side
 * by status + scheduled date. Server-side paging will land alongside the
 * cold-storage strategy (#42).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, StatusBadge, type Column,
} from "../../components/oliver/ui";

interface ArchiveJob {
  id: string;
  title: string;
  customerName: string;
  status: string;             // paid | cancelled (anything else is excluded)
  scheduledDate?: string | null;
  /** F-07 — REAL closed date. For paid: paid_at; for cancelled:
   *  actual_end OR updated_at fallback. Backend computes server-side
   *  so the Archive page doesn't have to guess. */
  closedDate?: string | null;
  total: number;
  revenue?: number;
  laborCost?: number;
  profit?: number;
}

const CLOSED_STATUSES = new Set(['paid', 'cancelled']);

type RangePreset = '7' | '30' | '90' | '365' | 'all' | 'custom';

const RANGE_PRESETS: Array<{ key: RangePreset; label: string; days: number | null }> = [
  { key: '7',   label: 'Last 7 days',  days: 7 },
  { key: '30',  label: 'Last 30 days', days: 30 },
  { key: '90',  label: 'Last 90 days', days: 90 },
  { key: '365', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time',    days: null },
];

const SUBSTATUS_PILLS = [
  { key: '',          label: 'All closed' },
  { key: 'paid',      label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function toDateInput(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function OliverJobsArchivePage() {
  const { get, ready } = useOliverApi();
  const [jobs, setJobs] = useState<ArchiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [substatus, setSubstatus] = useState<'' | 'paid' | 'cancelled'>('');
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Pull a wide window; the page is filter-driven. Future iteration will
      // accept a server-side date range when the volume warrants it.
      const data = await get<ArchiveJob[]>('/jobs?per_page=1000');
      setJobs((data || []).filter((j) => CLOSED_STATUSES.has(j.status)));
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Resolve current range to {fromMs, toMs}. All time = null endpoints.
  const range = useMemo(() => {
    if (rangePreset === 'custom') {
      const fromMs = customFrom ? Date.parse(customFrom) : null;
      const toMs = customTo ? Date.parse(customTo) + 24 * 60 * 60 * 1000 - 1 : null;
      return { fromMs, toMs };
    }
    const preset = RANGE_PRESETS.find((r) => r.key === rangePreset);
    if (!preset || preset.days == null) return { fromMs: null as number | null, toMs: null as number | null };
    return { fromMs: Date.now() - preset.days * 24 * 60 * 60 * 1000, toMs: Date.now() };
  }, [rangePreset, customFrom, customTo]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (substatus) list = list.filter((j) => j.status === substatus);
    if (range.fromMs != null || range.toMs != null) {
      list = list.filter((j) => {
        // F-07 — range filter against closedDate (when the job actually
        // closed) not scheduledDate (when it was originally scheduled).
        const dateStr = j.closedDate || j.scheduledDate;
        if (!dateStr) return false;
        const t = Date.parse(dateStr);
        if (Number.isNaN(t)) return false;
        if (range.fromMs != null && t < range.fromMs) return false;
        if (range.toMs != null && t > range.toMs) return false;
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
    }
    return list;
  }, [jobs, substatus, range, search]);

  const totals = useMemo(() => {
    const paid = filtered.filter((j) => j.status === 'paid');
    const cancelled = filtered.filter((j) => j.status === 'cancelled');
    const revenue = paid.reduce((s, j) => s + Number(j.revenue ?? j.total ?? 0), 0);
    return { paid: paid.length, cancelled: cancelled.length, revenue };
  }, [filtered]);

  const columns: Column<ArchiveJob>[] = [
    {
      key: 'title', header: 'Job', sortable: true, sortAccessor: (j) => j.title?.toLowerCase() ?? '',
      render: (j) => (
        <div>
          <div className="font-medium text-oliver-teal">{j.title || '(untitled)'}</div>
          <div className="text-xs text-slate-500 mt-0.5">{j.customerName || '—'}</div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', sortable: true, sortAccessor: (j) => j.status,
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      // F-07 — use j.closedDate (paid_at for paid jobs, actual_end/updated_at
      // for cancelled) instead of j.scheduledDate which is when the job was
      // SCHEDULED to happen, not when it CLOSED.
      key: 'closedDate', header: 'Closed', sortable: true, sortAccessor: (j) => j.closedDate ?? j.scheduledDate ?? '',
      render: (j) => {
        const d = j.closedDate || j.scheduledDate;
        return <span className="text-sm text-slate-600">{d ? new Date(d).toLocaleDateString() : '—'}</span>;
      },
    },
    {
      key: 'total', header: 'Amount', align: 'right', sortable: true, sortAccessor: (j) => Number(j.total),
      render: (j) => <span className="font-medium tabular-nums">{fmtMoney(j.total)}</span>,
    },
  ];

  // Quick set-custom-range handler triggered by clicking the Custom preset.
  function pickCustom() {
    setRangePreset('custom');
    if (!customFrom) setCustomFrom(toDateInput(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)));
    if (!customTo) setCustomTo(toDateInput(new Date()));
  }

  return (
    <OliverPageWrapper title="Jobs Archive" subtitle="Closed jobs (paid + cancelled)" error={error} loading={loading}>
      <PageHeader
        title="Jobs Archive"
        subtitle="Closed jobs — paid and cancelled. Search any window of time."
        actions={
          <Link to="/app/services/oliver_job_board" className="text-xs text-blue-600 hover:underline">
            ← Back to Job Board
          </Link>
        }
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Paid jobs</div>
          <div className="stat-val">{totals.paid}</div>
          <div className="stat-delta neu">in range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Cancelled</div>
          <div className="stat-val">{totals.cancelled}</div>
          <div className="stat-delta neu">in range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Revenue (paid)</div>
          <div className="stat-val" style={{ color: '#059669' }}>{fmtMoney(totals.revenue)}</div>
          <div className="stat-delta neu">in range</div>
        </div>
      </div>

      {/* Range preset pills */}
      <div className="ptabs" style={{ marginBottom: 8 }}>
        {RANGE_PRESETS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangePreset(r.key)}
            className={`ptab${rangePreset === r.key ? ' active' : ''}`}
          >
            {r.label}
          </button>
        ))}
        <button onClick={pickCustom} className={`ptab${rangePreset === 'custom' ? ' active' : ''}`}>
          Custom…
        </button>
      </div>

      {rangePreset === 'custom' && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-xs text-slate-600">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-xs text-slate-600">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </label>
        </div>
      )}

      {/* Substatus pills */}
      <div className="ptabs" style={{ marginBottom: 8 }}>
        {SUBSTATUS_PILLS.map((p) => (
          <button
            key={p.key}
            onClick={() => setSubstatus(p.key as '' | 'paid' | 'cancelled')}
            className={`ptab${substatus === p.key ? ' active' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or customer…"
          className="w-full md:w-80 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-oliver-gold focus:ring-1 focus:ring-oliver-gold focus:outline-none"
        />
      </div>

      {!filtered.length ? (
        <EmptyState
          title="No closed jobs in this window"
          description="Try expanding the date range or clearing filters."
        />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(j) => j.id}
          initialSort={{ key: 'closedDate', direction: 'desc' }}
        />
      )}
    </OliverPageWrapper>
  );
}
