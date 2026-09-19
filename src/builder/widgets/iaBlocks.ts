/**
 * builder/widgets/iaBlocks.ts — the **Intelligent Analytics** group: the tiles
 * that are ours rather than Elementor's.
 *
 * §11.13.3's fourth column, in its own order, per builder. Two of them are not
 * widgets at all:
 *
 * ── PANEL TILES ───────────────────────────────────────────────────────────
 * **Product Cards** and **Product Line Items** open the ONE catalogue picker
 * (whole catalogue / one category / picked items) and drop one ATOMIC
 * `catalog_card` or `price_line` per pick — into a row Container for the cards,
 * as a stack for the lines. So they are a tile with no stored form of their
 * own: `expandPanelTile` below is the one function that turns a set of picks
 * into nodes, and the insert seam calls it. A tile that reached the canvas
 * un-expanded (an author who cancelled the picker, a document hand-edited)
 * draws a prompt while editing and NOTHING on a customer's copy, because a
 * half-placed widget must never be a gap on a page somebody signs.
 *
 * ── WHY `catalog_card` AND `price_line` ARE NOT TILES ─────────────────────
 * They are what the tiles PRODUCE. Offering the atom beside the tile would be
 * two doors to one job and the second one skips the picker, which is how a card
 * ends up on a proposal bound to nothing.
 */
import type { Node, Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom, solid } from "../pictures";
import { editRun } from "./text";
import { makeContainer, makeWidget } from "../treeOps";
import { bindingDefaults, selectionProps } from "./binding";
import { DOCUMENTS, PAGES, SENDS, SITE_ONLY } from "./audience";

const str = (v: unknown): string => (v == null ? "" : String(v));

/* ══════════════════════════════════════════════════════════════════════════
   The two panel tiles
   ══════════════════════════════════════════════════════════════════════════ */

/** One thing the author picked out of the catalogue. */
export interface CataloguePick {
  offeringId: string;
  priceId?: string;
  /** What the picker knew at the moment of the pick, so a server with no
   *  catalogue in the request still has words to print. */
  snapshot?: Record<string, unknown>;
}

/** The two kinds the pane offers that are a PICKER and not a widget. */
export const PANEL_TILES = ["product_cards", "product_line_items"] as const;
export type PanelTile = (typeof PANEL_TILES)[number];

export function isPanelTile(kind: string): kind is PanelTile {
  return (PANEL_TILES as readonly string[]).includes(kind);
}

/**
 * THE ONE EXPANSION. Picks in, nodes out.
 *
 * Product Cards → a row Container holding one `catalog_card` per pick, because
 * cards are compared side by side and the row is the thing that says "choose
 * one" (render.ts `offerNote`).
 * Product Line Items → a flat stack of `price_line`s, because money reads down
 * the page and each line is its own total.
 *
 * Returns [] for no picks: an author who opened the picker and cancelled has
 * added nothing, and a widget they did not choose is not a widget.
 */
export function expandPanelTile(tile: PanelTile, picks: CataloguePick[]): Node[] {
  const chosen = (picks || []).filter((p) => str(p?.offeringId));
  if (!chosen.length) return [];
  const bind = (p: CataloguePick, extra: Record<string, unknown>) => ({
    ...bindingDefaults("oliver:catalogue"),
    ...selectionProps("oliver:catalogue", { offeringId: str(p.offeringId), priceId: str(p.priceId || "") }),
    ...(p.snapshot ? { _ia_snapshot: p.snapshot } : {}),
    ...extra,
  });
  if (tile === "product_cards") {
    const cards = chosen.map((p) => makeWidget("catalog_card", bind(p, {})));
    return [makeContainer({ direction: "row", gap: 16 }, cards)];
  }
  return chosen.map((p) => makeWidget("price_line", bind(p, { quantity: 1 })));
}

function tilePrompt(what: string, ctx: RenderContext): string {
  return ctx.mode === "edit"
    ? `<div class="bx-imgdrop" data-ia-tile="1">${esc(what)}</div>`
    : "";
}

