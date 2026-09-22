/**
 * ARION pack 1, Portal side — "the Portal is the builder" (2026-09-08).
 *
 * What has to hold on the screen a client uses:
 *
 *  1. PREVIEW is the website's own render, opened by a LINK. Not our HTML, and
 *     the client can always get out of the frame into a real tab.
 *  2. A website that says it cannot draw these pages STOPS Save, with the
 *     reason. A website we could not ask does not.
 *  3. Page settings, the search fields, delete and restore all have a home.
 *  4. Changing a section's look keeps its words and its place in the list.
 *  5. Delete a picture only when the website said it is used nowhere.
 *  6. The AI Builder quotes the SERVER's price and no longer computes one.
 *
 * Two kinds of assertion, as in the Phase 2 file next door: state transforms,
 * and source-level rules a browser test could not see cheaply.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { toEditorSections, swapSectionLayout, isDirty, orderOf } from '../src/arion/utils/sectionListState.ts';
import { filterPages, statusLinks, rowActions } from '../src/arion/utils/pagesTable.ts';

const ROOT = path.resolve('src/arion');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/**
 * 2026-09-16: the section-list editor these rows were written against is GONE
 * (BUILDER_PLATFORM_SCOPE §4 step 3). Every rule below still holds; the code
 * moved to the WEBSITE ADAPTER of the one builder, so the rows read it there.
 * Nothing has been relaxed.
 */
