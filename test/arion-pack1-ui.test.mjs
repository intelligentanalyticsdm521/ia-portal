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
import { splitPages } from '../src/arion/utils/siteBuilderCopy.ts';

const ROOT = path.resolve('src/arion');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const node = (id, kind = 'hero') => ({
  id, elType: 'section', settings: { _title: `ia:${kind}:scratch:${id}` }, elements: [],
});

/* ══════════════════════ 1. the preview is the website's ═══════════════════ */

test('the preview opens the WEBSITE, and always offers a real tab', () => {
  const src = read('pages/website/WebsitePages.tsx');
  // The link, not HTML we made up.
  assert.match(src, /previewUrl/);
  assert.match(src, /src=\{preview\.url\}/, 'the frame loads the website itself');
  assert.doesNotMatch(src, /srcDoc/, 'our own approximation of the page is gone');
  // A site that refuses to be framed would otherwise show a blank preview, and
  // a blank preview is the exact failure this replaced.
  assert.match(src, /Open in a new tab/);
  assert.match(stripComments(src), /nothing has been saved/i);
});

test('a preview with no link is a failure, not a blank frame', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /if \(!url\) throw new Error\('Your website built the preview but did not say where it is\.'\)/);
});

/* ═════════════ 2. a website that cannot draw the page stops Save ══════════ */

test('Save is refused when the website said it cannot draw these pages', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /const cannotPublish = !!pageEngine\?\.known && pageEngine\.active === false;/,
    'only a website that TOLD us stops the button');
  assert.match(src, /\|\| cannotPublish/, 'the Save button is disabled by it');
  // ...and the client is told why, in words, above the editor.
  assert.match(src, /pageEngine\?\.known && pageEngine\.active === false && \(/);
  assert.match(src, /cannot show pages built here/);
});

test('"we could not ask the website" never locks the editor', () => {
  const src = read('pages/website/WebsitePages.tsx');
  // `known: false` must not appear on the disabling path. The only test of
  // `active` is against the literal false, never a falsy check.
  assert.doesNotMatch(src, /!pageEngine\?\.active/,
    'a falsy check would treat "we do not know" as "there is none"');
});

/* ════════════════════ 3. the jobs that had no home ═══════════════════════ */

test('page settings, the search fields and delete all have a home', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /Page settings/);
  assert.match(src, /getSitePageSettings/);
  assert.match(src, /getSitePageSeo/);
  assert.match(src, /saveSitePageSettings/);
  assert.match(src, /saveSitePageSeo/);
  assert.match(src, /trashSitePage/);
  assert.match(src, /restoreSitePage/);
});

test('a deleted page can be put back, and the list says how long for', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /Deleted pages/);
  assert.match(src, /Put it back/);
  assert.match(src, /30 days/);
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
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /\(catalogFor\(s\.kind\)\?\.variants\?\.length \|\| 0\) > 0/,
    'a button that opens an empty list is a control that lies');
  assert.match(src, /Change the look/);
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

test('the invented credit table is GONE from the AI Builder', () => {
  const page = read('pages/website/WebsiteAiBuilder.tsx');
  const gen = read('components/AiBlockGenerator.tsx');
  for (const [name, src] of [['WebsiteAiBuilder', page], ['AiBlockGenerator', gen]]) {
    const live = stripComments(src);
    assert.doesNotMatch(live, /SECTION_COSTS/, `${name} still carries its own price table`);
    assert.doesNotMatch(live, /computeSectionCost/, `${name} still computes a price`);
    assert.doesNotMatch(live, /imageHd|perColumn|extraParagraph/, `${name} still has price coefficients`);
    assert.doesNotMatch(live, /TODO F-Onb-D10/, `${name} still has the TODO the endpoint answers`);
  }
});

test('both screens read the price from the one pricing endpoint', () => {
  assert.match(read('pages/website/WebsiteAiBuilder.tsx'), /getSiteAiPricing/);
  assert.match(read('components/AiBlockGenerator.tsx'), /getSiteAiPricing/);
});

test('a price we cannot read is a price we do not quote', () => {
  const gen = read('components/AiBlockGenerator.tsx');
  assert.match(gen, /price == null/, 'no number is better than a made-up one');
  assert.match(gen, /we will tell you/);
  const page = read('pages/website/WebsiteAiBuilder.tsx');
  assert.match(page, /generateCredits == null/);
});

test('no estimated cost travels with the generate request any more', () => {
  const gen = read('components/AiBlockGenerator.tsx');
  assert.doesNotMatch(stripComments(gen), /client_estimated_cost/,
    'a price in the body was a second opinion about a number we do not own');
});

/* ═══════════════════════ 7. the lists still hold ════════════════════════ */

test('a page in the bin is in neither the drafts nor the live list', () => {
  const { drafts, live, deleted } = splitPages([
    { pageId: 1, status: 'publish' }, { pageId: 2, status: 'draft' }, { pageId: 3, status: 'trash' },
  ]);
  assert.deepEqual(deleted.map((p) => p.pageId), [3]);
  assert.deepEqual(drafts.map((p) => p.pageId), [2]);
  assert.deepEqual(live.map((p) => p.pageId), [1]);
});
