// StellaVendorsPage — Ledger → Vendors & Customers.
//
// Counterparties: vendors, subcontractors, customers, and employees, with
// W-9 / 1099 / TIN tracking. Customers resolve from lumen.contact. Reads
// GET /ledger/vendors on stella-api (over stella.counterparty).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { StellaShell } from "./StellaShell";

interface Counterparty {
  counterparty_id: string;
  name: string;
  kind: string | null; // vendor | customer | subcontractor | employee
  w9_on_file: boolean | null;
  is_1099: boolean | null;
  tin_last4: string | null;
  email: string | null;
}

const KIND_PILL: Record<string, { bg: string; color: string; label: string }> = {
  vendor: { bg: "#E0E7FF", color: "#3730A3", label: "Vendor" },
  customer: { bg: "#D1FAE5", color: "#047857", label: "Customer" },
  subcontractor: { bg: "#FEF3C7", color: "#92400E", label: "Subcontractor" },
  employee: { bg: "#F3E8FF", color: "#6B21A8", label: "Employee" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "vendor", label: "Vendors" },
  { key: "customer", label: "Customers" },
  { key: "subcontractor", label: "Subcontractors" },
  { key: "employee", label: "Employees" },
];

export function StellaVendorsPage() {
  const { get, ready } = useStellaApi();
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<Counterparty[]>("/ledger/vendors");
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
    if (filter !== "all") out = out.filter((r) => (r.kind || "vendor") === filter);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q));
    return out;
  }, [rows, filter, search]);

  const columns: Column<Counterparty>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortAccessor: (r) => r.name.toLowerCase(),
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name}</div>
          {r.email && <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.email}</div>}
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (r) => {
        const p = KIND_PILL[r.kind || "vendor"] || KIND_PILL.vendor;
        return (
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
            {p.label}
          </span>
        );
      },
    },
    {
      key: "w9_on_file",
      header: "W-9",
      align: "center",
      render: (r) =>
        r.w9_on_file ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857" }}>On file</span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
        ),
    },
    {
      key: "is_1099",
      header: "1099",
      align: "center",
      render: (r) =>
        r.is_1099 ? (
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700 }}>
            1099
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
        ),
    },
    {
      key: "tin_last4",
      header: "TIN",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums" }}>{r.tin_last4 ? `•••••${r.tin_last4}` : "—"}</span>,
    },
  ];

  return (
    <StellaShell
      title="Vendors & Customers"
      subtitle="Everyone you pay and everyone who pays you — with W-9, 1099, and TIN tracking."
      error={error}
      loading={loading && !rows.length}
    >
      {!rows.length && !loading ? (
        <EmptyState
          title="No counterparties yet"
          description="Vendors and subcontractors are created as you categorize spend; customers resolve from your contacts. They'll collect here with their W-9 and 1099 status."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name or email…"
          />
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.counterparty_id} emptyMessage="No counterparties match these filters." />
        </>
      )}
    </StellaShell>
  );
}
