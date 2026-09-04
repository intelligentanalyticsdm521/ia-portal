// lib/leadgenCategories.ts — the pure half of "search more than one Business
// Category in one run" (A13 / D31).
//
// These three functions decide what the Live Preview shows and what the job is
// asked to run, so they are kept out of the page and pinned by tests. The rule
// they all obey is the server's rule: FIRST CLAIM WINS. A term that one category
// already brought is not brought again by the next one, and the category that
// brought it owns it — that is how LUMEN's searchCategories.interleaveTerms and
// termCategoryMap dedup and attribute, and the preview must not disagree with
// what the run will actually do.

/** A keyword in the Live Preview, and the category it was expanded from. */
export interface ExpandedKeyword {
  term: string;
  weight: number;
  source: string;
  /** null = the customer typed it outside every category. */
  category?: string | null;
}

/** A category as the page holds it. */
export interface PickedCategory {
  id: number;
  name: string;
  industry_id?: number | null;
  custom?: boolean;
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Expansion plus the customer's own typed topics (weight 1, source "typed"),
 * deduped case-insensitively. The typed topics go FIRST: the customer asked for
 * those words by name and should see them at the top of their own preview.
 */
export function withTypedTopics(
  expanded: ExpandedKeyword[],
  typed: string[],
  category: string | null = null,
): ExpandedKeyword[] {
  const seen = new Set(expanded.map((k) => key(k.term)));
  const extra: ExpandedKeyword[] = [];
  for (const t of typed) {
    const s = String(t || "").trim();
    if (!s || seen.has(key(s))) continue;
    seen.add(key(s));
    extra.push({ term: s, weight: 1, source: "typed", category });
  }
  return [...extra, ...expanded];
}

/**
 * Merge each category's expansion into one preview list, first claim wins, so
 * the same keyword is never searched (or shown) twice.
 */
export function mergeExpansions(lists: ExpandedKeyword[][]): ExpandedKeyword[] {
  const seen = new Set<string>();
  const out: ExpandedKeyword[] = [];
  for (const list of lists) {
    for (const k of list) {
      const n = key(k.term);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(k);
    }
  }
  return out;
}

/**
 * What the job is asked to run: each selected category with the terms it actually
 * contributed, taken from the ACTIVE preview — so a keyword the customer switched
 * off is not searched under any category. The server round-robins these lists.
 */
export function categoryPayloadFrom(
  categories: PickedCategory[],
  activeKeywords: ExpandedKeyword[],
): Array<{ id: number | null; name: string; custom: boolean; terms: string[] }> {
  return categories.map((c) => ({
    id: c.id > 0 ? c.id : null,
    name: c.name,
    custom: !!c.custom,
    terms: activeKeywords.filter((k) => key(k.category || "") === key(c.name)).map((k) => k.term),
  }));
}
