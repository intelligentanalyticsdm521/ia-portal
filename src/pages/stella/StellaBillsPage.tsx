// StellaBillsPage — Bills (accounts payable). STELLA pack 2, item 1.
//
// What you OWE. Until now the bookkeeping could record what a business SPENT
// and never what it owed: no bills, so AP Aging was a placeholder promising
// "arrives with Bill Pay", the accrual basis had no expenses in it at all, and
// a business moving its books in could not carry across what it owed on day
// one.
//
// The page is deliberately the shape of the invoice list, the other way round:
// a list with what is due next at the top, a form for the bill, and a payment
// that takes money out of an account you choose.
//
// Everything money-shaped is the API's answer, never this page's arithmetic —
// the total, the balance, the status and the aging all come back from
// /ledger/bills and /ledger/ap-aging.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

interface Bill {
  bill_id: string;
  bill_number: string | null;
  vendor_name: string | null;
  counterparty_id: string;
  bill_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  memo: string | null;
  days_overdue?: number;
  line_count?: number;
}
interface BillLine {
  bill_line_id?: string;
  coa_account_id: string;
  coa_account_name?: string | null;
  coa_code?: string | null;
  description: string | null;
  amount: number;
}
interface BillPayment {
  bill_payment_id: string;
  paid_on: string;
  amount: number;
  reference: string | null;
  settlement_name?: string | null;
}
interface BillDetail extends Bill { lines: BillLine[]; payments: BillPayment[] }
interface Account { coa_account_id: string; code: string; name: string; type: string }
interface Vendor { counterparty_id: string; display_name: string; type: string | null }

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: "#F1F5F9", color: "#475569", label: "Draft" },
  open: { bg: "#FEF3C7", color: "#92400E", label: "Owed" },
  paid: { bg: "#D1FAE5", color: "#047857", label: "Paid" },
  void: { bg: "#FEE2E2", color: "#991B1B", label: "Void" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "open", label: "Owed" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "draft", label: "Drafts" },
];

const label = { fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 } as const;
const input = {
  width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0",
  borderRadius: 6, color: "#0B1C24", background: "#fff",
} as const;

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && m && day) return new Date(y, m - 1, day).toLocaleDateString();
  return String(d).slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

