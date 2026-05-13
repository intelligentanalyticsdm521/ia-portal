import type { ComponentType } from "react";

export interface SparkStat {
  label: string;
  value: string | number;
  delta?: string;            // e.g. "+12% vs last 30d"
  deltaPositive?: boolean;
  accent?: "default" | "emerald" | "amber" | "rose" | "blue" | "purple";
  icon?: ComponentType<{ className?: string }>;
}

/**
 * Horizontal stat strip — Brevo/HubSpot-style.
 *
 * One row of compact stats, separated by vertical dividers. ~64px tall.
 * Use at the top of list pages instead of a 4-card grid (which eats 200px).
 */
export function SparkStatStrip({ stats }: { stats: SparkStat[] }) {
  if (!stats.length) return null;
  const colors: Record<string, string> = {
    default: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
  };
  return (
    <div className="spark-stat-strip">
      {stats.map((s, i) => {
        const Icon = s.icon;
        const accent = colors[s.accent || "default"];
        return (
          <div key={i} className="spark-stat-item">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{s.label}</span>
            </div>
            <div className={`text-xl font-semibold mt-0.5 ${accent}`}>{s.value}</div>
            {s.delta && (
              <div className={`text-[11px] mt-0.5 ${s.deltaPositive ? "text-emerald-600" : "text-rose-600"}`}>
                {s.deltaPositive ? "↑" : "↓"} {s.delta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
