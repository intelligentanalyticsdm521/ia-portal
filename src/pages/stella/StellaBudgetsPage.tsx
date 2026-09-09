// StellaBudgetsPage — Budgets, and how the year is going against them.
// STELLA pack 2, item 7.
//
// The two tables behind this page shipped with the double-entry migration and
// had never been read by anything: no routes, no screen, not one row. Budget vs
// actual is a report every QuickBooks user runs monthly.
//
// The ACTUALS come from the books, not the register, and honour the same
// cash/accrual toggle every statement does — so this page and Reports → P&L can
// never disagree about what March cost.
//
// One deliberate choice worth knowing: "better than plan" is not the same
// arithmetic for money coming in and money going out. Spending less than you
// planned is good; earning less than you planned is not. A single unsigned
// difference is how a budget report ends up congratulating a business for
// missing its sales target.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { EmptyState } from "../../components/oliver/ui";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

interface Budget { budget_id: string; name: string; fiscal_year: number; line_count: number; total_budgeted: number }
interface BudgetLine { budget_line_id: string; coa_account_id: string; period_month: number; amount: number; coa_code: string | null; account_name: string | null; account_type: string | null }
interface VarianceRow {
  coa_account_id: string; period_month: number; coa_code: string | null;
  account_name: string | null; account_type: string | null;
  budget: number; actual: number; variance: number; variance_pct: number | null; better_than_plan: boolean;
}
interface Variance {
  budget: { budget_id: string; name: string; fiscal_year: number };
  basis: string; rows: VarianceRow[];
  totals: { revenue_budget: number; revenue_actual: number; expense_budget: number; expense_actual: number; net_budget: number; net_actual: number; net_variance: number };
}
interface Account { coa_account_id: string; code: string; name: string; type: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = { fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 } as const;
const input = { width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6, color: "#0B1C24", background: "#fff" } as const;

export function StellaBudgetsPage() {
  const { get, post, put, ready } = useStellaApi();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [basis, setBasis] = useState<"cash" | "accrual">("cash");
  const [variance, setVariance] = useState<Variance | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [list, coa] = await Promise.all([
        get<Budget[]>("/ledger/budgets"),
        get<Account[]>("/ledger/coa?active=true"),
      ]);
      setBudgets(list || []);
      setAccounts(coa || []);
      if (!selected && list?.length) setSelected(list[0].budget_id);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get, selected]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const loadVariance = useCallback(async () => {
    if (!selected) { setVariance(null); return; }
    try {
      const [v, detail] = await Promise.all([
        get<Variance>(`/ledger/budget-variance?budget_id=${selected}&basis=${basis}`),
        get<{ lines: BudgetLine[] }>(`/ledger/budgets/${selected}`),
      ]);
      setVariance(v);
      setLines(detail?.lines || []);
    } catch (e) { setError(e); }
  }, [get, selected, basis]);

  useEffect(() => { if (ready && selected) loadVariance(); }, [ready, selected, basis, loadVariance]);

  const byAccount = useMemo(() => {
    const map = new Map<string, { code: string | null; name: string | null; type: string | null; months: (VarianceRow | null)[] }>();
    for (const r of variance?.rows || []) {
      const key = String(r.coa_account_id);
      if (!map.has(key)) map.set(key, { code: r.coa_code, name: r.account_name, type: r.account_type, months: Array(12).fill(null) });
      map.get(key)!.months[r.period_month - 1] = r;
    }
    return [...map.entries()].sort((a, b) => String(a[1].code).localeCompare(String(b[1].code)));
  }, [variance]);

  const actions = (
    <button onClick={() => setShowCreate(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, background: "#fff", border: `1px solid ${STELLA_INDIGO}`, borderRadius: 6, cursor: "pointer" }}>
      <Plus size={13} /> New budget
    </button>
  );

