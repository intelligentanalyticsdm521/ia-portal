/**
 * The section-list editor's state, without a browser.
 *
 * Reordering, editing and adding are plain data transforms. If they mutate in
 * place, React shows a stale list and "unsaved changes" lies; if the dirty
 * check is wrong, Save is greyed out over real edits. Both are the kind of
 * thing that only shows up in front of Brandon, so they get pinned here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toEditorSections, toSavePayload, isDirty, orderOf, moveSection,
  setSectionField, setListItemField, addListItem, removeListItem,
  setParagraph, addParagraph, removeParagraph,
  removeSection, appendSection, sectionSummary,
} from '../src/arion/utils/sectionListState.ts';

const node = (id) => ({ id, elType: 'section', settings: { _title: `ia:hero:scratch:${id}` }, elements: [] });

function fixture() {
  return toEditorSections([
    { index: 0, handle: 'ia:hero:scratch:a', kind: 'hero', blueprintId: 'scratch', blockId: 'a',
      editable: true, reason: null, label: 'Hero banner',
      fields: { headline: 'Welcome', cta_href: '#contact' }, node: node('a') },
    { index: 1, handle: 'Awards strip', kind: null, blueprintId: null, blockId: null,
      editable: false, reason: 'custom', label: 'Custom section — built on the site',
      fields: null, node: node('b') },
    { index: 2, handle: 'ia:services:scratch:c', kind: 'services', blueprintId: 'scratch', blockId: 'c',
      editable: true, reason: null, label: 'What you do',
      fields: { headline: 'What we do', services: [{ title: 'Offices', description: 'Warm' }] }, node: node('c') },
  ]);
}

test('a freshly loaded page has nothing to save', () => {
  const s = fixture();
  assert.equal(isDirty(s, orderOf(s)), false);
  assert.equal(s.every((x) => x.dirty === false), true);
});

test('moving a section changes the order and marks the page dirty', () => {
  const s = fixture();
  const base = orderOf(s);
  const moved = moveSection(s, 2, 0);

  assert.deepEqual(moved.map((x) => x.uid), [base[2], base[0], base[1]]);
  assert.deepEqual(moved.map((x) => x.index), [0, 1, 2], 'index follows the new position');
  assert.equal(isDirty(moved, base), true);
  // The original array is untouched, so a cancelled drag leaves state alone.
  assert.deepEqual(orderOf(s), base);
});

test('a move off either end does nothing rather than throwing', () => {
  const s = fixture();
  assert.equal(moveSection(s, 0, -1), s);
  assert.equal(moveSection(s, 2, 3), s);
  assert.equal(moveSection(s, 1, 1), s);
  assert.equal(moveSection(s, 9, 0), s);
});

test('editing a field marks only that section dirty and does not mutate the old one', () => {
  const s = fixture();
  const next = setSectionField(s, s[0].uid, 'headline', 'Garden rooms');

  assert.equal(next[0].fields.headline, 'Garden rooms');
  assert.equal(next[0].dirty, true);
  assert.equal(next[2].dirty, false);
  assert.equal(s[0].fields.headline, 'Welcome', 'the previous state is untouched');
  assert.equal(isDirty(next, orderOf(s)), true);
});

test('a custom section cannot be edited even if something tries', () => {
  const s = fixture();
  const next = setSectionField(s, s[1].uid, 'headline', 'Sneaky');
  assert.equal(next[1].fields, null);
  assert.equal(next[1].dirty, false);
  assert.equal(isDirty(next, orderOf(s)), false);
});

test('list rows can be edited, added and removed', () => {
  const s = fixture();
  const uid = s[2].uid;

  const edited = setListItemField(s, uid, 'services', 0, 'title', 'Garden offices');
  assert.equal(edited[2].fields.services[0].title, 'Garden offices');
  assert.equal(edited[2].fields.services[0].description, 'Warm', 'the other keys survive');
  assert.equal(s[2].fields.services[0].title, 'Offices', 'no mutation');

  const added = addListItem(edited, uid, 'services', { title: '', description: '' });
  assert.equal(added[2].fields.services.length, 2);

  const removed = removeListItem(added, uid, 'services', 0);
  assert.equal(removed[2].fields.services.length, 1);
  assert.equal(removed[2].fields.services[0].title, '');
});

test('removing a row that is not there leaves the list alone', () => {
  const s = fixture();
  const out = removeListItem(s, s[2].uid, 'services', 7);
  assert.equal(out[2].fields.services.length, 1);
});

test('paragraphs behave like a plain list of strings', () => {
  let s = toEditorSections([{
    index: 0, handle: 'ia:about:scratch:a', kind: 'about', blueprintId: 'scratch', blockId: 'a',
    editable: true, reason: null, label: 'About the business',
    fields: { headline: 'About', story_paragraphs: ['One.', 'Two.'] }, node: node('a'),
  }]);
  const uid = s[0].uid;

  s = setParagraph(s, uid, 'story_paragraphs', 1, 'Two, rewritten.');
  assert.deepEqual(s[0].fields.story_paragraphs, ['One.', 'Two, rewritten.']);

  s = addParagraph(s, uid, 'story_paragraphs');
  assert.equal(s[0].fields.story_paragraphs.length, 3);
  assert.equal(s[0].fields.story_paragraphs[2], '');

  s = removeParagraph(s, uid, 'story_paragraphs', 0);
  assert.deepEqual(s[0].fields.story_paragraphs, ['Two, rewritten.', '']);
});

test('removing a section renumbers what is left and counts as a change', () => {
  const s = fixture();
  const base = orderOf(s);
  const next = removeSection(s, s[1].uid);
  assert.equal(next.length, 2);
  assert.deepEqual(next.map((x) => x.index), [0, 1]);
  assert.equal(isDirty(next, base), true);
});

test('an added section lands at the end, marked new and dirty', () => {
  const s = fixture();
  const next = appendSection(s, {
    index: 0, handle: 'ia:faq:scratch:z', kind: 'faq', blueprintId: 'scratch', blockId: 'z',
    editable: true, reason: null, label: 'Questions and answers',
    fields: { headline: 'Questions', faqs: [] }, node: node('z'),
  });
  assert.equal(next.length, 4);
  assert.equal(next[3].label, 'Questions and answers');
  assert.equal(next[3].isNew, true);
  assert.equal(next[3].index, 3);
  assert.equal(isDirty(next, orderOf(s)), true);
});

test('the save payload sends every section in order, with no fields for a custom one', () => {
  const s = moveSection(setSectionField(fixture(), fixture()[0].uid, 'headline', 'x'), 0, 2);
  const payload = toSavePayload(s);
  assert.equal(payload.length, 3);
  assert.equal(payload.every((p) => p.node && p.node.elType === 'section'), true);
  const custom = payload.find((p) => p.node.settings._title === 'ia:hero:scratch:b');
  assert.ok(custom === undefined || custom.fields === null);
  // The custom section's node goes back exactly as it arrived.
  const byId = Object.fromEntries(payload.map((p) => [p.node.id, p]));
  assert.equal(byId.b.fields, null);
  assert.deepEqual(byId.b.node, node('b'));
});

test('the row summary reads as words, never as a handle or JSON', () => {
  const s = fixture();
  assert.equal(sectionSummary(s[0]), 'Welcome');
  assert.equal(sectionSummary(s[1]), 'Built on the website itself');
  const blank = setSectionField(s, s[0].uid, 'headline', '   ');
  assert.equal(sectionSummary(blank[0]), 'No headline yet');
});

test('every section keeps a distinct key across a reorder — React drops rows otherwise', () => {
  const s = moveSection(moveSection(fixture(), 0, 2), 1, 0);
  assert.equal(new Set(orderOf(s)).size, 3);
});
