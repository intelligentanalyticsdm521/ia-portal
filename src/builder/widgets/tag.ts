/**
 * builder/widgets/tag.ts — THE TAG ON A CARD.
 *
 * D-157, Brandon: *"cards has a recommended section … add tag to this card …
 * Best Price & Most Popular"*.
 *
 * ── WHY THIS IS A FIELD AND NOT A WIDGET ──────────────────────────────────
 * A tag is never on its own: it is the little ribbon at the top of a card. A
 * draggable "tag" widget would have to be attached to the card next to it,
 * which is a second parent-child mechanism beside the one D-156 just built
 * (containers hold children; widgets are atomic and hold none). So the tag is
 * a FIELD — `props.tag` — that `card` and `catalog_card` both carry, and this
 * module owns its shape, its presets, its colours and its markup. One
 * mechanism, one place, and "add a tag to this card" is a control on the card.
 *
 * The old `recommended: true` boolean is read here too, so a card written by
 * yesterday's builder still wears its ribbon and nothing has to be migrated
 * for it to show.
 */
import { esc } from "../render";

export interface CardTag {
  /** What the ribbon says. Any words; the presets are shortcuts, not a list. */
  text: string;
  /** Any CSS colour. Empty means "the document's accent". */
  colour?: string;
}

/** The three Brandon named, as one-click starting points. */
export const TAG_PRESETS: ReadonlyArray<{ text: string; colour: string }> = [
  { text: "Recommended", colour: "" },
  { text: "Best Price", colour: "#C2410C" },
  { text: "Most Popular", colour: "#6D28D9" },
];

/**
 * Colours offered beside the text box.
 *
 * Plain words, because "#C2410C" is not a colour anybody asked for. The
 * business's own accent is the first and the default, so a tag looks like the
 * rest of the document unless somebody deliberately makes it shout.
 */
export const TAG_COLOURS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Your brand colour", value: "" },
  { label: "Orange", value: "#C2410C" },
  { label: "Green", value: "#15803D" },
  { label: "Purple", value: "#6D28D9" },
  { label: "Red", value: "#B91C1C" },
  { label: "Slate", value: "#334155" },
];

/**
 * The tag a card is actually wearing, or null.
 *
 * Tolerant in both directions: a `tag` object wins, `recommended: true` from
 * before D-156 still means the Recommended ribbon, and anything else is no
 * ribbon at all rather than an exception on a customer's page.
 */
export function tagOf(props: Record<string, unknown> | undefined | null): CardTag | null {
  const p: any = props || {};
  const colourOf = (): string => String(p.tagColour ?? p.ribbon_color ?? "").trim();
  const raw = p.tag;
  if (raw && typeof raw === "object") {
    const text = String((raw as any).text ?? "").trim();
    if (!text) return null;
    const colour = String((raw as any).colour ?? "").trim() || colourOf();
    return colour ? { text, colour } : { text };
  }
  // A PLAIN STRING is a tag too. The composite wrote `badge: "Best price"` and
  // a page published to a website comes back as Elementor's `ribbon_title`
  // behind `show_ribbon`. Three spellings, ONE reader — the alternative is
  // three renderers each deciding for itself what a ribbon is.
  const plain = String(
    raw ?? p.badge
    ?? (p.show_ribbon === "yes" || p.show_ribbon === true ? p.ribbon_title : "")
    ?? "",
  ).trim();
  if (plain) {
    const colour = colourOf();
    return colour ? { text: plain, colour } : { text: plain };
  }
  if (p.recommended) return { text: "Recommended" };
  return null;
}

/** True when this card wears a ribbon — the card's own border follows it. */
export function hasTag(props: Record<string, unknown> | undefined | null): boolean {
  return tagOf(props) !== null;
}

/**
 * The ribbon.
 *
 * `accent` is the document's own colour and is used whenever the author has
 * not picked one, so the default tag belongs to the brand rather than to a
 * colour somebody in here chose.
 */
export function tagHtml(
  props: Record<string, unknown> | undefined | null,
  accent: string,
  editPath = "tag.text",
): string {
  const tag = tagOf(props);
  if (!tag) return "";
  const colour = tag.colour || accent;
  return `<div class="bx-card-badge" style="background:${esc(colour)}" data-edit="${esc(editPath)}">${esc(tag.text)}</div>`;
}

/** The colour a tagged card's border takes — the tag's, else the accent. */
export function tagBorder(props: Record<string, unknown> | undefined | null, accent: string): string {
  const tag = tagOf(props);
  if (!tag) return "";
  return tag.colour || accent;
}
