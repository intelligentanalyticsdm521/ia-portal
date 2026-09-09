/**
 * "Ask ARGUS to change it" — the Portal half.
 *
 * The rule the whole feature rests on is that a suggestion is not a change.
 * These pin it down at the only place a browser is not needed to see it:
 * the editor's own state transforms, the API client's shape, and the words on
 * the screen.
 *
 * The three that matter, each mutation-tested by breaking it and confirming
 * this file goes red:
 *   1. a suggested section is NOT in the save payload;
 *   2. approving a suggestion fills the editor, and Save is still the only
 *      thing that reaches the website;
 *   3. discarding leaves the list exactly as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  toEditorSections, toSavePayload, isDirty, orderOf,
  proposalIdsOf, applyProposal, applyPageProposal,
  insertProposedSection, acceptProposedSections, dropProposedSections,
  sectionSummary,
} from '../src/arion/utils/sectionListState.ts';
import { costLine, splitPages } from '../src/arion/utils/siteBuilderCopy.ts';

const node = (id, kind = 'hero') => ({
  id, elType: 'section', settings: { _title: `ia:${kind}:scratch:${id}` }, elements: [],
});

const section = (i, id, kind, fields, editable = true) => ({
  index: i, handle: editable ? `ia:${kind}:scratch:${id}` : 'Awards strip',
  kind: editable ? kind : null, blueprintId: editable ? 'scratch' : null, blockId: editable ? id : null,
  editable, reason: editable ? null : 'custom',
  label: editable ? 'Hero banner' : 'Custom section — built on the site',
  fields, node: node(id, kind),
});

function fixture() {
  return toEditorSections([
    section(0, 'a', 'hero', { headline: 'Welcome', subheadline: 'We build things.', cta_text: 'Call us' }),
    section(1, 'b', 'hero', null, false),
    section(2, 'c', 'cta', { headline: 'Ready?' }),
  ]);
}

const PROPOSAL = '99999999-9999-9999-9999-999999999999';

/* ==========================================================================
 * A suggestion is not a change
 * ======================================================================== */

test('a suggested section shows in the list and is left out of the save', () => {
  const s = fixture();
  const withSuggestion = insertProposedSection(
    s, section(0, 'new', 'faq', { headline: 'Winter questions' }), 1, PROPOSAL,
  );

  // Visible, in position, marked.
  assert.equal(withSuggestion.length, 4);
  assert.equal(withSuggestion[2].isProposed, true);
  assert.deepEqual(withSuggestion.map((x) => x.index), [0, 1, 2, 3]);

  // …and NOT in what Save sends. This is the assertion the whole propose-only
  // promise rests on at the level of a whole new section.
  assert.equal(toSavePayload(withSuggestion).length, 3);
  assert.equal(toSavePayload(s).length, 3);
});

test('a suggestion on screen does not count as an unsaved change', () => {
  const s = fixture();
  const base = orderOf(s);
  const withSuggestion = insertProposedSection(s, section(0, 'new', 'faq', {}), 1, PROPOSAL);
  assert.equal(isDirty(withSuggestion, base), false, 'nothing a Save would write has changed yet');

  // Accepting it is a change.
  assert.equal(isDirty(acceptProposedSections(withSuggestion), base), true);
});

test('discarding puts the list back exactly as it was', () => {
  const s = fixture();
  const before = JSON.stringify(s.map((x) => ({ uid: x.uid, index: x.index, fields: x.fields })));
  const withTwo = insertProposedSection(
    insertProposedSection(s, section(0, 'n1', 'faq', {}), 0, PROPOSAL),
    section(0, 'n2', 'cta', {}), 2, PROPOSAL,
  );
  assert.equal(withTwo.length, 5);

  const dropped = dropProposedSections(withTwo);
  assert.equal(dropped.length, 3);
  assert.equal(
    JSON.stringify(dropped.map((x) => ({ uid: x.uid, index: x.index, fields: x.fields }))),
    before,
  );
});

