// The Lead Use Terms link opens the PUBLIC copy on the website (Brandon
// 2026-09-14) while the in-app canonical page stays routed. Source-shape guard:
// a tidy-up that points the link back at the in-app route, drops the new-tab
// attributes, or removes the in-app route goes red here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/spark/LeadGenTermsLink.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the Lead Use Terms link and the Start Search notice open the public website copy in a new tab", () => {
  assert.match(src, /LEAD_USE_TERMS_PUBLIC_URL = "https:\/\/intelligentanalyticsdm\.com\/lead-use-terms\/"/);
  const anchors = src.match(/<a\s[^>]*href=\{LEAD_USE_TERMS_PUBLIC_URL\}[^>]*>/g) || [];
  assert.equal(anchors.length, 2, "both the link and the notice use the public URL");
  for (const a of anchors) {
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
  assert.doesNotMatch(src, /<Link\s/, "no in-app router link is left on the surfaces");
});

test("the in-app canonical page stays routed (the parity test pins its text to the markdown)", () => {
  assert.match(src, /export const LEADGEN_TERMS_ROUTE = "\/app\/spark\/leadgen\/terms"/);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /LEADGEN_TERMS_ROUTE|spark\/leadgen\/terms/, "App.tsx still routes the terms page");
});
