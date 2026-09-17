/**
 * builder/templateLibraryModel.ts — the template library's pure half.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.9, decision D-146 (Brandon,
 * 2026-09-16, from two screenshots).
 *
 * ── WHAT D-146 ASKED FOR ──────────────────────────────────────────────────
 * The old "Start your document" screen was three text-only cards named after
 * the clients they were traced from, each described by how it LOOKED. Beside
 * it he put a real template library: search and categories at the top, a grid
 * of cards each with a picture of the template, a title, a small badge and the
 * detail on hover. His five asks: no client names; more templates for more
 * kinds of business; descriptions that say WHAT IT IS FOR; a picture per
 * template; search and categories.
 *
 * ── WHAT LIVES HERE AND WHAT LIVES IN THE COMPONENT ───────────────────────
 * Everything that is a RULE lives here — the vocabulary, the search, the
 * chips, the sort, what gets built once, what gets mounted when — because the
 * Portal's test runner only takes pure modules (scripts/test-ts-loader.mjs)
 * and a rule that can only be checked by clicking is a rule that will drift.
 * TemplateLibrary.tsx draws it and owns no rules at all.
 *
 * Pure: no React, no fetch, no DOM.
 */

/* ══════════════════════════════════════════════════════════════════════════
   The vocabulary
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The business SEGMENTS a template can be for — decision **D-153** (Brandon,
 * 2026-09-17, walking the template library): *"we need to restructure business
 * type to high level businesses like Service Industry, Non-Profit,
 * Professional Services, Agencies, or whatever our high level clients are, we
 * don't need specific industries like lawn and landscaping because that will
 * lead to too many options."*
 *
 * D-146 had shipped nine chips, five of which were single trades — Lawn &
 * landscape, Snow & ice, Cleaning, HVAC & plumbing, Home services. A chip row
 * of trades can only ever grow (roofing, pest control, pools, tree work…) and
 * every one of them cuts the grid down to the one or two templates that happen
 * to name it. A SEGMENT is the level our clients actually come in at, so five
 * chips cover every business we sell to and each one keeps a useful number of
 * templates behind it.
 *
 * The trade words are not lost: they moved into each template's `tags`, which
 * is what the search reads (`matchesQuery`), so typing "snow" still finds the
 * seasonal agreement — it is just not a permanent button on the screen.
 *
 * `ANY_BUSINESS` is a real segment a template carries, not a filler: a simple
 * quote is the right answer for a landscaper, an accountant and a caterer
 * alike, so it ANSWERS EVERY CHIP (see `matchesBusinessType`) rather than
 * hiding the moment somebody filters.
 */
export const ANY_BUSINESS = "Any business";