  return (
    <StellaShell
      title="Budgets"
      subtitle="What you planned to spend and earn, beside what actually happened."
      actions={actions}
      error={error}
      loading={loading && !budgets.length}
    >
      {notice && <div style={{ padding: "9px 12px", marginBottom: 12, fontSize: 12, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", borderRadius: 8 }}>{notice}</div>}

      {!budgets.length && !loading ? (
        <EmptyState
          title="No budget yet"
          description="A budget is a number per account per month. Put one in and this page shows how the year is going against it — from your books, on the same basis as your Profit & Loss."
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...input, width: 260 }}>
              {budgets.map((b) => <option key={b.budget_id} value={b.budget_id}>{b.name} — {b.fiscal_year}</option>)}
            </select>
            <div className="ptabs">
              {(["cash", "accrual"] as const).map((b) => (
                <button key={b} className={`ptab${basis === b ? " active" : ""}`} onClick={() => setBasis(b)}>
                  {b === "cash" ? "Cash" : "Accrual"}
                </button>
              ))}
            </div>
            <button onClick={() => setEditing(true)}
              style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, background: "#fff", border: `1px solid ${STELLA_INDIGO}`, borderRadius: 6, cursor: "pointer" }}>
              Edit the numbers
            </button>
          </div>

          {variance && (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <Card title="Planned to earn" value={fmtMoney(variance.totals.revenue_budget)} note={`Actually earned ${fmtMoney(variance.totals.revenue_actual)}`} />
                <Card title="Planned to spend" value={fmtMoney(variance.totals.expense_budget)} note={`Actually spent ${fmtMoney(variance.totals.expense_actual)}`} />
                <Card
                  title="Planned profit"
                  value={fmtMoney(variance.totals.net_budget)}
                  note={`${variance.totals.net_variance >= 0 ? "Ahead by" : "Behind by"} ${fmtMoney(Math.abs(variance.totals.net_variance))}`}
                  strong
                  tone={variance.totals.net_variance >= 0 ? "#047857" : "#B91C1C"}
                />
              </div>

              <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, color: "#5A7A8A", position: "sticky", left: 0, background: "#F8FAFC" }}>Account</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, color: "#5A7A8A" }}>Planned</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, color: "#5A7A8A" }}>Actual</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, color: "#5A7A8A" }}>Difference</th>
                      {MONTHS.map((m) => <th key={m} style={{ textAlign: "right", padding: "8px 6px", fontSize: 10, color: "#94A3B8" }}>{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {byAccount.map(([id, a]) => {
                      const planned = a.months.reduce((s, r) => s + Number(r?.budget || 0), 0);
                      const actual = a.months.reduce((s, r) => s + Number(r?.actual || 0), 0);
                      const diff = String(a.type).toLowerCase() === "revenue" ? actual - planned : planned - actual;
                      return (
                        <tr key={id} style={{ borderTop: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "7px 12px", fontSize: 12, position: "sticky", left: 0, background: "#fff" }}>
                            <div style={{ fontWeight: 600, color: "#0B1C24" }}>{a.name}</div>
                            <div style={{ fontSize: 10, color: "#94A3B8" }}>{a.code} · {a.type}</div>
                          </td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(planned)}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(actual)}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: diff >= 0 ? "#047857" : "#B91C1C" }}>
                            {diff >= 0 ? "+" : "−"}{fmtMoney(Math.abs(diff))}
                          </td>
                          {a.months.map((r, i) => (
                            <td key={i} style={{ padding: "7px 6px", fontSize: 11, textAlign: "right", color: r ? "#334155" : "#E2E8F0", fontVariantNumeric: "tabular-nums" }}>
                              {r ? fmtMoney(r.actual) : "·"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                A green difference means better than plan — under budget on a cost, over budget on
                income. An account you spent on but never planned for still appears: "we did not
                plan for this" is exactly the row worth seeing.
              </div>
            </>
          )}
        </>
      )}

      {showCreate && (
        <IadmModal open onClose={() => setShowCreate(false)} product="stella" eyebrow="Budgets" title="New budget" size="confirm"
          footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
            <IadmButton variant="ghost" onClick={() => setShowCreate(false)}>Cancel</IadmButton>
          </div>}>
          <NewBudgetForm
            post={post}
            onSaved={(id, msg) => { setShowCreate(false); setSelected(id); setNotice(msg); reload(); }}
          />
        </IadmModal>
      )}

      {editing && selected && (
        <BudgetEditor
          accounts={accounts}
          lines={lines}
          budgetId={selected}
          put={put}
          onClose={() => setEditing(false)}
          onSaved={(msg) => { setEditing(false); setNotice(msg); loadVariance(); reload(); }}
        />
      )}
    </StellaShell>
  );
}

function Card({ title, value, note, strong, tone }: { title: string; value: string; note: string; strong?: boolean; tone?: string }) {
  return (
    <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "#5A7A8A" }}>{title}</div>
      <div style={{ fontSize: strong ? 24 : 20, fontWeight: 700, color: "#0B1C24", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: tone || "#94A3B8", fontWeight: tone ? 600 : 400 }}>{note}</div>
    </div>
  );
}

