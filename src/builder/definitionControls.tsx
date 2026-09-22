/**
 * builder/definitionControls.tsx — THE PANEL, DRAWN FROM THE DEFINITION ALONE.
 *
 * B-168 §C.1: *"the Inspector renders family controls from the definition alone
 * (tab content|style|advanced + section, per device where the machine file says
 * responsive) with no per-widget code."* Ten agents are about to add well over
 * a hundred widgets. If each one needs a hand-written panel, the Inspector
 * becomes the third 60 KB file every agent conflicts in, and the panel drifts
 * from the definition exactly the way the registry and the renderer did before
 * D-156 put them in one file.
 *
 * So: a family writes controls, and this draws them. Nothing here knows the
 * name of a single widget, and nothing a family adds needs a line in here.
 *
 * ── WHAT MOVED, AND WHY IT MOVED RATHER THAN BEING COPIED ─────────────────
 * This is the block that lived inside `Inspector.tsx`'s Content group, lifted
 * out whole. It is not a second copy: the Inspector now calls this on all three
 * tabs and has no control-drawing code of its own left. Replace means delete.
 * The one change on the way out is that it filters by TAB — the same block drew
 * a widget's Style and Advanced controls on the Content tab before, because it
 * was only ever mounted there.
 *
 * ── PER DEVICE, THE WAY ELEMENTOR ALREADY SPELLS IT ───────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` marks a control
 * `responsive: true` and stores the twins beside the desktop key as
 * `<key>_tablet` and `<key>_mobile` — the machine file literally contains
 * `tabs_justify_horizontal_tablet`. We store them the same way, and `deviceKey`
 * below is the only place that spelling is written on the whole platform, so
 * the panel, the renderer and the arion emitter cannot each invent one.
 *
 * A control the machine file does NOT mark responsive has one value for every
 * screen and no device row, because a device switcher over a control that does
 * not vary is a switch that does nothing.
 */
import React from "react";
import {
  type WidgetControl, type WidgetDef, type ControlTab,
  controlOptions, controlSections, controlTab, optionValue,
} from "./registry";
import type { PreviewKey } from "./responsive";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, StretchHorizontal,
} from "lucide-react";
import {
  DeviceSegment, FIELD, Group, IconChoice, INPUT, L, ROW, Slider, Swatches, Switcher,
} from "./StyleGroups";
import type { Device } from "./style";
/* THE REPEATER'S ARITHMETIC (G-1). Every "what is a row" question is answered
   in one pure module the tests execute; this file only draws. */
import {
  cellCount, isRepeater, repeaterOp, rowFields, rowsFor, rowsOf, rowTitle, setRowField,
  type RepeaterOp, type RepeaterRow,
} from "./repeater";
/* WHEN A CONTROL IS DRAWN AT ALL (2026-09-20). Elementor's `condition`, whose
   arithmetic is one pure module the tests execute — same shape, and the same
   reason, as the repeater's above: this file draws and does not decide. */
import { controlIsShown } from "./controlCondition";

/**
 * The control types the PANEL draws.
 *
 * Everything else is either typed on the page (`text`, `textarea`, `richtext`,
 * `list`, `money`, `merge` — the engine's one editing mechanism) or carried by
 * the widget and never typed at all (`hidden`).
 */
export const PANEL_CONTROL_TYPES: ReadonlySet<WidgetControl["type"]> = new Set([
  "toggle", "select", "colour", "number", "image", "link", "code",
]);

/**
 * IS THIS CONTROL DRAWN AT ALL?
 *
 * The seven types above, plus a `list` whose definition has said what one row
 * is — Elementor's repeater (`repeater.ts`). `list` is deliberately NOT added
 * to `PANEL_CONTROL_TYPES`: a list that has NOT declared its row shape is still
 * typed on the page, which is what every family's own contract test asks of it.
 */
export function isDrawnInPanel(c: WidgetControl): boolean {
  return PANEL_CONTROL_TYPES.has(c.type)
    || (c.type === "list" && isRepeater(c))
    /* A control that has ASKED for a box (2026-09-20) — see `panel` in
       registry.ts. THREE declare it: the Heading's Title, the Button's Text
       and the Text Editor's words, which are the three the reference puts a
       box for at the top of a Content tab. Every other run of words on the
       estate is still typed on the page and has no panel field at all. */
    || (c.panel === true && (c.type === "text" || c.type === "textarea" || c.type === "richtext"));
}

