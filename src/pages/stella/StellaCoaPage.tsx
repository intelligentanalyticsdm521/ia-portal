// StellaCoaPage — Ledger → Chart of Accounts.
//
// The seeded, customizable service-business COA. Reads GET /ledger/coa on
// stella-api (SELECT * over stella.coa_account).
//
// 2026-07-30 fixes: the API row is { coa_account_id, code, name, type, ... }
// with type ∈ asset | liability | equity | revenue | expense — the previous
// build read `account_type`/`account_id`, so every row rendered "Other" and
// DataTable row keys were undefined (React key collisions). Columns now match
// the real stella.coa_account schema (is_tax_deductible instead of the
// nonexistent normal_balance).
//
// 2026-08-13 management pass (Task E):
//   - "Add account" (shell action) → CoaAccountModal → POST /ledger/coa.
//   - Row actions: Edit (PATCH name/is_tax_deductible; type is IMMUTABLE on
//     the backend — changing it would re-side historical P&L lines — so the
//     modal shows it read-only) and Deactivate/Reactivate (PATCH is_active,
//     confirm() on deactivate). Inactive rows are dimmed with an "Inactive"
//     badge and hidden behind the "Show inactive" toggle (FilterBar rightSlot).
//   - REGISTER DRILL (the QBO pattern): clicking the account ROW (not its
//     action buttons) opens Transactions pre-filtered to that account via
//     /app/services/stella_ledger_transactions?coa=<id> — the Transactions
//     page reads ?coa, passes ?coa_account_id to the API, and shows a
//     dismissible "Account: …" chip.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStellaApi } from "../../hooks/useStellaApi";
import { Button, DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

interface CoaAccount {
  coa_account_id: string;
  code: string | null;
  name: string;
  type: string | null; // asset | liability | equity | revenue | expense
  is_tax_deductible: boolean | number | null;
  is_active: boolean | number | null;
  sort_order: number | null;
}

const TYPE_LABEL: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  revenue: { bg: "#D1FAE5", color: "#047857" },
  expense: { bg: "#E0E7FF", color: "#3730A3" },
  asset: { bg: "#DBEAFE", color: "#1E40AF" },
  liability: { bg: "#FCE7F3", color: "#9D174D" },
  equity: { bg: "#CCFBF1", color: "#0F766E" },
  other: { bg: "#F1F5F9", color: "#475569" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "revenue", label: "Revenue" },
  { key: "expense", label: "Expenses" },
  { key: "asset", label: "Assets" },
  { key: "liability", label: "Liabilities" },
  { key: "equity", label: "Equity" },
];

const isInactive = (r: CoaAccount) => r.is_active === false || r.is_active === 0;

