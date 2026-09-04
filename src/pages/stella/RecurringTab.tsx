// RecurringTab — the Transactions page's Recurring tab, made real.
//
// Ops O-5 step (b). Until now this tab said "Recurring is coming in the
// Ingestion phase" while POST/PATCH/DELETE//run had already shipped behind it
// — a page telling the owner a feature does not exist while the API served it.
//
// What a person needs from recurring transactions, in order:
//   1. see every template and when it next posts
//   2. create and edit one, with an END DATE so it stops on its own
//   3. run one NOW (the bill arrived early, or arrived at a different amount)
//   4. see what it has already posted — the run history, including the
//      periods it SKIPPED and why
//
// (4) is the half people forget. A template that quietly stopped posting is
// indistinguishable from one that never had to, unless the skips are visible.
//
// AUTO-POST IS OFF BY DEFAULT and the switch says what it means in words. A
// template that posts into someone's books unattended is a decision the owner
// makes per template, not one the platform makes for them.
import { useCallback, useEffect, useState } from "react";
import { Play, Pencil, Trash2, Plus } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "./dbmanager/DbManagerKit";

export type RecurringTemplate = {
  recurring_template_id: string;
  name: string;
  cadence: string;
  next_due: string | null;
  end_date: string | null;
  amount_expected: number | null;
  coa_account_id: string | null;
  coa_code?: string | null;
  coa_name?: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  variance_pct: number | null;
  direction: string | null;
  memo: string | null;
  is_active: boolean | number;
  status: string | null;
  auto_post: boolean | number;
  last_run_at: string | null;
};

type RecurringRun = {
  recurring_run_id: string;
  period_key: string;
  due_date: string;
  posted_date: string | null;
  amount: number | null;
  transaction_id: string | null;
  status: string;
  reason: string | null;
  trigger_source: string;
  created_at: string;
};

type Account = { coa_account_id: string; code: string; name: string; type: string };

