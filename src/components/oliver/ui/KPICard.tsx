// Stripe-style inline metric: just label + number, no boxes or shadows.
// Use these in a horizontal row at the top of a page (Stripe invoice / payment overview style).
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function KPICard({ label, value, hint }: Props) {
  return (
    <div className="pr-8">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
