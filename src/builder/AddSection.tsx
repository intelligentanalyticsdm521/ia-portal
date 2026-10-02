/**
 * builder/AddSection.tsx — THE ADD AREA, copied from Elementor's editor.
 *
 * Brandon, 2026-09-19: *"add is just for flexbox then templates. No widgets."*
 * and *"I want an exact copy, as close as we can make it, to Elementor's UI."*
 *
 * ── WHAT THE REAL EDITOR DOES ─────────────────────────────────────────────
 * Driven on 2026-09-19 in a live Elementor 4.2.4, screenshots under
 * `overnight-report/d165-screens/`. It is ONE dashed area IN THE PAGE, not a
 * pop-up, and it has three views:
 *
 *   1. two round buttons and a line of words
 *        "+"      title "Add New Container"
 *        folder   title "Add Template"
 *        "Drag widget here"
 *   2. press "+"  →  "Which layout would you like to use?"   Flexbox | Grid
 *   3. pick one   →  "Select your structure"                 thumbnails,
 *                    a "‹" back to the previous view
 *
 * There is always one at the bottom of the page. Pressing the "+" on a
 * container's handle opens another one ABOVE that container, and that one has
 * an "×" to put it away again.
 *
 * WIDGETS ARE NOT HERE. They are in the left panel and nowhere else. A widget
 * dragged from the panel may be DROPPED on this area, which makes a container
 * for it — that is what "Drag widget here" means in the reference.
 *
 * The twelve structures are Elementor's own `data-preset` keys, read out of
 * the DOM the same day:
 *   c100 · r100 · 50-50 · 33-66 · 25-25-25-25 · 25-50-25 · 50-50-50-50 ·
 *   50-50-100 · c100-c50-50 · 33-33-33-33-33-33 · 33-33-33-33-66 · 66-33-33-66
 * We take the eight a person building a quote, an email or a page reaches for,
 * and drop the four six-cell ones: on 780px of paper a sixth of the width is
 * 130px, which is narrower than the words that would go in it.
 *
 * ── IT BUILDS NOTHING ─────────────────────────────────────────────────────
 * A preset is a SHAPE — how many cells, how wide each one is. Turning that
 * into containers is `treeOps.makeContainer`, through the shell's own handler,
 * so there is one place that knows what a box is.
 */
import { useState } from "react";
import { ChevronLeft, FolderOpen, Plus, Sparkles, X } from "lucide-react";

/** Flexbox, or a grid with even cells. Elementor's first question. */
export type SectionLayout = "flex" | "grid";

export interface StructurePreset {
  /** Elementor's own key, so the two can be compared row by row. */
  key: string;
  /** What the author is told they are picking. */
  label: string;
  /**
   * The cells, as PERCENTAGES of the row, in order.
   *
   * One number is one cell. `[100]` is a single column; `[33, 67]` is a third
   * beside two thirds. A row of rows (Elementor's `c100-c50-50`) is not here:
   * it is two presses of the same button, and one press that makes two levels
   * is the thing nobody can undo in one step.
   */
  cells: number[];
}

/**
 * The eight, in Elementor's own order.
 *
 * Percentages, not fractions, and they add to 100 — `structureSumsTo100`
 * pins that, because a row of cells that adds to 99 leaves a sliver of
 * background down the side of every page built from it.
 */
export const STRUCTURE_PRESETS: StructurePreset[] = [
  { key: "c100", label: "One column", cells: [100] },
  { key: "50-50", label: "Two equal columns", cells: [50, 50] },
  { key: "33-33-33", label: "Three equal columns", cells: [34, 33, 33] },
  { key: "25-25-25-25", label: "Four equal columns", cells: [25, 25, 25, 25] },
  { key: "33-66", label: "A third, then two thirds", cells: [33, 67] },
  { key: "66-33", label: "Two thirds, then a third", cells: [67, 33] },
  { key: "25-75", label: "A quarter, then three quarters", cells: [25, 75] },
  { key: "25-50-25", label: "Narrow, wide, narrow", cells: [25, 50, 25] },
];

