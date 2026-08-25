// ViewRegistryPage — the customer-facing data catalog (62_STELLA_v3 §3.5
// "Tables view" + "Field viewer" in one page, per the 8-item nav cap).
//
// Left: every published view with its row count. Right: the selected view's
// fields, then its real rows — sortable, filterable, paged, tenant-scoped.
//
// A view whose `runnable` flag is false is listed but cannot be opened. That
// is the D1 security property showing through the UI: the registry is
// metadata, and only a view defined in lib/stellaViewCatalog.js can execute.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Table2, Lock } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbTable, DbPager, DbError, DbEmpty, DbLoading, DbButton, DbInput, DbSelect,
  DbField, Pill, type DbColumn,
} from "./DbManagerKit";

type ViewRow = {
  view_registry_id: string; product: string; view_key: string; display_name: string;
  access_role: string; tier_required: string; version: number; runnable: boolean;
  column_metadata: { key: string; label: string; type: string; filterable: boolean; sortable: boolean }[];
};

type RowsResponse = {
  data: Record<string, unknown>[];
  columns: DbColumn[];
  pagination: { total: number; limit: number; offset: number };
};

const OPS = [
  { key: "eq", label: "is" },
  { key: "ne", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "gt", label: "is after / above" },
  { key: "gte", label: "is on or after" },
  { key: "lt", label: "is before / below" },
  { key: "lte", label: "is on or before" },
  { key: "isnull", label: "is empty" },
  { key: "notnull", label: "is not empty" },
];

const LIMIT = 25;

