// Page header that matches ARION's pattern: site/business badge on left,
// breadcrumb in center, primary action on right. Lightweight, no shadows.
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#fff", border: "1px solid rgba(45,156,219,0.12)",
      borderRadius: 10, padding: "14px 18px", marginBottom: 16,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1C24" }}>OLIVER</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}