export function StellaCoaPage() {
  const { get, patch, post, ready } = useStellaApi();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // 2026-09-01 — a new business had NO way to get a chart of accounts.
  // lib/coaSeed.js holds the standard ~40-account COA and its own comment
  // says it is seeded on new-tenant setup, but nothing ever called it: the
  // only path is POST /ledger/coa {seed:true}, which no screen sent. So this
  // empty state described seeding while offering no way to do it, and every
  // downstream STELLA surface was unusable — including the OLIVER income
  // sync, which needs account 4000 and silently imports nothing without it.
  const [seeding, setSeeding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; account: CoaAccount } | null>(null);
  const [flash, setFlash] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<CoaAccount[]>("/ledger/coa");
      setRows(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  function flashMsg(msg: string, kind: "ok" | "err" = "ok") {
    setFlash({ msg, kind });
    setTimeout(() => setFlash(null), 4000);
  }

  const inactiveCount = useMemo(() => rows.filter(isInactive).length, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (!showInactive) out = out.filter((r) => !isInactive(r));
    if (filter !== "all") out = out.filter((r) => r.type === filter);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q));
    return out;
  }, [rows, filter, search, showInactive]);

  // Deactivate/reactivate — PATCH is_active. Deactivating asks first: the
  // account drops out of pickers but history stays intact.
  async function toggleActive(r: CoaAccount) {
    const inactive = isInactive(r);
    if (
      !inactive &&
      !confirm(
        `Deactivate "${r.name}"? It disappears from account pickers and new entries, but every transaction already posted to it stays intact. You can reactivate it any time.`
      )
    )
      return;
    setBusyId(r.coa_account_id);
    try {
      await patch(`/ledger/coa/${r.coa_account_id}`, { is_active: inactive });
      flashMsg(inactive ? `Reactivated "${r.name}".` : `Deactivated "${r.name}". Use "Show inactive" to see it.`);
      await reload();
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : "Could not update the account. Please try again.", "err");
    } finally {
      setBusyId(null);
    }
  }

  // Dim every informational cell on inactive rows (badge + actions stay full).
  const dim = (r: CoaAccount): React.CSSProperties | undefined => (isInactive(r) ? { opacity: 0.45 } : undefined);

  const columns: Column<CoaAccount>[] = [
    {
      key: "code",
      header: "Code",
      width: "90px",
      sortable: true,
      sortAccessor: (r) => r.code || "",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums", ...dim(r) }}>{r.code || "—"}</span>
      ),
    },
    {
      key: "name",
      header: "Account",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", ...dim(r) }}>{r.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortAccessor: (r) => r.type || "",
      render: (r) => {
        const t = r.type || "other";
        const c = TYPE_COLOR[t] || TYPE_COLOR.other;
        return (
          <span
            style={{
              display: "inline-block", padding: "3px 9px", borderRadius: 99,
              background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, ...dim(r),
            }}
          >
            {TYPE_LABEL[t] || t}
          </span>
        );
      },
    },
    {
      key: "is_tax_deductible",
      header: "Tax deductible",
      render: (r) =>
        r.is_tax_deductible === true || r.is_tax_deductible === 1 ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857", ...dim(r) }}>Deductible</span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8", ...dim(r) }}>—</span>
        ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (r) =>
        isInactive(r) ? (
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 600 }}>
            Inactive
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857" }}>Active</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      // stopPropagation so the buttons never trigger the row's register drill.
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button style={actionBtn} disabled={busyId === r.coa_account_id} onClick={() => setModal({ mode: "edit", account: r })}>
            Edit
          </button>
          <button style={actionBtn} disabled={busyId === r.coa_account_id} onClick={() => toggleActive(r)}>
            {busyId === r.coa_account_id ? "…" : isInactive(r) ? "Reactivate" : "Deactivate"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <StellaShell
      title="Chart of Accounts"
      subtitle="Your seeded, customizable service-business chart of accounts — the backbone of every report."
      showRecord
      actions={
        <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={() => setModal({ mode: "create" })}>
          + Add account
        </Button>
      }
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div
          style={{
            marginBottom: 12, padding: "8px 12px", fontSize: 12, borderRadius: 8,
            background: flash.kind === "ok" ? "#D1FAE5" : "#FEF2F2",
            color: flash.kind === "ok" ? "#047857" : "#991B1B",
            border: `1px solid ${flash.kind === "ok" ? "#A7F3D0" : "#FECACA"}`,
          }}
        >
          {flash.msg}
        </div>
      )}

      {!rows.length && !loading ? (
        <EmptyState
          title="Set up your chart of accounts"
          description="A chart of accounts is the list of buckets your money moves between — cash, sales, materials, fuel. Nothing else in the ledger works without it. We'll create the standard set for a service business; rename, add or hide any of them afterwards."
          action={
            <Button
              onClick={async () => {
                setSeeding(true);
                setError(null);
                try {
                  await post("/ledger/coa", { seed: true });
                  await reload();
                } catch (e) {
                  setError(e);
                } finally {
                  setSeeding(false);
                }
              }}
              disabled={seeding}
            >
              {seeding ? "Setting up…" : "Create my chart of accounts"}
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
            searchPlaceholder="Search by account name or code…"
            rightSlot={
              <button
                onClick={() => setShowInactive((v) => !v)}
                title="Include deactivated accounts in the list"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 99,
                  border: `1px solid ${showInactive ? STELLA_INDIGO : STELLA_LAVENDER}`,
                  background: showInactive ? STELLA_INDIGO : "#fff",
                  color: showInactive ? "#fff" : "#0B1C24",
                  cursor: "pointer",
                }}
              >
                Show inactive
                {inactiveCount > 0 && (
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                      background: showInactive ? "rgba(255,255,255,0.22)" : "#F1F5F9",
                      color: showInactive ? "#fff" : "#64748B",
                    }}
                  >
                    {inactiveCount}
                  </span>
                )}
              </button>
            }
          />
          <div style={{ fontSize: 11, color: "#94A3B8", margin: "-6px 0 8px" }}>
            Click an account to see its transactions.
          </div>
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.coa_account_id}
            onRowClick={(r) => navigate(`/app/services/stella_ledger_transactions?coa=${r.coa_account_id}`)}
            initialSort={{ key: "code", direction: "asc" }}
            emptyMessage="No accounts match these filters."
          />
        </>
      )}

      {modal && (
        <CoaAccountModal
          account={modal.mode === "edit" ? modal.account : null}
          onClose={() => setModal(null)}
          onSaved={(msg) => {
            setModal(null);
            flashMsg(msg);
            reload();
          }}
        />
      )}
    </StellaShell>
  );
}

