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
  hasStyle, sidesToCss, styleBlockFor, isTypographic, widgetStyleClass, resolveStyle,
  layerFor, sectionBoxDeclarations, type ElementStyle,
} from "./style";
import { sectionNumbers } from "./model";
import { fill, type MergeContext } from "./merge";
import { documentTotals, money, type DocumentTotals } from "./totals";
import { CONTAINER_ROOT_CSS, STACK_QUERY, deviceContainerQuery } from "./responsive";

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

/**
 * ONE LINE OF THE PRODUCT CATALOGUE, as a renderer needs it.
 *
 * Handed in, never fetched: a renderer that could call an API would be a
 * renderer no test could drive and a customer's page that could be slow. The
 * adapter reads the catalogue once and puts it here — see `product_card`.
 */
export interface CatalogueItemLite {
  id: string;
  name?: string | null;
  description?: string | null;
  price?: string | null;
  cadence?: string | null;
  inclusions?: string[];
  tiers?: Array<{ id: string; name?: string | null; price?: string | null; cadence?: string | null; inclusions?: string[] }>;
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
  /**
   * The business's own products and services, by id (D-156).
   *
   * `product_card` draws its price, cadence and inclusions from here, so a
   * plan re-priced this morning is re-priced on every page that draws it.
   * Absent on every surface that has no catalogue, and a card then falls back
   * to the snapshot stored on the widget rather than drawing nothing.
   */
  catalogue?: Record<string, CatalogueItemLite>;
  /** Computed once by the caller and handed in — see totals.ts. */
  totals: DocumentTotals;
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
    ...(partial.catalogue ? { catalogue: partial.catalogue } : {}),
    totals: partial.totals ?? documentTotals(doc),
    numbers: partial.numbers ?? sectionNumbers(doc),
    extra: partial.extra,
    ...(partial.changed ? { changed: partial.changed } : {}),
  };
}

/** Merge-fill, then escape. Never the other way round. */
function t(text: unknown, ctx: RenderContext): string {
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

/** Plain text with blank lines between paragraphs → <p> runs. */
function paras(text: unknown, ctx: RenderContext, editPath?: string): string {
  const filled = fill(String(text ?? ""), ctx.merge, ctx.mode);
  const attr = editPath ? ` data-edit="${esc(editPath)}"` : "";
  if (!filled.trim()) {
    return ctx.mode === "edit"
      ? `<p class="bx-p bx-empty"${attr} data-placeholder="Type here…"></p>`
      : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => tokenChips(esc(p.trim()), ctx).replace(/\n/g, "<br/>"));
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
  "doc_header", "key_facts", "heading", "paragraph", "list", "clauses",
  "pricing_table", "callout", "comparison_cards", "priced_line", "totals",
  "property_plan", "property_block", "signature", "page_break", "image",
  "spacer", "divider", "key_value_table", "data_table", "testimonial",
  "footer_note", "merge_field", "button",
  // D-156, the atomic widgets and the box that holds them. `priced_line` above
  // is what `price_line` folds into — ONE renderer, two spellings, because a
  // stored document written before the rename must print the same page.
  "container", "card", "product_card", "price_line", "address_block", "key_fact",
] as const;

/**
 * Widget kinds that are deliberately NOT drawn.
 *
 * `columns` is an ACTION, not a thing on the page: choosing it sets the
 * section's column count and the section toolbar owns it from then on. It is
 * listed here so the "offered but not rendered" test can tell a deliberate
 * omission from a forgotten one.
 */
export const UNRENDERED_KINDS = ["columns"] as const;

/* ══════════════════════════════════════════════════════════════════════════
   THE TREE (D-156)
   ══════════════════════════════════════════════════════════════════════════

   Brandon, walking "Choose your plan": "Header, drag that into this box and
   it's now its own section inside the box, then a text field under it with
   Pick One, then cards…". That is a CONTAINER holding a heading, a paragraph
   and a row of cards — and until D-156 the model could not say it: a column
   held widgets and a widget held nothing, so the five money widgets hid a
   heading, an intro and three cards inside one box nobody could take apart.

   A container is a WIDGET whose children are widgets. That is the whole
   change here: `Section` stays the depth-0 container and `Column` stays a
   container with layout=column, so every stored document is the document it
   was, and a box inside a column is one more widget in the same list.

     section ── column ── widget
                          └─ container ── widget
                                          └─ container ── …

   ONE reader, used by every surface in this repo and mirrored byte for byte
   by LUMEN-API's builderStyle.js: what a container IS must not be answered
   twice.
*/

/** The one kind that holds children. */
export const CONTAINER_KIND = "container";

/* ── ELEMENTOR'S OWN VOCABULARY, and why it is not ours ───────────────────
   BUILDER_WIDGET_CATALOG_2026-09-17 (machine-extracted from a running
   Elementor 4.2.4) is the contract for container shape, and D-157's reason is
   the whole point: "our website builder needs to then convert to elementor".
   A container whose keys were called `direction` and `gap` would need a
   translation table between our tree and the one ARION publishes, and a
   translation table is a second place for the answer to be wrong.

   So the keys ARE Elementor's, spelled as the machine file spells them, and
   the VALUES are Elementor's own option values — which happen to be CSS
   values already (`flex-start`, `space-between`, `stretch`), so there is no
   mapping table anywhere in this file.

   Two things Elementor also has that we deliberately do NOT read here:
     · `min_height` — §11.8's `style.minHeight` already owns it, per device,
       and is already emitted for a box by `containerStyleCss`;
     · `content_width` — the SECTION's `width` (full / contained / narrow)
       already owns how wide the words run.
   Both are one mechanism each, and a second control that set the same
   property is the defect this whole scope exists to delete. */

/** `container_type`: flex or grid. Elementor's two. */
export type ContainerType = "flex" | "grid";
/** `flex_direction`, with Elementor's four options. */
export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";

export interface ContainerLayout {
  type: ContainerType;
  /** Meaningful for `type: "flex"`. Column is what a fresh container is. */
  direction: FlexDirection;
  /** `flex_justify_content` / `grid_justify_items` — already a CSS value. */
  justify?: string;
  /** `flex_align_items` / `grid_align_items` — already a CSS value. */
  align?: string;
  /** `flex_gap` / `grid_gaps`, in px. Row first, the order CSS wants. */
  gap: { row: number; column: number };
  /** `flex_wrap`. Elementor's default is no wrap; the phone stylesheet is
   *  what stacks a row, so this is faithful AND safe at 390px. */
  wrap: "wrap" | "nowrap";
  /** `grid_columns_grid`, in `fr` tracks. */
  columns: number;
  /** `html_tag`, from Elementor's own list. `div` when it says nothing. */
  tag: string;
}

const FLEX_DIRECTIONS: readonly FlexDirection[] = ["row", "column", "row-reverse", "column-reverse"];
const FLEX_JUSTIFY = ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"];
const FLEX_ALIGN = ["flex-start", "center", "flex-end", "stretch"];
const GRID_PLACE = ["start", "center", "end", "stretch"];
/** Elementor's own list, and nothing else: a tag from a document is markup. */
const HTML_TAGS = ["div", "header", "footer", "main", "article", "section", "aside"];

const DEFAULT_GAP = 16;

/**
 * HOW DEEP A TREE MAY GO BEFORE THE RENDERER STOPS ASKING.
 *
 * Not a limit on what an author may build — twelve levels is far past anything
 * a page needs. It is the guard against a document that points at itself: a
 * hand-edited `children` array containing its own parent would otherwise
 * recurse until the customer's tab died, on a page whose whole job is to be
 * opened by a stranger. Depth is counted, never identity, because a cycle can
 * be longer than one hop.
 */
export const MAX_CONTAINER_DEPTH = 12;

export function isContainer(w: Widget | null | undefined): boolean {
  return !!w && w.kind === CONTAINER_KIND;
}

/**
 * The children of a container, tolerantly.
 *
 * Anything that is not a widget-shaped object is dropped rather than drawn,
 * for the same reason `deserialise` drops junk: a customer's page must not be
 * an exception because somebody hand-edited a row.
 */
export function childrenOf(w: Widget | null | undefined): Widget[] {
  if (!isContainer(w)) return [];
  const raw = (w!.props as any)?.children;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c: any) => c && typeof c === "object" && typeof c.kind === "string") as Widget[];
}

