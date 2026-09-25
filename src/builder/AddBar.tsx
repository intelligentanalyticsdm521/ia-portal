/**
 * builder/AddBar.tsx — the gap between two sections: a DROP LINE, nothing else.
 *
 * Brandon, 2026-09-19: *"add is just for flexbox then templates. No widgets."*
 *
 * This strip used to carry a "+ Add" pill that opened a pop-up list of widgets
 * (D-11, 2026-09-16). The reference editor has no such thing, and it is gone:
 * the pop-up (`WidgetPicker.tsx`) is deleted, not hidden. In Elementor:
 *
 *   · widgets are in the LEFT PANEL and nowhere else
 *   · a new container comes from the add area (`AddSection.tsx`) — the one at
 *     the bottom of the page, or the one the "+" on a container's handle opens
 *   · the gap between two containers shows NOTHING until something is dragged
 *     over it, and then it shows the line the thing would land on
 *
 * So this is that line. It has no button and takes no click.
 */

export interface AddBarProps {
  /** A section is in the air and this strip is where it would land. */
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function AddBar(p: AddBarProps) {
  return (
    <div
      className={`bxc-addbar${p.dropActive ? " bxc-addbar-drop" : ""}`}
      data-builder-addbar="between"
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      aria-hidden="true"
    >
      <span className="bxc-addline" />
    </div>
  );
}

/** The strip's own stylesheet, kept beside it. Injected once by the canvas. */
export const ADDBAR_CSS = `
.bxc-addbar { position: relative; z-index: 4; display: flex; align-items: center; padding: 0 24px; min-height: 8px; }
.bxc-addline { flex: 1; height: 3px; border-radius: 2px; background: transparent; }
.bxc-addbar-drop { min-height: 16px; }
.bxc-addbar-drop .bxc-addline { background: #2D9CDB; }
`;

export default AddBar;