export function renderProductCards(_w: Widget, ctx: RenderContext): string {
  return tilePrompt("Pick the products to show as cards.", ctx);
}
export function renderProductLineItems(_w: Widget, ctx: RenderContext): string {
  return tilePrompt("Pick the products to add as priced lines.", ctx);
}

export const PRODUCT_CARDS_DEF: WidgetDef = {
  kind: "product_cards",
  label: "Product Cards",
  description: "Pick products from your catalogue and drop them in as cards, with today's price.",
  icon: "LayoutGrid",
  picture: pictureFrom(box(5, 8, 17, 26) + box(24, 5, 17, 29) + box(43, 8, 16, 26)
    + bar(9, 13, 9, 3) + bar(28, 10, 9, 3) + bar(47, 13, 8, 3)),
  category: "Intelligent Analytics",
  /* Proposals and both page builders. §11.13.3 puts Product Cards in all four
     IA columns; the mailbox's own is `product_card`, the composite that draws as
     tables and is on disk in stored newsletters, and it carries the name there
     (see the note at the top of this file). */
  adapters: ["proposal", "website", "landing"],
  tier: "ia:oliver",
  defaults: {},
  controls: [],
};

export const PRODUCT_LINE_ITEMS_DEF: WidgetDef = {
  kind: "product_line_items",
  label: "Product Line Items",
  description: "Pick products from your catalogue and add them as priced lines that feed the total.",
  icon: "ListOrdered",
  picture: pictureFrom(bar(6, 9, 30) + bar(46, 9, 12) + bar(6, 19, 34) + bar(46, 19, 12) + bar(6, 29, 26) + bar(46, 29, 12)),
  category: "Intelligent Analytics",
  adapters: DOCUMENTS,
  tier: "ia:oliver",
  defaults: {},
  controls: [],
};

/* ══════════════════════════════════════════════════════════════════════════
   Email — §11.13.3 row two
   ══════════════════════════════════════════════════════════════════════════ */

export function renderIaPosts(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  if (!items.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Bring in your latest posts, or type them here.</div>` : "";
  }
  const side = str(p.layout || "beside") === "beside";
  return `<div class="bx-posts">${items.map((it, i) => `
    <div class="bx-post" style="display:flex;flex-direction:${side ? "row" : "column"};gap:10px;margin-bottom:12px">
      ${it?.image ? `<img src="${esc(str(it.image))}" alt="" style="${side ? "width:120px;" : "width:100%;"}border-radius:6px;object-fit:cover"/>` : ""}
      <div style="flex:1 1 auto;min-width:0">
        ${editRun(`items.${i}.title`, it?.title, "bx-h bx-h3", "The headline", ctx)}
        ${editRun(`items.${i}.excerpt`, it?.excerpt, "bx-p", "A line or two", ctx, "p")}
        ${it?.url ? `<a class="bx-post-l" href="${esc(str(it.url))}" style="color:${esc(ctx.accent)}">Read the rest</a>` : ""}
      </div>
    </div>`).join("")}</div>`;
}

export const IA_POSTS_DEF: WidgetDef = {
  kind: "ia_posts",
  label: "IA Posts",
  description: "Your stories, each with a picture, a few lines and a link to read the rest.",
  icon: "Newspaper",
  picture: pictureFrom(solid(8, 8, 18, 24) + bar(30, 10, 26, 5) + bar(30, 20, 26) + bar(30, 28, 16)),
  category: "Intelligent Analytics",
  /* NOT `email`: the mailbox's own **IA Posts** is `article_card`, which draws
     as tables and is on disk in stored newsletters (see the note above). */
  adapters: ["website", "landing"],
  defaults: { items: [], layout: "beside" },
  controls: [
    { key: "items", label: "Posts", type: "list", tab: "content", section: "Posts",
      help: "Bring them in from your website, or type them here." },
    { key: "layout", label: "Layout", type: "select", tab: "content", section: "Posts", options: [
      { value: "beside", label: "Picture beside the words" }, { value: "above", label: "Picture above the words" }] },
  ],
};

export function renderReviews(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  if (!items.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Your reviews appear here once they are brought in.</div>` : "";
  }
  return `<div class="bx-reviews">${items.map((it, i) => `
    <blockquote class="bx-quote">
      ${editRun(`items.${i}.quote`, it?.quote, "bx-p", "What they said", ctx, "p")}
      <span class="bx-stars" style="color:${esc(ctx.accent)};letter-spacing:2px">${
    "★".repeat(Math.max(0, Math.min(5, Number(it?.rating) || 5)))}</span>
      <footer class="bx-attrib">${esc(str(it?.author))}</footer>
    </blockquote>`).join("")}</div>`;
}

