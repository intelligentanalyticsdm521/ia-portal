// StellaUnitEconomicsPages — Layer 2 (Unit Economics) LIVE pages.
//
// 2026-08-13 P4 build: the allocation engine + margin reads are live on the
// folded oliver-api (routes/stellaUnitEconomics.js), so the P4 scaffolds are
// replaced with working surfaces:
//   - Allocations: Rules tab (list + New-rule modal over the 7-method taxonomy;
//     only Direct + % of revenue are runnable this phase, the other five render
//     tier-gated "Pro+ · later") and Runs tab (history + Run-allocation panel
//     with a period picker defaulting to the last full month).
//   - Margins (the flagship): period picker; per-Job table (revenue, direct
//     cost, allocated overhead, margin $/%) with teal/coral margin coding and
//     a horizontal margin-by-job bar; per-Customer table below, same shape.
//   - Reconciliation: monthly STELLA vs OLIVER income comparison with ok/drift
//     badges + the v2.1 leading-edge rule explainer.
//
// House rules: one fetch per page (useStellaApi's stable identity), honest
// empty states, {data} envelope already unwrapped by the api client.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ReferenceLine,
} from "recharts";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, Button, type Column } from "../../components/oliver/ui";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

// ── Margin color coding (design pass): teal positive / coral negative ────────
const MARGIN_TEAL = "#0D9488";
const MARGIN_TEAL_BG = "#CCFBF1";
const MARGIN_CORAL = "#E4572E";
const MARGIN_CORAL_BG = "#FFE3D9";

// ── API shapes (routes/stellaUnitEconomics.js) ───────────────────────────────

interface AllocationMethod {
  allocation_method_id: string;
  code: string;
  display_name: string;
  description: string | null;
  is_available: boolean;
}

interface AllocationRule {
  allocation_rule_id: string;
  name: string;
  source_coa_account_id: string | null;
  source_coa_code: string | null;
  source_coa_name: string | null;
  target: string;
  is_active: boolean | number;
  created_at: string;
  method_code: string;
  method_name: string;
  method_available: boolean;
}

interface AllocationRun {
  allocation_run_id: string;
  rule_id: string | null;
  rule_name: string | null;
  method_code: string | null;
  period_start: string;
  period_end: string;
  status: string;
  total_allocated: number | null;
  trigger_source: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  result_count: number;
  direct_amount: number;
  overhead_amount: number;
}

// POST /unit-economics/allocation/run response (engine summary).
interface RunSummary {
  allocation_run_id: string;
  method: string;
  period: { from: string; to: string };
  status: string;
  direct: { transactions: number; amount: number };
  overhead: { pool_transactions: number; amount: number; total_job_revenue: number; jobs_with_revenue: number };
  total_allocated: number;
  result_rows: number;
}

interface JobMargin {
  job_id: string;
  job_number: string | null;
  title: string | null;
  contact_id: string | null;
  revenue: number;
  direct_cost: number;
  allocated_overhead: number;
  margin: number;
  margin_pct: number | null;
}

interface CustomerMargin {
  contact_id: string;
  name: string | null;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number | null;
}

interface MarginsResponse {
  period: { from: string; to: string };
  allocation_run_id: string | null;
  jobs: JobMargin[];
  customers: CustomerMargin[];
}

interface ReconMonth {
  month: string;
  stella_income: number;
  oliver_paid: number;
  delta: number;
  status: "ok" | "drift" | string;
}

