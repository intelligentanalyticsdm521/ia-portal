/**
 * builder/widgets/iaBlocks.ts — the **Intelligent Analytics** group: the tiles
 * that are ours rather than Elementor's.
 *
 * §11.13.3's fourth column, in its own order, per builder.
 *
 * The two PANEL TILES — Product Cards and Product Line Items — used to be
 * declared here as well as in `proposal/catalogueTiles.ts`. One of the two was
 * wired to the screen and the other was not; see the block below for which
 * went and why.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom, solid } from "../pictures";
import { editRun } from "./text";
import { bindingDefaults } from "./binding";
import { DOCUMENTS, PAGES, SENDS, SITE_ONLY } from "./audience";

const str = (v: unknown): string => (v == null ? "" : String(v));

/* ══════════════════════════════════════════════════════════════════════════
   THE TWO PANEL TILES LIVED HERE AND ARE DELETED (integration, 2026-09-19)
   ══════════════════════════════════════════════════════════════════════════

   **Product Cards** and **Product Line Items** are declared, drawn and expanded
   in `src/builder/proposal/catalogueTiles.ts`, which is the copy the screen
   really calls: `ProposalBuilder.tsx` opens the ONE catalogue picker from it,
   multi-select, and drops one atomic `catalog_card` / `price_line` per pick.
   This file held a second definition and a second `expandPanelTile`, wired to
   nothing. Two mechanisms for one concern, so the unwired one goes — replace
   means delete.

   They are `adapters: ["proposal"]` there. §11.13.3 asks for Product Cards on
   the website, the landing page and the email too; the picker is wired into the
   proposal adapter only, and a tile that opens nothing is worse than a tile
   that is not there. The ask is R-3.5 in D165_HANDOFF_2026-09-19.md. */

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

/* `renderReviews` and `REVIEWS_DEF` LIVED HERE and are MOVED (B-168, F5).
   The kind `reviews` keeps its id and its stored props, and now lives in
   `widgets/families/f5-sliders-reviews/reviews.ts` beside the three sliders
   that repeat a quote. It is ELEMENTOR's Reviews there, because `reviews` is
   the page engine's own slug and arion has to publish that widgetType; the IA
   twin the offer file calls **IA Reviews** is the new kind `ia_reviews`, same
   panel, filled from the business's own reviews. The renderer still reads the
   old `items` array, so a page already carrying reviews draws unchanged.
   Replace means delete. */

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
  /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
     `hidden` is the registry's own way to keep a kind in the vocabulary so a
     document already carrying it still draws; deleting the renderer would
     blank a page a customer has. See test/builder-offers.test.mjs. */
  hidden: true,
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
  /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
     `hidden` is the registry's own way to keep a kind in the vocabulary so a
     document already carrying it still draws; deleting the renderer would
     blank a page a customer has. See test/builder-offers.test.mjs. */
  hidden: true,
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
  /* WEBSITE ONLY (D-168). The offer file lists it under `website.ia` and not
     under `landing.ia` — a hosted landing page has no signed-in customer to
     show an invoice to. It was on both. */
  SITE_ONLY);

export const IA_SOCIAL_LINKS_DEF = pluginDef(
  "ia_social_links", "IA Social Links", "Your accounts, taken from your business profile.", "Link2",
  pictureFrom(`<circle cx="18" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="5" fill="#94A3B8" stroke="none"/>`),
  PAGES);
