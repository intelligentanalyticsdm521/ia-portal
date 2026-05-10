import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { delta: number; label: string }; // delta in %, positive or negative
  tone?: "neutral" | "good" | "warn" | "bad";
}

const toneStyles: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "text-oliver-teal",
  good:    "text-emerald-600",
  warn:    "text-amber-600",
  bad:     "text-red-600",
};

export function KPICard({ label, value, hint, trend, tone = "neutral" }: Props) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneStyles[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      {trend && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
          trend.delta > 0 ? "text-emerald-600" : trend.delta < 0 ? "text-red-600" : "text-slate-500"
        }`}>
          {trend.delta > 0 ? "▲" : trend.delta < 0 ? "▼" : "—"}
          {Math.abs(trend.delta).toFixed(1)}% {trend.label}
        </div>
      )}
    </div>
  );
}
