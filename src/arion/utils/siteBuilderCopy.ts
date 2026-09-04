/**
 * The small decisions the site-builder screens make about wording and
 * grouping — kept out of the components so they can be tested without a
 * browser, a Vite env, or MSAL.
 *
 * Everything here is pure. Nothing imports React.
 */

import type { ArionSitePage } from '../../lib/arionApi';

/**
 * "This uses 1 credit" / "This uses 6 credits", shown BEFORE the client sends
 * an instruction.
 *
 * A price we could not read from the server is a price we do not quote. The
 * defect this exists to avoid is the old AI Builder page, which hardcodes a
 * credit table the server never charges (SCOPE §2.4,
 * memory: feedback_no_fabricated_catalog).
 */
export function costLine(credits: number | null | undefined): string | null {
  if (credits == null || typeof credits !== 'number' || !Number.isFinite(credits)) return null;
  if (credits === 0) return 'This one is included.';
  return `This uses ${credits} ${credits === 1 ? 'credit' : 'credits'}.`;
}

/**
 * Drafts are their own list. A draft is work in progress that nobody can see;
 * putting it in among the live pages makes the client hunt for the difference
 * in a status chip.
 *
 * `pending` sits with the drafts because it is likewise not on the website.
 * Everything else — published, private, scheduled — is a page WordPress is
 * already serving to somebody, so it belongs in the live list.
 */
export function splitPages(pages: ArionSitePage[]): { drafts: ArionSitePage[]; live: ArionSitePage[] } {
  const isDraft = (p: ArionSitePage) => p.status === 'draft' || p.status === 'pending';
  return {
    drafts: (pages || []).filter(isDraft),
    live: (pages || []).filter((p) => !isDraft(p)),
  };
}
