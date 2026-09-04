/**
 * "Make it editable" — the Portal half of Phase 3 (decision W-5).
 *
 * The state transforms are the load-bearing part: a client is being shown a
 * choice about a live page, and the row they end up with has to be honest
 * about what happened. Four things get pinned here:
 *
 *   1. a greyed row that CAN be offered says so; one that cannot says why;
 *   2. adopting swaps that row for an ordinary editable one and does NOT
 *      leave the page marked dirty — the write already landed, and inviting a
 *      Save would write it a second time;
 *   3. undoing puts the greyed row back;
 *   4. the review list is a list of rows, one decision each. There is no
 *      "adopt all" anywhere in this file, and there is a test that says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  toEditorSections, isDirty, orderOf, toSavePayload, sectionSummary,
  replaceAdoptedSection, revertAdoptedSection,
  customSectionRows, customSectionCount,
} from '../src/arion/utils/sectionListState.ts';

const node = (id, title) => ({
  id, elType: 'section', settings: title ? { _title: title } : {}, elements: [],
});

const editableHero = (id = 'a') => ({
  index: 0, handle: `ia:hero:scratch:${id}`, kind: 'hero', blueprintId: 'scratch', blockId: id,
  editable: true, reason: null, label: 'Hero banner',
  fields: { headline: 'Welcome', cta_href: '#contact' }, node: node(id, `ia:hero:scratch:${id}`),
  adoptable: false, adoption: null,
});

/** A hand-built banner arion-api says it could take charge of. */
const offerable = (index = 1) => ({
  index, handle: 'Workshop banner (built in Elementor)', kind: null, blueprintId: null, blockId: null,
  editable: false, reason: 'custom', label: 'Custom section — built on the site',
  fields: null, node: node('hb', 'Workshop banner (built in Elementor)'),
  adoptable: true,
  adoptReason: null,
  adoptReasonText: null,
  adoptKind: 'hero',
  adoptKindLabel: 'Hero banner',
  adoptWhy: 'it is one big headline over a background picture',
  adoptPreview: 'Built in Shropshire, delivered to your garden',
  adoptConfidence: 0.93,
  adoptConfidenceLabel: 'high',
  fingerprint: 'fabc-12',
  pluginAdoptable: true,
  adoption: null,
});

/** A hand-built band with a video on it — refused, with the reason. */
const refused = (index = 2) => ({
  index, handle: 'See one being built (built in Elementor)', kind: null, blueprintId: null, blockId: null,
  editable: false, reason: 'custom', label: 'Custom section — built on the site',
  fields: null, node: node('hv', 'See one being built (built in Elementor)'),
  adoptable: false,
  adoptReason: 'would_lose_content',
  adoptReasonText: 'This section has something on it we cannot carry over, so taking charge of it '
    + 'would lose that. We are leaving it exactly as it is.',
  adoptKind: 'cta',
  adoptKindLabel: 'Call to action',
  adoptPreview: 'See one being built',
  adoptConfidence: 0.8,
  adoptConfidenceLabel: 'fair',
  fingerprint: 'fdef-34',
  pluginAdoptable: false,
  adoption: null,
});

/** What the server hands back after an adoption: an ordinary editable row. */
const adoptedHero = (index = 1) => ({
  index, handle: 'ia:hero:adopted:11111111-1111-1111-1111-111111111111',
  kind: 'hero', blueprintId: 'adopted', blockId: '11111111-1111-1111-1111-111111111111',
  editable: true, reason: null, label: 'Hero banner',
  fields: { headline: 'Built in Shropshire, delivered to your garden', cta_text: 'Book a survey' },
  node: node('newhero', 'ia:hero:adopted:11111111-1111-1111-1111-111111111111'),
  adoptable: false,
  adoption: {
    adoptionId: '11111111-1111-1111-1111-111111111111',
    kind: 'hero', confidence: 0.93,
    adoptedAt: new Date().toISOString(), adoptedBy: 'owner@fernbrook.invalid',
    undoUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    canUndo: true,
  },
});

