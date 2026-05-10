// FilterBar using ARION's .ptabs pattern (segmented control). Search on right.
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      {pills && pills.length > 0 && (
        <div className="ptabs">
          {pills.map((p) => (
            <button
              key={p.key}
              className={`ptab${activePill === p.key ? " active" : ""}`}
              onClick={() => onPillChange?.(p.key)}
            >
              {p.label}
              {p.count != null && p.count > 0 && (
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{p.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {onSearchChange && (
        <input
          type="search"
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            marginLeft: "auto",
            width: 240,
            padding: "6px 10px",
            border: "1px solid rgba(45,156,219,0.22)",
            borderRadius: 6,
            fontSize: 12,
            outline: "none",
          }}
        />
      )}

      {rightSlot && <div style={{ display: "flex", gap: 8 }}>{rightSlot}</div>}
    </div>
  );
}