interface ReconResponse {
  rule: string;
  months: ReconMonth[];
  totals: {
    stella_oliver_income: number;
    stella_total_income: number;
    oliver_paid: number;
    delta: number;
    status: "ok" | "drift" | string;
  };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Last FULL month (today 2026-08-13 → 2026-07-01..2026-07-31). */
function lastFullMonthRange(): { from: string; to: string } {
  const now = new Date();
  const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThis.getTime() - 24 * 3600 * 1000);
  const y = lastMonthEnd.getFullYear();
  const m = lastMonthEnd.getMonth() + 1;
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastMonthEnd.getDate()).padStart(2, "0")}` };
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function fmtMonthLong(m: string) {
  const [y, mo] = String(m).split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Colored margin-% pill — teal when positive, coral when negative. */
function MarginPct({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span style={{ fontSize: 11, color: "#94A3B8" }} title="No revenue in the period — margin % undefined">—</span>;
  }
  const positive = pct >= 0;
  return (
    <span
      style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 99,
        fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        background: positive ? MARGIN_TEAL_BG : MARGIN_CORAL_BG,
        color: positive ? MARGIN_TEAL : MARGIN_CORAL,
      }}
    >
      {positive ? "" : "−"}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function MarginMoney({ value }: { value: number }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: value >= 0 ? MARGIN_TEAL : MARGIN_CORAL }}>
      {value >= 0 ? "" : "−"}{fmtMoney(Math.abs(value))}
    </span>
  );
}

/** From/to date inputs + Apply — the Margins + Runs period control. */
function PeriodPicker({
  from, to, onApply, busy, applyLabel = "Apply",
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  busy?: boolean;
  applyLabel?: string;
}) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  useEffect(() => { setF(from); setT(to); }, [from, to]);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t) && f <= t;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={pInput} aria-label="Period from" />
      <span style={{ fontSize: 11, color: "#5A7A8A" }}>to</span>
      <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={pInput} aria-label="Period to" />
      <button
        onClick={() => valid && onApply(f, t)}
        disabled={!valid || busy}
        style={{
          padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#fff",
          background: STELLA_INDIGO, opacity: !valid || busy ? 0.5 : 1,
          border: 0, borderRadius: 6, cursor: !valid || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Working…" : applyLabel}
      </button>
    </div>
  );
}

const pInput: React.CSSProperties = { padding: "6px 9px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24", background: "#fff" };
const fLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 };
const fInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, background: "#fff", color: "#0B1C24" };

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  complete: { bg: "#D1FAE5", color: "#047857" },
  running: { bg: "#FEF3C7", color: "#92400E" },
  failed: { bg: "#FEE2E2", color: "#991B1B" },
};

// ═════════════════════════════════════════════════════════════════════════════
// Allocations — Rules + Runs tabs
// ═════════════════════════════════════════════════════════════════════════════

const ALLOC_TABS = [
  { key: "rules", label: "Rules" },
  { key: "runs", label: "Runs" },
];

export function StellaAllocationsPage() {
  const { get, post, ready } = useStellaApi();
  const [tab, setTab] = useState("rules");
  const [methods, setMethods] = useState<AllocationMethod[]>([]);
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [runs, setRuns] = useState<AllocationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newRuleOpen, setNewRuleOpen] = useState(false);

  // Run-allocation panel state.
  const defaultPeriod = useMemo(lastFullMonthRange, []);
  const [runRuleId, setRunRuleId] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunSummary | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, rl, rn] = await Promise.all([
        get<AllocationMethod[]>("/unit-economics/allocation/methods"),
        get<AllocationRule[]>("/unit-economics/allocation/rules"),
        get<AllocationRun[]>("/unit-economics/allocation/runs"),
      ]);
      setMethods(m || []);
      setRules(rl || []);
      setRuns(rn || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function runAllocation(from: string, to: string) {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const summary = await post<RunSummary>("/unit-economics/allocation/run", {
        rule_id: runRuleId || undefined,
        period: { from, to },
      });
      setRunResult(summary);
      // Refresh history without blanking the page.
      const rn = await get<AllocationRun[]>("/unit-economics/allocation/runs").catch(() => null);
      if (rn) setRuns(rn);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Run failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  const ruleColumns: Column<AllocationRule>[] = [
    {
      key: "name", header: "Rule",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name}</span>,
    },
    {
      key: "method", header: "Method",
      render: (r) => (
        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: `${STELLA_INDIGO}14`, color: STELLA_INDIGO, fontSize: 11, fontWeight: 600 }}>
          {r.method_name || r.method_code}
        </span>
      ),
    },
    {
      key: "target", header: "Target",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", textTransform: "capitalize" }}>{r.target || "job"}</span>,
    },
    {
      key: "source", header: "Cost pool",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A" }}>
          {r.source_coa_name ? (r.source_coa_code ? `${r.source_coa_code} — ${r.source_coa_name}` : r.source_coa_name) : "All untagged overhead"}
        </span>
      ),
    },
    {
      key: "created_at", header: "Created", sortable: true, sortAccessor: (r) => r.created_at,
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtDate(r.created_at)}</span>,
    },
  ];

  const runColumns: Column<AllocationRun>[] = [
    {
      key: "created_at", header: "Ran", sortable: true, sortAccessor: (r) => r.created_at,
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: "rule", header: "Rule",
      render: (r) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
          {r.rule_name || "Full pass (default)"}
        </span>
      ),
    },
    {
      key: "method", header: "Method",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A" }}>
          {r.method_code === "percentage_of_revenue" ? "% of revenue" : r.method_code === "direct" ? "Direct" : r.method_code || "—"}
        </span>
      ),
    },
    {
      key: "period", header: "Period",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A", whiteSpace: "nowrap" }}>
          {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
        </span>
      ),
    },
    {
      key: "status", header: "Status",
      render: (r) => {
        const p = STATUS_PILL[r.status] || STATUS_PILL.running;
        return (
          <span title={r.error_message || undefined} style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
            {r.status}
          </span>
        );
      },
    },
    {
      key: "total_allocated", header: "Allocated", align: "right", sortable: true, sortAccessor: (r) => r.total_allocated ?? 0,
      render: (r) => (
        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {r.total_allocated == null ? "—" : fmtMoney(r.total_allocated)}
        </span>
      ),
    },
    {
      key: "split", header: "Direct / Overhead", align: "right",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {fmtMoney(r.direct_amount)} / {fmtMoney(r.overhead_amount)}
        </span>
      ),
    },
    {
      key: "result_count", header: "Rows", align: "right",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums" }}>{r.result_count}</span>,
    },
  ];

  return (
    <StellaShell
      title="Allocations"
      subtitle="How shared and overhead costs get spread across jobs — the rules that define it and every batch that ran."
      error={error}
      loading={loading && !methods.length}
    >
      <StellaTabs tabs={ALLOC_TABS} active={tab} onChange={setTab} />

      {flash && (
        <div style={{ marginBottom: 12, padding: "8px 12px", fontSize: 12, background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 8 }}>
          {flash}
        </div>
      )}

      {tab === "rules" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={() => setNewRuleOpen(true)}>
              + New rule
            </Button>
          </div>
          {rules.length === 0 ? (
            <EmptyState
              title="No allocation rules yet"
              description="A rule names a method for spreading overhead across your jobs. Direct (job-tagged) and Percentage of revenue are live now — create your first rule to start allocating."
            />
          ) : (
            <DataTable
              rows={rules}
              columns={ruleColumns}
              rowKey={(r) => r.allocation_rule_id}
              initialSort={{ key: "created_at", direction: "desc" }}
              emptyMessage="No allocation rules yet."
            />
          )}
          {newRuleOpen && (
            <NewRuleModal
              methods={methods}
              onClose={() => setNewRuleOpen(false)}
              onCreated={(name) => {
                setNewRuleOpen(false);
                setFlash(`Rule "${name}" created.`);
                setTimeout(() => setFlash(null), 4000);
                reload();
              }}
            />
          )}
        </>
      ) : (
        <>
          {/* Run-allocation panel */}
          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", marginBottom: 8 }}>Run allocation</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select value={runRuleId} onChange={(e) => setRunRuleId(e.target.value)} style={{ ...pInput, minWidth: 260 }} aria-label="Allocation rule">
                <option value="">Full pass — Direct + % of revenue</option>
                {rules.map((r) => (
                  <option key={r.allocation_rule_id} value={r.allocation_rule_id}>
                    {r.name} ({r.method_name || r.method_code})
                  </option>
                ))}
              </select>
              <PeriodPicker
                from={defaultPeriod.from}
                to={defaultPeriod.to}
                onApply={runAllocation}
                busy={running}
                applyLabel="Run allocation"
              />
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
              Re-running the same rule + period replaces that run's results — allocations stay idempotent and auditable.
            </div>
            {runResult && (
              <div style={{ marginTop: 10, padding: "10px 12px", fontSize: 12, background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 8, lineHeight: 1.5 }}>
                ✓ Run complete — <strong>{fmtMoney(runResult.total_allocated)}</strong> allocated for {fmtDate(runResult.period.from)} – {fmtDate(runResult.period.to)}:{" "}
                {fmtMoney(runResult.direct.amount)} direct across {runResult.direct.transactions} tagged transaction{runResult.direct.transactions === 1 ? "" : "s"},{" "}
                {fmtMoney(runResult.overhead.amount)} overhead spread over {runResult.overhead.jobs_with_revenue} job{runResult.overhead.jobs_with_revenue === 1 ? "" : "s"} with revenue
                {" "}({runResult.result_rows} result rows). Margins for this period now reflect it.
              </div>
            )}
            {runError && (
              <div style={{ marginTop: 10, padding: "10px 12px", fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>
                {runError}
              </div>
            )}
          </div>

          {runs.length === 0 ? (
            <EmptyState
              title="No allocation runs yet"
              description="Pick a period above and run your first allocation. Direct-tagged expenses land on their jobs 1:1; untagged overhead spreads by each job's revenue share."
            />
          ) : (
            <DataTable
              rows={runs}
              columns={runColumns}
              rowKey={(r) => r.allocation_run_id}
              initialSort={{ key: "created_at", direction: "desc" }}
              emptyMessage="No allocation runs yet."
            />
          )}
        </>
      )}
    </StellaShell>
  );
}

/** New-rule modal — name + the fixed 7-method taxonomy. Only the two live
 *  methods are selectable; the tier-gated five render disabled with a badge. */
function NewRuleModal({
  methods,
  onClose,
  onCreated,
}: {
  methods: AllocationMethod[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { post } = useStellaApi();
  const [name, setName] = useState("");
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 0 && !!method;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await post("/unit-economics/allocation/rules", { name: name.trim(), method, target: "job" });
      onCreated(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create the rule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${STELLA_LAVENDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>New allocation rule</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <label>
            <span style={fLabel}>Rule name</span>
            <input
              style={fInput}
              placeholder="e.g. Overhead by revenue share"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <div>
            <span style={fLabel}>Method</span>
            <div style={{ display: "grid", gap: 6 }}>
              {methods.map((m) => {
                const selected = method === m.code;
                const disabled = !m.is_available;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => !disabled && setMethod(m.code)}
                    disabled={disabled}
                    title={disabled ? "Tier-gated — lands in a later phase" : undefined}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                      padding: "10px 12px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
                      border: `1px solid ${selected ? STELLA_INDIGO : STELLA_LAVENDER}`,
                      background: selected ? "#EEF0FB" : disabled ? "#F8FAFC" : "#fff",
                      opacity: disabled ? 0.75 : 1,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        marginTop: 2, width: 14, height: 14, borderRadius: 99, flex: "0 0 auto",
                        border: `2px solid ${selected ? STELLA_INDIGO : "#CBD5E1"}`,
                        background: selected ? STELLA_INDIGO : "#fff",
                        boxShadow: selected ? "inset 0 0 0 2.5px #fff" : undefined,
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: disabled ? "#94A3B8" : "#0B1C24" }}>{m.display_name}</span>
                        {disabled && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#EEF2FF", color: "#3730A3" }}>
                            Pro+ · later
                          </span>
                        )}
                      </span>
                      {m.description && (
                        <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginTop: 3, lineHeight: 1.45 }}>{m.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={submit} disabled={saving || !valid}>
              {saving ? "Creating…" : "Create rule"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Margins — the flagship
// ═════════════════════════════════════════════════════════════════════════════

export function StellaMarginsPage() {
  const { get, ready } = useStellaApi();
  const defaultPeriod = useMemo(lastFullMonthRange, []);
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState<MarginsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await get<MarginsResponse>(`/unit-economics/margins?from=${from}&to=${to}`);
      setData(d);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(period.from, period.to); }, [ready, reload, period]);

  const jobs = data?.jobs || [];
  const customers = data?.customers || [];

  const jobColumns: Column<JobMargin>[] = [
    {
      key: "job", header: "Job",
      render: (r) => (
        <span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>{r.job_number || "—"}</span>
          <span style={{ fontSize: 11, color: "#5A7A8A", marginLeft: 8 }}>{r.title || ""}</span>
        </span>
      ),
    },
    {
      key: "revenue", header: "Revenue", align: "right", sortable: true, sortAccessor: (r) => r.revenue,
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.revenue)}</span>,
    },
    {
      key: "direct_cost", header: "Direct cost", align: "right", sortable: true, sortAccessor: (r) => r.direct_cost,
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.direct_cost)}</span>,
    },
    {
      key: "allocated_overhead", header: "Allocated overhead", align: "right", sortable: true, sortAccessor: (r) => r.allocated_overhead,
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.allocated_overhead)}</span>,
    },
    {
      key: "margin", header: "Margin $", align: "right", sortable: true, sortAccessor: (r) => r.margin,
      render: (r) => <MarginMoney value={r.margin} />,
    },
    {
      key: "margin_pct", header: "Margin %", align: "right", sortable: true, sortAccessor: (r) => r.margin_pct ?? -Infinity,
      render: (r) => <MarginPct pct={r.margin_pct} />,
    },
  ];

  const customerColumns: Column<CustomerMargin>[] = [
    {
      key: "name", header: "Customer",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name || "Unknown customer"}</span>,
    },
    {
      key: "revenue", header: "Revenue", align: "right", sortable: true, sortAccessor: (r) => r.revenue,
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.revenue)}</span>,
    },
    {
      key: "cost", header: "Cost (direct + allocated)", align: "right", sortable: true, sortAccessor: (r) => r.cost,
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.cost)}</span>,
    },
    {
      key: "margin", header: "Margin $", align: "right", sortable: true, sortAccessor: (r) => r.margin,
      render: (r) => <MarginMoney value={r.margin} />,
    },
    {
      key: "margin_pct", header: "Margin %", align: "right", sortable: true, sortAccessor: (r) => r.margin_pct ?? -Infinity,
      render: (r) => <MarginPct pct={r.margin_pct} />,
    },
  ];

  // Horizontal margin-by-job bar — teal positive / coral negative.
  const chartData = useMemo(
    () => jobs.map((j) => ({ name: j.job_number || (j.title || "").slice(0, 18) || "—", margin: j.margin })),
    [jobs]
  );

  return (
    <StellaShell
      title="Margins"
      subtitle="Profitability per job and per customer — revenue minus direct (job-tagged) cost minus allocated overhead."
      error={error}
      loading={loading && !data}
    >
      <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>Period</span>
        <PeriodPicker from={period.from} to={period.to} busy={loading} onApply={(from, to) => setPeriod({ from, to })} />
        {data && data.allocation_run_id == null && jobs.length > 0 && (
          <span style={{ fontSize: 11, color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 99, padding: "4px 10px" }}>
            No allocation run matches this exact period — overhead shows $0.00 until you run one from Allocations.
          </span>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No margin data for this period"
          description="Tag transactions to jobs and run an allocation. Margins need collected revenue, job-tagged costs, or an allocation run inside the selected period."
        />
      ) : (
        <>
          {/* Margin-by-job bar */}
          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", marginBottom: 6 }}>Margin by job</div>
            <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26 + 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={STELLA_LAVENDER} />
                <XAxis type="number" tickFormatter={(v: number) => fmtMoney(v)} tick={{ fontSize: 10, fill: "#5A7A8A" }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: "#0B1C24" }} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#94A3B8" />
                <Bar dataKey="margin" name="Margin" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.margin >= 0 ? MARGIN_TEAL : MARGIN_CORAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", margin: "0 0 8px" }}>Jobs</div>
          <DataTable
            rows={jobs}
            columns={jobColumns}
            rowKey={(r) => r.job_id}
            initialSort={{ key: "revenue", direction: "desc" }}
            emptyMessage="No jobs with revenue or cost in this period."
          />

          <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", margin: "18px 0 8px" }}>Customers</div>
          {customers.length === 0 ? (
            <EmptyState
              title="No customer margins yet"
              description="Customer margins roll up from invoiced revenue and the costs of each customer's jobs."
            />
          ) : (
            <DataTable
              rows={customers}
              columns={customerColumns}
              rowKey={(r) => r.contact_id}
              initialSort={{ key: "revenue", direction: "desc" }}
              emptyMessage="No customers with revenue in this period."
            />
          )}
        </>
      )}
    </StellaShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Reconciliation — STELLA vs OLIVER income, month by month
// ═════════════════════════════════════════════════════════════════════════════

export function StellaReconciliationPage() {
  const { get, ready } = useStellaApi();
  const [data, setData] = useState<ReconResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await get<ReconResponse>("/unit-economics/reconciliation"));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const months = data?.months || [];

  const columns: Column<ReconMonth>[] = [
    {
      key: "month", header: "Month", sortable: true, sortAccessor: (r) => r.month,
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMonthLong(r.month)}</span>,
    },
    {
      key: "stella_income", header: "STELLA (OLIVER-sourced)", align: "right",
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.stella_income)}</span>,
    },
    {
      key: "oliver_paid", header: "OLIVER collected", align: "right",
      render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.oliver_paid)}</span>,
    },
    {
      key: "delta", header: "Delta", align: "right", sortable: true, sortAccessor: (r) => Math.abs(r.delta),
      render: (r) => (
        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: Math.abs(r.delta) < 0.01 ? "#5A7A8A" : MARGIN_CORAL }}>
          {fmtMoney(r.delta)}
        </span>
      ),
    },
    {
      key: "status", header: "Status",
      render: (r) => (
        <span
          style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: r.status === "ok" ? MARGIN_TEAL_BG : MARGIN_CORAL_BG,
            color: r.status === "ok" ? MARGIN_TEAL : MARGIN_CORAL,
          }}
        >
          {r.status === "ok" ? "OK" : "Drift"}
        </span>
      ),
    },
  ];

  return (
    <StellaShell
      title="Reconciliation"
      subtitle="STELLA's ledger vs OLIVER's collected invoices, month by month."
      error={error}
      loading={loading && !data}
    >
      {/* Leading-edge rule explainer */}
      <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: STELLA_INDIGO, letterSpacing: 0.4, marginBottom: 6 }}>HOW RECONCILIATION WORKS</div>
        <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6, maxWidth: 720 }}>
          <strong>OLIVER is the leading edge</strong> — new payments land there first. The daily sync copies collected
          invoice income into STELLA's ledger; once synced, <strong>STELLA's reconciled numbers supersede</strong> as the
          trusted figure (master v2.1). A <em>Drift</em> row normally means the sync hasn't caught that month up yet —
          it clears on the next sync, not by editing either side.
        </div>
      </div>

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          {[
            { label: "OLIVER collected (all time)", value: fmtMoney(data.totals.oliver_paid), color: "#0B1C24" },
            { label: "STELLA OLIVER-sourced", value: fmtMoney(data.totals.stella_oliver_income), color: "#0B1C24" },
            { label: "Total delta", value: fmtMoney(data.totals.delta), color: data.totals.status === "ok" ? MARGIN_TEAL : MARGIN_CORAL },
            { label: "STELLA total income", value: fmtMoney(data.totals.stella_total_income), color: "#0B1C24", hint: "Includes non-OLIVER income (manual + bank feed)" },
          ].map((t) => (
            <div key={t.label} style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "12px 16px" }} title={t.hint}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.color, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{t.value}</div>
            </div>
          ))}
        </div>
      )}

      {months.length === 0 ? (
        <EmptyState
          title="Nothing to reconcile yet"
          description="Once invoices are collected in OLIVER and income lands in STELLA's ledger, each month shows up here with an OK / Drift check."
        />
      ) : (
        <DataTable
          rows={months}
          columns={columns}
          rowKey={(r) => r.month}
          initialSort={{ key: "month", direction: "desc" }}
          emptyMessage="No months to reconcile."
        />
      )}
    </StellaShell>
  );
}