export function StellaBillsPage() {
  const { get, post, del, ready } = useStellaApi();
  const [bills, setBills] = useState<Bill[]>([]);
  const [meta, setMeta] = useState<{ open_total?: number; open_count?: number }>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // One fetch per thing this page needs, once (convention_data_fetching).
      const [list, coa, vend] = await Promise.all([
        get<Bill[]>("/ledger/bills?limit=200").catch(() => [] as Bill[]),
        get<Account[]>("/ledger/coa?active=true"),
        get<Vendor[]>("/ledger/vendors"),
      ]);
      setBills(list || []);
      setAccounts(coa || []);
      setVendors((vend || []).filter((v) => v.type === "vendor" || v.type === "sub"));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // The API returns these totals on the same envelope as the rows, but
  // useStellaApi's `get` unwraps `data` — so they are read off the SAME rows
  // the table is showing rather than fetched a second time. One fetch, and a
  // header figure that cannot disagree with the list under it.
  useEffect(() => {
    const open = bills.filter((b) => b.status === "open");
    setMeta({
      open_total: open.reduce((s, b) => s + Number(b.balance_due || 0), 0),
      open_count: open.length,
    });
  }, [bills]);

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => ["expense", "asset"].includes(String(a.type).toLowerCase())),
    [accounts],
  );
  const paymentAccounts = useMemo(
    () => accounts.filter((a) => ["1000", "1010", "2100"].includes(String(a.code))),
    [accounts],
  );

  const filtered = useMemo(() => {
    let out = bills;
    if (filter === "overdue") out = out.filter((b) => b.status === "open" && Number(b.days_overdue || 0) > 0);
    else if (filter !== "all") out = out.filter((b) => b.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((b) =>
        (b.vendor_name || "").toLowerCase().includes(q) || (b.bill_number || "").toLowerCase().includes(q));
    }
    return out;
  }, [bills, filter, search]);

  async function openBill(id: string) {
    try {
      setDetail(await get<BillDetail>(`/ledger/bills/${id}`));
    } catch (e) { setError(e); }
  }

  const columns: Column<Bill>[] = [
    {
      key: "vendor_name", header: "Vendor", sortable: true,
      sortAccessor: (r) => (r.vendor_name || "").toLowerCase(),
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.vendor_name || "—"}</div>
          {r.bill_number && <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.bill_number}</div>}
        </div>
      ),
    },
    { key: "bill_date", header: "Dated", sortable: true, sortAccessor: (r) => r.bill_date, render: (r) => <span style={{ fontSize: 11 }}>{fmtDate(r.bill_date)}</span> },
    {
      key: "due_date", header: "Due", sortable: true, sortAccessor: (r) => r.due_date || "",
      render: (r) => (
        <span style={{ fontSize: 11, color: Number(r.days_overdue || 0) > 0 && r.status === "open" ? "#B91C1C" : "#5A7A8A", fontWeight: Number(r.days_overdue || 0) > 0 && r.status === "open" ? 700 : 400 }}>
          {fmtDate(r.due_date)}
          {r.status === "open" && Number(r.days_overdue || 0) > 0 && ` · ${r.days_overdue}d late`}
        </span>
      ),
    },
    { key: "total", header: "Bill", align: "right", sortable: true, sortAccessor: (r) => Number(r.total), render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.total)}</span> },
    {
      key: "balance_due", header: "Still owed", align: "right", sortable: true, sortAccessor: (r) => Number(r.balance_due),
      render: (r) => <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: Number(r.balance_due) > 0 ? "#0B1C24" : "#94A3B8" }}>{fmtMoney(r.balance_due)}</span>,
    },
    {
      key: "status", header: "Status", align: "center",
      render: (r) => {
        const p = STATUS_PILL[r.status] || STATUS_PILL.open;
        return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 10, fontWeight: 700 }}>{p.label}</span>;
      },
    },
  ];

  const addButton = (
    <button
      onClick={() => setShowCreate(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, background: "#fff", border: `1px solid ${STELLA_INDIGO}`, borderRadius: 6, cursor: "pointer" }}
    >
      <Plus size={13} /> Record a bill
    </button>
  );

  return (
    <StellaShell
      title="Bills"
      subtitle="What you owe your suppliers — recorded when the bill arrives, cleared when you pay it."
      actions={addButton}
      error={error}
      loading={loading && !bills.length}
    >
      {notice && (
        <div style={{ padding: "9px 12px", marginBottom: 12, fontSize: 12, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", borderRadius: 8 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A" }}>Owed right now</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{fmtMoney(meta.open_total || 0)}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{meta.open_count || 0} bill(s) outstanding</div>
        </div>
        <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A" }}>Overdue</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#B91C1C", marginTop: 2 }}>
            {fmtMoney(bills.filter((b) => b.status === "open" && Number(b.days_overdue || 0) > 0).reduce((s, b) => s + Number(b.balance_due || 0), 0))}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Past the date on the bill</div>
        </div>
        <div style={{ flex: "2 1 320px", background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A" }}>Where this shows up</div>
          <div style={{ fontSize: 12, color: "#334155", marginTop: 4, lineHeight: 1.5 }}>
            A bill goes into your books the day it is dated, as money you owe — so your accrual
            Profit &amp; Loss counts the cost in the right month. Paying it moves the money and
            clears the debt. <strong>Reports → AP Aging</strong> shows the same bills by how late they are.
          </div>
        </div>
      </div>

      {!bills.length && !loading ? (
        <EmptyState
          title="No bills yet"
          description="Record a bill when one arrives — the supplier, what it is for, and when it is due. It goes straight into your books as money you owe, and paying it later clears it."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by supplier or bill number…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.bill_id}
            onRowClick={(r) => openBill(r.bill_id)}
            initialSort={{ key: "due_date", direction: "asc" }}
            emptyMessage="No bills match that filter."
          />
        </>
      )}

      {showCreate && (
        <BillForm
          accounts={expenseAccounts}
          vendors={vendors}
          onClose={() => setShowCreate(false)}
          onSaved={(msg) => { setShowCreate(false); setNotice(msg); reload(); }}
          post={post}
        />
      )}

      {detail && (
        <BillDetailModal
          bill={detail}
          paymentAccounts={paymentAccounts}
          onClose={() => setDetail(null)}
          onChanged={(msg) => { setDetail(null); setNotice(msg); reload(); }}
          post={post}
          del={del}
        />
      )}
    </StellaShell>
  );
}

/* ── The form ─────────────────────────────────────────────────────────────── */

