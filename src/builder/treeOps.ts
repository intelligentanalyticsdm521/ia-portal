/**
 * builder/treeOps.ts — EVERY OPERATION ON THE TREE, keyed by node id.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156). Brandon, walking "Choose
 * your plan": *"I'd think each of those would be its own widget. Like Header,
 * drag that into this box and it's now its own section inside the box, then a
 * text field under it with Pick One, then cards … custom cards where they just
 * type the card headers, add a price, and description inside the cards, or
 * product cards where they can directly load products/services from their
 * actual OLIVER Product Catalog. Is that not how this is built?"*
 *
 * It was not. A column held widgets and nothing else, so there was no box to
 * drag a header into, and the five money widgets were composites with their
 * heading, their intro and their cards welded inside one lump.
 *
 * ── WHY A MODULE, AND WHY IT IS THE BOTTOM OF THE STACK ───────────────────
 * `model.ts` owns the SHAPE and the document-level facts. This owns MOVEMENT:
 * insert, move, duplicate, delete, group, ungroup, lay out. Everything here is
 * pure — a document in, a new document out, no React and no DOM — so the whole
 * of the hard part (index arithmetic, and a drag that must not drop a box
 * inside itself) is a `node --test` rather than something you check by dragging
 * a scrollbar.
 *
 * It imports only TYPES from `model.ts`, never a value, so the dependency runs
 * one way: style.ts ← treeOps.ts ← model.ts. A cycle here would be the kind of
 * thing that works under Vite and explodes under the test loader.
 *
 * ── ONE ADDRESS: THE NODE ID ──────────────────────────────────────────────
 * Every operation takes an id. The LEGACY `WidgetPath` (section + column +
 * index) is turned into one by `nodeIdAt` at the edge, and nothing underneath
 * knows it exists — so there is one implementation of "delete this", not two
 * that can disagree about whether a nested card may be deleted.
 *
 * ── THE THREE RULES THAT ARE GUARDS AND NOT COMMENTS ──────────────────────
 *   1. A NODE NEVER MOVES INSIDE ITSELF. Dropping a box into its own child is
 *      the one gesture that detaches a whole branch from the document; the
 *      move is refused instead.
 *   2. A LOCKED PART CANNOT BE DELETED OR DUPLICATED, and neither can a box
 *      that HOLDS one. `removeWidget` already refused the footer; a box around
 *      it would have been the way round that.
 *   3. NESTING STOPS AT `MAX_DEPTH`. Not a taste rule: past six the boxes are
 *      narrower than the words in them and the author cannot get the pointer
 *      into the one they mean.
 */
import type {
  BuilderDocument, Column, Container, Node, Section, Widget, WidgetPath,
} from "./model";
import type { ElementStyle } from "./style";
/* The ribbon's own module owns what a ribbon IS and what taking one off
   writes. This file owns the tree, and the one-per-row rule is a fact about
   siblings — so the rule is here and its vocabulary is there. */
import { isRecommended, ribbonProps } from "./widgets/ribbon";

/* ══════════════════════════════════════════════════════════════════════════
   Ids
   ══════════════════════════════════════════════════════════════════════════ */

let idCounter = 0;

/**
 * A new id.
 *
 * Deterministic and resettable so a renderer snapshot is stable: call
 * `resetIds()` before building a fixture document and they read w1, w2, w3.
 */