test('accepting a suggested section makes it an ordinary unsaved one', () => {
  const s = insertProposedSection(fixture(), section(0, 'new', 'faq', { headline: 'Q&A' }), 2, PROPOSAL);
  const accepted = acceptProposedSections(s);
  const added = accepted.find((x) => x.proposalId === PROPOSAL);
  assert.equal(added.isProposed, false);
  assert.equal(added.dirty, true);
  assert.equal(added.isNew, true, 'it is still a new section, so the row still says so');
  assert.equal(toSavePayload(accepted).length, 4);
});

/* ==========================================================================
 * Approving an edit fills the editor — it does not publish
 * ======================================================================== */

test('approving a section suggestion merges the wording and marks it dirty', () => {
  const s = fixture();
  const base = orderOf(s);
  const out = applyProposal(s, s[0].uid, { headline: 'Warm welcome' }, PROPOSAL);

  assert.equal(out[0].fields.headline, 'Warm welcome');
  assert.equal(out[0].fields.subheadline, 'We build things.', 'untouched fields survive');
  assert.equal(out[0].dirty, true);
  assert.equal(out[0].proposalId, PROPOSAL);
  assert.equal(isDirty(out, base), true);
  // Nothing was published: the payload is the same three sections, changed.
  assert.equal(toSavePayload(out).length, 3);
  assert.equal(toSavePayload(out)[0].fields.headline, 'Warm welcome');
  // The original is untouched, so a failed save leaves the editor alone.
  assert.equal(s[0].fields.headline, 'Welcome');
});

test('a suggestion can never be approved onto a section built on the website', () => {
  const s = fixture();
  const out = applyProposal(s, s[1].uid, { headline: 'Mine now' }, PROPOSAL);
  assert.equal(out[1].fields, null);
  assert.equal(out[1].dirty, false);
  assert.equal(out[1].proposalId, undefined);
});

test('a page suggestion applies to several sections at once, by position', () => {
  const s = fixture();
  const out = applyPageProposal(s, [
    { index: 0, after: { headline: 'Warm welcome' } },
    { index: 1, after: { headline: 'Not allowed' } },   // the locked one
    { index: 2, after: { headline: 'Shall we?' } },
  ], PROPOSAL);

  assert.equal(out[0].fields.headline, 'Warm welcome');
  assert.equal(out[1].fields, null, 'the locked section is untouched');
  assert.equal(out[2].fields.headline, 'Shall we?');
  assert.deepEqual(proposalIdsOf(out), [PROPOSAL], 'one suggestion, stamped once');
});

test('only the suggestions a save actually carries are stamped', () => {
  const s = applyProposal(fixture(), fixture()[0].uid, { headline: 'x' }, PROPOSAL);
  // A suggested NEW section is not carried, so its id is not stamped applied.
  const withPending = insertProposedSection(s, section(0, 'new', 'faq', {}), 1, 'aaaaaaaa-0000-0000-0000-000000000000');
  const ids = proposalIdsOf(withPending);
  assert.equal(ids.includes('aaaaaaaa-0000-0000-0000-000000000000'), false);
});

test('an approved suggestion changes what the row says in the list', () => {
  const s = fixture();
  assert.equal(sectionSummary(s[0]), 'Welcome');
  const out = applyProposal(s, s[0].uid, { headline: 'Warm welcome' }, PROPOSAL);
  assert.equal(sectionSummary(out[0]), 'Warm welcome');
});

/* ==========================================================================
 * The words on the screen
 * ======================================================================== */

test('the cost is stated in credits, singular and plural, before anything is sent', () => {
  assert.equal(costLine(1), 'This uses 1 credit.');
  assert.equal(costLine(6), 'This uses 6 credits.');
  assert.equal(costLine(0), 'This one is included.');
  // A price we could not read is a price we do not quote — never a guess.
  assert.equal(costLine(null), null);
  assert.equal(costLine(undefined), null);
  assert.equal(costLine(Number.NaN), null);
});

const SRC = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const BUILDER_FILES = [
  'src/arion/components/AskArgus.tsx',
  'src/arion/components/SectionEditSheet.tsx',
  'src/arion/components/SectionPicker.tsx',
  'src/arion/pages/website/WebsitePages.tsx',
];

