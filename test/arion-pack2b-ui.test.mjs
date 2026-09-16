/**
 * ARION pack 2b, Portal side — the edit sheet for a hand-drawn card.
 *
 * A curated layout draws its own cards, and two things follow that the sheet
 * has never had to deal with before:
 *
 *  1. A CARD ONLY HAS ROOM FOR WHAT ITS AUTHOR DREW. A hand-drawn testimonial
 *     has a quote and a name and no star rating. Offering a "Stars" box that
 *     saves nowhere is the failure this codebase keeps finding, not a feature,
 *     so the server says which sub-fields have a home and the sheet renders
 *     only those.
 *  2. NOTHING IS DECIDED SILENTLY. Where the server had to guess which of two
 *     text blocks is which, it says so, and the sheet shows "check this" with
 *     one tap that swaps them over.
 *
 * Source-level assertions, in the style of the pack 1 and pack 2 files next
 * door: these are rules about the screen that a browser test could not see
 * cheaply, and they fail loudly if somebody takes the honesty out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const SHEET = 'arion/components/SectionEditSheet.tsx';
const PAGES = 'arion/pages/website/WebsitePages.tsx';
const API = 'lib/arionApi.ts';

/* ═════════════ 1. a box with nowhere to go is not offered ═══════════════ */

test('the sheet filters a list’s sub-fields down to the ones this layout can keep', () => {
  const src = stripComments(read(SHEET));
  assert.match(src, /itemFields\?\.\[spec\.key\]/,
    'the sheet asks the section which sub-fields have a home');
  assert.match(src, /spec\.item\.filter\(\(sub\) => allowed\.includes\(sub\.key\)\)/,
    'and renders only those');
  assert.match(src, /spec=\{shown\}/, 'the filtered spec is what the list is rendered from');
});

test('a new card is built from the filtered spec, not the full one', () => {
  // Otherwise "Add a package" would seed keys the layout cannot hold, and the
  // client would type into them and lose it on Save.
  assert.match(stripComments(read(SHEET)), /blankItem\(shown\)/);
});

test('a section with no itemFields is rendered exactly as before', () => {
  const src = stripComments(read(SHEET));
  assert.match(src, /if \(!allowed \|\| !spec\.item\) return spec;/,
    'our own archetypes, where every field always has a home, are untouched');
});

/* ═════════════════════ 2. "check this", and one tap ═════════════════════ */

test('the sheet shows the guess as a question, with the two boxes named', () => {
  const src = stripComments(read(SHEET));
  assert.match(src, /Check this/, 'it is labelled as something to check');
  assert.match(src, /\{review\.why\}/, 'the server’s own sentence is shown, not a code');
  assert.match(src, /Swap them over/, 'and there is one tap that answers it');
  assert.match(src, /review\.fields\.includes\(sub\.key\)/,
    'the two boxes are named the way the sheet names them below');
});

/* 2026-09-16: the role swap moved with the editor onto the one builder's
 * website adapter. Same three rules, same strictness, new home. */
const BUILDER = 'src/builder/adapters/website/WebsiteBuilder.tsx';
const INSPECTOR = 'src/builder/adapters/website/SiteInspectorExtras.tsx';
const readSrc = (p) => fs.readFileSync(path.resolve(p), 'utf8');

test('the swap goes to the server, because the Portal never invents Elementor JSON', () => {
  const src = stripComments(readSrc(BUILDER));
  assert.match(src, /api\.swapRoles\(/);
  assert.match(src, /node: \(w\.props as any\)\[NODE_PROP\]/, 'the section it holds is what it hands back');
  assert.doesNotMatch(src, /_ia_role/, 'the Portal does not touch the markers itself');
});

test('a swap is an unsaved edit like every other, and the builder says so', () => {
  const src = stripComments(readSrc(BUILDER));
  assert.match(src, /sections: doc\.sections\.map\(\(x\) => \(x\.id === sectionId \? sectionFromServer\(entry\) : x\)\)/,
    'it replaces the section in the document like every other edit, which marks it dirty');
  assert.match(src, /Save when you are happy/i);
});

test('a swap that fails says so instead of finishing quietly', () => {
  const src = stripComments(readSrc(BUILDER));
  const block = src.slice(src.indexOf('const swapRoles'), src.indexOf('const deps'));
  assert.match(block, /setErr\(messageFrom\(/, 'the error reaches the screen');
  assert.match(block, /Nothing was changed/, 'and says what did not happen');
  assert.match(block, /finally\s*\{\s*setRoleSwapBusy\(false\)/, 'the button always comes back');
});

test('the note is rendered only where the server raised one', () => {
  const src = stripComments(readSrc(INSPECTOR));
  assert.match(src, /roleReview\.map\(/);
  assert.match(src, /Array\.isArray\(\(widget\.props as any\)\?\.__roleReview\)/,
    'no server note, no box');
});

test('nothing is shown when there is nothing to check', () => {
  const src = stripComments(read(SHEET));
  assert.match(src, /const review = reviews\.find\(\(r\) => r\.list === spec\.key\) \|\| null;/);
  assert.match(src, /\{review && onSwapRoles && \(/,
    'the note renders only when the server raised one');
});

/* ═══════════════════ 3. the wording a client reads ══════════════════════ */

test('no vendor’s name and no "tenant" anywhere on this screen', () => {
  for (const f of [SHEET, PAGES]) {
    const src = stripComments(read(f));
    for (const word of ['WordPress', 'Elementor', 'wp-admin', 'tenant', 'Tenant']) {
      assert.equal(src.includes(word), false, `${f} mentions "${word}"`);
    }
  }
});

test('the "check this" row is a real tap target on a phone', () => {
  const src = read(SHEET);
  const block = src.slice(src.indexOf('function RoleReviewNote'), src.indexOf('export function SectionEditSheet'));
  assert.match(block, /minHeight: 44/);
});

/* ═══════════════════════ 4. the types carry it ══════════════════════════ */

test('a section carries what the layout can hold and what needs checking', () => {
  const src = read(API);
  assert.match(src, /itemFields\?: Record<string, string\[\]> \| null;/);
  assert.match(src, /roleReview\?: SectionRoleReview\[\] \| null;/);
  assert.match(src, /export interface SectionRoleReview \{/);
  assert.match(src, /export async function swapSectionRoles\(/);
});

test('the swap route is the one the server exposes', () => {
  assert.match(read(API), /\/sections\/roles\/swap/);
});
