/**
 * builder/adapters/website/siteModel.ts — the WEBSITE adapter's model bridge.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 3 and §11.5.
 *
 * ── WHAT THIS FILE IS ─────────────────────────────────────────────────────
 * The engine's document is `sections → columns → widgets`. ARION's page is an
 * ordered list of SECTIONS, each one an archetype (a hero, your prices) with a
 * bag of FIELDS and the Elementor node those fields came out of. This module
 * is the translation, both ways, and nothing else in the Portal knows it.
 *
 *     ARION section  ⇄  builder section
 *     ─────────────────────────────────────────────────────────────────
 *     kind: "hero"      one section, one column, one `site_hero` widget
 *                       whose props ARE the fields
 *     kind: "content"   one section, `layout` columns, one widget per
 *                       content block, in the column it was in
 *     kind: null        one section holding a LOCKED `site_custom` widget
 *                       that carries the original node untouched
 *
 * ── WHY THE NODE RIDES IN THE PROPS ───────────────────────────────────────
 * Every save sends `{ fields, node }` per section: arion-api patches the node
 * IN PLACE from the fields, so every style and setting the section picked up
 * since we wrote it survives, and a section we did not author is carried back
 * byte for byte. The node therefore has to travel with the section through
 * undo, redo, reordering and duplication — which is exactly what props do. A
 * `Map` keyed by section id would not survive `duplicateSection`, because a
 * duplicate is a new id.
 *
 * ── DUPLICATES ───────────────────────────────────────────────────────────
 * Two sections carrying the same Elementor ids is a broken page, and two
 * carrying the same `ia:` handle is an ambiguous one. `freshenDuplicates`
 * below re-mints both, once, at save time — the one place that sees the whole
 * page at once.
 *
 * Pure: no React, no fetch, so the round trip is a `node --test` file.
 */
