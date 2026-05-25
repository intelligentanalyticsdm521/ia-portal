// Modal-style detail view (Stripe-like — centered, clickable backdrop).
// Mirrors ARION's DetailsModal pattern from src/arion/components/Ui.tsx.
import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "md" | "lg" | "xl";
  /**
   * Sizing mode. Defaults to "fluid" — width capped, height up to 90vh.
   *
   * "fixed" gives Stripe-style stable dimensions: 1200px × 80vh regardless
   * of content (whitespace inside on light records). Use this for any modal
   * that opens from multiple entry points so the layout doesn't jump
   * between calls. Width is fixed (still respects 94vw on narrow screens);
   * height is fixed; internal scroll handles overflow.
   */
  size?: "fluid" | "fixed";
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const widthPx: Record<NonNullable<Props["width"]>, number> = {
  md: 600,
  lg: 900,
  xl: 1200,
};

// Stripe-style fixed canvas — same dimensions every time the modal opens
// so opening from Job Board / Subscriptions / Contacts all feels the same.
const FIXED_WIDTH = 1200;
const FIXED_HEIGHT_VH = 80;

export function DetailDrawer({ open, onClose, title, subtitle, width = "lg", size = "fluid", headerActions, footer, children }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  // Close on backdrop click — but ONLY if the click STARTED on the backdrop.
  // Without the mousedown check, text drag-selection that begins inside the
  // panel and ends outside it (mouseup on backdrop) wrongly closes the modal.
  // The fix: track which element received mousedown; only close when both
  // the down AND up happened on the backdrop itself.
  function handleBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      // Defer the close to the mouseup so a stray text-select that escapes
      // the panel never triggers it.
      (e.currentTarget as HTMLDivElement).dataset.backdropDown = "1";
    }
  }
  function handleBackdropMouseUp(e: React.MouseEvent) {
    const target = e.currentTarget as HTMLDivElement;
    if (target.dataset.backdropDown === "1" && e.target === target) {
      onClose();
    }
    delete target.dataset.backdropDown;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        style={
          size === "fixed"
            ? {
                background: "#fff", borderRadius: 12,
                width: `min(${FIXED_WIDTH}px, 94vw)`,
                height: `${FIXED_HEIGHT_VH}vh`,
                display: "flex", flexDirection: "column",
              }
            : {
                background: "#fff", borderRadius: 12,
                maxWidth: widthPx[width], width: "94vw", maxHeight: "90vh",
                display: "flex", flexDirection: "column",
              }
        }
        onMouseDown={(e) => e.stopPropagation()}
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