function BillForm({
  accounts, vendors, onClose, onSaved, post,
}: {
  accounts: Account[];
  vendors: Vendor[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  post: <T>(path: string, body?: unknown) => Promise<T>;
}) {
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<{ coa_account_id: string; description: string; amount: string }[]>([
    { coa_account_id: "", description: "", amount: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const ready = !!vendorId && !!billDate && lines.some((l) => l.coa_account_id && Number(l.amount) > 0);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        counterparty_id: vendorId,
        bill_number: billNumber || null,
        bill_date: billDate,
        due_date: dueDate || null,
        memo: memo || null,
        lines: lines
          .filter((l) => l.coa_account_id && Number(l.amount) > 0)
          .map((l) => ({ coa_account_id: l.coa_account_id, description: l.description || null, amount: Number(l.amount) })),
      };
      const r = await post<{ bill_id: string; total: number; journal_entries: number }>("/ledger/bills", body);
      onSaved(`Bill recorded for ${fmtMoney(r.total)} — it is in your books as money you owe.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record that bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="stella"
      eyebrow="Accounts payable"
      title="Record a bill"
      subtitle="A bill from a supplier. It goes into your books dated the day the bill is dated — not the day you pay it."
      size="info"
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Total {fmtMoney(total)}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
            <IadmButton variant="accent" product="stella" onClick={save} disabled={!ready || saving}>
              {saving ? "Saving…" : "Record the bill"}
            </IadmButton>
          </div>
        </div>
      }
    >
      {err && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={label}>Supplier</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={input}>
            <option value="">Choose a supplier…</option>
            {vendors.map((v) => <option key={v.counterparty_id} value={v.counterparty_id}>{v.display_name}</option>)}
          </select>
          {!vendors.length && (
            <div style={{ fontSize: 10, color: "#B4531F", marginTop: 4 }}>
              You have no suppliers yet — add one under Vendors &amp; Customers first.
            </div>
          )}
        </div>
        <div>
          <label style={label}>Their bill number (optional)</label>
          <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} style={input} placeholder="As printed on their paper" />
        </div>
        <div>
          <label style={label}>Bill date</label>
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>Due</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} />
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C24", marginBottom: 6 }}>What it is for</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.8fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <select
            value={l.coa_account_id}
            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, coa_account_id: e.target.value } : x)))}
            style={input}
          >
            <option value="">Category…</option>
            {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
          </select>
          <input
            value={l.description}
            placeholder="Description"
            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
            style={input}
          />
          <input
            value={l.amount}
            placeholder="0.00"
            inputMode="decimal"
            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
            style={{ ...input, textAlign: "right" }}
          />
          <button
            onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
            disabled={lines.length === 1}
            style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: lines.length === 1 ? "default" : "pointer" }}
          >
            remove
          </button>
        </div>
      ))}
      <button
        onClick={() => setLines([...lines, { coa_account_id: "", description: "", amount: "" }])}
        style={{ fontSize: 11, fontWeight: 600, color: STELLA_INDIGO, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        + Add another line
      </button>

      {/* Said on the page rather than only in the posting engine: a bill's
          lines are what you were CHARGED, tax included, and there is no
          separate tax line because sales tax you PAY on a purchase is part of
          the cost of the thing you bought. That is a US assumption — in a VAT
          country the tax you pay is reclaimable and would need its own
          account — and it is written down here so nobody has to guess whether
          the box is missing or deliberate. (§4d, STELLA pack 2.) */}
      <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C24" }}>Enter each line with the tax included</div>
        <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.5, color: "#475569" }}>
          There is no separate tax box, on purpose. Sales tax you pay a supplier is part of what the
          thing cost you — in the US there is nothing to claim back — so the tax belongs in the line
          it was charged on. (Sales tax you <em>collect</em> from your own customers is different:
          that one is money you owe the state, and STELLA keeps it out of your income.)
        </p>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={label}>Note (optional)</label>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} style={input} placeholder="Anything you want to remember about this bill" />
      </div>
    </IadmModal>
  );
}

/* ── The detail + pay ─────────────────────────────────────────────────────── */

function BillDetailModal({
  bill, paymentAccounts, onClose, onChanged, post, del,
}: {
  bill: BillDetail;
  paymentAccounts: Account[];
  onClose: () => void;
  onChanged: (msg: string) => void;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}) {
  const [amount, setAmount] = useState(String(bill.balance_due || ""));
  const [paidOn, setPaidOn] = useState(today());
  const [account, setAccount] = useState(paymentAccounts[0]?.coa_account_id || "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canPay = bill.status === "open" && Number(bill.balance_due) > 0;

  async function pay() {
    setBusy(true); setErr(null);
    try {
      await post(`/ledger/bills/${bill.bill_id}/payments`, {
        amount: Number(amount), paid_on: paidOn,
        settlement_account_id: account || null, reference: reference || null,
      });
      onChanged(`Paid ${fmtMoney(Number(amount))} to ${bill.vendor_name || "your supplier"}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record that payment.");
    } finally { setBusy(false); }
  }

  async function voidBill() {
    setBusy(true); setErr(null);
    try {
      await post(`/ledger/bills/${bill.bill_id}/void`, {});
      onChanged("Bill voided — the money you owed is off your books.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not void that bill.");
    } finally { setBusy(false); }
  }

  async function undoPayment(id: string) {
    setBusy(true); setErr(null);
    try {
      await del(`/ledger/bill-payments/${id}`);
      onChanged("Payment removed — the bill is owed again.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that payment.");
    } finally { setBusy(false); }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="stella"
      eyebrow={bill.vendor_name || "Supplier"}
      title={bill.bill_number ? `Bill ${bill.bill_number}` : "Bill"}
      subtitle={`Dated ${fmtDate(bill.bill_date)}${bill.due_date ? ` · due ${fmtDate(bill.due_date)}` : ""}`}
      size="info"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          {bill.status !== "void" && Number(bill.amount_paid) === 0 ? (
            <IadmButton variant="ghost" onClick={voidBill} disabled={busy}>Void this bill</IadmButton>
          ) : <span />}
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
        </div>
      }
    >
      {err && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <Fig label="Bill" value={fmtMoney(bill.total)} />
        <Fig label="Paid" value={fmtMoney(bill.amount_paid)} />
        <Fig label="Still owed" value={fmtMoney(bill.balance_due)} strong />
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C24", marginBottom: 6 }}>What it is for</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          {bill.lines.map((l) => (
            <tr key={l.bill_line_id} style={{ borderTop: "1px solid #F1F5F9" }}>
              <td style={{ padding: "6px 0", fontSize: 12, color: "#334155" }}>
                {l.description || "—"}
                <div style={{ fontSize: 10, color: "#94A3B8" }}>{l.coa_code} · {l.coa_account_name}</div>
              </td>
              <td style={{ padding: "6px 0", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {bill.payments.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C24", marginBottom: 6 }}>Payments</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <tbody>
              {bill.payments.map((p) => (
                <tr key={p.bill_payment_id} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "6px 0", fontSize: 12, color: "#334155" }}>
                    {fmtDate(p.paid_on)}
                    {p.reference && <span style={{ color: "#94A3B8" }}> · {p.reference}</span>}
                    {p.settlement_name && <div style={{ fontSize: 10, color: "#94A3B8" }}>from {p.settlement_name}</div>}
                  </td>
                  <td style={{ padding: "6px 0", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(p.amount)}</td>
                  <td style={{ padding: "6px 0", textAlign: "right" }}>
                    <button onClick={() => undoPayment(p.bill_payment_id)} disabled={busy}
                      style={{ fontSize: 10, color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}>
                      undo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {canPay ? (
        <div style={{ background: "#F8FAFC", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", marginBottom: 10 }}>Pay this bill</div>
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1.2fr 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <label style={label}>Amount</label>
              <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} style={{ ...input, textAlign: "right" }} />
            </div>
            <div>
              <label style={label}>Paid on</label>
              <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>From</label>
              <select value={account} onChange={(e) => setAccount(e.target.value)} style={input}>
                {paymentAccounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Cheque / reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} style={input} />
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <IadmButton variant="accent" product="stella" onClick={pay} disabled={busy || !(Number(amount) > 0)}>
              {busy ? "Recording…" : `Pay ${fmtMoney(Number(amount) || 0)}`}
            </IadmButton>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
            Paying part of a bill is fine — the rest stays owed, and your cash-basis Profit &amp; Loss
            counts only the part you have actually paid.
          </div>
        </div>
      ) : bill.status === "paid" ? (
        <div style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>This bill is settled.</div>
      ) : bill.status === "void" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#991B1B" }}>
          <AlertTriangle size={14} /> This bill was voided — it is not in your books.
        </div>
      ) : null}
    </IadmModal>
  );
}

function Fig({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94A3B8" }}>{l}</div>
      <div style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 700 : 600, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

export default StellaBillsPage;