function NewBudgetForm({ post, onSaved }: { post: <T>(p: string, b?: unknown) => Promise<T>; onSaved: (id: string, msg: string) => void }) {
  const [name, setName] = useState(`${new Date().getFullYear()} plan`);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      {err && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>}
      <label style={label}>Call it</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, marginBottom: 12 }} />
      <label style={label}>Year</label>
      <input value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value)} style={{ ...input, marginBottom: 14 }} />
      <IadmButton variant="accent" product="stella" disabled={saving || !name.trim()} onClick={async () => {
        setSaving(true); setErr(null);
        try {
          const r = await post<{ budget_id: string }>("/ledger/budgets", { name, fiscal_year: Number(year) });
          onSaved(r.budget_id, `${name} created — put your numbers in with "Edit the numbers".`);
        } catch (e) { setErr(e instanceof Error ? e.message : "Could not create that budget."); }
        finally { setSaving(false); }
      }}>{saving ? "Creating…" : "Create it"}</IadmButton>
    </div>
  );
}

function BudgetEditor({
  accounts, lines, budgetId, put, onClose, onSaved,
}: {
  accounts: Account[];
  lines: BudgetLine[];
  budgetId: string;
  put: <T>(p: string, b: unknown) => Promise<T>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  // Only revenue and expense accounts: a budget is a plan for a Profit & Loss,
  // not for the Balance Sheet.
  const plannable = useMemo(
    () => accounts.filter((a) => ["revenue", "expense"].includes(String(a.type).toLowerCase())),
    [accounts],
  );
  const [grid, setGrid] = useState<Record<string, string[]>>(() => {
    const g: Record<string, string[]> = {};
    for (const a of plannable) g[a.coa_account_id] = Array(12).fill("");
    for (const l of lines) {
      if (!g[l.coa_account_id]) g[l.coa_account_id] = Array(12).fill("");
      g[l.coa_account_id][l.period_month - 1] = String(l.amount);
    }
    return g;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState("");

  const shown = plannable.filter((a) => !only || a.coa_account_id === only);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const payload: { coa_account_id: string; period_month: number; amount: number }[] = [];
      for (const [id, months] of Object.entries(grid)) {
        months.forEach((v, i) => {
          const n = Number(v);
          // A blank cell is "no plan"; a typed 0 is "plan nothing", and the API
          // treats 0 as "remove the line" — same statement, one row fewer.
          if (v !== "" && Number.isFinite(n)) payload.push({ coa_account_id: id, period_month: i + 1, amount: n });
        });
      }
      const r = await put<{ lines_written: number; lines_removed: number }>(`/ledger/budgets/${budgetId}/lines`, { lines: payload });
      onSaved(`Saved ${r.lines_written} number(s)${r.lines_removed ? `, removed ${r.lines_removed}` : ""}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save those numbers.");
    } finally { setSaving(false); }
  }

  return (
    <IadmModal
      open onClose={onClose} product="stella"
      eyebrow="Budgets" title="The numbers"
      subtitle="A figure per account per month. Leave a cell blank if you have no plan for it."
      size="report"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <select value={only} onChange={(e) => setOnly(e.target.value)} style={{ ...input, width: 260 }}>
            <option value="">Every account</option>
            {plannable.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
            <IadmButton variant="accent" product="stella" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save the numbers"}</IadmButton>
          </div>
        </div>
      }
    >
      {err && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>}
      <div style={{ overflow: "auto", maxHeight: "60vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: "#5A7A8A", position: "sticky", left: 0, background: "#F8FAFC" }}>Account</th>
              {MONTHS.map((m) => <th key={m} style={{ padding: "6px 4px", fontSize: 10, color: "#5A7A8A" }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.coa_account_id} style={{ borderTop: "1px solid #F1F5F9" }}>
                <td style={{ padding: "4px 10px", fontSize: 11, position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#94A3B8" }}>{a.code}</span> {a.name}
                </td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} style={{ padding: 2 }}>
                    <input
                      value={grid[a.coa_account_id]?.[i] ?? ""}
                      inputMode="decimal"
                      onChange={(e) => setGrid((g) => {
                        const next = { ...g };
                        const row = [...(next[a.coa_account_id] || Array(12).fill(""))];
                        row[i] = e.target.value;
                        next[a.coa_account_id] = row;
                        return next;
                      })}
                      style={{ width: 62, padding: "4px 5px", fontSize: 11, textAlign: "right", border: "1px solid #E2E8F0", borderRadius: 4 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </IadmModal>
  );
}

export default StellaBudgetsPage;
