import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string; // tailwind width class
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
    const sorted = [...rows].sort((a, b) => {
      const av = col.sortAccessor!(a);
      const bv = col.sortAccessor!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sort.direction === "asc" ? -1 : 1;
      if (av > bv) return sort.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
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
      <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-12 text-center">
        <p className="text-sm text-slate-500">{emptyMessage}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => {
              const isSorting = sort?.key === c.key;
              const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
              return (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-medium ${align} ${c.width ?? ""} ${c.sortable ? "cursor-pointer select-none hover:text-oliver-teal" : ""}`}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.header}
                  {c.sortable && (
                    <span className="ml-1 text-[10px]">
                      {isSorting ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedRows.map((row) => {
            const extra = rowClassName?.(row) ?? "";
            return (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? "cursor-pointer hover:bg-oliver-gold-50/50" : ""} ${extra}`}
              >
                {columns.map((c) => {
                  const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                  return (
                    <td key={c.key} className={`px-4 py-3 ${align} text-slate-700`}>
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
