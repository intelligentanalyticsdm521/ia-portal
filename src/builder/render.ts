/**
 * builder/render.ts — THE renderer. One function, every surface.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.4 and §8.
 *
 * ── WHY THERE IS ONLY ONE ─────────────────────────────────────────────────
 * The inventory found the proposal's block→HTML projection living in
 * OliverProposalsPage.tsx, which meant the SERVER could not render a proposal
 * at all: the customer page was a separate app, the PDF did not exist, and the
 * emailed narrative was a third, lossy projection written at save time. Three
 * pictures of one document, and the document itself was whichever one you were
 * looking at.
 *
 * So: this module turns a BuilderDocument into HTML, and it is the only thing
 * that does.
 *
 *   · the CANVAS renders exactly this HTML, then lets the author type straight
 *     into the elements it marks `data-edit` (Canvas.tsx). What the author
 *     edits IS the customer's document, not a preview of it.
 *   · the CUSTOMER PAGE renders exactly this HTML (PublicProposalPage.tsx).
 *   · the SIGNED PDF is painted by oliver-api from the SAME model through
 *     lib/documentModel.js, whose arithmetic is pinned against this module's
 *     by test/fixtures/document-render-cases.json — the same shared-fixture
 *     discipline that keeps the three copies of renderTemplate.js honest
 *     (SEAM-6-A).
 *
 * ── PURE ──────────────────────────────────────────────────────────────────
 * Strings in, string out. No React, no DOM, no fetch — so renderer snapshots
 * are a `node --test` file rather than something you have to click to check.
 *
 * ── EDIT MARKERS ──────────────────────────────────────────────────────────
 * `data-edit="<prop path>"` marks a run of text the author may type into.
 * `data-widget`, `data-section`, `data-col` mark structure so a click on the
 * page can be resolved to a selection without a second model of the layout.
 */
import type { BuilderDocument, Section, Widget } from "./model";
import {
  attributeAttrs, hasStyle, sidesToCss, styleBlockFor, isTypographic, widgetStyleClass, resolveStyle,
  JUSTIFY_CSS, ITEMS_CSS, baseDirection, shapeDividerHtml, type Device,
} from "./style";
import { isContainer, CONTAINER_KIND, MAX_DEPTH } from "./treeOps";
import type { Container, Node } from "./model";
import { sectionNumbers } from "./model";
import { fill, type MergeContext } from "./merge";
import { documentTotals, money, type DocumentTotals } from "./totals";
import { CONTAINER_ROOT_CSS, STACK_QUERY } from "./responsive";
/* D-156 stream B — THE ATOMIC WIDGETS (widgets/). Each declares itself and
   draws itself in one file; the engine asks them before its own switch,
   exactly as it asks the adapter. The cycle this makes (render -> widgets ->
   render) crosses only hoisted function declarations, never a const read
   while a module is still evaluating. */
import { renderAtom } from "./widgets";
import { renderFamily } from "./widgets/families";
import { ATOM_KINDS } from "./widgets/kinds";
import type { CatalogOffering } from "../components/oliver/ProposalCatalogPicker";

/* ── One escaper. The inventory found three. ─────────────────────────────── */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface LocationLite {
  location_id: string;
  name?: string | null;
  /** Two spellings reach the renderer: `address_line1` off
   *  lumen.customer_location (the builder's picker) and `address_line_1` from
   *  oliver-api's fetchLocationDetails, which renames them. Both are read. */
  address_line1?: string | null;
  address_line2?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  access_notes?: string | null;
  gate_code?: string | null;
  /** Who is met on site. Printed by `address_block` (D-156). */
  site_contact?: string | null;
}

export interface RenderContext {
  mode: "view" | "edit";
  merge: MergeContext;
  /** Any colour and any font, per Q4. The brand kit only pre-filled these. */
  accent: string;
  ink: string;
  headingFont: string;
  bodyFont: string;
  currency: string;
  /** Business identity for the header widget. */
  business: { name: string; tagline?: string; logoUrl?: string | null; contactLine?: string };
  locations?: Record<string, LocationLite>;
  /** Computed once by the caller and handed in — see totals.ts. */
  totals: DocumentTotals;
  /**
   * THE DOCUMENT BEING DRAWN (D-156 stream B).
   *
   * A `totals` widget adds up the priced lines ABOVE IT, which it cannot do
   * from its own props. Handed in by `makeContext` from the document it was
   * given, so no caller changes and nothing can hand in a different one.
   */
  doc?: BuilderDocument;
  /**
   * The business's products & services, when the surface has them loaded.
   *
   * A `catalog_card` shows the LIVE price from here when it is present and
   * the snapshot stored on the widget when it is not — which is what makes
   * the card correct on a server that has no catalogue in the request.
   */
  catalogue?: CatalogOffering[];
  /** section id → "01". Computed by the caller from the whole document. */
  numbers: Record<string, string>;
  /**
   * THE ADAPTER'S OWN WIDGETS.
   *
   * The engine draws the widgets every builder shares. An adapter that has
   * widgets of its own — the website adapter's eleven whole-page sections, for
   * instance — supplies them here rather than adding a branch to the switch
   * below, which is what keeps this module free of any one product.
   *
   * Return a string to draw the widget, or null to let the engine try. The
   * result is wrapped by `renderWidget` exactly like any other, so edit
   * markers, selection and the `data-widget` handle all behave the same.
   */
  extra?: (widget: Widget, ctx: RenderContext) => string | null;
  /**
   * A revision's diff: section id → "added" | "changed" (diff.ts).
   *
   * The author's canvas and the customer's revision page both hand this in, so
   * "what moved" is drawn by the ONE renderer and the two surfaces cannot badge
   * different sections. Absent everywhere else, which is why a normal document
   * carries no badges at all.
   */
  changed?: Record<string, "added" | "changed">;
}

export function makeContext(
  doc: BuilderDocument,
  partial: Partial<RenderContext> & { merge?: MergeContext },
): RenderContext {
  return {
    mode: partial.mode ?? "view",
    merge: partial.merge ?? {},
    accent: partial.accent ?? doc.settings.accent ?? "#0C4A60",
    ink: partial.ink ?? "#0B1C24",
    headingFont: partial.headingFont ?? doc.settings.headingFont ?? "Inter",
    bodyFont: partial.bodyFont ?? doc.settings.bodyFont ?? "Inter",
    currency: partial.currency ?? "USD",
    business: partial.business ?? { name: "" },
    locations: partial.locations ?? {},
    totals: partial.totals ?? documentTotals(doc),
    doc,
    ...(partial.catalogue ? { catalogue: partial.catalogue } : {}),
    numbers: partial.numbers ?? sectionNumbers(doc),
    extra: partial.extra,
    ...(partial.changed ? { changed: partial.changed } : {}),
  };
}

/** Merge-fill, then escape. Never the other way round. */
export function t(text: unknown, ctx: RenderContext): string {
  return tokenChips(esc(fill(String(text ?? ""), ctx.merge, ctx.mode)), ctx);
}

