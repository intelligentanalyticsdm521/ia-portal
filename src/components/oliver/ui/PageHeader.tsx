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
    // PHONE PASS 2026-09-06: `flexWrap` + `minWidth: 0`. At 375px this header
    // gave the title block whatever the actions did not take, so "Track every
    // job from inquiry to paid" became a four-line column ~90px wide, the
    // List/Kanban toggle clipped the "n" off Kanban, and "+ New job" wrapped
    // onto three lines. Wrapping puts the actions on their own row when they
    // do not fit and changes nothing at all above ~700px, where they always
    // did. No media query needed: the layout answers the question itself.
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12,
      background: "#fff", border: "1px solid rgba(45,156,219,0.12)",
      borderRadius: 10, padding: "14px 18px", marginBottom: 16,
    }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1C24" }}>OLIVER</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
