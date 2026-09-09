/**
 * ARION pack 2, Portal side — "nothing left in wp-admin" (2026-09-09).
 *
 * What has to hold on the screen a client uses:
 *
 *  1. THE MENU EDITOR'S ARITHMETIC. Nesting is by position, so every move and
 *     every removal has to re-point every parent reference — otherwise moving
 *     one row silently re-parents somebody else's entry, and the menu looks
 *     right in the Portal and is wrong on the website.
 *  2. NOTHING IS SAVED UNTIL SAVE, and the screen says so.
 *  3. A SETTING THE WEBSITE'S DESIGN DOES NOT OFFER is shown with its reason,
 *     not hidden. A missing option is indistinguishable from a bug.
 *  4. NO VENDOR'S NAME on a client's screen, and no "tenant".
 *  5. THE LIE IS GONE: the card that told clients to manage users in WP Admin
 *     (D-ARION-D).
 *  6. BLOG POSTS have their own list and their own "write one".
 *
 * Two kinds of assertion, as in the pack 1 file next door: state transforms,
 * and source-level rules a browser test could not see cheaply.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  toMenuRows, toMenuInput, moveMenuRow, removeMenuRow, toggleMenuRowParent,
  canTuckMenuRow, menuRowsEqual,
} from '../src/arion/utils/menuListState.ts';
import { splitPages } from '../src/arion/utils/siteBuilderCopy.ts';

const ROOT = path.resolve('src/arion');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const menu = (items) => ({
  menuId: 2, name: 'Main', locations: ['menu-1'], canUndo: false, items,
});
const item = (itemId, title, parentItemId = 0) => ({
  itemId, title, kind: 'custom', objectId: 0, url: '/', parentItemId,
});

/* ═══════════════════ 1. the menu editor's arithmetic ════════════════════ */

test('a menu comes in with its nesting expressed by position', () => {
  const rows = toMenuRows(menu([
    item(10, 'Home'),
    item(11, 'Services'),
    item(12, 'Mowing', 11),
  ]));
  assert.deepEqual(rows.map((r) => r.title), ['Home', 'Services', 'Mowing']);
  assert.equal(rows[0].parentIndex, null);
  assert.equal(rows[2].parentIndex, 1, 'Mowing sits under Services');
});

test('moving a row re-points every parent, so nobody is silently re-parented', () => {
  const rows = toMenuRows(menu([
    item(10, 'Home'),
    item(11, 'Services'),
    item(12, 'Mowing', 11),
  ]));
  // Home goes to the bottom. Services and Mowing both slide up one.
  const moved = moveMenuRow(rows, 0, 2);
  assert.deepEqual(moved.map((r) => r.title), ['Services', 'Mowing', 'Home']);
  assert.equal(moved[1].parentIndex, 0, 'Mowing still sits under Services');
  assert.equal(moved[2].parentIndex, null, 'Home is still top level');
});

test('moving the PARENT keeps its child pointing at it', () => {
  const rows = toMenuRows(menu([
    item(10, 'Home'),
    item(11, 'Services'),
    item(12, 'Mowing', 11),
  ]));
  const moved = moveMenuRow(rows, 1, 0);
  assert.deepEqual(moved.map((r) => r.title), ['Services', 'Home', 'Mowing']);
  assert.equal(moved[2].parentIndex, 0, 'Mowing follows Services to its new index');
});

test('removing a parent brings its children back out, never re-parents them', () => {
  const rows = toMenuRows(menu([
    item(10, 'Home'),
    item(11, 'Services'),
    item(12, 'Mowing', 11),
  ]));
  const after = removeMenuRow(rows, 1);
  assert.deepEqual(after.map((r) => r.title), ['Home', 'Mowing']);
  assert.equal(after[1].parentIndex, null, 'Mowing must not end up under Home');
});

