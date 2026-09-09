/**
 * Pre-walk pass 3b (2026-09-09) — the three Portal defects the walk found, each
 * with the assertion that would have caught it before Brandon opened the page.
 *
 *  1. EVERY STELLA PAGE WAS DEAD. StellaShell.tsx held the palette AND imported
 *     RecordTransactionModal, which imported the palette back out of it. A
 *     `const` inside an import cycle sits in its temporal dead zone until its
 *     own module body has run, so whichever STELLA route was reached first
 *     threw "Cannot access 'STELLA_LAVENDER' before initialization" — Overview,
 *     Chart of Accounts, Bills and Reports alike. STELLA pack 1 introduced the
 *     third member of the cycle (SplitEditor) on 2026-09-08 and two packs
 *     shipped on top of it without anyone opening a STELLA page.
 *
 *  2. ARION → WEBSITE → SETTINGS HAD NO DOOR. Pack 2 put the website chat
 *     bubble and the "Book now" button on that page and every one of its walk
 *     rows begins "Website → Settings" — and the entry was not in the sub-nav.
 *
 *  3. A VENDOR'S NAME ON A CLIENT'S SCREEN. Brand & layout printed
 *     "Set through your website's design (Hello Elementor)" — on the one page
 *     the pack exists to make vendor-free.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// SubNav.tsx and ServiceRouter.tsx carry `/*` inside strings and JSX, so the
// block-comment regex above eats two thirds of them. These two files only need
// their `//` lines gone, and losing real code to an over-eager strip is how a
// source-level assertion quietly stops asserting anything.
const stripLineComments = (src) => src.replace(/^\s*\/\/.*$/gm, '');

/* ── 1. The STELLA import cycle ─────────────────────────────────────────── */

// The palette lives in a LEAF module. "Leaf" is the whole point: a module that
// imports nothing of its own cannot be half-initialised by a cycle.
test('the STELLA palette lives in a module that imports nothing', () => {
  const theme = read('pages/stella/stellaTheme.ts');
  assert.match(theme, /export const STELLA_INDIGO/);
  assert.match(theme, /export const STELLA_LAVENDER/);
  assert.match(theme, /export function fmtMoney/);
  assert.equal(
    (stripComments(theme).match(/^\s*import\s/gm) || []).length, 0,
    'stellaTheme.ts must import nothing — a leaf cannot be in a cycle',
  );
});

// The two modules StellaShell pulls in must not reach back into it for a value.
// A type-only import would be erased and would be harmless; a value import is
// what puts a const in the dead zone.
for (const file of ['pages/stella/RecordTransactionModal.tsx', 'pages/stella/SplitEditor.tsx']) {
  test(`${path.basename(file)} takes the palette from the leaf, not from StellaShell`, () => {
    const src = stripComments(read(file));
    assert.match(src, /from ["']\.\/stellaTheme["']/);
    const back = src.match(/^\s*import\s+(?!type\s)\{[^}]*\}\s*from\s*["']\.\/StellaShell["']/m);
    assert.equal(back, null,
      `${file} still imports a value from StellaShell — that re-opens the cycle that killed every STELLA page`);
  });
}

// Belt and braces: walk the graph out of StellaShell and assert nothing comes
// back to it. This is the assertion that generalises — it fails on the NEXT
// module somebody adds to the cycle, not only on the two we know about.
test('nothing StellaShell imports imports a value back out of StellaShell', () => {
  const seen = new Set();
  const offenders = [];
  const localImports = (file) => {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const out = [];
    const re = /^\s*import\s+(type\s+)?([^;]*?)from\s*["'](\.[^"']+)["']/gm;
    let m;
    while ((m = re.exec(src))) {
      const typeOnly = !!m[1] || /^\s*\{\s*type\s/.test(m[2]);
      out.push({ spec: m[3], typeOnly });
    }
    return out;
  };
  const resolve = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (fs.existsSync(base + ext)) return base + ext;
    }
    return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null;
  };

  const shell = path.join(SRC, 'pages/stella/StellaShell.tsx');
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { spec, typeOnly } of localImports(file)) {
      if (typeOnly) continue;
      const target = resolve(file, spec);
      if (!target) continue;
      if (target === shell) { offenders.push(path.relative(SRC, file)); continue; }
      walk(target);
    }
  };
  for (const { spec, typeOnly } of localImports(shell)) {
    if (typeOnly) continue;
    const target = resolve(shell, spec);
    if (target) walk(target);
  }
  assert.deepEqual(offenders, [],
    `these modules close a cycle back onto StellaShell: ${offenders.join(', ')}`);
});

/* ── 2. The Settings page has a way in ──────────────────────────────────── */

test('ARION → Website → Settings is in the sub-nav', () => {
  const nav = stripLineComments(read('components/SubNav.tsx'));
  assert.match(nav, /key:\s*"arion_website_settings"/,
    'the page pack 2 put the chat bubble and the Book now button on has no menu entry');
  // It has to sit in the Website group — the rows read "Website → Settings".
  const website = nav.slice(nav.indexOf('sectionId: "website"'));
  const groupEnd = website.indexOf('sectionId: "hosting"');
  assert.ok(
    website.slice(0, groupEnd > 0 ? groupEnd : undefined).includes('arion_website_settings'),
    'Settings must be in the Website group, not somewhere else in the menu',
  );
});

test('every ARION sub-nav route has a page behind it', () => {
  const nav = stripLineComments(read('components/SubNav.tsx'));
  const router = stripLineComments(read('pages/ServiceRouter.tsx'));
  const keys = [...nav.matchAll(/key:\s*"(arion_[a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20, 'expected the ARION menu to have been read');
  const missing = keys.filter((k) => !router.includes(`case '${k}'`) && !router.includes(`case "${k}"`));
  assert.deepEqual(missing, [], `menu entries with no page: ${missing.join(', ')}`);
});

/* ── 3. No vendor's name on the client's screen ─────────────────────────── */

test('Brand & layout does not print the theme vendor name', () => {
  const src = stripComments(read('arion/pages/website/WebsiteDesign.tsx'));
  assert.doesNotMatch(src, /\$\{chrome\.theme\}/,
    'the theme vendor name was being interpolated into the header card subtitle');
  assert.doesNotMatch(src, /Hello Elementor/);
});

test('no vendor brand names in the pack 2 screens a client reads', () => {
  const files = [
    'arion/pages/website/WebsiteMenus.tsx',
    'arion/pages/website/WebsiteDesign.tsx',
    'arion/pages/website/WebsiteSettings.tsx',
  ];
  // The rendered strings only: comments explain WHY the vendor is not named and
  // must be allowed to say the name.
  const banned = /\b(WordPress|Elementor|Hello Elementor|Rank Math|Hostinger|Wordfence)\b/;
  for (const f of files) {
    const src = stripComments(read(f));
    const hit = src.split('\n').find((line) => banned.test(line));
    assert.equal(hit, undefined, `${f} names a vendor on screen: ${hit}`);
  }
});
