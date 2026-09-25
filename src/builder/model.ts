/**
 * builder/model.ts — THE document model. One shape for every builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.1/§3.2, step 2 (the engine).
 *
 * A document is a TREE (§11.12, D-156). A NODE is either a CONTAINER, which
 * holds children and lays them out, or a WIDGET, which is atomic and has none.
 *
 *     document ── sections[] ── columns[] ── children ── children …
 *
 * A SECTION is the depth-0 container: it carries the page-level facts a band
 * has (width, theme, page break, visibility) and holds 1–3 COLUMNS. A COLUMN
 * is a container laid out as a column. Below that, `Container` nodes nest to
 * any depth — a column can hold a row, a row can hold a box. Ids are unchanged
 * all the way down, so a document written before this maps 1:1 and a document
 * with no containers in it serialises byte for byte as it did.
 *
 * ── ONE ADDRESS ──────────────────────────────────────────────────────────
 * A node is addressed by its ID, and every operation in treeOps.ts is keyed on
 * one. `WidgetPath` survives as the LEGACY address the adapters were written
 * against: `nodeIdAt` turns one into an id at the boundary and there is exactly
 * ONE implementation underneath. Everything the engine builds fills in
 * `path.id`, and the id WINS whenever it is present — that is what lets a path
 * reach a widget three containers deep, where three indices cannot.
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
/* §11.12 (D-156) — yesterday's composites become today's trees, on the way in.
   The cycle (model -> upgrade -> treeOps -> model) crosses only types and
   hoisted function declarations. */
import { upgradeDocument } from "./upgrade";
import {
  CONTAINER_KIND, cloneNode, descendantsOf, dropIndexForNode, duplicateNode, findNode,
  groupNodes, holdsLocked, insertNode, isContainer, isLocked, isRequired, isWidget,
  makeContainer, makeWidget, moveNode, newId, nodeIdAt, nudgeNode, pathOfNode, patchNode,
  REQUIRED_KINDS, removeNode, resetIds, setDirection, setNodeLocked, setNodeStyle,
  ungroupNode, walkNodes,
} from "./treeOps";

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

/**
 * A CONTAINER — the box Brandon drags a Header into (§11.12, D-156).
 *
 * "Header, drag that into this box and it's now its own section inside the box,
 * then a text field under it with Pick One, then cards." That is a container
 * holding a heading, a paragraph and a row of cards, and before D-156 there was
 * no such thing: a column could hold widgets and nothing else, and the five
 * money widgets were composites with their heading and their cards locked
 * inside one indivisible lump.
 *
 * It holds CHILDREN and it lays them out. That is all it does. It has no props
 * and no renderer of its own beyond the box, because a container that also drew
 * something would be a widget wearing a container's clothes.
 *
 * HOW IT IS LAID OUT LIVES IN `style`, not in a second field beside it:
 * `style.direction` is row / column / grid, `style.justify`, `style.alignItems`,
 * `style.gap`, `style.wrap` and `style.columns` are the rest. One mechanism —
 * and it buys the per-device cascade for nothing, so a row on a desktop can be
 * a column on a phone with no new machinery at all. See style.ts.
 */
export interface Container extends Widget {
  kind: typeof CONTAINER_KIND;
  children: Node[];
}

/**
 * Either kind of thing on the page. THE unit every operation moves.
 *
 * A CONTAINER IS A WIDGET WITH CHILDREN, and that is deliberate rather than
 * lazy — it is Elementor's own shape, where a container and a widget are the
 * same record with the same id, the same settings and an `elements` array that
 * a widget leaves empty. It buys three things:
 *
 *   · a column's `widgets` array is still `Widget[]`, so the five adapter
 *     files, three server mirrors and every template keep compiling and
 *     keep working, with no change and no second array type to convert at
 *     each boundary;
 *   · an OLDER reader — a mirror that has not caught up yet — meets a node
 *     of an unknown kind, which is a case every one of them already handles
 *     by carrying it through untouched, rather than a shape it cannot parse;
 *   · `props` is there and empty, so nothing has to guard a read of it.
 *
 * `isContainer` is the one test. Nothing else asks.
 */
export type Node = Widget | Container;