const BUILDER = path.resolve('src/builder/adapters/website');
const readBuilder = (p) => fs.readFileSync(path.join(BUILDER, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const node = (id, kind = 'hero') => ({
  id, elType: 'section', settings: { _title: `ia:${kind}:scratch:${id}` }, elements: [],
});

/* ══════════════════════ 1. the preview is the website's ═══════════════════ */

test('the preview opens the WEBSITE, and always offers a real tab', () => {
  const src = readBuilder('WebsiteBuilder.tsx');
  // The link, not HTML we made up.
  assert.match(src, /previewUrl/);
  assert.match(src, /src=\{previewUrl \|\| undefined\}/, 'the frame loads the website itself');
  assert.doesNotMatch(src, /srcDoc/, 'our own approximation of the page is gone');
  // A site that refuses to be framed would otherwise show a blank preview, and
  // a blank preview is the exact failure this replaced.
  assert.match(src, /Open in a new tab/);
  assert.match(stripComments(src), /nothing has been saved/i);
});

test('a preview with no link is a failure, not a blank frame', () => {
  const src = readBuilder('WebsiteBuilder.tsx');
  assert.match(src, /if \(!url\) throw new Error\('Your website built the preview but did not say where it is\.'\)/);
});

/* ═════════════ 2. a website that cannot draw the page stops Save ══════════ */

test('Save is refused when the website said it cannot draw these pages', () => {
  const src = readBuilder('WebsiteBuilder.tsx');
  assert.match(src, /const cannotPublish = !!pageEngine\?\.known && pageEngine\.active === false;/,
    'only a website that TOLD us stops the button');
  assert.match(src, /\|\| cannotPublish/, 'the Save button is disabled by it');
  // ...and the client is told why, in words, in the builder's own pane.
  assert.match(src, /\{cannotPublish && \(/);
  assert.match(src, /cannot show pages built here/);
});

test('"we could not ask the website" never locks the editor', () => {
  const src = readBuilder('WebsiteBuilder.tsx');
  // `known: false` must not appear on the disabling path. The only test of
  // `active` is against the literal false, never a falsy check.
  assert.doesNotMatch(src, /!pageEngine\?\.active/,
    'a falsy check would treat "we do not know" as "there is none"');
});

/* ════════════════════ 3. the jobs that had no home ═══════════════════════ */

test('page settings, the search fields and delete all have a home', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(readBuilder('WebsiteBuilder.tsx'), /Page settings/);
  assert.match(src, /getSitePageSettings/);
  assert.match(src, /getSitePageSeo/);
  assert.match(src, /saveSitePageSettings/);
  assert.match(src, /saveSitePageSeo/);
  assert.match(src, /trashSitePage/);
  assert.match(src, /restoreSitePage/);
});

test('a deleted page can be put back, and the list says how long for', () => {
  // The "Deleted pages" card is gone (2026-09-22); the bin is WordPress's own
  // Trash link, and the way back out is the row action WordPress calls
  // Restore. The 30 days are still said out loud, on both doors.
  const src = read('pages/website/WebsitePages.tsx');
  assert.deepEqual(
    statusLinks([{ pageId: 1, status: 'trash' }]).find((l) => l.view === 'trash'),
    { view: 'trash', label: 'Trash', count: 1 });
  assert.deepEqual(rowActions({ pageId: 1, status: 'trash' }, 'trash'), ['restore']);
  assert.match(src, /30 days/);
  assert.match(src, /restoreSitePage/);
});

test('the home page cannot be deleted, and a draft cannot be made the home page', () => {
  const sheet = read('components/PageSettingsSheet.tsx');
  // Deleting the page a website opens on would leave the client with nothing.
  assert.match(sheet, /disabled=\{busy !== null \|\| settings\.isHomePage\}/);
  assert.match(sheet, /Make a different page your home page first/);
  // A draft home page renders an empty website.
  assert.match(sheet, /disabled=\{busy !== null \|\| isDraft\}/);
  assert.match(sheet, /a draft home page would leave your website blank/i);
});

test('a draft that will be renamed on publish says so BEFORE it is published', () => {
  const sheet = read('components/PageSettingsSheet.tsx');
  assert.match(sheet, /settings\.slugOnPublish !== settings\.slug/);
  assert.match(sheet, /when you publish this page it will/);
});

test('the settings sheet warns that changing an address breaks the old one', () => {
  const sheet = read('components/PageSettingsSheet.tsx');
  assert.match(stripComments(sheet), /the old address stops working/);
});

test('a page layout the site does not have is never offered — the list is the site’s', () => {
  const sheet = read('components/PageSettingsSheet.tsx');
  assert.match(sheet, /settings\.templates\.map/);
  assert.doesNotMatch(stripComments(sheet), /elementor/i, 'no vendor name on a client’s screen');
});

/* ═══════════════ 4. changing the look keeps the words ════════════════════ */

test('a swapped section keeps its place, its id and its words, and is unsaved', () => {
  const list = toEditorSections([
    { index: 0, handle: 'ia:hero:scratch:a', kind: 'hero', blueprintId: 'scratch', blockId: 'a', editable: true, reason: null, label: 'Hero banner', fields: { headline: 'Old' }, node: node('a') },
    { index: 1, handle: 'ia:faq:scratch:b', kind: 'faq', blueprintId: 'scratch', blockId: 'b', editable: true, reason: null, label: 'Questions', fields: {}, node: node('b', 'faq') },
  ]);
  const before = orderOf(list);
  const swapped = swapSectionLayout(list, list[0].uid, {
    index: 99, handle: 'ia:hero:split-left:a', kind: 'hero', blueprintId: 'split-left', blockId: 'a',
    editable: true, reason: null, label: 'Hero banner', fields: { headline: 'Old' }, node: node('a2'),
  });

  assert.equal(swapped[0].uid, list[0].uid, 'the row does not re-mount or move');
  assert.equal(swapped[0].index, 0, 'the server’s index is ignored — position is the list’s');
  assert.equal(swapped[0].blueprintId, 'split-left', 'the layout changed');
  assert.equal(swapped[0].fields.headline, 'Old', 'the words came across');
  assert.equal(swapped[0].dirty, true, 'nothing has reached the website yet');
  assert.equal(swapped[0].isProposed, false);
  assert.equal(swapped[1].uid, list[1].uid, 'the other rows are untouched');
  assert.deepEqual(orderOf(swapped), before, 'the order is unchanged');
  assert.equal(isDirty(swapped, before), true, 'Save lights up');
});

test('"Change the look" is offered only where there are other layouts', () => {
  const src = readBuilder('SiteInspectorExtras.tsx');
  assert.match(src, /\{others\.length > 0 && \(/,
    'a button that opens an empty list is a control that lies');
  assert.match(src, /Change the look/);
  // "Others" is the layouts of this kind MINUS the one it is already wearing.
  assert.match(src, /variants\.filter\(\(v\) => v\.blueprintId !== blueprintId\)/);
});

test('the swap sheet says the layout is replaced and that nothing is saved yet', () => {
  const sheet = read('components/SwapLookSheet.tsx');
  assert.match(sheet, /The layout is replaced/);
  assert.match(sheet, /wording and your pictures come across/);
  assert.match(sheet, /until you save/);
});

test('the layout a section already has is not offered as a change', () => {
  const sheet = read('components/SwapLookSheet.tsx');
  assert.match(sheet, /v\.blueprintId === currentBlueprintId/);
  assert.match(sheet, /the one you have/);
});

/* ══════════════ 5. delete a picture only when it is used nowhere ═════════ */

test('Delete appears only after the website said the picture is used nowhere', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /api\.remove && usage\?\.canDelete && \(/,
    'the button is gated on the ANSWER, not on the question having been asked');
  assert.match(src, /Where is this used\?/);
  assert.match(src, /cannot be undone/);
});

test('a picture used on a draft counts as used, and the pages are named', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /pl\.status !== 'publish' \? ' \(draft\)' : ''/);
});

test('the usage answer is cleared when a different picture is chosen', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /The answer belongs to the picture that was showing/);
  assert.match(src, /setUsage\(null\);/);
});