export const REVIEWS_DEF: WidgetDef = {
  kind: "reviews",
  label: "Reviews",
  description: "Real reviews of your business, with the stars and who left them.",
  icon: "Stars",
  picture: pictureFrom(box(5, 8, 26, 24) + box(34, 8, 25, 24) + bar(9, 13, 18, 3) + bar(9, 20, 13, 3)
    + bar(38, 13, 17, 3) + bar(38, 20, 12, 3)),
  category: "Intelligent Analytics",
  /* NOT `email` yet: this surface has no table renderer for it, and a tile
     that puts nothing in an inbox is worse than one that is not there. Item S2
     in the handoff. */
  adapters: ["website", "landing"],
  defaults: { items: [] },
  controls: [
    { key: "items", label: "Reviews", type: "list", tab: "content", section: "Reviews" },
  ],
};

export function renderBookNow(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const label = str(p.label) || "Book now";
  return `<div class="bx-booknow" style="text-align:${esc(str(p.align) || "left")}">
    <a class="bx-button" style="background:${esc(ctx.accent)}" href="${esc(str(p.url) || "#")}">${
    ctx.mode === "edit" ? `<span data-edit="label">${esc(label)}</span>` : esc(label)}</a>
  </div>`;
}

export const BOOK_NOW_DEF: WidgetDef = {
  kind: "book_now",
  label: "Book Now",
  description: {
    email: "A button that takes the reader straight to your booking form.",
    website: "A button that takes a visitor straight to your booking page.",
    landing: "A button that takes a visitor straight to your booking page.",
  },
  icon: "CalendarCheck",
  picture: pictureFrom(`<rect x="16" y="13" width="32" height="14" rx="7" fill="#94A3B8" stroke="none"/>` + bar(23, 18, 18, 4)),
  category: "Intelligent Analytics",
  // NOT `email` yet — see Reviews above, and item S2 in the handoff.
  adapters: ["website", "landing"],
  defaults: { label: "Book now", url: "", align: "left" },
  controls: [
    { key: "label", label: "Button text", type: "text", tab: "content", section: "Book Now" },
    { key: "url", label: "Where it goes", type: "link", tab: "content", section: "Book Now" },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Book Now", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
  ],
};

/* `UNSUBSCRIBE_FOOTER_DEF` and `renderUnsubscribeFooter` LIVED HERE and are
   DELETED (D-165, second pass). §11.13.3 names the email's required footer
   **Unsubscribe Footer**, and there was already a kind that IS one:
   `email_footer`, on disk in every stored newsletter and drawn as tables by
   `adapters/email/emailRender.ts`. The shared vocabulary's first rule settles
   it — "internal kind ids that exist today KEEP their ids … what changes is
   the LABEL, the GROUP and the icon" — so `email_footer` took the name and this
   one went. A second footer kind would have been a tile that puts nothing in an
   inbox. */

/* ══════════════════════════════════════════════════════════════════════════
   Website and landing — §11.13.3 rows three and four
   ══════════════════════════════════════════════════════════════════════════ */

export function renderIaForm(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const fields: any[] = Array.isArray(p.fields) ? p.fields : [];
  const shown = fields.length ? fields : [{ label: "Name" }, { label: "Email" }, { label: "How can we help?" }];
  return `<form class="bx-form" onsubmit="return false">${shown.map((f, i) => `
    <label class="bx-form-f" style="display:block;margin-bottom:8px">
      <span class="bx-form-l" style="display:block;font-size:11px;color:#5A7A8A;margin-bottom:3px"${
    ctx.mode === "edit" ? ` data-edit="fields.${i}.label"` : ""}>${esc(str(f?.label))}</span>
      <span class="bx-form-i" style="display:block;border:1px solid #CBD5E1;border-radius:6px;height:32px"></span>
    </label>`).join("")}
    <span class="bx-button" style="background:${esc(ctx.accent)}"${
    ctx.mode === "edit" ? ` data-edit="submit_label"` : ""}>${esc(str(p.submit_label) || "Send")}</span>
  </form>`;
}