test('removing a row above a nested pair keeps the pair together', () => {
  const rows = toMenuRows(menu([
    item(10, 'Home'),
    item(11, 'Services'),
    item(12, 'Mowing', 11),
  ]));
  const after = removeMenuRow(rows, 0);
  assert.deepEqual(after.map((r) => r.title), ['Services', 'Mowing']);
  assert.equal(after[1].parentIndex, 0);
});

test('tucking a row under the one above it, and bringing it back out', () => {
  const rows = toMenuRows(menu([item(10, 'Home'), item(11, 'Services')]));
  const tucked = toggleMenuRowParent(rows, 1);
  assert.equal(tucked[1].parentIndex, 0);
  const out = toggleMenuRowParent(tucked, 1);
  assert.equal(out[1].parentIndex, null);
  // The first row has nothing to tuck under.
  assert.equal(toggleMenuRowParent(rows, 0)[0].parentIndex, null);
});

test('a menu never builds a third level, from either direction', () => {
  // Tucking a row under a row that is ITSELF tucked would make a third level,
  // which no theme on the estate draws well. It becomes a SIBLING instead.
  const rows = toMenuRows(menu([item(10, 'Home'), item(11, 'Services'), item(12, 'Mowing')]));
  const two = toggleMenuRowParent(rows, 1);              // Services under Home
  assert.equal(two[1].parentIndex, 0);
  const three = toggleMenuRowParent(two, 2);             // Mowing under Services?
  assert.equal(three[2].parentIndex, 0, 'it sits beside Services, under Home — not a third level');

  // And from the other direction: a row that already HAS children cannot be
  // tucked itself, because that would push its children down to a third level.
  const withChild = toMenuRows(menu([item(10, 'Home'), item(11, 'Services'), item(12, 'Mowing', 11)]));
  assert.equal(withChild[2].parentIndex, 1, 'Mowing sits under Services');
  assert.equal(canTuckMenuRow(withChild, 1), false, 'Services has an entry under it already');
  assert.equal(canTuckMenuRow(withChild, 0), false, 'the first row has nothing to sit under');
  assert.equal(canTuckMenuRow(withChild, 2), true, 'a tucked row may always come back out');
});

test('the tuck button carries the reason it is greyed', () => {
  const src = read('pages/website/WebsiteMenus.tsx');
  assert.match(src, /canTuckMenuRow\(rows, i\)/);
  assert.match(src, /one level deep/i, 'a greyed button that says nothing is a bug report');
});

test('the whole ordered list is what goes back, every time', () => {
  const rows = toMenuRows(menu([item(10, 'Home'), item(11, 'Services')]));
  const input = toMenuInput(rows);
  assert.equal(input.length, 2);
  assert.equal(input[0].itemId, 10);
  assert.equal(input[0].parentIndex, null);
  // Nothing in the payload is a WordPress word.
  assert.equal(JSON.stringify(input).includes('menu_item_parent'), false);
});

test('an unchanged list is not dirty, and a reorder is', () => {
  const rows = toMenuRows(menu([item(10, 'Home'), item(11, 'Services')]));
  assert.equal(menuRowsEqual(rows, rows), true);
  assert.equal(menuRowsEqual(moveMenuRow(rows, 0, 1), rows), false);
});

/* ═══════════════════ 2. nothing is saved until Save ═════════════════════ */

test('the menus screen says nothing has been saved, and offers Undo', () => {
  const src = read('pages/website/WebsiteMenus.tsx');
  const body = stripComments(src);
  assert.match(body, /Nothing has been saved yet/i);
  assert.match(body, /Save this menu/);
  assert.match(body, /Undo last change/);
  // Switching menus with unsaved work would throw it away silently.
  assert.match(body, /disabled=\{dirty && m\.menuId !== menuId\}/);
});

test('the brand screen says nothing has been saved before it is', () => {
  const body = stripComments(read('pages/website/WebsiteDesign.tsx'));
  assert.match(body, /Nothing has been saved yet/i);
  assert.match(body, /Save colours and fonts/);
  assert.match(body, /Save the header and footer/);
});

/* ═══════════ 3. an option the design does not offer says why ════════════ */

