import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1C24" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 6, maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
