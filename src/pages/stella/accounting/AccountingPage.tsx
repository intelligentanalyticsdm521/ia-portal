// AccountingPage — Journal Entries · Bank Reconciliation · Audit Log.
//
// Three surfaces, one nav slot, three in-page tabs. The STELLA Ledger sub-nav
// has a hard 8-child cap with no headroom, and these are all "the bookkeeper's
// drawer" rather than daily-work pages, so they belong together.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { BankStatementImport } from "./BankStatementImport";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";

type Account = { coa_account_id: string; code: string; name: string; type: string };
type JLine = { coa_code: string; coa_account_name: string; debit: number; credit: number; memo: string | null };
type JEntry = {
  journal_entry_id: string; entry_date: string; source: string; basis: string;
  memo: string | null; is_adjusting: boolean; period_locked: boolean; total_debit: number; lines: JLine[];
};

export function StellaAccountingPage() {
  const [tab, setTab] = useState("journal");
  return (
    <StellaShell
      title="Accounting"
      subtitle="The bookkeeper's drawer — journal entries, bank reconciliation, and a record of who changed what."
    >
      <StellaTabs
        tabs={[
          { key: "journal", label: "Journal Entries" },
          { key: "reconcile", label: "Bank Reconciliation" },
          { key: "audit", label: "Audit Log" },
        ]}
        active={tab} onChange={setTab}
      />
      {tab === "journal" && <JournalTab />}
      {tab === "reconcile" && <ReconcileTab />}
      {tab === "audit" && <AuditTab />}
    </StellaShell>
  );
}

// ── Journal entries ─────────────────────────────────────────────────────────