/**
 * THE PRIMITIVES LIVE IN `treeOps.ts` AND ARE RE-EXPORTED HERE.
 *
 * Every adapter, renderer and mirror in the Portal imports the model's names
 * from "./model"; moving them would have edited five files this stream does not
 * own for no behaviour at all. So the dependency runs ONE way — treeOps takes
 * only TYPES from here — and this line is the front door it has always been.
 */
export {
  CONTAINER_KIND, cloneNode, descendantsOf, findNode, holdsLocked, insertNode, isContainer,
  isLocked, isRequired, isWidget, makeContainer, makeWidget, MAX_DEPTH, moveNode, newId, nodeIdAt,
  nudgeNode, pathOfNode, patchNode, removeNode, REQUIRED_KINDS, resetIds, setDirection,
  setNodeLocked, setNodeStyle, subtreeHeight, ungroupNode, walkNodes, groupNodes, duplicateNode,
  directionOf, dropIndexForNode, CONTAINER_PRESETS, makePreset, sectionOfNode, hostChildren,
  hostDepth,
} from "./treeOps";
export type { Direction, NodeHit, ContainerPreset } from "./treeOps";

/**
 * A COLUMN — a container laid out as a column, kept as its own type.
 *
 * `widgets` is its CHILDREN and a child may be a `Container`. The name is the
 * one every adapter, renderer and mirror was written against; renaming it would
 * touch five files this stream does not own for no behaviour at all, so it
 * stays and this comment is the truth about it.
 */