import {
  CONTAINER_KIND, isContainer, makeContainer, makeSection, makeWidget, emptyDocument,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { arionKindOf, siteWidgetKindFor } from "../../registry";

/* ══════════════════════════════════════════════════════════════════════════
   The wire shape — exactly what arion-api's GET/PUT .../sections speaks
   ══════════════════════════════════════════════════════════════════════════ */

export interface ArionSection {
  index: number;
  handle: string | null;
  kind: string | null;
  blueprintId?: string | null;
  blockId?: string | null;
  editable: boolean;
  reason?: string | null;
  label: string;
  fields: Record<string, any> | null;
  node: any;
  /* Phase 3 adoption, carried through so the canvas can offer it. */
  adoptable?: boolean;
  adoptKindLabel?: string | null;
  adoptWhy?: string | null;
  adoptPreview?: string | null;
  adoptConfidenceLabel?: string | null;
  adoptReasonText?: string | null;
  fingerprint?: string;
  /** Set on a row that IS editable because it was adopted — so it can be undone. */
  adoption?: { adoptionId: string; adoptedAt?: string | null; canUndo?: boolean } | null;
  /** Roles the server had to guess at, so the inspector can ask. */
  roleReview?: Array<{ list: string; roles: string[]; fields: string[]; why: string }> | null;
}

/** What a save sends per section. `node` is never invented in the Portal. */
export interface SectionPayload { fields: Record<string, any> | null; node: any }

/** The prop every site widget carries its Elementor node in. */
export const NODE_PROP = "__node";
/** The prop a custom section carries its "why not" in. */
export const LOCK_PROP = "__lock";
/** The prop an ADOPTED section carries its undo record in. */
export const ADOPTION_PROP = "__adoption";
/** The prop a section carries the roles the adapter had to GUESS at in. */
export const ROLE_REVIEW_PROP = "__roleReview";
/**
 * THE SECTION'S OWN LOOK.
 *
 * The canvas toolbar changes a background and the room around a section, and
 * the inspector changes its heading font. All three have to reach the WEBSITE
 * or they are controls that lie, so they ride as the `style` field arion-api
 * writes onto the section's own Elementor container (sectionSchema's
 * `applySectionStyle`). Here they are simply carried on and off the engine's
 * own section properties, which is where the toolbar already puts them.
 */
export interface SectionStyle { background?: string; padding?: number | null; headingFont?: string }

/** The prop a section keeps its look AS IT ARRIVED in. */
export const STYLE0_PROP = "__style0";

/** The style a section is actually BUILT with, which is what changes are measured from. */
function asBuiltStyle(style: SectionStyle): SectionStyle {
  return {
    background: style.background || "",
    padding: Number.isFinite(Number(style.padding)) ? Number(style.padding) : 0,
    headingFont: style.headingFont || "",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ARION → builder
   ══════════════════════════════════════════════════════════════════════════ */

/** Which builder widget kind one content block is drawn with. */
export function blockWidgetKind(blockKind: string): string {
  return blockKind === "text" ? "paragraph" : blockKind;
}
/** And back. The engine calls a paragraph "paragraph"; so does arion-api. */
export function contentBlockKind(widgetKind: string): string {
  return widgetKind;
}

/* ══════════════════════════════════════════════════════════════════════════
   A BLOCK IS A NODE (B-168, "one vocabulary for what a page may hold")

   A free section used to send a FLAT list of `{ kind, col, ...props }`, which
   was right while the only things it could hold were nine atoms. It now holds
   whatever the panel offers, including a BOX, and a box has children and a
   layout — neither of which `...props` carries, because a container keeps its
   children in `children` and its arranging in `style`.

   Two reserved keys carry them, both `__`-prefixed like every other prop that
   is ours rather than the widget's, so neither can ever collide with a control
   key (`divider` really does have a control called `style`). arion-api's
   `sectionSchema.js` spells them the same way and nothing else does.
   ══════════════════════════════════════════════════════════════════════════ */

/** What is inside a box. */
export const BLOCK_CHILDREN_KEY = "__children";
/** A block's own §11.8 look, which for a box is also its layout. */
export const BLOCK_STYLE_KEY = "__style";

/** One builder node → one ARION content block. */
function blockFor(w: Widget, col?: number): Record<string, any> {
  const props: Record<string, any> = {};
  for (const [k, v] of Object.entries((w.props || {}) as Record<string, unknown>)) {
    // Every `__` prop is OURS — the Elementor node, the lock, the adoption
    // record — and none of them is content. Stripped in one rule rather than
    // named one at a time, so a new one cannot leak onto somebody's website.
    if (k.startsWith("__")) continue;
    props[k] = v;
  }
  const out: Record<string, any> = { kind: contentBlockKind(w.kind), ...(col != null ? { col } : {}), ...props };
  if (w.style && Object.keys(w.style).length) out[BLOCK_STYLE_KEY] = w.style;
  if (isContainer(w)) {
    out[BLOCK_CHILDREN_KEY] = (w.children || []).map((k) => blockFor(k as Widget));
  }
  return out;
}

/** One ARION content block → one builder node. */
function nodeForBlock(b: any): Widget {
  const { kind, col: _col, [BLOCK_CHILDREN_KEY]: kids, [BLOCK_STYLE_KEY]: style, ...rest } =
    (b || {}) as Record<string, any>;
  const name = blockWidgetKind(String(kind || "paragraph"));
  const base: Widget = name === CONTAINER_KIND
    ? makeContainer(style, Array.isArray(kids) ? kids.map(nodeForBlock) : [])
    : makeWidget(name, rest);
  if (name === CONTAINER_KIND) return base;
  if (style && typeof style === "object" && Object.keys(style).length) base.style = style;
  return base;
}

function sectionFor(entry: ArionSection): Section {
  const node = entry.node ?? null;

  /* A section built on the site itself. Locked, shown in position, carried
   * back byte for byte — never claimed as something we can edit. */
  if (!entry.kind || !entry.editable) {
    return makeSection({
      label: entry.label || "Custom section",
      layout: 1,
      width: "full",
      padding: 0,
      columns: [{
        id: `c_${entry.index}`,
        widgets: [makeWidget("site_custom", {
          [NODE_PROP]: node,
          [LOCK_PROP]: {
            label: entry.label || "Custom section — built on the site",
            reason: entry.reason || "custom",
            why: entry.adoptReasonText || entry.adoptWhy || null,
            preview: entry.adoptPreview || null,
            adoptable: !!entry.adoptable,
            adoptKindLabel: entry.adoptKindLabel || null,
            adoptConfidence: entry.adoptConfidenceLabel || null,
            index: entry.index,
          },
        })],
      }],
    });
  }

  /* The free section: its columns and its blocks ARE the builder's. */
  if (entry.kind === "content") {
    const fields = entry.fields || {};
    const layout = [1, 2, 3].includes(Number(fields.layout)) ? (Number(fields.layout) as 1 | 2 | 3) : 1;
    const blocks: any[] = Array.isArray(fields.blocks) ? fields.blocks : [];
    const columns = Array.from({ length: layout }, (_, i) => ({
      id: `c_${entry.index}_${i}`,
      widgets: blocks.filter((b) => (Number(b?.col) || 0) === i).map(nodeForBlock),
    }));
    // A free section's node has nowhere to hang inside it — its widgets ARE
    // the blocks — so it rides on the section's own `meta`, which the engine
    // carries through undo, reorder and duplicate without reading it.
    const freeStyle: SectionStyle = (fields as any).style || {};
    return makeSection({
      label: entry.label || "Words and pictures",
      layout, width: "full",
      background: freeStyle.background || "",
      padding: Number.isFinite(Number(freeStyle.padding)) ? Number(freeStyle.padding) : 0,
      headingFont: freeStyle.headingFont || "",
      columns,
      meta: { [NODE_PROP]: node, [STYLE0_PROP]: asBuiltStyle(freeStyle) },
    });
  }

  /* An archetype: one section, one widget, props = fields. */
  const style: SectionStyle = (entry.fields as any)?.style || {};
  const widget = makeWidget(siteWidgetKindFor(entry.kind), {
    ...(entry.fields || {}),
    [NODE_PROP]: node,
    // Carried so the inspector can offer "Undo adoption" for the 30 days the
    // original bytes are kept. Stripped before a save, like every __ prop.
    ...(entry.adoption ? { [ADOPTION_PROP]: entry.adoption } : {}),
    ...(entry.roleReview?.length ? { [ROLE_REVIEW_PROP]: entry.roleReview } : {}),
  });
  return makeSection({
    label: entry.label || entry.kind,
    layout: 1,
    width: "full",
    background: style.background || "",
    padding: Number.isFinite(Number(style.padding)) ? Number(style.padding) : 0,
    headingFont: style.headingFont || "",
    columns: [{ id: `c_${entry.index}`, widgets: [widget] }],
    // The snapshot is the section AS BUILT, not the fields as they arrived:
    // `Section.padding` is a number and a section with no padding of its own
    // is built with 0, so comparing against the incoming `null` would report a
    // change the author never made.
    meta: { [STYLE0_PROP]: asBuiltStyle(style) },
  });
}

/** A whole page, as the builder edits it. */
export function toDocument(sections: ArionSection[], settings: Record<string, string> = {}): BuilderDocument {
  const doc = emptyDocument({ style: "site", ...settings });
  doc.sections = (Array.isArray(sections) ? sections : []).map(sectionFor);
  return doc;
}

/* ══════════════════════════════════════════════════════════════════════════
   builder → ARION
   ══════════════════════════════════════════════════════════════════════════ */

/** The one widget of an archetype section, or null. */
export function sectionWidget(s: Section): Widget | null {
  for (const c of s.columns) for (const w of c.widgets) {
    if (w.kind.startsWith("site_")) return w;
  }
  return null;
}

/** Which ARION kind a builder section is. `null` means a free section. */
export function arionKindOfSection(s: Section): string | null {
  const w = sectionWidget(s);
  if (!w) return "content";
  if (w.kind === "site_custom") return null;
  return arionKindOf(w.kind);
}

function nodeOf(s: Section): any {
  const w = sectionWidget(s);
  if (w) return (w.props as any)?.[NODE_PROP] ?? null;
  return (s.meta as any)?.[NODE_PROP] ?? null;
}

/** The fields a free section sends back: layout, plus its blocks by column. */
/**
 * What the toolbar and the inspector CHANGED — and only that.
 *
 * A key the author did not touch is not written back. That is not an
 * optimisation, it is the round-trip promise: a hand-drawn section has no
 * padding of its own, `Section.padding` is a number, and sending 0 for it
 * would flatten somebody's layout on a save that changed nothing. Saving a
 * page you only looked at must change nothing at all, which is what the
 * "no-op save" assertion proves.
 *
 * Returns undefined when nothing changed, so the field is absent from the
 * payload rather than present and empty.
 */
export function styleOf(s: Section): SectionStyle | undefined {
  const before: SectionStyle = ((s.meta as any)?.[STYLE0_PROP] || {}) as SectionStyle;
  const out: SectionStyle = {};
  const now = {
    background: s.background || "",
    padding: Number.isFinite(Number(s.padding)) ? Number(s.padding) : null,
    headingFont: String(s.headingFont || ""),
  };
  if (now.background !== (before.background || "")) out.background = now.background;
  const wasPad = Number.isFinite(Number(before.padding)) ? Number(before.padding) : null;
  if (now.padding !== wasPad) out.padding = now.padding;
  if (now.headingFont !== (before.headingFont || "")) out.headingFont = now.headingFont;
  return Object.keys(out).length ? out : undefined;
}

export function contentFieldsOf(s: Section): Record<string, any> {
  const blocks: any[] = [];
  s.columns.forEach((col, i) => {
    for (const w of col.widgets) {
      if (w.kind.startsWith("site_")) continue;
      blocks.push(blockFor(w, i));
    }
  });
  const style = styleOf(s);
  return { layout: s.layout, blocks, ...(style ? { style } : {}) };
}

/** Everything a section sends back, minus the props that are ours, not theirs. */
export function fieldsOf(s: Section): Record<string, any> | null {
  const kind = arionKindOfSection(s);
  if (kind === null) return null;              // custom — carried, never patched
  if (kind === "content") return contentFieldsOf(s);
  const w = sectionWidget(s);
  if (!w) return null;
  const {
    [NODE_PROP]: _n, [LOCK_PROP]: _l, [ADOPTION_PROP]: _a, [ROLE_REVIEW_PROP]: _r, ...fields
  } = (w.props || {}) as any;
  // The section's own look comes off the SECTION, not the widget — the canvas
  // toolbar puts it there and the engine carries it through undo and reorder.
  const style = styleOf(s);
  return { ...fields, ...(style ? { style } : {}) };
}

/**
 * Re-mint the Elementor ids and the `ia:` handle of any section that shares
 * them with one earlier on the page.
 *
 * DUPLICATING A SECTION is the case: `cloneSection` gives the builder a fresh
 * section id, and the Elementor node inside it is a deep copy carrying the
 * ORIGINAL ids. Two nodes with one id is a page Elementor draws wrong, and two
 * with one handle is a page whose adoption records point at either.
 *
 * Deterministic, from a counter, so the same page saved twice does not churn.
 */
export function freshenDuplicates(payloads: SectionPayload[]): SectionPayload[] {
  const seenIds = new Set<string>();
  const seenHandles = new Set<string>();
  let n = 0;
  const mint = () => {
    n += 1;
    return `d${n.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  };

  return payloads.map((p) => {
    const node = p.node;
    if (!node || typeof node !== "object") return p;

    const ids: string[] = [];
    (function walk(x: any) {
      if (!x || typeof x !== "object") return;
      if (typeof x.id === "string") ids.push(x.id);
      (x.elements || []).forEach(walk);
    })(node);

    const handle = String(node?.settings?._title || "");
    const idClash = ids.some((id) => seenIds.has(id));
    const handleClash = !!handle && handle.startsWith("ia:") && seenHandles.has(handle);

    if (!idClash && !handleClash) {
      ids.forEach((id) => seenIds.add(id));
      if (handle) seenHandles.add(handle);
      return p;
    }

    const copy = JSON.parse(JSON.stringify(node));
    (function rewrite(x: any) {
      if (!x || typeof x !== "object") return;
      if (typeof x.id === "string") x.id = mint();
      (x.elements || []).forEach(rewrite);
    })(copy);
    if (handle.startsWith("ia:")) {
      const parts = handle.split(":");
      parts[3] = mint();
      copy.settings = { ...(copy.settings || {}), _title: parts.join(":") };
    }
    (function collect(x: any) {
      if (!x || typeof x !== "object") return;
      if (typeof x.id === "string") seenIds.add(x.id);
      (x.elements || []).forEach(collect);
    })(copy);
    if (copy.settings?._title) seenHandles.add(String(copy.settings._title));
    return { ...p, node: copy };
  });
}

/**
 * The page, ready to save.
 *
 * A section with no node is DROPPED rather than sent: the server refuses a
 * payload whose section count does not match, and a builder section with no
 * Elementor node behind it is a bug on our side, not something to publish.
 */
export function toPayload(doc: BuilderDocument): SectionPayload[] {
  const out: SectionPayload[] = [];
  for (const s of doc.sections) {
    const node = nodeOf(s);
    if (!node) continue;
    out.push({ fields: fieldsOf(s), node });
  }
  return freshenDuplicates(out);
}

/**
 * THE DRAFT'S OWN SHAPE (D-05).
 *
 * `toPayload` sends the two things the WEBSITE needs — the fields and the
 * Elementor node — because that is all a save is. A DRAFT is different: it has
 * to come back into the builder, and `sectionFor` reads `kind` and `editable`
 * to decide whether a section is one we can edit or one built on the site
 * itself. Round-tripping the save payload therefore reopened every section as
 * `site_custom`: the page came back locked, with no inspector and no catalogue
 * picker. Found by driving Save → reopen, 2026-09-17.
 *
 * So a held draft carries the same rows the detail response sends. The extra
 * keys ride past arion-api's `buildNodes`, which reads the handle, the fields
 * and the node and ignores the rest.
 */
export function toDraftPayload(doc: BuilderDocument): ArionSection[] {
  const out: ArionSection[] = [];
  let index = 0;
  for (const s of doc.sections) {
    const node = nodeOf(s);
    if (!node) continue;
    const w = sectionWidget(s);
    const lock: any = w && w.kind === "site_custom" ? (w.props as any)[LOCK_PROP] : null;
    const kind = arionKindOfSection(s);
    out.push({
      index,
      handle: handleOf(node),
      // A locked section has no kind we can edit, and saying otherwise is how
      // somebody else's Elementor work comes back claimed as ours.
      kind: lock ? null : kind,
      editable: !lock,
      reason: lock?.reason ?? null,
      label: lock?.label || s.label || "Section",
      fields: lock ? null : fieldsOf(s),
      node,
      ...(lock ? {
        adoptable: !!lock.adoptable,
        adoptKindLabel: lock.adoptKindLabel ?? null,
        adoptWhy: lock.why ?? null,
        adoptPreview: lock.preview ?? null,
      } : {}),
    });
    index += 1;
  }
  return out;
}

/** A section's own `ia:` handle, off the node the website gave us. */
function handleOf(node: any): string | null {
  const title = String(node?.settings?._title || "");
  return title.startsWith("ia:") ? title : null;
}

/** Builder sections that would be dropped by `toPayload`, for the error line. */
export function sectionsWithoutNodes(doc: BuilderDocument): Section[] {
  return doc.sections.filter((s) => !nodeOf(s));
}

/** Build one builder section from what `POST /sections` handed back. */
export function sectionFromServer(entry: ArionSection): Section {
  return sectionFor(entry);
}

/** Put a freshly built node onto an existing section — used after Ask ARGUS. */
export function withNode(s: Section, node: any): Section {
  const w = sectionWidget(s);
  if (!w) return { ...s, meta: { ...(s.meta || {}), [NODE_PROP]: node } };
  return {
    ...s,
    columns: s.columns.map((c) => ({
      ...c,
      widgets: c.widgets.map((x) => (x.id === w.id ? { ...x, props: { ...x.props, [NODE_PROP]: node } } : x)),
    })),
  };
}