/**
 * CoaAccountModal — create ("Add account") + edit, one modal.
 * Create: POST /ledger/coa { code, name, type, is_tax_deductible }.
 * Edit:   PATCH /ledger/coa/:id { name, is_tax_deductible } — code and type
 * render read-only: the PATCH allowlist excludes code, and type is immutable
 * on the backend (400 "type is immutable") because re-typing an account would
 * silently re-side every historical P&L line posted to it.
 */
function CoaAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account: CoaAccount | null; // null = create
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { post, patch } = useStellaApi();
  const isEdit = !!account;

  const [code, setCode] = useState(account?.code || "");
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || "expense");
  const [deductible, setDeductible] = useState(account ? account.is_tax_deductible === true || account.is_tax_deductible === 1 : false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 0 && !!type;

  async function submit() {
    if (!valid || saving) return;
    setErr(null);
    setSaving(true);
    try {
      if (isEdit) {
        await patch(`/ledger/coa/${account!.coa_account_id}`, {
          name: name.trim(),
          is_tax_deductible: deductible,
        });
        onSaved(`Saved changes to "${name.trim()}".`);
      } else {
        await post("/ledger/coa", {
          code: code.trim() || null,
          name: name.trim(),
          type,
          is_tax_deductible: deductible,
        });
        onSaved(`Added account "${name.trim()}".`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${STELLA_LAVENDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>
            {isEdit ? "Edit account" : "Add account"}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
            <label>
              <span style={mLabel}>Code</span>
              {isEdit ? (
                <div style={{ ...mInput, background: "#F8FAFC", color: "#5A7A8A" }}>{code || "—"}</div>
              ) : (
                <input style={mInput} placeholder="e.g. 6055" value={code} onChange={(e) => setCode(e.target.value)} />
              )}
            </label>
            <label>
              <span style={mLabel}>Name</span>
              <input
                style={mInput}
                placeholder="e.g. Small Tools & Equipment"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>
          <label>
            <span style={mLabel}>Type</span>
            {isEdit ? (
              <>
                <div style={{ ...mInput, background: "#F8FAFC", color: "#5A7A8A" }}>
                  {TYPE_LABEL[type || ""] || type || "—"}
                </div>
                <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 4, lineHeight: 1.4 }}>
                  Type can't be changed — your historical reports depend on it. Deactivate this account and add a new one instead.
                </span>
              </>
            ) : (
              <select style={mInput} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="expense">Expense</option>
                <option value="revenue">Revenue</option>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
              </select>
            )}
          </label>
          <label
            style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
              border: `1px solid ${deductible ? STELLA_INDIGO : STELLA_LAVENDER}`,
              background: deductible ? "#EEF0FB" : "#fff",
              borderRadius: 6, cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>Tax deductible</span>
              <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginTop: 2, lineHeight: 1.45 }}>
                Amounts posted here count toward deductible totals on tax-time reports.
              </span>
            </span>
          </label>
          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={submit} disabled={saving || !valid}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add account"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
  border: `1px solid ${STELLA_LAVENDER}`, background: "#fff", color: "#0B1C24", cursor: "pointer",
  whiteSpace: "nowrap",
};
const mLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const mInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid #E8E9FA", borderRadius: 6, background: "#fff", color: "#0B1C24" };