export interface Column {
  id: string;
  /** Its CHILDREN. A child may be a `Container`, which is a widget with its own. */
  widgets: Widget[];
  /** How this column lays its own children out. Absent = stacked, as always. */
  style?: ElementStyle;
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

/**
 * WHERE A WIDGET IS — the LEGACY address, and the id that supersedes it.
 *
 * Section + column + index reaches the top level of a column and no further,
 * which was every widget there was before §11.12. It cannot address a card
 * inside a box inside a row, so the real address is `id`, and `nodeIdAt`
 * prefers it whenever it is there.
 *
 * The three indices stay because five adapter files were written against them
 * and this stream does not own one of those files. Everything the ENGINE builds
 * fills in `id`; a path built by hand still works, at depth 0, exactly as it
 * did. See treeOps.ts.
 */
export interface WidgetPath {
  sectionId: string;
  columnIndex: number;
  widgetIndex: number;
  /** THE address. Present on everything the engine hands out. */
  id?: string;
}

/** What is selected on the canvas. The inspector binds to exactly this. */
export type Selection =
  | { kind: "section"; sectionId: string }
  | {
    kind: "widget";
    sectionId: string;
    columnIndex: number;
    widgetIndex: number;
    /** THE address, when the engine made this. See `WidgetPath`. */
    id?: string;
    /**
     * THE OTHER THINGS ALSO SELECTED, by id (§11.12, D-156).
     *
     * "Select N siblings → Group into a box" needs more than one thing to be
     * selected, and this is how: the SELECTION carries them, rather than a
     * second piece of state beside it. One writer, `select()`, so letting go is
     * automatic — a plain click replaces the whole selection and the extras go
     * with it, which is the behaviour every editor has and the bug a separate
     * `alsoSelected` set would have had on its first day.
     *
     * The first id is the one in the three fields above; these are the rest, in
     * the order they were shift-clicked. Absent when there is only one.
     */
    also?: string[];
  }
  | null;

/**
 * Add (or take away) one thing from a selection with Shift held.
 *
 * Pure, so the rule is a test: shift-clicking the thing that is already the
 * selection does nothing, shift-clicking one that is already in `also` takes it
 * OUT again — a modifier that can only ever add is a modifier you cannot undo
 * without starting over.
 */
export function extendSelection(current: Selection, path: WidgetPath): Selection {
  const id = path.id;
  if (!id) return { kind: "widget", ...path };
  if (current?.kind !== "widget") return { kind: "widget", ...path };
  const anchor = current.id;
  if (!anchor) return { kind: "widget", ...path };
  if (anchor === id) return current;
  const also = current.also || [];
  const next = also.includes(id) ? also.filter((x) => x !== id) : [...also, id];
  return next.length ? { ...current, also: next } : { ...current, also: undefined };
}

/** Every id in a selection, the anchor first. */
export function selectedIds(sel: Selection): string[] {
  if (sel?.kind !== "widget" || !sel.id) return [];
  return [sel.id, ...(sel.also || [])];
}

/* ══════════════════════════════════════════════════════════════════════════
   Ids
   ══════════════════════════════════════════════════════════════════════════ */

/* `newId` and `resetIds` live in treeOps.ts and are re-exported above. One
   counter, so a container and a widget minted in the same breath cannot
   collide. */

/* ══════════════════════════════════════════════════════════════════════════
   Construction
   ══════════════════════════════════════════════════════════════════════════ */

export function emptyColumn(): Column {
  return { id: newId("c"), widgets: [] };
}

/** Every locked widget in the document, in reading order, at any depth. */
export function lockedWidgets(doc: BuilderDocument): Widget[] {
  return walkWidgets(doc).map((x) => x.widget).filter(isLocked);
}

/**
 * READ A STORED NODE BACK — a box or a widget, tolerantly.
 *
 * TOLERANT BY RULE, like everything else here: a container whose `children` is
 * missing comes back as an empty box rather than throwing, an unknown widget
 * kind is carried through untouched, and a node that is not an object at all is
 * dropped. A newer editor's widget must not be deleted by an older one just
 * because it opened the document.
 */
function readNode(raw: any): Node | null {
  if (!raw || typeof raw !== "object" || typeof raw.kind !== "string") return null;
  if (raw.kind === CONTAINER_KIND) {
    const children = (Array.isArray(raw.children) ? raw.children : [])
      .map(readNode).filter((n: Node | null): n is Node => !!n);
    const out: Container = {
      id: String(raw.id || newId("b")), kind: CONTAINER_KIND, props: {}, children,
    };
    const style = readStyle(raw.style);
    if (style) out.style = style;
    return out;
  }
  const out: Widget = {
    id: String(raw.id || newId("w")),
    kind: String(raw.kind),
    props: raw.props && typeof raw.props === "object" ? { ...raw.props } : {},
  };
  // Carried, not re-derived: a stored footer must come back locked, or opening
  // yesterday's newsletter would make it deletable.
  if (raw.locked) out.locked = true;
  // TOLERANT, and absent when empty: a widget nobody has styled has no `style`
  // key, so the golden fixtures stay byte-identical.
  const style = readStyle(raw.style);
  if (style) out.style = style;
  return out;
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
      const column: Column = {
        id: String(c?.id || newId("c")),
        widgets: (Array.isArray(c?.widgets) ? c.widgets : [])
          .map(readNode).filter((n: Node | null): n is Node => !!n),
      };
      // A column's own layout, when it has one. Absent on every column written
      // before §11.12, so a stored document round-trips byte for byte.
      const columnStyle = readStyle(c?.style);
      if (columnStyle) column.style = columnStyle;
      return column;
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
  /* §11.12 (D-156). THE COMPOSITE -> TREE UPGRADE, AND IT IS SWITCHED ON.

     This is the ONE door a stored document comes through — the builder, the
     customer's copy, the revision page and the PDF path all read a document
     this way — so an upgrade the editor did and the PDF did not is impossible.

     It went on in the integration commit, with everything the handoff said it
     had to go in with, in one pass:
       1. the atomic widgets exist and draw — `card`, `catalog_card`,
          `price_line`, `totals`, `address_block`, `key_fact`, each declared and
          rendered in its own file under `widgets/`;
       2. `PRICED_KINDS` says `price_line` (and still says `priced_line`, for a
          row that has not been read yet), and a property block's items become
          PRICED LINES rather than a rate card, so no money moves;
       3. oliver-api's `documentModel.js` and `proposalPdf.js` walk the tree;
       4. the LUMEN mirrors follow it.

     A document with no composites in it comes back as THE SAME OBJECT, by
     identity, so `serialise(deserialise(wire))` is byte-for-byte `wire` for
     every proposal that does not need this. See upgrade.ts. */
  return upgradeDocument({ v: 2, settings, sections });
}

/* ══════════════════════════════════════════════════════════════════════════
   Reads
   ══════════════════════════════════════════════════════════════════════════ */

export function findSection(doc: BuilderDocument, sectionId: string): Section | null {
  return doc.sections.find((s) => s.id === sectionId) || null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CARRIER PAIR — the second layer, collapsed on the SCREEN (D-172, r2)
   ══════════════════════════════════════════════════════════════════════════

   The reference editor has ONE kind of box, a Container, and a container holds
   containers. Ours stores Section → column → nodes, and three audits in a row
   counted the same four extras: two rows in Structure for one visible box, two
   selectable levels both titled "Edit Container", a `.bx-col` drop host nobody
   can see, and a wrapper that is a fourth level of nesting.

   THE STORED MODEL DOES NOT CHANGE. Saved proposals, the PDF, the email and
   the WordPress publisher all read Section → column → nodes, and a migration
   tonight would rewrite documents four other programs are reading. What
   changes is what is CREATED from here on, and how the screen PRESENTS a pair
   that has this shape:

       Section ── its ONE column ── ONE node, and that node is a Container

   That pair is called a CARRIER PAIR, and everywhere the author can see it —
   the outline it is drawn with, its handle, its row in Structure, what a click
   selects, what right-click offers, what Delete removes — it is ONE thing: the
   container. The section is the carrier, and a carrier is not something a
   client reads.

   A section that is NOT a carrier pair (several widgets straight in a column,
   several columns, an empty section) is drawn exactly as it is today and keeps
   its own row. Old documents are left alone: this is a question asked of the
   shape, never a flag written into one.  */

/**
 * The container a section is merely carrying, or null when it carries none.
 *
 * ONE question, asked of the shape, so "is this a pair?" and "which container
 * is it?" can never disagree — every caller that needs the id takes it from
 * here rather than reaching for `columns[0].widgets[0]` itself.
 */
export function carrierContainer(section: Section): Container | null {
  if (section.columns.length !== 1) return null;
  const only = section.columns[0]?.widgets;
  if (!only || only.length !== 1) return null;
  const node = only[0];
  return isContainer(node) ? node : null;
}

/** Is this section nothing but a carrier for one container? */
export function isCarrierPair(section: Section): boolean {
  return carrierContainer(section) !== null;
}

/**
 * The path of a carrier's container — the address a click on either level
 * resolves to. Null when the section is not a pair.
 */
export function carrierPath(section: Section): WidgetPath | null {
  const box = carrierContainer(section);
  return box ? { sectionId: section.id, columnIndex: 0, widgetIndex: 0, id: box.id } : null;
}

/**
 * WHAT A SELECTION REALLY MEANS, once the pair is one thing.
 *
 * Selecting a carrier SECTION means selecting its container: the panel that
 * opens is the container's, the ring drawn is the container's, and the menu
 * offered is the container's. Applied in ONE place — the shell's `select` —
 * so there is no second idea of "what is selected" for the panel and the
 * canvas to disagree about.
 */
export function resolveSelection(doc: BuilderDocument, sel: Selection): Selection {
  if (!sel || sel.kind !== "section") return sel;
  const section = findSection(doc, sel.sectionId);
  const path = section ? carrierPath(section) : null;
  return path ? { kind: "widget", ...path } : sel;
}

/**
 * The node a legacy path points at, at ANY depth.
 *
 * Named `widgetAt` because every caller in the Portal calls it that; it answers
 * with whatever is there, and a box is a legitimate answer now. `nodeIdAt`
 * prefers `path.id`, so a path the engine handed out reaches a card three boxes
 * deep, and one an adapter built by hand still reaches the top of a column.
 */
export function widgetAt(doc: BuilderDocument, path: WidgetPath): Widget | null {
  const id = nodeIdAt(doc, path);
  const hit = id ? findNode(doc, id) : null;
  return (hit?.node as Widget) || null;
}

/** The same lookup, saying plainly that a box can come back. */
export function nodeAt(doc: BuilderDocument, path: WidgetPath): Node | null {
  const id = nodeIdAt(doc, path);
  return id ? findNode(doc, id)?.node || null : null;
}

/**
 * EVERY WIDGET IN THE DOCUMENT, in reading order, with where it lives.
 *
 * THE WHOLE TREE, boxes walked into (§11.12). Totals, the merge-field scan,
 * the still-to-fill-in list and the locked-part count all read this, and a walk
 * that stopped at the top of a column would have quietly stopped counting the
 * moment somebody put a priced line inside a box.
 *
 * Containers themselves are NOT widgets and are not returned — use `walkNodes`
 * for those. Every path carries `id`, which is what makes it usable at depth.
 */
export function walkWidgets(doc: BuilderDocument): Array<{ widget: Widget; path: WidgetPath; section: Section }> {
  const out: Array<{ widget: Widget; path: WidgetPath; section: Section }> = [];
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  walkNodes(doc, (hit) => {
    if (isContainer(hit.node)) return;
    const section = byId.get(hit.sectionId);
    if (!section) return;
    out.push({
      widget: hit.node,
      path: { sectionId: hit.sectionId, columnIndex: hit.columnIndex, widgetIndex: hit.index, id: hit.node.id },
      section,
    });
  });
  return out;
}

/** Every node, containers included, in reading order. */
export function allNodes(doc: BuilderDocument): Node[] {
  const out: Node[] = [];
  walkNodes(doc, (hit) => out.push(hit.node));
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
  // AT ANY DEPTH. `some(isLocked)` over the top of each column would have been
  // walked round by putting the footer in a box.
  if (s && s.columns.some((c) => c.widgets.some(holdsLocked))) return doc;
  return { ...doc, sections: doc.sections.filter((x) => x.id !== sectionId) };
}

export function duplicateSection(doc: BuilderDocument, sectionId: string): BuilderDocument {
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return doc;
  // A required part exists exactly ONCE. Two unsubscribe footers on one email
  // is a defect in the other direction, and "duplicate" is the quiet way to
  // get there.
  if (doc.sections[i].columns.some((c) => c.widgets.some(holdsLocked))) return doc;
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
    // Deep, and through the ONE cloner: a duplicated widget that SHARED its
    // style object would follow the original the next time it was restyled,
    // and a duplicated BOX that shared its children would be the same box.
    columns: s.columns.map((c) => ({
      ...c,
      id: newId("c"),
      widgets: c.widgets.map(cloneNode),
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

/**
 * Put a node at the top level of a column. The LEGACY insert.
 *
 * One line of its own logic — "which column is that" — and then `insertNode`,
 * which is the one insert the add area, a drag, a pressed tile and the upgrade
 * all go through. Two inserts would be two sets of rules about where a thing
 * may go.
 */
export function addWidget(
  doc: BuilderDocument,
  sectionId: string,
  columnIndex: number,
  widget: Node,
  atIndex?: number,
): BuilderDocument {
  const column = findSection(doc, sectionId)?.columns[columnIndex];
  if (!column) return doc;
  return insertNode(doc, column.id, atIndex ?? column.widgets.length, widget);
}

/**
 * Take a widget off the page.
 *
 * REFUSES a locked one, silently and by returning the same document, so every
 * caller — the inspector's Remove, a keyboard delete, an adapter doing its own
 * tidying — gets the same answer without each having to remember to ask.
 */
export function removeWidget(doc: BuilderDocument, path: WidgetPath): BuilderDocument {
  const id = nodeIdAt(doc, path);
  return id ? removeNode(doc, id) : doc;
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
  const id = nodeIdAt(doc, path);
  return id ? duplicateNode(doc, id) : doc;
}

export function patchWidget(
  doc: BuilderDocument,
  path: WidgetPath,
  props: Record<string, unknown>,
): BuilderDocument {
  const id = nodeIdAt(doc, path);
  return id ? patchNode(doc, id, props) : doc;
}

/**
 * LOCK OR UNLOCK ONE WIDGET (M-21).
 *
 * `locked` is the flag `removeWidget` and `removeSection` already refuse on —
 * this writes THAT one, rather than inventing a second idea of "protected"
 * that only the menu knows about. Absent when false, so a document nobody has
 * locked anything in serialises exactly as it did before this existed.
 *
 * A widget the LAW locked (an email footer, minted with `locked: true`) and one
 * the AUTHOR locked are the same flag on purpose: both mean "this cannot be
 * deleted by accident", both say why on the handle, and one mechanism cannot
 * disagree with itself about which parts are safe. The difference — whether
 * the author may UNLOCK it again — is `REQUIRED_KINDS`, and this refuses.
 */
export function setWidgetLocked(
  doc: BuilderDocument,
  path: WidgetPath,
  locked: boolean,
): BuilderDocument {
  const id = nodeIdAt(doc, path);
  return id ? setNodeLocked(doc, id, locked) : doc;
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
  const id = nodeIdAt(doc, path);
  return id ? setNodeStyle(doc, id, style) : doc;
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
  to: { sectionId: string; columnIndex: number; index: number; hostId?: string },
): BuilderDocument {
  const id = nodeIdAt(doc, from);
  if (!id) return doc;
  // `hostId` is the box the drop line was drawn in — the canvas always knows
  // it. Absent (an adapter moving something by hand), the target is the top of
  // the column, which is where every such move was going before boxes existed.
  const hostId = to.hostId ?? findSection(doc, to.sectionId)?.columns[to.columnIndex]?.id;
  if (!hostId) return doc;
  return moveNode(doc, id, hostId, to.index);
}

/** Move a widget up or down inside its own column. */
export function moveWidget(doc: BuilderDocument, path: WidgetPath, delta: -1 | 1): BuilderDocument {
  const id = nodeIdAt(doc, path);
  return id ? nudgeNode(doc, id, delta) : doc;
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

/**
 * TYPE A WORD INTO A WIDGET, WHEREVER IT SITS (V-1).
 *
 * FOUND BY DRIVING IT (verifier, 2026-09-17, on `d156/integration`): every word
 * typed into anything inside a box was silently discarded. Five surfaces — the
 * shell's `onEditText`, the email panel, the landing panel, the website panel
 * and the proposal adapter — each wrote the same six lines by hand:
 *
 *     for (const column of section.columns)
 *       const i = column.widgets.findIndex((w) => w.id === widgetId)   // FLAT
 *
 * `column.widgets` is the top of a column. A card inside a row inside a box is
 * not in it, so `findIndex` returned -1, the loop fell out of the bottom and
 * the function returned having changed NOTHING. The characters stayed on screen
 * because the canvas skips its repaint while the caret is in a run of text, and
 * vanished at the next repaint. Save wrote the document that was never changed.
 *
 * THE ADDRESS IS THE NODE ID, and every caller already had it: it is the id the
 * renderer stamped on the element the author typed into. So this is the whole
 * of the addressing, once, at any depth — `findNode` walks the tree, `patchNode`
 * writes by id, and no surface counts an index ever again.
 *
 * Returns the document UNCHANGED when the id names nothing (an edit racing an
 * undo) or names a box — a container has no props by design, and writing words
 * into one would invent a sixth vocabulary for text.
 */
export function editWidgetText(
  doc: BuilderDocument,
  widgetId: string,
  propPath: string,
  value: unknown,
): BuilderDocument {
  const hit = findNode(doc, widgetId);
  if (!hit || isContainer(hit.node)) return doc;
  const widget = hit.node as Widget;
  return patchNode(doc, widgetId, setPropPath(widget.props || {}, propPath, value));
}

/** The widget behind one id, at any depth. `null` for a box or a stale id. */
export function widgetById(doc: BuilderDocument, widgetId: string): Widget | null {
  const hit = findNode(doc, widgetId);
  return hit && !isContainer(hit.node) ? (hit.node as Widget) : null;
}

/**
 * PUT A NODE DIRECTLY AFTER ANOTHER ONE, among its OWN siblings (V-2).
 *
 * "Use this plan" on a catalogue card puts a priced line under that card. The
 * line it replaces read the card's index off the top of a column and, failing
 * to find it there, dropped the line at index 0 of the section's FIRST column
 * — so for the card Brandon actually builds (one of two in a row inside a box)
 * the money appeared at the top of the page, nowhere near the card pressed.
 *
 * `insertNode` already refuses a depth past the limit and comes back unchanged,
 * so a line beside a card in the deepest possible box is refused the same way
 * everything else is.
 */
export function insertBeside(
  doc: BuilderDocument,
  siblingId: string,
  node: Node,
): BuilderDocument {
  const hit = findNode(doc, siblingId);
  if (!hit) return doc;
  return insertNode(doc, hit.parentId, hit.index + 1, node);
}

/**
 * TAKE EVERY WIDGET THE PREDICATE NAMES OFF THE PAGE, wherever it sits.
 *
 * One card, one line: pressing "Use this plan" twice has to replace the line
 * rather than add a second one the total would count twice. The flat filter
 * this replaces could not see a line inside a box, so the second press left
 * the first line in place and the customer was charged twice for one plan.
 */
export function removeWidgetsWhere(
  doc: BuilderDocument,
  match: (w: Widget) => boolean,
): BuilderDocument {
  let next = doc;
  for (const { widget } of walkWidgets(doc)) {
    if (match(widget)) next = removeNode(next, widget.id);
  }
  return next;
}
