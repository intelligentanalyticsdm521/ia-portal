/**
 * builder/model.ts — THE document model. One shape for every builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.1/§3.2, step 2 (the engine).
 *
 * A document is an ordered list of SECTIONS. A section is a row on the canvas
 * with 1–3 COLUMNS. A column holds an ordered list of WIDGETS. That is the
 * whole model — the same one the ARION section codec already round-trips to
 * Elementor's tree, and the one the inventory found eleven private versions of.
 *
 *     document ── sections[] ── columns[] ── widgets[]
 *
 * ── PURE ON PURPOSE ───────────────────────────────────────────────────────
 * No React, no fetch, no Date.now() inside an operation's result: every
 * function here takes a document and returns a NEW document, so undo/redo is
 * a list of these values and `node --test` can drive the lot (the Portal's
 * runner only takes pure modules — scripts/test-ts-loader.mjs says so).
 *
 * ── THE TWO MONEY RULES, IN CODE RATHER THAN IN A COMMENT ─────────────────
 *   1. COMPARISON CARDS NEVER SUM. A tier comparison shows four options and
 *      the customer buys one; summing them silently changes what they are
 *      agreeing to pay. `PRICED_KINDS` is the allow-list and `comparison_cards`
 *      is not in it — see totals.ts, and the mutation test that removes the
 *      guard and expects red.
 *   2. A MULTI-SITE PROPOSAL HAS ONE TOTAL. Each property block carries its
 *      own subtotal; the document total is the sum of the sites plus the
 *      document's own priced lines, counted once.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════════ */

import { readStyle, type ElementStyle } from "./style";

/** How wide the section's content runs inside the page. */
export type SectionWidth = "full" | "contained" | "narrow";

/** Light text on a dark ground, or the other way round. */
export type SectionTheme = "light" | "dark";

/** Whether the customer sees this section at all. */
export type SectionVisibility = "customer" | "internal";

export interface Widget {
  id: string;
  kind: string;
  /** Everything the widget's renderer reads. Shape per kind; see registry.ts. */
  props: Record<string, unknown>;
  /**
   * A part of the document the law puts there, not the author.
   *
   * An email's footer carries the unsubscribe link and the sender's physical
   * address; CAN-SPAM requires both on every marketing send, so the author may
   * edit the words in it and may NOT take it off the page. `removeWidget` and
   * `removeSection` both refuse, and the email renderer puts the block back if
   * a document reaches it without one — two guards, because "the author cannot
   * click the button" is not the same promise as "the email cannot go out
   * without it". See adapters/email/emailRender.ts.
   */
  locked?: boolean;
  /**
   * How this widget is STYLED, per §11.8 (D-140). Absent on everything the
   * author has not touched, which is what keeps a stored document
   * byte-identical to the one this build read. See style.ts for the shape and
   * for the desktop → tablet → phone cascade.
   */
  style?: ElementStyle;
}

export interface Column {
  id: string;
  widgets: Widget[];
}

export interface Section {
  id: string;
  /** Shown in the section toolbar and as the numbered heading when `numbered`. */
  label?: string;
  numbered?: boolean;
  /** 1, 2 or 3 columns. `columns.length` always equals this. */
  layout: 1 | 2 | 3;
  width: SectionWidth;
  /** A CSS colour, or "" for the page's own paper. */
  background?: string;
  /**
   * This section's own heading font, or "" for the document's.
   *
   * A section-level property rather than a document one because a web page's
   * band can legitimately differ from the rest — and because it has to reach
   * the WEBSITE (arion-api writes it onto the section's own heading widgets as
   * Elementor typography), not just change what the author sees.
   */
  headingFont?: string;
  padding: number;
  theme: SectionTheme;
  /** The Recommended badge, per §3.3. */
  recommended?: boolean;
  /** Documents only: start a new printed page before this section. */
  pageBreakBefore?: boolean;
  visibility: SectionVisibility;
  /**
   * The section's own styling, per §11.8 (D-140).
   *
   * `padding` above stays THE source of truth while `style.padding` is absent:
   * a document written before this existed must render exactly as it did. The
   * four-sided value is seeded from it on WRITE, the first time the author
   * touches a spacing box, and never on read.
   */
  style?: ElementStyle;
  columns: Column[];
  /**
   * THE ADAPTER'S OWN DATA, travelling with the section.
   *
   * The website adapter keeps a section's Elementor node here, because every
   * save sends `{ fields, node }` and the node has to survive undo, redo,
   * reordering and duplication. A `Map` keyed by section id would not: a
   * duplicate is a NEW id, so the copy would have no node and could not be
   * published. Opaque to the engine — carried, never read.
   */
  meta?: Record<string, unknown>;
}