test('an unsupported setting is shown WITH its reason, never dropped', () => {
  const src = read('pages/website/WebsiteDesign.tsx');
  assert.match(src, /if \(!f\.supported\)/);
  assert.match(src, /\{f\.reason\}/);
});

test('a brand colour we do not have is never invented on the screen', () => {
  const body = stripComments(read('pages/website/WebsiteDesign.tsx'));
  assert.match(body, /hasBrandColour/);
  assert.match(body, /no brand colour on file/i);
});

/* ═══════════════════ 4. no vendor's name, no "tenant" ══════════════════ */

test('no vendor name and no "tenant" on any of the pack 2 screens', () => {
  for (const file of [
    'pages/website/WebsiteMenus.tsx',
    'pages/website/WebsiteDesign.tsx',
    'pages/website/WebsiteSettings.tsx',
    'utils/menuListState.ts',
  ]) {
    const body = stripComments(read(file));
    for (const word of ['WordPress', 'Elementor', 'wp-admin', 'Astra', 'Hello Elementor', 'tenant']) {
      assert.equal(body.includes(word), false, `${file} says "${word}" on a client's screen`);
    }
  }
});

/* ═══════════════════ 5. the WP Admin users lie is gone ═════════════════ */

test('the card that told clients to manage users in WP Admin is GONE (D-ARION-D)', () => {
  const src = read('pages/website/WebsiteSettings.tsx');
  const body = stripComments(src);
  assert.equal(/WP Admin/.test(body), false, 'the WP Admin instruction is still on the screen');
  assert.equal(/WordPress Users/.test(body), false);
  // And it was replaced with the truth, not simply deleted.
  assert.match(stripComments(src), /Whoever you invite to this account/);
});

test('the two switches that lived only in WordPress have a home', () => {
  const body = stripComments(read('pages/website/WebsiteSettings.tsx'));
  assert.match(body, /The chat bubble/);
  assert.match(body, /chatEnabled/);
  assert.match(body, /bookingInHeader/);
  assert.match(body, /bookingLabel/);
});

/* ═══════════════════ 6. blog posts ═════════════════════════════════════ */

test('blog posts are their own list, not mixed in with the pages', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /const livePosts = useMemo\(\(\) => live\.filter\(\(p\) => p\.type === 'post'\)/);
  assert.match(src, /\{livePosts\.map\(row\)\}/, 'the Blog posts card renders the posts');
  assert.match(src, /const livePages = useMemo\(\(\) => live\.filter\(\(p\) => p\.type !== 'post'\)/);
  assert.match(stripComments(src), /Blog posts/);
  assert.match(stripComments(src), /Write a post/);
});

test('a post is created as a post, not a page', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /type: newKind/);
});

test('splitPages still keeps drafts and the bin apart, posts included', () => {
  const pages = [
    { pageId: 1, status: 'publish', type: 'page' },
    { pageId: 2, status: 'draft', type: 'post' },
    { pageId: 3, status: 'trash', type: 'post' },
    { pageId: 4, status: 'publish', type: 'post' },
  ];
  const { drafts, live, deleted } = splitPages(pages);
  assert.deepEqual(drafts.map((p) => p.pageId), [2]);
  assert.deepEqual(live.map((p) => p.pageId), [1, 4]);
  assert.deepEqual(deleted.map((p) => p.pageId), [3]);
});

