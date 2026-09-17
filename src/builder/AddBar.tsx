/**
 * builder/AddBar.tsx — the "+" between every two things on the page.
 *
 * D-11 and §9 of BUILDER_USER_TEST_2026-09-16. Before this, the only way to add
 * anything was a card in the far-left pane, and with nothing selected the
 * widget went to the END of the document — off screen, unselected, in an email
 * below the unsubscribe footer. "Click Pricing table and, as far as the eye can
 * tell, nothing happened."
 *
 * A "+" ON THE PAGE cannot have that problem: the author points at the gap they
 * mean, and the thing lands in it.
 *
 * ── ONE STRIP, THREE JOBS ─────────────────────────────────────────────────
 *   · press "+"            → the picker opens ANCHORED HERE
 *   · drag a section over  → this is the drop line it lands on
 *   · the buttons beside it → a blank or a ready-made section, unchanged
 *
 * Quiet until the pointer is near it. A page with a dashed box between every
 * pair of sections is a page you cannot read, and the author has to be able to
 * read what they are writing.
 */
import { Plus } from "lucide-react";

export interface AddBarProps {
  /** Pressed. The rectangle is where the picker should appear. */
  onAdd: (rect: DOMRect) => void;
  /** A section is in the air and this strip is where it would land. */
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Kept permanently open — the strip after the last section. */
  always?: boolean;
  /** What the "+" says it will do, in the adapter's words. */
  label?: string;
  /** The two section buttons, so their wording stays with the canvas. */
  children?: React.ReactNode;
  /** Shown on the right of the last strip: what the template puts next. */
  note?: React.ReactNode;
}

export function AddBar(p: AddBarProps) {
  return (
    <div
      className={`bxc-addbar${p.always ? " bxc-addbar-on" : ""}${p.dropActive ? " bxc-addbar-drop" : ""}`}
      data-builder-addbar={p.always ? "last" : "between"}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="bxc-addline" aria-hidden="true" />
      <button
        type="button"
        className="bxc-addplus"
        data-builder-add="+"
        title={p.label || "Add something here"}
        aria-label={p.label || "Add something here"}
        onClick={(e) => { e.stopPropagation(); p.onAdd((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
      >
        <Plus size={14} /> Add
      </button>
      {p.children}
      {p.note}
      <span className="bxc-addline" aria-hidden="true" />
    </div>
  );
}

/** The strip's own stylesheet, kept beside it. Injected once by the canvas. */
export const ADDBAR_CSS = `
.bxc-addbar { position: relative; z-index: 4; display: flex; align-items: center; gap: 8px;
  padding: 2px 24px; min-height: 10px; opacity: 0; transition: opacity .12s, min-height .12s; }
.bxc-addbar-on, .bxc-addbar:hover, .bxc-addbar:focus-within,
.bxc-sec:hover + .bxc-addbar, .bxc-addbar.bxc-addbar-drop { opacity: 1; min-height: 34px; }
.bxc-addline { flex: 1; height: 1px; background: #A8CDD8; }
.bxc-addbar-drop .bxc-addline { height: 3px; background: #2D9CDB; border-radius: 2px; }
.bxc-addplus { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto;
  border: 1px solid #0C4A60; background: #0C4A60; color: #fff; border-radius: 999px;
  padding: 3px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
.bxc-addplus:hover { background: #12607c; }
`;

export default AddBar;