/** Every preset's cells add to exactly 100. */
export function structureSumsTo100(): string[] {
  return STRUCTURE_PRESETS
    .filter((p) => p.cells.reduce((a, b) => a + b, 0) !== 100)
    .map((p) => p.key);
}

export interface AddSectionProps {
  /** "+" → Flexbox or Grid → this structure. */
  onBlank: (layout: SectionLayout, preset: StructurePreset) => void;
  /** The folder — hands over to the template library (§11.9, D-153). */
  onTemplate: () => void;
  /**
   * THE THIRD ROUND BUTTON (D-172, round 2) — our counterpart of the
   * reference's pink "Build with AI". Optional: a builder with no ARGUS door
   * draws two buttons, as it did before, rather than a third that opens
   * nothing.
   */
  onAskArgus?: () => void;
  /**
   * Present on the one opened from a container's "+": it has an "×" and goes
   * away. Absent on the one at the bottom of the page, which is always there.
   */
  onClose?: () => void;
  /** A widget from the left panel is in the air and may be dropped here. */
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Shown under the buttons of the bottom one: what the template puts next. */
  note?: React.ReactNode;
}

type View = "buttons" | "layout" | "structure";

export function AddSection(p: AddSectionProps) {
  const [view, setView] = useState<View>("buttons");
  const [layout, setLayout] = useState<SectionLayout>("flex");

  /* BACK IS ON THE STRUCTURE VIEW ONLY (D-172). The reference shows an X in
     the top-right of the layout view and nothing in the top-left; a Back
     chevron there was ours. From "Select your structure" it goes back to
     "Which layout would you like to use?", which is what the reference does. */
  const back = view === "structure" ? () => setView("layout") : null;
  const close = view !== "buttons" ? () => setView("buttons") : p.onClose ?? null;

  return (
    <div
      className={`bxc-addarea${p.dropActive ? " bxc-addarea-drop" : ""}`}
      data-builder-addsection={view}
      onClick={(e) => e.stopPropagation()}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onKeyDown={(e) => { if (e.key === "Escape" && close) { e.stopPropagation(); close(); } }}
    >
      {back && (
        <button type="button" className="bxc-addarea-corner bxc-addarea-back" data-addsection-back
          onClick={back} aria-label="Back" title="Back">
          <ChevronLeft size={16} />
        </button>
      )}
      {close && (
        <button type="button" className="bxc-addarea-corner bxc-addarea-close" data-addsection-close
          onClick={close} aria-label="Close" title="Close">
          <X size={15} />
        </button>
      )}

      {view === "buttons" && (
        <>
          <div className="bxc-addarea-buttons">
            <button type="button" className="bxc-addarea-btn bxc-addarea-plus" data-builder-add="container"
              title="Add New Container" aria-label="Add New Container"
              onClick={() => setView("layout")}>
              <Plus size={18} />
            </button>
            <button type="button" className="bxc-addarea-btn bxc-addarea-folder" data-builder-add="template"
              title="Add Template" aria-label="Add Template"
              onClick={p.onTemplate}>
              <FolderOpen size={16} />
            </button>
            {/* THE THIRD ROUND BUTTON (D-172, round 2). Driven on 2026-09-19:
                the reference's add area has THREE — `.elementor-add-section-
                button` titled "Add New Container", `.elementor-add-template-
                button` titled "Add Template", and `.e-ai-layout-button`
                titled "Build with AI", in that order. Ours had two, so the
                one place the reference offers to build the page FOR you was
                the one place ours did not. Ask ARGUS is our counterpart of
                Elementor AI (agreed difference (e)), so it is our third
                button — drawn only where a builder hands one in, because a
                button that opens nothing is worse than none. */}
            {p.onAskArgus && (
              <button type="button" className="bxc-addarea-btn bxc-addarea-ai" data-builder-add="ai"
                title="Build with ARGUS" aria-label="Build with ARGUS"
                onClick={p.onAskArgus}>
                <Sparkles size={16} />
              </button>
            )}
          </div>
          <div className="bxc-addarea-title">Drag widget here</div>
          {p.note}
        </>
      )}

      {view === "layout" && (
        <>
          <div className="bxc-addarea-q">Which layout would you like to use?</div>
          <div className="bxc-addarea-layouts">
            <button type="button" className="bxc-addarea-layout" data-addsection-choice="flex"
              onClick={() => { setLayout("flex"); setView("structure"); }}>
              <PreviewArt cells={[60, 40]} />
              <span>Flexbox</span>
            </button>
            <button type="button" className="bxc-addarea-layout" data-addsection-choice="grid"
              onClick={() => { setLayout("grid"); setView("structure"); }}>
              <PreviewArt cells={[50, 50]} rows={2} />
              <span>Grid</span>
            </button>
          </div>
        </>
      )}

      {view === "structure" && (
        <>
          <div className="bxc-addarea-q">Select your structure</div>
          <div className="bxc-addarea-presets">
            {STRUCTURE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className="bxc-addarea-preset"
                data-structure-preset={preset.key}
                title={preset.label}
                aria-label={preset.label}
                onClick={() => { setView("buttons"); p.onBlank(layout, preset); }}
              >
                <PreviewArt cells={preset.cells} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The thumbnail: the cells this preset makes, at the width it makes them. */
function PreviewArt({ cells, rows = 1 }: { cells: number[]; rows?: number }) {
  return (
    <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
      {Array.from({ length: rows }, (_, r) => (
        <span key={r} style={{ display: "flex", gap: 2, height: rows > 1 ? 16 : 34 }}>
          {cells.map((w, i) => (
            <span key={i} style={{ flexGrow: w, flexBasis: 0, background: "#C2CBD2", borderRadius: 2 }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The area's own stylesheet, kept beside it. Injected once by the canvas. */
export const ADDSECTION_CSS = `
.bxc-addarea { position: relative; margin: 18px 24px; padding: 34px 16px 30px; text-align: center;
  border: 2px dashed #D5D8DC; border-radius: 3px; background: transparent; }
.bxc-addarea-drop { border-color: #2D9CDB; background: #F2F9FD; }
.bxc-addarea-buttons { display: flex; justify-content: center; gap: 8px; }
.bxc-addarea-btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; transition: transform .1s, background .1s; }
.bxc-addarea-btn:hover { transform: scale(1.06); }
.bxc-addarea-plus { background: #0C4A60; }
.bxc-addarea-plus:hover { background: #12607c; }
.bxc-addarea-folder { background: #69727D; }
.bxc-addarea-folder:hover { background: #515962; }
/* The reference's third button is its own colour, not a third grey one. */
.bxc-addarea-ai { background: #84CC16; }
.bxc-addarea-ai:hover { background: #65A30D; }
.bxc-addarea-title { margin-top: 14px; font-size: 12px; font-style: italic; color: #9DA5AE; }
.bxc-addarea-q { font-size: 13px; color: #515962; margin: 0 28px 16px; }
.bxc-addarea-corner { position: absolute; top: 8px; border: none; background: transparent; cursor: pointer;
  color: #9DA5AE; display: inline-flex; padding: 2px; }
.bxc-addarea-corner:hover { color: #515962; }
.bxc-addarea-back { left: 10px; }
.bxc-addarea-close { right: 10px; }
.bxc-addarea-layouts { display: flex; justify-content: center; gap: 16px; }
.bxc-addarea-layout { width: 130px; border: 1px solid transparent; border-radius: 3px; background: transparent;
  padding: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 8px; align-items: stretch;
  font-size: 12px; color: #515962; }
.bxc-addarea-layout:hover { border-color: #0C4A60; }
.bxc-addarea-layout:hover span span { background: #0C4A60 !important; }
.bxc-addarea-presets { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 520px; margin: 0 auto; }
.bxc-addarea-preset { width: 90px; border: none; background: transparent; padding: 4px; cursor: pointer; border-radius: 3px; }
.bxc-addarea-preset:hover span span { background: #0C4A60 !important; }
`;

export default AddSection;