export interface DocumentSettings {
  /** Which header/type treatment the document wears. See templates.ts. */
  style: string;
  /** Any colour and any font, for every author (Q4). The brand kit only
   *  pre-fills these when the document is created. */
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
  /**
   * THE DOCUMENT'S OWN MERGE VALUES (D-03, handoff B-A-3).
   *
   * `{{contract.start_date}}`, `{{snow_trigger}}`, `{{severe_event_threshold}}`
   * are facts about THIS document, not about the customer or the business, and
   * until now there was nowhere to keep them: the 2026-09-16 walk found that
   * Send refused on five blanks that had no field anywhere in the Portal, and
   * the only way through was to retype the clause over the token and destroy
   * the merge field.
   *
   * A flat `token -> value` map, carried verbatim and absent when empty, so a
   * document nobody has filled in is byte-identical to one written before this
   * existed. The ENGINE only carries it; deciding which tokens a document
   * declares and putting a field on screen for each is the adapter's.
   */
  merge?: Record<string, string>;
}

export interface BuilderDocument {
  v: 2;
  settings: DocumentSettings;
  sections: Section[];
}

/** Where a widget is, addressed once so every operation speaks one language. */
export interface WidgetPath {
  sectionId: string;
  columnIndex: number;
  widgetIndex: number;
}

/** What is selected on the canvas. The inspector binds to exactly this. */
export type Selection =
  | { kind: "section"; sectionId: string }
  | { kind: "widget"; sectionId: string; columnIndex: number; widgetIndex: number }
  | null;

/* ══════════════════════════════════════════════════════════════════════════
   Ids
   ══════════════════════════════════════════════════════════════════════════ */

let idCounter = 0;

/**
 * A new id.
 *
 * Deterministic and injectable so a renderer snapshot is stable: pass `seed`
 * from a test, or call resetIds() before building a fixture document.
 */
