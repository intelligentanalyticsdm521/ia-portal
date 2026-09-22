/**
 * Website → Pages IS WordPress's Pages screen (2026-09-22).
 * ---------------------------------------------------------------------------
 * Brandon, looking at the card list this replaces: *"for the website pages,
 * can we make this look like what wordpress pages looks like, then I can't
 * actually edit anything."*
 *
 * Every row below was read off the REAL screen first, on the dev fixture site
 * at http://localhost:8084/wp-admin/edit.php?post_type=page, driven with
 * Playwright — not remembered:
 *
 *   Pages  [Add Page]
 *   All (26) | Mine (2) | Published (18) | Drafts (8)          [ Search Pages ]
 *   Bulk actions ▾  Apply                          26 items  « ‹ 1 of 2 › »
 *   ☐  Title            Author   Date
 *   ☐  About us — Elementor   —   Published / 2026/09/04 at 5:25 am
 *        Edit | Quick Edit | Trash | View
 *   ☐  Autumn offer — Draft, Elementor   —   Last Modified / 2026/09/04 at 7:00 am
 *        Edit | Quick Edit | Trash | Preview
 *
 * Two of WordPress's own things are deliberately absent, and the tests below
 * say so rather than leaving a hole: "Mine" (the website's pages door gives no
 * author) and Quick Edit (the plugin's page-settings door can set a slug, and
 * neither a title nor a status — a Quick Edit that could only change the
 * address is a control that lies about what it does).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  statusLinks, filterPages, paginate, stateSuffix, dateCell, wpDate,
  rowActions, ROW_ACTION_LABEL, bulkActions, PER_PAGE,
} from '../src/arion/utils/pagesTable.ts';

const SCREEN = fs.readFileSync(path.resolve('src/arion/pages/website/WebsitePages.tsx'), 'utf8');
const CSS = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const LIVE = stripComments(SCREEN);

const page = (over = {}) => ({
  pageId: 1, title: 'A page', slug: 'a-page', status: 'publish', type: 'page',
  modified: '2026-09-19T10:02:00', permalink: 'https://example.test/a-page',
  iaManaged: true, sectionCount: 2, editableSectionCount: 2, ...over,
});

/* ═════════════════ 1. the four status links and their counts ═════════════ */

test('the status links are All | Published | Drafts, with Trash only when the bin has something', () => {
  const pages = [
    page({ pageId: 1, status: 'publish' }),
    page({ pageId: 2, status: 'publish' }),
    page({ pageId: 3, status: 'draft' }),
    page({ pageId: 4, status: 'pending' }),
  ];
  assert.deepEqual(statusLinks(pages), [
    { view: 'all', label: 'All', count: 4 },
    { view: 'publish', label: 'Published', count: 2 },
    { view: 'draft', label: 'Drafts', count: 2 },
  ]);

  const withBin = [...pages, page({ pageId: 5, status: 'trash' })];
  assert.deepEqual(statusLinks(withBin).map((l) => `${l.label} (${l.count})`),
    ['All (4)', 'Published (2)', 'Drafts (2)', 'Trash (1)'],
    'All still excludes the bin, exactly as WordPress counts it');
});

/* MUTATION: if All counted the bin, this would be 5 and the row would pass
   the old way. Asserted explicitly so a change to that rule is caught. */
test('All never counts a page in the bin', () => {
  const links = statusLinks([page({ pageId: 1, status: 'publish' }), page({ pageId: 2, status: 'trash' })]);
  assert.equal(links.find((l) => l.view === 'all').count, 1);
  assert.equal(links.find((l) => l.view === 'trash').count, 1);
});

/* ═════════════════════ 2. the search box and the table ═══════════════════ */

test('the search box narrows the list by title and by address, and keeps the link you are on', () => {
  const pages = [
    page({ pageId: 1, title: 'Autumn offer', slug: 'autumn-offer', status: 'draft' }),
    page({ pageId: 2, title: 'Contact', slug: 'contact' }),
    page({ pageId: 3, title: 'Our workshop', slug: 'workshop' }),
  ];
  assert.deepEqual(filterPages(pages, 'all', 'auTUMn').map((p) => p.pageId), [1]);
  assert.deepEqual(filterPages(pages, 'all', 'workshop').map((p) => p.pageId), [3], 'the address counts too');
  assert.deepEqual(filterPages(pages, 'publish', 'autumn').map((p) => p.pageId), [],
    'a draft does not appear under Published because it matched the search');
  assert.deepEqual(filterPages(pages, 'all', '  ').map((p) => p.pageId), [1, 2, 3]);
});