/**
 * AN UNFILLED MERGE FIELD IS A SLOT, NOT A WORD (D-03, §11.10).
 *
 * §9 of the 2026-09-16 walk: "The only way through is to work out for yourself
 * that you must click the sentence on the page, select the whole paragraph, and
 * retype it with your numbers in place of the braces. I did that four times."
 * Four merge fields destroyed, because {{contract.start_date}} looked exactly
 * like the words around it.
 *
 * EDIT MODE ONLY, and AFTER escaping — `esc` does not touch braces, so the
 * pattern is still there to find and nothing already escaped can be undone. A
 * customer's copy, a PDF and every stored golden are byte-identical to before,
 * which is why this is safe to put in the one renderer.
 *
 * The chip is a <span> inside a contentEditable run, so `innerText` reads back
 * {{contract.start_date}} exactly as it was: the model cannot tell the
 * difference, and the author can.
 */
function tokenChips(escaped: string, ctx: RenderContext): string {
  if (ctx.mode !== "edit" || escaped.indexOf("{{") < 0) return escaped;
  return escaped.replace(/\{\{\s*([a-zA-Z0-9_. ]+?)\s*\}\}/g, (whole, token) =>
    `<span class="bx-tok" data-token="${esc(String(token))}" title="Filled in for you when the document is sent. Click to say what goes here.">${whole}</span>`);
}

/**
 * `**LABEL**` → **LABEL** (D-165).
 *
 * The shared vocabulary says a key fact becomes *"Text Editor (label bold +
 * value)"*, and this is the whole of what makes that true. Two asterisks is the
 * one piece of mark-up the Text Editor understands, because a short answer —
 * "**Service term** 1 November – 30 April" — is a label and a value on one
 * line, and it reads as one line on every surface: a page, a mailbox and a
 * printed PDF.
 *
 * ── AFTER ESCAPING, ALWAYS ────────────────────────────────────────────────
 * `esc` has already turned `<` into `&lt;`, so the only thing left that can
 * match is a pair of asterisks the author typed. The rule can therefore emit
 * `<strong>` without any chance of an author's text becoming markup — the same
 * discipline `tokenChips` runs on, for the same reason.
 *
 * An unpaired `**` is left exactly as typed. Somebody writing "2 ** 3" gets
 * "2 ** 3", because guessing at half a pair is how a document grows a word
 * nobody wrote.
 */