/** One of a list, or undefined. Junk never reaches the page. */
function oneOf(v: unknown, allowed: readonly string[]): string | undefined {
  const s = String(v ?? "").trim();
  return allowed.includes(s) ? s : undefined;
}

/**
 * Elementor's `gaps` control: `{ column, row, isLinked, unit }`.
 *
 * Only px is honoured. An author can type `2em` into Elementor and a mailbox
 * would have no idea what that is, so a unit this renderer cannot carry to
 * every surface falls back to the default rather than being half-drawn on one.
 */
function readGaps(v: any): { row: number; column: number } {
  if (!v || typeof v !== "object") return { row: DEFAULT_GAP, column: DEFAULT_GAP };
  if (v.unit && String(v.unit) !== "px") return { row: DEFAULT_GAP, column: DEFAULT_GAP };
  const n = (x: unknown, fallback: number) => {
    const num = Number(x);
    return Number.isFinite(num) && String(x ?? "").trim() !== "" ? Math.max(0, num) : fallback;
  };
  const row = n(v.row, DEFAULT_GAP);
  return { row, column: v.isLinked === false ? n(v.column, DEFAULT_GAP) : n(v.column, row) };
}

/** What the box is, read in Elementor's words. */
export function containerLayout(w: Widget): ContainerLayout {
  const p: any = w.props || {};
  const type: ContainerType = String(p.container_type ?? "") === "grid" ? "grid" : "flex";
  const grid = type === "grid";
  const size = Number(p.grid_columns_grid?.size);
  return {
    type,
    direction: (oneOf(p.flex_direction, FLEX_DIRECTIONS) as FlexDirection) ?? "column",
    justify: grid ? oneOf(p.grid_justify_items, GRID_PLACE) : oneOf(p.flex_justify_content, FLEX_JUSTIFY),
    align: grid ? oneOf(p.grid_align_items, GRID_PLACE) : oneOf(p.flex_align_items, FLEX_ALIGN),
    gap: readGaps(grid ? p.grid_gaps : p.flex_gap),
    wrap: String(p.flex_wrap ?? "") === "wrap" ? "wrap" : "nowrap",
    columns: Number.isFinite(size) ? Math.max(1, Math.min(6, Math.round(size))) : 3,
    tag: oneOf(p.html_tag, HTML_TAGS) ?? "div",
  };
}

/** Which way a FLEX box runs, for the class and for the phone rule. */
export function containerFlow(l: ContainerLayout): "row" | "column" | "grid" {
  if (l.type === "grid") return "grid";
  return l.direction.startsWith("row") ? "row" : "column";
}

