// test/app-links-and-qr.test.mjs — Q-APPS-PWA, the Portal half.
//
// The three client-facing apps moved the business from the HOST into the PATH:
//
//     summit-lawn.customer.ia-dm.com   →   customer.ia-dm.com/summit-lawn/
//
// The Portal is where a business owner reads those addresses and hands them
// out, so three things have to be true here and are easy to get silently wrong:
//
//   1. The URL the Portal PRINTS is the path form. Showing the old subdomain
//      would send every new QR code, invoice footer and van sticker to an
//      address that only survives as a redirect.
//   2. The QR code is OURS. An <img> pointed at a public QR service would put a
//      third party in the path of a client's branding and hand them a list of
//      which of our clients exist (feedback_no_third_party_product_surface).
//   3. The install instructions are two different sentences, because Android
//      and iPhone are two different mechanisms and "one tap" is false on one of
//      them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const CARD = ['src', 'components', 'oliver', 'AppLinksCard.tsx'];
const HUB = ['src', 'pages', 'oliver', 'OliverPortalsHubPage.tsx'];

test('the Portal prints the PATH form of every app address', () => {
  const hub = read(...HUB);
  assert.match(
    hub,
    /return `https:\/\/\$\{kind === "customer" \? DEFAULT_CUSTOMER_HOST : DEFAULT_CREW_HOST\}\/\$\{slug\}\/`;/,
    'the hub still builds {slug}.customer.ia-dm.com — every new sticker would point at a redirect'
  );
  const card = read(...CARD);
  assert.match(card, /return `https:\/\/\$\{host\}\/\$\{slug\}\/`;/);
  // The trailing slash matters: it is the manifest's start_url, and a scanned
  // code that lands one redirect away from the install scope installs nothing.
  assert.match(card, /Trailing slash on purpose/);
});

test('all three apps are offered, on their permanent hosts', () => {
  const card = read(...CARD);
  for (const host of ['customer.ia-dm.com', 'crew.ia-dm.com', 'book.ia-dm.com']) {
    assert.ok(card.includes(host), `${host} is missing`);
  }
  for (const kind of ['"customer"', '"crew"', '"booking"']) {
    assert.ok(card.includes(kind), `${kind} is missing`);
  }
});

test('the QR code comes from our own API, never a third-party image host', () => {
  const card = read(...CARD);
  assert.match(card, /\/public\/portal\/\$\{encodeURIComponent\(slug\)\}\/qr/);
  assert.match(card, /\$\{qrBase\}\.png\?app=\$\{kind\}&size=256/, 'the code on the card is our own PNG');

  // Any absolute http(s) URL in this file that is not ours would be the bug.
  const withoutComments = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const urls = withoutComments.match(/https?:\/\/[^\s"'`)]+/g) || [];
  for (const u of urls) {
    assert.ok(
      /ia-dm\.com|azurewebsites\.net|\$\{/.test(u),
      `${u} is a third-party URL in a client-branded surface`
    );
  }
});

test('one Share button per app: the phone’s share sheet when there is one, else Email / Text / Copy (30 Sep 2026)', () => {
  // Brandon: "the download buttons don't do anything. I'd probably just change that to a share
  // button and then they can text it if on a mobile or email it" — the PNG / SVG downloads are gone.
  const card = read(...CARD);
  assert.doesNotMatch(card, /download=\{/, 'no download links are left on the card');
  assert.match(card, /<ShareButton url=\{url\} name=\{meta\.name\} \/>/);
  assert.match(card, /typeof navigator\.share === "function"/);
  assert.match(card, /navigator\.share\(\{ title: name, text: name, url \}\)/);
  assert.match(card, /href=\{`mailto:\?subject=/);
  assert.match(card, /href=\{`sms:\?&body=/);
  assert.match(card, /Copy the link/);
  // On a dev machine Open goes to the dev ports; in production to the three permanent hosts.
  assert.match(card, /const DEV_PORTS: Record<AppKind, number> = \{ customer: 5175, crew: 5176, booking: 5407 \}/);
  assert.match(card, /if \(onDevMachine\(\)\) return `http:\/\/localhost:\$\{DEV_PORTS\[kind\]\}\/\$\{slug\}\/`;/);
});

test('the install instructions are two different sentences, and neither says "one tap"', () => {
  const card = read(...CARD).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(card, /iPhone \/ iPad/);
  assert.match(card, /Android/);
  assert.match(card, /Add to Home Screen/, 'the iPhone route is Share → Add to Home Screen and nothing else');
  assert.match(card, /Safari has no install button/);
  assert.match(card, /does not work in Chrome on an iPhone/,
    'Chrome on iOS cannot add to the Home Screen at all — a business owner needs to know that');
  assert.ok(!/one tap/i.test(card));
});

test('a business with no short name yet is told what to do, not shown a broken QR', () => {
  const card = read(...CARD);
  assert.match(card, /if \(!clean\) \{/);
  assert.match(card, /Publish a portal first/);
});

test('the card is on the portals page, where the addresses already live', () => {
  const hub = read(...HUB);
  assert.match(hub, /import \{ AppLinksCard \}/);
  assert.match(hub, /<AppLinksCard slug=\{customer\.subdomain_slug \|\| crew\.subdomain_slug\} \/>/);
});

/* ── The Portal's OWN manifest, which was backwards ───────────────────────── */

test("the Portal's manifest names PNG icons, because iOS will not read an SVG", () => {
  const m = JSON.parse(read('public', 'manifest.webmanifest'));
  const pngs = m.icons.filter((i) => i.type === 'image/png');
  const any = (size) => pngs.some((i) => i.sizes === size && String(i.purpose).split(/\s+/).includes('any'));
  // `purpose: any` specifically. A maskable-only icon set is not enough for
  // Chrome's installability check, and that is exactly the kind of near-miss
  // that leaves a manifest looking complete while the install prompt never
  // appears and nothing is logged.
  assert.ok(any('192x192'), 'no 192px "any" PNG — Chrome will not call this installable');
  assert.ok(any('512x512'), 'no 512px "any" PNG');
  assert.ok(pngs.some((i) => String(i.purpose).includes('maskable')), 'no maskable icon — Android crops the square');
  assert.equal(m.id, '/app', 'a stable id is what lets scope move later without orphaning installs');
});

test('an iPhone that adds the Portal gets an icon, not a screenshot of the page', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/,
    'without this iOS uses a screenshot of the page as the Home Screen icon');
  assert.match(html, /viewport-fit=cover/,
    'without this the layout stops short of the notch and leaves a white band');
});

test('the three icon files the manifest promises actually exist and are PNGs', () => {
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const buf = readFileSync(join(ROOT, 'public', name));
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${name} is not a PNG`);
    // IHDR width/height, big-endian, at bytes 16..24.
    assert.equal(buf.readUInt32BE(16), size, `${name} is not ${size}px wide`);
    assert.equal(buf.readUInt32BE(20), size, `${name} is not ${size}px tall`);
  }
});

test('the Portal is NOT path-scoped, and that is deliberate', () => {
  // One origin, one product, one business per session. The path model exists
  // because the three white-label apps share an origin across every client;
  // the Portal does not, so scoping it would be complexity with no buyer.
  const m = JSON.parse(read('public', 'manifest.webmanifest'));
  assert.equal(m.scope, '/');
  assert.match(read('index.html'), /<link rel="manifest" href="\/manifest\.webmanifest"/);
});