test('replacing a picture says the browser may hold the old one', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /may hold the old one for a while/);
});

/* ══════════════════ 6. the AI Builder quotes the server ═════════════════ */

test('the AI Builder is GONE — configurator, generator and assembler', () => {
  // BUILDER_PLATFORM_SCOPE §6 Q1: "In ARION it REPLACES the generate-and-accept
  // configurator; Ask ARGUS lives inside the builder." Replace means delete, so
  // the strongest form of "the invented credit table is gone" is that the three
  // files that carried it are gone.
  for (const gone of [
    'src/arion/pages/website/WebsiteAiBuilder.tsx',
    'src/arion/components/AiBlockGenerator.tsx',
    'src/arion/components/AiPageAssembler.tsx',
  ]) {
    assert.equal(fs.existsSync(path.resolve(gone)), false, `${gone} is still here`);
  }
});

test('the old address still lands somewhere that works', () => {
  const router = fs.readFileSync(path.resolve('src/pages/ServiceRouter.tsx'), 'utf8');
  assert.doesNotMatch(router, /WebsiteAiBuilder/);
  assert.match(router, /arion_website_ai_builder/);
  assert.match(router, /Navigate to="\/app\/services\/arion_website_pages"/);
});

test('the builder quotes the SERVER price and computes none', () => {
  const src = readBuilder('WebsiteBuilder.tsx');
  assert.match(src, /getPricing/);
  assert.match(src, /pricing\?\.actions\?\.page\?\.credits/);
  const live = stripComments(src);
  assert.doesNotMatch(live, /SECTION_COSTS|computeSectionCost|client_estimated_cost/,
    'a price in the Portal is a second opinion about a number we do not own');
});

/* ═══════════════════════ 7. the lists still hold ════════════════════════ */

/* The three lists are now WordPress's three status links (2026-09-22), so the
   rule is asserted where it lives — `filterPages` — and not on the two cards
   that are gone. Nothing has been relaxed: a page in the bin is still in
   neither of the other two. */
test('a page in the bin is under Trash, and under neither Published nor Drafts', () => {
  const pages = [
    { pageId: 1, status: 'publish' }, { pageId: 2, status: 'draft' }, { pageId: 3, status: 'trash' },
  ];
  const ids = (view) => filterPages(pages, view, '').map((p) => p.pageId);
  assert.deepEqual(ids('trash'), [3]);
  assert.deepEqual(ids('draft'), [2]);
  assert.deepEqual(ids('publish'), [1]);
  assert.deepEqual(ids('all'), [1, 2], 'All is everything but the bin, exactly as WordPress counts it');
});