function page() {
  return toEditorSections([editableHero(), offerable(1), refused(2)]);
}

/* ── 1. the review list ────────────────────────────────────────────────── */

test('only the sections built on the site are up for review', () => {
  const s = page();
  assert.equal(customSectionCount(s), 2);
  const rows = customSectionRows(s);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.index), [1, 2]);
});

test('a row that can be offered says what it looks like; one that cannot says why', () => {
  const [can, cannot] = customSectionRows(page());

  assert.equal(can.adoptable, true);
  assert.equal(can.kindLabel, 'Hero banner');
  assert.equal(can.reasonText, null);

  assert.equal(cannot.adoptable, false);
  assert.ok(cannot.reasonText && cannot.reasonText.length > 20,
    'a refusal always carries the reason through to the row');
  assert.doesNotMatch(cannot.reasonText, /widget|elementor|confidence/i,
    'in the client’s words, not ours');
});

test('a review row is recognisable — the first words on the section, not "Custom section" four times', () => {
  const rows = customSectionRows(page());
  assert.equal(rows[0].summary, 'Built in Shropshire, delivered to your garden');
  assert.equal(rows[1].summary, 'See one being built');
  assert.notEqual(rows[0].summary, rows[1].summary);
});

test('a section with no preview from the server still gets a summary', () => {
  const bare = toEditorSections([{ ...offerable(0), adoptPreview: null }]);
  assert.equal(customSectionRows(bare)[0].summary, 'Built on the website itself');
});

test('the EDITOR row reads the same way — four hand-built rows are not four identical lines', () => {
  // customSectionRows feeds the review sheet; the editor list calls
  // sectionSummary directly, and it went on saying "Built on the website
  // itself" for every row long after the review sheet had learned better.
  const s = toEditorSections([editableHero(), offerable(1), refused(2)]);
  assert.equal(sectionSummary(s[1]), 'Built in Shropshire, delivered to your garden');
  assert.equal(sectionSummary(s[2]), 'See one being built');
  assert.notEqual(sectionSummary(s[1]), sectionSummary(s[2]));
  assert.equal(sectionSummary(s[0]), 'Welcome', 'a section we own still reads by its headline');
});

/* ── 2. adopting ───────────────────────────────────────────────────────── */

test('adopting swaps the greyed row for an editable one, in place', () => {
  const s = page();
  const before = orderOf(s);
  const next = replaceAdoptedSection(s, 1, adoptedHero(1));

  assert.equal(next.length, 3, 'no section appears or disappears');
  assert.deepEqual(orderOf(next), before, 'the row keeps its identity, so React keeps its place');
  assert.equal(next[1].editable, true);
  assert.equal(next[1].kind, 'hero');
  assert.equal(next[1].label, 'Hero banner');
  assert.equal(next[1].fields.headline, 'Built in Shropshire, delivered to your garden');
  assert.equal(next[0].uid, s[0].uid, 'the other rows are untouched');
  assert.equal(next[2].uid, s[2].uid);
});

test('an adopted row is NOT dirty — the write already landed', () => {
  const s = page();
  const base = orderOf(s);
  const next = replaceAdoptedSection(s, 1, adoptedHero(1));

  assert.equal(next[1].dirty, false);
  assert.equal(next[1].isNew, undefined === next[1].isNew ? undefined : false);
  assert.equal(isDirty(next, base), false,
    '"Unsaved changes" over something already published would invite a second write');
});

test('an adopted row carries its note and its way back', () => {
  const next = replaceAdoptedSection(page(), 1, adoptedHero(1));
  const row = next[1];
  assert.ok(row.adoption, 'the row knows it was adopted');
  assert.equal(row.adoption.canUndo, true);
  assert.ok(row.adoption.undoUntil, 'and when that stops being true');
  assert.equal(row.adoptable, false, 'it is not offered for adoption a second time');
});