export function boldRuns(escaped: string): string {
  return escaped.indexOf("**") < 0
    ? escaped
    : escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** Plain text with blank lines between paragraphs → <p> runs. */
export function paras(text: unknown, ctx: RenderContext, editPath?: string): string {
  const filled = fill(String(text ?? ""), ctx.merge, ctx.mode);
  const attr = editPath ? ` data-edit="${esc(editPath)}"` : "";
  if (!filled.trim()) {
    return ctx.mode === "edit"
      ? `<p class="bx-p bx-empty"${attr} data-placeholder="Type here…"></p>`
      : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => boldRuns(tokenChips(esc(p.trim()), ctx)).replace(/\n/g, "<br/>"));
  // In edit mode the whole run is ONE editable element — splitting it into
  // several <p data-edit> would make the author's second paragraph overwrite
  // the first when it is read back.
  if (ctx.mode === "edit") return `<div class="bx-prose"${attr}>${blocks.map((b) => `<p class="bx-p">${b}</p>`).join("")}</div>`;
  return blocks.map((b) => `<p class="bx-p">${b}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   Widgets
   ══════════════════════════════════════════════════════════════════════════ */

/** Every widget kind this renderer draws. The parity test reads this list. */
export const RENDERED_KINDS = [
  /* The engine's own switch. Nine, where there were twenty-one: `doc_header`,
     `footer_note`, `merge_field`, `property_plan`, `pricing_table`, `callout`,
     `key_value_table` and `key_fact` are DELETED with their widgets (D-165),
     and `upgrade.ts` converts every stored one on the way in. `data_table`
     keeps its renderer because the shared vocabulary keeps its id; it has no
     tile. */
  "heading", "paragraph", "list", "clauses", "signature", "page_break",
  "image", "spacer", "divider", "data_table", "button",
  "priced_line",
  // D-165's widgets, each declared and drawn in one file under widgets/.
  ...ATOM_KINDS,
  // …and the box that holds them, which the engine draws itself.
  "container",
  /* 11.13.2 (D-165) — the three widgets that fill from the database. They are
     DRAWN, and drawn by `ctx.extra` (see the `own` branch below), because only
     the proposal adapter has the customer, the site and the business in its
     hand. They are on this list because the list answers "does something draw
     this?", and something does: the hook this file declares. The renderer is
     `proposal/recordWidgets.ts renderRecordBlock`. */
  "customer", "service_location", "business_info",
] as const;

/**
 * Widget kinds that are deliberately NOT drawn.
 *
 * A tile is an ACTION, not a thing on the page. It is listed here so the
 * "offered but not rendered" test can tell a deliberate omission from a
 * forgotten one.
 */
export const UNRENDERED_KINDS = [
  /* `grid` is a LAYOUT PRESET, not a node type (§11.13.1: "columns are a
     Container set to row, or Grid"). The tile exists so the Layout group reads
     as Elementor's does; `registry.presetFor` turns it into a `container` with
     a grid layout before anything is stored, so no document ever holds one and
     there is nothing here to draw. A test asserts that. */
  "grid",
  /* `inner-section` is a LAYOUT PRESET too (B-168, family F0), and the same
     sentence applies word for word: pressing the tile inserts a row Container
     holding two Containers, so no document ever holds a node of this kind and
     there is nothing here to draw. The reference editor still lists Inner
     Section under Basic, which is why the tile exists at all. */
  "inner-section",
  /* 11.13.2 (D-165) — the three TILES. Pressing one opens a picker and drops
     an atomic widget; neither `product_cards`, `product_line_items` nor
     `terms` is ever on a page or in a stored document, so nothing draws one. */
  "product_cards", "product_line_items", "terms",
] as const;

/* ══════════════════════════════════════════════════════════════════════════
   READING A BOX — the ONE reader, for every surface (§11.12, D-156)
   ══════════════════════════════════════════════════════════════════════════

   INTEGRATION NOTE (2026-09-17). Two streams wrote a container reader and they
   disagreed about where a box keeps its answers. The engine (stream A) writes
   them into `style` — `direction`, `justify`, `alignItems`, `wrap`, `gap`,
   `columns` — so the §11.8 per-device cascade arranges a row of cards as a
   column on a phone for nothing; the renderers (stream C) read Elementor's own
   `container_type` / `flex_direction` / `flex_gap` out of `props`. One of them
   had to go, and the `style` one won on three counts: it is the only one that
   is per device, it is the shape the Inspector already writes, and the website
   adapter already translates `style` into Elementor's settings in exactly one
   place (`arion-api lib/websiteBuilder/elementorTree.js`), so Elementor's
   spelling is still written down once — just on the way OUT, where the
   translation belongs, rather than in four readers on the way in.

   So: the SHAPE below is stream C's (`ContainerLayout`, the depth guard, the
   tolerant children, `walkTree`), because email, landing and the customer's
   page are all built on it. What it reads is stream A's `style`.

   Two keys are deliberately NOT read here, each because something else already
   owns it: `minHeight` (§11.8's own, per device, emitted for a box by
   `styleBlockFor`) and the section's `width` (how wide the words run). */

/** Elementor's two. `grid` is a box laid out in even tracks. */
export type ContainerType = "flex" | "grid";
/** Which way a flex box runs. */
export type FlexDirection = "row" | "column";

export interface ContainerLayout {
  type: ContainerType;
  /**
   * Meaningful for `type: "flex"`. Column is what a fresh container is.
   *
   * THE BASE DIRECTION, not the stored one: the reference's Direction control
   * has four arrows and `row-reverse` runs across exactly as `row` does. The
   * surfaces that can honour the reversal read `reverse` below; the ones that
   * cannot (a mailbox's tables, a sheet of paper) read this and draw the box
   * the right way round rather than not at all.
   */
  direction: FlexDirection;
  /** True for `row-reverse` and `column-reverse`. */
  reverse: boolean;
  /** Already a CSS value. */
  justify?: string;
  /** Already a CSS value. */
  align?: string;
  /** In px. Row first, the order CSS wants. */
  gap: { row: number; column: number };
  /** Elementor's default is no wrap; the phone stylesheet is what stacks. */
  wrap: "wrap" | "nowrap";
  /** Grid only: how many even tracks. */
  columns: number;
  /** Grid only: how many rows, when the author fixed them. */
  rows?: number;
  /** Grid only: which way an unplaced cell is added. */
  autoFlow?: "row" | "column";
  /** The element a box is drawn as. `div` unless the author said otherwise. */
  tag: string;
}

/** Elementor's own list, and nothing else: a tag from a document is markup. */
const HTML_TAGS = ["div", "header", "footer", "main", "article", "section", "aside"];

const DEFAULT_GAP = 16;

/**
 * HOW DEEP A TREE MAY GO BEFORE THE RENDERER STOPS ASKING — **the editor's own
 * number**, `treeOps.MAX_DEPTH`.
 *
 * It is the guard against a document that points at itself: a hand-edited
 * `children` array containing its own parent would otherwise recurse until the
 * customer's tab died, on a page whose whole job is to be opened by a
 * stranger. Depth is counted, never identity, because a cycle can be longer
 * than one hop.
 *
 * ── WHY IT IS NOT A SECOND NUMBER (V-3's sibling, 2026-09-17) ─────────────
 * It was 12 while `treeOps.MAX_DEPTH` — the limit `insertNode` and `moveNode`
 * actually REFUSE on — was 6: two constants for one idea, in the two halves of
 * the same feature. Six levels is what an author can build, so anything deeper
 * reaching a renderer is by definition not something a person made, and the
 * guard that catches it should fire at the same number the editor enforces.
 * Two numbers means one of them is the wrong one to reason about, and nobody
 * can tell you which without reading both files.
 *
 * The three MIRRORS (`arion`'s Elementor writer excepted, which translates
 * rather than walks) must read the same 6 — `oliver-api lib/builderStyle.js`
 * and `LUMEN-API src/lib/builderStyle.js`. See
 * `overnight-report/D156_CONFORMANCE_HANDOFF_2026-09-17.md`.
 */
export const MAX_CONTAINER_DEPTH = MAX_DEPTH;

/* ONE name for the one kind that holds children, and one test for it. Both
   live in `treeOps.ts`, where the tree itself does; re-exported here because
   every renderer in the platform reads its tree through this module. */
export { isContainer, CONTAINER_KIND };

/**
 * The children of a container, tolerantly.
 *
 * Anything that is not a widget-shaped object is dropped rather than drawn,
 * for the same reason `deserialise` drops junk: a customer's page must not be
 * an exception because somebody hand-edited a row.
 */
export function childrenOf(w: Widget | null | undefined): Widget[] {
  if (!isContainer(w as Node)) return [];
  const raw = (w as any)?.children;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c: any) => c && typeof c === "object" && typeof c.kind === "string") as Widget[];
}

/** One of a list, or undefined. Junk never reaches the page. */
function oneOf(v: unknown, allowed: readonly string[]): string | undefined {
  const s = String(v ?? "").trim();
  return allowed.includes(s) ? s : undefined;
}

/**
 * What the box is, for ONE device.
 *
 * Read off the resolved style layer, so a row that the author made a column on
 * a phone is a column here too — `resolveStyle` is the same cascade the
 * stylesheet uses, and asking it means the email (which has no stylesheet at
 * all) gets the per-device answer the page gets.
 */
export function containerLayout(w: Widget, device: Device = "desktop"): ContainerLayout {
  const layer = resolveStyle(w.style, device);
  const dir = layer.direction;
  const base = baseDirection(dir);
  const column = layer.gap === undefined ? DEFAULT_GAP : Math.max(0, Math.round(layer.gap));
  // THE GAPS CONTROL IS TWO NUMBERS. `rowGap` absent is the linked chain, and
  // the column gap answers for both — which is what one key meant before the
  // row half existed, so every stored document reads exactly as it did.
  const row = layer.rowGap === undefined ? column : Math.max(0, Math.round(layer.rowGap));
  return {
    type: dir === "grid" ? "grid" : "flex",
    direction: base === "row" ? "row" : "column",
    reverse: dir === "row-reverse" || dir === "column-reverse",
    justify: layer.justify ? JUSTIFY_CSS[layer.justify] : undefined,
    align: layer.alignItems ? ITEMS_CSS[layer.alignItems] : undefined,
    gap: { row, column },
    wrap: layer.wrap ? "wrap" : "nowrap",
    columns: Math.max(1, Math.min(6, Math.round(layer.columns ?? 3))),
    ...(layer.rows !== undefined ? { rows: Math.max(1, Math.min(12, Math.round(layer.rows))) } : {}),
    ...(layer.autoFlow ? { autoFlow: layer.autoFlow } : {}),
    tag: oneOf((w.props as any)?.html_tag, HTML_TAGS) ?? "div",
  };
}

/** Which way a box runs, for the class and for the phone rule. */
export function containerFlow(l: ContainerLayout): "row" | "column" | "grid" {
  if (l.type === "grid") return "grid";
  return l.direction === "row" ? "row" : "column";
}

/**
 * The container's display, as declarations, for the surfaces that have NO
 * stylesheet to put them in — the email's tables and the landing page's inline
 * box. The document and the canvas do NOT use this: their boxes are arranged
 * by `styleBlockFor`, per device, which is the one mechanism §11.8 built.
 */
export function containerLayoutCss(l: ContainerLayout): string {
  const out: string[] = [];
  if (l.type === "grid") {
    out.push("display:grid", `grid-template-columns:repeat(${l.columns},minmax(0,1fr))`);
    if (l.rows !== undefined) out.push(`grid-template-rows:repeat(${l.rows},minmax(0,auto))`);
    if (l.autoFlow) out.push(`grid-auto-flow:${l.autoFlow}`);
    if (l.justify) out.push(`justify-items:${l.justify === "flex-start" ? "start" : l.justify === "flex-end" ? "end" : l.justify}`);
    if (l.align) out.push(`align-items:${l.align}`);
  } else {
    out.push("display:flex", `flex-direction:${l.reverse ? `${l.direction}-reverse` : l.direction}`, `flex-wrap:${l.wrap}`);
    if (l.justify) out.push(`justify-content:${l.justify}`);
    if (l.align) out.push(`align-items:${l.align}`);
  }
  out.push(l.gap.row === l.gap.column ? `gap:${l.gap.row}px` : `gap:${l.gap.row}px ${l.gap.column}px`);
  return out.join(";");
}

/**
 * Every widget in a list, containers included, depth first in reading order.
 *
 * The one walk. `sectionStyleTag` needs it to find a styled widget three boxes
 * down, and the customer's page needs it to find the signature block wherever
 * the author put it — two places that each used to flatten `columns` by hand
 * and would each have missed everything nested.
 */
export function walkTree(widgets: Widget[], depth = 0): Array<{ widget: Widget; depth: number }> {
  if (depth > MAX_CONTAINER_DEPTH) return [];
  const out: Array<{ widget: Widget; depth: number }> = [];
  for (const w of widgets || []) {
    out.push({ widget: w, depth });
    if (isContainer(w as Node)) out.push(...walkTree(childrenOf(w), depth + 1));
  }
  return out;
}

/** Every widget in the document, containers included, in reading order. */
export function walkDocumentTree(doc: BuilderDocument): Widget[] {
  return doc.sections
    .flatMap((s) => s.columns.flatMap((c) => walkTree(c.widgets as Widget[])))
    .map((x) => x.widget);
}

export function renderWidget(w: Widget, ctx: RenderContext, depth = 0): string {
  // A BOX IS DRAWN BEFORE ANYTHING ASKS WHAT KIND IT IS (§11.12, D-156).
  //
  // Before the adapter's `extra`, before the switch: a container is the
  // ENGINE's own node and every builder has the same one, so an adapter cannot
  // be asked to know about it and cannot accidentally claim it.
  if (isContainer(w)) return renderContainer(w, ctx, depth);
  const p: any = w.props || {};
  const body = (() => {
    // The adapter's own widgets first — see RenderContext.extra.
    const own = ctx.extra?.(w, ctx);
    if (own != null) return own;
    /* B-168 §C.1 — THE TEN FAMILIES. One line, first of the registered
       renderers, so a merge with another stream's line is trivial. */
    const fam = renderFamily(w, ctx); if (fam != null) return fam;
    // Then D-156's atomic widgets, each of which lives in one file under
    // widgets/ with its own definition, controls and renderer.
    const atom = renderAtom(w, ctx);
    if (atom != null) return atom;
    switch (w.kind) {
      case "data_table": return dataTable(p, ctx);
      case "heading": return heading(p, ctx);
      case "paragraph": return paras(p.text, ctx, "text");
      case "list": return list(p, ctx);
      case "clauses": return clauses(p, ctx);
      case "signature": return signature(p, ctx);
      case "page_break": return `<div class="bx-pagebreak" aria-hidden="true"></div>`;
      case "image": return image(p, ctx);
      case "spacer": return `<div class="bx-spacer" style="height:${Number(p.height) || 24}px"></div>`;
      case "divider": return `<hr class="bx-divider"/>`;
      case "button": return `<a class="bx-button" style="background:${esc(ctx.accent)}" href="${esc(p.url || "#")}"><span data-edit="label">${t(p.label, ctx)}</span></a>`;
      default:
        // Forward compatible, exactly like migration 166's envelope: a widget
        // from a newer editor is inert here, never an exception on a live
        // customer page.
        return ctx.mode === "edit"
          ? `<div class="bx-unknown">This part (“${esc(w.kind)}”) needs a newer version of the builder to show.</div>`
          : "";
    }
  })();
  // A widget that draws nothing leaves nothing behind in the customer's copy —
  // no empty wrapper, and no class naming a kind this build cannot render.
  if (!body && ctx.mode === "view") return "";
  // A STYLED widget wears a stable class in BOTH modes (§11.8). `data-widget`
  // is an editor marker and the customer's copy has none, so a rule keyed on
  // it would style the canvas and not the document — which is the class of
  // defect one renderer exists to prevent. Nothing is added to an unstyled
  // widget, so a document nobody has touched is byte-identical.
  const sy = hasStyle(w.style) ? ` ${widgetStyleClass(w.id)}` : "";
  /* ADVANCED ▸ ATTRIBUTES (§11.13.1). The author's own id and classes, read
     through the ONE reader in style.ts so the page, the mailbox and the
     hosted page cannot disagree about what they typed. Empty on an untouched
     widget, so every golden is byte for byte what it was. */
  const a = attributeAttrs(w.style);
  const attr = {
    id: a.id ? ` id="${esc(a.id)}"` : "",
    cls: a.classes.length ? ` ${a.classes.map(esc).join(" ")}` : "",
  };
  return ctx.mode === "edit"
    ? `<div class="bx-w bx-w-${esc(w.kind)}${sy}${attr.cls}"${attr.id} data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}">${body}</div>`
    : `<div class="bx-w bx-w-${esc(w.kind)}${sy}${attr.cls}"${attr.id}>${body}</div>`;
}

