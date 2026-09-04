/**
 * Site builder Phase 2, Portal side — pictures, the booking chip, the
 * read-only recipient, tap targets and the words a client reads.
 *
 * Two kinds of assertion here, and both matter:
 *   - state transforms (a picture's url, id and description move TOGETHER, or
 *     the widget ends up pointing at a new picture with an old id);
 *   - source-level rules that a browser test could not see cheaply — every
 *     tap target is 44px, the sheets size themselves in dvh, and nothing in
 *     the builder UI says "tenant" or names a model vendor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  toEditorSections, toSavePayload, isDirty, orderOf,
  setSectionFields, setListItemFields, setSectionField,
} from '../src/arion/utils/sectionListState.ts';
import { isHiddenSpec, TAP } from '../src/arion/components/SectionFieldInputs.tsx';

const ROOT = path.resolve('src/arion');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Comments explain the machinery and may name it; strings on screen may not. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const BUILDER_UI = [
  'pages/website/WebsitePages.tsx',
  'components/SectionEditSheet.tsx',
  'components/SectionFieldInputs.tsx',
  'components/SectionPicker.tsx',
  'components/MediaPicker.tsx',
  'components/AskArgus.tsx',
  'utils/siteBuilderCopy.ts',
];

const node = (id, kind = 'hero') => ({
  id, elType: 'section', settings: { _title: `ia:${kind}:scratch:${id}` }, elements: [],
});

function fixture() {
  return toEditorSections([
    {
      index: 0, handle: 'ia:about:scratch:a', kind: 'about', blueprintId: 'scratch', blockId: 'a',
      editable: true, reason: null, label: 'About the business',
      fields: { headline: 'About us', image_url: '', image_id: '', image_alt: '' },
      node: node('a', 'about'),
    },
    {
      index: 1, handle: 'ia:gallery:scratch:b', kind: 'gallery', blueprintId: 'scratch', blockId: 'b',
      editable: true, reason: null, label: 'Picture gallery',
      fields: { headline: 'Our work', images: [{ url: '', id: '', alt: '', caption: '', category: '' }] },
      node: node('b', 'gallery'),
    },
    {
      index: 2, handle: 'Awards strip', kind: null, blueprintId: null, blockId: null,
      editable: false, reason: 'custom', label: 'Custom section — built on the site',
      fields: null, node: node('c'),
    },
  ]);
}

/* ==========================================================================
 * A picture is three values that move together
 * ======================================================================== */

test('choosing a picture writes its address, its id and its description at once', () => {
  const s = fixture();
  const next = setSectionFields(s, s[0].uid, {
    image_url: 'https://site.invalid/room.jpg',
    image_id: 77,
    image_alt: 'A cedar-clad garden room',
  });

  assert.equal(next[0].fields.image_url, 'https://site.invalid/room.jpg');
  assert.equal(next[0].fields.image_id, 77);
  assert.equal(next[0].fields.image_alt, 'A cedar-clad garden room');
  assert.equal(next[0].dirty, true);
  // Untouched, so a cancelled pick leaves the editor exactly as it was.
  assert.equal(s[0].fields.image_url, '');
});

test('removing a picture takes its id with it — a stale id renders the wrong srcset', () => {
  const s = setSectionFields(fixture(), fixture()[0].uid, {});
  const withPic = setSectionFields(s, s[0].uid, { image_url: 'https://x/1.jpg', image_id: 5 });
  const cleared = setSectionFields(withPic, withPic[0].uid, { image_url: '', image_id: '' });
  assert.equal(cleared[0].fields.image_url, '');
  assert.equal(cleared[0].fields.image_id, '');
});

test('a gallery row keeps its own id and description', () => {
  const s = fixture();
  const next = setListItemFields(s, s[1].uid, 'images', 0, {
    url: 'https://site.invalid/1.jpg', id: 11, alt: 'The workshop floor',
  });
  assert.deepEqual(next[1].fields.images[0], {
    url: 'https://site.invalid/1.jpg', id: 11, alt: 'The workshop floor', caption: '', category: '',
  });
  assert.equal(next[1].dirty, true);
  assert.equal(s[1].fields.images[0].url, '', 'the original row is untouched');
});

