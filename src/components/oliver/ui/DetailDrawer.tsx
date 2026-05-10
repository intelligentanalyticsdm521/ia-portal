// Modal-style detail view (Stripe-like — centered, clickable backdrop).
// Mirrors ARION's DetailsModal pattern from src/arion/components/Ui.tsx.
import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "md" | "lg" | "xl";
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const widthPx: Record<NonNullable<Props["width"]>, number> = {
  md: 600,
  lg: 900,
  xl: 1200,
};

export function DetailDrawer({ open, onClose, title, subtitle, width = "lg", headerActions, footer, children }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 12,
          maxWidth: widthPx[width], width: "94vw", maxHeight: "90vh",
          display: "flex", flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #eee",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5 }}>OLIVER</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {headerActions}
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999", padding: "0 4px" }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 20px" }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: "12px 24px", borderTop: "1px solid #eee",
            display: "flex", justifyContent: "flex-end", gap: 8, background: "#FAFBFC",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
