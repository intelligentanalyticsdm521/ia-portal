// TransactionDetailModal — row-click detail for Ledger transactions.
//
// Founder edict: all detail opens in the IadmModal standard — this calls
// IadmModal directly with the semantic "info" size (1200 × 80vh fixed canvas,
// the OLIVER CustomerModal pattern; see IadmModal docblock) with the STELLA
// product accent. Used by StellaTransactionsPage and StellaLedgerInboxPage.
//
// Editable: account (COA select), memo, date, reimbursable designation, and
// (2026-08-13 Unit Economics build) the JOB tag — an optional, clearable
// select over OLIVER's jobs (fetched once per open via useOliverApi; options
// show "job_number — title"). Tagged expenses become DIRECT job costs in the
// allocation engine; untagged overhead spreads by revenue share.
// Actions: Mark reimbursed (PATCH reimbursed_at=now), Void (confirm() then
// PATCH status:'void'), "This is a personal expense" on expense rows (confirm()
// then PATCH status:'personal' — excluded from every report/total; personal
// rows lock like void and offer "Add back to business books" → 'categorized'),
// Save (PATCH the edited fields). The caller reloads its list when
// onClose(changed=true) fires.
import { useEffect, useRef, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import { jobOptionLabel, type CoaAccount, type JobLite } from "./RecordTransactionModal";
// STELLA pack 1, item 9 — split an existing register line (this modal is also
// what the Inbox opens, so splitting works from the review queue too).
import { SplitEditor, emptySplit, splitsReady, splitsForApi, type SplitLine } from "./SplitEditor";

/** Minimal row shape the modal needs — Transactions rows satisfy it directly;
 *  Inbox items are mapped into it by the caller. */
export interface DetailTxn {
  transaction_id: string;
  posted_date: string | null;
  counterparty_name?: string | null;
  description?: string | null;
  memo?: string | null;
  amount_signed: number | string;
  coa_account_id?: string | null;
  status?: string | null;
  raw_source?: string | null;
  is_reimbursable?: boolean | number | null;
  reimbursed_at?: string | null;
  job_id?: string | null;
  job_number?: string | null;
  job_title?: string | null;
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  categorized: { bg: "#D1FAE5", color: "#047857" },
  needs_categorization: { bg: "#FEF3C7", color: "#92400E" },
  flagged: { bg: "#FEE2E2", color: "#991B1B" },
  reconciled: { bg: "#E0E7FF", color: "#3730A3" },
  void: { bg: "#F1F5F9", color: "#64748B" },
  // Personal (migration 157) — excluded from the books entirely; slate pill.
  personal: { bg: "#F1F5F9", color: "#475569" },
};

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

export function TransactionDetailModal({
  txn,
  coa,
  onClose,
}: {
  txn: DetailTxn;
  /** Optional pre-fetched COA (Transactions passes its own); fetched when omitted. */
  coa?: CoaAccount[];
  onClose: (changed: boolean) => void;
}) {
  const { get, patch, del, ready } = useStellaApi();
  const oliver = useOliverApi();

  // COA for the account select — caller's list when given, else one fetch on open.
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

  // OLIVER jobs for the Job tag select — one fetch per open. null = failed /
  // not loaded; the select then falls back to the row's own job echo so an
  // existing tag never disappears from view.
  const [jobs, setJobs] = useState<JobLite[] | null>(null);
  useEffect(() => {
    if (!oliver.ready) return;
    let cancelled = false;
    oliver.get<JobLite[]>("/jobs?per_page=100")
      .then((rows) => { if (!cancelled) setJobs(rows || []); })
      .catch(() => { if (!cancelled) setJobs(null); });
    return () => { cancelled = true; };
    // oliver has a stable identity (useMemo in the hook) — this runs once per open.
  }, [oliver]);

  // Editable state, seeded from the row.
  const [coaAccountId, setCoaAccountId] = useState(txn.coa_account_id || "");
  const [jobId, setJobId] = useState(txn.job_id || "");
  const [memo, setMemo] = useState(txn.memo || "");
  const [postedDate, setPostedDate] = useState(() => (txn.posted_date ? String(txn.posted_date).slice(0, 10) : ""));
  const [isReimbursable, setIsReimbursable] = useState(!!txn.is_reimbursable);
  const [reimbursedAt, setReimbursedAt] = useState<string | null>(txn.reimbursed_at || null);
  // Walkthrough finding (Brandon, 2026-08-13): Mark reimbursed saves instantly
  // via PATCH, but the modal never SAID so — a disabled "Save changes" button
  // afterwards read as "can't save". This note makes instant saves explicit.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [status, setStatus] = useState(txn.status || "needs_categorization");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Track "did anything PATCH" so backdrop/Esc close still reloads the list.
  const changedRef = useRef(false);

  // Splits (pack 1, item 9). Loaded from the row's own detail endpoint, which
  // returns them with the transaction — a second round trip here is how a
  // three-category charge ends up displayed as one category.
  const [splitting, setSplitting] = useState(false);
  const [splits, setSplits] = useState<SplitLine[]>([emptySplit(), emptySplit()]);
  const [loadedSplitCount, setLoadedSplitCount] = useState(0);
  // What the splits were when they arrived, so "dirty" means CHANGED and not
  // merely "a split exists". Without it the Save button is lit on every open of
  // an already-split row.
  const initialSplitsJson = useRef("[]");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<{ splits?: { coa_account_id: string; amount: number; job_id: string | null; memo: string | null }[] }>(
      `/ledger/transactions/${txn.transaction_id}`,
    )
      .then((r) => {
        if (cancelled) return;
        const rows = r?.splits || [];
        setLoadedSplitCount(rows.length);
        if (rows.length >= 2) {
          const mapped = rows.map((x) => ({
            coa_account_id: x.coa_account_id,
            amount: String(Number(x.amount)),
            job_id: x.job_id || "",
            memo: x.memo || "",
          }));
          setSplits(mapped);
          initialSplitsJson.current = JSON.stringify(splitsForApi(mapped));
          setSplitting(true);
        }
      })
      .catch(() => { /* the modal still works without the split detail */ });
    return () => { cancelled = true; };
  }, [get, ready, txn.transaction_id]);

  const amount = toNum(txn.amount_signed);
  const isExpense = amount < 0;
  const isVoid = status === "void";
  // Personal (Brandon's walkthrough, 2026-08-13): the expense is excluded from
  // the business books entirely — fields lock like void, but an "Add back to
  // business books" action reverses it.
  const isPersonal = status === "personal";
  const locked = isVoid || isPersonal;
  // Splitting counts as a change even when no other field moved: it changes what
  // the journal says about this charge.
  const splitDirty = splitting !== loadedSplitCount >= 2
    || (splitting && JSON.stringify(splitsForApi(splits)) !== initialSplitsJson.current);
  const dirty =
    coaAccountId !== (txn.coa_account_id || "") ||
    jobId !== (txn.job_id || "") ||
    memo !== (txn.memo || "") ||
    postedDate !== (txn.posted_date ? String(txn.posted_date).slice(0, 10) : "") ||
    isReimbursable !== !!txn.is_reimbursable ||
    splitDirty;
  // Save is refused while a split does not add up, rather than sending it and
  // letting the database refuse — the person needs to see WHICH number is wrong.
  const saveBlocked = splitting && !splitsReady(splits, amount);

  const close = () => onClose(changedRef.current);

  async function save() {
    setBusy("save");
    setErr(null);
    try {
      const apiSplits = splitting ? splitsForApi(splits) : [];
      // The register row's account follows the largest split, so the list never
      // shows a blank category for a fully split charge. An empty array UN-splits.
      const primary = apiSplits.length
        ? apiSplits.slice().sort((a, b) => b.amount - a.amount)[0].coa_account_id
        : coaAccountId || null;
      await patch(`/ledger/transactions/${txn.transaction_id}`, {
        coa_account_id: primary,
        job_id: jobId || null,
        memo: memo.trim() || null,
        posted_date: postedDate || null,
        is_reimbursable: isReimbursable,
        // Sent whenever the split state changed at all — including [] to clear.
        ...(splitDirty ? { splits: apiSplits } : {}),
      });
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function markReimbursed() {
    setBusy("reimburse");
    setErr(null);
    try {
      const now = new Date().toISOString();
      // Include is_reimbursable so marking works even when the designation was
      // just toggled in this modal and not separately saved yet.
      await patch(`/ledger/transactions/${txn.transaction_id}`, { is_reimbursable: true, reimbursed_at: now });
      setReimbursedAt(now);
      setSavedNote("Marked reimbursed and saved — it no longer counts toward Owed to you.");
      changedRef.current = true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark this reimbursed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undoReimbursed() {
    setBusy("reimburse");
    setErr(null);
    try {
      await patch(`/ledger/transactions/${txn.transaction_id}`, { reimbursed_at: null });
      setReimbursedAt(null);
      setSavedNote("Reimbursement reopened and saved — it counts toward Owed to you again.");
      changedRef.current = true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the reimbursement. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function markPersonal() {
    if (!confirm("Exclude this from your business books? It stays on the bank record but leaves every report and total.")) return;
    setBusy("personal");
    setErr(null);
    try {
      await patch(`/ledger/transactions/${txn.transaction_id}`, { status: "personal" });
      setStatus("personal");
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark this personal. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function addBackToBooks() {
    setBusy("personal");
    setErr(null);
    try {
      // Verify finding: a personal row with NO account must go back to the
      // Inbox review queue, not straight to 'categorized' — otherwise it sits
      // account-less forever with nothing prompting categorization.
      const target = coaAccountId ? "categorized" : "needs_categorization";
      await patch(`/ledger/transactions/${txn.transaction_id}`, { status: target });
      setStatus(target);
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add this back. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function voidTxn() {
    if (!confirm("Void this transaction? It stays in the ledger for audit but drops out of every report.")) return;
    setBusy("void");
    setErr(null);
    try {
      await patch(`/ledger/transactions/${txn.transaction_id}`, { status: "void" });
      setStatus("void");
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Void failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // Delete is MANUAL-entries only (Brandon 2026-08-14: a test expense marked
  // reimbursed is bad accounting — it should be deletable). Imported rows keep
  // Void/Personal: deleting a bank/OLIVER row would just re-import on sync.
  const isDeletable = txn.raw_source === "manual" || txn.raw_source === "recurring_template";
  async function deleteTxn() {
    if (!confirm("Delete this manual entry permanently? Unlike Void, it leaves no trace in the ledger. Use this for test entries and mistakes that never really happened.")) return;
    setBusy("delete");
    setErr(null);
    try {
      await del(`/ledger/transactions/${txn.transaction_id}`);
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const pill = STATUS_PILL[status] || STATUS_PILL.needs_categorization;
  const optionFor = (a: CoaAccount) => (
    <option key={a.coa_account_id} value={a.coa_account_id}>
      {a.code ? `${a.code} — ${a.name}` : a.name}
    </option>
  );
  const activeAccounts = accounts.filter((a) => a.is_active !== false && a.is_active !== 0);

  return (
    <IadmModal
      open
      onClose={close}
      product="stella"
      size="info"
      title={txn.counterparty_name || txn.description || "Transaction"}
      subtitle={`${fmtDate(txn.posted_date)} · ${amount >= 0 ? "+" : "−"}${fmtMoney(Math.abs(amount))}`}
      footer={
        <>
          {!isVoid && !isPersonal && (
            <span style={{ display: "inline-flex", gap: 8, marginRight: "auto" }}>
              {isDeletable && (
                <button
                  type="button"
                  onClick={deleteTxn}
                  disabled={busy != null}
                  title="Manual entry — safe to delete permanently (test entries, mistakes)"
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#B91C1C", color: "#fff", border: "1px solid #B91C1C" }}
                >
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
              )}
              <button
                type="button"
                onClick={voidTxn}
                disabled={busy != null}
                title={isDeletable ? "Keep the row for audit but drop it from every report" : "Imported rows can't be deleted (they'd re-import on the next sync) — Void keeps the record and drops it from every report"}
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: "#fff", color: "#B91C1C", border: "1px solid #FECACA" }}
              >
                {busy === "void" ? "Voiding…" : "Void"}
              </button>
              {isExpense && (
                <button
                  type="button"
                  onClick={markPersonal}
                  disabled={busy != null}
                  title="Exclude this expense from your business books — it stays on the bank record but leaves every report and total"
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#fff", color: "#475569", border: "1px solid #CBD5E1" }}
                >
                  {busy === "personal" ? "Updating…" : "This is a personal expense"}
                </button>
              )}
            </span>
          )}
          {isPersonal && (
            <button
              type="button"
              onClick={addBackToBooks}
              disabled={busy != null}
              title="Bring this expense back into your business books and reports"
              className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: "#fff", color: STELLA_INDIGO, border: `1px solid ${STELLA_INDIGO}55`, marginRight: "auto" }}
            >
              {busy === "personal" ? "Updating…" : "Add back to business books"}
            </button>
          )}
          <IadmButton variant="primary" onClick={close} disabled={busy != null}>Close</IadmButton>
          {/* The reason Save is off is TEXT beside the button, not a tooltip: a
              tooltip on a disabled button often never fires, and "greyed out
              with no explanation" is the complaint that follows. */}
          {saveBlocked && (
            <span style={{ fontSize: 11, color: "#B91C1C", alignSelf: "center", marginRight: 4 }}>
              The split lines have to add up to the charge.
            </span>
          )}
          <IadmButton
            variant="accent" product="stella" onClick={save}
            disabled={busy != null || !dirty || locked || saveBlocked}
          >
            {busy === "save" ? "Saving…" : saveBlocked ? "Split does not add up" : !dirty && savedNote ? "Saved ✓" : "Save changes"}
          </IadmButton>
        </>
      }
    >
      <div style={{ padding: "20px 24px", display: "grid", gap: 16, maxWidth: 720 }}>
        {/* Headline strip — amount + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: amount >= 0 ? "#047857" : "#0B1C24" }}>
            {amount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(amount))}
          </div>
          <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 99, background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600 }}>
            {status.replace(/_/g, " ")}
          </span>
        </div>

        {/* Fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={fLabel}>Counterparty</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24", padding: "7px 0" }}>
              {txn.counterparty_name || txn.description || "—"}
            </div>
          </div>
          <label>
            <span style={fLabel}>Date</span>
            <input type="date" style={fInput} value={postedDate} onChange={(e) => setPostedDate(e.target.value)} disabled={locked} />
          </label>
          <label>
            <span style={fLabel}>Account</span>
            <select style={fInput} value={coaAccountId} onChange={(e) => setCoaAccountId(e.target.value)} disabled={locked || splitting}>
              <option value="">Uncategorized</option>
              {activeAccounts.map(optionFor)}
            </select>
            {splitting && (
              <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 3, lineHeight: 1.4 }}>
                This charge is split — the accounts are on the split lines below.
              </span>
            )}
          </label>
          <div>
            <div style={fLabel}>Source</div>
            <div style={{ fontSize: 12, color: "#5A7A8A", padding: "7px 0", textTransform: "capitalize" }}>
              {(txn.raw_source || "manual").replace(/_/g, " ")}
            </div>
          </div>
          <label>
            <span style={fLabel}>Job (for margins)</span>
            <select style={fInput} value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={locked}>
              <option value="">No job</option>
              {/* Keep an existing tag visible even when the jobs fetch failed
                  or the job fell outside the first page. */}
              {jobId && !(jobs || []).some((j) => j.id === jobId) && (
                <option value={jobId}>
                  {txn.job_number ? `${txn.job_number} — ${txn.job_title || "Tagged job"}` : txn.job_title || "Tagged job"}
                </option>
              )}
              {(jobs || []).map((j) => (
                <option key={j.id} value={j.id}>{jobOptionLabel(j)}</option>
              ))}
            </select>
            <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 3, lineHeight: 1.4 }}>
              Tagged expenses count as direct job cost in Unit Economics margins.
            </span>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            data-tour="stella-detail-split"
            disabled={locked}
            onClick={() => {
              if (!splitting) {
                // Seed line one with the account and amount already on the row,
                // so the first thing to type is the SECOND category.
                setSplits([
                  { coa_account_id: coaAccountId, amount: String(Math.abs(amount)), job_id: jobId, memo: "" },
                  { coa_account_id: "", amount: "", job_id: "", memo: "" },
                ]);
              }
              setSplitting(!splitting);
            }}
            style={{
              padding: "5px 9px", fontSize: 11, fontWeight: 600,
              color: locked ? "#94A3B8" : STELLA_INDIGO, background: "#fff",
              border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6,
              cursor: locked ? "not-allowed" : "pointer",
            }}
          >
            {splitting ? "Use one account instead" : "Split across accounts"}
          </button>
          <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 4, lineHeight: 1.4 }}>
            One charge, several accounts. It stays one line on your register, so it still matches your statement.
          </span>
        </div>
        {splitting && (
          <div style={{ marginBottom: 12 }}>
            <SplitEditor
              lines={splits}
              onChange={setSplits}
              target={amount}
              accounts={accounts}
              jobs={jobs || []}
              disabled={locked || busy != null}
            />
          </div>
        )}
        <label>
          <span style={fLabel}>Memo</span>
          <textarea rows={2} style={{ ...fInput, resize: "vertical" }} placeholder="Optional note" value={memo} onChange={(e) => setMemo(e.target.value)} disabled={locked} />
        </label>

        {/* Reimbursement — expense rows only */}
        {isExpense && !locked && (
          <div
            data-tour="stella-reimburse-box"
            style={{
              border: `1px solid ${isReimbursable ? STELLA_INDIGO : STELLA_LAVENDER}`,
              background: isReimbursable ? "#EEF0FB" : "#fff",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", flex: 1, minWidth: 240 }}>
              <input
                type="checkbox"
                checked={isReimbursable}
                onChange={(e) => { setIsReimbursable(e.target.checked); setSavedNote(null); }}
                style={{ marginTop: 2 }}
                disabled={!!reimbursedAt}
              />
              <span>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>Needs reimbursement</span>
                <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginTop: 2, lineHeight: 1.45 }}>
                  {reimbursedAt
                    ? `Reimbursed ${fmtDate(reimbursedAt)}. Saved automatically — no need to press Save.`
                    : isReimbursable
                      ? "Paid personally — counts toward the Owed to you total until marked reimbursed. Mark reimbursed saves instantly."
                      : "Turn on if this was paid with a personal card or cash."}
                </span>
              </span>
            </label>
            {isReimbursable && (
              reimbursedAt ? (
                <button type="button" onClick={undoReimbursed} disabled={busy != null} style={ghostBtn}>
                  {busy === "reimburse" ? "Updating…" : "Undo reimbursed"}
                </button>
              ) : (
                <button
                  type="button"
                  data-tour="stella-mark-reimbursed"
                  onClick={markReimbursed}
                  disabled={busy != null}
                  style={{ ...ghostBtn, background: STELLA_INDIGO, color: "#fff", border: `1px solid ${STELLA_INDIGO}` }}
                >
                  {busy === "reimburse" ? "Updating…" : "Mark reimbursed"}
                </button>
              )
            )}
          </div>
        )}

        {savedNote && !err && (
          <div style={{ padding: 10, fontSize: 12, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 6 }}>
            ✓ {savedNote}
          </div>
        )}
        {err && (
          <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
            {err}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

const fLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 };
const fInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid #E8E9FA", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const ghostBtn: React.CSSProperties = { padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #E8E9FA", background: "#fff", color: "#0B1C24", cursor: "pointer" };
