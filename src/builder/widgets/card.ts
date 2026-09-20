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
 * ── THE FIELD NAMES ARE THE PRICE TABLE'S (conformance, 2026-09-17) ───────
 * The card in the catalogue is `price-table`, and its Content tab is seventeen
 * controls in five panel sections: Header (`heading`, `sub_heading`,
 * `heading_tag`), Pricing (`currency_symbol`, `currency_symbol_custom`,
 * `price`, `currency_format`, `sale`, `original_price`, `period`), Features
 * (`features_list`), Footer (`button_text`, `link`,
 * `footer_additional_info`) and Ribbon (`show_ribbon`, `ribbon_title`,
 * `ribbon_horizontal_position`).
 *
 * A card now WRITES those names. It used to write `title / per / was /
 * bullets / note / ctaLabel / ctaUrl` and merely tolerate the price table's
 * on the way in, which meant a page published to a website came back spelled
 * one way and stored spelled another — two vocabularies for one card, with the
 * translation living in whichever reader you happened to be in. One spelling,
 * and every older one is an alias `upgrade.ts` renames on open.
 *
 * `description` stays ours: the price table's `sub_heading` is a one-line
 * strapline and this is a paragraph, so the two are read as one field and the
 * one a card writes is the one whose name says what it is.
 */
import type { Widget } from "../model";
import { esc } from "../esc";
import { type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom } from "../pictures";
/* `ribbon` for the PRESET LIST, which `controls` below reads while this module
   is still evaluating, and `tag` for the two functions that draw one. Two
   imports, one vocabulary — see ribbon.ts's header for why the split exists. */
import { RIBBON_PRESETS } from "./ribbon";
import { hasTag, tagBorder, tagHtml } from "./tag";
import { editRun, fillText, proseRun } from "./text";
/* WHAT IS INCLUDED — the repeater's shape and its edit path, in the module
   with no imports (see features.ts's header for the cycle that forced it). */
import { bulletsKey, featurePath, featureTexts } from "./features";
export {
  bulletsKey, featureItem, featurePath, featureText, featureTexts,
} from "./features";

/**
 * The card's words, in the card's own names.
 *
 * `cta` is one field with two halves because a mailbox wants it as an object
 * and the price table wants it as `button_text` + `link`; the reader answers
 * both so no surface has to guess.
 */
