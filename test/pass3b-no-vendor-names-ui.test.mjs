/**
 * Pass 3b, row A2-49 — the two ARION screens that still named a vendor.
 *
 * `arion-pack2-ui.test.mjs` already holds this rule for the three screens that
 * pack rewrote. Walking the merged line found two more, and one of them was
 * contradicting itself on the same card: ContentSeoOverview showed the correct
 * sentence — "it is part of what we look after, so there is nothing for you to
 * install; tell us and we will put it on" — directly BELOW a paragraph telling
 * the client to go and check that a named plugin was active on their named
 * website software. The client was given both, and only one of them is true of
 * how we work.
 *
 * WHAT COUNTS AS A VENDOR NAME. Somebody else's product, which the client did
 * not choose, cannot change, and is not being asked to touch. "Plugin",
 * "theme", "core" and "update" are not vendor names — they are what the things
 * ARE — and the IA Plugin keeps its name because it is ours.
 *
 * WHY A SOURCE SCAN. The strings are static JSX, so rendering the pages to
 * check their words would cost a DOM, an ARION context and three fetch mocks
 * to assert something the file itself can answer. The comment stripper is the
 * same one pack 2 uses: a name is allowed to stay in a code comment, where a
 * maintainer needs it and a client never looks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/arion');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const VENDORS = ['WordPress', 'Elementor', 'wp-admin', 'WP Admin', 'Astra', 'Rank Math', 'RankMath', 'Yoast'];

const SCREENS = [
  'pages/website/ContentSeoOverview.tsx',
  'pages/website/WebsiteUpdates.tsx',
];

test('no vendor name on the Content SEO or the updates screen', () => {
  for (const file of SCREENS) {
    const body = stripComments(read(file));
    for (const word of VENDORS) {
      assert.equal(body.includes(word), false, `${file} says "${word}" on a client's screen`);
    }
    assert.equal(body.includes('tenant'), false, `${file} says "tenant"`);
  }
});

test('the words that replaced them are actually there', () => {
  // Absence alone would pass on an empty file. These are the sentences the
  // client is meant to read instead.
  const seo = stripComments(read('pages/website/ContentSeoOverview.tsx'));
  assert.match(seo, /search settings on your own website/,
    'the "not connected" card explains what Content SEO reads');
  assert.match(seo, /part of what we look after/,
    'and that switching it on is our job, not theirs');
  assert.match(seo, /reading-ease score below 40/, 'the readability flag still says what it means');

  const upd = stripComments(read('pages/website/WebsiteUpdates.tsx'));
  assert.match(upd, /Core website software/, 'the core row is still named on the screen');
  assert.match(upd, /core software can take 1-2 minutes/,
    'the confirm still warns how long it takes');
  assert.match(upd, /let your website apply routine security/,
    'auto-update still explains what it turns on');
});
