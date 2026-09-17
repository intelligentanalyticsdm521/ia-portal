/**
 * builder/adapters/landing/landingRender.ts — THE hosted-page renderer.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, Brandon's answer for landing pages:
 *
 *   "With ARION: it is a website page, built in the website builder and
 *    published on their site. Without ARION: keep the hosted landing page (we
 *    already serve /api/v1/landing/:business/:slug with its own form →
 *    contact), but build it on the SAME CANVAS with the web widget set;
 *    publish to our hosted address, and offer 'copy embed code' for a
 *    non-ARION website."
 *
 * ── ONE RENDERER, TWO PROCESSES ───────────────────────────────────────────
 * The page is SERVER-rendered — a landing page has to be readable with no
 * JavaScript, by a search engine and by a person on a bad connection — so the
 * string this module produces also has to be produced by LUMEN. It is, in
 * `LUMEN-API/src/lib/landingRender.js`, and the two are pinned against each
 * other by `test/fixtures/landing-render-cases.json`, checked into BOTH repos
 * byte-identical. That is the same discipline the platform already uses for
 * the three copies of renderTemplate.js (seams audit §6, SEAM-6-A) — the copy
 * is allowed; the drift is not.
 *
 * ── IT REPLACES THE FIVE-KIND STACKED EDITOR ──────────────────────────────
 * `SparkLandingPageEditor` (hero / text / bullets / cta / form as cards with
 * up-and-down arrows) is DELETED in the same pass, and so is the copy of this
 * renderer that lived inside routes/landingPages.js. Replace means delete.
 *
 * ── OLD ROWS STILL RENDER ─────────────────────────────────────────────────
 * `blocks_json` used to hold a flat ARRAY of those five kinds. It now holds
 * either that array or a v2 document, and both draw. `upgradeLandingBlocks()`
 * is what turns the first into the second when somebody opens the page.
 *
 * PURE: strings in, string out.
 */
