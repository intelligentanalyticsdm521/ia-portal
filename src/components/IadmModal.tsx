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
// The size table lives in its own module so a test can drive it without a DOM
// (the Portal runner is `node --test` over pure modules). One table, one home.
import {
  MODAL_SIZES, BUILDER_PANE_WIDTH, BUILDER_INSPECTOR_WIDTH,
  type IadmModalSize,
} from "./iadmModalSizes";

export type IadmModalProduct = "spark" | "oliver" | "arion" | "argus" | "stella" | "forge";

/**
 * IadmModalSize — F-107 modal size standards, plus the 2026-09-15 "builder"
 * surface. The table, every dimension and the reasoning now live in
 * ./iadmModalSizes.ts; this re-export keeps the 102 call sites importing the
 * type from where they always have.
 */
export type { IadmModalSize } from "./iadmModalSizes";

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
  /** Which surface this is. See ./iadmModalSizes.ts for the table and the
   *  reasoning. "builder" is the full-viewport three-pane shell every builder
   *  gets (SD-010 addendum, 2026-09-15). */
  size?: IadmModalSize;
  /**
   * Raise the modal above a same-layer element. The backdrop is z-50, which
   * ties with any nav drawer also at z-50 — and a tie is decided by DOM order,
   * which is not something a caller controls. FORGE hits this: its drawer
   * stays mounted off-screen at desktop widths, so it kept an invisible hit
   * area over the modal's tab strip. Opt-in, so no existing call site moves.
   */
  z?: number;
  /**
   * When the title and the header's buttons cannot share one row, put the
   * buttons on a second row instead of squeezing the title to nothing. The
   * title column keeps at least HEADER_TITLE_MIN_PX.
   *
   * Pane test 2 Oct 2026 at 1024×768 (CPP-T2, CPP-T3): the proposal builder's
   * nine header buttons took the whole row, the title column shrank to a
   * sliver, the title box could not be clicked (its 420px overflowed under the
   * buttons and the customer search) and the "Sent to …" line wrapped one word
   * per line, pushing the canvas to the bottom third. BuilderFrame turns this
   * on for its wide layout; its narrow layout moves the buttons to the bottom
   * bar instead. Opt-in, so no other call site moves.
   */
  wrapHeader?: boolean;
  children: ReactNode;
}

/** The narrowest the title column gets in a wrapping header — room for a
 *  builder's title box (ProposalBuilder's is 420px) and a sentence under it. */
export const HEADER_TITLE_MIN_PX = 420;

export const PRODUCT_ACCENT: Record<IadmModalProduct, string> = {
  spark:  "#EF6C33",
  oliver: "#FEC82C",
  arion:  "#38BDF8",
  argus:  "#84CC16",
  // 2026-07-30 — STELLA has its own locked identity (Indigo #4C5BD4, matching
  // IconRail/SubNav tags); it no longer borrows the SPARK orange.
  stella: "#4C5BD4",
  // 2026-08-26 — FORGE (custom software; HESTIA is its first build) uses the
  // teal already carried by productTheme and the IconRail.
  forge: "#0F766E",
};

/** Tailwind blue-600 — the "Core Blue" primary across the platform. */
export const CORE_BLUE = "#2563eb";

/**
 * The ink header's foreground, published as CSS custom properties so anything
 * drawn inside the header reads it instead of hard-coding a colour.
 *
 * 2026-09-25 (Brandon, walk W-OB-05): "the month/day is black and hard to read
 * the buttons are also black … make sure that nothing in the head on the
 * calendars is black." The OLIVER Button's ghost variant painted #0B1C24 — the
 * header's own background colour — so the calendar's ‹ › and ← Month were
 * invisible, and every other page that puts a ghost button in a modal header
 * had the same trap. The Button now reads these (with its old colours as the
 * fallback), so the fix lives here once, not per page.
 *
 * The modal's root resets them, so a modal opened from inside a header (or a
 * body) never inherits the dark-header values.
 */
