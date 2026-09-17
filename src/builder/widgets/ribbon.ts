/**
 * builder/widgets/ribbon.ts — WHAT A RIBBON IS. This module imports NOTHING.
 *
 * D-157, Brandon: *"cards has a recommended section … add tag to this card …
 * Best Price & Most Popular"*.
 *
 * ── WHY THIS IS A FIELD AND NOT A WIDGET ──────────────────────────────────
 * A ribbon is never on its own: it is the little banner at the top of a card.
 * A draggable "tag" widget would have to be attached to the card next to it,
 * which is a second parent-child mechanism beside the one D-156 just built
 * (containers hold children; widgets are atomic and hold none). So the ribbon
 * is a set of FIELDS on the card, and this module owns their names, their
 * presets, their colours and their markup. One mechanism, one place, and "add
 * a tag to this card" is a control on the card.
 *
 * ── THE NAMES ARE THE PRICE TABLE'S (conformance, 2026-09-17) ─────────────
 * The catalogue's `price-table` already has this exact ribbon, and its four
 * Content-tab keys are `show_ribbon`, `ribbon_title`,
 * `ribbon_horizontal_position` and (on its Style tab) `ribbon_bg_color` /
 * `ribbon_text_color`. Those are the names a card writes now, so the website
 * adapter publishes what it stores and reads back what it published without a
 * translation table in between. Three things are OURS because the price table
 * has no answer for them, and they are spelled like its own keys so the set
 * reads as one vocabulary: `ribbon_color` (the price table calls the same
 * colour `ribbon_bg_color` on its Style tab; ours is one colour on the Content
 * tab, beside the words it paints), and `ribbon_preset` — the six one-click
 * wordings D-157 named, plus Custom.
 *
 * ── WHY IT IMPORTS NOTHING ────────────────────────────────────────────────
 * The same reason `kinds.ts` does. `treeOps.patchNode` enforces the
 * one-Recommended-per-row rule and needs `isRecommended` and `ribbonProps`;
 * the MARKUP needs `esc` from `render.ts`, and render.ts reaches back here
 * through `widgets/index.ts` while it is still evaluating. A module with no
 * imports cannot be half-built, so the tree and the renderer both read it
 * safely. `tag.ts` is the markup, and re-exports every name below, so no
 * caller has to know about the split.
 *
 * ── EVERY OLDER SPELLING IS STILL READ ────────────────────────────────────
 * `tag` (a `{ text, colour }` object or a plain string), the composite's
 * `badge`, and the pre-D-156 `recommended: true` boolean. `upgrade.ts` renames
 * them on every read path; this reader is what draws a card that reached a
 * page without passing through it. A ribbon a customer can already see must
 * never vanish because we renamed a key.
 */

export interface CardTag {
  /** What the ribbon says. Any words; the presets are shortcuts, not a list. */
  text: string;
  /** Any CSS colour. Empty means "the document's accent". */
  colour?: string;
  /** The words' own colour. Empty means the ribbon decides (white). */
  textColour?: string;
  /** Which side it sits on. Elementor's own two, and nothing else. */
  position?: RibbonPosition;
  /** Which of the six wordings this is, or `custom`. */
  preset?: RibbonPreset;
}

/** Elementor's `ribbon_horizontal_position`, exactly its two values. */
export type RibbonPosition = "left" | "right";

/**
 * The six wordings D-157 named, plus Custom.
 *
 * A preset is stored as its KEY, not its words, because the words are what a
 * later pass may reword and the rule below is about the MEANING: at most one
 * card in a row may be the recommended one.
 */
export type RibbonPreset =
  | "recommended" | "best_price" | "most_popular" | "best_value" | "new" | "limited" | "custom";

/** Preset → the words it puts on the ribbon, and the colour it seeds. */
export const RIBBON_PRESETS: ReadonlyArray<{
  preset: RibbonPreset; text: string; colour: string;
}> = [
  /* THE WORDS, in ONE capitalisation. Agreed with stream O on 2026-09-17 and
     byte-identical in oliver `lib/builderCard.js` and LUMEN
     `src/lib/builderCard.js`: sentence case, because "Best Price" is a product
     name and "Best price" is English. Three cards must not spell one idea
     three ways. */
  { preset: "recommended", text: "Recommended", colour: "" },
  { preset: "best_price", text: "Best price", colour: "#C2410C" },
  { preset: "most_popular", text: "Most popular", colour: "#6D28D9" },
  { preset: "best_value", text: "Best value", colour: "#15803D" },
  { preset: "new", text: "New", colour: "#0B6E8C" },
  { preset: "limited", text: "Limited", colour: "#B91C1C" },
];

/**
 * THE ONE PRESET A ROW MAY ONLY HAVE ONCE (catalogue F.1.4).
 *
 * *"At most one card in a row may carry `Recommended`. The model enforces it
 * (setting it on a second card clears the first), because two recommendations
 * is no recommendation."* The enforcing is in `treeOps.patchNode`, which is
 * the ONE seam every writer of a widget's props goes through; this is the name
 * it asks about.
 */
export const EXCLUSIVE_PRESET: RibbonPreset = "recommended";

const PRESET_KEYS = new Set<string>([...RIBBON_PRESETS.map((p) => p.preset), "custom"]);

/** The three Brandon named first, kept as the old export name for its callers. */
export const TAG_PRESETS: ReadonlyArray<{ text: string; colour: string }> =
  RIBBON_PRESETS.slice(0, 3).map(({ text, colour }) => ({ text, colour }));