import {
  deserialise, emptyDocument, makeSection, makeWidget,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { fill, type MergeContext } from "../../merge";
import { STACK_QUERY, deviceContainerQuery } from "../../responsive";
import {
  hasStyle, isTypographic, layerFor, resolveStyle, sectionBoxDeclarations,
  sidesToCss, styleBlockFor, widgetStyleClass,
} from "../../style";
// THE TREE, read in one place (D-156). render.ts owns what a container is and
// how deep it may go; a second answer here would be a page that disagrees with
// the proposal beside it about what "a box" means.
import {
  MAX_CONTAINER_DEPTH, childrenOf, containerFlow, containerLayout, containerLayoutCss,
  isContainer, walkTree,
} from "../../render";
// ONE catalogue and ONE resolver: the widget's own (stream B).
import {
  cardFields, currencyGlyph, htmlBody, priceWithoutSymbol, resolveCatalogCard,
  snapshotToCardProps, tagOf,
} from "../../widgets";
import type { CatalogOffering } from "../../../components/oliver/ProposalCatalogPicker";
import { money, type DocumentTotals } from "../../totals";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface LandingContext {
  mode: "view" | "edit";
  merge: MergeContext;
  accent: string;
  /** Where the form posts. The builder shows it; the hosted page uses it. */
  formAction: string;
  /** Hidden fields the page arrived with (a postcard's code, the UTMs). */
  hidden?: Record<string, string>;
  business: { name: string; address?: string; email?: string; phone?: string };
  /**
   * D-156's three sources, all HANDED IN and none fetched here.
   *
   * `catalogue` is what a product card draws its live price from, `locations`
   * is what an address block resolves against, and `totals` is the ONE sum the
   * caller already computed (totals.ts) — a renderer that added up money for
   * itself would be a second answer about what a page costs.
   */
  catalogue?: CatalogOffering[];
  locations?: Record<string, LandingLocation>;
  totals?: DocumentTotals;
}

export interface LandingLocation {
  location_id?: string; name?: string | null;
  address_line1?: string | null; address_line2?: string | null;
  address_line_1?: string | null; address_line_2?: string | null;
  city?: string | null; state?: string | null; postal_code?: string | null;
  site_contact?: string | null; access_notes?: string | null;
}

export function makeLandingContext(
  doc: BuilderDocument,
  partial: Partial<LandingContext> = {},
): LandingContext {
  return {
    mode: partial.mode ?? "view",
    merge: partial.merge ?? {},
    accent: partial.accent || doc.settings.accent || "#0F172A",
    formAction: partial.formAction ?? "#",
    hidden: partial.hidden ?? {},
    business: partial.business ?? { name: "" },
    ...(partial.catalogue ? { catalogue: partial.catalogue } : {}),
    ...(partial.locations ? { locations: partial.locations } : {}),
    ...(partial.totals ? { totals: partial.totals } : {}),
  };
}

function t(text: unknown, c: LandingContext): string {
  return esc(fill(String(text ?? ""), c.merge, c.mode));
}

function edit(path: string, c: LandingContext, placeholder?: string): string {
  if (c.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

function paras(text: unknown, c: LandingContext, path: string): string {
  const filled = fill(String(text ?? ""), c.merge, c.mode);
  if (!filled.trim()) {
    return c.mode === "edit" ? `<div class="lp-prose lp-empty"${edit(path, c, "Type here…")}></div>` : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => esc(p.trim()).replace(/\n/g, "<br>"));
  if (c.mode === "edit") return `<div class="lp-prose"${edit(path, c)}>${blocks.map((b) => `<p>${b}</p>`).join("")}</div>`;
  return blocks.map((b) => `<p>${b}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   The form — the reason a hosted landing page exists at all
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The fields a landing-page form may ask for.
 *
 * A FIXED set, keyed by the names `POST /landing/:business/:slug/submit`
 * already reads, because a field the server does not know about is a question
 * the visitor answers into nothing. That is not a limitation to route around:
 * it is the contract that makes "the form creates a contact" true.
 */
export const FORM_FIELDS = [
  { key: "name", label: "Your name", type: "text", always: true },
  { key: "email", label: "Your email", type: "email", always: true },
  { key: "phone", label: "Phone", type: "tel", always: false },
  { key: "company", label: "Company", type: "text", always: false },
  { key: "message", label: "How can we help?", type: "textarea", always: false },
] as const;

export function defaultFormFields(): string[] {
  return ["name", "email", "phone", "message"];
}

function landingForm(p: any, c: LandingContext): string {
  const chosen: string[] = Array.isArray(p.fields) && p.fields.length
    ? p.fields.map((f: any) => (typeof f === "string" ? f : String(f?.key || ""))).filter(Boolean)
    : defaultFormFields();
  const keys = FORM_FIELDS.filter((f) => f.always || chosen.includes(f.key));
  const hidden = Object.entries(c.hidden || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const inputs = keys.map((f) => {
    const label = String(p[`label_${f.key}`] || f.label);
    return f.type === "textarea"
      ? `<textarea name="${f.key}" rows="4" placeholder="${esc(label)}"></textarea>`
      : `<input name="${f.key}" type="${f.type}" placeholder="${esc(label)}"${f.always ? " required" : ""}>`;
  }).join("");
  return `<form id="form" class="lp-form" method="post" action="${esc(c.formAction)}">
    <h2${edit("heading", c, "Get in touch")}>${t(p.heading || "Get in touch", c)}</h2>${hidden}
    ${inputs}
    <button type="submit" style="background:${esc(c.accent)}"${edit("submit_label", c, "Send")}>${t(p.submit_label || "Send", c)}</button>
  </form>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Widgets
   ══════════════════════════════════════════════════════════════════════════ */

export const LANDING_RENDERED_KINDS = [
  "hero", "heading", "paragraph", "list", "image", "gallery", "video",
  "button", "divider", "spacer", "form", "footer_note", "social_links",
  "testimonial",
  // D-156 — the box and the atomic widgets, on this surface too. A page that
  // could not show a row of cards or an address was a page an author had to
  // leave to build the same thing somewhere else.
  "container", "card", "catalog_card", "price_line", "address_block",
  "key_fact", "totals",
  // Catalogue point 9 — the free HTML box. A landing page is an HTML page.
  "html",
] as const;

export const LANDING_UNRENDERED_KINDS = ["columns"] as const;

export function renderLandingWidget(w: Widget, c: LandingContext, depth = 0): string {
  const p: any = w.props || {};
  const body = (() => {
    switch (w.kind) {
      case "container": return lpBox(w, c, depth);
      case "card": return lpCard(lpCardFields(p, c), c);
      case "catalog_card": return lpCard(lpCatalogCard(p, c), c);
      case "price_line": case "priced_line": return lpPriceLine(p, c);
      case "address_block": return lpAddress(p, c);
      case "key_fact": return lpKeyFact(p, c);
      case "totals": return lpTotals(p, c);
      case "hero": return lpHero(p, c);
      case "heading": return lpHeading(p, c);
      case "paragraph": return paras(p.text, c, "text");
      case "list": return lpList(p, c);
      case "image": return lpImage(p, c);
      case "gallery": return lpGallery(p, c);
      case "video": return lpVideo(p, c);
      case "button": return lpButton(p, c);
      case "divider": return `<hr class="lp-hr">`;
      case "spacer": return `<div class="lp-spacer" style="height:${Math.max(1, Number(p.height) || 24)}px"></div>`;
      case "form": return landingForm(p, c);
      case "footer_note": return (p.text || c.mode === "edit")
        ? `<p class="lp-small"${edit("text", c, "Small print")}>${t(p.text, c)}</p>` : "";
      case "social_links": return lpSocial(p, c);
      case "testimonial": return lpQuote(p, c);
      /* PASTE YOUR OWN HTML (catalogue point 9). The author's markup, on the
         page, unchanged — that is the whole widget. Drawn by the widget's own
         renderer, not a second copy here, so the canvas, the website and this
         page all put the same bytes out. */
      case "html": return htmlBody(p, c.mode === "edit");
      default:
        return c.mode === "edit"
          ? `<div class="lp-unknown">This part (“${esc(w.kind)}”) needs a newer version of the builder to show.</div>`
          : "";
    }
  })();
  if (!body && c.mode === "view") return "";
  // A STYLED widget needs something to hang the rule on in the CUSTOMER's copy
  // too, where there is no `data-widget` (§11.8). Nothing is added to an
  // unstyled one, so the golden landing cases are byte-identical.
  const sy = hasStyle(w.style) ? ` ${widgetStyleClass(w.id)}` : "";
  if (c.mode === "edit") return `<div class="lp-w${sy}" data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}">${body}</div>`;
  return sy ? `<div class="lp-w${sy}">${body}</div>` : body;
}

/* ══════════════════════════════════════════════════════════════════════════
   D-156 — the box and the atomic widgets, on a page
   ══════════════════════════════════════════════════════════════════════════ */

function lpBox(w: Widget, c: LandingContext, depth: number): string {
  if (depth >= MAX_CONTAINER_DEPTH) {
    return c.mode === "edit" ? `<div class="lp-unknown">This box is nested too deeply to draw.</div>` : "";
  }
  const layout = containerLayout(w);
  const inner = childrenOf(w).map((k) => renderLandingWidget(k, c, depth + 1)).join("");
  const empty = !inner && c.mode === "edit" ? `<div class="lp-drop">Drag anything in here.</div>` : "";
  const tag = layout.tag;
  // The box's ARRANGING comes from the page's own stylesheet, per device, the
  // same way the document's does (§11.8 + §11.12) — not inline. One mechanism,
  // and the author's "a column on a phone" works here for nothing.
  const sy = hasStyle(w.style) ? ` ${widgetStyleClass(w.id)}` : "";
  return `<${tag} class="lp-box lp-box-${containerFlow(layout)}${sy}" data-box="${esc(w.id)}">${inner || empty}</${tag}>`;
}

interface LpCard {
  title: unknown; price: unknown; per: unknown; was: unknown;
  description: unknown; bullets: unknown[]; note: unknown;
  recommended: boolean; tag: string; tagColour: string;
  cta?: { label: string; url: string } | null;
}

/**
 * One card's words — through the WIDGET's OWN reader (`widgets/card.ts`).
 *
 * It used to be a second copy of `cardFields` with the same picks in the same
 * order. See the email renderer's note: what is left here is only the parts a
 * LANDING PAGE decorates on top — the ribbon as a plain string and the CTA as
 * an object.
 */
function lpCardFields(p: any, c: LandingContext): LpCard {
  const f = cardFields(p);
  const ribbon = tagOf(p);
  const tag = ribbon?.text ?? "";
  const glyph = currencyGlyph(p);
  const price = glyph ? `${glyph}${priceWithoutSymbol(f.price, glyph)}` : f.price;
  const label = f.button_text;
  const url = f.link;
  return {
    title: f.heading,
    price,
    per: f.period,
    was: f.sale ? f.original_price : "",
    description: f.description,
    bullets: f.features_list,
    note: f.footer_additional_info,
    recommended: !!tag,
    tag,
    tagColour: (ribbon?.colour ?? "").trim() || c.accent,
    cta: label || url ? { label: String(label || "Choose this"), url: String(url || "#") } : null,
  };
}

/** The same card, with the catalogue's live figures under the author's. */
/**
 * A catalogue card's words, resolved by the ONE resolver (integration).
 *
 * Override, then the live catalogue handed in, then the snapshot stored on the
 * widget — `resolveCatalogCard`, the same function the canvas, the mailbox and
 * the PDF ask. A second resolution order here is how two surfaces come to
 * disagree about a price.
 */
function lpCatalogCard(p: any, c: LandingContext): LpCard {
  const r = resolveCatalogCard(p, c.catalogue);
  // `snapshotToCardProps` — the ONE map from a catalogue snapshot to a card's
  // own field names, shared with the canvas, the mailbox and the PDF.
  return lpCardFields({
    ...p,
    ...snapshotToCardProps(r),
    cta: p?.cta ?? (p?.priced ? { label: "Use this plan", url: "#" } : null),
  }, c);
}

function lpCard(f: LpCard, c: LandingContext): string {
  const bullets = f.bullets.filter((b) => String(b ?? "").trim());
  return `<div class="lp-card${f.recommended ? " lp-card-rec" : ""}"${f.recommended ? ` style="border-color:${esc(f.tagColour)}"` : ""}>
    ${f.tag ? `<div class="lp-tag" style="background:${esc(f.tagColour)}">${esc(f.tag)}</div>` : ""}
    <div class="lp-card-name"${edit("title", c, "What it is called")}>${t(f.title, c)}</div>
    <div class="lp-card-price"><span class="lp-now"${edit("price", c, "$0.00")}>${t(f.price, c)}</span>${
      f.per || c.mode === "edit" ? `<span class="lp-per"${edit("per", c, "/mo")}>${t(f.per, c)}</span>` : ""}${
      f.was || c.mode === "edit" ? `<span class="lp-was"${edit("was", c, "was…")}>${t(f.was, c)}</span>` : ""}</div>
    ${f.description || c.mode === "edit" ? `<div class="lp-card-pitch"${edit("description", c, "Why somebody would want it")}>${t(f.description, c)}</div>` : ""}
    ${bullets.length ? `<ul class="lp-list">${bullets.map((b, i) => `<li${edit(`bullets.${i}`, c)}>${t(b, c)}</li>`).join("")}</ul>` : ""}
    ${f.note || c.mode === "edit" ? `<div class="lp-small"${edit("note", c, "small note…")}>${t(f.note, c)}</div>` : ""}
    ${f.cta ? `<a class="lp-btn" style="background:${esc(c.accent)}" href="${esc(f.cta.url)}">${esc(f.cta.label)}</a>` : ""}
  </div>`;
}

/** A named line with a figure. `priced_line` is the same widget, older name. */
function lpPriceLine(p: any, c: LandingContext): string {
  const qty = Number(p?.quantity) || 1;
  const unit = Number(p?.unit_price) || 0;
  return `<div class="lp-line">
    <div class="lp-line-head">
      <span class="lp-line-name"${edit("name", c, "What it is")}>${t(p?.name, c)}</span>
      <span class="lp-line-amt">${esc(money(qty * unit))}${p?.cadence ? ` <span class="lp-per">${esc(p.cadence)}</span>` : ""}</span>
    </div>
    ${p?.description || c.mode === "edit" ? paras(p?.description, c, "description") : ""}
  </div>`;
}

function lpKeyFact(p: any, c: LandingContext): string {
  return `<div class="lp-fact"><span class="lp-fact-l"${edit("label", c, "Label")}>${t(p?.label, c)}</span><span class="lp-fact-v"${edit("value", c, "Value")}>${t(p?.value, c)}</span></div>`;
}

function lpAddressLine(loc: LandingLocation | undefined): string {
  if (!loc) return "";
  const l1 = loc.address_line1 ?? loc.address_line_1;
  const l2 = loc.address_line2 ?? loc.address_line_2;
  return [l1, l2, [loc.city, loc.state].filter(Boolean).join(", "), loc.postal_code]
    .filter((x) => String(x ?? "").trim()).join(" · ");
}

function lpAddress(p: any, c: LandingContext): string {
  const loc = c.locations?.[String(p?.locationId || "")];
  const bound = !!loc;
  const name = loc?.name || p?.name;
  const line = lpAddressLine(loc) || String(p?.address ?? "");
  const contact = loc?.site_contact ?? p?.contact;
  const access = loc?.access_notes ?? p?.access;
  if (!name && !line && !contact && !access && c.mode !== "edit") return "";
  const row = (label: string, value: unknown, path: string) =>
    (value || c.mode === "edit")
      ? `<div class="lp-addr-meta"><span class="lp-addr-l">${esc(label)}</span><span${bound ? "" : edit(path, c)}>${t(value, c)}</span></div>` : "";
  return `<div class="lp-addr">
    <div class="lp-addr-name"${bound ? "" : edit("name", c, "Property name")}>${t(name, c)}</div>
    ${line || c.mode === "edit" ? `<div class="lp-addr-line"${bound ? "" : edit("address", c, "Street, town, postcode")}>${t(line, c)}</div>` : ""}
    ${row("Site contact", contact, "contact")}
    ${row("Access", access, "access")}
  </div>`;
}

/**
 * THE ONE TOTAL.
 *
 * Read from the context, never added up here: `totals.ts` already walks the
 * document once and knows the two money rules — a comparison never sums, and
 * a multi-site document has one total. A page that did its own arithmetic
 * would be the place the two answers diverge.
 */
function lpTotals(p: any, c: LandingContext): string {
  const tt = c.totals;
  if (!tt) return c.mode === "edit" ? `<div class="lp-unknown">The total is worked out when this page is sent.</div>` : "";
  const row = (label: string, amount: string, cls = "") =>
    `<div class="lp-total-row${cls}"><span>${esc(label)}</span><span>${esc(amount)}</span></div>`;
  return `<div class="lp-totals">
    ${p?.heading || c.mode === "edit" ? `<h2 class="lp-h"${edit("heading", c, "Totals")}>${t(p?.heading, c)}</h2>` : ""}
    ${tt.sites.map((x) => row(x.name, money(x.subtotal))).join("")}
    ${row("Subtotal", money(tt.subtotal))}
    ${tt.tax ? row("Tax", money(tt.tax)) : ""}
    ${tt.discount ? row("Discount", `−${money(tt.discount)}`) : ""}
    ${row("Total", money(tt.total), " lp-total-grand")}
  </div>`;
}

/** A picture on a landing page still needs a description. Same rule as email. */
function altOf(p: any, fallback = "Picture"): string {
  const a = String(p?.alt ?? "").trim();
  if (a) return a;
  const cap = String(p?.caption ?? p?.headline ?? "").trim();
  if (cap) return cap;
  const name = String(p?.image ?? p?.src ?? "").split("?")[0].split("/").pop() || "";
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || fallback;
}

function lpHero(p: any, c: LandingContext): string {
  const align = String(p.align || "").toLowerCase().startsWith("left") ? "left" : "center";
  const pic = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(altOf(p))}">`
    : c.mode === "edit" ? `<div class="lp-drop">Choose a picture in the panel on the right.</div>` : "";
  return `<header class="lp-hero" style="text-align:${align}">
    ${pic}
    <h1${edit("headline", c, "The one line that says what you do")}>${t(p.headline, c)}</h1>
    ${p.sub || c.mode === "edit" ? `<p class="lp-sub"${edit("sub", c, "A supporting line")}>${t(p.sub, c)}</p>` : ""}
  </header>`;
}

function lpHeading(p: any, c: LandingContext): string {
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  return `<h${level} class="lp-h"${edit("text", c, "Your heading")}>${t(p.text, c)}</h${level}>`;
}

function lpList(p: any, c: LandingContext): string {
  const items: string[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? [...items, ""] : items.filter((x) => String(x ?? "").trim());
  if (!shown.length) return "";
  return `<ul class="lp-list">${shown.map((it, i) =>
    `<li${edit(`items.${i}`, c, "add a point…")}>${t(it, c)}</li>`).join("")}</ul>`;
}

function lpImage(p: any, c: LandingContext): string {
  if (!p.src) return c.mode === "edit" ? `<div class="lp-drop">Choose a picture in the panel on the right.</div>` : "";
  return `<figure class="lp-fig"><img src="${esc(p.src)}" alt="${esc(altOf(p))}">${
    p.caption || c.mode === "edit" ? `<figcaption${edit("caption", c, "Caption")}>${t(p.caption, c)}</figcaption>` : ""}</figure>`;
}

function lpGallery(p: any, c: LandingContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const shown = items.filter((x) => (typeof x === "string" ? x : x?.src));
  if (!shown.length) return c.mode === "edit" ? `<div class="lp-drop">Add the photos in the panel on the right.</div>` : "";
  return `<div class="lp-gal">${shown.map((x) => {
    const src = typeof x === "string" ? x : x.src;
    return `<img src="${esc(src)}" alt="${esc(altOf(typeof x === "string" ? { src: x } : x))}">`;
  }).join("")}</div>`;
}

/**
 * A video, as a link with a picture.
 *
 * NOT an embedded player: an iframe from YouTube on a page we host puts a
 * third party's cookies on a visitor the business is responsible for, and the
 * standing decision is that another product's surface does not appear in front
 * of a client. The link opens it where it lives.
 */
function lpVideo(p: any, c: LandingContext): string {
  if (!p.url) return c.mode === "edit" ? `<div class="lp-drop">Paste the video's address in the panel on the right.</div>` : "";
  return `<p class="lp-video"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Watch the video</a></p>`;
}

function lpButton(p: any, c: LandingContext): string {
  const style = String(p.style || "solid").toLowerCase();
  const colour = /^#|^rgb|^hsl/.test(String(p.colour || "")) ? String(p.colour) : c.accent;
  const cls = style.startsWith("outline") ? "lp-btn lp-btn-out" : style.startsWith("plain") ? "lp-btn lp-btn-plain" : "lp-btn";
  const inline = style.startsWith("solid") ? ` style="background:${esc(colour)}"` : ` style="color:${esc(colour)};border-color:${esc(colour)}"`;
  return `<p class="lp-cta"><a class="${cls}" href="${esc(p.url || "#form")}"${inline}><span${edit("label", c, "Button text")}>${t(p.label, c)}</span></a></p>`;
}

function lpSocial(p: any, c: LandingContext): string {
  const links: any[] = Array.isArray(p.links) ? p.links.filter((l: any) => l?.url) : [];
  if (!links.length) return c.mode === "edit"
    ? `<p class="lp-small">Add the address of each account you want people to follow, in the panel on the right.</p>` : "";
  return `<p class="lp-social">${links.map((l) =>
    `<a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.label || "Follow")}</a>`).join("")}</p>`;
}

function lpQuote(p: any, c: LandingContext): string {
  if (!String(p.quote ?? "").trim() && c.mode !== "edit") return "";
  return `<blockquote class="lp-quote" style="border-left-color:${esc(c.accent)}">
    <p${edit("quote", c, "What they said")}>${t(p.quote, c)}</p>
    <footer${edit("attribution", c, "Who said it")}>${t(p.attribution, c)}</footer>
  </blockquote>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sections and the page
   ══════════════════════════════════════════════════════════════════════════ */

export function renderLandingSection(s: Section, c: LandingContext): string {
  if (s.visibility !== "customer" && c.mode === "view") return "";
  const mark = c.mode === "edit";
  // Per-side padding when the author set one; the single number when not.
  const ownPadding = sidesToCss(resolveStyle(s.style, "desktop").padding);
  const style = [
    s.background ? `background:${esc(s.background)}` : "",
    ownPadding ? "" : `padding:${Math.max(0, Number(s.padding) || 0)}px 20px`,
    s.theme === "dark" ? "color:#fff" : "",
  ].filter(Boolean).join(";");
  const cols = s.columns.map((col, i) =>
    `<div class="lp-col"${mark ? ` data-col="${i}"` : ""}>${col.widgets.map((w) => renderLandingWidget(w, c)).join("")}</div>`).join("");
  // `data-section` is an editor marker — except on a STYLED section, where it
  // is also what the rule is keyed on. Emitted for a styled section in the
  // customer's copy too, and for nothing else, so an untouched page is
  // byte-identical to what the goldens hold.
  const hook = mark || hasStyle(s.style) ? ` data-section="${esc(s.id)}"` : "";
  return `<section class="lp-sec lp-w-${s.width} lp-cols-${s.layout}"${hook} style="${style}">`
    + lpStyleTag(s)
    + `<div class="lp-grid">${cols}</div></section>`;
}

/** The same per-section stylesheet the document renderer emits. See style.ts. */
function lpStyleTag(s: Section): string {
  // The WHOLE tree (D-156): a widget three boxes down was styled with the same
  // inspector as one at the top, and a sheet that only reached the top level
  // would be a control that stops working inside a box.
  const inside = s.columns.flatMap((c) => walkTree(c.widgets)).map((x) => x.widget);
  // A BOX IS STYLED LIKE A SECTION (§11.12): its edges, its spacing AND how it
  // arranges what is in it all come out of the same `styleBlockFor`, per
  // device. `container: true` is the only difference between the two.
  const widgets = inside
    .filter((w) => hasStyle(w.style))
    .map((w) => (isContainer(w)
      ? { selector: `.${widgetStyleClass(w.id)}`, style: w.style!, typographic: false, container: true }
      : { selector: `.${widgetStyleClass(w.id)}`, style: w.style!, typographic: isTypographic(w.kind) }));
  if (!hasStyle(s.style) && !widgets.length) return "";
  const css = styleBlockFor({
    sectionSelector: `.lp-sec[data-section="${esc(s.id)}"]`,
    gridSelector: `.lp-sec[data-section="${esc(s.id)}"] > .lp-grid`,
    layout: s.layout,
    sectionStyle: s.style,
    widgets,
    sectionPadding: true,
  });
  return css ? `<style>${css}</style>` : "";
}

export interface LandingPageMeta {
  title: string;
  metaDescription?: string | null;
}

export function renderLandingPage(
  doc: BuilderDocument,
  c: LandingContext,
  meta: LandingPageMeta,
): string {
  const body = doc.sections.map((s) => renderLandingSection(s, c)).join("\n");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}</title>
${meta.metaDescription ? `<meta name="description" content="${esc(meta.metaDescription)}">` : ""}
<style>${LANDING_CSS.replace(/__ACCENT__/g, esc(c.accent))}</style>
</head><body><main class="lp-page">
${body || `<h1>${esc(meta.title)}</h1><p>This page hasn't been built yet.</p>`}
</main>${EMBED_HEIGHT_SCRIPT}</body></html>`;
}

/**
 * The half of "copy embed code" that lives on the page itself.
 *
 * When the page is inside somebody else's site it says how tall it is, so the
 * frame grows instead of scrolling inside their layout. It does nothing at all
 * when the page is opened directly (`parent === window`), and it sends only a
 * number — never anything about the visitor.
 */
export const EMBED_HEIGHT_SCRIPT = `<script>
(function () {
  if (window.parent === window) return;
  var last = 0;
  function tell() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h === last) return;
    last = h;
    window.parent.postMessage({ type: "ia-landing-height", height: h }, "*");
  }
  window.addEventListener("load", tell);
  window.addEventListener("resize", tell);
  setInterval(tell, 1000);
})();
</script>`;

/**
 * The page's stylesheet.
 *
 * A string, travelling with the renderer, for the reason the document
 * renderer's does: a stylesheet a consumer has to remember to import is one a
 * consumer will forget, and the canvas and the hosted page would then be two
 * different pages.
 */
export const LANDING_CSS = `
:root{--accent:__ACCENT__}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:#fff}
/* The container the phone block below asks about: .bx-doc as well as
   .lp-page, because the canvas host carries the engine's class and the
   published page carries this one — one stylesheet, both surfaces, so the
   phone preview cannot show a layout the visitor never gets. */
.lp-page,.bx-doc{container-type:inline-size}
.lp-page{max-width:760px;margin:0 auto;padding:0 20px}
.lp-sec{position:relative}
.lp-grid{display:grid;gap:24px;max-width:720px;margin:0 auto}
.lp-cols-2 .lp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.lp-cols-3 .lp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.lp-w-narrow .lp-grid{max-width:520px}
.lp-w-full .lp-grid{max-width:none}
.lp-hero{margin-bottom:1.5rem}
.lp-hero img{max-width:100%;border-radius:12px;margin-bottom:1.25rem}
.lp-hero h1{font-size:2rem;line-height:1.2;margin:0 0 .5rem}
.lp-sub{font-size:1.125rem;color:#475569;margin:0}
.lp-h{margin:0 0 .6rem;line-height:1.25}
h2.lp-h{font-size:1.4rem}h3.lp-h{font-size:1.1rem}
.lp-prose p,.lp-page p{margin:0 0 1rem}
.lp-list{padding-left:1.1rem;margin:0 0 1rem}.lp-list li{margin:.35rem 0}
.lp-fig{margin:0 0 1rem}.lp-fig img{max-width:100%;border-radius:10px;display:block}
.lp-fig figcaption{font-size:.85rem;color:#64748b;margin-top:.4rem}
.lp-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem;margin:0 0 1rem}
.lp-gal img{width:100%;border-radius:8px;display:block}
.lp-hr{border:0;border-top:1px solid #e2e8f0;margin:1.5rem 0}
.lp-cta{text-align:center;margin:2rem 0}
.lp-btn{display:inline-block;color:#fff;text-decoration:none;padding:.85rem 1.75rem;border-radius:8px;font-weight:600;border:2px solid transparent}
.lp-btn-out{background:transparent;border-style:solid}
.lp-btn-plain{background:transparent;border-color:transparent;text-decoration:underline;padding:0}
.lp-quote{margin:0 0 1rem;padding:.9rem 1.1rem;border-left:3px solid var(--accent);background:#f8fafc}
.lp-quote p{margin:0 0 .4rem;font-style:italic}
.lp-quote footer{font-size:.85rem;color:#64748b}
.lp-social a{margin-right:1rem;color:var(--accent);font-weight:600;text-decoration:none}
.lp-video a{color:var(--accent);font-weight:600}
.lp-small{font-size:.8rem;color:#64748b}
.lp-form{margin-top:2rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
.lp-form h2{margin:0 0 1rem;font-size:1.25rem}
.lp-form input,.lp-form textarea{width:100%;padding:.65rem .75rem;margin-bottom:.75rem;border:1px solid #cbd5e1;border-radius:6px;font:inherit}
.lp-form button{color:#fff;border:0;padding:.75rem 1.5rem;border-radius:6px;font-weight:600;font-size:1rem;cursor:pointer}
.lp-drop{border:1px dashed #cbd5e1;border-radius:8px;padding:18px;text-align:center;color:#94a3b8}
.lp-unknown{border:1px dashed #cbd5e1;border-radius:6px;padding:10px;color:#94a3b8;font-size:.8rem}
/* D-156 — the box has no look of its own; its display, direction and gap are
   written inline because they are facts about that one box. */
.lp-box-row>*,.lp-box-grid>*{flex:1 1 0;min-width:0}
.lp-card{position:relative;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;background:#fff}
.lp-card-rec{border-width:2px}
.lp-tag{position:absolute;top:-.6rem;left:1rem;color:#fff;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:.15rem .6rem}
.lp-card-name{font-weight:700;font-size:1.05rem;margin-bottom:.25rem}
.lp-card-price{display:flex;align-items:baseline;gap:.4rem;margin-bottom:.25rem}
.lp-now{font-size:1.3rem;font-weight:700}.lp-per{color:#64748b;font-size:.8rem}.lp-was{text-decoration:line-through;color:#94a3b8}
.lp-card-pitch{color:#475569;margin-bottom:.5rem}
.lp-line{border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;margin-bottom:.5rem}
.lp-line-head{display:flex;justify-content:space-between;gap:.75rem;align-items:baseline;font-weight:700}
.lp-fact{display:flex;justify-content:space-between;gap:.75rem;padding:.4rem 0;border-bottom:1px solid #e2e8f0}
.lp-fact-l{color:#64748b;text-transform:uppercase;font-size:.7rem;letter-spacing:.06em;font-weight:700}
.lp-fact-v{font-weight:600;text-align:right}
.lp-addr{border-left:3px solid var(--accent);padding-left:.7rem}
.lp-addr-name{font-weight:700}.lp-addr-line{color:#64748b}
.lp-addr-meta{font-size:.8rem;color:#64748b;margin-top:.2rem}
.lp-addr-l{text-transform:uppercase;letter-spacing:.06em;font-weight:700;font-size:.65rem;margin-right:.4rem}
.lp-total-row{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #e2e8f0}
.lp-total-grand{border-bottom:0;border-top:2px solid var(--accent);margin-top:.25rem;padding-top:.5rem;font-weight:700;font-size:1.1rem}
.lp-empty:empty::before{content:attr(data-placeholder);color:#94a3b8}
[data-placeholder]:empty::before{content:attr(data-placeholder);color:#cbd5e1}
/* The phone. NOTE: .lp-page is itself the container, and a container query
   never matches the element it is asked about — so the page's own gutter is
   the base rule above (20px at every width) and everything here is a
   DESCENDANT of it. Measured, not assumed: the first version put
   .lp-page{padding:0 16px} in here and the browser reported 20px. */
${STACK_QUERY}{.lp-box-row{flex-direction:column !important}.lp-box-grid{grid-template-columns:1fr !important}.lp-cols-2 .lp-grid,.lp-cols-3 .lp-grid{grid-template-columns:1fr}.lp-hero h1{font-size:1.5rem}.lp-grid{gap:18px}.lp-gal{grid-template-columns:repeat(2,minmax(0,1fr))}.lp-form{padding:1.1rem}.lp-page img{max-width:100%;height:auto}.lp-social a{display:inline-block;margin:0 1rem .4rem 0}}
`;

/* ══════════════════════════════════════════════════════════════════════════
   The old five kinds
   ══════════════════════════════════════════════════════════════════════════ */

/** True for the flat array the stacked-card editor used to save. */
export function isLegacyLandingBlocks(v: unknown): boolean {
  const value = typeof v === "string" ? tryParse(v) : v;
  return Array.isArray(value);
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

const one = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({ ...extra, columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }], layout: 1 });

/**
 * hero / text / bullets / cta / form → sections.
 *
 * One section per old block, in the order they were in, because that is
 * exactly what the old editor drew: a stack of cards with up-and-down arrows.
 * Nothing is interpreted and nothing is lost.
 */
export function upgradeLandingBlocks(blocks: unknown, accent?: string): BuilderDocument {
  const list: any[] = Array.isArray(blocks) ? blocks : (Array.isArray(tryParse(String(blocks))) ? (tryParse(String(blocks)) as any[]) : []);
  const doc = emptyDocument({ style: "landing", ...(accent ? { accent } : {}) });
  doc.sections = list.map((b: any) => {
    switch (b?.type) {
      case "hero":
        return one([makeWidget("hero", {
          headline: String(b.headline ?? ""), sub: String(b.sub ?? ""),
          image: String(b.image ?? ""), alt: "", align: "Centre",
        })], { label: "Headline", padding: 32 });
      case "text":
        return one([makeWidget("paragraph", { text: String(b.body ?? "") })], { label: "Words", padding: 16 });
      case "bullets":
        return one([makeWidget("list", { items: Array.isArray(b.items) ? b.items.map(String) : [] })], { label: "Points", padding: 16 });
      case "cta":
        return one([makeWidget("button", {
          label: String(b.label ?? "Get in touch"), url: String(b.href ?? "#form"), style: "Solid", align: "Centre",
        })], { label: "Button", padding: 16 });
      case "form":
        return one([makeWidget("form", {
          heading: String(b.heading ?? "Get in touch"),
          submit_label: String(b.submitLabel ?? "Send"),
          fields: b.phone === false ? ["name", "email", "message"] : defaultFormFields(),
          ...(b.messagePlaceholder ? { label_message: String(b.messagePlaceholder) } : {}),
        })], { label: "Contact form", padding: 16 });
      default:
        return one([], { label: "Section", padding: 8 });
    }
  }).filter((s) => s.columns[0].widgets.length);
  return doc;
}

/** Read whatever `blocks_json` holds — a v2 document or the old array. */
export function openLandingDocument(blocksJson: unknown, accent?: string): BuilderDocument {
  const value = typeof blocksJson === "string" ? tryParse(blocksJson) : blocksJson;
  if (value && typeof value === "object" && !Array.isArray(value)
    && Number((value as any).v) === 2 && Array.isArray((value as any).sections)) {
    return deserialise(value);
  }
  return upgradeLandingBlocks(value, accent);
}

/* ══════════════════════════════════════════════════════════════════════════
   "Copy embed code"
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The snippet a business pastes into a website we do not run.
 *
 * An IFRAME, on purpose. §7's reasoning, kept: "converting to raw HTML for
 * them to paste is fragile and gets edited by hand; the hosted page keeps the
 * form → contact flow working." The little script is the only part that is
 * not plain markup, and all it does is listen for the page's own height so the
 * frame does not scroll inside their layout — a page with JavaScript switched
 * off still shows, at the fallback height.
 */
export function embedSnippet(publicUrl: string, opts: { height?: number; title?: string } = {}): string {
  const url = String(publicUrl || "").trim();
  const height = Math.max(200, Number(opts.height) || 900);
  const title = String(opts.title || "Landing page");
  return `<!-- ${title} — hosted by your Intelligent Analytics account -->
<iframe
  src="${escAttr(url)}"
  title="${escAttr(title)}"
  style="width:100%;border:0;min-height:${height}px"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"></iframe>
<script>
(function () {
  var origin = ${JSON.stringify(originOf(url))};
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "ia-landing-height") return;
    var frames = document.querySelectorAll('iframe[src^="' + origin + '"]');
    for (var i = 0; i < frames.length; i++) frames[i].style.minHeight = e.data.height + "px";
  });
})();
</script>`;
}

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The origin of a URL, without needing the URL class to be present. */
export function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(url || ""));
  return m ? m[1] : "";
}
