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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { StellaShell } from "./StellaShell";

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

export function StellaCoaPage() {
  const { get, ready } = useStellaApi();
  const [rows, setRows] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter((r) => r.type === filter);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q));
    return out;
  }, [rows, filter, search]);

  const columns: Column<CoaAccount>[] = [
    {
      key: "code",
      header: "Code",
      width: "90px",
      sortable: true,
      sortAccessor: (r) => r.code || "",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums" }}>{r.code || "—"}</span>,
    },
    {
      key: "name",
      header: "Account",
      render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name}</span>,
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
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: c.bg, color: c.color, fontSize: 11, fontWeight: 600 }}>
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
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857" }}>Deductible</span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
        ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (r) =>
        r.is_active === false || r.is_active === 0 ? (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Inactive</span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857" }}>Active</span>
        ),
    },
  ];

  return (
    <StellaShell
      title="Chart of Accounts"
      subtitle="Your seeded, customizable service-business chart of accounts — the backbone of every report."
      error={error}
      loading={loading && !rows.length}
    >
      {!rows.length && !loading ? (
        <EmptyState
          title="Chart of Accounts not seeded yet"
          description="Every business starts with a standard service-business chart of accounts. Once seeded, your accounts appear here and you can add or rename them to match how you run the books."
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
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.coa_account_id}
            initialSort={{ key: "code", direction: "asc" }}
            emptyMessage="No accounts match these filters."
          />
        </>
      )}
    </StellaShell>
  );
}