/**
 * A CONTAINER — the box, and everything in it (§11.12, D-156).
 *
 * Brandon's sentence made flesh: "Header, drag that into this box and it's now
 * its own section inside the box, then a text field under it … then cards."
 * This is what draws that box, and it is RECURSIVE, so the cards inside the row
 * inside the box are drawn by exactly the same code as the heading at the top
 * of the page.
 *
 * `data-bx-host` is the one thing the EDITOR needs from it: the canvas reads it
 * to answer "which box is the pointer over", and the SAME attribute is on a
 * column (see `renderSection`). One placement rule at every depth, because
 * there is one kind of drop target and it is spelled the same way everywhere.
 *
 * Edit mode ONLY, exactly like `data-widget`: the customer's copy carries no
 * editor markers, so a document that has never been styled renders today what
 * it rendered before boxes existed, byte for byte. The golden in
 * `builder-styling.test.mjs` is what holds that.
 *
 * An EMPTY box is not nothing: the author has just dropped it and is about to
 * put something in it, so in edit mode it keeps a least height and says so. In
 * the customer's copy an empty box draws nothing at all.
 */
function renderContainer(c: Container, ctx: RenderContext, depth = 0): string {
  // THE DEPTH GUARD (stream C). A hand-edited `children` array that points back
  // at its own parent would otherwise recurse until the tab died, on a page
  // whose whole job is to be opened by a stranger. Counted, never identity,
  // because a cycle can be longer than one hop.
  if (depth >= MAX_CONTAINER_DEPTH) {
    return ctx.mode === "edit"
      ? `<div class="bx-unknown">This box is nested too deeply to draw.</div>`
      : "";
  }
  let kids = childrenOf(c).map((k) => renderWidget(k, ctx, depth + 1)).join("");
  if (!kids && ctx.mode !== "edit") return "";
  // An EMPTY box is a target, and it says so in words rather than only with a
  // dashed edge — the same sentence the landing page's box uses.
  if (!kids) kids = `<div class="bx-boxdrop">Drag anything in here.</div>`;
  const sy = hasStyle(c.style) ? ` ${widgetStyleClass(c.id)}` : "";
  const empty = childrenOf(c).length ? "" : " bx-box-empty";
  // The flow class is what the phone rule and the child-width rule key on. It
  // is the ONLY thing the renderer writes about the layout — the declarations
  // themselves come from the section's own stylesheet, per device (§11.8).
  const flow = ` bx-box-${containerFlow(containerLayout(c))}`;
  const editor = ctx.mode === "edit"
    ? ` data-bx-host="${esc(c.id)}" data-widget="${esc(c.id)}" data-kind="${esc(CONTAINER_KIND)}"`
    : "";
  const tag = containerLayout(c).tag;
  /* SHAPE DIVIDERS (B-168, F0) — the Style tab's fourth section. Markup and
     not CSS, because a shape is an SVG; drawn by `style.shapeDividerHtml`, the
     ONE place the eighteen paths live, so the canvas and the customer's copy
     cannot draw two different waves. The desktop layer is what they read: the
     reference's height and width are per device but the SHAPE is not, and a
     divider that changed shape on a phone is not something anybody asked for.
     A surface that cannot draw SVG (a mailbox, the PDF painter) never calls
     this and loses nothing else. */
  const top = shapeDividerHtml(resolveStyle(c.style, "desktop").shapeTop, "top");
  const bottom = shapeDividerHtml(resolveStyle(c.style, "desktop").shapeBottom, "bottom");
  return `<${tag} class="bx-w bx-box${flow}${empty}${sy}" data-box="${esc(c.id)}"${editor}>`
    + `${top}${kids}${bottom}</${tag}>${offerNote(c)}`;
}