export const HEADER_FG_VARS = {
  "--iadm-head-fg": "#FFFFFF",
  "--iadm-head-btn-bg": "rgba(255,255,255,0.10)",
  "--iadm-head-btn-border": "rgba(255,255,255,0.35)",
} as React.CSSProperties;
const HEADER_FG_RESET = {
  "--iadm-head-fg": "initial",
  "--iadm-head-btn-bg": "initial",
  "--iadm-head-btn-border": "initial",
} as React.CSSProperties;

export function IadmModal({
  open, onClose, product, eyebrow, title, subtitle,
  headerActions, footer, size = "lg", z, wrapHeader = false, children,
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
  const dims = MODAL_SIZES[size];
  // The one size whose width changes with the screen: on a wide monitor a
  // gutter buys nothing and the inspector is what gets squeezed.
  const wide = dims.widthAtWide !== undefined && dims.wideFrom !== undefined
    && typeof window !== "undefined" && window.innerWidth >= dims.wideFrom;
  const width = wide ? dims.widthAtWide! : dims.width;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ ...HEADER_FG_RESET, background: "rgba(0,0,0,0.5)", ...(z === undefined ? null : { zIndex: z }) }}
      onMouseDown={onBackdropDown}
      onMouseUp={onBackdropUp}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{
          width,
          // "auto" height (confirm only) lets the modal size to its content
          // — no body scroll, no fixed canvas. Every other size is fixed.
          height: dims.height,
          maxHeight: dims.height === "auto" ? "90vh" : undefined,
        }}
      >
        {/* Ink gradient header */}
        <div
          data-header-wrap={wrapHeader ? "1" : undefined}
          className={`flex items-center justify-between px-5 py-3 ${wrapHeader ? "flex-wrap gap-x-3 gap-y-2" : "gap-3"}`}
          style={{ ...HEADER_FG_VARS, color: "var(--iadm-head-fg)", background: "linear-gradient(to right, #0B1C24, #1a3540)" }}
        >
          <div className="min-w-0" style={wrapHeader ? { flex: `1 1 ${HEADER_TITLE_MIN_PX}px` } : undefined}>
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {eyebrowText}
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold">{title}</h2>
            {subtitle && (
              <div className={typeof subtitle === "string" ? "mt-0.5 truncate text-[11px] text-white/60" : "relative z-30 mt-0.5 text-[11px] text-white/60"}>{subtitle}</div>
            )}
          </div>
          <div className={`flex items-center gap-2 flex-shrink-0${wrapHeader ? " ml-auto" : ""}`}>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              // SD-010: a tooltip on every button, the close X included.
              title="Close"
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
  variant, product, onClick, disabled, type = "button", children, icon, title,
  "data-tour": dataTour,
}: {
  variant: "primary" | "accent" | "ghost";
  product?: IadmModalProduct;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
  icon?: ReactNode;
  /**
   * The tooltip. SD-010 asks for one on EVERY button, which a shared button
   * component has to be able to carry — otherwise every caller works around
   * it with a wrapping span and half of them forget. A builder footer is
   * where the buttons that commit something live — "Save as a template",
   * "Use in a post" — and each needs a sentence saying what happens next.
   * Optional, so no existing call site moves.
   */
  title?: string;
  /** InteractiveWalkthrough hook — lets flows spotlight this button by selector. */
  "data-tour"?: string;
}) {
  // PHONE PASS 2026-09-06: 28px is a comfortable button under a mouse and a
  // miss under a thumb. `max-md:` raises it to 40px BELOW 768px only, so
  // every dense desktop modal this button appears in is byte-identical.
  const baseClass = "inline-flex items-center gap-1 rounded px-3 py-1.5 max-md:min-h-[40px] max-md:px-4 text-xs font-semibold transition-colors disabled:opacity-50";
  if (variant === "primary") {
    return (
      <button data-tour={dataTour} title={title} type={type} onClick={onClick} disabled={disabled} className={baseClass + " text-white"} style={{ background: CORE_BLUE }}>
        {icon}{children}
      </button>
    );
  }
  if (variant === "accent") {
    const c = product ? PRODUCT_ACCENT[product] : PRODUCT_ACCENT.spark;
    return (
      <button data-tour={dataTour} title={title} type={type} onClick={onClick} disabled={disabled} className={baseClass + " text-white"} style={{ background: c }}>
        {icon}{children}
      </button>
    );
  }
  return (
    <button data-tour={dataTour} title={title} type={type} onClick={onClick} disabled={disabled} className={baseClass + " border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}>
      {icon}{children}
    </button>
  );
}

/**
 * IadmBuilderPanes — the three-pane frame every builder gets.
 *
 * SD-010: "a side pane of widgets/blocks … sections on a canvas … tooltips on
 * every button". The frame is part of the SHELL, not per-builder furniture,
 * because the inventory found sixteen authoring surfaces and no two of them
 * laid themselves out the same way: the form builder has a 260px palette, the
 * Template Studio a 240px insert rail, the OLIVER signup builder three equal
 * columns, and the other thirteen have no pane at all. One frame ends that.
 *
 * Put it directly inside an IadmModal size="builder" body. It fills the height
 * it is given and scrolls each pane independently — the canvas must be able to
 * scroll without taking the widget list with it, which is the single most
 * common complaint about a builder in a modal.
 *
 *   <IadmModal open onClose={…} product="oliver" title="Proposal" size="builder">
 *     <IadmBuilderPanes
 *       pane={<WidgetPane adapter="proposal" onInsert={…} />}
 *       inspector={selected ? <SectionInspector … /> : null}
 *     >
 *       <Canvas … />
 *     </IadmBuilderPanes>
 *   </IadmModal>
 *
 * `inspector` is optional and the column disappears when it is null, so a
 * builder with nothing selected gives the canvas the whole width instead of
 * holding 320px of empty grey — the Template Studio holds it today.
 */
export function IadmBuilderPanes({
  pane, children, inspector = null, paneWidth = BUILDER_PANE_WIDTH,
  inspectorWidth = BUILDER_INSPECTOR_WIDTH, canvasBackground = "#F1F5F9",
}: {
  /** LEFT — the widget pane. Picture + label + one line per widget. */
  pane: ReactNode;
  /** CENTRE — the canvas. Sections, edited in place. */
  children: ReactNode;
  /** RIGHT — the inspector for whatever is selected. null hides the column. */
  inspector?: ReactNode;
  paneWidth?: number;
  inspectorWidth?: number;
  /** The paper the canvas sits on. A document builder may want white. */
  canvasBackground?: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full">
      {/* LEFT pane — fixed width, its own scroll.
          NO responsive class of its own (2026-09-16 phone pass): this frame is
          the WIDE layout and nothing else. `max-md:hidden` used to make the
          widget list disappear below 768 with no way to reach it, and
          `max-lg:hidden` did the same to the inspector below 1024 — two more
          breakpoints, neither of them the one the builder actually changes at.
          BuilderFrame now decides, once, off responsive.ts, and swaps this
          whole frame for drawers. */}
      <aside
        data-builder-slot="pane"
        className="flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white"
        style={{ width: paneWidth }}
      >
        {pane}
      </aside>

      {/* CENTRE — the canvas. min-w-0 is what stops a wide section from
          pushing the inspector off the modal instead of scrolling. */}
      <main
        data-builder-slot="canvas"
        className="min-w-0 flex-1 overflow-y-auto"
        style={{ background: canvasBackground }}
      >
        {children}
      </main>

      {/* RIGHT inspector — only when something is selected. */}
      {inspector === null ? null : (
        <aside
          data-builder-slot="inspector"
          className="flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white"
          style={{ width: inspectorWidth }}
        >
          {inspector}
        </aside>
      )}
    </div>
  );
}

export default IadmModal;
