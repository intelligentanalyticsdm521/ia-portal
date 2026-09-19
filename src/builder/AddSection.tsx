/**
 * builder/AddSection.tsx — the pop-up the "+" between sections opens.
 *
 * Scope §11.13.1 (D-165): *"Add section -> a pop-up: Blank or Template. Blank
 * -> Flexbox or Grid -> pick a structure. Template -> the template library."*
 *
 * ── WHAT THE REAL EDITOR DOES ─────────────────────────────────────────────
 * Driven on 2026-09-19 in a live Elementor 4.2.4, screenshots under
 * `overnight-report/d165-screens/`:
 *
 *   press "+"  →  "Which layout would you like to use?"   Flexbox | Grid
 *   pick one   →  "Select your structure"                 twelve thumbnails,
 *                 a "‹" back to the previous question and an "×" to give up
 *
 * The twelve are its own `data-preset` keys, read out of the DOM the same day:
 *   c100 · r100 · 50-50 · 33-66 · 25-25-25-25 · 25-50-25 · 50-50-50-50 ·
 *   50-50-100 · c100-c50-50 · 33-33-33-33-33-33 · 33-33-33-33-66 · 66-33-33-66
 *
 * We take the eight a person building a quote, an email or a page reaches for,
 * and drop the four six-cell ones: on 780px of paper a sixth of the width is
 * 130px, which is narrower than the words that would go in it. Said here
 * rather than in a commit message because it is the one place this file does
 * not copy the reference.
 *
 * ── IT BUILDS NOTHING ─────────────────────────────────────────────────────
 * A preset is a SHAPE — how many cells, how wide each one is. Turning that
 * into containers is `treeOps.makeContainer`, through the shell's own handler,
 * so there is one place that knows what a box is. This file draws three
 * questions and hands back an answer.
 */
import { useState } from "react";
import { ChevronLeft, LayoutGrid, Rows3, X } from "lucide-react";

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
  /** Where the "+" was, in viewport coordinates. Absent → centred. */
  anchor?: { top: number; left: number } | null;
  /** Blank, and this is the shape. `layout` says flex or grid. */
  onBlank: (layout: SectionLayout, preset: StructurePreset) => void;
  /** Template — hands over to the template library (§11.9, D-153). */
  onTemplate: () => void;
  onClose: () => void;
  /** What the thing being built is called, from the adapter's copy. */
  noun?: string;
}

type Step = "choose" | "layout" | "structure";

export function AddSection(p: AddSectionProps) {
  const [step, setStep] = useState<Step>("choose");
  const [layout, setLayout] = useState<SectionLayout>("flex");

  const back = step === "layout" ? () => setStep("choose")
    : step === "structure" ? () => setStep("layout")
      : null;

  const style: React.CSSProperties = p.anchor
    ? {
      position: "fixed",
      top: Math.max(12, Math.min(p.anchor.top, (typeof window === "undefined" ? 900 : window.innerHeight) - 340)),
      left: Math.max(12, Math.min(p.anchor.left, (typeof window === "undefined" ? 1440 : window.innerWidth) - 400)),
    }
    : { position: "fixed", top: "18vh", left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      role="dialog"
      aria-label="Add a section"
      data-builder-addsection={step}
      style={{
        ...style, zIndex: 9300, width: 380, maxWidth: "calc(100vw - 24px)",
        background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 10,
        boxShadow: "0 18px 48px rgba(11,28,36,0.22)", overflow: "hidden",
      }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderBottom: "1px solid #E2E8F0" }}>
        {back && (
          <button type="button" data-addsection-back onClick={back} aria-label="Back" title="Back to the question before this"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#334155", display: "inline-flex", padding: 0 }}>
            <ChevronLeft size={16} />
          </button>
        )}
        <strong style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>
          {step === "choose" ? "Add a section"
            : step === "layout" ? "Which layout would you like to use?"
              : "Select your structure"}
        </strong>
        <button type="button" onClick={p.onClose} aria-label="Close" title="Close without adding anything"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 0 }}>
          <X size={15} />
        </button>
      </div>

      {step === "choose" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 12 }}>
          <Choice
            data="blank"
            title="Blank"
            hint={`An empty section you fill yourself.`}
            onClick={() => setStep("layout")}
            art={<Rows3 size={22} color="#0C4A60" />}
          />
          <Choice
            data="template"
            title="Template"
            hint={`A ready-made ${p.noun ?? "page"} part you can change.`}
            onClick={p.onTemplate}
            art={<LayoutGrid size={22} color="#0C4A60" />}
          />
        </div>
      )}

      {step === "layout" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 12 }}>
          <Choice
            data="flex"
            title="Flexbox"
            hint="Cells sit side by side and wrap onto the next line when there is no room."
            onClick={() => { setLayout("flex"); setStep("structure"); }}
            art={<PreviewArt cells={[60, 40]} />}
          />
          <Choice
            data="grid"
            title="Grid"
            hint="Even cells in a fixed number of columns, whatever is in them."
            onClick={() => { setLayout("grid"); setStep("structure"); }}
            art={<PreviewArt cells={[50, 50]} rows={2} />}
          />
        </div>
      )}

      {step === "structure" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: 12 }}>
          {STRUCTURE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              data-structure-preset={preset.key}
              title={preset.label}
              aria-label={preset.label}
              onClick={() => p.onBlank(layout, preset)}
              style={{
                border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff",
                padding: 5, cursor: "pointer", display: "block",
              }}
            >
              <PreviewArt cells={preset.cells} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Choice({ data, title, hint, onClick, art }: {
  data: string; title: string; hint: string; onClick: () => void; art: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-addsection-choice={data}
      onClick={onClick}
      title={hint}
      aria-label={`${title} — ${hint}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center",
        border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", padding: "14px 10px", cursor: "pointer",
      }}
    >
      {art}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0B1C24" }}>{title}</span>
      <span style={{ fontSize: 10.5, lineHeight: 1.35, color: "#5A7A8A" }}>{hint}</span>
    </button>
  );
}

/** The thumbnail: the cells this preset makes, at the width it makes them. */
function PreviewArt({ cells, rows = 1 }: { cells: number[]; rows?: number }) {
  return (
    <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
      {Array.from({ length: rows }, (_, r) => (
        <span key={r} style={{ display: "flex", gap: 2, height: 22 }}>
          {cells.map((w, i) => (
            <span key={i} style={{ flexGrow: w, flexBasis: 0, background: "#CBD5E1", borderRadius: 2 }} />
          ))}
        </span>
      ))}
    </span>
  );
}

export default AddSection;
