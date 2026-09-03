// PeriodClosePage — replaces the "P5" scaffold in StellaLedgerShellPages.
//
// Closing a month locks every entry and transaction dated inside it. The
// correct way to fix something afterwards is an adjusting entry, not an edit —
// which is precisely why the lock exists and why reopening is deliberate,
// audited, and never silent.
import { useCallback, useEffect, useState } from "react";
import { Lock, Unlock, ShieldCheck, AlertTriangle } from "lucide-react";
import { StellaShell, fmtMoney } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";

type Period = {
  accounting_period_id: string; period_start: string; period_end: string;
  status: string; closed_at: string | null; notes: string | null;
};

function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: end.toISOString().slice(0, 10) };
}

export function StellaPeriodClosePage() {
  const api = useStellaApi();
  const [rows, setRows] = useState<Period[] | null>(null);
  const [tb, setTb] = useState<{ debit: number; credit: number; balanced: boolean; difference: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => { const m = lastMonth(); return { period_start: m.start, period_end: m.end, notes: "" }; });

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<Period[]>("/ledger/periods").then(setRows).catch(setError);
    api.get<{ totals: typeof tb }>("/ledger/trial-balance?basis=cash").then((r) => setTb(r.totals)).catch(() => setTb(null));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function close() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ entries_locked: number; transactions_locked: number }>("/ledger/periods/close", {
        period_start: form.period_start, period_end: form.period_end, notes: form.notes.trim() || null,
      });
      showNotice(`Closed — ${r.entries_locked} entries and ${r.transactions_locked} transactions locked.`);
      setClosing(false); load();
    } catch (e) {
      const d = (e as { details?: string })?.details;
      setError(d ? { message: d } : e);
    } finally { setBusy(false); }
  }

  async function reopen(p: Period) {
    if (!window.confirm(
      `Reopen ${String(p.period_start).slice(0, 10)} → ${String(p.period_end).slice(0, 10)}?\n\n` +
      `Everything in it becomes editable again. This is recorded in the audit log.`
    )) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/ledger/periods/${p.accounting_period_id}/reopen`, {});
      showNotice("Period reopened.");
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <StellaShell
      title="Period Close"
      subtitle="Close a month so the books stop moving — and keep a record of when, by whom, and why."
      actions={<DbButton onClick={() => setClosing(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Lock size={13} /> Close a period</span>
      </DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      {tb && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, padding: "11px 13px", borderRadius: 8,
          background: tb.balanced ? "#ECFDF3" : "#FEF3F2",
          border: `1px solid ${tb.balanced ? "#A6F4C5" : "#FDA29B"}`,
        }}>
          {tb.balanced
            ? <ShieldCheck size={15} color="#027A48" style={{ flexShrink: 0, marginTop: 1 }} />
            : <AlertTriangle size={15} color="#B42318" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ fontSize: 11, color: tb.balanced ? "#027A48" : "#B42318", lineHeight: 1.5 }}>
            {tb.balanced
              ? <>Your ledger balances — debits {fmtMoney(tb.debit)} equal credits {fmtMoney(tb.credit)}. Safe to close.</>
              : <>Your ledger is out by {fmtMoney(Math.abs(tb.difference))}. STELLA will refuse to close a period over an
                 unbalanced ledger — closing would freeze the mistake in place. Check the Trial Balance first.</>}
          </div>
        </div>
      )}

      <DbCard title="Closed periods">
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "period", label: "Period" },
              { key: "state", label: "Status" },
              { key: "closed_at", label: "Closed", type: "datetime" },
              { key: "notes", label: "Notes" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((p) => ({
              ...p,
              period: `${String(p.period_start).slice(0, 10)} → ${String(p.period_end).slice(0, 10)}`,
              state: p.status === "closed" ? <Pill tone="good">closed</Pill> : <Pill tone="warn">open</Pill>,
              action: p.status === "closed"
                ? <DbButton variant="ghost" onClick={() => reopen(p)} disabled={busy}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Unlock size={12} /> Reopen</span>
                  </DbButton>
                : null,
            })) as never}
            empty={<DbEmpty
              title="No periods closed yet"
              reason="Once a month is reconciled and reviewed, close it so nothing shifts underneath your reports."
            />}
          />
        )}
      </DbCard>

      {closing && (
        <DbModal title="Close a period" onClose={() => setClosing(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.55 }}>
              Everything dated inside this range is locked. To correct something afterwards, post an adjusting entry —
              that is how the change stays visible instead of quietly rewriting history.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="From"><DbInput type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></DbField>
              <DbField label="To"><DbInput type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></DbField>
            </div>
            <DbField label="Notes" hint="Optional — what was reviewed before closing?">
              <DbInput value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </DbField>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={close} disabled={busy || !form.period_start || !form.period_end}>
                {busy ? "Closing…" : "Close the period"}
              </DbButton>
              <DbButton variant="ghost" onClick={() => setClosing(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}
