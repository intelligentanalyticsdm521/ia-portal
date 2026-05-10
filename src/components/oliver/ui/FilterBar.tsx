// Stripe-style filter bar: horizontal pill row + inline search, no card wrapper.
import type { ReactNode } from "react";

interface FilterPill {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  pills?: FilterPill[];
  activePill?: string;
  onPillChange?: (key: string) => void;
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  rightSlot?: ReactNode;
}

export function FilterBar({
  pills, activePill, onPillChange,
  search, onSearchChange, searchPlaceholder = "Search…",
  rightSlot,
}: Props) {
  return (
    <div className="flex items-center gap-4 flex-wrap py-2 mb-1">
      {pills && pills.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          {pills.map((p) => {
            const isActive = activePill === p.key;
            return (
              <button
                key={p.key}
                onClick={() => onPillChange?.(p.key)}
                className={`pb-1.5 transition-colors border-b-2 ${
                  isActive
                    ? "border-oliver-teal text-oliver-teal font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.label}
                {p.count != null && p.count > 0 && (
                  <span className="ml-1.5 text-xs text-slate-400">{p.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {onSearchChange && (
        <div className="ml-auto w-64">
          <input
            type="search"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 focus:outline-none"
          />
        </div>
      )}

      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