export interface CardFields {
  heading: string;
  /** The element the heading is drawn as. Empty means a plain line. */
  heading_tag: string;
  price: string;
  /** Which symbol goes before the price. Empty means "it is in the price". */
  currency_symbol: string;
  period: string;
  original_price: string;
  /** True when the original price is a saving being shown, not a leftover. */
  sale: boolean;
  description: string;
  features_list: string[];
  footer_additional_info: string;
  button_text: string;
  link: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * THE CURRENCY SYMBOLS, in plain words.
 *
 * The price table's `currency_symbol` select, cut to the ones a business on
 * this platform bills in, plus Custom for anything else — its
 * `currency_symbol_custom`. The KEY is the price table's own word so the
 * published page and the stored card say the same thing; the LABEL is what an
 * author reads, and it names the currency rather than the glyph, because
 * "dollar" is a choice and "$" is a character.
 */
export const CURRENCY_SYMBOLS: ReadonlyArray<{ key: string; label: string; glyph: string }> = [
  { key: "", label: "I type it with the price", glyph: "" },
  { key: "dollar", label: "Dollar $", glyph: "$" },
  { key: "euro", label: "Euro €", glyph: "€" },
  { key: "pound", label: "Pound £", glyph: "£" },
  { key: "yen", label: "Yen ¥", glyph: "¥" },
  { key: "rupee", label: "Rupee ₹", glyph: "₹" },
  { key: "custom", label: "Something else", glyph: "" },
];

/** Every glyph we would ever put in front of a price, for the strip below. */
const GLYPHS = CURRENCY_SYMBOLS.map((c) => c.glyph).filter(Boolean);

/**
 * The glyph this card puts before its price, or "".
 *
 * `custom` reads `currency_symbol_custom`, which is the price table's own
 * second key rather than a third spelling of the same idea.
 */
export function currencyGlyph(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  const key = str(p.currency_symbol).trim();
  if (!key) return "";
  if (key === "custom") return str(p.currency_symbol_custom).trim();
  return CURRENCY_SYMBOLS.find((c) => c.key === key)?.glyph ?? "";
}

/**
 * The number the price run shows.
 *
 * A card written before there was a currency control has the symbol INSIDE the
 * price — "$525" — because that was the only place to put it. Setting the
 * control on that card must not make it read "$$525", so exactly one leading
 * glyph is taken off when a symbol is being drawn beside it. Nothing is
 * stripped when no symbol is set, which is why every card already on the line
 * prints exactly what it printed.
 */
export function priceWithoutSymbol(price: string, glyph: string): string {
  if (!glyph) return price;
  const trimmed = price.replace(/^\s+/, "");
  const lead = trimmed.charAt(0);
  return GLYPHS.includes(lead) || lead === glyph ? trimmed.slice(1) : price;
}

/**
 * The card's words, in ANY of the vocabularies that can hold them.
 *
 * ONE reader, because three readers is three chances to show a blank card —
 * and there WERE three: this one, the email renderer's `emCardFields` and the
 * landing renderer's `lpCardFields`, each picking the same fields in the same
 * order from its own copy of the list. They all call this now.
 *
 *   1. The card's own names, which are the price table's — `heading / price /
 *      currency_symbol / period / original_price / sale / features_list /
 *      footer_additional_info / button_text / link`. What a card WRITES, what
 *      the website adapter publishes, and what a page read back off a live
 *      site arrives as.
 *   2. D-156's first names — `title / per / was / bullets / note / ctaLabel /
 *      ctaUrl` — so a card saved in the day those were written still draws.
 *   3. The composite tier card's — `name / list_price / pitch / features` — so
 *      a card lifted out of an old `comparison_cards` draws whether or not the
 *      upgrade has reached that document yet.
 *   4. An email's `cta: { label, url }` object, which is one field in two
 *      halves rather than a fourth vocabulary.
 *
 * `upgrade.ts` rewrites 2 and 3 into 1 on every read path, so these are
 * aliases with an end date rather than a second answer.
 */
export function cardFields(props: Record<string, unknown> | undefined | null): CardFields {
  const p: any = props || {};
  const pick = (...vs: unknown[]) => vs.find((v) => v !== undefined && v !== null && v !== "");
  const features = [p.features_list, p.bullets, p.features]
    .find((v) => Array.isArray(v) && v.length) as unknown[] | undefined;
  const label = pick(p.button_text, p.ctaLabel, p.cta?.label);
  const url = pick(
    p.ctaUrl,
    p.link?.url, typeof p.link === "string" ? p.link : undefined,
    p.cta?.url,
  );
  const price = str(p.price);
  return {
    heading: str(pick(p.heading, p.title, p.name)),
    heading_tag: str(p.heading_tag),
    price,
    currency_symbol: str(p.currency_symbol),
    period: str(pick(p.period, p.per)),
    original_price: str(pick(p.original_price, p.was, p.list_price)),
    /* `sale` is the price table's switcher. ABSENT means "this card is older
       than the switch": it carries an original price and meant a saving by
       putting it there, so the presence of the number is the fallback. An
       EMPTY STRING is Elementor's own "off" and is a decision — the two are
       different states and reading them as one is how a number the author
       took off comes back struck through on a contract. */
    sale: p.sale === undefined || p.sale === null
      ? !!str(pick(p.original_price, p.was, p.list_price))
      : (p.sale === "yes" || p.sale === true),
    description: str(pick(p.description, p.pitch, p.sub_heading)),
    features_list: featureTexts(features ?? []),
    footer_additional_info: str(pick(p.footer_additional_info, p.note)),
    button_text: str(label),
    link: str(url),
  };
}






/** Elementor's `heading_tag` list, and nothing else: a tag is markup. */
const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6"];

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
  opts: {
    extra?: string;
    pricePath?: string;
    readOnlyPrice?: boolean;
    /**
     * WHERE A TYPED WORD GOES, for a card whose words come from somewhere else.
     *
     * A catalogue card's name and description are the CATALOGUE's until the
     * author types over them, and F.2 says a retyped field goes into
     * `overrides` and is marked "typed, not live". Without this the runs wrote
     * `props.heading` — the card's own field — so `overriddenFields` saw
     * nothing, the sentence never appeared and "Put it back" had nothing to
     * put back. Found by driving it, 2026-09-17.
     */
    into?: "overrides";
  } = {},
): string {
  const p: any = w.props || {};
  const f = cardFields(p);
  const editing = ctx.mode === "edit";
  const path = (key: string) => (opts.into === "overrides" ? `overrides.${key}` : key);
  // ONE path per feature line, from the widget's own module — the repeater's
  // `features_list.<n>.item_text`, or the flat `bullets.<n>` a card that has
  // not been through the upgrade still carries.
  const featureEdit = (i: number) => path(featurePath(p, i));
  // While editing, the OPTIONAL parts are always on the page as empty slots and
  // the bullet list always has one blank line at the end (D-01). A run that is
  // only drawn once it already has words cannot be typed into at all.
  const slots = editing ? [...f.features_list, ""] : f.features_list;
  const opt = (cond: unknown, html: string) => (cond || editing ? html : "");
  const border = tagBorder(p, ctx.accent);
  const pricePath = opts.pricePath ?? "price";
  const glyph = currencyGlyph(p);
  const shown = priceWithoutSymbol(f.price, glyph);
  const tag = HEADING_TAGS.includes(f.heading_tag) ? f.heading_tag : "div";
  // The ORIGINAL price is only drawn when the author says it is a saving. A
  // number left in the box behind a switch they turned off is a draft, not a
  // price a customer should read as struck through.
  const wasShown = f.sale ? f.original_price : "";

  return `<div class="bx-card${hasTag(p) ? " bx-card-rec" : ""}"${border ? ` style="border-color:${esc(border)}"` : ""}>
    ${tagHtml(p, ctx.accent)}
    ${editRun(path("heading"), f.heading, "bx-card-name", "Name this option…", ctx, tag)}
    <div class="bx-card-price">
      ${glyph ? `<span class="bx-cur">${esc(glyph)}</span>` : ""}
      ${opts.readOnlyPrice
        ? `<span class="bx-now">${esc(shown)}</span>`
        : `<span class="bx-now${shown ? "" : " bx-slot bx-now-slot"}" data-edit="${esc(pricePath)}" data-placeholder="$0.00">${fillText(shown, ctx)}</span>`}
      ${opt(f.period, opts.readOnlyPrice
        ? `<span class="bx-per">${esc(f.period)}</span>`
        : `<span class="bx-per${f.period ? "" : " bx-slot"}" data-edit="period" data-placeholder="/mo">${fillText(f.period, ctx)}</span>`)}
      ${opt(wasShown, `<span class="bx-was${wasShown ? "" : " bx-slot"}" data-edit="original_price" data-placeholder="was…">${fillText(wasShown, ctx)}</span>`)}
    </div>
    ${opts.extra || ""}
    ${proseRun(path("description"), f.description, "bx-card-pitch", "What makes this worth having…", ctx)}
    <ul class="bx-card-feats">${slots.map((b, i) =>
      `<li${b ? "" : ` class="bx-slot" data-placeholder="add a line…"`} data-edit="${esc(featureEdit(i))}">${fillText(b, ctx)}</li>`).join("")}</ul>
    ${opt(f.footer_additional_info, `<div class="bx-card-note${f.footer_additional_info ? "" : " bx-slot"}" data-edit="footer_additional_info" data-placeholder="small note…">${fillText(f.footer_additional_info, ctx)}</div>`)}
    ${f.button_text
      ? `<a class="bx-button" style="background:${esc(ctx.accent)};margin-top:10px" href="${esc(f.link || "#")}"><span data-edit="button_text">${fillText(f.button_text, ctx)}</span></a>`
      : ""}
  </div>`;
}

export function renderCard(w: Widget, ctx: RenderContext): string {
  return renderCardBody(w, ctx);
}

export const CARD_DEF: WidgetDef = {
  kind: "card",
  /* D-168 — NOT IN THE OFFER Brandon approved, so it is not a tile.
     `hidden` is the registry's own way to keep a kind in the vocabulary so a
     document already carrying it still draws; deleting the renderer would
     blank a page a customer has. See test/builder-offers.test.mjs. */
  hidden: true,
  label: "Card",
  description: "One option, with its price and what is included. Put two or three side by side.",
  icon: "CreditCard",
  picture: pictureFrom(box(18, 4, 28, 32) + bar(23, 10, 18, 5) + bar(23, 19, 12) + bar(23, 26, 18)),
  category: "Intelligent Analytics",
  // WHERE IT MAY BE USED (catalogue F.1). D-156 slice one shipped these as
  // PROPOSAL-only; the panes that can actually DRAW them now offer them too.
  // The engine's own `renderAtom` draws this in every builder, and the website
  // publish path knows the kind by name, so nothing here is offered to a
  // surface that would drop it.
  /* §11.13.3 does not name "Card" in a builder's list, and it stays a tile
     anyway: it is D-156's own answer to Brandon's sentence — *"custom cards
     where they just type the card headers, add a price, and description"* —
     and Product Cards is the CATALOGUE-bound one beside it. The shared
     vocabulary gives it its label in as many words: "`card` -> 'Price Table' is
     NOT used (ours is 'Card')". */
  /* PROPOSALS ONLY (§11.13.3). The IA column for email, website and landing
     names **Product Cards** — the catalogue picker — and not a typed card, and
     a tile on a list the scope does not have it on is exactly the invention
     D-165 exists to stop. The kind is still drawn everywhere, so an email or a
     page that already holds one is unchanged. */
  adapters: ["proposal"],
  // A card on a website publishes as the price table, which is a paid widget
  // wherever it lands. The pane says so in the plan's own words; the SERVER
  // still decides whether this business's site carries it.
  tier: "pro",
  defaults: {
    heading: "", heading_tag: "", price: "", currency_symbol: "", period: "",
    original_price: "", sale: "", description: "", features_list: [],
    footer_additional_info: "", button_text: "", link: "",
    show_ribbon: "", ribbon_title: "", ribbon_color: "", ribbon_preset: "",
  },
  /* THE SECTIONS ARE THE PRICE TABLE'S FIVE (conformance, 2026-09-17).
     Heading · Pricing · Features · Footer · Ribbon, in that order, so an
     author who has ever built a pricing card anywhere finds the same five
     groups in the same order. The words themselves are typed ON THE PAGE —
     that is the engine's one editing mechanism and this does not add a second
     — so a section with nothing but words in it draws no panel group at all. */
  controls: [
    { key: "heading", label: "What this option is called", type: "text", section: "Heading" },
    /* Where `sub_heading` sits on the price table — second in its Header
       section. Ours is a paragraph rather than a strapline, so it keeps the
       name that says what it is, and it keeps the POSITION so the two panels
       read the same way down the page. */
    { key: "description", label: "Why it is worth having", type: "textarea", section: "Heading" },
    {
      key: "heading_tag", label: "Heading size", type: "select", section: "Heading",
      /* The VALUE is the price table's own (`h2`…`h6`) and the LABEL is what an
         author reads. They cannot be one string: "Biggest" does not slugify to
         `h2`, and "A plain line" does not slugify to the empty string. */
      options: [
        { value: "", label: "A plain line" },
        { value: "h2", label: "Biggest" },
        { value: "h3", label: "Big" },
        { value: "h4", label: "Medium" },
        { value: "h5", label: "Small" },
        { value: "h6", label: "Smallest" },
      ],
      help: "How large the name is, and how it reads to a screen reader.",
    },
    {
      key: "currency_symbol", label: "Currency", type: "select", section: "Pricing",
      options: CURRENCY_SYMBOLS.map((c) => ({ value: c.key, label: c.label })),
      help: "Drawn just before the price. Leave the first one if you type the symbol yourself.",
    },
    { key: "currency_symbol_custom", label: "Your own symbol", type: "text", section: "Pricing", help: "Only used when Currency is “Something else”." },
    { key: "price", label: "Price", type: "text", section: "Pricing", help: "Type it as the customer should read it — 525, or “from 525”." },
    { key: "period", label: "Per", type: "text", section: "Pricing", help: "/mo, per push, per visit — whatever it is billed on." },
    { key: "sale", label: "Show this as a saving", type: "toggle", section: "Pricing", help: "Strike through the old price beside the new one" },
    { key: "original_price", label: "Was", type: "text", section: "Pricing", help: "The old price. Only shown while “Show this as a saving” is on." },
    { key: "features_list", label: "What is included", type: "list", section: "Features" },
    { key: "footer_additional_info", label: "Small print under the card", type: "text", section: "Footer" },
    { key: "button_text", label: "Button wording", type: "text", section: "Footer", help: "Leave empty for no button." },
    { key: "link", label: "Button address", type: "link", section: "Footer" },
    { key: "show_ribbon", label: "Put a ribbon on this card", type: "toggle", section: "Ribbon", help: "A banner across the top corner" },
    {
      key: "ribbon_preset", label: "What it says", type: "select", section: "Ribbon",
      options: [
        ...RIBBON_PRESETS.map((r) => ({ value: r.preset, label: r.text })),
        { value: "custom", label: "Your own words" },
      ],
      help: "Only one card in a row can be the Recommended one.",
    },
    { key: "ribbon_title", label: "Your own words", type: "text", section: "Ribbon" },
    { key: "ribbon_color", label: "Ribbon colour", type: "colour", section: "Ribbon" },
    { key: "ribbon_text_color", label: "Ribbon text colour", type: "colour", section: "Ribbon" },
    {
      key: "ribbon_horizontal_position", label: "Which side", type: "select", section: "Ribbon",
      options: [{ value: "right", label: "Right" }, { value: "left", label: "Left" }],
    },
  ],
};
