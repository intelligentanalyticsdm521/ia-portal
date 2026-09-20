/**
 * builder/repeater.ts — A REPEATING CONTROL, WITH ROWS YOU CAN ADD AND TAKE AWAY.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * `BUILDER_REPLICATION_PROPOSALS_2026-09-19.md` G-1, the biggest single loss in
 * the round-1 score and the one every target hit: *"A repeating control draws
 * nothing, so a Table has a header row and no body."* A `list` control is not in
 * `PANEL_CONTROL_TYPES`, so the panel drew no field for it, and a Table arrives
 * with three header cells, an empty body and an empty Content tab. What the
 * widget arrived with was what it had for ever.
 *
 * Elementor answers this with a REPEATER: rows, each with a duplicate and a
 * delete, and an "Add Item" button underneath
 * (`BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, `icon-list` →
 * `{"type":"repeater","label":"Items","repeater_fields":{…}}`). This is that
 * control's arithmetic, and `definitionControls.tsx` draws it.
 *
 * ── WHY IT IS A MODULE AND NOT TEN LINES IN THE PANEL ─────────────────────
 * Because "what a new row is" already existed, in `BuilderShell.blankRepeat`,
 * where only the INSERT could reach it. Two answers to that question is how a
 * Table whose rows are arrays gets a new row that is a string. There is now one
 * answer and the shell asks it too — `blankRepeat` is DELETED, not copied.
 *
 * Pure: no React, no DOM. The panel draws; this decides.
 *
 * ── A CONTROL OPTS IN, AND THE REASON IS NOT TIMIDITY ─────────────────────
 * Only a control that DECLARES the shape of one row — `row`, or `cellsFrom` for
 * a table — is drawn as a repeater. A control that declares neither keeps the
 * behaviour it has today (typed on the page, with one blank slot at the end).
 *
 * That is a presence test, and it is there because several widgets read TWO
 * spellings of one list: the Icon List draws `icon_list` when it has rows and
 * the older `items` when it does not (`families/f3-…/iconList.ts rows()`), and
 * the Basic Gallery scans `wp_gallery`, `images`, `items` in order. Adding a
 * blank row to the first spelling of such a pair silently empties the list the
 * author can see. A control whose owner has said what a row is cannot do that;
 * a control whose owner has not said is not guessed at.
 */

/** A row is a string, an array of cells, or an object of named fields. */
export type RepeaterRow = unknown;

/** What the panel needs to know about one control to draw it as a repeater. */
export interface RepeaterSpec {
  /**
   * ONE BLANK ROW, in this control's own shape — Elementor's `repeater_fields`
   * said as a value instead of a schema. `{ item_text: "" }` for a Price
   * Table's features, `{ title: "", price: "" }` for a Price List's items.
   */
  row?: RepeaterRow;
  /**
   * A ROW IS A LINE OF CELLS, ONE PER ENTRY OF THIS OTHER CONTROL.
   *
   * The Table's `rows` are arrays and there are as many cells as the table has
   * `columns`, so the width is not a constant and cannot be written as a `row`.
   * Naming the sibling control says it once, on the definition, and leaves the
   * panel with no widget's name in it.
   */
  cellsFrom?: string;
}

/** Is this control drawn as a repeater? A presence test, never a name. */
export function isRepeater(spec: RepeaterSpec | null | undefined): boolean {
  return !!spec && (spec.row !== undefined || typeof spec.cellsFrom === "string");
}

/** The list at a key, always an array — a stored document may hold anything. */
export function rowsOf(props: Record<string, unknown> | null | undefined, key: string): RepeaterRow[] {
  const raw = (props || {})[key];
  return Array.isArray(raw) ? raw.slice() : [];
}

/** How many cells a table row has: its own, or the sibling control's count. */
export function cellCount(
  spec: RepeaterSpec,
  props: Record<string, unknown> | null | undefined,
  row?: RepeaterRow,
): number {
  const declared = spec.cellsFrom ? rowsOf(props, spec.cellsFrom).length : 0;
  const own = Array.isArray(row) ? row.length : 0;
  return Math.max(declared, own, 1);
}

/** Everything typed out of a row, so a duplicate is a row and not its words. */
function emptied(value: RepeaterRow): RepeaterRow {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(emptied);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = emptied(v);
    return out;
  }
  /* A NUMBER OR A FLAG IS A SETTING, NOT WORDS. A Call to Action row's `tone`
     is "accent" because that is what the row is, and blanking it would make the
     next row draw in no colour at all. Only strings are typed, so only strings
     are cleared. */
  return value;
}