test('the table is in title order, the way WordPress orders Pages', () => {
  const pages = [
    page({ pageId: 1, title: 'Our workshop' }),
    page({ pageId: 2, title: 'About us' }),
    page({ pageId: 3, title: 'contact' }),
  ];
  assert.deepEqual(filterPages(pages, 'all', '').map((p) => p.title),
    ['About us', 'contact', 'Our workshop']);
});

test('a screen holds twenty rows and the page number is clamped into range', () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  assert.equal(PER_PAGE, 20);
  assert.deepEqual(paginate(rows, 1), { rows: rows.slice(0, 20), page: 1, pages: 3, total: 45 });
  assert.deepEqual(paginate(rows, 3).rows, rows.slice(40));
  assert.equal(paginate(rows, 99).page, 3, 'past the end lands on the last page, never on an empty table');
  assert.equal(paginate(rows, 0).page, 1);
  assert.deepEqual(paginate([], 1), { rows: [], page: 1, pages: 1, total: 0 });
});

/* ═══════════════════ 3. the two strings WordPress puts in a row ══════════ */

test('a draft carries “— Draft” after its title, and a live page carries nothing', () => {
  assert.equal(stateSuffix(page({ status: 'draft' })), 'Draft');
  assert.equal(stateSuffix(page({ status: 'publish' })), '');
  assert.equal(stateSuffix(page({ status: 'pending' })), 'Pending review');
  assert.equal(stateSuffix(page({ status: 'future' })), 'Scheduled');
  assert.equal(stateSuffix(page({ status: 'private' })), 'Private');
  assert.equal(stateSuffix(page({ status: 'trash' })), 'In the bin');
  assert.equal(stateSuffix(page({ status: 'publish', type: 'post' })), 'Post');
  assert.equal(stateSuffix(page({ status: 'draft', type: 'post' })), 'Draft, Post');
  assert.equal(stateSuffix(page({ status: 'publish', hasUnpublishedDraft: true })), 'Unpublished changes');
  assert.equal(stateSuffix(page({ status: 'trash', hasUnpublishedDraft: true })), 'In the bin',
    'a page in the bin is not also advertising work nobody can publish');
});

test('the Date column is WordPress’s own format', () => {
  assert.equal(wpDate('2026-09-19T10:02:00'), '2026/09/19 at 10:02 am');
  assert.equal(wpDate('2026-09-19T22:07:00'), '2026/09/19 at 10:07 pm');
  assert.equal(wpDate('2026-09-19T00:30:00'), '2026/09/19 at 12:30 am');
  assert.equal(wpDate('2026-09-19T12:00:00'), '2026/09/19 at 12:00 pm');
  assert.equal(wpDate(null), '—');
  assert.equal(wpDate('not a date'), '—');
});

test('the Date column says Last Modified, because that is the only date the website gives us', () => {
  // WordPress writes "Published" over a live page's PUBLISH date. The plugin's
  // /pages door sends `modified` and nothing else, so labelling it "Published"
  // would be a column that lies. The fix is two fields on the plugin, written
  // up in the handoff — not a nicer word over the wrong number.
  assert.deepEqual(dateCell(page({ status: 'publish', modified: '2026-09-19T10:02:00' })),
    { label: 'Last Modified', when: '2026/09/19 at 10:02 am' });
  assert.deepEqual(dateCell(page({ status: 'draft', modified: '2026-09-19T10:02:00' })),
    { label: 'Last Modified', when: '2026/09/19 at 10:02 am' });
});

/* ═══════════════════════════ 4. the row actions ══════════════════════════ */

test('the row actions are WordPress’s, with View on a live page and Preview on a draft', () => {
  assert.deepEqual(rowActions(page({ status: 'publish' }), 'all'), ['edit', 'trash', 'view', 'ask']);
  assert.deepEqual(rowActions(page({ status: 'draft' }), 'all'), ['edit', 'trash', 'preview', 'ask']);
  assert.deepEqual(rowActions(page({ status: 'draft', permalink: null }), 'all'), ['edit', 'trash', 'ask'],
    'no address, no link to it — never a dead link');
  assert.deepEqual(rowActions(page({ status: 'trash' }), 'trash'), ['restore'],
    'a page in the bin offers the way back out and nothing else');
  assert.deepEqual(rowActions(page({ status: 'trash' }), 'all'), ['restore'],
    'and it offers the same thing wherever it is shown');
});