export function StellaViewRegistryPage() {
  const api = useStellaApi();
  const [views, setViews] = useState<ViewRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [rowsError, setRowsError] = useState<unknown>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<string | undefined>();
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const [fCol, setFCol] = useState("");
  const [fOp, setFOp] = useState("eq");
  const [fVal, setFVal] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!api.ready) return;
    api.getFull<{ data: ViewRow[] }>("/db-manager/views")
      .then((r) => {
        setViews(r.data);
        setSelected((prev) => prev ?? r.data.find((v) => v.runnable)?.view_key ?? null);
      })
      .catch(setError);
  }, [api]);

  const view = useMemo(() => views?.find((v) => v.view_key === selected) || null, [views, selected]);

  const loadRows = useCallback(() => {
    if (!api.ready || !selected) return;
    setRowsLoading(true);
    setRowsError(null);
    const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (sort) { qs.set("sort", sort); qs.set("dir", dir); }
    if (filter) qs.set("filter", filter);
    api.getFull<RowsResponse>(`/db-manager/views/${encodeURIComponent(selected)}/rows?${qs}`)
      .then(setRows)
      .catch((e) => { setRowsError(e); setRows(null); })
      .finally(() => setRowsLoading(false));
  }, [api, selected, offset, sort, dir, filter]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Changing view resets paging/sort/filter — carrying a filter across views
  // would reference a column the new view has never heard of.
  function pick(key: string) {
    setSelected(key); setOffset(0); setSort(undefined); setDir("asc");
    setFilter(null); setFCol(""); setFVal(""); setFOp("eq");
  }

  function toggleSort(key: string) {
    const c = view?.column_metadata.find((x) => x.key === key);
    if (!c?.sortable) return;
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(key); setDir("asc"); }
    setOffset(0);
  }

  function applyFilter() {
    if (!fCol) { setFilter(null); setOffset(0); return; }
    const needsValue = fOp !== "isnull" && fOp !== "notnull";
    setFilter(needsValue ? `${fCol}:${fOp}:${fVal}` : `${fCol}:${fOp}`);
    setOffset(0);
  }

  function clearFilter() { setFilter(null); setFCol(""); setFVal(""); setFOp("eq"); setOffset(0); }

  if (error) {
    return <StellaShell title="View Registry" subtitle="Every reportable view in your data."><DbError error={error} /></StellaShell>;
  }

  const filterCols = view?.column_metadata.filter((c) => c.filterable) || [];
  const needsValue = fOp !== "isnull" && fOp !== "notnull";

  return (
    <StellaShell
      title="View Registry"
      subtitle="Every reportable view in your data — what it holds, and the rows behind it."
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 260px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Catalog */}
        <DbCard title="Views">
          {!views ? <DbLoading /> : views.length === 0 ? (
            <DbEmpty title="No views published" reason="Your data catalog has not been built yet." />
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {views.map((v) => {
                const active = v.view_key === selected;
                return (
                  <button
                    key={v.view_registry_id}
                    onClick={() => v.runnable && pick(v.view_key)}
                    disabled={!v.runnable}
                    title={v.runnable ? v.view_key : "This view is listed but not runnable."}
                    style={{
                      textAlign: "left", padding: "8px 10px", borderRadius: 7, border: 0,
                      background: active ? STELLA_LAVENDER : "transparent",
                      cursor: v.runnable ? "pointer" : "not-allowed", opacity: v.runnable ? 1 : 0.55,
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {v.runnable ? <Table2 size={13} color={active ? STELLA_INDIGO : "#94A3B8"} /> : <Lock size={13} color="#94A3B8" />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: "block", fontSize: 12, fontWeight: active ? 700 : 500,
                        color: active ? STELLA_INDIGO : "#334155",
                      }}>{v.display_name}</span>
                      <span style={{ display: "block", fontSize: 10, color: "#94A3B8" }}>
                        {v.column_metadata.length} fields
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DbCard>

        {/* Detail */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!view ? (
            <DbCard><DbEmpty title="Pick a view" reason="Choose a view on the left to see its fields and rows." /></DbCard>
          ) : (
            <>
              <DbCard>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Database size={16} color={STELLA_INDIGO} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>{view.display_name}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", fontFamily: "ui-monospace, monospace" }}>{view.view_key}</div>
                  </div>
                  <Pill tone="brand">{view.product}</Pill>
                  <Pill>{view.access_role}</Pill>
                  <Pill>v{view.version}</Pill>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {view.column_metadata.map((c) => (
                    <span key={c.key} style={{
                      border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, padding: "4px 8px",
                      fontSize: 11, color: "#334155", background: "#FAFBFF",
                    }}>
                      {c.label}<span style={{ color: "#94A3B8", marginLeft: 5, fontSize: 10 }}>{c.type}</span>
                    </span>
                  ))}
                </div>
              </DbCard>

              <DbCard
                title="Rows"
                actions={
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <div style={{ width: 150 }}>
                      <DbField label="Filter">
                        <DbSelect value={fCol} onChange={(e) => setFCol(e.target.value)}>
                          <option value="">No filter</option>
                          {filterCols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </DbSelect>
                      </DbField>
                    </div>
                    <div style={{ width: 130 }}>
                      <DbSelect value={fOp} onChange={(e) => setFOp(e.target.value)} disabled={!fCol}>
                        {OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </DbSelect>
                    </div>
                    {needsValue && (
                      <div style={{ width: 140 }}>
                        <DbInput
                          value={fVal} disabled={!fCol} placeholder="value"
                          onChange={(e) => setFVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
                        />
                      </div>
                    )}
                    <DbButton onClick={applyFilter} disabled={!fCol}>Apply</DbButton>
                    {filter && <DbButton variant="ghost" onClick={clearFilter}>Clear</DbButton>}
                  </div>
                }
              >
                <DbError error={rowsError} />
                {rowsLoading && !rows ? <DbLoading /> : rows ? (
                  <>
                    <DbTable
                      columns={rows.columns} rows={rows.data}
                      sort={sort} dir={dir} onSort={toggleSort}
                      empty={<DbEmpty
                        title={filter ? "No rows match that filter" : "This view has no rows yet"}
                        reason={filter ? "Try a different value, or clear the filter." : "As you use STELLA this view fills up on its own."}
                      />}
                    />
                    <DbPager {...rows.pagination} onPage={setOffset} />
                  </>
                ) : null}
              </DbCard>
            </>
          )}
        </div>
      </div>
    </StellaShell>
  );
}
