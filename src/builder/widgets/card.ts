/**
 * builder/widgets/card.ts — ONE CARD. Typed by hand.
 *
 * D-156, Brandon's sentence: *"custom cards where they just type the card
 * headers, add a price, and description inside the cards"*.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * `comparison_cards` was ONE widget holding a heading, an intro, a note and
 * two to six cards, with a "How many cards?" control deciding how many. You
 * could not select a card, could not delete a card, could not drag a card, and
 * could not put anything between two cards. This is one card, and it is a
 * widget like every other widget: select it, drag it, duplicate it, delete it.
 * A row of three is three of these in a row — which is the only thing "three
 * cards side by side" ever meant.
 *
 * ── THE CARDS DO NOT ADD UP, AND THEY STILL DO NOT ────────────────────────
 * totals.ts rule 1 is unchanged: a card is a thing on OFFER, and the customer
 * buys one. `PRICED_KINDS` does not list `card`, so nothing here reaches a
 * total. "Use this plan" on a Product card is what turns a choice into money.
 *
 * ── TOLERANT READER ───────────────────────────────────────────────────────
 * The fields are `title / description / was / bullets`. A card lifted out of an
 * old `comparison_cards` widget calls those `name / pitch / list_price /
 * features`, so `cardFields` reads both and the upgrade is free to land later
 * without a blank card in between.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom } from "../pictures";
import { hasTag, tagBorder, tagHtml } from "./tag";
import { editRun, fillText, proseRun } from "./text";

export interface CardFields {
  title: string;
  price: string;
  per: string;
  was: string;
  description: string;
  bullets: string[];
  note: string;
  ctaLabel: string;
  ctaUrl: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The card's words, whichever generation of the model wrote them. */
export function cardFields(props: Record<string, unknown> | undefined | null): CardFields {
  const p: any = props || {};
  const bullets = Array.isArray(p.bullets) ? p.bullets : Array.isArray(p.features) ? p.features : [];
  return {
    title: str(p.title ?? p.name),
    price: str(p.price),
    per: str(p.per),
    was: str(p.was ?? p.list_price),
    description: str(p.description ?? p.pitch),
    bullets: bullets.map(str),
    note: str(p.note),
    ctaLabel: str(p.ctaLabel),
    ctaUrl: str(p.ctaUrl),
  };
}

/** Which prop name this document is using for the bullets. Writers need it. */
export function bulletsKey(props: Record<string, unknown> | undefined | null): "bullets" | "features" {
  const p: any = props || {};
  return Array.isArray(p.bullets) || !Array.isArray(p.features) ? "bullets" : "features";
}

/**
 * The card, drawn.
 *
 * `extra` is the one line a Product card adds under the price — where the
 * figure came from — so the two cards are the same card with one difference
 * rather than two renderers that drift.
 */
export function renderCardBody(
  w: Widget,
  ctx: RenderContext,
  opts: { extra?: string; pricePath?: string; readOnlyPrice?: boolean } = {},
): string {
  const p: any = w.props || {};
  const f = cardFields(p);
  const editing = ctx.mode === "edit";
  const bk = bulletsKey(p);
  // While editing, the OPTIONAL parts are always on the page as empty slots and
  // the bullet list always has one blank line at the end (D-01). A run that is
  // only drawn once it already has words cannot be typed into at all.
  const slots = editing ? [...f.bullets, ""] : f.bullets;
  const opt = (cond: unknown, html: string) => (cond || editing ? html : "");
  const border = tagBorder(p, ctx.accent);
  const pricePath = opts.pricePath ?? "price";

  return `<div class="bx-card${hasTag(p) ? " bx-card-rec" : ""}"${border ? ` style="border-color:${esc(border)}"` : ""}>
    ${tagHtml(p, ctx.accent)}
    ${editRun("title", f.title, "bx-card-name", "Name this option…", ctx)}
    <div class="bx-card-price">
      ${opts.readOnlyPrice
        ? `<span class="bx-now">${esc(f.price)}</span>`
        : `<span class="bx-now${f.price ? "" : " bx-slot bx-now-slot"}" data-edit="${esc(pricePath)}" data-placeholder="$0.00">${fillText(f.price, ctx)}</span>`}
      ${opt(f.per, opts.readOnlyPrice
        ? `<span class="bx-per">${esc(f.per)}</span>`
        : `<span class="bx-per${f.per ? "" : " bx-slot"}" data-edit="per" data-placeholder="/mo">${fillText(f.per, ctx)}</span>`)}
      ${opt(f.was, `<span class="bx-was${f.was ? "" : " bx-slot"}" data-edit="was" data-placeholder="was…">${fillText(f.was, ctx)}</span>`)}
    </div>
    ${opts.extra || ""}
    ${proseRun("description", f.description, "bx-card-pitch", "What makes this worth having…", ctx)}
    <ul class="bx-card-feats">${slots.map((b, i) =>
      `<li${b ? "" : ` class="bx-slot" data-placeholder="add a line…"`} data-edit="${bk}.${i}">${fillText(b, ctx)}</li>`).join("")}</ul>
    ${opt(f.note, `<div class="bx-card-note${f.note ? "" : " bx-slot"}" data-edit="note" data-placeholder="small note…">${fillText(f.note, ctx)}</div>`)}
    ${f.ctaLabel
      ? `<a class="bx-button" style="background:${esc(ctx.accent)};margin-top:10px" href="${esc(f.ctaUrl || "#")}"><span data-edit="ctaLabel">${fillText(f.ctaLabel, ctx)}</span></a>`
      : ""}
  </div>`;
}

export function renderCard(w: Widget, ctx: RenderContext): string {
  return renderCardBody(w, ctx);
}

export const CARD_DEF: WidgetDef = {
  kind: "card",
  label: "Card",
  description: "One option, with its price and what is included. Put two or three side by side.",
  task: "Products & services",
  icon: "CreditCard",
  picture: pictureFrom(box(18, 4, 28, 32) + bar(23, 10, 18, 5) + bar(23, 19, 12) + bar(23, 26, 18)),
  category: "Money",
  // D-156 slice one is the PROPOSAL. These replace proposal composites, and
  // the email, website and landing panes have locked widget sets of their own
  // (§7, §4 step 3) that a widget cannot join without that adapter's renderer
  // drawing it. D-157 widens them; the handoff carries the ask.
  adapters: ["proposal"],
  defaults: {
    title: "", price: "", per: "", was: "", description: "", bullets: [], note: "",
    tag: null, ctaLabel: "", ctaUrl: "",
  },
  controls: [
    { key: "title", label: "What this option is called", type: "text" },
    { key: "price", label: "Price", type: "text", help: "Type it as the customer should read it — $525, or “from $525”." },
    { key: "per", label: "Per", type: "text", help: "/mo, per push, per visit — whatever it is billed on." },
    { key: "was", label: "Was", type: "text", help: "Leave empty unless you are showing a saving." },
    { key: "description", label: "Why it is worth having", type: "textarea" },
    { key: "bullets", label: "What is included", type: "list" },
    { key: "note", label: "Small print under the card", type: "text" },
    { key: "ctaLabel", label: "Button wording", type: "text", help: "Leave empty for no button." },
    { key: "ctaUrl", label: "Button address", type: "link" },
  ],
};
