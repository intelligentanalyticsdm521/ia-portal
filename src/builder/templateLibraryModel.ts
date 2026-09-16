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
 * The business types a template can be for — D-146 item 2, "more templates for
 * different business types", said in the words a client would use about
 * themselves and not in ours.
 *
 * `ANY_BUSINESS` is a real type a template carries, not a filler: a simple
 * quote is the right answer for a landscaper, an accountant and a caterer
 * alike, so it ANSWERS EVERY CHIP (see `matchesBusinessType`) rather than
 * hiding the moment somebody filters.
 */
export const ANY_BUSINESS = "Any business";

export const BUSINESS_TYPES = [
  "Lawn & landscape",
  "Snow & ice",
  "Cleaning",
  "HVAC & plumbing",
  "Home services",
  "Professional services",
  "Agencies & software",
  "Retail & hospitality",
  "Non-profit",
  ANY_BUSINESS,
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

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
   * Always last, whatever the sort says.
   *
   * "Start from an empty page" is a card in the grid rather than a link under
   * it — it is one of the things you can start from — but it is never the
   * first thing offered.
   */
  last?: boolean;
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

/** Featured first, then alphabetical; the "empty page" card always last. */
export function sortTemplates(list: TemplateEntry[]): TemplateEntry[] {
  return [...list].sort((a, b) => {
    if (!!a.last !== !!b.last) return a.last ? 1 : -1;
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
  for (const e of list) if (!e.last && !out.includes(e.purpose)) out.push(e.purpose);
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
   The empty page — a card, and always the last one
   ══════════════════════════════════════════════════════════════════════════ */

/** The id every adapter gets back when the author chooses the empty page. */
export const BLANK_TEMPLATE_ID = "__blank";

/**
 * "Start from an empty page", as a card in the grid.
 *
 * It is one of the things you can start from, so it belongs in the grid and
 * not in a link underneath it — but §7 is emphatic that a blank page is never
 * the first offer, so it carries `last` and sits at the end whatever the sort
 * and whatever the filters. It is searchable like anything else ("empty",
 * "blank", "nothing"), which is how somebody who wants it finds it fast.
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
    last: true,
    preview: blankPreview,
    ...over,
  };
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
