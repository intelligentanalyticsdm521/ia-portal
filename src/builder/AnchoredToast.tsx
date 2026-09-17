/**
 * builder/AnchoredToast.tsx — the answer appears AT the button that was pressed.
 *
 * D-20 (BUILDER_USER_TEST_2026-09-16): *"Press Send with blanks … Both print
 * red text in the far-left widget pane while the button is top-right. On a
 * 1600px screen a user sees nothing happen."* Forty minutes of work, one press,
 * and as far as the eye can tell the product ignored you.
 *
 * ── HOW IT FINDS THE BUTTON ───────────────────────────────────────────────
 * The adapter puts `data-builder-anchor="send"` on its own button and reports
 * the refusal with the same name (problems.ts). The toast measures that
 * element and sits under it. If the element has gone — a narrow layout moved
 * the buttons into the bottom bar, say — it falls back to the top centre of
 * the window rather than not appearing: a refusal that renders nowhere is the
 * defect, and any visible place beats that.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { anchorSelector } from "./problems";

export interface AnchoredToastProps {
  /** The `data-builder-anchor` of the control that was pressed. */
  anchor: string;
  message: string;
  /** Offered when the engine knows where the first problem is. */
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  /** How long it stays. 0 keeps it until it is dismissed. */
  ms?: number;
}

export function AnchoredToast(p: AnchoredToastProps) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  // Measured AFTER paint and before the browser shows the frame, so the toast
  // never appears at 0,0 and jump to the button a tick later.
  useLayoutEffect(() => {
    const el = document.querySelector(anchorSelector(p.anchor));
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    const width = 340;
    setBox({
      top: Math.min(r.bottom + 8, window.innerHeight - 140),
      left: Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12)),
    });
  }, [p.anchor, p.message]);

  useEffect(() => {
    if (!p.ms) return;
    const t = setTimeout(p.onClose, p.ms);
    return () => clearTimeout(t);
  }, [p.ms, p.onClose, p.message]);

  const style: React.CSSProperties = box
    ? { top: box.top, left: box.left }
    : { top: 16, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      role="alert"
      data-builder-toast={p.anchor}
      style={{
        position: "fixed", zIndex: 9500, width: 340, maxWidth: "calc(100vw - 24px)",
        background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 8,
        boxShadow: "0 12px 32px rgba(11,28,36,0.22)", padding: "10px 12px",
        display: "flex", gap: 8, alignItems: "flex-start", ...style,
      }}
    >
      <AlertTriangle size={15} color="#B45309" style={{ flex: "0 0 auto", marginTop: 1 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: "#7C2D12" }}>{p.message}</div>
        {p.actionLabel && p.onAction && (
          <button type="button" onClick={p.onAction} title={p.actionLabel}
            style={{ marginTop: 6, border: "1px solid #B45309", background: "#fff", color: "#7C2D12", borderRadius: 4, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {p.actionLabel}
          </button>
        )}
      </div>
      <button type="button" onClick={p.onClose} aria-label="Close" title="Close"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "#B45309", flex: "0 0 auto" }}>
        <X size={13} />
      </button>
    </div>
  );
}

export default AnchoredToast;