/**
 * IS THIS THE UNLABELLED EDITOR BOX? (2026-09-20, audit round 4 row 111.)
 *
 * Driven: the reference's Text Editor opens on a WYSIWYG box which is *"the
 * only unlabelled control"* on any of its panels. So it is drawn as a BLOCK
 * before the row map and returns early — exactly the way `RepeaterControl`
 * is, and for the same reason: the label-left row below is the shape THE
 * SCREEN LAW (law 10) pins by name, and a two-line editor does not go in the
 * right-hand 1.25fr of a 300px panel.
 */
export function isPanelEditor(c: WidgetControl): boolean {
  return c.panel === true && c.type === "richtext";
}

/**
 * IS THIS A SIZE? (2026-09-20, audit round 4 row 36.)
 *
 * A `number` control that has said what it is measured in. It is drawn as the
 * same `Slider` the container's Width, Min Height and Gaps already use — one
 * size control on the platform, not two — rather than the bare pixel box a
 * widget size was: "Spacer Space, Divider Width and Weight, Icon Size and
 * Rotate, Columns Gap … every widget size is a plain number."
 */
export function isSizeControl(c: WidgetControl): boolean {
  return c.type === "number" && Array.isArray(c.units) && c.units.length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   AN ALIGNMENT IS ICON BUTTONS (2026-09-20, audit round 4 row 38)
   ══════════════════════════════════════════════════════════════════════════

   Driven: every Alignment, Position and Justify in the reference is a `choose`
   row of icon buttons. Ours drew text selects reading "The page's own / Left /
   Center / Right", so the one control an author uses on nearly every widget
   looked different from the identical control on a container.

   A definition does NOT have to say so. The OPTIONS say so: a select whose
   values are all alignment words, and at least two of them a real direction,
   IS an alignment. That is one rule rather than a flag on eleven controls in
   six family files, and a family that writes Elementor's own values gets the
   reference's own shape for nothing — the same bargain `registry.panelAt`
   already strikes over Elementor's labels.
*/

/** Every alignment word this platform stores, and the glyph each one wears. */
const ALIGN_GLYPHS: Record<string, { title: string; icon: React.ReactNode }> = {
  left: { title: "Left", icon: <AlignLeft size={13} /> },
  start: { title: "Left", icon: <AlignLeft size={13} /> },
  center: { title: "Center", icon: <AlignCenter size={13} /> },
  centre: { title: "Center", icon: <AlignCenter size={13} /> },
  middle: { title: "Center", icon: <AlignCenter size={13} /> },
  right: { title: "Right", icon: <AlignRight size={13} /> },
  end: { title: "Right", icon: <AlignRight size={13} /> },
  justify: { title: "Justified", icon: <AlignJustify size={13} /> },
  stretch: { title: "Stretch", icon: <StretchHorizontal size={13} /> },
};

/** The values a select may carry and still be an alignment: the words, or "nothing". */
const ALIGN_EMPTY: ReadonlySet<string> = new Set(["", "default", "none", "inherit"]);

/**
 * The icon buttons for an alignment select, or `null` if it is not one.
 *
 * Pure, and exported so the tests execute it — including on the selects that
 * must NOT be caught: a Divider's Add Element (None / Text / Icon), an Icon's
 * View (Default / Stacked / Framed), an Image's Object Fit.
 */
export function alignmentChoice(
  control: WidgetControl,
): Array<{ v: string; title: string; icon: React.ReactNode }> | null {
  if (control.type !== "select") return null;
  const options = controlOptions(control);
  if (options.length < 3) return null;
  let directions = 0;
  for (const o of options) {
    const v = String(o.value).toLowerCase();
    if (ALIGN_EMPTY.has(v)) continue;
    if (!ALIGN_GLYPHS[v]) return null;
    if (v !== "stretch") directions += 1;
  }
  if (directions < 2) return null;
  /* The "nothing" option is not a button: the reference's chooser is pressed
     OFF to mean "the page's own", which `IconChoice` already does — pressing
     the pressed one writes `undefined`. */
  return options
    .filter((o) => !ALIGN_EMPTY.has(String(o.value).toLowerCase()))
    .map((o) => ({ v: String(o.value), ...ALIGN_GLYPHS[String(o.value).toLowerCase()] }));
}

/**
 * Is a switch ON? Elementor's switcher stores the string "yes"; a checkbox
 * writes a boolean. ONE reader, because "yes" is truthy and `false` is not,
 * and a control that reads only one of the two silently loses the other.
 */
export function isOn(v: unknown): boolean {
  return v === true || v === "yes";
}

/**
 * WHERE A CONTROL'S VALUE IS STORED FOR THIS SCREEN.
 *
 * Desktop is the bare key — the value everything falls back to. Tablet and
 * phone are Elementor's own suffixes, and `phone` is spelled `_mobile` because
 * that is what the machine file, the page engine and every stored Elementor
 * document call it; our own device is named `phone` and the translation happens
 * here, once.
 *
 * A control that is not responsive is the bare key on every screen.
 */
export function deviceKey(control: WidgetControl, device: PreviewKey): string {
  if (!control.responsive || device === "desktop") return control.key;
  return device === "tablet" ? `${control.key}_tablet` : `${control.key}_mobile`;
}

export interface DefinitionControlsProps {
  /** The selected widget's definition. Nothing is drawn without one. */
  def: WidgetDef | null | undefined;
  /** Which of the three tabs is showing. Only its controls are drawn. */
  tab: ControlTab;
  /** The widget's stored properties. */
  props: Record<string, unknown>;
  /** The device being previewed AND edited. One state, from BuilderShell. */
  device: PreviewKey;
  /**
   * THE NAME OF THE BAND THESE CONTROLS ARE DRAWN INSIDE (2026-09-20).
   *
   * The reference never says a band's name twice: the band is "Heading" and
   * nothing under it says "Heading" again. Ours drew a `data-control-subheading`
   * with the SAME word as the band above it on every widget's first section —
   * audit round 4, row 24, one of the nine extras. A sub-heading whose text
   * equals this is not drawn. The OTHER sub-headings stay: a price table's
   * Pricing / Features / Ribbon are the reference's own in-section headings.
   */
  bandTitle?: string;
  /**
   * SWITCH THE DEVICE FROM A CONTROL'S OWN LABEL ROW.
   *
   * Needed the moment a widget size became a `Slider`: the container's sizes
   * carry the three glyphs on the label, and a widget's should too. Optional,
   * so a caller that has no device state draws the slider without them rather
   * than not at all.
   */
  onDevice?: (d: Device) => void;
  /**
   * DRAW EACH SECTION AS A BAND (2026-09-20, audit round 4 row 25).
   *
   * Driven: a widget's Style tab in the reference is real sections — "Image"
   * and "Caption" are bands that open and shut. Ours was a flat list with
   * plain sub-headings and nothing on it could be collapsed, so a Text
   * Editor's Style tab was a scroll of twenty-nine rows in a 300px column.
   *
   * The Content tab does NOT ask for this: the Inspector already wraps it in
   * one Group named after the widget, which is what the reference does there
   * and what SCREEN LAW 10 pins.
   */
  asBands?: boolean;
  /** The brand kit's colours, for a colour control. */
  swatches?: string[];
  /** Write one property. The key is already resolved for the device. */
  onPatch: (patch: Record<string, unknown>) => void;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE REPEATER — Elementor's own rows, add, duplicate and delete
   ══════════════════════════════════════════════════════════════════════════ */

/** The small square buttons on a row: duplicate, delete, up, down. */
const ROW_BTN: React.CSSProperties = {
  border: "1px solid #D7E2E9", background: "#fff", borderRadius: 3,
  width: 22, height: 22, lineHeight: "20px", padding: 0, cursor: "pointer",
  color: "#48697A", fontSize: 12,
};

export interface RepeaterControlProps {
  control: WidgetControl;
  /**
   * EVERY control of this widget, not just this one (R2-4).
   *
   * A Table's `rows` are a line of cells per entry of its `columns`, so adding
   * or deleting a column has to change every line — and only the whole list
   * knows which controls follow which. `repeaterOp` answers it; this hands it
   * the question.
   */
  controls: readonly WidgetControl[];
  /** The widget's whole props: a table's rows are as wide as its columns. */
  props: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

/**
 * One repeating control.
 *
 * Elementor's shape: a stack of rows, each collapsed to its own title with a
 * duplicate and a delete beside it, opening to the row's fields; and one
 * full-width "Add Item" under the stack. The two arrows are ours in place of
 * Elementor's drag handle — a row has to be movable, and a drag inside a panel
 * that already drags widgets onto a page is a second meaning for one gesture.
 */
export function RepeaterControl({ control, controls, props, onPatch }: RepeaterControlProps) {
  const [open, setOpen] = React.useState<number | null>(null);
  // The rows this control EDITS — its own key, or the other spelling of the
  // same list when its own is empty (B-168; `RepeaterSpec.from`).
  const rows = rowsFor(control, props, control.key);
  const headings = control.cellsFrom
    ? rowsOf(props, control.cellsFrom).map((h) => String(h ?? ""))
    : undefined;
  const width = control.cellsFrom ? cellCount(control, props) : undefined;
  const write = (next: RepeaterRow[]) => onPatch({ [control.key]: next });
  /* THE PANEL SAYS WHAT WAS PRESSED; THE MODEL SAYS WHAT CHANGES (R2-4).
     A row added to the Columns list is a column added to the TABLE, and every
     line has to gain a cell in the same place. That is one rule in
     `repeater.ts`, not four repairs here. An empty patch means the press
     changed nothing — the first row's "up", say — and writes nothing. */
  const press = (op: RepeaterOp) => {
    const patch = repeaterOp(controls, props, control.key, op);
    if (Object.keys(patch).length) onPatch(patch);
  };

  return (
    <div data-repeater={control.key}>
      {rows.map((row, i) => {
        const fields = rowFields(row, { width, headings });
        return (
          <div key={i} data-repeater-row={i}
            style={{ border: "1px solid #E2E8F0", borderRadius: 4, marginBottom: 4, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px" }}>
              <button type="button" data-repeater-open={i}
                onClick={() => setOpen((cur) => (cur === i ? null : i))}
                style={{ flex: 1, textAlign: "left", border: 0, background: "none", cursor: "pointer",
                  font: "inherit", fontSize: 12, color: "#0B1C24", padding: 0, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rowTitle(row, i, headings)}
              </button>
              <button type="button" title="Move up" aria-label={`Move item ${i + 1} up`}
                data-repeater-up={i} style={ROW_BTN}
                onClick={() => press({ kind: "move", from: i, to: i - 1 })}>↑</button>
              <button type="button" title="Move down" aria-label={`Move item ${i + 1} down`}
                data-repeater-down={i} style={ROW_BTN}
                onClick={() => press({ kind: "move", from: i, to: i + 1 })}>↓</button>
              <button type="button" title="Duplicate" aria-label={`Duplicate item ${i + 1}`}
                data-repeater-duplicate={i} style={ROW_BTN}
                onClick={() => press({ kind: "duplicate", at: i })}>⧉</button>
              <button type="button" title="Delete" aria-label={`Delete item ${i + 1}`}
                data-repeater-remove={i} style={ROW_BTN}
                onClick={() => { press({ kind: "remove", at: i }); setOpen(null); }}>×</button>
            </div>
            {open === i && (
              <div style={{ padding: "0 6px 6px 6px", display: "grid", gap: 4 }}>
                {fields.map((f) => (
                  <div key={f.name} style={FIELD} data-repeater-field={`${i}.${f.name}`}>
                    {f.label && <span style={L}>{f.label}</span>}
                    <input style={INPUT} value={f.value}
                      onChange={(e) => {
                        const next = rows.slice();
                        next[i] = setRowField(row, f.name, e.target.value);
                        write(next);
                      }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" data-repeater-add={control.key}
        onClick={() => { press({ kind: "add" }); setOpen(rows.length); }}
        style={{ width: "100%", padding: "6px 8px", border: "1px dashed #B9CBD6", borderRadius: 4,
          background: "#F6FAFC", cursor: "pointer", font: "inherit", fontSize: 12, color: "#0C4A60" }}>
        Add Item
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE EDITOR BOX — the words, in the panel as well as on the page
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT MARK-UP THE PLATFORM ACTUALLY UNDERSTANDS, said out loud.
 *
 * The audit asked for a box with bold, italic, underline, link, bulleted and
 * numbered list. FIVE of those six do not exist on this platform, and this is
 * the honest note about why they are not on the toolbar:
 *
 * The stored value of a Text Editor is PLAIN TEXT, not HTML — `Canvas.commit`
 * writes `readEditedText(el)`, which is `innerText`. The one thing the text
 * language has is `**bold**`, and `runs.ts boldRuns` is the one reader of it,
 * shared by the page, the printed PDF, the mailbox (`emailTextEditor`) and
 * arion's publisher. A toolbar button for italic would write `*like this*` and
 * the page would print the asterisks — a control that changes nothing on the
 * canvas is a defect, and one that writes junk onto a document a customer
 * signs is worse. Giving the other five meaning is a change to `runs.ts` and to
 * three server mirrors, which is a pass of its own and is recorded in the
 * handoff.
 *
 * So the toolbar is Bold and a paragraph break: the two marks the renderer
 * reads. Both write the SAME stored key the canvas writes, in the same
 * language, so the two doors are one value and either can be used at any time.
 */
const EDITOR_MARKS = "**bold**";

/** Wrap (or unwrap) the selection in `**`, and say where the caret lands. */
export function toggleBold(text: string, start: number, end: number): { text: string; start: number; end: number } {
  const t = String(text ?? "");
  const a = Math.max(0, Math.min(t.length, start));
  const b = Math.max(a, Math.min(t.length, end));
  if (a === b) {
    /* Nothing selected: drop an empty pair in and put the caret between them,
       which is what an author pressing B before typing means. */
    return { text: `${t.slice(0, a)}****${t.slice(a)}`, start: a + 2, end: a + 2 };
  }
  const inner = t.slice(a, b);
  if (inner.startsWith("**") && inner.endsWith("**") && inner.length >= 4) {
    const bare = inner.slice(2, -2);
    return { text: t.slice(0, a) + bare + t.slice(b), start: a, end: a + bare.length };
  }
  if (t.slice(Math.max(0, a - 2), a) === "**" && t.slice(b, b + 2) === "**") {
    return { text: t.slice(0, a - 2) + inner + t.slice(b + 2), start: a - 2, end: a - 2 + inner.length };
  }
  return { text: `${t.slice(0, a)}**${inner}**${t.slice(b)}`, start: a + 2, end: b + 2 };
}

/** A blank line, which is what `paras` splits a new paragraph on. */
export function newParagraph(text: string, at: number): { text: string; start: number; end: number } {
  const t = String(text ?? "");
  const a = Math.max(0, Math.min(t.length, at));
  return { text: `${t.slice(0, a)}\n\n${t.slice(a)}`, start: a + 2, end: a + 2 };
}

const EDITOR_BTN: React.CSSProperties = {
  border: "1px solid #D5D8DC", background: "#fff", borderRadius: 3, minWidth: 26, height: 22,
  padding: "0 6px", cursor: "pointer", color: "#515962", fontSize: 12, lineHeight: "20px",
};

/**
 * The Text Editor's own box — unlabelled, as the reference's is.
 *
 * Both directions are live because there is only one value: the box shows the
 * stored prop, and typing in it writes the same key `data-edit="text"` writes
 * from the page, so a word typed on the canvas appears here and a word typed
 * here appears on the canvas.
 */
export function PanelEditor({ control, value, onChange }: {
  control: WidgetControl;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  const apply = (next: { text: string; start: number; end: number }) => {
    onChange(next.text);
    /* Put the caret back where the author expects it. After React has redrawn
       the box, or the browser drops it at the end of the words. */
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  const sel = () => {
    const el = ref.current;
    return { a: el?.selectionStart ?? value.length, b: el?.selectionEnd ?? value.length };
  };
  return (
    <div style={FIELD} data-panel-editor={control.key}>
      <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Formatting">
        <button type="button" data-editor-mark="bold" title="Bold" aria-label="Bold"
          style={{ ...EDITOR_BTN, fontWeight: 700 }}
          onClick={() => { const { a, b } = sel(); apply(toggleBold(value, a, b)); }}>B</button>
        <button type="button" data-editor-mark="paragraph" title="New paragraph" aria-label="New paragraph"
          style={EDITOR_BTN}
          onClick={() => { const { a } = sel(); apply(newParagraph(value, a)); }}>¶</button>
      </div>
      <textarea
        ref={ref}
        data-panel-text={control.key}
        style={{ ...INPUT, minHeight: 120, resize: "vertical", lineHeight: 1.5 }}
        placeholder="Type here…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* NOT A GREY EXPLANATION (round 4 row 23): the two marks the page reads,
          named on the two buttons that write them. The panel says nothing a
          button does not already say. */}
      {void EDITOR_MARKS}
    </div>
  );
}

/** Every control of `def` that belongs on `tab`, in its own panel sections. */
export function DefinitionControls(p: DefinitionControlsProps) {
  const props = p.props || {};
  const onTab = (p.def?.controls || []).filter((c) => controlTab(c) === p.tab);
  const valueOf = (c: WidgetControl) => (props as any)[deviceKey(c, p.device)];
  const patch = (c: WidgetControl, v: unknown) => p.onPatch({ [deviceKey(c, p.device)]: v });
  /* ONE BAND OPEN ON ARRIVAL, and it is the first — the reference's own
     rule, measured in round 4 (row 19).

     FOUND BY DRIVING IT (2026-09-20): this was `controlSections(onTab)[0]`
     beside a SECOND `controlSections(onTab)` in the map below, and the
     function builds a new array every call — so `grp === first` was never
     true by reference and every band on a widget's Style tab arrived shut.
     One call, one list, compared by index. */
  const sections = controlSections(onTab);

  return (
    <>
      {sections.map((grp, at) => {
        /* DRAWN, AND ITS CONDITION MET (2026-09-20). One filter, in the one
           place a definition's control becomes a row — so a family declares a
           condition and writes no code, and a control the reference hides
           cannot be on our screen by accident. */
        const shown = grp.controls.filter((c) => isDrawnInPanel(c) && controlIsShown(c, props));
        if (!shown.length) return null;
        /* A BAND, WHERE A BAND IS ASKED FOR (round 4 row 25). The section
           name IS the band name, so the sub-heading below never draws —
           the reference never says one name twice. One open at a time is
           the panel's own `Accordion`, which the Inspector already wraps
           this whole column in. */
        const band = !!p.asBands && !!grp.section;
        const body = (
          <div key={grp.section ?? "_"} data-control-section={grp.section ?? ""}>
            {/* A SUB-HEADING IS TITLE CASE (D-172, round 2, from b168/demo).
                The reference's in-section headings are a `heading` control
                reading "Items", "Visibility" — Title Case, no letter-spacing,
                no shouting. Ours was the label style with uppercase and 0.4 of
                tracking, so a heading inside a section looked louder than the
                section's own name above it. */}
            {/* …AND NEVER THE BAND'S OWN NAME AGAIN (2026-09-20, round 4 row
                24). Driven: the reference's first band on a Heading is called
                "Heading" and nothing inside it repeats the word. */}
            {grp.section && grp.section !== p.bandTitle && !band && (
              <div data-control-subheading={grp.section}
                style={{ ...L, marginTop: 4, fontWeight: 600, color: "#0B1C24" }}>
                {grp.section}
              </div>
            )}
            {/* LABEL LEFT, CONTROL RIGHT (D-172, round 2, from b168/demo).
                Measured in the reference: every control row is a flex row with
                the label at x=20 and the input at x=172. `code`, whose control
                is a textarea with a preview under it, keeps the stacked shape —
                the reference marks that kind `elementor-label-block` too. */}
            {/* A REPEATER IS A BLOCK, not a label-left row: Elementor stacks
                its rows and its Add Item button under the control's name, full
                width. Drawn before the row map and returning early, so the row
                below stays the one shape SCREEN LAW 10 pins. */}
            {/* THE EDITOR BOX IS A BLOCK TOO, and it comes FIRST — the
                reference's Text Editor opens on it. Unlabelled, which is what
                that one control is there. */}
            {shown.filter(isPanelEditor).map((c) => (
              <PanelEditor key={c.key} control={c}
                value={String(valueOf(c) ?? "")}
                onChange={(v) => patch(c, v)} />
            ))}
            {shown.filter((c) => c.type === "list").map((c) => (
              <div key={c.key} style={FIELD} data-control={c.key} data-control-key={c.key}>
                <span style={L}>{c.label}</span>
                <RepeaterControl control={c} controls={p.def?.controls || []} props={props} onPatch={p.onPatch} />
              </div>
            ))}
            {shown.filter((c) => c.type !== "list" && !isPanelEditor(c)).map((c) => {
              /* A SIZE IS A SLIDER (round 4 row 36). The same component the
                 container's Width, Min Height and Gaps use — a range, a number
                 box and the unit it is measured in, the label ABOVE, which is
                 the shape the reference gives every size. It returns EARLY, so
                 the label-left row below is untouched and stays where SCREEN
                 LAW 10 pins it; the control keeps its place in the section
                 because this is one pass over `shown`, not a second one. */
              if (isSizeControl(c)) {
                const n = Number(valueOf(c));
                return (
                  <div key={c.key} data-control={c.key} data-control-key={deviceKey(c, p.device)}
                    data-control-responsive={c.responsive ? "yes" : undefined}>
                    <Slider
                      label={c.label}
                      head={<>
                        <span style={L}>{c.label}</span>
                        {c.responsive && p.onDevice && (
                          <DeviceSegment device={p.device as Device} onDevice={p.onDevice} />)}
                      </>}
                      testAttr={`data-size-${c.key}`}
                      units={c.units || []}
                      /* ONE UNIT, STATED. The renderer writes it after the bare
                         number, so there is nothing to switch and nothing to
                         store — see `units` in registry.ts. */
                      unit={(c.units || [])[0]}
                      max={c.max}
                      value={Number.isFinite(n) && valueOf(c) !== "" && valueOf(c) != null ? n : undefined}
                      onChange={(v) => patch(c, v)}
                      onUnit={() => undefined}
                    />
                  </div>
                );
              }
              return (
              <div key={c.key} style={c.type === "code" ? FIELD : ROW} data-control={c.key}
                data-control-key={deviceKey(c, p.device)}
                data-control-responsive={c.responsive ? "yes" : undefined}>
                {/* THE DEVICE SWITCHER BELONGS TO EVERY RESPONSIVE CONTROL, not
                    only to the sliders (B-168, 2026-09-22). It was drawn in the
                    size-slider branch above and nowhere else, so a Heading's
                    Alignment and an Icon Box's Size were marked responsive,
                    stored their `_tablet` / `_mobile` twins and offered no way
                    to reach them — the author could set the desktop value and
                    nothing else. The parity scorer found it on two widgets; it
                    was on every non-slider responsive control there is.
                    Beside the label, which is where the reference puts it. */}
                <span style={c.responsive && p.onDevice
                  ? { ...L, display: "flex", alignItems: "center", gap: 6 } : L}>
                  {c.label}
                  {c.responsive && p.onDevice && (
                    <DeviceSegment device={p.device as Device} onDevice={p.onDevice} />)}
                </span>
                {/* EVERY TOGGLE IS THE SWITCHER PILL (D-172, round 2). The
                    reference has one on/off shape, and a native checkbox whose
                    label was its help sentence was the last one left. */}
                {c.type === "toggle" && (
                  <Switcher
                    name={c.label}
                    testId={deviceKey(c, p.device)}
                    on={isOn(valueOf(c))}
                    onChange={(v) => patch(c, v)}
                  />
                )}
                {/* AN ALIGNMENT IS ICON BUTTONS (round 4 rows 38, 106, 137,
                    144, 145). The OPTIONS say whether it is one; nothing in
                    any family file had to change. Pressing the pressed one
                    writes `undefined`, which is the reference's "the page's
                    own" — the value the empty option used to carry. */}
                {c.type === "select" && alignmentChoice(c) && (
                  <IconChoice
                    name={c.label}
                    testAttr={`data-align-${c.key}`}
                    value={String(valueOf(c) ?? "") || undefined}
                    options={alignmentChoice(c) as Array<{ v: string; title: string; icon: React.ReactNode }>}
                    onPick={(v) => patch(c, v ?? "")}
                  />
                )}
                {c.type === "select" && !alignmentChoice(c) && (controlOptions(c).length ? (
                  <select style={INPUT} value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, optionValue(c, e.target.value))}>
                    {controlOptions(c).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : null)}
                {c.type === "number" && (
                  <input type="number" style={INPUT} value={Number(valueOf(c) ?? 0)}
                    onChange={(e) => patch(c, Number(e.target.value))} />
                )}
                {c.type === "colour" && (
                  <Swatches value={String(valueOf(c) ?? "")} swatches={p.swatches}
                    onPick={(v) => patch(c, v)} />
                )}
                {(c.type === "image" || c.type === "link") && (
                  <input style={INPUT} placeholder={c.type === "image" ? "Paste an image address" : "https://"}
                    value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, e.target.value)} />
                )}
                {/* A CODE BOX WITH A LIVE PREVIEW. The box is monospace and
                    does not wrap words in the middle of a tag; the preview
                    under it is the same markup the page will carry, drawn
                    here so the author sees what they pasted before anybody
                    else does. */}
                {/* THE WORDS, IN THE PANEL AS WELL AS ON THE PAGE
                    (2026-09-20). Only for a control that asked — `panel` in
                    registry.ts — and it writes the SAME stored key the canvas
                    writes, so the two boxes are one value. A textarea because
                    Elementor's Title is one and a heading can be two lines. */}
                {/* A `textarea` GETS A TEXTAREA AND A `text` GETS A LINE
                    (2026-09-20). The reference's Heading Title is a textarea —
                    a heading can be two lines — and its Button Text is a
                    single-line text field. One row shape, two boxes, chosen by
                    the control's own declared type rather than by a second
                    flag beside it. */}
                {c.panel === true && c.type === "textarea" && (
                  <textarea
                    style={{ ...INPUT, minHeight: 52, resize: "vertical" }}
                    data-panel-text={c.key}
                    rows={2}
                    value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, e.target.value)} />
                )}
                {c.panel === true && c.type === "text" && (
                  <input
                    style={INPUT}
                    data-panel-text={c.key}
                    value={String(valueOf(c) ?? "")}
                    onChange={(e) => patch(c, e.target.value)} />
                )}
                {c.type === "code" && (
                  <>
                    <textarea
                      style={{ ...INPUT, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, whiteSpace: "pre", overflowWrap: "normal" }}
                      data-code-box={c.key}
                      spellCheck={false}
                      placeholder="<div>Paste your own HTML here</div>"
                      value={String(valueOf(c) ?? "")}
                      onChange={(e) => patch(c, e.target.value)} />
                    <span style={{ fontSize: 10, color: "#5A7A8A" }}>What it looks like</span>
                    <div
                      data-code-preview={c.key}
                      style={{ border: "1px solid #E2E8F0", borderRadius: 4, padding: 8, background: "#fff", overflow: "auto", maxHeight: 220 }}
                      dangerouslySetInnerHTML={{ __html: String(valueOf(c) ?? "") }} />
                  </>
                )}
                {/* THE GREY SENTENCE UNDER A CONTROL IS DELETED (D-172, round
                    2, from b168/demo). The reference puts no explanation under
                    any control in its panel: a sentence about what a widget is
                    belongs where the author CHOOSES the widget, not beside the
                    setting. `c.help` is still on the definition and still
                    reaches the registry's own tooltip. */}
              </div>
              );
            })}
          </div>
        );
        return band
          ? <Group key={grp.section} title={grp.section as string} defaultOpen={at === 0}>{body}</Group>
          : body;
      })}
    </>
  );
}

export default DefinitionControls;