// 'annual' is the schema's word; the label says the word people use.
const CADENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Yearly" },
];
const cadenceLabel = (c?: string | null) => CADENCES.find((x) => x.value === c)?.label || c || "—";

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string | null) => (d ? String(d).slice(0, 10) : "—");
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function RecurringTab() {
  const api = useStellaApi();
  const [rows, setRows] = useState<RecurringTemplate[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [editing, setEditing] = useState<RecurringTemplate | "new" | null>(null);
  const [history, setHistory] = useState<RecurringTemplate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<RecurringTemplate[]>("/ledger/recurring").then(setRows).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.get<Account[]>("/ledger/coa?active=true").then(setAccounts).catch(setError);
  }, [api]);

  async function runNow(t: RecurringTemplate) {
    setBusyId(t.recurring_template_id); setError(null);
    try {
      const r = await api.post<{ posted_date: string; amount: number; next_due: string; ended: boolean }>(
        `/ledger/recurring/${t.recurring_template_id}/run`, {},
      );
      showNotice(r.ended
        ? `Posted ${fmtMoney(r.amount)} for ${r.posted_date}. That was the last one — this template has ended.`
        : `Posted ${fmtMoney(r.amount)} for ${r.posted_date}. Next due ${r.next_due}.`);
      load();
    } catch (e) { setError(e); } finally { setBusyId(null); }
  }

  async function togglePause(t: RecurringTemplate) {
    const paused = String(t.status) === "paused" || !t.is_active;
    try {
      await api.patch(`/ledger/recurring/${t.recurring_template_id}`, { status: paused ? "active" : "paused" });
      showNotice(paused ? "Template resumed." : "Template paused — it will not post until you resume it.");
      load();
    } catch (e) { setError(e); }
  }

  async function remove(t: RecurringTemplate) {
    if (!window.confirm(`Delete "${t.name}"? Transactions it already posted stay in your ledger.`)) return;
    try {
      await api.del(`/ledger/recurring/${t.recurring_template_id}`);
      showNotice("Template deleted.");
      load();
    } catch (e) { setError(e); }
  }

  return (
    <div>
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard
        title="Recurring transactions"
        actions={
          <DbButton onClick={() => setEditing("new")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> New template
            </span>
          </DbButton>
        }
      >
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12, lineHeight: 1.5 }}>
          Rent, software, insurance, a retainer — the money that moves on a schedule. Each template posts
          <strong> once per period</strong>, however many times it is run, so a double click cannot bill you twice.
          Switch on <em>Post automatically</em> and STELLA books it each period without being asked.
        </div>
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "name", label: "Template" },
              { key: "cadenceLabel", label: "Cadence" },
              { key: "amount_expected", label: "Amount", type: "decimal" },
              { key: "nextDue", label: "Next" },
              { key: "endsOn", label: "Ends" },
              { key: "auto", label: "Automatic" },
              { key: "state", label: "Status" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((t) => {
              const paused = String(t.status) === "paused" || !t.is_active;
              const ended = String(t.status) === "ended";
              return {
                ...t,
                cadenceLabel: cadenceLabel(t.cadence),
                nextDue: ended ? <span style={{ color: "#C7D0DB" }}>—</span> : fmtDate(t.next_due),
                endsOn: t.end_date ? fmtDate(t.end_date) : <span style={{ color: "#C7D0DB" }}>never</span>,
                auto: t.auto_post ? <Pill tone="brand">on</Pill> : <Pill tone="neutral">off</Pill>,
                state: ended ? <Pill tone="neutral">ended</Pill>
                  : paused ? <Pill tone="warn">paused</Pill>
                  : <Pill tone="good">active</Pill>,
                action: (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <DbButton variant="ghost" disabled={ended || paused || busyId === t.recurring_template_id}
                      onClick={() => runNow(t)} title={ended ? "This template has ended" : paused ? "Resume it first" : "Post this period now"}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Play size={11} /> {busyId === t.recurring_template_id ? "…" : "Run now"}
                      </span>
                    </DbButton>
                    <DbButton variant="ghost" onClick={() => setHistory(t)} title="What it has posted">History</DbButton>
                    <DbButton variant="ghost" onClick={() => setEditing(t)} title="Edit"><Pencil size={12} /></DbButton>
                    {!ended && (
                      <DbButton variant="ghost" onClick={() => togglePause(t)}>{paused ? "Resume" : "Pause"}</DbButton>
                    )}
                    <DbButton variant="ghost" onClick={() => remove(t)} title="Delete"><Trash2 size={12} /></DbButton>
                  </span>
                ),
              };
            }) as never}
            empty={<DbEmpty
              title="No recurring templates yet"
              reason="Add one for anything that moves on a schedule — rent, software, insurance, a retainer." />}
          />
        )}
      </DbCard>

      {editing && (
        <TemplateModal
          template={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); showNotice(msg); load(); }}
        />
      )}
      {history && (
        <HistoryModal template={history} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}

function TemplateModal({ template, accounts, onClose, onDone }: {
  template: RecurringTemplate | null;
  accounts: Account[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const editing = !!template;
  const [name, setName] = useState(template?.name || "");
  const [cadence, setCadence] = useState(template?.cadence || "monthly");
  const [nextDue, setNextDue] = useState(template?.next_due ? String(template.next_due).slice(0, 10) : today());
  const [endDate, setEndDate] = useState(template?.end_date ? String(template.end_date).slice(0, 10) : "");
  const [amount, setAmount] = useState(template?.amount_expected != null ? String(template.amount_expected) : "");
  const [coaId, setCoaId] = useState(template?.coa_account_id || "");
  const [memo, setMemo] = useState(template?.memo || "");
  const [autoPost, setAutoPost] = useState(!!template?.auto_post);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const endBeforeStart = !!endDate && endDate < nextDue;
  const account = accounts.find((a) => a.coa_account_id === coaId);
  const willBeIncome = String(account?.type || "").toLowerCase() === "revenue";

  async function save() {
    setBusy(true); setError(null);
    try {
      const body = {
        name: name.trim(),
        cadence,
        next_due: nextDue,
        end_date: endDate || null,
        amount_expected: num(amount) ?? 0,
        coa_account_id: coaId || null,
        memo: memo.trim() || null,
        auto_post: autoPost,
      };
      if (editing) await api.patch(`/ledger/recurring/${template!.recurring_template_id}`, body);
      else await api.post("/ledger/recurring", body);
      onDone(editing ? "Template updated." : "Template created.");
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <DbModal title={editing ? "Edit template" : "New recurring template"} onClose={onClose} width={620}>
      <DbError error={error} />
      <div style={{ display: "grid", gap: 12 }}>
        <DbField label="Name" hint="What it is — this becomes the transaction description">
          <DbInput value={name} maxLength={300} placeholder="Office rent" autoFocus
            onChange={(e) => setName(e.target.value)} />
        </DbField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DbField label="Cadence">
            <DbSelect value={cadence} onChange={(e) => setCadence(e.target.value)}>
              {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </DbSelect>
          </DbField>
          <DbField label="Amount">
            <DbInput inputMode="decimal" value={amount} placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)} />
          </DbField>
          <DbField label="Next due">
            <DbInput type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </DbField>
          <DbField
            label="Ends on"
            hint={endBeforeStart ? "that is before the first due date" : "leave blank to run until you stop it"}
          >
            <DbInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </DbField>
        </div>
        <DbField
          label="Account"
          hint={coaId ? (willBeIncome ? "a revenue account — this will post as money IN" : "this will post as money OUT") : "the template cannot run without one"}
        >
          <DbSelect value={coaId} onChange={(e) => setCoaId(e.target.value)}>
            <option value="">— pick an account —</option>
            {accounts.map((a) => (
              <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name} ({a.type})</option>
            ))}
          </DbSelect>
        </DbField>
        <DbField label="Memo" hint="optional — goes on every transaction this template posts">
          <DbInput value={memo} maxLength={1000} onChange={(e) => setMemo(e.target.value)} />
        </DbField>

        <label style={{
          display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#334155",
          background: "#FAFBFF", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, padding: "10px 12px",
        }}>
          <input type="checkbox" checked={autoPost} style={{ marginTop: 2 }}
            onChange={(e) => setAutoPost(e.target.checked)} />
          <span>
            <strong>Post automatically</strong>
            <span style={{ display: "block", color: "#5A7A8A", marginTop: 2, lineHeight: 1.5 }}>
              STELLA books this each period without asking. Leave it off and the template just reminds you —
              you press <em>Run now</em> when the bill actually arrives.
            </span>
          </span>
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <DbButton onClick={save} disabled={busy || !name.trim() || !nextDue || endBeforeStart || !Number(amount)}>
            {busy ? "Saving…" : editing ? "Save" : "Create template"}
          </DbButton>
          <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
        </div>
      </div>
    </DbModal>
  );
}

function HistoryModal({ template, onClose }: { template: RecurringTemplate; onClose: () => void }) {
  const api = useStellaApi();
  const [runs, setRuns] = useState<RecurringRun[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!api.ready) return;
    api.get<RecurringTemplate & { runs: RecurringRun[] }>(`/ledger/recurring/${template.recurring_template_id}`)
      .then((t) => setRuns(t.runs || []))
      .catch(setError);
  }, [api, template.recurring_template_id]);

  return (
    <DbModal title={`${template.name} — run history`} onClose={onClose} width={720}>
      <DbError error={error} />
      <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 10, lineHeight: 1.5 }}>
        One row per period. A period that was <strong>skipped</strong> says why — a skipped period never posts later
        on its own, which is what stops a paused template catching up by surprise when you resume it.
      </div>
      {!runs ? <DbLoading /> : (
        <DbTable
          columns={[
            { key: "period_key", label: "Period" },
            { key: "due_date", label: "Due", type: "date" },
            { key: "posted_date", label: "Posted", type: "date" },
            { key: "amount", label: "Amount", type: "decimal" },
            { key: "trigger_source", label: "Run by" },
            { key: "state", label: "Result" },
            { key: "reason", label: "Note" },
          ]}
          rows={runs.map((r) => ({
            ...r,
            state: r.status === "posted" ? <Pill tone="good">posted</Pill>
              : r.status === "skipped" ? <Pill tone="warn">skipped</Pill>
              : <Pill tone="bad">failed</Pill>,
            trigger_source: r.trigger_source === "timer" ? "automatically" : "by hand",
            reason: r.reason || "",
          })) as never}
          empty={<DbEmpty title="It has not run yet" reason="Press Run now, or switch on Post automatically." />}
        />
      )}
      <div style={{ marginTop: 12, fontSize: 10, color: "#94A3B8" }}>
        Last run: {template.last_run_at ? new Date(template.last_run_at).toLocaleString() : "never"}
        {template.end_date ? ` · ends ${fmtDate(template.end_date)}` : ""}
        <span style={{ color: STELLA_INDIGO }}> · one transaction per period, guaranteed</span>
      </div>
    </DbModal>
  );
}