test('an adopted row goes out on the next Save like any other section', () => {
  const next = replaceAdoptedSection(page(), 1, adoptedHero(1));
  const payload = toSavePayload(next);
  assert.equal(payload.length, 3);
  assert.ok(payload[1].fields, 'its values travel, because it is editable now');
  assert.equal(payload[2].fields, null, 'the one still built on the site travels as bytes only');
});

test('adopting does not mutate the list it was given', () => {
  const s = page();
  const snapshot = JSON.stringify(s.map((x) => ({ e: x.editable, l: x.label })));
  replaceAdoptedSection(s, 1, adoptedHero(1));
  assert.equal(JSON.stringify(s.map((x) => ({ e: x.editable, l: x.label }))), snapshot);
});

/* ── 3. undoing ────────────────────────────────────────────────────────── */

test('undoing an adoption puts the greyed row back where it was', () => {
  const adopted = replaceAdoptedSection(page(), 1, adoptedHero(1));
  const back = revertAdoptedSection(adopted, 1, offerable(1));

  assert.equal(back[1].editable, false);
  assert.equal(back[1].reason, 'custom');
  assert.equal(back[1].adoption, null);
  assert.equal(back[1].uid, adopted[1].uid, 'still the same row on screen');
  assert.equal(isDirty(back, orderOf(back)), false);
  assert.equal(customSectionCount(back), 2, 'it counts as built-on-the-site again');
});

/* ── 4. nothing happens by itself ──────────────────────────────────────── */

const SRC = path.join(process.cwd(), 'src', 'arion');

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

/** The same, with comments taken out — some assertions are about CODE only. */
function code(rel) {
  return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('there is no "adopt all" anywhere in the Portal', () => {
  const files = [
    'components/AdoptSectionSheet.tsx',
    'pages/website/WebsitePages.tsx',
    'utils/sectionListState.ts',
  ];
  for (const f of files) {
    const src = code(f);
    assert.doesNotMatch(src, /adopt\s*all/i, `${f} offers a bulk adopt`);
    assert.doesNotMatch(src, /adoptAll|adoptEvery|adoptPage\b/, `${f} offers a bulk adopt`);
  }
});

test('the sheet says nothing changes until the client taps, and offers "keep it as built" as an equal', () => {
  const src = read('components/AdoptSectionSheet.tsx');
  assert.match(src, /Nothing changes on your website until you tap/);
  assert.match(src, /Keep it as built/);
  assert.match(src, /Take charge of it/);
});

test('the adopt button is held back until everything we asked for is filled in', () => {
  const src = read('components/AdoptSectionSheet.tsx');
  assert.match(src, /const missing = needs\.filter/);
  assert.match(src, /const canAdopt = [^;]*missing\.length === 0/);
  assert.match(src, /disabled=\{!canAdopt\}/);
});

test('the Portal never says "tenant", and never shows Elementor vocabulary', () => {
  for (const f of ['components/AdoptSectionSheet.tsx', 'pages/website/WebsitePages.tsx']) {
    const src = read(f);
    assert.doesNotMatch(src, /\btenant\b/i, `${f} says "tenant" (feedback_no_tenant_in_ui)`);
    assert.doesNotMatch(src, /widgetType|_elementor_data|_ia_field/, `${f} leaks our vocabulary`);
  }
});

test('an adoption that comes back with no section is a failure, not a green toast', () => {
  const src = read('pages/website/WebsitePages.tsx');
  // reference_catch_swallow_report_success: this codebase has produced 13+
  // instances of a 200 over a failure, so the check is asserted in source.
  assert.match(src, /if \(!adopted\) throw new Error/);
  assert.match(src, /setAdoptError\(messageFrom\(e, 'We could not take charge of that section/);
});

test('undoing an adoption asks first, and says what goes with it', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /window\.confirm\(\s*'Put this section back exactly as it was built/);
  assert.match(src, /Anything you have changed on it since will go with it/);
});

test('the review entry is only offered when there is something to review', () => {
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /\{customCount > 0 && \(/);
  assert.match(src, /Review sections built on the site \(\{customCount\}\)/);
});