function JournalTab() {
  const api = useStellaApi();
  const [entries, setEntries] = useState<JEntry[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: JEntry[] }>("/ledger/journal?limit=50").then((r) => setEntries(r.data)).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.get<Account[]>("/ledger/coa?active=true").then(setAccounts).catch(setError);
  }, [api]);

  async function post() {
    if (!api.ready) return;
    setBusy(true); setError(null);
    try {
      await api.post("/ledger/post", {});
      showNotice("Ledger rebuilt from your register.");
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(e: JEntry) {
    if (!window.confirm("Delete this journal entry?")) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/ledger/journal/${e.journal_entry_id}`);
      showNotice("Entry deleted.");
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />
      <DbCard
        title="Journal"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DbButton variant="ghost" onClick={post} disabled={busy} title="Re-derive journal entries from your transactions">
              Rebuild from register
            </DbButton>
            <DbButton onClick={() => setCreating(true)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> New entry</span>
            </DbButton>
          </div>
        }
      >
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
          Every entry behind your reports. Most are <strong>derived</strong> from transactions you already recorded —
          those change when the transaction changes. Entries you write by hand are marked <em>manual</em> or <em>adjusting</em>.
        </div>
        {!entries ? <DbLoading /> : entries.length === 0 ? (
          <DbEmpty title="No entries yet" reason="Record a transaction, or press “Rebuild from register”." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {entries.map((e) => (
              <div key={e.journal_entry_id} style={{ border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>
                    {String(e.entry_date).slice(0, 10)}
                  </span>
                  <Pill tone={e.source === "manual" || e.source === "adjusting" ? "warn" : "neutral"}>{e.source}</Pill>
                  <Pill tone={e.basis === "accrual" ? "brand" : "neutral"}>{e.basis}</Pill>
                  {e.is_adjusting && <Pill tone="warn">adjusting</Pill>}
                  {e.period_locked && <Pill tone="bad">locked</Pill>}
                  <span style={{ flex: 1, fontSize: 12, color: "#5A7A8A" }}>{e.memo || ""}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(e.total_debit)}</span>
                  {(e.source === "manual" || e.source === "adjusting") && !e.period_locked && (
                    <DbButton variant="danger" onClick={() => remove(e)} disabled={busy}><Trash2 size={12} /></DbButton>
                  )}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td style={{ padding: "3px 0", color: "#94A3B8", width: 60, fontFamily: "ui-monospace, monospace" }}>{l.coa_code}</td>
                        <td style={{ padding: "3px 0", color: "#334155" }}>{l.coa_account_name}</td>
                        <td style={{ padding: "3px 0", textAlign: "right", width: 100, fontVariantNumeric: "tabular-nums", color: l.debit ? "#0B1C24" : "#CBD5E1" }}>
                          {l.debit ? fmtMoney(l.debit) : "—"}
                        </td>
                        <td style={{ padding: "3px 0", textAlign: "right", width: 100, fontVariantNumeric: "tabular-nums", color: l.credit ? "#0B1C24" : "#CBD5E1" }}>
                          {l.credit ? fmtMoney(l.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </DbCard>
      {creating && (
        <NewEntryModal
          accounts={accounts}
          onClose={() => setCreating(false)}
          onDone={(msg) => { setCreating(false); showNotice(msg); load(); }}
        />
      )}
    </>
  );
}

function NewEntryModal({ accounts, onClose, onDone }: {
  accounts: Account[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [lines, setLines] = useState([
    { coa_account_id: "", debit: "", credit: "" },
    { coa_account_id: "", debit: "", credit: "" },
  ]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const debits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Number((debits - credits).toFixed(2));

  function set(i: number, k: string, v: string) {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      // A line is a debit OR a credit — typing in one clears the other, which
      // is also what the API enforces.
      if (k === "debit") return { ...l, debit: v, credit: v ? "" : l.credit };
      if (k === "credit") return { ...l, credit: v, debit: v ? "" : l.debit };
      return { ...l, [k]: v };
    }));
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post("/ledger/journal", {
        entry_date: date, memo: memo.trim() || null, is_adjusting: adjusting,
        lines: lines
          .filter((l) => l.coa_account_id && (Number(l.debit) || Number(l.credit)))
          .map((l) => ({
            coa_account_id: l.coa_account_id,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })),
      });
      onDone("Journal entry posted.");
    } catch (e) {
      const d = (e as { details?: string })?.details;
      setError(d ? { message: d } : e);
    } finally { setBusy(false); }
  }

  return (
    <DbModal title="New journal entry" onClose={onClose} width={680}>
      <DbError error={error} />
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginBottom: 14 }}>
        <DbField label="Date"><DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></DbField>
        <DbField label="Memo"><DbInput value={memo} maxLength={1000} placeholder="What is this entry for?" onChange={(e) => setMemo(e.target.value)} /></DbField>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontSize: 10, color: "#5A7A8A", padding: "4px 0" }}>ACCOUNT</th>
            <th style={{ textAlign: "right", fontSize: 10, color: "#5A7A8A", width: 120 }}>DEBIT</th>
            <th style={{ textAlign: "right", fontSize: 10, color: "#5A7A8A", width: 120 }}>CREDIT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: "3px 6px 3px 0" }}>
                <DbSelect value={l.coa_account_id} onChange={(e) => set(i, "coa_account_id", e.target.value)}>
                  <option value="">— pick an account —</option>
                  {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
                </DbSelect>
              </td>
              <td style={{ padding: "3px 3px" }}>
                <DbInput inputMode="decimal" value={l.debit} onChange={(e) => set(i, "debit", e.target.value)} style={{ textAlign: "right" }} />
              </td>
              <td style={{ padding: "3px 0 3px 3px" }}>
                <DbInput inputMode="decimal" value={l.credit} onChange={(e) => set(i, "credit", e.target.value)} style={{ textAlign: "right" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <DbButton variant="ghost" onClick={() => setLines((p) => [...p, { coa_account_id: "", debit: "", credit: "" }])}>
          Add line
        </DbButton>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#5A7A8A" }}>Debits {fmtMoney(debits)} · Credits {fmtMoney(credits)}</span>
        {diff === 0 && debits > 0
          ? <Pill tone="good">Balanced</Pill>
          : <Pill tone={debits || credits ? "bad" : "neutral"}>{diff === 0 ? "Empty" : `Out by ${fmtMoney(Math.abs(diff))}`}</Pill>}
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155", marginTop: 12 }}>
        <input type="checkbox" checked={adjusting} onChange={(e) => setAdjusting(e.target.checked)} />
        This is an adjusting entry
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {/* Disabled until it balances — the API refuses anyway; this just says so sooner. */}
        <DbButton onClick={submit} disabled={busy || diff !== 0 || debits === 0}>
          {busy ? "Posting…" : "Post entry"}
        </DbButton>
        <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
      </div>
    </DbModal>
  );
}

// ── Bank reconciliation ─────────────────────────────────────────────────────

type Rec = {
  bank_reconciliation_id: string; coa_account_id: string; coa_code: string; account_name: string;
  statement_start: string; statement_end: string; opening_balance: number; closing_balance: number;
  status: string; cleared_count: number;
};
type RecDetail = Rec & {
  lines: { transaction_id: string; entry_date: string; description: string | null; memo: string | null; net: number; is_cleared: boolean; counterparty_name: string | null }[];
  summary: { statement_movement: number; cleared_total: number; difference: number; reconciled: boolean; cleared_count: number; total_count: number };
};

function ReconcileTab() {
  const api = useStellaApi();
  const [list, setList] = useState<Rec[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Every account, not just the bank/card ones: booking a statement line the
  // books have never heard of needs a revenue or expense account to book it TO.
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ coa_account_id: "", statement_start: "", statement_end: "", opening_balance: "0", closing_balance: "" });

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<Rec[]>("/ledger/reconciliations").then(setList).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.get<Account[]>("/ledger/coa?active=true")
      .then((rows) => {
        setAllAccounts(rows);
        setAccounts(rows.filter((a) => ["asset", "liability"].includes(String(a.type).toLowerCase())));
      })
      .catch(setError);
  }, [api]);

  const loadDetail = useCallback(() => {
    if (!api.ready || !open) { setDetail(null); return; }
    api.get<RecDetail>(`/ledger/reconciliations/${open}`).then(setDetail).catch(setError);
  }, [api, open]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ bank_reconciliation_id: string }>("/ledger/reconciliations", {
        coa_account_id: form.coa_account_id,
        statement_start: form.statement_start, statement_end: form.statement_end,
        opening_balance: Number(form.opening_balance) || 0,
        closing_balance: Number(form.closing_balance),
      });
      setCreating(false); setOpen(r.bank_reconciliation_id); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function toggle(txnId: string, cleared: boolean) {
    if (!open) return;
    try {
      await api.patch(`/ledger/reconciliations/${open}/lines`, { transaction_id: txnId, is_cleared: cleared });
      loadDetail();
    } catch (e) { setError(e); }
  }

  async function abandon(r: Rec) {
    if (!window.confirm("Delete this reconciliation? Nothing in your ledger changes — only this worksheet goes.")) return;
    setBusy(true); setError(null);
    try { await api.del(`/ledger/reconciliations/${r.bank_reconciliation_id}`); showNotice("Reconciliation removed."); load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function complete() {
    if (!open) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ cleared_items: number }>(`/ledger/reconciliations/${open}/complete`, {});
      showNotice(`Reconciled — ${r.cleared_items} item${r.cleared_items === 1 ? "" : "s"} marked cleared.`);
      loadDetail(); load();
    } catch (e) {
      const d = (e as { details?: string })?.details;
      setError(d ? { message: d } : e);
    } finally { setBusy(false); }
  }

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />
      {!open ? (
        <DbCard
          title="Reconciliations"
          actions={<DbButton onClick={() => setCreating(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Start one</span>
          </DbButton>}
        >
          <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
            Tick off what cleared your bank statement. STELLA will not let you finish one that does not balance —
            a reconciliation you can close while it is out is a reconciliation that means nothing.
          </div>
          {!list ? <DbLoading /> : (
            <DbTable
              columns={[
                { key: "period", label: "Statement" },
                { key: "account_name", label: "Account" },
                { key: "closing_balance", label: "Closing", type: "decimal" },
                { key: "cleared_count", label: "Cleared", type: "int" },
                { key: "status", label: "Status" },
                { key: "action", label: "" },
              ]}
              rows={list.map((r) => ({
                ...r,
                period: `${String(r.statement_start).slice(0, 10)} → ${String(r.statement_end).slice(0, 10)}`,
                status: <Pill tone={r.status === "completed" ? "good" : "warn"}>{r.status.replace("_", " ")}</Pill>,
                // A completed reconciliation is history; only an unfinished one
                // can be thrown away.
                action: r.status === "completed" ? null : (
                  <DbButton variant="danger" disabled={busy}
                    onClick={(e) => { e.stopPropagation(); abandon(r); }}><Trash2 size={12} /></DbButton>
                ),
              })) as never}
              onRowClick={(r) => setOpen(String(r.bank_reconciliation_id))}
              empty={<DbEmpty title="No reconciliations yet" reason="Start one when your bank statement arrives." />}
            />
          )}
        </DbCard>
      ) : !detail ? <DbLoading /> : (
        <DbCard
          title={`${detail.account_name} · ${String(detail.statement_start).slice(0, 10)} → ${String(detail.statement_end).slice(0, 10)}`}
          actions={<DbButton variant="ghost" onClick={() => setOpen(null)}>Back</DbButton>}
        >
          <div style={{
            display: "flex", gap: 24, padding: "12px 14px", marginBottom: 14, borderRadius: 8,
            background: detail.summary.reconciled ? "#ECFDF3" : "#FFFAEB",
            border: `1px solid ${detail.summary.reconciled ? "#A6F4C5" : "#FEDF89"}`,
          }}>
            <Stat label="Statement movement" value={fmtMoney(detail.summary.statement_movement)} />
            <Stat label="Cleared so far" value={fmtMoney(detail.summary.cleared_total)} />
            <Stat label="Difference" value={fmtMoney(detail.summary.difference)} strong />
            <div style={{ flex: 1 }} />
            {detail.status === "completed" ? <Pill tone="good">Completed</Pill> : (
              <DbButton onClick={complete} disabled={busy || !detail.summary.reconciled}
                title={detail.summary.reconciled ? undefined : "There is still a difference to explain."}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={13} /> Finish</span>
              </DbButton>
            )}
          </div>
          <DbTable
            columns={[
              { key: "cleared", label: "" },
              { key: "entry_date", label: "Date", type: "date" },
              { key: "what", label: "Description" },
              { key: "net", label: "Amount", type: "decimal" },
            ]}
            rows={detail.lines.map((l) => ({
              ...l,
              cleared: <input type="checkbox" checked={l.is_cleared} disabled={detail.status === "completed"}
                onChange={(e) => toggle(l.transaction_id, e.target.checked)} />,
              what: l.description || l.memo || l.counterparty_name || "—",
            })) as never}
            empty={<DbEmpty title="Nothing in this window" reason="No transactions hit this account between those dates." />}
          />
          <div style={{ height: 20 }} />
          {/* Ops O-5 (b): the BANK’s side. Above is what your books say;
              this is what the statement says, and the difference between the
              two is the only thing a reconciliation is actually asking. */}
          <BankStatementImport
            reconciliationId={detail.bank_reconciliation_id}
            coaAccountId={detail.coa_account_id}
            accounts={allAccounts}
            onImported={loadDetail}
          />
        </DbCard>
      )}

      {creating && (
        <DbModal title="Start a reconciliation" onClose={() => setCreating(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Account">
              <DbSelect value={form.coa_account_id} onChange={(e) => setForm({ ...form, coa_account_id: e.target.value })}>
                <option value="">— pick a bank or card account —</option>
                {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
              </DbSelect>
            </DbField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="Statement from"><DbInput type="date" value={form.statement_start} onChange={(e) => setForm({ ...form, statement_start: e.target.value })} /></DbField>
              <DbField label="to"><DbInput type="date" value={form.statement_end} onChange={(e) => setForm({ ...form, statement_end: e.target.value })} /></DbField>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="Opening balance"><DbInput inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></DbField>
              <DbField label="Closing balance" hint="The number on your statement">
                <DbInput inputMode="decimal" value={form.closing_balance} onChange={(e) => setForm({ ...form, closing_balance: e.target.value })} />
              </DbField>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={create} disabled={busy || !form.coa_account_id || !form.statement_start || !form.statement_end || form.closing_balance === ""}>
                {busy ? "Starting…" : "Start"}
              </DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 14, fontWeight: 700, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────

type Audit = {
  audit_log_id: string; entity_table: string; entity_id: string; action: string;
  actor_label: string | null; created_at: string; changed: Record<string, { from: unknown; to: unknown }> | null;
};

function AuditTab() {
  const api = useStellaApi();
  const [rows, setRows] = useState<Audit[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState("");

  useEffect(() => {
    if (!api.ready) return;
    setRows(null);
    const qs = action ? `?action=${encodeURIComponent(action)}&limit=200` : "?limit=200";
    api.get<Audit[]>(`/ledger/audit-log${qs}`).then(setRows).catch(setError);
  }, [api, action]);

  return (
    <DbCard
      title="Audit log"
      actions={
        <div style={{ width: 180 }}>
          <DbSelect value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All activity</option>
            {["create", "update", "delete", "post", "close", "reopen", "reconcile"].map((a) => <option key={a} value={a}>{a}</option>)}
          </DbSelect>
        </div>
      }
    >
      <DbError error={error} />
      <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
        Who changed what, and what it changed from. This is what makes a closed period defensible rather than merely locked.
      </div>
      {!rows ? <DbLoading /> : (
        <DbTable
          columns={[
            { key: "created_at", label: "When", type: "datetime" },
            { key: "who", label: "Who" },
            { key: "act", label: "Action" },
            { key: "what", label: "What" },
            { key: "detail", label: "Changed" },
          ]}
          rows={rows.map((r) => ({
            ...r,
            who: r.actor_label || "—",
            act: <Pill tone={r.action === "delete" ? "bad" : r.action === "close" || r.action === "reconcile" ? "good" : "neutral"}>{r.action}</Pill>,
            what: <code style={{ fontSize: 10, color: "#64748B" }}>{r.entity_table.replace("stella.", "")}</code>,
            // Each field gets its own chip. Inline spans ran together into
            // "amount 24.99posted_date 2026-08-13", which is unreadable at a
            // glance — and glanceability is the entire point of an audit log.
            detail: r.changed
              ? <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, whiteSpace: "normal", maxWidth: 420 }}>
                  {Object.entries(r.changed).map(([k, v]) => (
                    <span key={k} style={{
                      background: "#F1F5F9", borderRadius: 5, padding: "2px 7px",
                      fontSize: 10, color: "#475569", lineHeight: 1.5,
                    }}>
                      <strong style={{ color: "#334155" }}>{k}</strong>{" "}
                      {v && typeof v === "object" && "from" in v
                        ? <>{String(v.from ?? "—")} <span style={{ color: "#94A3B8" }}>→</span> {String(v.to ?? "—")}</>
                        : String(v ?? "—")}
                    </span>
                  ))}
                </span>
              : null,
          })) as never}
          empty={<DbEmpty title="No activity recorded" reason="Changes to your books will be listed here as they happen." />}
        />
      )}
    </DbCard>
  );
}