export function newId(prefix = "w"): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/** Tests and fixtures call this first. */
export function resetIds(): void {
  idCounter = 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Node primitives
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The one string that says "this is a box, not a thing".
 *
 * A `kind` and not a second discriminator beside it, because every surface in
 * the builder — the renderer's switch, the outline's label, the drag payload,
 * the registry lookup — already reads `kind`. Two answers to one question is
 * how a box renders as a widget in one place and as a box in another.
 */
export const CONTAINER_KIND = "container";

export function isContainer(n: Node | null | undefined): n is Container {
  return !!n && (n as any).kind === CONTAINER_KIND && Array.isArray((n as any).children);
}

export function isWidget(n: Node | null | undefined): n is Widget {
  return !!n && !isContainer(n);
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

/**
 * A new box. `style` is absent when empty, so a plain box adds almost no JSON.
 *
 * `props` is `{}` because a container IS a widget with children (see model.ts)
 * and every reader in the Portal and in the two server mirrors expects one. It
 * is never read and never written.
 */
export function makeContainer(style?: ElementStyle, children: Node[] = []): Container {
  const c: Container = { id: newId("b"), kind: CONTAINER_KIND, props: {}, children };
  if (style && Object.keys(style).length) c.style = style;
  return c;
}

/** True when this widget is a required part the author may not remove. */
export function isLocked(w: Node | null | undefined): boolean {
  return !!(w as any)?.locked;
}

/**
 * THE PARTS THE LAW PUTS THERE, which the author may not unlock (M-21).
 *
 * `locked` is ONE flag and stays one flag. "Lock this so I don't delete it by
 * accident" is reversible and "take the unsubscribe link off this email" is
 * not, and the difference lives here, as a list of KINDS — because the answer
 * is a fact about what the widget IS.
 */
export const REQUIRED_KINDS = new Set<string>(["email_footer"]);

export function isRequired(w: Node | null | undefined): boolean {
  return !!w && REQUIRED_KINDS.has((w as any).kind);
}

/** Does this node, or anything inside it, carry a lock? */
export function holdsLocked(n: Node): boolean {
  if (isContainer(n)) return n.children.some(holdsLocked);
  return isLocked(n);
}

/**
 * A deep copy with FRESH IDS, all the way down.
 *
 * A duplicate that shares ids is not a duplicate: the outline would show one
 * row for two things, `findNode` would answer with whichever came first, and
 * styling one would style both.
 */
export function cloneNode(n: Node): Node {
  if (isContainer(n)) {
    const copy: Container = {
      // The box's own props travel with it. They were dropped here while a
      // container had none; `html_tag` is one, and a duplicated `<main>` that
      // came back a `<div>` is a control that works until you copy the box.
      id: newId("b"), kind: CONTAINER_KIND,
      props: JSON.parse(JSON.stringify(n.props || {})),
      children: n.children.map(cloneNode),
    };
    if (n.style) copy.style = JSON.parse(JSON.stringify(n.style));
    return copy;
  }
  const copy: Widget = { id: newId("w"), kind: n.kind, props: JSON.parse(JSON.stringify(n.props || {})) };
  if (n.locked) copy.locked = true;
  if (n.style) copy.style = JSON.parse(JSON.stringify(n.style));
  return copy;
}

/* ══════════════════════════════════════════════════════════════════════════
   The presets the Layout group offers
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * BOX, ROW, GRID — the three things the picker's Layout group puts on the page.
 *
 * Containers and not widgets, and therefore here and not in `registry.ts`: a
 * box is a fact about the ENGINE's model, the same in a proposal, an email and
 * a web page, and an adapter that had to declare it could forget to.
 */
export interface ContainerPreset {
  key: string;
  label: string;
  description: string;
  style?: ElementStyle;
}

export const CONTAINER_PRESETS: ContainerPreset[] = [
  {
    key: "box",
    label: "Box",
    description: "A box you drop things into. Whatever you put in it stacks top to bottom, and the box can be styled as one.",
  },
  {
    key: "row",
    label: "Row",
    description: "A box that puts what you drop into it side by side — two cards, three facts, a picture beside some words.",
    style: { direction: "row", gap: 16 },
  },
  {
    key: "grid",
    label: "Grid",
    description: "A box with even columns, for a set of cards that should all be the same width.",
    style: { direction: "grid", columns: 3, gap: 16 },
  },
];

export function makePreset(key: string): Container {
  const preset = CONTAINER_PRESETS.find((p) => p.key === key) || CONTAINER_PRESETS[0];
  return makeContainer(preset.style ? JSON.parse(JSON.stringify(preset.style)) : undefined);
}

/* ══════════════════════════════════════════════════════════════════════════
   Reads
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * HOW DEEP A BOX MAY GO.
 *
 * SIX LEVELS OF BOX. Not a taste rule: each level eats its own padding, so past
 * six the box is narrower than the words in it and the author cannot get the
 * pointer into the one they mean.
 *
 * It is a count of LEVELS, so the deepest box sits at depth 5 and the guards
 * below read `>=`. Getting that backwards is the classic off-by-one, and it was
 * found by the test that fills a document to the limit and then tries once
 * more: a `>` let a seventh level in.
 *
 * An insert or a move that would go deeper is refused and the document comes
 * back unchanged, exactly as a locked delete does.
 */
export const MAX_DEPTH = 6;

/** Where one node lives. `parentId` is a column's id or a container's. */
export interface NodeHit {
  node: Node;
  parentId: string;
  index: number;
  sectionId: string;
  columnIndex: number;
  /** 0 for a child of a column; 1 inside one box; 2 inside a box in a box. */
  depth: number;
  /** Every container id above it, column first. */
  ancestors: string[];
}

function childrenOf(host: Column | Container): Node[] {
  return (host as Container).children ?? (host as Column).widgets;
}

/** Walk the whole document, deepest-last, and hand every node to `visit`. */
export function walkNodes(doc: BuilderDocument, visit: (hit: NodeHit) => void): void {
  for (const section of doc.sections) {
    section.columns.forEach((col, columnIndex) => {
      const descend = (kids: Node[], parentId: string, depth: number, ancestors: string[]) => {
        kids.forEach((node, index) => {
          visit({ node, parentId, index, sectionId: section.id, columnIndex, depth, ancestors });
          if (isContainer(node)) descend(node.children, node.id, depth + 1, [...ancestors, node.id]);
        });
      };
      descend(col.widgets, col.id, 0, [col.id]);
    });
  }
}

/** Find one node by id, with everything an operation needs to know about it. */
export function findNode(doc: BuilderDocument, id: string | null | undefined): NodeHit | null {
  if (!id) return null;
  let found: NodeHit | null = null;
  walkNodes(doc, (hit) => { if (!found && hit.node.id === id) found = hit; });
  return found;
}

/** Every node inside this one, at any depth. Used by the locked-part guards. */
export function descendantsOf(n: Node): Node[] {
  if (!isContainer(n)) return [];
  return n.children.flatMap((c) => [c, ...descendantsOf(c)]);
}

/** The column or container with this id, and the children it holds. */
export function hostChildren(doc: BuilderDocument, hostId: string): Node[] | null {
  for (const section of doc.sections) {
    for (const col of section.columns) {
      if (col.id === hostId) return col.widgets;
    }
  }
  const hit = findNode(doc, hostId);
  return hit && isContainer(hit.node) ? hit.node.children : null;
}

/** How deep a child of this host would sit. A column's child is 0. */
export function hostDepth(doc: BuilderDocument, hostId: string): number {
  for (const section of doc.sections) {
    for (const col of section.columns) if (col.id === hostId) return 0;
  }
  const hit = findNode(doc, hostId);
  return hit ? hit.depth + 1 : -1;
}

/** How many levels of box this node contains, counting itself as 0. */
export function subtreeHeight(n: Node): number {
  if (!isContainer(n) || !n.children.length) return 0;
  return 1 + Math.max(...n.children.map(subtreeHeight));
}

/* ══════════════════════════════════════════════════════════════════════════
   The one rebuild every operation goes through
   ══════════════════════════════════════════════════════════════════════════ */

type HostEdit = (children: Node[], hostId: string) => Node[];

/**
 * Rebuild the document, giving every host (column or container) the chance to
 * replace its own children.
 *
 * ONE traversal for insert, remove, move, group and ungroup, so there is one
 * place where "which array does this belong to" is answered. Identity is
 * preserved where nothing changed, because history and the revision diff both
 * compare values and a rebuild that always returned new objects would badge
 * every section on every keystroke.
 */
function editHosts(doc: BuilderDocument, edit: HostEdit): BuilderDocument {
  let touched = false;

  const editNode = (n: Node): Node => {
    if (!isContainer(n)) return n;
    const kids = n.children.map(editNode);
    const next = edit(kids, n.id);
    if (next === n.children) return n;
    touched = true;
    return { ...n, children: next };
  };

  const sections = doc.sections.map((s) => {
    let sectionTouched = false;
    const columns = s.columns.map((c) => {
      const kids = c.widgets.map(editNode);
      const next = edit(kids, c.id);
      if (next === c.widgets) return c;
      sectionTouched = true;
      return { ...c, widgets: next };
    });
    if (!sectionTouched) return s;
    touched = true;
    return { ...s, columns };
  });

  return touched ? { ...doc, sections } : doc;
}

/** Replace, in place, whatever node has this id. `null` removes it. */
function editNodeById(
  doc: BuilderDocument,
  id: string,
  fn: (n: Node) => Node | null,
): BuilderDocument {
  return editHosts(doc, (children) => {
    const i = children.findIndex((c) => c.id === id);
    if (i < 0) return children;
    const next = fn(children[i]);
    const out = [...children];
    if (next === null) out.splice(i, 1); else out[i] = next;
    return out;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Operations
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PUT A NODE IN A HOST, at an exact index.
 *
 * The one insert. A "+" strip, a drag from the pane, a slash command, a
 * ready-made section and the upgrade all come through here, so the rules about
 * where something may go are written once.
 */
export function insertNode(
  doc: BuilderDocument,
  hostId: string,
  index: number,
  node: Node,
): BuilderDocument {
  const depth = hostDepth(doc, hostId);
  if (depth < 0) return doc;
  // RULE 3. The box being dropped brings its own levels with it.
  if (depth + subtreeHeight(node) >= MAX_DEPTH) return doc;
  return editHosts(doc, (children, id) => {
    if (id !== hostId) return children;
    const at = Math.max(0, Math.min(index, children.length));
    const out = [...children];
    out.splice(at, 0, node);
    return out;
  });
}

/**
 * TAKE A NODE OFF THE PAGE.
 *
 * REFUSES a locked one and refuses a BOX THAT HOLDS ONE — deleting the box
 * round the footer is the same act as deleting the footer, and a rule the
 * widget's own delete enforces but its wrapper does not is not a rule.
 */
export function removeNode(doc: BuilderDocument, id: string): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit || holdsLocked(hit.node)) return doc;
  return editNodeById(doc, id, () => null);
}

/**
 * COPY A NODE, WITH EVERYTHING IN IT, AND PUT THE COPY UNDER IT.
 *
 * Refuses a locked one and a box holding one, for the same reason
 * `duplicateSection` does: a part the law puts on the page exists exactly ONCE,
 * and "duplicate" is the quiet way to a second unsubscribe footer.
 */
export function duplicateNode(doc: BuilderDocument, id: string): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit || holdsLocked(hit.node)) return doc;
  return insertNode(doc, hit.parentId, hit.index + 1, cloneNode(hit.node));
}

/**
 * THE INDEX MATHS, which is the whole of the bug surface in a drag.
 *
 * The node is REMOVED and then inserted, so when the target host is the one it
 * came out of and the target index is after it, the index has already shifted
 * down by one. Getting this wrong drops the node one place short of the line
 * that was drawn, every time, and only when dragging downwards.
 */
export function dropIndexForNode(
  fromParentId: string,
  fromIndex: number,
  toParentId: string,
  toIndex: number,
): number {
  return fromParentId === toParentId && toIndex > fromIndex ? toIndex - 1 : toIndex;
}

/**
 * MOVE A NODE ANYWHERE — another box, another column, another section.
 *
 * RULE 1, and it is the reason this is not three lines in the canvas: a box
 * dropped into its OWN child detaches the whole branch from the document. The
 * node's own id and every id under it are off limits as a destination.
 */
export function moveNode(
  doc: BuilderDocument,
  id: string,
  toHostId: string,
  toIndex: number,
): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit) return doc;
  if (toHostId === id) return doc;
  if (descendantsOf(hit.node).some((d) => d.id === toHostId)) return doc;
  const depth = hostDepth(doc, toHostId);
  if (depth < 0) return doc;
  if (depth + subtreeHeight(hit.node) >= MAX_DEPTH) return doc;

  const at = dropIndexForNode(hit.parentId, hit.index, toHostId, toIndex);
  const lifted = editNodeById(doc, id, () => null);
  return insertNode(lifted, toHostId, at, hit.node);
}