export const BUSINESS_TYPES = [
  "Service industry",
  "Non-profit",
  "Professional services",
  "Agencies & software",
  "Retail & hospitality",
  ANY_BUSINESS,
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * The trade names D-153 retired as business types.
 *
 * Kept here — once — because two rules depend on knowing them: a trade may
 * never come back as a chip (too many options, which is the whole decision),
 * and every one of them must still be findable, which means it has to appear
 * in some template's tags. `test/builder-template-library.test.mjs` asserts
 * both, so a trade cannot creep back into the chip row and a segment cannot be
 * remapped without the words following it into the search.
 */
export const RETIRED_TRADE_TYPES = [
  "Lawn & landscape",
  "Snow & ice",
  "Cleaning",
  "HVAC & plumbing",
  "Home services",
] as const;

/** The "no filter" chip at the front of both rows. */
export const ALL = "All";

/* ══════════════════════════════════════════════════════════════════════════
   An entry
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What a card draws — a REAL RENDER of the template, never a stored picture.
 *
 * `html` is either a whole HTML document (the email renderer already produces
 * one) or a fragment, in which case `css` is the stylesheet that fragment
 * needs. `width` is the width the document was authored at; the card scales
 * from that to whatever the grid gives it.
 */
export interface TemplatePreview {
  html: string;
  css?: string;
  width: number;
}

export interface TemplateEntry {
  /** The adapter's own key. Handed straight back to it when picked. */
  id: string;
  title: string;
  /** The small badge: what KIND of thing this is, in the client's words. */
  purpose: string;
  businessTypes: string[];
  tags: string[];
  /** Two or three sentences: what it is for and when you would send it. */
  useCase: string;
  /** The trades and situations it suits, as one line. */
  bestFor: string;
  /** Shown before everything else, alphabetically among themselves. */
  featured?: boolean;
  /**
   * THE empty-page card — first in the grid, top-left, and the footer button.
   *
   * **D-153** (Brandon, 2026-09-17): *"we need to have the Blank Template as a
   * default or the first option in the top left or even just a button on the
   * bottom."* He asked for one of the two; the library does both, because they
   * are two different people arriving: somebody scanning the grid sees it in
   * the corner where their eye already is, and somebody who came in knowing
   * they want a blank page does not have to read fourteen cards to find it.
   *
   * This REPLACES the `last` flag D-146 shipped, which forced the same card to
   * the very end of the sort whatever else happened. `sortTemplates` now puts
   * it first, `purposeChips` still leaves it out of the categories (an empty
   * page is not a kind of document), and it is still searchable like anything
   * else. At most one entry in a list carries this.
   */
  blank?: boolean;
  /**
   * Build the picture. Called lazily, at most once per id (`makePreviewCache`),
   * and only for a card that has actually been scrolled to (`nextMounted`).
   */
  preview: () => TemplatePreview;
}

/* ══════════════════════════════════════════════════════════════════════════
   Searching and filtering
   ══════════════════════════════════════════════════════════════════════════ */

export interface TemplateFilter {
  query?: string;
  /** A value from BUSINESS_TYPES, or ALL. */
  businessType?: string;
  /** One of the adapter's own purposes, or ALL. */
  purpose?: string;
}

/**
 * Does this entry answer that business-type chip?
 *
 * A template marked "Any business" answers every chip. Anything else has to
 * name the type.
 */
export function matchesBusinessType(entry: TemplateEntry, type: string): boolean {
  if (!type || type === ALL) return true;
  if (entry.businessTypes.includes(ANY_BUSINESS)) return true;
  return entry.businessTypes.includes(type);
}

/**
 * The search.
 *
 * Over the TITLE, the USE CASE and the TAGS — all three. A search that only
 * read the title would find "Maintenance plan" and miss "the plan a customer
 * pays for monthly", which is how a business owner actually asks for it. The
 * mutation check in test/builder-template-library.test.mjs is exactly that:
 * narrow this to the title and two tests go red.
 */
export function matchesQuery(entry: TemplateEntry, query: string): boolean {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const hay = [entry.title, entry.useCase, entry.bestFor, entry.purpose, ...entry.tags]
    .join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/** Search AND both chips — an intersection, never a union. */
export function filterTemplates(list: TemplateEntry[], f: TemplateFilter = {}): TemplateEntry[] {
  return list.filter((e) =>
    matchesQuery(e, f.query || "")
    && matchesBusinessType(e, f.businessType || ALL)
    && (!f.purpose || f.purpose === ALL || e.purpose === f.purpose));
}

/**
 * The empty page FIRST, then featured, then alphabetical — D-153.
 *
 * "top left" is a sort rule, not a piece of CSS: the grid draws whatever this
 * hands back in the order it hands it back, so the only way the empty card can
 * stop being top-left is if this function changes. Break the first line of the
 * comparator and `test/builder-template-library.test.mjs` goes red on every
 * adapter that has an empty card.
 */
export function sortTemplates(list: TemplateEntry[]): TemplateEntry[] {
  return [...list].sort((a, b) => {
    if (!!a.blank !== !!b.blank) return a.blank ? -1 : 1;
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function filterAndSort(list: TemplateEntry[], f: TemplateFilter = {}): TemplateEntry[] {
  return sortTemplates(filterTemplates(list, f));
}

/**
 * The chips to offer, taken from the catalogue rather than from a constant.
 *
 * Offering "Non-profit" on a list with no non-profit template is a filter that
 * can only disappoint, so the row shows what is actually there — in
 * BUSINESS_TYPES' own order, so it reads the same on every screen.
 */
export function businessTypeChips(list: TemplateEntry[]): string[] {
  const present = new Set<string>();
  for (const e of list) for (const t of e.businessTypes) present.add(t);
  // "Any business" is not a chip: it answers all of them, so a chip for it
  // would be a second "All" sitting at the end of the row.
  return [ALL, ...BUSINESS_TYPES.filter((t) => t !== ANY_BUSINESS && present.has(t))];
}

/** The purpose chips, in the order the catalogue lists them. */
export function purposeChips(list: TemplateEntry[]): string[] {
  const out: string[] = [];
  for (const e of list) if (!e.blank && !out.includes(e.purpose)) out.push(e.purpose);
  return [ALL, ...out];
}

/* ══════════════════════════════════════════════════════════════════════════
   The picture: built once, mounted when seen
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * One HTML document for an `<iframe srcdoc>`.
 *
 * The email renderer already returns a whole document (tables, doctype and
 * all) and must not be wrapped again — wrapping it would put a second
 * `<body>` inside the first and no mailbox draws that the same way twice.
 */
export function previewSrcDoc(p: TemplatePreview): string {
  const html = String(p.html ?? "");
  if (/^\s*<!doctype/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8" />`
    + `<style>html,body{margin:0;padding:0;background:#FFFFFF;}${p.css || ""}</style>`
    + `</head><body>${html}</body></html>`;
}

/**
 * Build-once storage, keyed by template id.
 *
 * Rendering fourteen documents on every keystroke in the search box is the
 * difference between a library and a stutter. The cache is created by the
 * component and lives as long as the grid does.
 */
/** A preview after it has been built: the iframe's document and its width. */
export interface BuiltPreview { srcdoc: string; width: number }

/** Build one entry's picture. The only place `entry.preview()` is called. */
export function buildPreview(entry: TemplateEntry): BuiltPreview {
  const p = entry.preview();
  return { srcdoc: previewSrcDoc(p), width: p.width };
}

export interface PreviewCache {
  get(id: string, build: () => BuiltPreview): BuiltPreview;
  size(): number;
}

export function makePreviewCache(): PreviewCache {
  const seen = new Map<string, BuiltPreview>();
  return {
    get(id, build) {
      const hit = seen.get(id);
      if (hit !== undefined) return hit;
      const made = build();
      seen.set(id, made);
      return made;
    },
    size: () => seen.size,
  };
}

/** How far outside the viewport a card starts building its picture. */
export const THUMB_ROOT_MARGIN = "200px";

/** The shape of a card's picture box: 4 : 3, so a page reads as a page. */
export const THUMB_RATIO = 4 / 3;

/**
 * Which cards have their picture mounted.
 *
 * Once a card has been in view it STAYS mounted: scrolling back up must not
 * throw away a render and pay for it again, and an iframe that unmounts and
 * remounts flashes white. A card never scrolled to is never built at all.
 */
export function nextMounted(
  mounted: ReadonlySet<string>,
  entering: readonly string[],
): Set<string> {
  const next = new Set(mounted);
  for (const id of entering) next.add(id);
  return next;
}

/** True when this card should render its picture now. */
export function isMounted(mounted: ReadonlySet<string>, id: string): boolean {
  return mounted.has(id);
}

/**
 * The first sentence of a use case — the one line that fits on a card.
 *
 * Here rather than in the component so it is covered by `node --test` like
 * every other rule the library follows (and so the component exports only a
 * component, which is what Fast Refresh asks of a .tsx file).
 */
export function firstSentence(text: string): string {
  const s = String(text ?? "").trim();
  const stop = s.search(/[.!?](\s|$)/);
  return stop < 0 ? s : s.slice(0, stop + 1);
}

/* ══════════════════════════════════════════════════════════════════════════
   The empty page — the FIRST card, and the footer button (D-153)
   ══════════════════════════════════════════════════════════════════════════ */

/** The id every adapter gets back when the author chooses the empty page. */
export const BLANK_TEMPLATE_ID = "__blank";

/**
 * "Start from an empty page", as the first card in the grid.
 *
 * D-153 moved it from the end of the list to the top-left corner and put a
 * button for it in the footer as well. §7's "never open on a blank page" is
 * still true and is a different statement: the builder still OPENS on the
 * library, full of finished documents. Where the empty card sits inside that
 * library is a question about finding it, and the answer Brandon gave is that
 * it should be where you look first. It is searchable like anything else
 * ("empty", "blank", "nothing").
 */
export function blankEntry(over: Partial<TemplateEntry> = {}): TemplateEntry {
  return {
    id: BLANK_TEMPLATE_ID,
    title: "Start from an empty page",
    purpose: "Empty page",
    businessTypes: [ANY_BUSINESS],
    tags: ["blank", "empty", "nothing", "from scratch"],
    useCase: "Nothing on the page to begin with. You add every section yourself from the panel, which is the long way round unless you already know exactly what you want.",
    bestFor: "Anyone rebuilding something they have already written, or trying a shape none of the templates covers.",
    blank: true,
    preview: blankPreview,
    ...over,
  };
}

/**
 * The empty-page entry in a catalogue, if it has one.
 *
 * Landing pages deliberately have none (a landing page with no form is not a
 * landing page), so this returns null there and the footer button is simply
 * not drawn — rather than drawn and disabled, which would be a button that
 * exists to say no.
 */
export function blankEntryOf(list: TemplateEntry[]): TemplateEntry | null {
  return list.find((e) => e.blank) || null;
}

/**
 * What the footer's empty-page button says.
 *
 * The entry's OWN title, not a fixed string: the proposal builder's empty page
 * really is empty and says "Start from an empty page", but the email's smallest
 * legal send is a masthead and an unsubscribe footer ("Just the basics") and a
 * website page starts with a banner ("Start from one section"). A button that
 * promised an empty page and delivered two blocks would be the button lying.
 */
export function blankButtonLabel(list: TemplateEntry[]): string | null {
  return blankEntryOf(list)?.title ?? null;
}

/** A picture of nothing: a sheet with a dashed outline where sections go. */
export function blankPreview(): TemplatePreview {
  return {
    width: 760,
    css: `body{background:#fff;font-family:Inter,system-ui,sans-serif}
      .e{margin:28px;border:2px dashed #CBD5E1;border-radius:10px;height:480px;display:flex;
         align-items:center;justify-content:center;color:#94A3B8;font-size:26px;letter-spacing:.02em}`,
    html: `<div class="e">Your page starts here</div>`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Select, then load — D-153
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * **D-153** (Brandon, 2026-09-17): *"then the templates should be select and
 * have a button for load xyz template instead of click automatically loads."*
 *
 * D-146's grid opened a template the instant a card was clicked. Every other
 * grid of choices in the Portal — and every file dialog anyone has ever used —
 * lets you point at a thing, look at it, then commit. Loading on the first
 * click means a mis-aimed click throws away whatever the author had started,
 * and it means the hover panel (the use case, the "best for" line) can only
 * ever be read by NOT choosing.
 *
 * So: one gesture selects, a second commits. The second can be the footer's
 * "Load …" button, a double-click, or Enter on the card that is already
 * selected. There is no path through this function where a single click loads,
 * which is the mutation the tests break on purpose.
 */
export type CardGesture = "click" | "doubleClick" | "enter";

export interface GestureResult {
  /** The card that is selected afterwards. Always the one gestured at. */
  select: string;
  /** Whether the adapter's `onPick` fires. */
  load: boolean;
}

export function cardGesture(
  gesture: CardGesture,
  id: string,
  selectedId: string | null,
): GestureResult {
  if (gesture === "doubleClick") return { select: id, load: true };
  // Enter loads only what is ALREADY selected. Arrowing onto a card and
  // pressing Enter in one motion would otherwise load it, which is the same
  // "one gesture commits" this decision removed — just with a keyboard.
  if (gesture === "enter") return { select: id, load: selectedId === id };
  return { select: id, load: false };
}

/** What the footer's primary button says. Null when nothing is selected yet. */
export function loadButtonLabel(entry: TemplateEntry | null | undefined): string | null {
  return entry ? `Load ${entry.title}` : null;
}

/** The selected entry, looked up in what is currently on screen. */
export function selectedEntry(
  shown: TemplateEntry[],
  selectedId: string | null,
): TemplateEntry | null {
  if (!selectedId) return null;
  return shown.find((e) => e.id === selectedId) || null;
}

/**
 * The selection after the grid changed under it.
 *
 * A card that a search or a chip has just filtered away cannot stay selected —
 * the footer would offer to load something nobody can see. Dropped, not moved
 * to a neighbour: silently selecting a different template than the one the
 * author picked is worse than selecting none.
 */
export function keepSelection(
  shown: TemplateEntry[],
  selectedId: string | null,
): string | null {
  return selectedId && shown.some((e) => e.id === selectedId) ? selectedId : null;
}

/**
 * Arrow keys move the selection between cards.
 *
 * `delta` is +1 / -1 for left and right and ±`perRow` for up and down; the
 * component knows how many cards are on a row and this knows nothing about
 * pixels. Clamped at both ends rather than wrapping: arrowing off the last
 * card and landing back on the first is how you lose your place.
 */
export function moveSelection(
  shown: TemplateEntry[],
  selectedId: string | null,
  delta: number,
): string | null {
  if (!shown.length) return null;
  const at = selectedId ? shown.findIndex((e) => e.id === selectedId) : -1;
  if (at < 0) return shown[delta < 0 ? shown.length - 1 : 0].id;
  const next = Math.min(shown.length - 1, Math.max(0, at + delta));
  return shown[next].id;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sample values for a preview
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The merge values a THUMBNAIL is rendered with.
 *
 * merge.ts's gap rule prints `__________` for a token nothing can fill, which
 * is right on a customer's document and wrong on a picture of a template — the
 * card would be full of blank rules. So the library hands in these, and only
 * the library does: the adapter builds the template again, unfilled, the
 * moment the author picks it.
 *
 * Every name here is INVENTED. No client of ours appears in a template, in a
 * sample, or in a picture of one (D-146 item 1; the denylist test).
 */
export const SAMPLE_MERGE: Record<string, string> = {
  "customer.name": "Prairie View Office Park",
  "customer.legal_name": "Prairie View Office Park LLC",
  "customer.contact_name": "Dana Whitfield",
  "customer.email": "dana@harbourviewpark.example",
  "customer.phone": "(555) 0147",
  "property.name": "Harbourview — North lot",
  "property.address": "1400 Harbour Way, Riverton",
  "property.access_notes": "Gate on the north side, open from 6am",
  "property.gate_code": "4417",
  "contract.start_date": "1 November",
  "contract.end_date": "15 April",
  "contract.valid_until": "30 days from today",
  "signature_date": "On acceptance",
  "business.name": "Northwind Lawn & Snow",
  "business.email": "office@northwindlawnsnow.example",
  "business.phone": "(555) 0192",
  "first name": "Dana",
  "business name": "Northwind Lawn & Snow",
};