/** The container's display, as declarations. Inline, because it is per box. */
export function containerLayoutCss(l: ContainerLayout): string {
  const out: string[] = [];
  if (l.type === "grid") {
    out.push("display:grid", `grid-template-columns:repeat(${l.columns},minmax(0,1fr))`);
    if (l.justify) out.push(`justify-items:${l.justify}`);
    if (l.align) out.push(`align-items:${l.align}`);
  } else {
    out.push("display:flex", `flex-direction:${l.direction}`, `flex-wrap:${l.wrap}`);
    if (l.justify) out.push(`justify-content:${l.justify}`);
    if (l.align) out.push(`align-items:${l.align}`);
  }
  // Row gap then column gap, which is the order the shorthand takes.
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
    if (isContainer(w)) out.push(...walkTree(childrenOf(w), depth + 1));
  }
  return out;
}

/** Every widget in the document, containers included, in reading order. */
export function walkDocumentTree(doc: BuilderDocument): Widget[] {
  return doc.sections
    .flatMap((s) => s.columns.flatMap((c) => walkTree(c.widgets)))
    .map((x) => x.widget);
}

export function renderWidget(w: Widget, ctx: RenderContext, depth = 0): string {
  const p: any = w.props || {};
  const body = (() => {
    // The adapter's own widgets first — see RenderContext.extra.
    const own = ctx.extra?.(w, ctx);
    if (own != null) return own;
    switch (w.kind) {
      case "container": return container(w, ctx, depth);
      case "card": return card(cardFields(p, ctx), ctx, "");
      case "product_card": return card(productCardFields(p, ctx), ctx, "");
      case "price_line": return pricedLine(p, ctx);
      case "address_block": return addressBlock(p, ctx);
      case "key_fact": return keyFact(p, ctx);
      case "doc_header": return docHeader(p, ctx);
      case "key_facts": return keyFacts(p, ctx);
      case "key_value_table": return keyFacts({ ...p, auto: false }, ctx);
      case "data_table": return dataTable(p, ctx);
      case "testimonial": return testimonial(p, ctx);
      case "heading": return heading(p, ctx);
      case "paragraph": return paras(p.text, ctx, "text");
      case "list": return list(p, ctx);
      case "clauses": return clauses(p, ctx);
      case "pricing_table": return pricingTable(p, ctx);
      case "callout": return callout(p, ctx);
      case "comparison_cards": return comparisonCards(p, ctx);
      case "priced_line": return pricedLine(p, ctx);
      case "totals": return totalsBlock(p, ctx);
      case "property_plan": return propertyPlan(p, ctx);
      case "property_block": return propertyBlock(p, ctx, w.id);
      case "signature": return signature(p, ctx);
      case "page_break": return `<div class="bx-pagebreak" aria-hidden="true"></div>`;
      case "image": return image(p, ctx);
      case "spacer": return `<div class="bx-spacer" style="height:${Number(p.height) || 24}px"></div>`;
      case "divider": return `<hr class="bx-divider"/>`;
      case "footer_note": return p.text || ctx.mode === "edit"
        ? `<p class="bx-smallprint" data-edit="text">${t(p.text, ctx)}</p>` : "";
      case "merge_field": return `<span class="bx-merge">${t(`{{${p.token || ""}}}`, ctx)}</span>`;
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
  return ctx.mode === "edit"
    ? `<div class="bx-w bx-w-${esc(w.kind)}${sy}" data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}">${body}</div>`
    : `<div class="bx-w bx-w-${esc(w.kind)}${sy}">${body}</div>`;
}

function docHeader(p: any, ctx: RenderContext): string {
  const dark = (p.style || "dark_band") === "dark_band";
  const logo = ctx.business.logoUrl
    ? `<img class="bx-logo" src="${esc(ctx.business.logoUrl)}" alt=""/>`
    : `<div class="bx-logo bx-logo-text">${esc((ctx.business.name || "").slice(0, 3).toUpperCase())}</div>`;
  const band = dark
    ? `<div class="bx-band" style="background:${esc(ctx.ink)}">
         <div class="bx-band-l">${logo}<div><div class="bx-band-name">${esc(ctx.business.name)}</div>
           <div class="bx-band-sub">${esc(ctx.business.tagline || "")}</div></div></div>
         <div class="bx-band-r" data-edit="bandRight">${t(p.bandRight || "", ctx)}</div>
       </div>`
    : `<div class="bx-rule" style="border-bottom-color:${esc(ctx.accent)}">
         <div class="bx-band-l">${logo}<div class="bx-band-name">${esc(ctx.business.name)}</div></div>
         <div class="bx-band-r" data-edit="bandRight">${t(p.bandRight || "", ctx)}</div>
       </div>`;
  return `${band}
    <div class="bx-title-wrap">
      <h1 class="bx-title" data-edit="title">${t(p.title, ctx)}</h1>
      ${p.subtitle || ctx.mode === "edit" ? `<p class="bx-subtitle" data-edit="subtitle">${t(p.subtitle, ctx)}</p>` : ""}
    </div>`;
}

function keyFacts(p: any, ctx: RenderContext): string {
  const rows: any[] = Array.isArray(p.rows) ? p.rows : [];
  if (!rows.length && ctx.mode !== "edit") return "";
  const cells = rows.map((r, i) => `
    <div class="bx-fact">
      <span class="bx-fact-l" data-edit="rows.${i}.label">${t(r?.label, ctx)}</span>
      <span class="bx-fact-v" data-edit="rows.${i}.value">${t(r?.value, ctx)}</span>
    </div>`).join("");
  return `<div class="bx-facts">${cells}</div>`;
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

function testimonial(p: any, ctx: RenderContext): string {
  if (!String(p.quote || "").trim() && ctx.mode !== "edit") return "";
  const stars = Math.max(0, Math.min(5, Number(p.rating) || 0));
  return `<blockquote class="bx-quote">
    <p class="bx-p" data-edit="quote">${t(p.quote, ctx)}</p>
    ${stars ? `<div class="bx-stars" style="color:${esc(ctx.accent)}">${"★".repeat(stars)}</div>` : ""}
    <footer class="bx-attrib" data-edit="attribution">${t(p.attribution, ctx)}</footer>
  </blockquote>`;
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

function pricingTable(p: any, ctx: RenderContext): string {
  const rows: any[] = Array.isArray(p.rows) ? p.rows : [];
  const cols = p.columns && typeof p.columns === "object" ? p.columns : { service: true, basis: true, rate: true };
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  const intro = p.intro || ctx.mode === "edit" ? paras(p.intro, ctx, "intro") : "";
  const lService = String(p.labelService || "Service");
  const lBasis = String(p.labelBasis || "Basis");
  const lRate = String(p.labelRate || "Customer rate");
  const th = [
    cols.service !== false ? `<th>${esc(lService)}</th>` : "",
    cols.basis !== false ? `<th>${esc(lBasis)}</th>` : "",
    cols.rate !== false ? `<th class="bx-right">${esc(lRate)}</th>` : "",
  ].join("");
  // Each cell carries its own column heading: at 390px the header row is
  // dropped and the label is printed above the value instead of the customer
  // scrolling the page sideways to find out what a number means.
  const body = rows.map((r, i) => `
    <tr>
      ${cols.service !== false ? `<td class="bx-strong" data-label="${esc(lService)}" data-edit="rows.${i}.name">${t(r?.name, ctx)}</td>` : ""}
      ${cols.basis !== false ? `<td data-label="${esc(lBasis)}" data-edit="rows.${i}.basis">${t(r?.basis, ctx)}</td>` : ""}
      ${cols.rate !== false ? `<td class="bx-right" data-label="${esc(lRate)}" data-edit="rows.${i}.rate">${t(r?.rate, ctx)}</td>` : ""}
    </tr>`).join("");
  // A rate card, deliberately with no total: "$185 per push" does not add up
  // to anything until it snows. See totals.ts rule 1.
  return `${head}${intro}<table class="bx-table"><thead><tr style="background:${esc(ctx.accent)}">${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function callout(p: any, ctx: RenderContext): string {
  const panels: any[] = Array.isArray(p.panels) ? p.panels : [];
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  const body = panels.map((pn, i) => `
    <div class="bx-panel bx-panel-${esc(pn?.tone || "accent")}">
      <div class="bx-panel-t" data-edit="panels.${i}.title">${t(pn?.title, ctx)}</div>
      ${paras(pn?.body, ctx, `panels.${i}.body`)}
    </div>`).join("");
  return `${head}<div class="bx-panels bx-panels-${panels.length}">${body}</div>`;
}

function comparisonCards(p: any, ctx: RenderContext): string {
  const cards: any[] = Array.isArray(p.cards) ? p.cards : [];
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  const intro = p.intro || ctx.mode === "edit" ? paras(p.intro, ctx, "intro") : "";
  const editing = ctx.mode === "edit";
  const body = cards.map((c, i) => {
    const feats: string[] = Array.isArray(c?.features) ? c.features : [];
    // While editing, the OPTIONAL parts of a card are always on the page as
    // empty slots, and the feature list always has one blank line at the end.
    // A run that is only rendered when it already has words cannot be typed
    // into at all — which is how "was $34.99", "/mo" and a fourth bullet were
    // unreachable.
    const slots = editing ? [...feats, ""] : feats;
    const opt = (cond: unknown, html: string) => (cond || editing ? html : "");
    return `
    <div class="bx-card${c?.recommended ? " bx-card-rec" : ""}"${c?.recommended ? ` style="border-color:${esc(ctx.accent)}"` : ""}>
      ${c?.recommended ? `<div class="bx-card-badge" style="background:${esc(ctx.accent)}">${esc(c?.badge || "Recommended")}</div>` : ""}
      <div class="bx-card-name" data-edit="cards.${i}.name">${t(c?.name, ctx)}</div>
      <div class="bx-card-price">
        ${/* D-01, the worst single moment of the 2026-09-16 walk: an EMPTY price
             measured 0 x 0, so the one number that matters on a tier card could
             not be clicked, Tab skipped it, and a click in the space where it
             visually belongs typed into "/mo". Its two neighbours always had
             `bx-slot`; this one did not. Wider than they are, because 18px type
             needs a target you can hit, and FIRST in source order so Tab reads
             price -> per -> was. */""}
        <span class="bx-now${c?.price ? "" : " bx-slot bx-now-slot"}" data-edit="cards.${i}.price" data-placeholder="$0.00">${t(c?.price, ctx)}</span>
        ${opt(c?.per, `<span class="bx-per${c?.per ? "" : " bx-slot"}" data-edit="cards.${i}.per" data-placeholder="/mo">${t(c?.per, ctx)}</span>`)}
        ${opt(c?.list_price, `<span class="bx-was${c?.list_price ? "" : " bx-slot"}" data-edit="cards.${i}.list_price" data-placeholder="was…">${t(c?.list_price, ctx)}</span>`)}
      </div>
      <div class="bx-card-pitch" data-edit="cards.${i}.pitch">${t(c?.pitch, ctx)}</div>
      <ul class="bx-card-feats">${slots.map((f, fi) => `<li${f ? "" : ` class="bx-slot" data-placeholder="add a line…"`} data-edit="cards.${i}.features.${fi}">${t(f, ctx)}</li>`).join("")}</ul>
      ${opt(c?.note, `<div class="bx-card-note${c?.note ? "" : " bx-slot"}" data-edit="cards.${i}.note" data-placeholder="small note…">${t(c?.note, ctx)}</div>`)}
    </div>`;
  }).join("");
  // Rule 1, said on the page as well as enforced in totals.ts.
  const note = `<p class="bx-smallprint">Comparison only — the plan you choose becomes the priced line. These figures are not added to any total.</p>`;
  return `${head}${intro}<div class="bx-cards bx-cards-${Math.max(1, cards.length)}">${body}</div>${note}`;
}

function pricedLine(p: any, ctx: RenderContext): string {
  const qty = Number(p.quantity) || 1;
  const unit = Number(p.unit_price) || 0;
  const feats: string[] = Array.isArray(p.features) ? p.features : [];
  return `<div class="bx-priced${p.recommended ? " bx-priced-rec" : ""}">
    <div class="bx-priced-head">
      <div class="bx-priced-name" data-edit="name">${t(p.name, ctx)}</div>
      <div class="bx-priced-amt">${esc(money(qty * unit, ctx.currency))}${p.cadence ? ` <span class="bx-per">${esc(p.cadence)}</span>` : ""}</div>
    </div>
    ${paras(p.description, ctx, "description")}
    ${feats.length ? `<ul class="bx-list">${feats.map((f, i) => `<li data-edit="features.${i}">${t(f, ctx)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function totalsBlock(p: any, ctx: RenderContext): string {
  const { sites, subtotal, tax, discount, total } = ctx.totals;
  const siteRows = sites.map((s) => `
    <div class="bx-total-row"><span>${esc(s.name)}</span><span>${esc(money(s.subtotal, ctx.currency))}</span></div>`).join("");
  return `<div class="bx-totals">
    ${p.heading || ctx.mode === "edit" ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : ""}
    ${siteRows}
    <div class="bx-total-row"><span>Subtotal</span><span>${esc(money(subtotal, ctx.currency))}</span></div>
    ${tax ? `<div class="bx-total-row"><span>Tax</span><span>${esc(money(tax, ctx.currency))}</span></div>` : ""}
    ${discount ? `<div class="bx-total-row"><span>Discount</span><span>−${esc(money(discount, ctx.currency))}</span></div>` : ""}
    <div class="bx-total-row bx-total-grand" style="border-top-color:${esc(ctx.accent)}"><span>Total</span><span>${esc(money(total, ctx.currency))}</span></div>
  </div>`;
}

function locationLine(loc?: LocationLite): string {
  if (!loc) return "";
  const line1 = loc.address_line1 ?? loc.address_line_1;
  const line2 = loc.address_line2 ?? loc.address_line_2;
  return [line1, line2, [loc.city, loc.state].filter(Boolean).join(", "), loc.postal_code]
    .filter((x) => String(x ?? "").trim()).join(" · ");
}

function propertyPlan(p: any, ctx: RenderContext): string {
  const loc = ctx.locations?.[String(p.locationId || "")];
  const rows: any[] = Array.isArray(p.rows) ? p.rows : [];
  const head = p.heading || ctx.mode === "edit"
    ? `<h2 class="bx-h bx-h2" style="color:${esc(ctx.accent)}" data-edit="heading">${t(p.heading, ctx)}</h2>` : "";
  const auto = [
    { label: "Property name", value: loc?.name || "" },
    { label: "Service address", value: locationLine(loc) },
  ].filter((r) => r.value);
  const all = [...auto.map((r) => `
    <div class="bx-plan-row"><span class="bx-plan-l">${esc(r.label)}</span><span class="bx-plan-v">${esc(r.value)}</span></div>`),
  ...rows.map((r, i) => `
    <div class="bx-plan-row"><span class="bx-plan-l" data-edit="rows.${i}.label">${t(r?.label, ctx)}</span><span class="bx-plan-v" data-edit="rows.${i}.value">${t(r?.value, ctx)}</span></div>`)].join("");
  return `${head}<div class="bx-plan">${all}</div>`;
}

function propertyBlock(p: any, ctx: RenderContext, widgetId: string): string {
  const loc = ctx.locations?.[String(p.locationId || "")];
  const site = ctx.totals.sites.find((s) => s.locationId === String(p.locationId || ""));
  const items: any[] = (Array.isArray(p.items) ? p.items : [])
    .filter((it: any) => String(it?.description ?? "").trim());
  const rows = items.map((it, i) => {
    const qty = Number(it?.quantity) || 1;
    const unit = Number(it?.unit_price) || 0;
    return `<tr>
      <td data-label="Service" data-edit="items.${i}.description">${t(it?.description, ctx)}</td>
      <td class="bx-right" data-label="Qty">${esc(String(qty))}</td>
      <td class="bx-right" data-label="Rate">${esc(money(unit, ctx.currency))}</td>
      <td class="bx-right bx-strong" data-label="Amount">${esc(money(qty * unit, ctx.currency))}</td>
    </tr>`;
  }).join("");
  return `<div class="bx-site" data-site="${esc(widgetId)}">
    <div class="bx-site-head" style="border-left-color:${esc(ctx.accent)}">
      <div class="bx-site-name" data-edit="heading">${t(p.heading || loc?.name || "", ctx)}</div>
      <div class="bx-site-addr">${esc(locationLine(loc))}</div>
    </div>
    ${items.length || ctx.mode !== "edit" ? `<table class="bx-table bx-table-plain">
      <thead><tr style="background:${esc(ctx.accent)}"><th>Service</th><th class="bx-right">Qty</th><th class="bx-right">Rate</th><th class="bx-right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<div class="bx-imgdrop">Add a service to this property from the panel on the right.</div>`}
    <div class="bx-site-sub"><span>Subtotal for this property</span><span class="bx-strong">${esc(money(site?.subtotal ?? 0, ctx.currency))}</span></div>
  </div>`;
}

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
   D-156 — the container and the atomic widgets
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A BOX, holding widgets, holding boxes.
 *
 * `depth` is carried rather than tracked, so two boxes side by side are each
 * at their own depth and a document that points at itself stops at
 * MAX_CONTAINER_DEPTH instead of taking the customer's tab with it. The one
 * thing a container draws beyond its children is the layout — flex or grid,
 * inline, because it is a fact about THIS box; everything else it wears
 * (padding, margin, border, rounded corners, shadow, per-device) comes down
 * the §11.8 path in `sectionStyleTag`, which is the same path a section uses
 * and therefore the same answers.
 */
function container(w: Widget, ctx: RenderContext, depth: number): string {
  const kids = childrenOf(w);
  if (depth >= MAX_CONTAINER_DEPTH) {
    return ctx.mode === "edit"
      ? `<div class="bx-unknown">This box is nested too deeply to draw.</div>`
      : "";
  }
  const layout = containerLayout(w);
  const p: any = w.props || {};
  // `background_color` is Elementor's own name for it, so ARION publishes the
  // box without a translation table. A colour, exactly as a Section carries one.
  const bg = p.background_color ? `;background:${esc(String(p.background_color))}` : "";
  const inner = kids.map((k) => renderWidget(k, ctx, depth + 1)).join("");
  const empty = !inner && ctx.mode === "edit"
    ? `<div class="bx-boxdrop">Drag anything in here.</div>` : "";
  const tag = layout.tag;
  return `<${tag} class="bx-box bx-box-${containerFlow(layout)}" data-box="${esc(w.id)}" style="${containerLayoutCss(layout)}${bg}">${inner || empty}</${tag}>`;
}

/** What a card says, whoever typed it. See `card`. */
interface CardFields {
  title: unknown; price: unknown; per: unknown; was: unknown;
  description: unknown; bullets: unknown[]; note: unknown;
  recommended: boolean; tag: string; tagColour: string;
  cta?: { label: string; url: string } | null;
  /** `cards.2.` for a card inside the old composite, "" for an atomic one. */
  path: string;
}

/**
 * ONE CARD'S WORDS, whoever typed them and whichever door they came in by.
 *
 * Three vocabularies reach this function and they are all the same card:
 *   · D-156's own field names (`title`, `description`, `bullets`, `was`, `tag`);
 *   · the composite tier card's, so a document the upgrade has not reached yet
 *     still draws (`name`, `pitch`, `features`, `list_price`, `badge`);
 *   · Elementor's `price-table`, which is what stream D's website adapter
 *     PUBLISHES (`heading`, `sub_heading`, `period`, `original_price`,
 *     `features_list`, `button_text`, `link`, `ribbon_title`) — so a page
 *     opened back out of a live site shows its card rather than a blank one.
 *
 * Reading three spellings is not three mechanisms: there is one card, one
 * renderer and one set of fields it draws. Which spelling the REGISTRY writes
 * is stream B's to pick, and the day it picks one the other two become dead
 * aliases rather than a second answer.
 *
 * The TAG is D-157's, and it is one mechanism with `recommended`: a tick gives
 * a "Recommended" pill in the accent, a typed tag gives those words in the
 * author's colour, and a card never grows two pills.
 */
function cardFields(p: any, ctx: RenderContext, path = ""): CardFields {
  const pick = (...vs: unknown[]) => vs.find((v) => v !== undefined && v !== null && v !== "");
  const list = (...vs: unknown[]) => (vs.find((v) => Array.isArray(v) && v.length) as unknown[]) ?? [];
  const tag = String(pick(p?.tag, p?.badge, p?.show_ribbon === "yes" || p?.show_ribbon === true ? p?.ribbon_title : undefined) ?? "").trim();
  const recommended = !!p?.recommended;
  const label = pick(p?.cta?.label, p?.button_text);
  const url = pick(p?.cta?.url, p?.link?.url, p?.link);
  return {
    title: pick(p?.title, p?.name, p?.heading),
    price: p?.price,
    per: pick(p?.per, p?.period),
    was: pick(p?.was, p?.list_price, p?.original_price),
    description: pick(p?.description, p?.pitch, p?.sub_heading),
    bullets: list(p?.bullets, p?.features, p?.features_list),
    note: pick(p?.note, p?.footer_additional_info),
    recommended: recommended || !!tag,
    tag: tag || (recommended ? "Recommended" : ""),
    tagColour: String(pick(p?.tagColour, p?.ribbon_color) ?? "").trim() || ctx.accent,
    cta: label || url
      ? { label: String(label || "Choose this"), url: String(url || "#") }
      : null,
    path,
  };
}

/**
 * A card bound to the PRODUCT CATALOGUE.
 *
 * "or product cards where they can directly load products/services from their
 * actual OLIVER Product Catalog" (Brandon, D-156). The catalogue is handed to
 * the renderer, never fetched by it: the price, the cadence and the inclusions
 * are LIVE, so a plan the business re-priced this morning is re-priced on
 * every page that draws it. What the author typed over the top wins, because
 * an override is the author saying "not for this customer" — and when the
 * catalogue is not there at all (an old PDF worker, an offline render) the
 * snapshot stored on the widget is drawn rather than a blank card.
 */
function productCardFields(p: any, ctx: RenderContext): CardFields {
  const item = ctx.catalogue?.[String(p?.itemId ?? p?.offering_id ?? "")];
  const tier = item?.tiers?.find((t) => String(t.id) === String(p?.tierId ?? ""));
  const live = {
    title: tier?.name ?? item?.name,
    price: tier?.price ?? item?.price,
    per: tier?.cadence ?? item?.cadence,
    description: item?.description,
    bullets: tier?.inclusions ?? item?.inclusions,
  };
  return cardFields({
    ...p,
    title: p?.title ?? live.title,
    price: p?.price ?? live.price,
    per: p?.per ?? live.per,
    description: p?.description ?? live.description,
    bullets: Array.isArray(p?.bullets) && p.bullets.length ? p.bullets : (live.bullets ?? []),
    cta: p?.cta ?? (p?.priced ? { label: "Use this plan", url: "#" } : null),
  }, ctx);
}

/** The ONE card. Typed, bound to the catalogue, or converted out of a tier. */
function card(f: CardFields, ctx: RenderContext, _unused: string): string {
  const editing = ctx.mode === "edit";
  const at = (field: string) => `${f.path}${field}`;
  const opt = (cond: unknown, html: string) => (cond || editing ? html : "");
  const slots = editing ? [...f.bullets, ""] : f.bullets.filter((b) => String(b ?? "").trim());
  return `
    <div class="bx-card${f.recommended ? " bx-card-rec" : ""}"${f.recommended ? ` style="border-color:${esc(f.tagColour)}"` : ""}>
      ${f.tag ? `<div class="bx-card-badge" style="background:${esc(f.tagColour)}">${esc(f.tag)}</div>` : ""}
      <div class="bx-card-name" data-edit="${esc(at("title"))}">${t(f.title, ctx)}</div>
      <div class="bx-card-price">
        <span class="bx-now${f.price ? "" : " bx-slot bx-now-slot"}" data-edit="${esc(at("price"))}" data-placeholder="$0.00">${t(f.price, ctx)}</span>
        ${opt(f.per, `<span class="bx-per${f.per ? "" : " bx-slot"}" data-edit="${esc(at("per"))}" data-placeholder="/mo">${t(f.per, ctx)}</span>`)}
        ${opt(f.was, `<span class="bx-was${f.was ? "" : " bx-slot"}" data-edit="${esc(at("was"))}" data-placeholder="was…">${t(f.was, ctx)}</span>`)}
      </div>
      <div class="bx-card-pitch" data-edit="${esc(at("description"))}">${t(f.description, ctx)}</div>
      <ul class="bx-card-feats">${slots.map((b, i) => `<li${b ? "" : ` class="bx-slot" data-placeholder="add a line…"`} data-edit="${esc(at(`bullets.${i}`))}">${t(b, ctx)}</li>`).join("")}</ul>
      ${opt(f.note, `<div class="bx-card-note${f.note ? "" : " bx-slot"}" data-edit="${esc(at("note"))}" data-placeholder="small note…">${t(f.note, ctx)}</div>`)}
      ${f.cta ? `<a class="bx-button bx-card-cta" style="background:${esc(ctx.accent)}" href="${esc(f.cta.url)}"><span data-edit="${esc(at("cta.label"))}">${t(f.cta.label, ctx)}</span></a>` : ""}
    </div>`;
}

/**
 * ONE FACT: a label and a value.
 *
 * `key_facts` drew four of these inside one widget and the author could not
 * delete the third. This is the third, on its own, and four of them in a row
 * container is the "Agreement at a glance" section — which is the whole of
 * D-156 in one widget.
 */
function keyFact(p: any, ctx: RenderContext): string {
  return `<div class="bx-facts"><div class="bx-fact">
    <span class="bx-fact-l" data-edit="label">${t(p.label, ctx)}</span>
    <span class="bx-fact-v" data-edit="value">${t(p.value, ctx)}</span>
  </div></div>`;
}

/**
 * WHERE THE WORK HAPPENS.
 *
 * Bound to a location, or typed. Bound wins for the parts the business keeps
 * in one place — the address, the site contact, how to get in — because a
 * proposal that prints last year's gate code is worse than one that prints
 * none. A typed value is used where there is no location, which is how a
 * one-off address gets onto a document at all.
 */
function addressBlock(p: any, ctx: RenderContext): string {
  const loc = ctx.locations?.[String(p.locationId || "")];
  const name = loc?.name || p.name;
  const line = locationLine(loc) || String(p.address ?? "");
  const contact = loc?.site_contact ?? p.contact;
  const access = loc?.access_notes ?? p.access;
  const editing = ctx.mode === "edit";
  const bound = !!loc;
  const row = (label: string, value: unknown, path: string) =>
    (value || editing)
      ? `<div class="bx-addr-meta"><span class="bx-addr-l">${esc(label)}</span><span${bound ? "" : ` data-edit="${esc(path)}"`}>${t(value, ctx)}</span></div>`
      : "";
  if (!name && !line && !contact && !access && !editing) return "";
  return `<div class="bx-addr">
    <div class="bx-addr-name"${bound ? "" : ` data-edit="name"`}>${t(name, ctx)}</div>
    ${line || editing ? `<div class="bx-addr-line"${bound ? "" : ` data-edit="address"`}>${t(line, ctx)}</div>` : ""}
    ${row("Site contact", contact, "contact")}
    ${row("Access", access, "access")}
  </div>`;
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
  const cols = s.columns.map((c, i) => `
    <div class="bx-col" data-col="${i}">${c.widgets.map((w) => renderWidget(w, ctx, 0)).join("")}</div>`).join("");

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
  // THE WHOLE TREE, not the two levels the columns happen to be (D-156). A
  // widget three boxes down is styled by the same author with the same
  // inspector, and a sheet that only reached the top level would be a control
  // that works until you put it in a box.
  const inside = s.columns.flatMap((c) => walkTree(c.widgets)).map((x) => x.widget);
  const widgets = inside
    .filter((w) => hasStyle(w.style) && !isContainer(w))
    .map((w) => ({
      selector: `.${widgetStyleClass(w.id)}`,
      style: w.style!,
      typographic: isTypographic(w.kind),
    }));
  // A CONTAINER IS A SECTION, as far as styling goes — §11.12 says so in as
  // many words ("has the section styling from §11.8"). So it goes down the
  // section's own path rather than the widget's: an edge, rounded corners, a
  // shadow and a least height mean something on a box and nothing on a
  // sentence, and writing a second emitter for them would be the second answer
  // this scope exists to delete.
  const boxes = inside.filter((w) => isContainer(w) && hasStyle(w.style));
  if (!hasStyle(s.style) && !widgets.length && !boxes.length) return "";
  const css = styleBlockFor({
    sectionSelector: `.bx-sec[data-section="${esc(s.id)}"]`,
    gridSelector: `.bx-sec[data-section="${esc(s.id)}"] > .bx-grid`,
    layout: s.layout,
    sectionStyle: s.style,
    widgets,
    sectionPadding: true,
  }) + boxes.map((w) => containerStyleCss(w)).join("");
  return css ? `<style>${css}</style>` : "";
}

/**
 * A container's own box, per device.
 *
 * `styleBlockFor` cannot be handed this directly: its grid half would read
 * `columnWidths` and `gap` off the style layer, and a container's gap is a
 * LAYOUT key that the box already carries inline — two places writing one
 * property is how a control stops working (§11.8's own lesson). So the box
 * declarations come from style.ts's emitters, the grid ones never do, and
 * there is still exactly one piece of arithmetic behind each number.
 */
function containerStyleCss(w: Widget): string {
  const selector = `.${widgetStyleClass(w.id)}`;
  const out: string[] = [];
  for (const device of ["desktop", "tablet", "phone"] as const) {
    const use = device === "desktop" ? resolveStyle(w.style, device) : layerFor(w.style, device);
    const decls = sectionBoxDeclarations(use);
    const padding = sidesToCss(use.padding);
    if (padding) decls.unshift(`padding:${padding}`);
    if (!decls.length) continue;
    const body = `${selector}{${decls.map((d) => (device === "desktop" ? d : `${d} !important`)).join(";")}}`;
    out.push(device === "desktop" ? body : `${deviceContainerQuery(device)}{${body}}`);
  }
  return out.join("");
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
/* ── D-156, the box and the atomic widgets ────────────────────────────────
   The BOX has no look of its own. Its display, direction and gap are written
   inline by the renderer because they are facts about that one box; anything
   an author styles reaches it through the same §11.8 sheet a section uses. A
   default border here would be a box you could not turn off. */
.bx-box > .bx-w { margin: 0; }
.bx-box-row > .bx-w, .bx-box-grid > .bx-w { flex: 1 1 0; min-width: 0; }
.bx-boxdrop { flex: 1 1 100%; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 18px; text-align: center; color: #94A3B8; }
.bx-card-cta { margin-top: 10px; }
.bx-addr { border-left: 3px solid var(--bx-accent, #0C4A60); padding-left: 10px; }
.bx-addr-name { font-weight: 700; font-size: 14px; }
.bx-addr-line { color: #5A7A8A; }
.bx-addr-meta { font-size: 11px; color: #5A7A8A; margin-top: 3px; }
.bx-addr-l { text-transform: uppercase; letter-spacing: .06em; font-weight: 700; font-size: 10px; margin-right: 6px; }
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
  .bx-panels, .bx-panels-2, .bx-sign, .bx-facts, .bx-cards { grid-template-columns: 1fr; }
  /* A ROW OF BOXES IS A ROW. Three cards in a box at 390px are three 110px
     cards, which is the shape of a proposal nobody signs — so the same rule
     that stacks the section's columns stacks the author's own boxes. The
     inline flex-direction is beaten with !important for the same reason the
     section's padding is: the renderer wrote it into the HTML. */
  .bx-box-row { flex-direction: column !important; }
  .bx-box-grid { grid-template-columns: 1fr !important; }
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

  /* 4. Two-up rows that are flex, not grid. */
  .bx-priced-head, .bx-site-sub, .bx-total-row, .bx-fact { flex-wrap: wrap; }
  .bx-plan-row { flex-wrap: wrap; gap: 0; }
  .bx-plan-v { text-align: left; flex: 1 1 100%; }

  /* 5. Nothing may be wider than the page. */
  .bx-doc img, .bx-figure img { max-width: 100%; height: auto; }
  .bx-h1, .bx-title { font-size: 22px; }
}
`;