test('a row index that is not there changes nothing rather than crashing', () => {
  const s = fixture();
  for (const bad of [9, -1]) {
    const next = setListItemFields(s, s[1].uid, 'images', bad, { url: 'x' });
    assert.deepEqual(next.map((x) => x.fields), s.map((x) => x.fields));
    assert.equal(next.some((x) => x.dirty), false, 'and does not light up "unsaved changes"');
  }
});

test('a custom section stays untouchable through the multi-field setter too', () => {
  const s = fixture();
  const next = setSectionFields(s, s[2].uid, { image_url: 'https://x/1.jpg', image_id: 9 });
  assert.equal(next[2].fields, null);
  assert.equal(next[2].dirty, false);
  assert.equal(isDirty(next, orderOf(s)), false);
});

test('a picture edit reaches the save payload with its id attached', () => {
  const s = fixture();
  const next = setSectionFields(s, s[0].uid, { image_url: 'https://x/1.jpg', image_id: 3, image_alt: 'A room' });
  const payload = toSavePayload(next);
  assert.equal(payload[0].fields.image_id, 3);
  assert.equal(payload[2].fields, null, 'the custom section still sends no fields');
});

/* ==========================================================================
 * Hidden fields
 * ======================================================================== */

test('an attachment-id field is never rendered', () => {
  assert.equal(isHiddenSpec({ key: 'image_id', label: 'Picture reference', type: 'hidden' }), true);
  assert.equal(isHiddenSpec({ key: 'headline', label: 'Headline', type: 'text' }), false);
});

test('the edit sheet filters hidden fields out before it renders anything', () => {
  const src = read('components/SectionEditSheet.tsx');
  assert.match(src, /filter\(\(f\) => !isHiddenSpec\(f\)\)/,
    'the sheet must drop hidden specs, or an attachment id appears as a text box');
});

test('a list row filters them out too', () => {
  const src = read('components/SectionFieldInputs.tsx');
  assert.match(src, /\.filter\(\(sub\) => !isHiddenSpec\(sub\)\)/);
});

/* ==========================================================================
 * The booking chip and the read-only recipient
 * ======================================================================== */

test('the booking chip only exists when the business HAS a booking page', () => {
  const src = read('components/SectionFieldInputs.tsx');
  // The condition is spec.offersBooking AND a non-empty href — a chip that
  // sets an empty link would be worse than no chip.
  assert.match(src, /spec\.offersBooking && !!ctx\.bookingHref/);
  assert.match(src, /Link to your booking page/);
});

test('the booking chip sets the link the server sent, not one the UI made up', () => {
  const src = read('components/SectionFieldInputs.tsx');
  assert.match(src, /onChange\(ctx\.bookingHref\)/);
  assert.doesNotMatch(src, /book\.ia-dm\.com/, 'the booking host is never hardcoded in the UI');
});

test('the recipient is rendered read-only and says where it comes from', () => {
  const src = read('components/SectionFieldInputs.tsx');
  assert.match(src, /if \(spec\.readOnly\)/);
  assert.match(src, /readOnly\s*$/m, 'the input itself must carry readOnly');
  assert.match(src, /Settings → Your business/);
});

test('a form with no recipient says so where the client is looking', () => {
  const src = read('components/SectionFieldInputs.tsx');
  assert.match(src, /nowhere\s*\n?\s*.*to send enquiries|nowhere '\s*\n?\s*\+ 'to send enquiries|nowhere/);
});

/* ==========================================================================
 * Unsaved work
 * ======================================================================== */

test('leaving the editor with unsaved changes asks first — both ways out', () => {
  // Assert the LISTENER, not the word: the first mention of `beforeunload` in
  // this file is a comment, and a test that matches a comment is a test that
  // keeps passing after the code it describes is deleted.
  const src = stripComments(read('pages/website/WebsitePages.tsx'));
  assert.match(src, /window\.addEventListener\('beforeunload', warn\)/,
    'closing the tab, reloading, or following a link out');
  assert.match(src, /window\.removeEventListener\('beforeunload', warn\)/,
    'and it comes off again, or every later page warns for no reason');
  assert.match(src, /const leave = useCallback/, '"Back to pages" never leaves the page');
  assert.match(src, /onClick=\{leave\}/);
  assert.match(src, /Leave the page and lose them\?/);
});

