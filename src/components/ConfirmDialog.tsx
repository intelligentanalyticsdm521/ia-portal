/**
 * components/ConfirmDialog.tsx — "are you sure?", asked in the app's own voice.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.11. `window.confirm` is the browser's
 * grey box: it is chrome-coloured, it says "localhost:5174 says", its buttons
 * read "OK" and "Cancel" whatever the question was, it cannot be styled, it
 * cannot carry a second line, it blocks the whole tab, and on a phone it
 * appears at the top of the screen miles from the button that raised it. Every
 * one of those is the opposite of what the rest of the product does — the
 * landing page's Publish and the website's Publish already ask in an
 * `IadmModal size="confirm"`, in the client's words, with named buttons.
 *
 * THIS IS THAT MODAL, WITH THE QUESTION AS PROPS — one mechanism, so a surface
 * that needs to ask does not hand-roll a fourth copy of the same twelve lines.
 * `size="confirm"` is the same fixed frame both Publish confirms use, so the
 * box is the same shape wherever it appears.
 *
 * ── HOW IT IS USED ────────────────────────────────────────────────────────
 * The caller holds ONE piece of state — the pending question, or null — and
 * renders `<ConfirmDialog ask={…} />`. A surface with six of these keeps six
 * `setAsk({...})` calls and one dialog, rather than six modals in the tree.
 *
 *     const [ask, setAsk] = useState<ConfirmAsk | null>(null);
 *     …
 *     onClick={() => setAsk({
 *       title: "Put this page in your website's bin?",
 *       body: "It keeps it for 30 days.",
 *       confirmLabel: "Yes, bin it",
 *       onConfirm: () => void trashIt(),
 *     })}
 *     …
 *     <ConfirmDialog ask={ask} product="arion" onClose={() => setAsk(null)} />
 */
import type { ReactNode } from "react";
import { IadmModal, IadmButton, type IadmModalProduct } from "./IadmModal";

/** One question, and what to do if the answer is yes. */
export interface ConfirmAsk {
  /** The question itself, as a question. */
  title: string;
  /** What actually happens, in the client's words. */
  body: ReactNode;
  /** The yes button. Says the ACTION, never "OK". */
  confirmLabel: string;
  /** The no button. Defaults to "Not now" — never "Cancel". */
  cancelLabel?: string;
  /** Run on yes. The dialog closes first, so a slow call cannot double-fire. */
  onConfirm: () => void;
  /** Overrides the dialog's product colour for this one question. */
  product?: IadmModalProduct;
  /** The eyebrow above the title. Defaults to "Just checking". */
  eyebrow?: string;
}

export interface ConfirmDialogProps {
  /** The pending question, or null when nothing is being asked. */
  ask: ConfirmAsk | null;
  /** Whose colours. A question can override it. */
  product: IadmModalProduct;
  /** Called on "no", on Escape and on click-outside — and after "yes". */
  onClose: () => void;
  /** Lift it over a builder shell or a drawer, the way the Publish asks do. */
  z?: number;
  /** Greys the yes button while something is already running. */
  busy?: boolean;
}

export function ConfirmDialog({ ask, product, onClose, z, busy }: ConfirmDialogProps) {
  if (!ask) return null;
  return (
    <IadmModal
      open
      onClose={onClose}
      product={ask.product || product}
      z={z}
      eyebrow={ask.eyebrow || "Just checking"}
      title={ask.title}
      size="confirm"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose} title="Go back without doing it">
            {ask.cancelLabel || "Not now"}
          </IadmButton>
          <IadmButton
            variant="accent"
            product={ask.product || product}
            disabled={busy}
            title={ask.confirmLabel}
            onClick={() => { const go = ask.onConfirm; onClose(); go(); }}
          >
            {busy ? "Working…" : ask.confirmLabel}
          </IadmButton>
        </>
      }
    >
      <div data-confirm-body style={{ padding: 18, fontSize: 13, lineHeight: 1.55, color: "#334155" }}>
        {ask.body}
      </div>
    </IadmModal>
  );
}

export default ConfirmDialog;
