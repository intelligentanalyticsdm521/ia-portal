import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import { CheckCircle2, XCircle, Trash2, Receipt, Edit3 } from "lucide-react";

interface Expense {
  expense_id: string;
  job_id: string | null;
  worker_id: string | null;
  category: "materials" | "fuel" | "tools" | "other";
  vendor: string | null;
  description: string;
  amount: number;
  tax_amount: number | null;
  incurred_on: string;
  receipt_url: string | null;
  billable: boolean;
  reimbursable: boolean;
  status: "pending" | "approved" | "rejected";
}

const CATEGORY_OPTIONS = [
  { value: "materials", label: "Materials" },
  { value: "fuel", label: "Fuel" },
  { value: "tools", label: "Tools" },
  { value: "other", label: "Other" },
];

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E" },
  approved: { bg: "#D1FAE5", color: "#047857" },
  rejected: { bg: "#FEE2E2", color: "#991B1B" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function fmtMoney(n?: number | null) {
  if (n == null) return "$0";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function OliverExpensesPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = filter && filter !== "all" ? `/expenses?status=${filter}` : "/expenses";
      const data = await get<Expense[]>(path);
      setExpenses(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const totals = useMemo(() => {
    const pending = expenses.filter((e) => e.status === "pending");
    const approved = expenses.filter((e) => e.status === "approved");
    const pendingAmt = pending.reduce((s, e) => s + Number(e.amount || 0), 0);
    const approvedAmt = approved.reduce((s, e) => s + Number(e.amount || 0), 0);
    return { pendingCount: pending.length, pendingAmt, approvedAmt };
  }, [expenses]);

  async function approve(e: Expense) {
    try {
      await post(`/expenses/${e.expense_id}/approve`);
      setFlash("Expense approved.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function reject(e: Expense) {
    if (!confirm("Reject this expense?")) return;
    try {
      await post(`/expenses/${e.expense_id}/reject`);
      setFlash("Expense rejected.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reject failed");
    }
  }

  async function deleteExpense(e: Expense) {
    if (!confirm("Delete this expense?")) return;
    try {
      await del(`/expenses/${e.expense_id}`);
      setFlash("Expense deleted.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const columns: Column<Expense>[] = [
    { key: "date", header: "Date", sortable: true, sortAccessor: (e) => e.incurred_on, render: (e) => <span style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtDate(e.incurred_on)}</span> },
    {
      key: "description", header: "Description",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A", fontSize: 13 }}>{e.description}</div>
          {e.vendor && <div style={{ fontSize: 11, color: "#5A7A8A" }}>{e.vendor}</div>}
        </div>
      ),
    },
    {
      key: "category", header: "Category",
      render: (e) => <span style={{ fontSize: 11, color: "#0B1C24", textTransform: "capitalize" }}>{e.category}</span>,
    },
    {
      key: "amount", header: "Amount", align: "right",
      sortable: true, sortAccessor: (e) => Number(e.amount),
      render: (e) => (
        <div>
          <div style={{ fontFamily: "monospace", fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(e.amount)}</div>
          {e.tax_amount && <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>+{fmtMoney(e.tax_amount)} tax</div>}
        </div>
      ),
    },
    {
      key: "flags", header: "Flags",
      render: (e) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {e.billable && <span style={{ padding: "2px 7px", borderRadius: 99, background: "#EEF2FF", color: "#4338CA", fontSize: 10, fontWeight: 600 }}>Billable</span>}
          {e.reimbursable && <span style={{ padding: "2px 7px", borderRadius: 99, background: "#F0FDF4", color: "#15803D", fontSize: 10, fontWeight: 600 }}>Reimburse</span>}
        </div>
      ),
    },
    {
      key: "status", header: "Status",
      render: (e) => {
        const pill = STATUS_PILL[e.status] || STATUS_PILL.pending;
        return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600 }}>{e.status}</span>;
      },
    },
    {
      key: "actions", header: "", align: "right",
      render: (e) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={(ev) => ev.stopPropagation()}>
          {e.status === "pending" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => approve(e)}><CheckCircle2 size={11} color="#059669" /> Approve</Button>
              <Button variant="ghost" size="sm" onClick={() => reject(e)}><XCircle size={11} color="#dc2626" /></Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(e)}><Edit3 size={11} /></Button>
          <Button variant="ghost" size="sm" onClick={() => deleteExpense(e)}><Trash2 size={11} color="#dc2626" /></Button>
        </div>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Expenses" subtitle="Job costs, materials, fuel, and reimbursements" error={error} loading={loading && !expenses.length}>
      <PageHeader
        title="Expenses"
        subtitle="Track materials, fuel, and tools spent per job. Approve to roll into job costing."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Receipt size={12} /> Log expense</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Pending approval</div>
          <div className="stat-val" style={{ color: totals.pendingCount > 0 ? "#D97706" : undefined }}>{totals.pendingCount}</div>
          <div className="stat-delta neu">{fmtMoney(totals.pendingAmt)} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Approved (filter view)</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(totals.approvedAmt)}</div>
          <div className="stat-delta neu">rolled into job costing</div>
        </div>
      </div>

      {!expenses.length && !loading && filter === "all" ? (
        <EmptyState
          title="No expenses logged"
          description="Log materials, fuel, and tool costs. Approve them to attribute against job profit margins."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Log your first expense</Button>}
        />
      ) : (
        <>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} />
          <DataTable rows={expenses} columns={columns} rowKey={(e) => e.expense_id} initialSort={{ key: "date", direction: "desc" }} emptyMessage="No expenses match this filter." />
        </>
      )}

      {(showCreate || editing) && (
        <ExpenseModal
          expense={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={(msg) => { setShowCreate(false); setEditing(null); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

function ExpenseModal({ expense, onClose, onSaved, api }: {
  expense: Expense | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
}) {
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState(expense?.category ?? "materials");
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [taxAmount, setTaxAmount] = useState(expense?.tax_amount?.toString() ?? "");
  const [incurredOn, setIncurredOn] = useState(expense?.incurred_on?.split("T")[0] ?? new Date().toISOString().split("T")[0]);
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [reimbursable, setReimbursable] = useState(expense?.reimbursable ?? false);
  const [receiptUrl, setReceiptUrl] = useState(expense?.receipt_url ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!description.trim() || !amount) { setErr("Description and amount required"); return; }
    setErr(null); setSaving(true);
    try {
      const body = {
        description: description.trim(),
        category,
        vendor: vendor.trim() || null,
        amount: Number(amount),
        tax_amount: taxAmount ? Number(taxAmount) : null,
        incurred_on: incurredOn,
        billable,
        reimbursable,
        receipt_url: receiptUrl.trim() || null,
      };
      if (expense) {
        await api.patch(`/expenses/${expense.expense_id}`, body);
        onSaved("Expense updated.");
      } else {
        await api.post("/expenses", body);
        onSaved("Expense logged.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>{expense ? "Edit expense" : "Log expense"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label><span style={pLabel}>Description</span><input style={pInput} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Category</span>
              <select style={pInput} value={category} onChange={(e) => setCategory(e.target.value as Expense["category"])}>
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label><span style={pLabel}>Vendor</span><input style={pInput} value={vendor} onChange={(e) => setVendor(e.target.value)} /></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Amount ($)</span><input type="number" min="0" step="0.01" style={pInput} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label><span style={pLabel}>Tax ($)</span><input type="number" min="0" step="0.01" style={pInput} value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} /></label>
            <label><span style={pLabel}>Incurred on</span><input type="date" style={pInput} value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} /></label>
          </div>
          <label><span style={pLabel}>Receipt URL (optional)</span><input style={pInput} placeholder="https://…" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0B1C24" }}>
              <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable to customer
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0B1C24" }}>
              <input type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} /> Reimburse worker
            </label>
          </div>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !description.trim() || !amount}>{saving ? "Saving…" : (expense ? "Save" : "Log expense")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