/**
 * RULE 1, SAID ON THE PAGE (totals.ts) — once, under a row of options.
 *
 * The sentence used to belong to the `comparison_cards` composite, which held
 * the whole set. A set is a BOX of cards now, so the box says it: a customer
 * looking at three prices side by side has to be told they are choosing one,
 * not being charged for all three, and that is a fact about the SET and not
 * about any one card. One card on its own says nothing — there is no choice to
 * explain — which is also why it is not in `renderCardBody`.
 */
function offerNote(c: Container): string {
  const offers = childrenOf(c).filter((k) => k.kind === "card" || k.kind === "catalog_card").length;
  return offers >= 2
    ? `<p class="bx-smallprint">Comparison only — the plan you choose becomes the priced line. These figures are not added to any total.</p>`
    : "";
}



/** A plain table with a header row. Nothing is added up — see totals.ts. */
function dataTable(p: any, ctx: RenderContext): string {
  const cols: string[] = Array.isArray(p.columns) ? p.columns : [];
  const rs: any[] = Array.isArray(p.rows) ? p.rows : [];
  if (!cols.length && !rs.length) return "";
  const head = cols.length
    ? `<thead><tr style="background:${esc(ctx.accent)}">${cols.map((c, i) => `<th data-edit="columns.${i}">${t(c, ctx)}</th>`).join("")}</tr></thead>` : "";
  const body = rs.map((r, ri) => {
    const cells: string[] = Array.isArray(r) ? r : Array.isArray(r?.cells) ? r.cells : [];
    // data-label carries the column heading INTO the cell, because the phone
    // stylesheet drops the header row and prints it above the value instead.
    // Emitted for every surface, so the customer page, the canvas and a
    // printed copy are one document — see DOCUMENT_CSS's phone block.
    return `<tr>${cells.map((c, ci) => `<td data-label="${esc(cols[ci] ?? "")}" data-edit="rows.${ri}.${Array.isArray(r) ? ci : `cells.${ci}`}">${t(c, ctx)}</td>`).join("")}</tr>`;
  }).join("");
  return `<table class="bx-table">${head}<tbody>${body}</tbody></table>`;
}


function heading(p: any, ctx: RenderContext): string {
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  const tag = `h${level}`;
  return `<${tag} class="bx-h bx-h${level}" style="color:${esc(ctx.accent)}" data-edit="text">${t(p.text, ctx)}</${tag}>`;
}

function list(p: any, ctx: RenderContext): string {
  const items: string[] = Array.isArray(p.items) ? p.items : [];
  if (ctx.mode !== "edit") {
    const shown = items.filter((x) => String(x ?? "").trim());
    if (!shown.length) return "";
    return `<ul class="bx-list">${shown.map((it, i) => `<li data-edit="items.${i}">${t(it, ctx)}</li>`).join("")}</ul>`;
  }
  // One blank line at the end, always, so the list can grow by typing.
  const slots = [...items, ""];
  return `<ul class="bx-list">${slots.map((it, i) =>
    `<li${it ? "" : ` class="bx-slot" data-placeholder="add a point…"`} data-edit="items.${i}">${t(it, ctx)}</li>`).join("")}</ul>`;
}

function clauses(p: any, ctx: RenderContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  const body = items.map((c, i) => `
    <div class="bx-clause">
      <span class="bx-clause-n">${i + 1}.</span>
      <div class="bx-clause-b">
        <div class="bx-clause-t" data-edit="items.${i}.title">${t(c?.title, ctx)}</div>
        ${paras(c?.body, ctx, `items.${i}.body`)}
      </div>
    </div>`).join("");
  return head + `<div class="bx-clauses">${body}</div>`;
}




/* D-165 — SEVEN MORE RENDERERS LIVED HERE AND ARE DELETED, with the widgets
   they drew: `docHeader` (→ a Container holding an Image and a Heading, shipped
   as the "Document header" saved section), `keyFacts` (→ Text Editor rows),
   `testimonial` (→ widgets/boxes.ts, so its definition and its renderer are one
   file), `pricingTable` (→ Product Line Items), `callout` (→ Alert),
   `propertyPlan` (→ Service Location + Text Editor rows) and `locationLine`,
   which only the last of those called. `upgrade.ts` converts every stored one
   on the way in, so nothing signed loses a word.

   `comparisonCards`, `propertyBlock` and the `key_facts` case LIVED HERE and
   are DELETED (D-156, integration). Every read path — `deserialise` in this
   repo and `deserialise` in oliver-api, which are the only two doors a stored
   document comes through — runs the composite → tree upgrade, so no document
   can carry one of those four kinds by the time anything draws it. A renderer
   for a kind nothing can hold is the "still there, just hidden" that §11.12
   exists to end. `keyFacts()` itself STAYS, because `key_value_table` is a
   table widget and always was one.

   `pricedLine` LIVED HERE and is DELETED too (D-156, integration). `priced_line`
   FOLDS INTO `price_line` — one widget, two spellings — and the one that
   survives is the atomic widget in `widgets/priceLine.ts`, which `renderAtom`
   answers for BOTH names. Two renderers for one line is how a canvas and a PDF
   come to show a different figure for the same money. `upgrade.ts` renames
   the kind on the way in, keeping the line's id so its total does not move; the
   old spelling stays in the renderer map for anything that reaches a page
   without passing through `deserialise`. */

/* `totalsBlock` LIVED HERE and is DELETED (D-156 stream B). The total is an
   atomic widget now and draws itself in widgets/totals.ts, where its own tax
   rate, per-cent discount and coupon live. Two renderers for one block is how
   the canvas and the PDF come to disagree about a number. */



function signature(p: any, ctx: RenderContext): string {
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  return `${head}
    ${paras(p.body, ctx, "body")}
    <div class="bx-sign" data-sign="1">
      <div class="bx-sign-box">
        <div class="bx-sign-l">${esc(p.customerLabel || "Customer signature")}</div>
        <div class="bx-sign-line" data-sign-slot="customer">${p.signedName ? `<span class="bx-signed">${esc(p.signedName)}</span>` : ""}</div>
        <div class="bx-sign-meta">${p.signedAt ? esc(p.signedAt) : ""}</div>
      </div>
      <div class="bx-sign-box">
        <div class="bx-sign-l">${esc(p.businessLabel || "For " + (ctx.business.name || "the business"))}</div>
        <div class="bx-sign-line" data-sign-slot="business">${p.counterName ? `<span class="bx-signed">${esc(p.counterName)}</span>` : ""}</div>
        <div class="bx-sign-meta">${p.counterAt ? esc(p.counterAt) : ""}</div>
      </div>
    </div>
    <p class="bx-smallprint" data-edit="consent">${t(p.consent || DEFAULT_CONSENT, ctx)}</p>`;
}