/* ==========================================================================
 * The phone
 * ======================================================================== */

test('every tap target in the builder is at least 44px', () => {
  assert.equal(TAP, 44);
  const offenders = [];
  for (const file of BUILDER_UI) {
    const src = read(file);
    for (const m of src.matchAll(/minHeight:\s*(\d+)/g)) {
      const px = Number(m[1]);
      // 44 is the floor for anything pressable. Bigger is fine (a textarea is
      // 72 or 96); smaller is the defect the 1B walk found.
      if (px < 44) offenders.push(`${file}: minHeight ${px}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the sheets size themselves against the LIVE viewport, not vh', () => {
  // iOS reports `vh` with the keyboard closed, so a sheet sized in vh hides
  // its own Save bar the moment somebody types into it.
  const css = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
  assert.match(css, /\.ia-sheet \{ max-height: 92vh; \}/, 'the fallback for old browsers');
  assert.match(css, /@supports \(height: 100dvh\)/);
  for (const file of ['components/SectionEditSheet.tsx', 'components/SectionPicker.tsx', 'components/MediaPicker.tsx']) {
    const src = read(file);
    assert.match(src, /className="ia-sheet"/, `${file} must use the shared sheet sizing`);
    assert.doesNotMatch(src, /maxHeight: '92vh'/, `${file} must not hardcode vh any more`);
  }
});

test('every sticky bar clears the floating ARGUS button and the home indicator', () => {
  const css = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
  assert.match(css, /\.ia-sticky-bar \{[\s\S]*?padding: 10px 76px 10px 12px;/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  for (const file of ['pages/website/WebsitePages.tsx', 'components/SectionEditSheet.tsx', 'components/MediaPicker.tsx']) {
    assert.match(read(file), /className="ia-sticky-bar/, `${file} needs the shared sticky bar`);
  }
});

test('no inline padding on a sticky bar — it would silently beat the class', () => {
  // This is the defect the 375px walk found, not a hypothetical. An inline
  // `padding` shorthand beats a stylesheet `padding-right: 76px`, and the bar
  // went straight back under the floating ARGUS button with every source-level
  // assertion still green. So the assertion is now on the ABSENCE of the
  // inline property, which is the thing that can actually go wrong.
  for (const file of ['pages/website/WebsitePages.tsx', 'components/SectionEditSheet.tsx', 'components/MediaPicker.tsx']) {
    const src = read(file);
    const re = /className="ia-sticky-bar[^"]*"\s+style=\{\{([\s\S]{0,400}?)\}\}/g;
    let m; let checked = 0;
    while ((m = re.exec(src))) {
      checked++;
      assert.doesNotMatch(m[1], /\bpadding\s*:/, `${file}: an inline padding on a sticky bar`);
      assert.doesNotMatch(m[1], /paddingRight\s*:/, `${file}: an inline paddingRight on a sticky bar`);
    }
    assert.ok(checked > 0, `${file}: no sticky bar found to check`);
  }
});

test('the drag handle is hidden where dragging cannot work', () => {
  // HTML5 drag-and-drop does not fire on touch at all. The ↑ ↓ buttons are
  // the reorder there, and they are never disabled by the same rule.
  const css = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
  assert.match(css, /@media \(pointer: coarse\)[\s\S]{0,120}\.ia-drag-handle \{ display: none; \}/);
  const src = read('pages/website/WebsitePages.tsx');
  assert.match(src, /className="ia-drag-handle"/);
  assert.match(src, /aria-label=\{`Move \$\{s\.label\} up`\}/);
  assert.match(src, /aria-label=\{`Move \$\{s\.label\} down`\}/);
});

test('no inline display on the drag handle — same trap, same rule', () => {
  const src = read('pages/website/WebsitePages.tsx');
  const m = /className="ia-drag-handle"[\s\S]{0,600}?style=\{\{([\s\S]{0,300}?)\}\}/.exec(src);
  assert.ok(m, 'the drag handle must still carry the class');
  assert.doesNotMatch(m[1], /display\s*:/, 'an inline display would beat `display: none` on touch');
});

test('every text input is 16px, so a phone does not zoom when it is focused', () => {
  const src = read('components/SectionFieldInputs.tsx');
  assert.match(src, /fontSize: 16/);
  assert.doesNotMatch(src, /fontSize: 1[0-5],\s*\n\s*lineHeight/);
  const picker = read('components/MediaPicker.tsx');
  assert.match(picker, /fontSize: 16/);
});

/* ==========================================================================
 * The words
 * ======================================================================== */

test('nothing in the builder UI says "tenant" — the client\'s word is "business"', () => {
  const offenders = [];
  for (const file of BUILDER_UI) {
    if (/tenant/i.test(read(file).replace(/tenantId|activeTenantId/g, ''))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `feedback_no_tenant_in_ui: ${offenders.join(', ')}`);
});

test('no vendor is named anywhere a client can read — it is always ARGUS AI', () => {
  const vendors = /\b(anthropic|claude|openai|gpt-?[0-9]|gemini|copilot|elementor)\b/i;
  const offenders = [];
  for (const file of BUILDER_UI) {
    const src = read(file);
    // Comments explain the machinery and may name it; strings the client
    // reads may not. Strip line comments and block comments first.
    const visible = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const hit = vendors.exec(visible);
    if (hit) offenders.push(`${file}: ${hit[0]}`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the picture picker explains what a picture kept elsewhere costs you', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /loads at one size on every screen/);
  assert.match(src, /right size for each screen/);
  // The machinery may be named in a comment; the words on screen may not.
  assert.doesNotMatch(stripComments(src), /srcset/i, 'no jargon in a string a client reads');
});

test('the description field explains WHY, not what an alt attribute is', () => {
  const src = read('components/MediaPicker.tsx');
  assert.match(src, /screen reader/);
  assert.doesNotMatch(src, />alt text</i);
});

/* ==========================================================================
 * Tier — the editor is on every plan (W-4)
 * ======================================================================== */

test('nothing in the editor is gated on a plan except the ARGUS box', () => {
  const src = stripComments(read('pages/website/WebsitePages.tsx'));
  // `aiLocked` is the ONE plan gate in this file, and it only ever reaches
  // an AskArgusBox. If the editor starts branching on tier for anything else,
  // it has started charging for something decision W-4 says is free.
  assert.equal(/tier/i.test(src), false, 'the editor must not branch on tier at all');
  assert.match(src, /lockedReason: aiLocked/);
  assert.equal((src.match(/aiLocked/g) || []).length, 3,
    'aiLocked is declared once and read once per ARGUS box (page + section) — nowhere else');
});

test('the AI box states what a Lite client can still do, rather than just refusing', () => {
  const src = read('components/AskArgus.tsx');
  assert.match(src, /lockedReason/);
  // The sentence itself comes from the server (aiEdit.js LITE_UPSELL) so the
  // UI never invents an upsell; this asserts it is RENDERED, not hardcoded.
  assert.doesNotMatch(src, /ARION Standard and above/);
});

test('the editor never quotes a price for anything that is free', () => {
  const src = stripComments(read('pages/website/WebsitePages.tsx'));
  // Credits appear only as the ARGUS box's own price, read from the server.
  // Add a section, Preview, Save, Publish and Undo cost nothing, and the
  // moment one of them mentions a credit this fails.
  const mentions = [...src.matchAll(/credit/gi)];
  assert.ok(mentions.length > 0, 'the ARGUS box does still quote its price');
  for (const m of mentions) {
    const around = src.slice(Math.max(0, m.index - 120), m.index + 60);
    assert.match(around, /pricing\?\.actions/,
      `a credit is quoted away from the server's own price: …${around.slice(-100)}`);
  }
});
