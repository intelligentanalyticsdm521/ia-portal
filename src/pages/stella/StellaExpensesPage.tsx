// StellaExpensesPage — STELLA 0.1.0 Expenses.
//
// Record / categorize / approve / reject / delete expenses over the existing
// oliver-api /expenses CRUD (routes/expenses.js). No backend change — this is
// the UI OLIVER's deprecated Expenses page never got. Feeds the Overview P&L.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { DataTable, EmptyState, Button, FilterBar, type Column } from "../../components/oliver/ui";
import { CheckCircle2, XCircle, Trash2, Plus } from "lucide-react";
import { StellaShell, STELLA_INDIGO, fmtMoney } from "./StellaShell";
import { STELLA_COA } from "./stellaCoa";

interface Expense {
  expense_id: string;
  job_id: string | null;
  category: string | null;
  vendor: string | null;
  description: string | null;
  amount: number | string;
  tax_amount: number | string | null;
  incurred_on: string;
  status: string;
  created_at: string;
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E" },
  approved: { bg: "#D1FAE5", color: "#047857" },
  rejected: { bg: "#FEE2E2", color: "#991B1B" },
  reimbursed: { bg: "#E0E7FF", color: "#3730A3" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  // incurred_on is a date-only value serialized as an ISO string at UTC midnight;
  // new Date() would shift it back a day in negative-UTC zones. Build the local
  // calendar date from its Y-M-D parts so the displayed day never drifts.
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

export function StellaExpensesPage() {
  const { get, post, del, ready } = useOliverApi();
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = filter && filter !== "all" ? `/expenses?status=${filter}` : "/expenses";
      const data = await get<Expense[]>(path);
      setRows(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, filter]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.vendor || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  function flashMsg(m: string) {
    setFlash(m);
    setTimeout(() => setFlash(null), 3000);
  }

  async function act(id: string, verb: "approve" | "reject") {
    setBusy(id);
    try {
      await post(`/expenses/${id}/${verb}`);
      flashMsg(verb === "approve" ? "Expense approved." : "Expense rejected.");
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : `${verb} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setBusy(id);
    try {
      await del(`/expenses/${id}`);
      flashMsg("Expense deleted.");
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Expense>[] = [
    {
      key: "incurred_on",
      header: "Date",
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDate(r.incurred_on)}</span>,
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.vendor || "—"}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{r.category || "Uncategorized"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(r.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const p = STATUS_PILL[r.status] || STATUS_PILL.pending;
        return (
          <span
            style={{
              display: "inline-block",
              padding: "3px 9px",
              borderRadius: 99,
              background: p.bg,
              color: p.color,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {r.status}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {r.status === "pending" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => act(r.expense_id, "approve")} disabled={busy === r.expense_id}>
                <CheckCircle2 size={11} color="#059669" /> Approve
              </Button>
              <Button variant="ghost" size="sm" onClick={() => act(r.expense_id, "reject")} disabled={busy === r.expense_id}>
                <XCircle size={11} color="#dc2626" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => remove(r.expense_id)} disabled={busy === r.expense_id}>
            <Trash2 size={11} color="#94A3B8" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StellaShell
      title="Expenses"
      subtitle="Record, categorize, and approve business expenses."
      actions={
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus size={13} /> Add expense
        </Button>
      }
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            fontSize: 12,
            background: "#EEF0FB",
            color: "#3730A3",
            border: `1px solid ${STELLA_INDIGO}33`,
            borderRadius: 6,
          }}
        >
          {flash}
        </div>
      )}

      {!rows.length && !loading && filter === "all" ? (
        <EmptyState
          title="No expenses yet"
          description="Record your first expense to start tracking spend and see it in your monthly P&L."
          action={
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              <Plus size={13} /> Add expense
            </Button>
          }
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by vendor, category, or note…"
          />
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.expense_id} emptyMessage="No expenses match these filters." />
        </>
      )}

      {showAdd && (
        <AddExpenseModal
          onClose={() => setShowAdd(false)}
          onCreated={(m) => {
            setShowAdd(false);
            reload();
            flashMsg(m);
          }}
          post={post}
        />
      )}
    </StellaShell>
  );
}

function AddExpenseModal({
  onClose,
  onCreated,
  post,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  post: <T>(p: string, b?: unknown) => Promise<T>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<string>(STELLA_COA[0]);
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(today);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setErr("Enter an amount greater than 0");
      return;
    }
    if (!incurredOn) {
      setErr("Date is required");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await post("/expenses", {
        vendor: vendor.trim() || null,
        category,
        amount: amt,
        incurred_on: incurredOn,
        description: description.trim() || null,
      });
      onCreated(`Added expense — ${fmtMoney(amt)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,28,36,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 460, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: STELLA_INDIGO }}>New expense</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>
            ×
          </button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label>
            <span style={pLabel}>Vendor</span>
            <input style={pInput} placeholder="e.g. Home Depot" value={vendor} onChange={(e) => setVendor(e.target.value)} autoFocus />
          </label>
          <label>
            <span style={pLabel}>Category</span>
            <select style={pInput} value={category} onChange={(e) => setCategory(e.target.value)}>
              {STELLA_COA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <span style={pLabel}>Amount</span>
              <input type="number" min="0" step="0.01" style={pInput} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              <span style={pLabel}>Date</span>
              <input type="date" style={pInput} value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
            </label>
          </div>
          <label>
            <span style={pLabel}>Note (optional)</span>
            <textarea rows={2} style={{ ...pInput, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving || !amount}>
              {saving ? "Saving…" : "Add expense"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(76,91,212,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
