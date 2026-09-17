/**
 * lib/plainValue.ts — NO RAW VALUE EVER REACHES A SCREEN.
 *
 * BUILDER_USER_TEST_2026-09-16, D-32: the Newsletter Studio printed its EDITION
 * column as `2026-09-16T00:00:00.000Z` and the Design Studio printed a template
 * type as `Ig_post`. BUILDER_UX_SPEC_2026-09-16 §6 rule 3 answers both: *"No
 * developer token ever reaches a screen. Dates through one formatter, enums
 * through one label map."*
 *
 * These are the two the surfaces in this stream needed. They live here, pure
 * and together, so a second column cannot quietly disagree with the first — and
 * so "what does the user see" is a `node --test` case rather than something you
 * open a page to find out.
 */

/** What we print when there is nothing true to print. Never a raw value. */
export const NOT_SET = "—";

/**
 * A date, as a person reads it.
 *
 * A bare `YYYY-MM-DD` is a CALENDAR DATE, not an instant. `new Date("2026-09-16")`
 * parses it as midnight UTC, and rendering that in a timezone west of Greenwich
 * prints the 15th — an edition dated the wrong day, in the one column whose job
 * is the date. So a plain date is built from its own three numbers in local
 * time, and anything else (a full timestamp) is parsed as an instant, which is
 * what it is.
 */
export function editionLabel(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return NOT_SET;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = plain
    ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return NOT_SET;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * A link we can honestly offer, or nothing.
 *
 * D-16: a published landing page's `published_url` was written as a BARE PATH
 * whenever the server had no public base configured, and a bare path in the
 * Portal resolves against the PORTAL — which is why the walk's View link served
 * the Portal's own index.html instead of the landing page. A link we cannot
 * build absolutely is not shown: an empty cell is honest, a link to the wrong
 * page is not.
 */
export function absoluteLink(value: string | null | undefined): string | null {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}