export function newId(prefix = "w"): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/** Tests and fixtures call this first so ids read w1, w2, w3. */
export function resetIds(): void {
  idCounter = 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Construction
   ══════════════════════════════════════════════════════════════════════════ */

export function emptyColumn(): Column {
  return { id: newId("c"), widgets: [] };
}

export function makeWidget(
  kind: string,
  props: Record<string, unknown> = {},
  opts: { locked?: boolean } = {},
): Widget {
  const w: Widget = { id: newId("w"), kind, props: { ...props } };
  if (opts.locked) w.locked = true;
  return w;
}

/** True when this widget is a required part the author may not remove. */
export function isLocked(w: Widget | null | undefined): boolean {
  return !!w?.locked;
}

/** Every locked widget in the document, in reading order. */
export function lockedWidgets(doc: BuilderDocument): Widget[] {
  return walkWidgets(doc).map((x) => x.widget).filter(isLocked);
}

export function makeSection(partial: Partial<Section> = {}): Section {
  const layout = (partial.layout ?? 1) as 1 | 2 | 3;
  const columns = partial.columns && partial.columns.length === layout
    ? partial.columns
    : Array.from({ length: layout }, () => emptyColumn());
  return {
    id: partial.id ?? newId("s"),
    label: partial.label,
    numbered: partial.numbered ?? false,
    layout,
    width: partial.width ?? "contained",
    background: partial.background ?? "",
    headingFont: partial.headingFont ?? "",
    padding: partial.padding ?? 24,
    theme: partial.theme ?? "light",
    recommended: partial.recommended ?? false,
    pageBreakBefore: partial.pageBreakBefore ?? false,
    visibility: partial.visibility ?? "customer",
    // Only when there IS one: stamping `style: undefined` makes a round trip
    // look like a change, exactly as it would for `headingFont`.
    ...(partial.style && Object.keys(partial.style).length ? { style: partial.style } : {}),
    columns,
    ...(partial.meta ? { meta: partial.meta } : {}),
  };
}

export function emptyDocument(settings: Partial<DocumentSettings> = {}): BuilderDocument {
  return { v: 2, settings: { style: "plain", ...settings }, sections: [] };
}

/* ══════════════════════════════════════════════════════════════════════════
   Serialise / deserialise
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The document as it is stored (oliver.proposal.document_json).
 *
 * JSON.stringify of the value, with nothing else added: the round trip has to
 * be lossless or "open a template, adjust it, save as new" quietly drops what
 * the author did.
 */
export function serialise(doc: BuilderDocument): string {
  return JSON.stringify(doc);
}

/**
 * Read a stored document back.
 *
 * TOLERANT BY RULE, like migration 166's envelope: an unknown widget kind is
 * carried through untouched (a newer editor's widget must not be deleted by an
 * older one just because it opened the document), and anything that is not a
 * document at all comes back as an empty one rather than throwing into a blank
 * white modal.
 */
export function deserialise(raw: unknown): BuilderDocument {
  let value: any = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return emptyDocument(); }
  }
  if (!value || typeof value !== "object") return emptyDocument();
  if (!Array.isArray(value.sections)) return emptyDocument();

  const sections: Section[] = value.sections.map((s: any) => {
    const layout = [1, 2, 3].includes(Number(s?.layout)) ? (Number(s.layout) as 1 | 2 | 3) : 1;
    const rawColumns: any[] = Array.isArray(s?.columns) ? s.columns : [];
    const columns: Column[] = Array.from({ length: layout }, (_, i) => {
      const c = rawColumns[i];
      return {
        id: String(c?.id || newId("c")),
        widgets: (Array.isArray(c?.widgets) ? c.widgets : [])
          .filter((w: any) => w && typeof w === "object" && typeof w.kind === "string")
          .map((w: any) => {
            const out: Widget = {
              id: String(w.id || newId("w")),
              kind: String(w.kind),
              props: w.props && typeof w.props === "object" ? { ...w.props } : {},
            };
            // Carried, not re-derived: a stored footer must come back locked,
            // or opening yesterday's newsletter would make it deletable.
            if (w.locked) out.locked = true;
            // TOLERANT, and absent when empty: a widget nobody has styled has
            // no `style` key, so the golden fixtures stay byte-identical.
            const style = readStyle(w.style);
            if (style) out.style = style;
            return out;
          }),
      };
    });
    return makeSection({
      id: String(s?.id || newId("s")),
      label: s?.label != null ? String(s.label) : undefined,
      numbered: !!s?.numbered,
      layout,
      width: (["full", "contained", "narrow"].includes(s?.width) ? s.width : "contained") as SectionWidth,
      background: typeof s?.background === "string" ? s.background : "",
      headingFont: typeof s?.headingFont === "string" ? s.headingFont : "",
      padding: Number.isFinite(Number(s?.padding)) ? Number(s.padding) : 24,
      theme: s?.theme === "dark" ? "dark" : "light",
      recommended: !!s?.recommended,
      pageBreakBefore: !!s?.pageBreakBefore,
      visibility: s?.visibility === "internal" ? "internal" : "customer",
      style: readStyle(s?.style),
      columns,
      ...(s?.meta && typeof s.meta === "object" ? { meta: s.meta } : {}),
    });
  });

  // Only the keys that are actually set are carried, so serialise →
  // deserialise → serialise is byte-stable. Stamping `headingFont: undefined`
  // makes a round trip look like a change and a save look like an edit.
  const settings: DocumentSettings = {
    style: typeof value?.settings?.style === "string" ? value.settings.style : "plain",
  };
  for (const key of ["accent", "headingFont", "bodyFont"] as const) {
    if (value?.settings?.[key] != null) settings[key] = String(value.settings[key]);
  }
  // TOLERANT, like everything else here: string keys, string values, and the
  // key is absent rather than empty when there is nothing in it — otherwise a
  // round trip would look like an edit and every saved document would gain a
  // `"merge":{}` it never asked for.
  const rawMerge = value?.settings?.merge;
  if (rawMerge && typeof rawMerge === "object" && !Array.isArray(rawMerge)) {
    const merge: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawMerge)) {
      if (typeof k === "string" && k.trim() && v != null && typeof v !== "object") merge[k] = String(v);
    }
    if (Object.keys(merge).length) settings.merge = merge;
  }
  return { v: 2, settings, sections };
}

