// Tabular data using ARION's .tbl pattern.
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | null | undefined;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  // The click is passed too, so a page can read shiftKey (range selection).
  onRowClick?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  rowClassName?: (row: T) => string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  initialSort?: { key: string; direction: "asc" | "desc" };
  // Multi-select. When `selectedIds` is provided the table renders a
  // checkbox column. `isRowSelectable` opts individual rows in/out (used to
  // gate selection by status, e.g. only draft invoices).
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  // Optional: the page decides what a row checkbox click does (it gets the
  // click, so shift-click can select a range). Without it the checkbox
  // toggles that one row, as before.
  onRowCheckboxClick?: (row: T, e: MouseEvent<HTMLInputElement>) => void;
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, rowClassName,
  emptyMessage = "No records found.", emptyAction, initialSort,
  selectedIds, onSelectionChange, isRowSelectable, onRowCheckboxClick,
}: Props<T>) {
  const selectable = !!(selectedIds && onSelectionChange);
  const [sort, setSort] = useState(initialSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortAccessor) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortAccessor!(a);
      const bv = col.sortAccessor!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sort.direction === "asc" ? -1 : 1;
      if (av > bv) return sort.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, direction: "asc" };
      if (cur.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  if (!rows.length) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ color: "#5A7A8A", fontSize: 13 }}>{emptyMessage}</div>
        {emptyAction && <div style={{ marginTop: 14 }}>{emptyAction}</div>}
      </div>
    );
  }

  const eligibleRows = selectable ? sortedRows.filter((r) => !isRowSelectable || isRowSelectable(r)) : [];
  const allSelected = selectable && eligibleRows.length > 0 && eligibleRows.every((r) => selectedIds!.has(rowKey(r)));
  const someSelected = selectable && eligibleRows.some((r) => selectedIds!.has(rowKey(r))) && !allSelected;

  function toggleRow(id: string) {
    if (!selectable) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange!(next);
  }
  function toggleAll() {
    if (!selectable) return;
    if (allSelected) {
      const next = new Set(selectedIds);
      eligibleRows.forEach((r) => next.delete(rowKey(r)));
      onSelectionChange!(next);
    } else {
      const next = new Set(selectedIds);
      eligibleRows.forEach((r) => next.add(rowKey(r)));
      onSelectionChange!(next);
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="tbl" style={{ width: "100%" }}>
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  disabled={!eligibleRows.length}
                  aria-label="Select all"
                />
              </th>
            )}
            {columns.map((c) => {
              const isSorting = sort?.key === c.key;
              const align = c.align === "right" ? "right" : c.align === "center" ? "center" : "left";
              return (
                <th
                  key={c.key}
                  style={{
                    textAlign: align,
                    cursor: c.sortable ? "pointer" : undefined,
                    userSelect: "none",
                  }}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.header}
                  {c.sortable && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: isSorting ? "#0B1C24" : "#CBD5E1" }}>
                      {isSorting ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const extra = rowClassName?.(row) ?? "";
            const id = rowKey(row);
            const eligible = !isRowSelectable || isRowSelectable(row);
            const isSelected = selectable && selectedIds!.has(id);
            return (
              <tr
                key={id}
                onClick={(e) => onRowClick?.(row, e)}
                className={extra}
                style={{
                  cursor: onRowClick ? "pointer" : undefined,
                  background: isSelected ? "#E8F4FB" : undefined,
                }}
                onMouseEnter={onRowClick ? (e) => { if (!isSelected) e.currentTarget.style.background = "#F8FAFC"; } : undefined}
                onMouseLeave={onRowClick ? (e) => { if (!isSelected) e.currentTarget.style.background = ""; } : undefined}
              >
                {selectable && (
                  <td style={{ textAlign: "center", width: 36 }} onClick={(e) => e.stopPropagation()}>
                    {eligible ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onRowCheckboxClick ? () => {} : () => toggleRow(id)}
                        onClick={onRowCheckboxClick ? (e) => onRowCheckboxClick(row, e) : undefined}
                        aria-label={`Select row ${id}`}
                      />
                    ) : null}
                  </td>
                )}
                {columns.map((c) => {
                  const align = c.align === "right" ? "right" : c.align === "center" ? "center" : "left";
                  return (
                    <td key={c.key} style={{ textAlign: align }}>
                      {c.render ? c.render(row) : ((row as never)[c.key as never] as ReactNode)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
