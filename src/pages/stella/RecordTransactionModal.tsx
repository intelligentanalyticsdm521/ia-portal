// RecordTransactionModal — the shared "Record income / Record expense" modal.
//
// Extracted from StellaTransactionsPage (2026-07-30) so the shell-level
// "+ Record" split-menu button (StellaShell showRecord) and the Transactions
// page share ONE modal. POSTs /ledger/transactions. Expense entries carry the
// "Paid personally — needs reimbursement" checkbox, posting is_reimbursable —
// those rows surface in the Overview "Owed to you" KPI and the Transactions
// Reimbursable filter.
//
// COA: pass the page's already-fetched chart of accounts via the `coa` prop
// (Transactions does — one fetch per page); when omitted the modal fetches
// /ledger/coa itself on open (a user-action fetch, not a page fetch).
//
// NOTE — import hygiene: StellaShell imports this module (for the showRecord
// button), and this module imports helpers from StellaShell. That cycle is
// safe ONLY because nothing here reads StellaShell exports at module-eval
// time — the style consts below use literal colors, and fmtMoney/STELLA_*
// are referenced inside render functions only. Keep it that way.
import { useEffect, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Button } from "../../components/oliver/ui";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

export interface CoaAccount {
  coa_account_id: string;
  code: string | null;
  name: string;
  type: string | null; // asset | liability | equity | revenue | expense
  is_active: boolean | number | null;
}

/** OLIVER GET /jobs list item — the fields the Job tag select needs. Shared
 *  with TransactionDetailModal (which already imports from this module). */
export interface JobLite {
  id: string;
  jobNumber?: string | null;
  title: string | null;
  status?: string | null;
}

export function jobOptionLabel(j: JobLite): string {
  return j.jobNumber ? `${j.jobNumber} — ${j.title || "Untitled job"}` : j.title || "Untitled job";
}

export function RecordTransactionModal({
  direction,
  coa,
  onClose,
  onCreated,
}: {
  direction: "inflow" | "outflow";
  /** Optional pre-fetched chart of accounts; fetched on open when omitted. */
  coa?: CoaAccount[];
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const { get, post, ready } = useStellaApi();
  const oliver = useOliverApi();
  const isIncome = direction === "inflow";

  // COA — use the caller's list when given, otherwise fetch once on open.
  const [fetchedCoa, setFetchedCoa] = useState<CoaAccount[] | null>(null);
  useEffect(() => {
    if (coa || !ready) return;
    let cancelled = false;
    get<CoaAccount[]>("/ledger/coa")
      .then((rows) => { if (!cancelled) setFetchedCoa(rows || []); })
      .catch(() => { if (!cancelled) setFetchedCoa([]); });
    return () => { cancelled = true; };
  }, [coa, get, ready]);
  const accounts = coa ?? fetchedCoa ?? [];

  // OLIVER jobs for the optional Job tag — one fetch per open (user-action
  // fetch, not a page fetch). Soft-fails to an empty list: recording must
  // never block on the jobs endpoint.
  const [jobs, setJobs] = useState<JobLite[]>([]);
  useEffect(() => {
    if (!oliver.ready) return;
    let cancelled = false;
    oliver.get<JobLite[]>("/jobs?per_page=100")
      .then((rows) => { if (!cancelled) setJobs(rows || []); })
      .catch(() => { if (!cancelled) setJobs([]); });
    return () => { cancelled = true; };
  }, [oliver]);

  // Income posts to revenue accounts, expenses to expense accounts — but keep
  // the full COA reachable under an "Other accounts" group for edge cases.
  const preferredType = isIncome ? "revenue" : "expense";
  const preferred = accounts.filter((a) => a.type === preferredType && a.is_active !== false && a.is_active !== 0);
  const others = accounts.filter((a) => a.type !== preferredType && a.is_active !== false && a.is_active !== 0);

  const [counterparty, setCounterparty] = useState("");
  const [coaAccountId, setCoaAccountId] = useState("");
  const [jobId, setJobId] = useState("");
  const [amount, setAmount] = useState("");
  const [postedDate, setPostedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(amount);
  const valid = counterparty.trim().length > 0 && coaAccountId && Number.isFinite(amountNum) && amountNum > 0 && !!postedDate;

  async function submit() {
    if (!valid) return;
    setErr(null);
    setSaving(true);
    try {
      await post("/ledger/transactions", {
        direction,
        coa_account_id: coaAccountId,
        counterparty_name: counterparty.trim(),
        amount: amountNum,
        posted_date: postedDate,
        memo: memo.trim() || null,
        is_reimbursable: !isIncome && reimbursable,
        job_id: jobId || null,
      });
      onCreated(`Recorded ${isIncome ? "income" : "expense"} of ${fmtMoney(amountNum)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record the transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const optionFor = (a: CoaAccount) => (
    <option key={a.coa_account_id} value={a.coa_account_id}>
      {a.code ? `${a.code} — ${a.name}` : a.name}
    </option>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${STELLA_LAVENDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>
            {isIncome ? "Record income" : "Record expense"}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label>
            <span style={mLabel}>{isIncome ? "Customer" : "Vendor"}</span>
            <input
              style={mInput}
              placeholder={isIncome ? "e.g. Johnson Residence" : "e.g. Home Depot"}
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span style={mLabel}>Account</span>
            <select style={mInput} value={coaAccountId} onChange={(e) => setCoaAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {preferred.length > 0 && <optgroup label={isIncome ? "Revenue" : "Expenses"}>{preferred.map(optionFor)}</optgroup>}
              {others.length > 0 && <optgroup label="Other accounts">{others.map(optionFor)}</optgroup>}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <span style={mLabel}>Amount</span>
              <input type="number" min="0.01" step="0.01" style={mInput} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              <span style={mLabel}>Date</span>
              <input type="date" style={mInput} value={postedDate} onChange={(e) => setPostedDate(e.target.value)} />
            </label>
          </div>
          <label>
            <span style={mLabel}>Job (optional)</span>
            <select style={mInput} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{jobOptionLabel(j)}</option>
              ))}
            </select>
            <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 3, lineHeight: 1.4 }}>
              Tagging ties this line to a job — expenses count as direct job cost in Unit Economics margins.
            </span>
          </label>
          <label>
            <span style={mLabel}>Memo</span>
            <textarea rows={2} style={{ ...mInput, resize: "vertical" }} placeholder="Optional note" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          {!isIncome && (
            <label
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
                border: `1px solid ${reimbursable ? STELLA_INDIGO : STELLA_LAVENDER}`,
                background: reimbursable ? "#EEF0FB" : "#fff",
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={reimbursable}
                onChange={(e) => setReimbursable(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
                  Paid personally — needs reimbursement
                </span>
                <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginTop: 2, lineHeight: 1.45 }}>
                  Paid with a personal card or cash. STELLA tracks it under "Owed to you" until you mark it reimbursed.
                </span>
              </span>
            </label>
          )}
          <button
            disabled
            title="Receipt OCR lands in the Ingestion phase"
            style={{ ...mInput, textAlign: "left", color: "#94A3B8", background: "#F8FAFC", cursor: "not-allowed", border: "1px dashed #E8E9FA" }}
          >
            Attach receipt (OCR lands in the Ingestion phase)
          </button>
          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={submit} disabled={saving || !valid}>
              {saving ? "Saving…" : isIncome ? "Record income" : "Record expense"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Literal colors on purpose — see the import-hygiene note in the docblock.
const mLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const mInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid #E8E9FA", borderRadius: 6, background: "#fff", color: "#0B1C24" };
