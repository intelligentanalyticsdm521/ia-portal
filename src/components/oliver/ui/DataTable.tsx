// Tabular data using ARION's .tbl pattern.
import { useMemo, useState, type ReactNode } from "react";

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
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  initialSort?: { key: string; direction: "asc" | "desc" };
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, rowClassName,
  emptyMessage = "No records found.", emptyAction, initialSort,
}: Props<T>) {
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

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="tbl" style={{ width: "100%" }}>
        <thead>
          <tr>
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
            return (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={extra}
                style={{
                  cursor: onRowClick ? "pointer" : undefined,
                }}
                onMouseEnter={onRowClick ? (e) => (e.currentTarget.style.background = "#F8FAFC") : undefined}
                onMouseLeave={onRowClick ? (e) => (e.currentTarget.style.background = "") : undefined}
              >
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
