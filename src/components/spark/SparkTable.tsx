import type { ReactNode } from "react";

export interface SparkTableColumn<T> {
  key: string;
  header: string;
  /** Render cell content for a row */
  cell: (row: T) => ReactNode;
  /** Optional width: "narrow" (80px), "compact" (140px), "wide" (auto/grow), or explicit "px". Default grow. */
  width?: "narrow" | "compact" | "wide" | string;
  align?: "left" | "right" | "center";
  /** If true, this column is hidden on small screens */
  hideOnMobile?: boolean;
}

export interface SparkTableProps<T> {
  rows: T[];
  columns: SparkTableColumn<T>[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Row-level action icons that appear on hover at the right edge */
  rowActions?: (row: T) => ReactNode;
  emptyState?: ReactNode;
  /** Optional total count for "Showing X of Y" footer */
  totalCount?: number;
  /** Optional page info ({page, pageSize, onPageChange}) */
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

/**
 * SparkTable — compact data-dense table for list pages.
 *
 * Brevo-style: ~38px row height, row hover highlight, action icons appear on
 * hover at the right edge, no nested cards. Header row sticky on scroll.
 */
export function SparkTable<T>({
  rows, columns, getRowKey, onRowClick, rowActions, emptyState, totalCount, pagination,
}: SparkTableProps<T>) {
  const widthClass = (w: SparkTableColumn<T>["width"]) => {
    if (!w) return "";
    if (w === "narrow") return "w-20";
    if (w === "compact") return "w-36";
    if (w === "wide") return "";
    return ""; // explicit px would be applied via style
  };
  const widthStyle = (w: SparkTableColumn<T>["width"]): React.CSSProperties => {
    if (!w || w === "narrow" || w === "compact" || w === "wide") return {};
    return { width: w };
  };
  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="spark-table-wrap">
      <table className="spark-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${widthClass(col.width)} ${alignClass(col.align)} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}
                style={widthStyle(col.width)}
              >
                {col.header}
              </th>
            ))}
            {rowActions && <th className="w-12"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-12 text-center">
                {emptyState ?? <span className="text-sm text-slate-400">No results</span>}
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr
                key={getRowKey(row)}
                className={`spark-table-row ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`${alignClass(col.align)} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="spark-table-row-actions" onClick={e => e.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {(totalCount !== undefined || pagination) && (
        <div className="spark-table-footer">
          {totalCount !== undefined && (
            <span className="text-xs text-slate-500">
              {pagination ? (
                <>Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, totalCount)} of {totalCount.toLocaleString()}</>
              ) : (
                <>{totalCount.toLocaleString()} {totalCount === 1 ? "result" : "results"}</>
              )}
            </span>
          )}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
                disabled={pagination.page === 1}
                className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Prev
              </button>
              <span className="px-2">Page {pagination.page} / {pagination.totalPages}</span>
              <button
                onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