/** The consent statement stored on the signing record. Shown, not hidden. */
export const DEFAULT_CONSENT =
  "By typing my name above I agree to this document and intend my typed name to be my electronic signature.";

function image(p: any, ctx: RenderContext): string {
  if (!p.src) {
    return ctx.mode === "edit" ? `<div class="bx-imgdrop">Choose a picture in the panel on the right.</div>` : "";
  }
  // `width:Npx;max-width:100%` and NOT `max-width:Npx`: an inline max-width
  // beats the stylesheet, so a 900px picture in a 390px document used to push
  // the whole page sideways. The picture is still at most N wide, and never
  // wider than the page it is on.
  const w = p.width ? ` style="width:${Number(p.width)}px;max-width:100%"` : "";
  return `<figure class="bx-figure"><img src="${esc(p.src)}" alt="${esc(p.alt || "")}"${w}/>${
    p.caption ? `<figcaption data-edit="caption">${t(p.caption, ctx)}</figcaption>` : ""}</figure>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sections and the document
   ══════════════════════════════════════════════════════════════════════════ */

export function renderSection(s: Section, ctx: RenderContext): string {
  // An internal section is a note to the crew. It is never in the customer's
  // copy and never in the PDF — one rule, one place.
  if (s.visibility !== "customer" && ctx.mode === "view") return "";

  const number = ctx.numbers[s.id];
  const label = s.numbered && (number || s.label)
    ? `<div class="bx-seclabel" style="color:${esc(ctx.accent)}">${esc([number, s.label].filter(Boolean).join(" · "))}</div>`
    : "";
  // A COLUMN IS A BOX (§11.12): same `data-bx-host`, so the canvas's one
  // placement rule finds it the same way it finds a container three deep.
  // `data-col` stays beside it because the column INDEX is what a legacy
  // `WidgetPath` is made of, and five adapter files still speak that.
  const host = (c: { id: string }) => (ctx.mode === "edit" ? ` data-bx-host="${esc(c.id)}"` : "");
  const cols = s.columns.map((c, i) => `
    <div class="bx-col${hasStyle(c.style) ? ` ${widgetStyleClass(c.id)}` : ""}" data-col="${i}"${host(c)}>${
    c.widgets.map((w) => renderWidget(w, ctx)).join("")}</div>`).join("");

  // THE SECTION'S PADDING, and which of the two owns it (§11.8).
  //
  // `padding: Npx 40px` has been written into the HTML since the first
  // version and DOCUMENT_CSS's phone block reaches it with `!important`. The
  // four-sided `style.padding` REPLACES it when the author has set one, and is
  // then emitted in the stylesheet below with everything else — two places
  // writing the same property is how a control stops working. Absent, nothing
  // changes and the old string is written exactly as before.
  const ownPadding = sidesToCss(resolveStyle(s.style, "desktop").padding);
  const style = [
    s.background ? `background:${esc(s.background)}` : "",
    ownPadding ? "" : `padding:${Number(s.padding) || 0}px 40px`,
    s.theme === "dark" ? "color:#FFFFFF" : "",
    // A section's own heading font, when it has one. Set as the SAME variable
    // the document sets, so one rule draws both and a section with no font of
    // its own simply inherits.
    s.headingFont ? `--bx-head:${esc(s.headingFont)}` : "",
  ].filter(Boolean).join(";");

  // A revision's badge. `changed` is absent on every document that is not a
  // revision, so a normal proposal renders byte-identically to before.
  const change = ctx.changed?.[s.id];
  const changeBadge = change
    ? `<div class="bx-chg bx-chg-${change}" data-change="${change}">${change === "added" ? "New" : "Changed"}</div>`
    : "";

  return `<section class="bx-sec bx-w-${s.width} bx-cols-${s.layout} bx-theme-${s.theme}${s.pageBreakBefore ? " bx-break" : ""}${
    s.visibility === "internal" ? " bx-internal" : ""}${change ? " bx-changed" : ""}" data-section="${esc(s.id)}" style="${style}">
    ${sectionStyleTag(s)}${s.recommended ? `<div class="bx-rec" style="background:${esc(ctx.accent)}">Recommended</div>` : ""}
    ${changeBadge}
    ${label}
    <div class="bx-grid">${cols}</div>
  </section>`;
}

/**
 * The `<style>` block for this section and everything styled inside it.
 *
 * INSIDE the section and not appended to DOCUMENT_CSS, because the canvas
 * paints one section at a time (`Canvas.tsx` sets `host.innerHTML` per
 * section) and a per-document sheet would simply not reach it — the author
 * would style a widget and see nothing. Emitted only when something is
 * actually styled, so an untouched document gets no block at all.
 *
 * Rules and not inline declarations: typography has to reach the heading
 * INSIDE the widget, and `.bx-h1 { font-size: 26px }` beats anything a wrapper
 * could hand down. See style.ts.
 */
function sectionStyleTag(s: Section): string {
  // THE WHOLE TREE (§11.12), boxes and the columns themselves included. A flat
  // pass over the top of each column would have styled the box and silently
  // dropped every rule belonging to anything inside it — which is exactly what
  // "the padding control does nothing" looks like from the author's chair.
  const styled: Array<{ selector: string; style: any; typographic: boolean; container?: boolean }> = [];
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      const box = isContainer(n);
      if (hasStyle(n.style)) {
        styled.push({
          selector: `.${widgetStyleClass(n.id)}`,
          style: n.style!,
          typographic: !box && isTypographic(n.kind),
          ...(box ? { container: true } : {}),
        });
      }
      if (box) visit((n as Container).children || []);
    }
  };
  for (const c of s.columns) {
    if (hasStyle(c.style)) {
      styled.push({ selector: `.${widgetStyleClass(c.id)}`, style: c.style!, typographic: false, container: true });
    }
    visit(c.widgets);
  }
  const widgets = styled;
  if (!hasStyle(s.style) && !widgets.length) return "";
  const css = styleBlockFor({
    sectionSelector: `.bx-sec[data-section="${esc(s.id)}"]`,
    gridSelector: `.bx-sec[data-section="${esc(s.id)}"] > .bx-grid`,
    layout: s.layout,
    sectionStyle: s.style,
    widgets,
    sectionPadding: true,
  });
  return css ? `<style>${css}</style>` : "";
}

export function renderDocument(doc: BuilderDocument, ctx: RenderContext): string {
  return `<article class="bx-doc bx-style-${esc(doc.settings.style || "plain")}" style="--bx-accent:${esc(ctx.accent)};--bx-head:${esc(ctx.headingFont)};--bx-body:${esc(ctx.bodyFont)}">${
    doc.sections.map((s) => renderSection(s, ctx)).join("")}</article>`;
}

/**
 * The stylesheet the rendered HTML needs.
 *
 * It travels WITH the renderer so the customer page, the editor canvas and
 * anything that prints the HTML cannot show three different documents. Exported
 * as a string rather than a .css file for exactly that reason — a stylesheet a
 * consumer has to remember to import is a stylesheet a consumer will forget.
 */
export const DOCUMENT_CSS = `
/* The container every rule below asks about. See responsive.ts: the canvas's
   phone preview is a 390px sheet inside a 1600px window, so a media query
   there is always false and the preview would lie. */
