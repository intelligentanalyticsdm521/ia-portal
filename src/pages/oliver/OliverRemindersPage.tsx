import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";

interface OverdueRow {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total: number;
  balance_due: number;
  due_date: string;
  sent_at?: string;
  days_past_due: number;
  reminder_3d_sent: boolean;
  reminder_7d_sent: boolean;
  reminder_14d_sent: boolean;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

interface OverdueResponse {
  invoices: OverdueRow[];
  summary: { total: number; last_24h: number; last_7d: number };
}

const STAGE_PILLS = [
  { key: "", label: "All overdue" },
  { key: "stage:1-2", label: "1–2 days late" },
  { key: "stage:3-6", label: "3–6 days late" },
  { key: "stage:7-13", label: "7–13 days late" },
  { key: "stage:14+", label: "14+ days late" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function ReminderBadge({ sent, label, color }: { sent: boolean; label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 500,
      padding: "2px 6px", borderRadius: 4,
      background: sent ? color : "#F1F5F9",
      color: sent ? "#fff" : "#94A3B8",
      marginRight: 4,
    }}>{label}</span>
  );
}

export function OliverRemindersPage() {
  const { get, post, ready } = useOliverApi();
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [summary, setSummary] = useState<OverdueResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<OverdueResponse>("/reminders/overdue");
      setRows(data.invoices || []);
      setSummary(data.summary || null);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter.startsWith("stage:")) {
      const stage = filter.split(":")[1];
      list = list.filter((r) => {
        const d = r.days_past_due;
        if (stage === "1-2") return d >= 1 && d <= 2;
        if (stage === "3-6") return d >= 3 && d <= 6;
        if (stage === "7-13") return d >= 7 && d <= 13;
        if (stage === "14+") return d >= 14;
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.invoice_number.toLowerCase().includes(q) ||
        r.customer_name?.toLowerCase().includes(q) ||
        r.customer_email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.balance_due || 0), 0);
  const over14 = rows.filter((r) => r.days_past_due >= 14).length;

  async function sendOne(r: OverdueRow) {
    setSendingId(r.invoice_id);
    try {
      await post(`/reminders/send/${r.invoice_id}`);
      setBulkResult({ ok: 1, failed: 0 });
      setTimeout(() => setBulkResult(null), 5000);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("422") || msg.includes("no email")) {
        alert("This customer has no email on file.");
      } else {
        alert(`Send failed: ${msg}`);
      }
    } finally {
      setSendingId(null);
    }
  }

  async function bulkSend() {
    const eligible = rows.filter((r) => selected.has(r.invoice_id) && r.customer_email).map((r) => r.invoice_id);
    if (!eligible.length) return;
    if (!confirm(`Send manual reminders for ${eligible.length} overdue invoice${eligible.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(eligible.map(async (id) => {
      try { await post(`/reminders/send/${id}`); ok++; }
      catch { failed++; }
    }));
    setBulkResult({ ok, failed });
    setSelected(new Set());
    setBulkBusy(false);
    setTimeout(() => setBulkResult(null), 6000);
  }

  const columns: Column<OverdueRow>[] = [
    {
      key: "invoice_number", header: "Invoice", sortable: true,
      sortAccessor: (r) => r.invoice_number,
      render: (r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1A7DB5" }}>{r.invoice_number}</span>,
    },
    {
      key: "customer", header: "Customer",
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{r.customer_name || "—"}</div>
          {r.customer_email && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{r.customer_email}</div>}
        </div>
      ),
    },
    {
      key: "days_past_due", header: "Late", align: "right", sortable: true,
      sortAccessor: (r) => r.days_past_due,
      render: (r) => (
        <span style={{
          fontWeight: 600, fontSize: 12,
          color: r.days_past_due >= 14 ? "#DC2626" : r.days_past_due >= 7 ? "#D97706" : "#0B1C24",
        }}>
          {r.days_past_due}d
        </span>
      ),
    },
    {
      key: "balance_due", header: "Balance", align: "right", sortable: true,
      sortAccessor: (r) => Number(r.balance_due),
      render: (r) => <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(r.balance_due)}</span>,
    },
    {
      key: "due_date", header: "Due", sortable: true,
      sortAccessor: (r) => r.due_date,
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtDate(r.due_date)}</span>,
    },
    {
      key: "reminders", header: "Reminders sent",
      render: (r) => (
        <div>
          <ReminderBadge sent={r.reminder_3d_sent}  label="3d"  color="#1A7DB5" />
          <ReminderBadge sent={r.reminder_7d_sent}  label="7d"  color="#D97706" />
          <ReminderBadge sent={r.reminder_14d_sent} label="14d" color="#DC2626" />
        </div>
      ),
    },
    {
      key: "actions", header: "",
      render: (r) => (
        <Button variant="secondary" onClick={(e?: React.MouseEvent) => { e?.stopPropagation(); sendOne(r); }} disabled={sendingId === r.invoice_id || !r.customer_email}>
          {sendingId === r.invoice_id ? "Sending…" : "Send reminder"}
        </Button>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Reminders" subtitle="Dunning + overdue tracking" error={error} loading={loading}>
      <PageHeader
        title="Reminders"
        subtitle="Track overdue invoices and trigger manual reminder emails"
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Overdue invoices</div>
          <div className="stat-val" style={{ color: rows.length > 0 ? "#D97706" : undefined }}>{rows.length}</div>
          <div className="stat-delta neu">past their due date</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding</div>
          <div className="stat-val">{fmtMoney(totalOutstanding)}</div>
          <div className="stat-delta neu">balance due, all overdue</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">14+ days late</div>
          <div className="stat-val" style={{ color: over14 > 0 ? "#DC2626" : undefined }}>{over14}</div>
          <div className="stat-delta neu">collections risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Reminders sent</div>
          <div className="stat-val">{summary?.last_7d ?? 0}</div>
          <div className="stat-delta neu">last 7 days · {summary?.last_24h ?? 0} today</div>
        </div>
      </div>

      <div className="card" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
          <strong>Automatic chasers</strong> fire on a cadence: a friendly first reminder at <strong>3 days late</strong>,
          a firm second at <strong>7 days</strong>, and a final past-due alert at <strong>14 days</strong>. Each invoice's
          badges below show which automated reminders have already fired. Manual sends from this page <em>don't</em>
          interrupt the automatic cadence.
        </div>
      </div>

      {bulkResult && (
        <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#065F46" }}>
            {bulkResult.ok} reminder{bulkResult.ok === 1 ? "" : "s"} queued{bulkResult.failed > 0 ? ` · ${bulkResult.failed} failed` : ""}.
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)", marginBottom: 8, padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#0C4A60" }}>
              <strong>{selected.size}</strong> selected
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button variant="primary" onClick={bulkSend} disabled={bulkBusy}>
                {bulkBusy ? "Sending…" : `Send ${selected.size} reminders`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!rows.length ? (
        <EmptyState
          title="No overdue invoices"
          description="All your sent invoices are within their due dates. The automatic chasers will fire here as invoices age past due."
        />
      ) : (
        <>
          <FilterBar
            pills={STAGE_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search invoice #, customer name, or email…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.invoice_id}
            initialSort={{ key: "days_past_due", direction: "desc" }}
            emptyMessage="No invoices match these filters."
            selectedIds={selected}
            onSelectionChange={setSelected}
            isRowSelectable={(r) => !!r.customer_email}
          />
        </>
      )}
    </OliverPageWrapper>
  );
}
