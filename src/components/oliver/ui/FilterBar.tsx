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
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card px-3 py-2 mb-4 flex items-center gap-3 flex-wrap">
      {pills && pills.length > 0 && (
        <div className="flex items-center gap-1">
          {pills.map((p) => {
            const isActive = activePill === p.key;
            return (
              <button
                key={p.key}
                onClick={() => onPillChange?.(p.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${
                  isActive
                    ? "bg-oliver-teal text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
                {p.count != null && (
                  <span className={`ml-1.5 ${isActive ? "text-white/80" : "text-slate-400"}`}>
                    {p.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {onSearchChange && (
        <div className="flex-1 min-w-[180px]">
          <input
            type="search"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white focus:border-oliver-gold focus:ring-1 focus:ring-oliver-gold focus:outline-none"
          />
        </div>
      )}

      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
