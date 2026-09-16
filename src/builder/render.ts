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
import { sectionNumbers } from "./model";
import { fill, type MergeContext } from "./merge";
import { documentTotals, money, type DocumentTotals } from "./totals";

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
  /** section id → "01". Computed by the caller from the whole document. */
  numbers: Record<string, string>;
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
    numbers: partial.numbers ?? sectionNumbers(doc),
    ...(partial.changed ? { changed: partial.changed } : {}),
  };
}

/** Merge-fill, then escape. Never the other way round. */
function t(text: unknown, ctx: RenderContext): string {
  return esc(fill(String(text ?? ""), ctx.merge, ctx.mode));
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
  const blocks = filled.split(/\n{2,}/).map((p) => esc(p.trim()).replace(/\n/g, "<br/>"));
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

export function renderWidget(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const body = (() => {
    switch (w.kind) {
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
  return ctx.mode === "edit"
    ? `<div class="bx-w bx-w-${esc(w.kind)}" data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}">${body}</div>`
    : `<div class="bx-w bx-w-${esc(w.kind)}">${body}</div>`;
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
    return `<tr>${cells.map((c, ci) => `<td data-edit="rows.${ri}.${Array.isArray(r) ? ci : `cells.${ci}`}">${t(c, ctx)}</td>`).join("")}</tr>`;
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
  const th = [
    cols.service !== false ? `<th>${esc(p.labelService || "Service")}</th>` : "",
    cols.basis !== false ? `<th>${esc(p.labelBasis || "Basis")}</th>` : "",
    cols.rate !== false ? `<th class="bx-right">${esc(p.labelRate || "Customer rate")}</th>` : "",
  ].join("");
  const body = rows.map((r, i) => `
    <tr>
      ${cols.service !== false ? `<td class="bx-strong" data-edit="rows.${i}.name">${t(r?.name, ctx)}</td>` : ""}
      ${cols.basis !== false ? `<td data-edit="rows.${i}.basis">${t(r?.basis, ctx)}</td>` : ""}
      ${cols.rate !== false ? `<td class="bx-right" data-edit="rows.${i}.rate">${t(r?.rate, ctx)}</td>` : ""}
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
        ${opt(c?.list_price, `<span class="bx-was${c?.list_price ? "" : " bx-slot"}" data-edit="cards.${i}.list_price" data-placeholder="was…">${t(c?.list_price, ctx)}</span>`)}
        <span class="bx-now" data-edit="cards.${i}.price">${t(c?.price, ctx)}</span>
        ${opt(c?.per, `<span class="bx-per${c?.per ? "" : " bx-slot"}" data-edit="cards.${i}.per" data-placeholder="/mo">${t(c?.per, ctx)}</span>`)}
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
      <td data-edit="items.${i}.description">${t(it?.description, ctx)}</td>
      <td class="bx-right">${esc(String(qty))}</td>
      <td class="bx-right">${esc(money(unit, ctx.currency))}</td>
      <td class="bx-right bx-strong">${esc(money(qty * unit, ctx.currency))}</td>
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
  const w = p.width ? ` style="max-width:${Number(p.width)}px"` : "";
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
  const cols = s.columns.map((c, i) => `
    <div class="bx-col" data-col="${i}">${c.widgets.map((w) => renderWidget(w, ctx)).join("")}</div>`).join("");

  const style = [
    s.background ? `background:${esc(s.background)}` : "",
    `padding:${Number(s.padding) || 0}px 40px`,
    s.theme === "dark" ? "color:#FFFFFF" : "",
  ].filter(Boolean).join(";");

  // A revision's badge. `changed` is absent on every document that is not a
  // revision, so a normal proposal renders byte-identically to before.
  const change = ctx.changed?.[s.id];
  const changeBadge = change
    ? `<div class="bx-chg bx-chg-${change}" data-change="${change}">${change === "added" ? "New" : "Changed"}</div>`
    : "";

  return `<section class="bx-sec bx-w-${s.width} bx-cols-${s.layout} bx-theme-${s.theme}${s.pageBreakBefore ? " bx-break" : ""}${
    s.visibility === "internal" ? " bx-internal" : ""}${change ? " bx-changed" : ""}" data-section="${esc(s.id)}" style="${style}">
    ${s.recommended ? `<div class="bx-rec" style="background:${esc(ctx.accent)}">Recommended</div>` : ""}
    ${changeBadge}
    ${label}
    <div class="bx-grid">${cols}</div>
  </section>`;
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
.bx-doc { font-family: var(--bx-body, Inter), system-ui, sans-serif; color: #0B1C24; font-size: 13px; line-height: 1.55; background: #FFFFFF; }
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
@media print { .bx-break { break-before: page; } .bx-internal { display: none; } }
@media (max-width: 640px) { .bx-cols-2 .bx-grid, .bx-cols-3 .bx-grid, .bx-panels-2, .bx-sign { grid-template-columns: 1fr; } }
`;