test('a blog post gets its own four fields in the settings sheet', () => {
  const body = stripComments(read('components/PageSettingsSheet.tsx'));
  assert.match(body, /About this post/);
  assert.match(body, /Filed under/);
  assert.match(body, /Tags/);
  assert.match(body, /The picture that goes with it/);
  // And a page never sees them.
  assert.match(read('components/PageSettingsSheet.tsx'), /\{post && \(/);
});

/* ═══════════════════ 7. every new screen is reachable ══════════════════ */

test('both new screens are in the catalogue, the nav and the router', () => {
  const catalog = fs.readFileSync(path.resolve('src/config/serviceCatalog.ts'), 'utf8');
  const nav = fs.readFileSync(path.resolve('src/components/SubNav.tsx'), 'utf8');
  const router = fs.readFileSync(path.resolve('src/pages/ServiceRouter.tsx'), 'utf8');
  for (const key of ['arion_website_menus', 'arion_website_design']) {
    assert.ok(catalog.includes(key), `${key} is missing from the catalogue`);
    assert.ok(nav.includes(key), `${key} is missing from the nav`);
    assert.ok(router.includes(`case '${key}'`), `${key} has no route`);
  }
});

/* ═══════════════ 8. the finish line (D-ARION-G) ════════════════════════ */

test('the WP Admin button is IA staff only, and gated on isFounder', () => {
  const src = read('components/ArionPageHeader.tsx');
  const body = stripComments(src);
  assert.match(body, /useIsFounder/, 'the button must be gated on the founder flag');
  assert.equal(/useIsSuperAdmin|isSuperUser/.test(body), false,
    'isSuperUser is the WRONG flag for this (reference_role_access_model)');
  assert.match(src, /\{isFounder && \(/, 'the button is inside the founder gate');
  // And the gate wraps the BUTTON, not merely its label.
  const gated = src.slice(src.indexOf('{isFounder && ('));
  assert.match(gated.slice(0, 600), /WP Admin/);
});

/**
 * The finish line's REAL test. Taking the button away is only half of it: a
 * screen that still says "use the WP Admin button in the topbar" now points a
 * client at something they cannot see, which is worse than before.
 *
 * Every ARION screen that used to give a client WordPress instructions is
 * listed here. Any of them saying it again fails.
 */
test('no ARION screen tells a client to go into WordPress', () => {
  const files = [
    'pages/hosting/HostingBackups.tsx',
    'pages/website/ContentSeoOverview.tsx',
    'pages/website/PerformanceCache.tsx',
    'pages/website/WebsiteUpdates.tsx',
    'pages/search/SearchBingIndexNow.tsx',
    'pages/website/WebsiteSettings.tsx',
    'pages/website/WebsiteMenus.tsx',
    'pages/website/WebsiteDesign.tsx',
    'pages/website/WebsitePages.tsx',
  ];
  // The INSTRUCTION is what strands a client — a screen that names the tool it
  // is reporting on (Content SEO reports on the search-engine plugin) is a
  // separate, older wording problem, logged in §4d rather than fixed here.
  for (const file of files) {
    const body = stripComments(read(file));
    for (const phrase of ['WP Admin', 'WP admin', 'wp-admin', 'WordPress editor', 'Plugins → Add New', 'File Manager']) {
      assert.equal(body.includes(phrase), false, `${file} still says "${phrase}" to a client`);
    }
  }
  // The insight cards a client reads are the same rule.
  const rules = fs.readFileSync(path.resolve('src/components/iainsights/arionTechnicalRules.ts'), 'utf8');
  assert.equal(/WP Admin/.test(stripComments(rules)), false, 'an insight still tells a client to open WordPress');
});

test('the two doors left on the practice-copy page are IA staff only', () => {
  const src = read('pages/website/WebsiteStaging.tsx');
  assert.match(src, /useIsFounder/);
  assert.equal(/useIsSuperAdmin|isSuperUser/.test(src), false);
  // Gated where the VALUE is made, not where it is drawn: a client never holds
  // either address, so no later edit to the markup can put one back on their
  // screen by accident.
  assert.match(src, /const stagingAdmin = isFounder &&/);
  assert.match(src, /const manageUrl = isFounder\s*\n?\s*\?/);
  // And the client is told what a practice copy is FOR, rather than being
  // handed somebody else's publish workflow.
  assert.match(stripComments(src), /practice copy/i);
});

test('the deep link is asked for by name, not built by hand', () => {
  const api = fs.readFileSync(path.resolve('src/lib/arionApi.ts'), 'utf8');
  assert.match(api, /dest\?: string/);
  assert.match(api, /dest=\$\{encodeURIComponent\(params\.dest\)\}/);
});
