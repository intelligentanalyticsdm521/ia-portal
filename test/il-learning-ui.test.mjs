// IL-1 — pins the founder's Intelligence Layer card.
//
// Source-pinning, like site-requests-ui.test.mjs and no-dead-app-links: these
// are wiring and wording facts a typecheck cannot see.
//
// What has to stay true:
//   • the page is behind RequireFounderRoute and reachable from Platform Admin
//   • the API client calls the four routes LUMEN actually serves under /il
//   • no vendor and no external model is named anywhere on the page
//     (`reference_intelligence_layer_terminology` — the owner sees IL output)
//   • the page never says "tenant" to a human (`feedback_no_tenant_in_ui`)
//   • it stays read-only: no route on it changes a label or acts on one (L4)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const page = read("pages/admin/IlLearningPage.tsx");
const api = read("lib/ilApi.ts");
const app = read("App.tsx");
const adminHub = read("pages/PlatformAdminPage.tsx");

test("the IL card is founder-gated in the router and linked from Platform Admin", () => {
  assert.match(app, /<Route path="admin\/il-learning" element=\{<RequireFounderRoute \/>\}>/);
  assert.match(app, /IlLearningPageAdmin/);
  assert.match(adminHub, /to="\/app\/admin\/il-learning"/);
  assert.match(adminHub, /Intelligence Layer/);
});

test("the API client calls the four routes LUMEN serves under /il", () => {
  for (const p of [
    "/api/v1/il/admin/gate",
    "/api/v1/il/admin/gate/recompute",
    "/api/v1/il/admin/decisions",
    "/api/v1/il/admin/model/train",
  ]) {
    assert.ok(api.includes(p), `${p} is missing from the client`);
  }
  // Never under /leadgen — that prefix is claimed by two catch-all routers.
  assert.ok(!/\/api\/v1\/leadgen\/il/.test(api), "an IL call went to a /leadgen path");
});

test("no vendor and no external model is named on the page", () => {
  for (const [name, src] of [["IlLearningPage", page], ["ilApi", api]]) {
    assert.doesNotMatch(src, /claude|anthropic|openai|gpt-|haiku|sonnet|opus/i,
      `${name} names an external model or vendor`);
  }
  // The second opinion is called what it is.
  assert.match(page, /the judge/i);
});

test("the page never says 'tenant' to a human", () => {
  const strings = page.match(/>[^<>{}]*\btenants?\b[^<>{}]*</gi) || [];
  assert.deepEqual(strings, [], `visible copy says "tenant": ${strings.join(" | ")}`);
  assert.match(page, /By business/, "the per-business section is headed Business");
});

test("the page is read-only apart from recompute and retrain", () => {
  // Every write the page can make, listed. A new one has to be added here on
  // purpose, which is the point.
  const posts = api.match(/lumenPost<[^>]*>\([^)]*"([^"]+)"/g) || [];
  assert.equal(posts.length, 2, `the client makes ${posts.length} POSTs; only recompute and train are allowed`);
  assert.ok(!/lumenPut|lumenPatch|lumenDelete/.test(api), "the IL client can change or delete something");
});

test("the gate's numbers are explained in words, not just printed", () => {
  assert.match(page, /A model goes live at \{th\.platform_agreement_pct\}% agreement over its last \{th\.window\} checked/);
  assert.match(page, /below \{th\.tenant_min_pct\}% agreement/);
  assert.match(page, /stays fully checked/);
});

test("an unmeasured agreement reads as 'not enough yet', never as 0%", () => {
  assert.match(page, /not enough yet/);
  // …in both tables.
  assert.equal((page.match(/not enough yet/g) || []).length, 2);
});

test("the redaction is stated on the page, so nobody assumes the log holds the message", () => {
  assert.match(page, /first 200 characters/);
});