export const IA_FORM_DEF: WidgetDef = {
  kind: "ia_form",
  label: "IA Form",
  description: "Fields a visitor fills in — every submission lands in your inbox and your contacts.",
  icon: "ClipboardList",
  picture: pictureFrom(box(10, 6, 44, 10) + box(10, 19, 44, 10)
    + `<rect x="10" y="32" width="20" height="6" rx="3" fill="#94A3B8" stroke="none"/>`),
  category: "Intelligent Analytics",
  adapters: PAGES,
  defaults: { fields: [], submit_label: "Send" },
  controls: [
    { key: "fields", label: "Fields", type: "list", tab: "content", section: "Form" },
    { key: "submit_label", label: "Button text", type: "text", tab: "content", section: "Form" },
  ],
};

export function renderNewsletterSignup(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  return `<div class="bx-signup" style="border:1px solid #E2E8F0;border-radius:8px;padding:12px">
    ${editRun("heading", p.heading, "bx-h bx-h3", "Join the list", ctx)}
    ${editRun("blurb", p.blurb, "bx-p", "What they get, and how often", ctx, "p")}
    <div style="display:flex;gap:8px;align-items:center">
      <span style="flex:1 1 auto;border:1px solid #CBD5E1;border-radius:6px;height:32px"></span>
      <span class="bx-button" style="background:${esc(ctx.accent)}"${
    ctx.mode === "edit" ? ` data-edit="button_label"` : ""}>${esc(str(p.button_label) || "Sign up")}</span>
    </div>
  </div>`;
}

export const NEWSLETTER_SIGNUP_DEF: WidgetDef = {
  kind: "newsletter_signup",
  label: "Newsletter Signup",
  description: "One box and a button — an address straight onto your mailing list.",
  icon: "Mail",
  picture: pictureFrom(bar(8, 8, 30, 5) + box(8, 18, 34, 12)
    + `<rect x="45" y="18" width="13" height="12" rx="3" fill="#94A3B8" stroke="none"/>`),
  category: "Intelligent Analytics",
  adapters: PAGES,
  defaults: { heading: "", blurb: "", button_label: "Sign up", list_id: "" },
  controls: [
    { key: "heading", label: "Heading", type: "text", tab: "content", section: "Newsletter Signup" },
    { key: "blurb", label: "One line under it", type: "textarea", tab: "content", section: "Newsletter Signup" },
    { key: "button_label", label: "Button text", type: "text", tab: "content", section: "Newsletter Signup" },
  ],
};

export function renderHoursLocation(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const hours: any[] = Array.isArray(p.hours) ? p.hours : [];
  return `<div class="bx-hours">
    ${editRun("heading", p.heading, "bx-h bx-h3", "Where to find us", ctx)}
    ${editRun("address", p.address, "bx-p", "Your address", ctx, "p")}
    ${hours.length
      ? `<div class="bx-hours-rows">${hours.map((h, i) => `
        <div class="bx-fact" style="display:flex;justify-content:space-between;gap:12px;padding:3px 0">
          <span class="bx-fact-k"${ctx.mode === "edit" ? ` data-edit="hours.${i}.day"` : ""}>${esc(str(h?.day))}</span>
          <span class="bx-fact-v"${ctx.mode === "edit" ? ` data-edit="hours.${i}.open"` : ""}>${esc(str(h?.open))}</span>
        </div>`).join("")}</div>`
      : ctx.mode === "edit" ? `<div class="bx-card-note">Add your opening hours in the panel on the right.</div>` : ""}
  </div>`;
}

