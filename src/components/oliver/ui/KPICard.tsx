// Stat tile matching ARION's .stat-card pattern.
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function KPICard({ label, value, hint }: Props) {
  return (
    <div className="stat-card">
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}</div>
      {hint && <div className="stat-delta neu">{hint}</div>}
    </div>
  );
}