/**
 * Colours offered beside the text box.
 *
 * Plain words, because "#C2410C" is not a colour anybody asked for. The
 * business's own accent is the first and the default, so a ribbon looks like
 * the rest of the document unless somebody deliberately makes it shout.
 */
export const TAG_COLOURS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Your brand colour", value: "" },
  { label: "Orange", value: "#C2410C" },
  { label: "Green", value: "#15803D" },
  { label: "Purple", value: "#6D28D9" },
  { label: "Red", value: "#B91C1C" },
  { label: "Slate", value: "#334155" },
];

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** Elementor's switcher is the string "yes"; a checkbox writes a boolean. */
function switchedOn(v: unknown): boolean {
  return v === "yes" || v === true;
}

function positionOf(v: unknown): RibbonPosition | undefined {
  const s = str(v);
  return s === "left" || s === "right" ? s : undefined;
}

function presetOf(v: unknown): RibbonPreset | undefined {
  const s = str(v);
  return PRESET_KEYS.has(s) ? (s as RibbonPreset) : undefined;
}

/** Which preset these words ARE, for a ribbon written before presets existed. */
export function presetForText(text: string): RibbonPreset {
  const hit = RIBBON_PRESETS.find((p) => p.text.toLowerCase() === str(text).toLowerCase());
  return hit ? hit.preset : "custom";
}

/**
 * The ribbon a card is actually wearing, or null.
 *
 * Tolerant in five directions, in ONE place. `show_ribbon` + `ribbon_title`
 * is what a card writes and what the website publishes; a `tag` object and a
 * plain `tag` string are what D-156 wrote for a day; `badge` is the
 * composite's; `recommended: true` is what the builder wrote before any of
 * them. Anything else is no ribbon at all, rather than an exception on a
 * customer's page.
 *
 * A `ribbon_title` behind a switched-OFF `show_ribbon` is IGNORED: a title
 * left behind a switch the author turned off is a draft, not a decision, and
 * printing it would put a word on a contract nobody chose.
 */
export function tagOf(props: Record<string, unknown> | undefined | null): CardTag | null {
  const p: any = props || {};
  const colourOf = (): string => str(p.ribbon_color ?? p.tagColour ?? p.ribbon_bg_color);
  const dress = (text: string, colour: string, preset?: RibbonPreset): CardTag => {
    const tag: CardTag = { text };
    if (colour) tag.colour = colour;
    const textColour = str(p.ribbon_text_color);
    if (textColour) tag.textColour = textColour;
    const position = positionOf(p.ribbon_horizontal_position);
    if (position) tag.position = position;
    const stored = presetOf(p.ribbon_preset);
    const resolved = stored ?? preset ?? presetForText(text);
    if (resolved) tag.preset = resolved;
    return tag;
  };

  // 1. THE CARD'S OWN NAMES, which are the price table's.
  if ("show_ribbon" in p || "ribbon_title" in p) {
    if (!switchedOn(p.show_ribbon)) return null;
    const text = str(p.ribbon_title);
    if (!text) return null;
    return dress(text, colourOf());
  }

  // 2. D-156's `tag`, as an object or as a plain string.
  const raw = p.tag;
  if (raw && typeof raw === "object") {
    const text = str((raw as any).text);
    if (!text) return null;
    return dress(text, str((raw as any).colour) || colourOf());
  }
  const plain = str(raw ?? p.badge);
  if (plain) return dress(plain, colourOf());

  // 3. The boolean the builder wrote before any ribbon had words.
  if (p.recommended) return dress("Recommended", colourOf(), "recommended");
  return null;
}

/** True when this card wears a ribbon — the card's own border follows it. */
export function hasTag(props: Record<string, unknown> | undefined | null): boolean {
  return tagOf(props) !== null;
}

/**
 * The props that PUT a ribbon on a card, in the card's own names.
 *
 * Every writer — the inspector panel, the upgrade, a template — goes through
 * this, so there is one answer to "what does a ribbon look like on disk".
 * Passing null takes it off, and takes every older spelling off with it: a
 * `tag` object left behind beside `show_ribbon: ""` is a ribbon that comes
 * back the next time somebody opens the document.
 */
export function ribbonProps(tag: { text: string; colour?: string; preset?: RibbonPreset } | null): Record<string, unknown> {
  if (!tag || !str(tag.text)) {
    return { show_ribbon: "", ribbon_title: "", ribbon_preset: "" };
  }
  return {
    show_ribbon: "yes",
    ribbon_title: str(tag.text),
    ribbon_color: str(tag.colour),
    ribbon_preset: tag.preset ?? presetForText(tag.text),
  };
}

/**
 * THE OLDER SPELLINGS, named once.
 *
 * `upgrade.ts` DELETES these keys on every read path, which is why nothing
 * else has to clear them: by the time a panel can be open on a card, the card
 * has been through the upgrade. The list is here, beside the reader that
 * still understands them, so "which keys are the old ribbon" has one answer.
 */
export const LEGACY_RIBBON_KEYS = ["tag", "badge", "recommended"] as const;

/** Is this card the recommended one? The row rule asks exactly this. */
export function isRecommended(props: Record<string, unknown> | undefined | null): boolean {
  return tagOf(props)?.preset === EXCLUSIVE_PRESET;
}

