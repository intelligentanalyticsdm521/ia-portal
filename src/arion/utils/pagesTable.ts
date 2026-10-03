/**
 * Website → Pages, the table's pure half.
 * ---------------------------------------------------------------------------
 * Brandon, 2026-09-22, looking at the card list this replaces: *"for the
 * website pages, can we make this look like what wordpress pages looks like,
 * then I can't actually edit anything."*
 *
 * So the screen is WordPress's own `edit.php?post_type=page`, in our colours,
 * and this file is everything about it that is not JSX: the four status links
 * and their counts, the search, the page of twenty, the row actions and the
 * two strings WordPress puts in a row (`— Draft` after a title, `Published
 * 2026/09/19 at 10:02 am` in the Date column).
 *
 * Read off the real screen on the dev fixture site first
 * (http://localhost:8084/wp-admin/edit.php?post_type=page), not from memory:
 *   All (26) | Mine (2) | Published (18) | Drafts (8)
 *   Title / Author / Date, `About us — Elementor`, `Autumn offer — Draft`
 *   Edit | Quick Edit | Trash | View, with Preview instead of View on a draft
 *   Bulk actions: Move to Trash. 26 items, « ‹ 1 of 2 › »
 *
 * TWO of WordPress's own things are deliberately NOT here, and the reason is
 * the same for both — the website does not tell us:
 *   · "Mine", because the pages door gives no author;
 *   · Quick Edit, because the plugin's page-settings door can set a slug and
 *     nothing else (no title, no status), and a Quick Edit that could only
 *     change the address is a control that lies about what it does.
 * Both are written up in the handoff rather than faked.
 *
 * Pure: no React, no fetch, so every rule below is a `node --test` row.
 */

import type { ArionSitePage } from '../../lib/arionApi';

/** Which of the four status links is showing. */
export type PagesView = 'all' | 'publish' | 'draft' | 'trash';

/** How many rows WordPress puts on one screen. */
export const PER_PAGE = 20;

/** One status link: what it says, what it counts, whether it is showing. */
export interface StatusLink { view: PagesView; label: string; count: number }

const isTrash = (p: ArionSitePage) => p.status === 'trash';
const isDraft = (p: ArionSitePage) => p.status === 'draft' || p.status === 'pending';

/**
 * The four links across the top, with their counts.
 *
 * `All` excludes the bin, exactly as WordPress's does — a client who empties
 * the bin should not watch the All number drop. `Trash` is left out entirely
 * when the bin is empty, which is also WordPress's rule: a link to nothing is
 * a door a client opens once and never again.
 */
export function statusLinks(pages: ArionSitePage[]): StatusLink[] {
  const all = (pages || []).filter((p) => !isTrash(p));
  const links: StatusLink[] = [
    { view: 'all', label: 'All', count: all.length },
    { view: 'publish', label: 'Published', count: all.filter((p) => p.status === 'publish').length },
    { view: 'draft', label: 'Drafts', count: all.filter(isDraft).length },
  ];
  const binned = (pages || []).filter(isTrash).length;
  if (binned > 0) links.push({ view: 'trash', label: 'Trash', count: binned });
  return links;
}

/** The rows one status link shows, narrowed by the search box, in WordPress's order. */
export function filterPages(pages: ArionSitePage[], view: PagesView, search: string): ArionSitePage[] {
  const q = String(search || '').trim().toLowerCase();
  const rows = (pages || []).filter((p) => {
    if (view === 'trash') return isTrash(p);
    if (isTrash(p)) return false;
    if (view === 'publish') return p.status === 'publish';
    if (view === 'draft') return isDraft(p);
    return true;
  }).filter((p) => {
    if (!q) return true;
    return `${p.title || ''} ${p.slug || ''}`.toLowerCase().includes(q);
  });
  // WordPress's Pages screen is ordered by title, not by when it last changed.
  // Ours arrives modified-first from the website, so it is sorted here and the
  // list a client scans twice is in the same place both times.
  return rows.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
}

/** One screen of twenty, and the page number clamped into range. */
export function paginate<T>(rows: T[], page: number, perPage = PER_PAGE): {
  rows: T[]; page: number; pages: number; total: number;
} {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (current - 1) * perPage;
  return { rows: rows.slice(from, from + perPage), page: current, pages, total };
}

/**
 * What WordPress prints after a title: `— Draft`, `— Draft, Elementor`.
 *
 * Ours says the same three things a client can act on — that it is not live
 * yet, that it is a blog post rather than a page, and that there is work
 * saved here the public has not seen (D-05). "Elementor" is WordPress telling
 * itself which editor built the page; it means nothing to the client, so it
 * is not repeated.
 */
export function stateSuffix(p: ArionSitePage, opts: { ownList?: boolean } = {}): string {
  const bits: string[] = [];
  if (p.status === 'draft') bits.push('Draft');
  else if (p.status === 'pending') bits.push('Pending review');
  else if (p.status === 'future') bits.push('Scheduled');
  else if (p.status === 'private') bits.push('Private');
  else if (p.status === 'trash') bits.push('In the bin');
  // 2 Oct 2026: posts have their own list (Website > Posts), so a row never
  // needs to say it is one. The suffix stays for anything that still mixes.
  if (p.type === 'post' && !opts.ownList) bits.push('Post');
  if (p.hasUnpublishedDraft && p.status !== 'trash') bits.push('Unpublished changes');
  return bits.join(', ');
}

/**
 * WordPress's Date column, both lines.
 *
 * WordPress writes `Published` over a live page's publish date and `Last
 * Modified` over a draft's. The pages door gives us ONE date — when the page
 * last changed — so every row reads `Last Modified`, which is true of all of
 * them. It is not labelled `Published` over a date that is not the publish
 * date: that is a column that lies, and the fix is two more fields on the
 * plugin's `/pages`, written up in the handoff.
 */
export function dateCell(p: ArionSitePage): { label: string; when: string } {
  return { label: 'Last Modified', when: wpDate(p.modified) };
}

/** WordPress's own date format: `2026/09/19 at 10:02 am`. */
export function wpDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} `
    + `at ${h}:${pad(d.getMinutes())} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** One thing a client can do to one row. */
export type RowAction = 'edit' | 'trash' | 'view' | 'preview' | 'ask' | 'restore';

/**
 * The row actions WordPress shows under a title, in WordPress's order.
 *
 * `View` on a live page, `Preview` on one that is not live yet — the same
 * swap WordPress makes, for the same reason. `Ask us to change it` comes
 * after the four because it is OUR door and not WordPress's. A row in the bin
 * offers only the way back out.
 */
export function rowActions(p: ArionSitePage, view: PagesView): RowAction[] {
  if (view === 'trash' || p.status === 'trash') return ['restore'];
  const out: RowAction[] = ['edit', 'trash'];
  if (p.permalink) out.push(p.status === 'publish' ? 'view' : 'preview');
  out.push('ask');
  return out;
}

/** What each row action is called on screen. */
export const ROW_ACTION_LABEL: Record<RowAction, string> = {
  edit: 'Edit',
  trash: 'Trash',
  view: 'View',
  preview: 'Preview',
  ask: 'Ask us to change it',
  restore: 'Restore',
};

/** The bulk actions the list offers, which are the ones the website can do. */
export function bulkActions(view: PagesView): Array<{ value: string; label: string }> {
  return view === 'trash'
    ? [{ value: '', label: 'Bulk actions' }, { value: 'restore', label: 'Restore' }]
    : [{ value: '', label: 'Bulk actions' }, { value: 'trash', label: 'Move to Trash' }];
}