/** Nudge a node up or down among its own siblings. A keyboard must reach this. */
export function nudgeNode(doc: BuilderDocument, id: string, delta: -1 | 1): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit) return doc;
  const kids = hostChildren(doc, hit.parentId);
  if (!kids) return doc;
  const to = hit.index + delta;
  if (to < 0 || to >= kids.length) return doc;
  return moveNode(doc, id, hit.parentId, delta > 0 ? to + 1 : to);
}

/**
 * Write a node's props — THE one seam every writer goes through.
 *
 * A container's props are written here too. They used to be refused ("a
 * container has none by design"), which was true for a day and stopped being
 * true the moment `html_tag` existed: the renderer has honoured
 * `props.html_tag` on a box since stream C, and with the write refused the
 * only way to set it was to hand-edit the document. One seam, both kinds of
 * node, and `isContainer` stays the one test for everything else.
 *
 * ── AND THE ONE RULE THE MODEL ENFORCES RATHER THAN DOCUMENTS ─────────────
 * Catalogue F.1.4: *"At most one card in a row may carry `Recommended`. The
 * model enforces it (setting it on a second card clears the first), because
 * two recommendations is no recommendation."* This is where it is enforced,
 * because this is the one function a panel, an inspector, a canvas edit, a
 * shortcut and a template all reach. Enforcing it in the panel would leave
 * every other door open.
 */
