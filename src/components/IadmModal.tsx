// IadmModal — the standard modal across SPARK / OLIVER / ARION.
//
// User spec (locked 2026-05-28):
//   - STATIC size: medium (800px × 70vh) or large (1200px × 80vh).
//     Stripe pattern — same dimensions every open, whitespace if light
//     content. No content-driven jumps between calls.
//   - Ink gradient header (#0B1C24 → #1a3540, the SPARK Customer Modal look).
//     OLIVER's old white DetailDrawer header gets replaced by this so every
//     product feels the same.
//   - Product-color accent for the eyebrow + accent UI (orange for SPARK,
//     yellow for OLIVER, blue for ARION).
//   - Footer button policy: FIRST button = Core Blue (#2563eb).
//     SECOND/positive-action button = Platform SaaS color.
//   - Esc to close, click-outside to close (with the drag-text safe-guard
//     pattern OLIVER's DetailDrawer already used).
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export type IadmModalProduct = "spark" | "oliver" | "arion" | "argus" | "stella";

/**
 * IadmModalSize — F-107 modal size standards (LOCKED 2026-05-29).
 *
 * Pick the size that matches what the modal IS, not how much content it has
 * (fixed-canvas rule still applies — whitespace is expected on lightly
 * populated records). One prop, one decision:
 *
 *   "nav"     → 560 × 50vh — selection / picker / "what do you want to
 *                create?". Use for short option grids, channel pickers,
 *                kind pickers, filter chip selectors. Step 1 of a multi-step
 *                composer.
 *
 *   "info"    → 1200 × 80vh — THE STANDARD. Forms, customer info, templates,
 *                rule/list/contact editors, anything view-or-edit. Matches the
 *                OLIVER CustomerModal pattern the founder locked.
 *
 *   "report"  → 1400 × 90vh — IA Insights drilldowns, Intelligence / Trends,
 *                dashboards-in-modal. Anything with KPI tiles + charts +
 *                multi-section observations.
 *
 *   "confirm" → 420 × auto — destructive confirms ("Delete this list?"),
 *                short decisions. Replaces window.confirm().
 *
 * Deprecated aliases retained for back-compat:
 *   "md" → maps to "info"
 *   "lg" → maps to "info"
 *
 * See Global/Modal_Standards.md for the full decision tree.
 */
export type IadmModalSize = "nav" | "info" | "report" | "confirm" | "md" | "lg";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which product owns this modal — drives eyebrow + accent color. */
  product: IadmModalProduct;
  /** Optional eyebrow override; defaults to product name in UPPERCASE. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rendered on the right side of the header row, before the close X. */
  headerActions?: ReactNode;
  /** Footer area. Caller is responsible for button order (Core Blue first,
   *  Platform color second). Sticky to bottom. */
  footer?: ReactNode;
  /** "md" = 800px × 70vh.  "lg" (default) = 1200px × 80vh. */
  size?: IadmModalSize;
  children: ReactNode;
}

// F-107 — Canvas dimensions per size standard. "confirm" uses an auto height
// (the only non-fixed size — short content, no body scroll, no whitespace).
const FIXED: Record<IadmModalSize, { w: number; h: number | "auto" }> = {
  nav:     { w: 560,  h: 50 },
  info:    { w: 1200, h: 80 },
  report:  { w: 1400, h: 90 },
  confirm: { w: 420,  h: "auto" },
  // Deprecated aliases — both legacy names map to the new "info" standard.
  // Existing call sites keep working; new code should reach for nav/info/
  // report/confirm directly.
  md: { w: 1200, h: 80 },
  lg: { w: 1200, h: 80 },
};

export const PRODUCT_ACCENT: Record<IadmModalProduct, string> = {
  spark:  "#EF6C33",
  oliver: "#FEC82C",
  arion:  "#38BDF8",
  argus:  "#84CC16",
  stella: "#EF6C33", // shares SPARK family
};

/** Tailwind blue-600 — the "Core Blue" primary across the platform. */
export const CORE_BLUE = "#2563eb";

export function IadmModal({
  open, onClose, product, eyebrow, title, subtitle,
  headerActions, footer, size = "lg", children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Drag-text-safe backdrop close: close only when both mousedown AND
  // mouseup happen on the backdrop. Stops "text drag that escapes the
  // panel" from wrongly dismissing the modal.
  function onBackdropDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.iadmModalDown = "1";
    }
  }
  function onBackdropUp(e: React.MouseEvent) {
    const t = e.currentTarget as HTMLDivElement;
    if (t.dataset.iadmModalDown === "1" && e.target === t) onClose();
    delete t.dataset.iadmModalDown;
  }

  const accent = PRODUCT_ACCENT[product];
  const eyebrowText = eyebrow ?? product.toUpperCase();
  const dims = FIXED[size];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={onBackdropDown}
      onMouseUp={onBackdropUp}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{
          width:  `min(${dims.w}px, 94vw)`,
          // "auto" height (confirm only) lets the modal size to its content
          // — no body scroll, no fixed canvas. Every other size is fixed.
          height: dims.h === "auto" ? "auto" : `${dims.h}vh`,
          maxHeight: dims.h === "auto" ? "90vh" : undefined,
        }}
      >
        {/* Ink gradient header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3 text-white"
          style={{ background: "linear-gradient(to right, #0B1C24, #1a3540)" }}
        >
          <div className="min-w-0">
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {eyebrowText}
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold">{title}</h2>
            {subtitle && (
              <div className="mt-0.5 truncate text-[11px] text-white/60">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — internal scroll only. Fixed-size canvas means short
            content shows whitespace; long content scrolls. */}
        <div className="flex-1 overflow-y-auto">{children}</div>

        {/* Sticky footer (renders when footer prop is provided). */}
        {footer && (
          <div
            className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * IadmButton — standard footer button used inside IadmModal footers.
 * variant="primary" = Core Blue (first action).
 * variant="accent"  = Platform SaaS color (second action — Save / Create / Confirm).
 * variant="ghost"   = bordered white (Cancel / secondary).
 *
 * For a "danger" delete button, just inline-style it red — those are rare
 * enough that a dedicated variant isn't worth the API surface.
 */
export function IadmButton({
  variant, product, onClick, disabled, type = "button", children, icon,
}: {
  variant: "primary" | "accent" | "ghost";
  product?: IadmModalProduct;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
  icon?: ReactNode;
}) {
  const baseClass = "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";
  if (variant === "primary") {
    return (
      <button type={type} onClick={onClick} disabled={disabled} className={baseClass + " text-white"} style={{ background: CORE_BLUE }}>
        {icon}{children}
      </button>
    );
  }
  if (variant === "accent") {
    const c = product ? PRODUCT_ACCENT[product] : PRODUCT_ACCENT.spark;
    return (
      <button type={type} onClick={onClick} disabled={disabled} className={baseClass + " text-white"} style={{ background: c }}>
        {icon}{children}
      </button>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={baseClass + " border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}>
      {icon}{children}
    </button>
  );
}

export default IadmModal;