.bx-doc { font-family: var(--bx-body, Inter), system-ui, sans-serif; color: #0B1C24; font-size: 13px; line-height: 1.55; background: #FFFFFF; ${CONTAINER_ROOT_CSS} }
.bx-sec { position: relative; }
.bx-sec.bx-internal { outline: 2px dashed #F59E0B; outline-offset: -2px; }
.bx-grid { display: grid; gap: 24px; }
.bx-cols-2 .bx-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
.bx-cols-3 .bx-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
.bx-w-narrow .bx-grid { max-width: 520px; margin: 0 auto; }
.bx-w-contained .bx-grid { max-width: 700px; margin: 0 auto; }

/* A BOX (§11.12, D-156). Nothing but a block until the author lays it out —
   containerLayoutDeclarations() writes the flex or the grid into the section's
   own stylesheet, and a box nobody has touched must not change the spacing of
   a document that was written before boxes existed.
   The empty one is the exception: in the editor it has to be a target you can
   see and drop into, and .bx-box-empty is only ever emitted in edit mode. */
.bx-box { display: block; }
.bx-box > .bx-w:last-child { margin-bottom: 0; }
.bx-box-empty { min-height: 64px; border: 1px dashed #CBD5E1; border-radius: 8px; }
/* A row's children share the width rather than each demanding their own. */
.bx-box > .bx-w { min-width: 0; }
.bx-box-row > .bx-w, .bx-box-grid > .bx-w { flex: 1 1 0; min-width: 0; }
.bx-boxdrop { flex: 1 1 100%; padding: 14px; text-align: center; color: #94A3B8; font-size: 11px; }
.bx-rec { position: absolute; top: 8px; right: 12px; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-radius: 999px; padding: 2px 9px; }
.bx-changed { box-shadow: inset 3px 0 0 #B45309; }
.bx-chg { position: absolute; top: 8px; left: 12px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-radius: 999px; padding: 2px 9px; background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
.bx-chg-added { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
.bx-seclabel { font-size: 11px; letter-spacing: .12em; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
.bx-h { font-family: var(--bx-head, Inter), system-ui, sans-serif; margin: 0 0 8px; line-height: 1.25; }
.bx-h1 { font-size: 26px; font-weight: 700; } .bx-h2 { font-size: 15px; font-weight: 700; } .bx-h3 { font-size: 13px; font-weight: 700; }
.bx-p { margin: 0 0 8px; } .bx-p:last-child { margin-bottom: 0; }
.bx-prose > .bx-p:last-child { margin-bottom: 0; }
.bx-empty { min-height: 1.4em; color: #94A3B8; }
.bx-empty:empty::before { content: attr(data-placeholder); color: #94A3B8; }
/* AN UNFILLED MERGE FIELD, on the author's screen only. Never in a customer's
   copy: tokenChips runs in edit mode and nowhere else. */
.bx-tok { background: #FEF3C7; border-bottom: 1px dashed #B45309; border-radius: 3px;
  padding: 0 3px; color: #7C2D12; cursor: pointer; }
.bx-tok:hover { background: #FDE68A; }
.bx-slot:empty::before { content: attr(data-placeholder); color: #CBD5E1; }
.bx-slot:empty { min-width: 60px; display: inline-block; }
.bx-list { margin: 0 0 8px; padding-left: 18px; } .bx-list li { margin-bottom: 3px; }
.bx-band { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 40px; color: #fff; margin: -24px -40px 20px; }
.bx-rule { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid; margin-bottom: 18px; }
.bx-band-l { display: flex; align-items: center; gap: 12px; }
.bx-band-name { font-size: 14px; font-weight: 700; } .bx-band-sub { font-size: 11px; opacity: .75; }
.bx-band-r { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; opacity: .8; }
.bx-logo { width: 40px; height: 40px; border-radius: 8px; object-fit: contain; background: #fff; }
.bx-logo-text { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #0B1C24; }
.bx-title { font-size: 26px; font-weight: 700; letter-spacing: .02em; margin: 0 0 6px; }
.bx-subtitle { color: #5A7A8A; margin: 0; }
.bx-facts { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0 24px; }
.bx-fact { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #E2E8F0; }
.bx-fact-l { color: #5A7A8A; } .bx-fact-v { font-weight: 600; text-align: right; }
.bx-clauses { display: grid; gap: 10px; }
.bx-clause { display: flex; gap: 10px; }
.bx-clause-n { font-weight: 700; color: #5A7A8A; min-width: 22px; }
.bx-clause-t { font-weight: 700; margin-bottom: 2px; }
.bx-table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 6px 0 10px; }
.bx-table th { text-align: left; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #fff; padding: 7px 10px; }
.bx-table td { padding: 7px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
.bx-table tbody tr:nth-child(even) td { background: #F8FAFC; }
.bx-table-plain tbody tr:nth-child(even) td { background: transparent; }
.bx-right { text-align: right; } .bx-strong { font-weight: 600; }
.bx-panels { display: grid; gap: 14px; } .bx-panels-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
.bx-panel { border-radius: 8px; padding: 10px 12px; background: #F2F6F9; }
.bx-panel-warn { background: #FEF3E8; }
.bx-panel-t { font-weight: 700; margin-bottom: 3px; }
.bx-cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.bx-card { position: relative; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; background: #fff; }
.bx-card-rec { border-width: 2px; }
.bx-card-badge { position: absolute; top: -10px; left: 16px; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-radius: 999px; padding: 2px 9px; }
.bx-card-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.bx-card-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
.bx-was { text-decoration: line-through; color: #94A3B8; } .bx-now { font-size: 18px; font-weight: 700; } .bx-per { color: #5A7A8A; font-size: 11px; }
/* The price is the number the customer pays. An empty one has to be as easy to
   hit as the "was" beside it — see D-01. */
.bx-now-slot:empty { min-width: 90px; }
.bx-card-pitch { color: #5A7A8A; margin-bottom: 8px; }
.bx-card-feats { margin: 0; padding-left: 16px; } .bx-card-feats li { margin-bottom: 3px; }
.bx-card-note { margin-top: 8px; font-size: 11px; color: #5A7A8A; }
.bx-priced { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.bx-priced-rec { border-color: var(--bx-accent, #0C4A60); }
.bx-priced-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 4px; }
.bx-priced-name { font-weight: 700; } .bx-priced-amt { font-weight: 700; white-space: nowrap; }
.bx-totals { display: grid; gap: 4px; }
.bx-total-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #E2E8F0; }
.bx-total-grand { border-bottom: none; border-top: 2px solid; margin-top: 4px; padding-top: 8px; font-weight: 700; font-size: 15px; }
.bx-plan { display: grid; gap: 0; }
.bx-plan-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #E2E8F0; }
.bx-plan-l { color: #5A7A8A; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; font-weight: 700; }
.bx-plan-v { text-align: right; flex: 1; }
.bx-site { margin-bottom: 14px; }
.bx-site-head { border-left: 3px solid; padding-left: 10px; margin-bottom: 6px; }
.bx-site-name { font-weight: 700; font-size: 14px; } .bx-site-addr { color: #5A7A8A; font-size: 11px; }
.bx-site-sub { display: flex; justify-content: space-between; padding: 6px 10px; background: #F2F6F9; border-radius: 6px; }
.bx-sign { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 20px; margin: 12px 0; }
.bx-sign-l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #5A7A8A; font-weight: 700; margin-bottom: 4px; }
.bx-sign-line { border-bottom: 1px solid #0B1C24; min-height: 34px; display: flex; align-items: flex-end; padding-bottom: 2px; }
.bx-signed { font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 22px; line-height: 1.1; }
.bx-sign-meta { font-size: 10px; color: #5A7A8A; margin-top: 4px; min-height: 12px; }
.bx-smallprint { font-size: 10px; color: #5A7A8A; margin: 6px 0 0; }
.bx-merge { background: #FFF3E9; border: 1px dashed #EF6C33; color: #9A4318; border-radius: 3px; padding: 0 4px; font-weight: 600; }
.bx-divider { border: none; border-top: 1px solid #E2E8F0; margin: 12px 0; }
.bx-pagebreak { border-top: 1px dashed #A8CDD8; margin: 12px 0; }
.bx-figure { margin: 0; } .bx-figure img { max-width: 100%; } .bx-figure figcaption { font-size: 11px; color: #5A7A8A; margin-top: 4px; }
.bx-imgdrop { border: 1px dashed #CBD5E1; border-radius: 8px; padding: 18px; text-align: center; color: #94A3B8; }
.bx-button { display: inline-block; color: #fff; border-radius: 6px; padding: 9px 16px; font-weight: 600; text-decoration: none; }
.bx-quote { margin: 0 0 10px; padding: 12px 14px; border-left: 3px solid var(--bx-accent, #0C4A60); background: #F8FAFC; }
.bx-stars { font-size: 12px; letter-spacing: 2px; }
.bx-attrib { font-size: 11px; color: #5A7A8A; margin-top: 4px; }
.bx-unknown { border: 1px dashed #CBD5E1; border-radius: 6px; padding: 10px; color: #94A3B8; font-size: 11px; }

/* ── D-165's standard widgets ──────────────────────────────────────────────
   Only what the renderer does NOT already write inline. A widget whose whole
   look is one author-set colour writes it on the element, because the author
   can change it; a widget whose look is the same on every page is a rule here,
   because a rule is one place. */
.bx-iconbox-body > .bx-h { margin-bottom: 4px; }
.bx-imagebox-body > .bx-h { margin-bottom: 4px; }
.bx-alert-t { font-weight: 700; margin-bottom: 3px; }
.bx-alert-b .bx-p:last-child { margin-bottom: 0; }
.bx-quote-b .bx-p:last-child { margin-bottom: 0; }
.bx-attrib-n { font-weight: 600; }
.bx-attrib-j { color: #5A7A8A; }
.bx-rating-t { margin-right: 8px; }
.bx-counter-t { color: #5A7A8A; font-size: 11px; }
.bx-progress-t { font-weight: 600; margin-bottom: 4px; }
.bx-tab-h { cursor: default; }
.bx-acc-item:last-child { margin-bottom: 0; }
.bx-acc-body .bx-p:last-child { margin-bottom: 0; }
.bx-social-empty, .bx-shortcode { font-size: 11px; color: #94A3B8; }
.bx-post-l { font-size: 11px; font-weight: 600; text-decoration: none; }
.bx-emailfoot-a, .bx-emailfoot-n { margin: 2px 0; }
.bx-form-f:last-of-type { margin-bottom: 12px; }
@media print { .bx-break { break-before: page; } .bx-internal { display: none; } }

/* ── THE PHONE ─────────────────────────────────────────────────────────────
   Customers open a proposal to SIGN it on a phone, so this is not a courtesy
   pass. Every rule here answers one of three failures at 390px: a grid that
   keeps its columns, a table that pushes the page sideways, or a padding
   written in the HTML that eats 80 of the 390.

   A CONTAINER query, not a media query — see responsive.ts. The same
   stylesheet is therefore true on the customer's phone AND in the builder's
   phone preview, which is the whole point of one renderer. */
${STACK_QUERY} {
  /* 1. Everything laid out in columns becomes one column. */
  .bx-cols-2 .bx-grid, .bx-cols-3 .bx-grid { grid-template-columns: 1fr; }
  /* A ROW STACKS ON A PHONE, exactly as the section's columns do — three cards
     side by side in a 390px window are three unreadable slivers.
     !important because the box's own desktop rule is written into the
     section's stylesheet, which comes LATER in source order and would otherwise
     win here. An author who has said something else FOR PHONES still wins: that
     override is !important too and later again. */
  .bx-box-row { flex-direction: column !important; }
  .bx-box-grid { grid-template-columns: 1fr !important; }
  .bx-panels, .bx-panels-2, .bx-sign, .bx-facts, .bx-cards { grid-template-columns: 1fr; }
  .bx-grid { gap: 16px; }
  .bx-w-narrow .bx-grid, .bx-w-contained .bx-grid { max-width: none; }

  /* 2. The section's 40px side padding is written INTO the HTML by
        renderSection, so only !important can reach it. 20px each side leaves
        350 of a 390px phone for the document itself. */
  .bx-sec { padding-left: 20px !important; padding-right: 20px !important; }
  .bx-band { margin-left: -20px; margin-right: -20px; padding-left: 20px; padding-right: 20px; flex-wrap: wrap; }

  /* 3. TABLES STACK. A pricing schedule is four columns; at 390px the choice
        is a sideways scrollbar or label-above-value rows, and a customer who
        has to scroll sideways to read a price does not sign. Every cell the
        renderer emits carries data-label, so the header row can go. */
  .bx-table, .bx-table thead, .bx-table tbody, .bx-table tr, .bx-table th, .bx-table td { display: block; width: auto; }
  .bx-table thead { display: none; }
  .bx-table { margin: 6px 0 12px; }
  .bx-table tr { border-bottom: 1px solid #E2E8F0; padding: 8px 0; }
  .bx-table tbody tr:nth-child(even) td { background: transparent; }
  .bx-table td { border-bottom: none; padding: 2px 0; text-align: left; }
  .bx-table td.bx-right { text-align: left; }
  .bx-table td[data-label]::before { content: attr(data-label); display: block; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #5A7A8A; font-weight: 700; }

  /* 3b. D-165's own two-up widgets stack too. An icon beside its words is a
        picture of a row; at 390px it is two slivers. */
  .bx-iconbox, .bx-imagebox, .bx-business { flex-direction: column !important; }
  .bx-carousel > img { min-width: 60% !important; }
  .bx-gallery { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }

  /* 4. Two-up rows that are flex, not grid. */
  .bx-priced-head, .bx-site-sub, .bx-total-row, .bx-fact { flex-wrap: wrap; }
  .bx-plan-row { flex-wrap: wrap; gap: 0; }
  .bx-plan-v { text-align: left; flex: 1 1 100%; }

  /* 5. Nothing may be wider than the page. */
  .bx-doc img, .bx-figure img { max-width: 100%; height: auto; }
  .bx-h1, .bx-title { font-size: 22px; }
}
`;