export const HOURS_LOCATION_DEF: WidgetDef = {
  kind: "hours_location",
  label: "Hours and Location",
  description: "When you are open and where to find you.",
  icon: "Clock",
  picture: pictureFrom(`<circle cx="16" cy="20" r="10" fill="none" stroke="#94A3B8"/>`
    + `<path d="M16 14v6l4 3" stroke="#94A3B8"/>` + bar(32, 12, 24) + bar(32, 21, 18) + bar(32, 29, 22)),
  category: "Intelligent Analytics",
  adapters: PAGES,
  defaults: { heading: "", address: "", hours: [] },
  controls: [
    { key: "heading", label: "Heading", type: "text", tab: "content", section: "Hours and Location" },
    { key: "address", label: "Address", type: "text", tab: "content", section: "Hours and Location" },
    { key: "hours", label: "Opening hours", type: "list", tab: "content", section: "Hours and Location" },
  ],
};

/* ── The five that already exist in the WordPress plugin ───────────────────
   §11.13.3: "already in the plugin: IA Mega Menu, IA Mobile Menu, IA Posts,
   IA OLIVER Invoice, IA Social Links". The plugin draws them on the published
   site; what the CANVAS draws is the shape they make, so the author can place
   and move them like anything else. IA Posts is above, because an email uses it
   too. */

function pluginStub(name: string, note: string, ctx: RenderContext): string {
  return ctx.mode === "edit"
    ? `<div class="bx-plugin" style="border:1px dashed #CBD5E1;border-radius:8px;padding:12px;color:#64748B;font-size:11px">
        <strong style="display:block;color:#0B1C24">${esc(name)}</strong>${esc(note)}</div>`
    : "";
}

export function renderIaMegaMenu(_w: Widget, ctx: RenderContext): string {
  return pluginStub("IA Mega Menu", "Your full menu, drawn on the published page.", ctx);
}
export function renderIaMobileMenu(_w: Widget, ctx: RenderContext): string {
  return pluginStub("IA Mobile Menu", "The phone menu, drawn on the published page.", ctx);
}
export function renderIaOliverInvoice(_w: Widget, ctx: RenderContext): string {
  return pluginStub("IA OLIVER Invoice", "A customer's invoice, shown once they are signed in.", ctx);
}
export function renderIaSocialLinks(_w: Widget, ctx: RenderContext): string {
  return pluginStub("IA Social Links", "Your accounts, from your business profile.", ctx);
}

const pluginDef = (
  kind: string, label: string, description: string, icon: string, picture: string,
  adapters: WidgetDef["adapters"],
): WidgetDef => ({
  kind, label, description, icon, picture,
  category: "Intelligent Analytics",
  adapters,
  defaults: {},
  controls: [],
});

export const IA_MEGA_MENU_DEF = pluginDef(
  "ia_mega_menu", "IA Mega Menu", "Your full site menu, with everything on it.", "Menu",
  pictureFrom(bar(6, 8, 52, 6) + box(6, 18, 52, 16) + bar(10, 23, 14, 3) + bar(28, 23, 14, 3) + bar(46, 23, 8, 3)),
  SITE_ONLY);

export const IA_MOBILE_MENU_DEF = pluginDef(
  "ia_mobile_menu", "IA Mobile Menu", "The menu a visitor sees on a phone.", "MenuSquare",
  pictureFrom(box(22, 4, 20, 32) + bar(26, 10, 12, 3) + bar(26, 17, 12, 3) + bar(26, 24, 12, 3)),
  SITE_ONLY);

export const IA_OLIVER_INVOICE_DEF = pluginDef(
  "ia_oliver_invoice", "IA OLIVER Invoice", "A customer's own invoice, shown once they are signed in.", "Receipt",
  pictureFrom(box(14, 4, 36, 32) + bar(19, 11, 20, 3) + bar(19, 19, 26, 3) + bar(19, 27, 14, 3)),
  PAGES);

export const IA_SOCIAL_LINKS_DEF = pluginDef(
  "ia_social_links", "IA Social Links", "Your accounts, taken from your business profile.", "Link2",
  pictureFrom(`<circle cx="18" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="5" fill="#94A3B8" stroke="none"/>`),
  PAGES);
