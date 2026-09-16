/**
 * builder/BuilderFrame.tsx — THE builder surface, with no opinion about the model.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5 pulled this out of BuilderShell.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 * BuilderShell owns two different things at once: the CHROME every builder has
 * (a full-viewport modal, three panes, a widget pane, one undo control) and the
 * ENGINE for a section/column/widget DOCUMENT. Proposals, websites, newsletters
 * and landing pages all want both. My Brand's Template Studio wants the first
 * and cannot use the second: its canvas is absolute pixels, a layer is not a
 * widget in a column, and "add a section" means nothing on a 1080×1080 square.
 *
 * Before this file the only two answers were (a) bend the pixel scene into the
 * document model, which would lose rotation, z-order and free placement, or
 * (b) let the Template Studio keep its own three-pane layout — the duplicate
 * this scope exists to delete. So the chrome became a component:
 *
 *   BuilderFrame   the modal, the header, ONE undo/redo pair, the three panes
 *   BuilderShell   BuilderFrame + the document engine (sections and widgets)
 *   StudioBuilder  BuilderFrame + the pixel engine (layers on a Fabric canvas)
 *
 * Both engines drive the SAME pane (WidgetPane over registry.ts) and the SAME
 * history (history.ts, now generic over its value), so "one builder" is a fact
 * about the code and not a claim in a document.
 *
 * ── WHAT STAYS HERE, FOREVER ──────────────────────────────────────────────
 * The things SD-010 states as numbers or as rules, so an adapter cannot opt
 * out of them by accident: the `builder` modal size (≥80% of the viewport),
 * IadmBuilderPanes' three columns, and exactly one undo control in the header
 * — never one per pane, never a second stack inside a canvas library.
 */
import type { ReactNode } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { IadmModal, IadmBuilderPanes, type IadmModalProduct } from "../components/IadmModal";

export interface BuilderFrameProps {
  open: boolean;
  onClose: () => void;
  /** Which product owns the modal chrome — drives the eyebrow and accent. */
  product: IadmModalProduct;
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right of the header, AFTER undo/redo. */
  headerActions?: ReactNode;
  footer?: ReactNode;

  /** ONE undo control, in the shell. An adapter supplies the stack, not the buttons. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  /** LEFT — the widget pane (WidgetPane, from the registry). */
  pane: ReactNode;
  /** RIGHT — the inspector for whatever is selected. null hides the column. */
  inspector?: ReactNode;
  /** CENTRE — the canvas, whatever kind of canvas this builder has. */
  children: ReactNode;
  canvasBackground?: string;
  /** Rendered over everything (galleries, pickers) so an adapter can nest modals. */
  overlays?: ReactNode;
}

export function BuilderFrame(p: BuilderFrameProps) {
  return (
    <>
      <IadmModal
        open={p.open}
        onClose={p.onClose}
        product={p.product}
        eyebrow={p.eyebrow}
        title={p.title}
        subtitle={p.subtitle}
        /* SD-010 addendum: every builder opens as the largest surface we have. */
        size="builder"
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} style={ghost(p.canUndo)}>
              <Undo2 size={14} />
            </button>
            <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo (Ctrl+Shift+Z)" disabled={!p.canRedo} onClick={p.onRedo} style={ghost(p.canRedo)}>
              <Redo2 size={14} />
            </button>
            {p.headerActions}
          </div>
        }
        footer={p.footer}
      >
        <IadmBuilderPanes
          canvasBackground={p.canvasBackground ?? "#E6ECF1"}
          pane={p.pane}
          inspector={p.inspector ?? null}
        >
          {p.children}
        </IadmBuilderPanes>
      </IadmModal>
      {p.overlays}
    </>
  );
}

function ghost(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
    borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)", background: "transparent",
    color: "#fff", opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "default",
  };
}

export default BuilderFrame;
