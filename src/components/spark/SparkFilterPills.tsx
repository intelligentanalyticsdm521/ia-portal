import type { ReactNode } from "react";

export interface SparkFilterPill {
  key: string;
  label: string;
  count?: number;
}

export interface SparkFilterPillsProps {
  pills: SparkFilterPill[];
  active: string;
  onChange: (key: string) => void;
  /** Extra controls on the right (e.g. search box, secondary filters) */
  right?: ReactNode;
}

/**
 * Pill filter row above tables — Brevo/Pipedrive pattern.
 * Replaces dropdown filters with quick-tap chips.
 */
export function SparkFilterPills({ pills, active, onChange, right }: SparkFilterPillsProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {pills.map(p => {
          const isActive = p.key === active;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className={`spark-pill ${isActive ? "spark-pill-active" : ""}`}
            >
              <span>{p.label}</span>
              {p.count !== undefined && (
                <span className={`spark-pill-count ${isActive ? "spark-pill-count-active" : ""}`}>
                  {p.count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}