export function patchNode(
  doc: BuilderDocument,
  id: string,
  props: Record<string, unknown>,
): BuilderDocument {
  const written = editNodeById(doc, id, (n) => ({ ...n, props: { ...n.props, ...props } } as Node));
  return clearRecommendedSiblings(written, id);
}

/**
 * Take the Recommended ribbon off every SIBLING of this node.
 *
 * Siblings, i.e. the other children of the same box or column — which is what
 * "in a row" means once a row is a box. Nothing happens unless the node that
 * was just written IS the recommended one, so a patch that had nothing to do
 * with ribbons returns the same document by identity.
 */
function clearRecommendedSiblings(doc: BuilderDocument, id: string): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit || !isRecommended(hit.node.props)) return doc;
  const kids = hostChildren(doc, hit.parentId);
  if (!kids) return doc;
  let out = doc;
  for (const sib of kids) {
    if (sib.id === id || !isRecommended(sib.props)) continue;
    // The ribbon comes OFF, and its words come off with it. A card left
    // carrying "Recommended" behind a switched-off ribbon is a ribbon that
    // comes back the next time anybody opens the document.
    out = editNodeById(out, sib.id, (n) =>
      ({ ...n, props: { ...n.props, ...ribbonProps(null) } } as Node));
  }
  return out;
}