test('nothing on this surface names the vendor behind the model', () => {
  // reference_intelligence_layer_terminology: externally it is always
  // "Powered by ARGUS AI". A vendor name reaching a client's screen is a
  // release blocker, not a copy nit.
  for (const rel of BUILDER_FILES) {
    const src = SRC(rel);
    for (const banned of [/\bClaude\b/, /\bAnthropic\b/, /\bOpenAI\b/, /\bGPT-/, /\bhaiku\b/i, /\bsonnet\b/i]) {
      assert.equal(banned.test(src), false, `${rel} mentions ${banned}`);
    }
  }
});

test('nothing on this surface says "tenant" to a client', () => {
  // memory: feedback_no_tenant_in_ui — the client's word is "business".
  for (const rel of BUILDER_FILES) {
    const src = SRC(rel);
    const strings = src.match(/(?:'[^'\n]{8,}'|"[^"\n]{8,}"|>[^<>{}\n]{8,}<)/g) || [];
    for (const s of strings) {
      assert.equal(/\btenants?\b/i.test(s), false, `${rel}: ${s}`);
    }
  }
});

test('the panel says who is answering, in the words we use everywhere else', () => {
  const src = SRC('src/arion/components/AskArgus.tsx');
  assert.match(src, /Powered by ARGUS AI/);
  assert.match(src, /Ask ARGUS/);
  // And it says plainly what "Use this" does, because it is not Publish.
  assert.match(src, /Your website only changes when you Save/);
});

test('the credit price is read from the server, never written into the UI', () => {
  const src = SRC('src/arion/pages/website/WebsitePages.tsx');
  assert.match(src, /getSiteAiPricing/);
  assert.match(src, /pricing\?\.actions\?\.section\?\.credits/);
  assert.match(src, /pricing\?\.actions\?\.page\?\.credits/);
  // The defect this replaces: a hardcoded table in the old AI Builder page.
  assert.equal(/const\s+(SECTION_COSTS|CREDIT_COSTS|AI_COSTS)\b/.test(src), false);
});

/* ==========================================================================
 * Drafts and publishing
 * ======================================================================== */

test('drafts are their own list, and everything else is live', () => {
  const pages = [
    { pageId: 1, status: 'publish', title: 'Home' },
    { pageId: 2, status: 'draft', title: 'Autumn offer' },
    { pageId: 3, status: 'private', title: 'Internal' },
    { pageId: 4, status: 'pending', title: 'Waiting' },
    { pageId: 5, status: 'future', title: 'Scheduled' },
  ];
  const { drafts, live, deleted } = splitPages(pages);
  assert.deepEqual(drafts.map((p) => p.pageId), [2, 4]);
  assert.deepEqual(live.map((p) => p.pageId), [1, 3, 5]);
  assert.deepEqual(deleted, []);
  assert.equal(drafts.length + live.length, pages.length, 'no page falls between the two lists');
  assert.deepEqual(splitPages([]), { drafts: [], live: [], deleted: [] });
});

test('a deleted page is its own list, not a draft and not live', () => {
  // ARION pack 1: WordPress keeps a deleted page for 30 days, which is only
  // useful if a client can see it is there and put it back. Grouping it with the
  // drafts would put a page somebody deleted in among the work they are doing.
  const pages = [
    { pageId: 1, status: 'publish', title: 'Home' },
    { pageId: 2, status: 'draft', title: 'Autumn offer' },
    { pageId: 6, status: 'trash', title: 'Old offer' },
  ];
  const { drafts, live, deleted } = splitPages(pages);
  assert.deepEqual(deleted.map((p) => p.pageId), [6]);
  assert.deepEqual(drafts.map((p) => p.pageId), [2]);
  assert.deepEqual(live.map((p) => p.pageId), [1]);
  assert.equal(drafts.length + live.length + deleted.length, pages.length,
    'no page falls between the three lists');
});

test('publishing asks first, and unpublishing goes back to a draft', () => {
  const src = SRC('src/arion/pages/website/WebsitePages.tsx');
  // The confirm is a real dialog with the consequence spelled out, not a toast.
  assert.match(src, /Publish “\{detail\?\.title \|\| 'this page'\}”\?/);
  assert.match(src, /where anybody can see (it|them)/);
  assert.match(src, /Yes, publish it/);
  // Unpublish is a status flip back to draft, and says nothing is lost.
  assert.match(src, /Unpublish/);
  assert.match(src, /becomes a draft — nothing on it is lost/);
  // The live address is shown after a publish.
  assert.match(src, /setLiveUrl\(res\.data\.permalink\)/);
});

test('the publish confirm warns that pending suggestions will not go out', () => {
  const src = SRC('src/arion/pages/website/WebsitePages.tsx');
  assert.match(src, /waiting for you and will NOT be published/);
});

/* ==========================================================================
 * The picker's rule
 * ======================================================================== */

test('the picker offers a plain section and the curated layouts, and says how many', () => {
  const src = SRC('src/arion/components/SectionPicker.tsx');
  assert.match(src, /Just the plain one/);
  assert.match(src, /ready-made \{choices === 1 \? 'layout' : 'layouts'\}/);
  assert.match(src, /Every layout here can be edited from the Portal afterwards/);
  // A kind with no layouts adds straight away rather than opening an empty list.
  assert.match(src, /entry\.variants\.length > 0 \? setOpenKind\(entry\.kind\) : onAdd\(entry\.kind\)/);
});

test('an unavailable option is shown with its reason, never dropped', () => {
  const src = SRC('src/arion/components/SectionPicker.tsx');
  assert.match(src, /\{v\.unavailableReason\}/);
  assert.match(src, /\{entry\.available \? entry\.blurb : entry\.unavailableReason\}/);
});

/* ==========================================================================
 * The API client hits the routes arion-api actually serves
 * ======================================================================== */

test('the AI client calls the routes arion-api registers, and PROPOSES only', () => {
  const src = SRC('src/lib/arionApi.ts');
  assert.match(src, /\/pages\/\$\{p\.pageId\}`\s*\+\s*`\/sections\/\$\{encodeURIComponent\(p\.handle \|\| 'section'\)\}\/ai-edit`/);
  assert.match(src, /\/pages\/\$\{p\.pageId\}\/ai-edit`/);
  assert.match(src, /\/proposals\/\$\{encodeURIComponent\(p\.proposalId\)\}\/discard`/);
  assert.match(src, /\/ai-pricing`/);
  // There is no "apply" endpoint, on purpose: approving rides the save.
  assert.equal(/proposals\/[^`]*\/apply/.test(src), false);
  assert.match(src, /proposalIds: p\.proposalIds/);
});

test('a section built from a curated layout is asked for by blueprint id', () => {
  const src = SRC('src/lib/arionApi.ts');
  assert.match(src, /body: \{ kind: p\.kind, blueprintId: p\.blueprintId \}/);
});

test('a page-level diff can list the same field twice without colliding', () => {
  // Two sections both changing `headline` land in one flattened list. Keying
  // on the field name alone made React drop or duplicate a row, so the client
  // read a diff that was not the one they were approving. Found by clicking
  // through the real app; pinned here so it cannot come back.
  const src = SRC('src/arion/components/AskArgus.tsx');
  assert.match(src, /rows\.map\(\(r, i\) =>/);
  assert.match(src, /key=\{`\$\{i\}-\$\{r\.field\}`\}/);
  assert.equal(/key=\{r\.field\}/.test(src), false);
});

test('every control in the ARGUS panel is a 44px tap target', () => {
  // Measured at 375px during the click-through: Ask ARGUS was the only one
  // still at 40. On a phone that is the difference between a tap and a miss.
  const src = SRC('src/arion/components/AskArgus.tsx');
  assert.equal(/minHeight: 40/.test(src), false, 'a 40px control is left in the ARGUS panel');
  assert.equal((src.match(/minHeight: 44/g) || []).length >= 3, true);
});