/**
 * THE BLANK ROW, in the shape this control's rows already have.
 *
 *   1. a table            → a line of blank cells, ONE PER COLUMN.
 *   2. the list has rows  → the LAST one, emptied. A repeater grows in the
 *      shape it is already in, which is what keeps a Call to Action row's
 *      `tone` and a Price List row's fields.
 *   3. `row` declared     → a copy of it.
 *   4. otherwise          → "".
 *
 * THE TABLE COMES FIRST (R2-4, 2026-09-20). It used to copy the last row
 * whatever the control was, so a row added to a three-cell table whose header
 * had just gained a fourth column came out three cells wide and the canvas had
 * no cell to aim at. A table row is a line of cells, one per heading — there is
 * nothing else it could be, so it is not guessed from the row above.
 */
export function blankRow(
  spec: RepeaterSpec,
  props: Record<string, unknown> | null | undefined,
  key: string,
): RepeaterRow {
  if (spec.cellsFrom) return Array.from({ length: cellCount(spec, props) }, () => "");
  const rows = rowsOf(props, key);
  if (rows.length) return emptied(rows[rows.length - 1]);
  if (spec.row !== undefined) return emptied(structuredCloneish(spec.row));
  return "";
}

/** A deep copy that does not need `structuredClone` in every runtime. */
function structuredCloneish<T>(v: T): T {
  return v === null || typeof v !== "object" ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/* ══════════════════════════════════════════════════════════════════════════
   The four things a row can have done to it
   ══════════════════════════════════════════════════════════════════════════ */

/** One more row at the end. */
export function addRow(rows: RepeaterRow[], blank: RepeaterRow): RepeaterRow[] {
  return [...rows, structuredCloneish(blank)];
}

/** The row at `i` again, directly under it — Elementor's copy button. */
export function duplicateRow(rows: RepeaterRow[], i: number): RepeaterRow[] {
  if (i < 0 || i >= rows.length) return rows;
  const out = rows.slice();
  out.splice(i + 1, 0, structuredCloneish(rows[i]));
  return out;
}

/** The row at `i`, gone. */
export function removeRow(rows: RepeaterRow[], i: number): RepeaterRow[] {
  if (i < 0 || i >= rows.length) return rows;
  const out = rows.slice();
  out.splice(i, 1);
  return out;
}

/**
 * The row at `from`, moved to `to`.
 *
 * An index outside the list returns the SAME array by identity, so a control
 * that presses "up" on the first row writes nothing and the document is not
 * marked changed for a move that did not happen.
 */
export function moveRow(rows: RepeaterRow[], from: number, to: number): RepeaterRow[] {
  if (from === to || from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const out = rows.slice();
  const [taken] = out.splice(from, 1);
  out.splice(to, 0, taken);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   What one row looks like as fields
   ══════════════════════════════════════════════════════════════════════════ */

/** One box in the panel: where it writes, what it is called, what is in it. */
export interface RowField {
  /** The field's name inside the row — "" for a row that IS one string. */
  name: string;
  label: string;
  value: string;
}

/**
 * `item_text` → "Item Text". Elementor's own repeater labels read this way and
 * the key is the only name a row carries, so the panel says it in words rather
 * than printing a database column at an author.
 */
export function fieldLabel(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * The boxes one row draws.
 *
 * A STRING row is one box with no label of its own — the control's label is
 * above the whole repeater and a second copy of it on every line is noise.
 * An ARRAY row is one box per cell, labelled by the table's own column
 * headings when it has them and by the cell's number when it does not.
 * An OBJECT row is one box per string field, in declaration order; a field
 * holding a number, a flag or another object is a setting the row carries and
 * is left alone rather than flattened into a text box that would store the
 * word "true".
 */
export function rowFields(
  row: RepeaterRow,
  opts: { width?: number; headings?: string[] } = {},
): RowField[] {
  if (Array.isArray(row) || opts.width) {
    const cells = Array.isArray(row) ? row : [];
    const width = Math.max(opts.width ?? 0, cells.length, 1);
    return Array.from({ length: width }, (_, i) => ({
      name: String(i),
      label: String(opts.headings?.[i] ?? "").trim() || `Column ${i + 1}`,
      value: typeof cells[i] === "string" ? (cells[i] as string) : String(cells[i] ?? ""),
    }));
  }
  if (row && typeof row === "object") {
    return Object.entries(row as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string")
      .map(([name, v]) => ({ name, label: fieldLabel(name), value: v as string }));
  }
  return [{ name: "", label: "", value: typeof row === "string" ? row : String(row ?? "") }];
}

/** One box, written back into its row. The row keeps everything else it had. */
export function setRowField(row: RepeaterRow, name: string, value: string): RepeaterRow {
  if (name === "") return value;
  if (/^\d+$/.test(name)) {
    const i = Number(name);
    const cells = Array.isArray(row) ? row.slice() : [];
    while (cells.length <= i) cells.push("");
    cells[i] = value;
    return cells;
  }
  const obj = row && typeof row === "object" && !Array.isArray(row)
    ? { ...(row as Record<string, unknown>) } : {};
  obj[name] = value;
  return obj;
}

/**
 * WHAT A COLLAPSED ROW IS CALLED.
 *
 * Elementor prints the row's own title field and falls back to "Item #n". So do
 * we: the first field with words in it, and the number when the row is blank —
 * which a row always is the moment it is added, and is the state the author is
 * looking at while they fill it in.
 */
export function rowTitle(row: RepeaterRow, i: number, headings?: string[]): string {
  const words = rowFields(row, { headings }).map((f) => f.value.trim()).find(Boolean);
  return words || `Item #${i + 1}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BODY FOLLOWS THE HEADER (R2-4, 2026-09-20)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHY THE FOUR OPERATIONS ABOVE ARE NOT ENOUGH ON THEIR OWN.
 *
 * Measured by the round-2 scorer: add a fourth column to a Table and every
 * existing line stays three cells wide; delete a column and every line keeps an
 * orphan cell under nothing. The panel drew the extra box (it takes the width
 * from the headings) so typing healed ONE line at a time, and the customer's
 * copy and the signed PDF were left disagreeing with the header.
 *
 * A table's rows are `cellsFrom: "columns"` — each row is a line of cells, one
 * per heading. That is a fact about the MODEL, so this is where it is kept: a
 * column list and its body change TOGETHER, in one patch, by one rule, and
 * whatever was done to the header is done to every line.
 *
 * Not squared by width afterwards, because a width is not enough to know WHICH
 * cell went: deleting the FIRST of three columns and trimming each row to two
 * cells would leave every line's third value in its second column. The
 * operation is applied, not its arithmetic guessed at.
 */
export type RepeaterOp =
  | { kind: "add" }
  | { kind: "duplicate"; at: number }
  | { kind: "remove"; at: number }
  | { kind: "move"; from: number; to: number };

/** A control, as this module needs to see one: a key and what a row is. */
export interface RepeaterControlLike extends RepeaterSpec { key: string }

/** One operation, applied to a list of rows. The one place the four live. */
function applyOp(rows: RepeaterRow[], op: RepeaterOp, blank: RepeaterRow): RepeaterRow[] {
  switch (op.kind) {
    case "add": return addRow(rows, blank);
    case "duplicate": return duplicateRow(rows, op.at);
    case "remove": return removeRow(rows, op.at);
    case "move": return moveRow(rows, op.from, op.to);
  }
}

/**
 * The WHOLE patch an operation on one repeating control makes.
 *
 * `{ columns: [...] }` on its own when nothing follows this control, and
 * `{ columns: [...], rows: [...] }` when something does. The caller writes what
 * comes back and asks no further questions.
 */
export function repeaterOp(
  controls: readonly RepeaterControlLike[],
  props: Record<string, unknown> | null | undefined,
  key: string,
  op: RepeaterOp,
): Record<string, unknown> {
  const spec = controls.find((c) => c.key === key) ?? { key };
  const rows = rowsOf(props, key);
  const next = applyOp(rows, op, blankRow(spec, props, key));
  if (next === rows) return {};
  const patch: Record<string, unknown> = { [key]: next };

  for (const dependent of controls) {
    if (dependent.key === key || dependent.cellsFrom !== key) continue;
    const body = rowsOf(props, dependent.key);
    if (!body.length) continue;
    /* EVERY LINE, THE SAME CHANGE. A cell is blank when a column is added,
       because a heading has no value to bring with it — `""` and not the
       heading's own words, which would print the column name in every row. */
    patch[dependent.key] = body.map((row) => {
      const cells = Array.isArray(row) ? row : [];
      const moved = applyOp(cells, op, "");
      return moved === cells ? cells.slice() : moved;
    });
  }
  return patch;
}

/**
 * A LINE OF CELLS AS WIDE AS THE HEADER, for a document written before that
 * rule existed (R2-4).
 *
 * The rule above keeps a table square from the moment a column is added or
 * taken away. A document stored before it can still hold a short row or an
 * orphan cell, and the screen, the customer's copy and the PDF must all say the
 * same thing about it — so every reader squares what it is about to draw. Pure,
 * and it changes nothing that is already the right width.
 */
export function squareCells(row: RepeaterRow, width: number): string[] {
  const cells = Array.isArray(row) ? row : [];
  return Array.from({ length: Math.max(0, width) }, (_, i) => String(cells[i] ?? ""));
}

export default {
  isRepeater, rowsOf, cellCount, blankRow, addRow, duplicateRow, removeRow, moveRow,
  rowFields, setRowField, rowTitle, fieldLabel, repeaterOp, squareCells,
};