/**
 * Set (or clear) a node's styling. §11.8, and §11.12's layout keys.
 *
 * Passing `undefined` removes the key entirely — that is what Reset does, and
 * why a reset document is byte-identical to one nobody ever styled.
 */
export function setNodeStyle(
  doc: BuilderDocument,
  id: string,
  style: ElementStyle | undefined,
): BuilderDocument {
  return editNodeById(doc, id, (n) => {
    const { style: _old, ...rest } = n as any;
    return (style && Object.keys(style).length ? { ...rest, style } : rest) as Node;
  });
}

/** Lock or unlock one node. A required part is never unlocked, however asked. */
export function setNodeLocked(doc: BuilderDocument, id: string, locked: boolean): BuilderDocument {
  return editNodeById(doc, id, (n) => {
    if (isContainer(n)) return n;
    if (!locked && isRequired(n)) return n;
    const { locked: _old, ...rest } = n;
    return locked ? { ...rest, locked: true } : rest;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Group, ungroup, transform
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * GROUP N SIBLINGS INTO A BOX.
 *
 * Gutenberg's "Group", Elementor's "Create container". Select two cards, press
 * it, and they are inside one box that can be styled, moved and duplicated as
 * one thing.
 *
 * The ids must be SIBLINGS — grouping a heading in section 2 with a card in
 * section 7 has no meaning on a page, and inventing one (lift them both out and
 * put them somewhere) would move words the author did not ask to move. The run
 * is taken from the first to the last of them INCLUSIVE, because a box with a
 * hole in the middle is not something the page can draw.
 */
export function groupNodes(
  doc: BuilderDocument,
  ids: string[],
  style?: ElementStyle,
): BuilderDocument {
  const hits = ids.map((id) => findNode(doc, id)).filter((h): h is NodeHit => !!h);
  if (hits.length < 2) return doc;
  const parentId = hits[0].parentId;
  if (hits.some((h) => h.parentId !== parentId)) return doc;
  const first = Math.min(...hits.map((h) => h.index));
  const last = Math.max(...hits.map((h) => h.index));

  const kids = hostChildren(doc, parentId);
  if (!kids) return doc;
  const run = kids.slice(first, last + 1);
  const depth = hostDepth(doc, parentId);
  // The box adds a level to everything inside it.
  if (depth + 1 + Math.max(0, ...run.map(subtreeHeight)) >= MAX_DEPTH) return doc;

  const box = makeContainer(style, run);
  return editHosts(doc, (children, id) => {
    if (id !== parentId) return children;
    const out = [...children];
    out.splice(first, last - first + 1, box);
    return out;
  });
}

/**
 * TAKE THE BOX AWAY AND LEAVE WHAT WAS IN IT.
 *
 * The children land exactly where the box was, in order, so ungrouping and
 * grouping again gets you back to where you started. A box holding a locked
 * part may be ungrouped — nothing is deleted, and refusing would strand the
 * footer inside a box the author cannot undo.
 */
export function ungroupNode(doc: BuilderDocument, id: string): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit || !isContainer(hit.node)) return doc;
  const kids = hit.node.children;
  return editHosts(doc, (children, hostId) => {
    if (hostId !== hit.parentId) return children;
    const i = children.findIndex((c) => c.id === id);
    if (i < 0) return children;
    const out = [...children];
    out.splice(i, 1, ...kids);
    return out;
  });
}

export type Direction = "row" | "column" | "grid";

/**
 * TURN A BOX SIDEWAYS, or back.
 *
 * Row ↔ column ↔ grid, with everything in it kept. The direction lives in
 * `style`, so this writes the same key the inspector's Layout group writes —
 * one mechanism, and a transform the author can then adjust per device.
 *
 * "column" is the DEFAULT and therefore removes the key rather than writing it,
 * so a box turned to a row and back is byte-identical to one that was never
 * touched.
 */
export function setDirection(doc: BuilderDocument, id: string, direction: Direction): BuilderDocument {
  const hit = findNode(doc, id);
  if (!hit || !isContainer(hit.node)) return doc;
  const style: ElementStyle = { ...(hit.node.style || {}) };
  if (direction === "column") delete (style as any).direction;
  else (style as any).direction = direction;
  if (direction === "grid" && (style as any).columns === undefined) (style as any).columns = 3;
  if (direction !== "grid") delete (style as any).columns;
  return setNodeStyle(doc, id, Object.keys(style).length ? style : undefined);
}

/** Which way a box runs right now. Absent means a column, which is the default. */
export function directionOf(n: Node | null | undefined): Direction {
  const d = (n as any)?.style?.direction;
  return d === "row" || d === "grid" ? d : "column";
}

/* ══════════════════════════════════════════════════════════════════════════
   The legacy address
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A `WidgetPath` turned into a node id.
 *
 * `path.id` WINS when it is there: it is the only address that can reach a
 * widget inside a box, and everything the engine builds fills it in. The three
 * indices are the fallback for a path an adapter built by hand, and they reach
 * the top level of a column, which is where every such path was pointing before
 * containers existed.
 */
export function nodeIdAt(doc: BuilderDocument, path: WidgetPath | null | undefined): string | null {
  if (!path) return null;
  if (path.id) return path.id;
  const section = doc.sections.find((s) => s.id === path.sectionId);
  const node = section?.columns[path.columnIndex]?.widgets[path.widgetIndex];
  return node ? node.id : null;
}

/** The legacy address of a node, for a caller that still speaks paths. */
export function pathOfNode(doc: BuilderDocument, id: string): WidgetPath | null {
  const hit = findNode(doc, id);
  if (!hit) return null;
  return {
    sectionId: hit.sectionId,
    columnIndex: hit.columnIndex,
    // For a nested node this is its index among its OWN siblings. The id above
    // is the address; this is here so a path always round-trips to something.
    widgetIndex: hit.index,
    id,
  };
}

/** Which section a node is in, whatever depth it sits at. */
export function sectionOfNode(doc: BuilderDocument, id: string): Section | null {
  const hit = findNode(doc, id);
  if (!hit) return null;
  return doc.sections.find((s) => s.id === hit.sectionId) || null;
}