test('EDIT IS NEVER MISSING FROM A ROW, whatever the page is made of', () => {
  // The whole point of the change. A page built in Elementor on the website
  // itself used to come with Edit DISABLED and a paragraph explaining that
  // there was nothing we could do for them.
  for (const over of [
    { editableSectionCount: 0, adoptCandidateCount: 0, sectionCount: 7 },
    { editableSectionCount: 0, adoptCandidateCount: 3 },
    { iaManaged: false, editableSectionCount: 0, sectionCount: 0 },
  ]) {
    assert.ok(rowActions(page(over), 'all').includes('edit'), JSON.stringify(over));
  }
});

test('every row action has a name on screen', () => {
  for (const k of ['edit', 'trash', 'view', 'preview', 'ask', 'restore']) {
    assert.ok(ROW_ACTION_LABEL[k], k);
  }
  assert.equal(ROW_ACTION_LABEL.ask, 'Ask us to change it', 'our own door keeps its own words');
});

test('the bulk actions are the ones the website can actually do', () => {
  assert.deepEqual(bulkActions('all').map((o) => o.label), ['Bulk actions', 'Move to Trash']);
  assert.deepEqual(bulkActions('trash').map((o) => o.label), ['Bulk actions', 'Restore']);
});

/* ═════════════════ 5. the screen itself, and what is now gone ════════════ */

test('the screen is WordPress’s, element for element', () => {
  assert.match(LIVE, /className="wpp-title">Pages</, 'the heading');
  assert.match(LIVE, />\s*Add New Page\s*</, 'the button beside it');
  assert.match(LIVE, /className="wpp-status"/, 'the status links');
  assert.match(LIVE, /Search pages/, 'the search box');
  assert.match(LIVE, /<th>Title<\/th>\s*<th>Author<\/th>\s*<th>Date<\/th>/, 'the three columns');
  assert.match(LIVE, /bulkActions\(view\)/, 'bulk actions');
  assert.match(LIVE, /wpp-pagination/, 'pagination');
  assert.match(LIVE, /type="checkbox"/, 'a tick box per row');
});

test('the card list and every sentence it told a client are DELETED', () => {
  // "Replace means delete." The cards, the chips and the three sentences that
  // told a client how much of their own page we were willing to touch.
  for (const gone of [
    'Built on the website itself',
    'sections you can edit here',
    'may be editable here',
    'Live pages',
    'Deleted pages',
    'StatusChip',
    'splitPages',
    'Put it back',
    'nothing to change',
  ]) {
    // LIVE, not the raw file: the header comment says what was deleted and why,
    // and a comment is not something a client reads.
    assert.ok(!LIVE.includes(gone), `still on the screen: ${gone}`);
  }
});

test('nothing on this screen disables Edit any more', () => {
  assert.ok(!/disabled=\{[^}]*editableSectionCount/.test(LIVE),
    'a page built on the website itself opens like any other');
  assert.ok(!LIVE.includes('adoptCandidateCount'),
    '"adopt" is not a thing a client has to know about');
});

test('the row actions appear on hover AND on keyboard focus, and always on a phone', () => {
  assert.match(CSS, /\.wpp-row:hover \.wpp-actions/);
  assert.match(CSS, /\.wpp-row:focus-within \.wpp-actions/);
  assert.match(CSS, /@media \(hover: none\), \(max-width: 700px\) \{\s*\.arion-page \.wpp-actions \{ visibility: visible; \}/);
  // `visibility`, not `display`: a row that grows a line under the cursor is a
  // row that moves out from under the click.
  assert.match(CSS, /\.wpp-actions \{[^}]*visibility: hidden;/);
});

test('Quick Edit is not offered, because the website cannot do it', () => {
  // The plugin's /pages/<id>/settings sets a slug, a template, a parent and a
  // post's own fields. It does NOT set a title and does NOT set a status, so
  // two of Quick Edit's three boxes would have nowhere to go. Left out and
  // said out loud, rather than shipped half-working.
  assert.ok(!LIVE.includes('Quick Edit'));
  assert.ok(rowActions(page(), 'all').every((a) => a !== 'quick'));
});