/* ══════════════════════════════════════════════════════════════════════════
   Reads
   ══════════════════════════════════════════════════════════════════════════ */

export function findSection(doc: BuilderDocument, sectionId: string): Section | null {
  return doc.sections.find((s) => s.id === sectionId) || null;
}

export function widgetAt(doc: BuilderDocument, path: WidgetPath): Widget | null {
  const s = findSection(doc, path.sectionId);
  return s?.columns[path.columnIndex]?.widgets[path.widgetIndex] || null;
}

/** Every widget in the document, in reading order, with where it lives. */
export function walkWidgets(doc: BuilderDocument): Array<{ widget: Widget; path: WidgetPath; section: Section }> {
  const out: Array<{ widget: Widget; path: WidgetPath; section: Section }> = [];
  for (const section of doc.sections) {
    section.columns.forEach((col, columnIndex) => {
      col.widgets.forEach((widget, widgetIndex) => {
        out.push({ widget, path: { sectionId: section.id, columnIndex, widgetIndex }, section });
      });
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Operations — every one returns a NEW document
   ══════════════════════════════════════════════════════════════════════════ */

function mapSections(doc: BuilderDocument, fn: (s: Section) => Section): BuilderDocument {
  return { ...doc, sections: doc.sections.map(fn) };
}

export function addSection(doc: BuilderDocument, section: Section, atIndex?: number): BuilderDocument {
  const sections = [...doc.sections];
  sections.splice(atIndex ?? sections.length, 0, section);
  return { ...doc, sections };
}

/**
 * Take a section off the page.
 *
 * REFUSES when the section holds a locked widget. Deleting the footer section
 * is the same act as deleting the footer, and a rule the Remove button enforces
 * but the section toolbar does not is not a rule.
 */
export function removeSection(doc: BuilderDocument, sectionId: string): BuilderDocument {
  const s = findSection(doc, sectionId);
  if (s && s.columns.some((c) => c.widgets.some(isLocked))) return doc;
  return { ...doc, sections: doc.sections.filter((x) => x.id !== sectionId) };
}

export function duplicateSection(doc: BuilderDocument, sectionId: string): BuilderDocument {
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return doc;
  // A required part exists exactly ONCE. Two unsubscribe footers on one email
  // is a defect in the other direction, and "duplicate" is the quiet way to
  // get there.
  if (doc.sections[i].columns.some((c) => c.widgets.some(isLocked))) return doc;
  const copy = cloneSection(doc.sections[i]);
  const sections = [...doc.sections];
  sections.splice(i + 1, 0, copy);
  return { ...doc, sections };
}

/** A deep copy with fresh ids — a duplicate that shares ids is not a duplicate. */
export function cloneSection(s: Section): Section {
  return {
    ...s,
    id: newId("s"),
    // Deep, so a duplicated website section does not share its Elementor node
    // with the original — the save path re-mints its ids, and it cannot do
    // that to an object two sections point at.
    ...(s.meta ? { meta: JSON.parse(JSON.stringify(s.meta)) } : {}),
    columns: s.columns.map((c) => ({
      id: newId("c"),
      widgets: c.widgets.map((w) => {
        const copy: Widget = { id: newId("w"), kind: w.kind, props: JSON.parse(JSON.stringify(w.props)) };
        if (w.locked) copy.locked = true;
        // Deep, like props: a duplicated widget that SHARES its style object
        // would follow the original the next time it was restyled.
        if (w.style) copy.style = JSON.parse(JSON.stringify(w.style));
        return copy;
      }),
    })),
  };
}

export function moveSection(doc: BuilderDocument, sectionId: string, toIndex: number): BuilderDocument {
  const from = doc.sections.findIndex((s) => s.id === sectionId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(doc.sections.length - 1, toIndex));
  if (to === from) return doc;
  const sections = [...doc.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved);
  return { ...doc, sections };
}

export function patchSection(doc: BuilderDocument, sectionId: string, patch: Partial<Section>): BuilderDocument {
  return mapSections(doc, (s) => (s.id === sectionId ? { ...s, ...patch } : s));
}

/**
 * Change how many columns a section has.
 *
 * Growing adds empty columns. SHRINKING MOVES THE WIDGETS RATHER THAN DROPPING
 * THEM — going from three columns to one because the layout looked wrong must
 * not silently delete the third column's work.
 */
export function setLayout(doc: BuilderDocument, sectionId: string, layout: 1 | 2 | 3): BuilderDocument {
  return mapSections(doc, (s) => {
    if (s.id !== sectionId || s.layout === layout) return s;
    const columns = s.columns.map((c) => ({ ...c, widgets: [...c.widgets] }));
    while (columns.length < layout) columns.push(emptyColumn());
    if (columns.length > layout) {
      const dropped = columns.splice(layout);
      for (const c of dropped) columns[layout - 1].widgets.push(...c.widgets);
    }
    return { ...s, layout, columns };
  });
}

export function addWidget(
  doc: BuilderDocument,
  sectionId: string,
  columnIndex: number,
  widget: Widget,
  atIndex?: number,
): BuilderDocument {
  return mapSections(doc, (s) => {
    if (s.id !== sectionId) return s;
    const columns = s.columns.map((c, i) => {
      if (i !== columnIndex) return c;
      const widgets = [...c.widgets];
      widgets.splice(atIndex ?? widgets.length, 0, widget);
      return { ...c, widgets };
    });
    return { ...s, columns };
  });
}

/**
 * Take a widget off the page.
 *
 * REFUSES a locked one, silently and by returning the same document, so every
 * caller — the inspector's Remove, a keyboard delete, an adapter doing its own
 * tidying — gets the same answer without each having to remember to ask.
 */
export function removeWidget(doc: BuilderDocument, path: WidgetPath): BuilderDocument {
  if (isLocked(widgetAt(doc, path))) return doc;
  return mapSections(doc, (s) => {
    if (s.id !== path.sectionId) return s;
    return {
      ...s,
      columns: s.columns.map((c, i) =>
        i === path.columnIndex ? { ...c, widgets: c.widgets.filter((_, j) => j !== path.widgetIndex) } : c),
    };
  });
}

/**
 * Copy a widget and put the copy directly under it.
 *
 * D-12's other half: the hover handle offers drag, duplicate and delete, and
 * "duplicate" had no operation behind it — every caller would have had to
 * clone-and-insert by hand, which is three chances to share an id.
 *
 * REFUSES a locked one, for the same reason `duplicateSection` does: a part the
 * law puts on the page exists exactly ONCE, and two unsubscribe footers is a
 * defect in the other direction.
 */
export function duplicateWidget(doc: BuilderDocument, path: WidgetPath): BuilderDocument {
  const w = widgetAt(doc, path);
  if (!w || isLocked(w)) return doc;
  const copy: Widget = { id: newId("w"), kind: w.kind, props: JSON.parse(JSON.stringify(w.props)) };
  if (w.style) copy.style = JSON.parse(JSON.stringify(w.style));
  return addWidget(doc, path.sectionId, path.columnIndex, copy, path.widgetIndex + 1);
}

export function patchWidget(
  doc: BuilderDocument,
  path: WidgetPath,
  props: Record<string, unknown>,
): BuilderDocument {
  return mapSections(doc, (s) => {
    if (s.id !== path.sectionId) return s;
    return {
      ...s,
      columns: s.columns.map((c, i) =>
        i === path.columnIndex
          ? {
            ...c,
            widgets: c.widgets.map((w, j) => (j === path.widgetIndex ? { ...w, props: { ...w.props, ...props } } : w)),
          }
          : c),
    };
  });
}

/**
 * Set (or clear) a widget's styling. §11.8.
 *
 * A separate operation from `patchWidget` and not another key in its props,
 * because `style` is NOT a prop: props are what a widget's own renderer reads,
 * and every renderer would then have to know to ignore this one. Passing
 * `undefined` removes the key entirely — that is what Reset does, and why a
 * reset document is byte-identical to one nobody ever styled.
 */
export function setWidgetStyle(
  doc: BuilderDocument,
  path: WidgetPath,
  style: ElementStyle | undefined,
): BuilderDocument {
  return mapSections(doc, (s) => {
    if (s.id !== path.sectionId) return s;
    return {
      ...s,
      columns: s.columns.map((c, i) =>
        i === path.columnIndex
          ? {
            ...c,
            widgets: c.widgets.map((w, j) => {
              if (j !== path.widgetIndex) return w;
              const { style: _old, ...rest } = w;
              return style && Object.keys(style).length ? { ...rest, style } : rest;
            }),
          }
          : c),
    };
  });
}

/**
 * Move a widget to an exact place — any column, any section, any index.
 *
 * This is what DRAGGING does (§11.8). `moveWidget` below nudges inside one
 * column and stays, because a keyboard has to be able to do everything a mouse
 * can; both go through the model so neither can invent a document shape the
 * other cannot.
 *
 * THE INDEX MATHS, which is the whole of the bug surface here: the widget is
 * REMOVED first and then inserted, so when the target is the same column and
 * the target index is after the one being moved, the index has already shifted
 * down by one. Getting that wrong drops a widget one place short of where the
 * indicator line was drawn, every time, and only when dragging downwards.
 */
export function dropIndexFor(from: WidgetPath, toSectionId: string, toColumnIndex: number, toIndex: number): number {
  const sameColumn = from.sectionId === toSectionId && from.columnIndex === toColumnIndex;
  return sameColumn && toIndex > from.widgetIndex ? toIndex - 1 : toIndex;
}

export function moveWidgetTo(
  doc: BuilderDocument,
  from: WidgetPath,
  to: { sectionId: string; columnIndex: number; index: number },
): BuilderDocument {
  const widget = widgetAt(doc, from);
  if (!widget) return doc;
  const target = findSection(doc, to.sectionId);
  if (!target || !target.columns[to.columnIndex]) return doc;
  const at = dropIndexFor(from, to.sectionId, to.columnIndex, to.index);
  const lifted = mapSections(doc, (s) => {
    if (s.id !== from.sectionId) return s;
    return {
      ...s,
      columns: s.columns.map((c, i) =>
        i === from.columnIndex ? { ...c, widgets: c.widgets.filter((_, j) => j !== from.widgetIndex) } : c),
    };
  });
  return addWidget(lifted, to.sectionId, to.columnIndex, widget, at);
}

/** Move a widget up or down inside its own column. */
export function moveWidget(doc: BuilderDocument, path: WidgetPath, delta: -1 | 1): BuilderDocument {
  return mapSections(doc, (s) => {
    if (s.id !== path.sectionId) return s;
    return {
      ...s,
      columns: s.columns.map((c, i) => {
        if (i !== path.columnIndex) return c;
        const j = path.widgetIndex + delta;
        if (path.widgetIndex < 0 || j < 0 || j >= c.widgets.length) return c;
        const widgets = [...c.widgets];
        [widgets[path.widgetIndex], widgets[j]] = [widgets[j], widgets[path.widgetIndex]];
        return { ...c, widgets };
      }),
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Numbering
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The number each numbered section wears, as a map section id → "01", "02".
 *
 * Computed, never stored: the Rolling In It agreement numbers its sections
 * 01…10 and dragging section 6 above section 3 must renumber both rather than
 * leaving two sections called 06.
 */
export function sectionNumbers(doc: BuilderDocument): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const s of doc.sections) {
    if (s.numbered && s.visibility === "customer") {
      n += 1;
      out[s.id] = String(n).padStart(2, "0");
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Prop paths
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Write one value inside a widget's props by the dotted path the renderer
 * stamped on the page (`rows.0.label`, `cards.1.features.2`).
 *
 * The canvas reads `data-edit` straight off the element the author typed into,
 * so the renderer and the editor agree on where a run of text lives WITHOUT a
 * second map of the layout — which is the thing that always drifts.
 *
 * Pure: returns a new props object; arrays stay arrays.
 */
export function setPropPath(
  props: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = String(path).split(".").filter(Boolean);
  if (!parts.length) return props;

  function walk(node: any, i: number): any {
    const key = parts[i];
    const last = i === parts.length - 1;
    const isIndex = /^\d+$/.test(key);
    if (isIndex) {
      const arr = Array.isArray(node) ? [...node] : [];
      const idx = Number(key);
      arr[idx] = last ? value : walk(arr[idx], i + 1);
      return arr;
    }
    const obj = node && typeof node === "object" && !Array.isArray(node) ? { ...node } : {};
    obj[key] = last ? value : walk(obj[key], i + 1);
    return obj;
  }
  return walk(props, 0) as Record<string, unknown>;
}

/** Read one value by the same dotted path. */
export function getPropPath(props: Record<string, unknown>, path: string): unknown {
  return String(path).split(".").filter(Boolean)
    .reduce<any>((node, key) => (node == null ? undefined : node[key]), props);
}
