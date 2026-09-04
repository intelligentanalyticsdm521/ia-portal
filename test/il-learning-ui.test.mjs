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
// IL-2
const corrections = read("components/spark/LeadCorrectionButtons.tsx");
const leadModal = read("components/spark/SparkLeadModal.tsx");

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

test("the page is read-only apart from recompute, retrain and the roll-up", () => {
  // Every write the page can make, listed. A new one has to be added here on
  // purpose, which is the point.
  //
  // IL-2 added the third: rolling up outcomes, re-fitting weights and
  // re-running the calibration. It changes NUMBERS — a weight set may be
  // promoted or demoted by it — and never a label, which is why it is allowed
  // on a page whose whole promise is that it cannot decide anything.
  const posts = api.match(/lumenPost<[\s\S]*?>\(\s*msal,\s*account,\s*"([^"]+)"/g) || [];
  assert.equal(posts.length, 4, `the client makes ${posts.length} POSTs; only recompute, train, the roll-up and the audit are allowed`);
  for (const p of [
    "/api/v1/il/admin/gate/recompute",
    "/api/v1/il/admin/model/train",
    "/api/v1/il/admin/outcomes/sync",
    "/api/v1/il/admin/audit/run",
  ]) {
    assert.ok(api.includes(p), `${p} is missing from the client`);
  }
  assert.ok(!/lumenPut|lumenPatch|lumenDelete/.test(api), "the IL client can change or delete something");
});

// ═══════════════════════════════════════════════════════════════════════════
// IL-2 — outcomes, weights, calibration, owner corrections
// ═══════════════════════════════════════════════════════════════════════════

test("the founder page has the three IL-2 blocks", () => {
  assert.match(page, /Scoring weights, fitted from real results/);
  assert.match(page, /Calibration — we said Hot\. Did Hot convert\?/);
  assert.match(page, /What happened to the leads/);
  // The learning read is ONE call, not three (the data-fetching convention).
  assert.match(page, /getIlLearning\(instance, account\)/);
  assert.equal((page.match(/getIlLearning\(instance/g) || []).length, 1, "getIlLearning is called more than once per load");
});

test("calibration says out loud that the prediction and the measurement are different leads", () => {
  assert.match(page, /arrived before the last/);
  assert.match(page, /a prediction checked against the leads that made it is not a check/);
});

test("money on the founder page is money COLLECTED, and the page says so", () => {
  assert.match(page, /Money is money actually collected — paid invoices only/);
  assert.doesNotMatch(page, /revenue|forecast/i);
});

test("the owner correction buttons are two, are their own component, and delete nothing", () => {
  assert.match(corrections, /Not a lead/);
  assert.match(corrections, /This is real/);
  assert.match(corrections, /not_a_lead/);
  assert.match(corrections, /real_lead/);
  assert.match(corrections, /\/api\/v1\/leads\/\$\{leadId\}\/il\/correct/);
  assert.match(corrections, /Nothing is deleted either way/);
  // L4 — a correction is a label and a number, never an action. The component
  // makes exactly one call, to exactly one endpoint, and it is not a delete.
  const calls = corrections.match(/await (post|get|put|patch|del)<[^>]*>\([^;]*/g) || [];
  assert.equal(calls.length, 1, `the correction component makes ${calls.length} API calls; it may make one`);
  assert.match(calls[0], /il\/correct/);
  assert.ok(!/await del</.test(corrections) && !/\/suppress|\/dismiss/.test(corrections),
    "the correction component can suppress, dismiss or delete a lead");
});

test("the lead modal mounts the buttons and does nothing else new", () => {
  assert.match(leadModal, /import \{ LeadCorrectionButtons \} from "\.\/LeadCorrectionButtons"/);
  assert.equal((leadModal.match(/<LeadCorrectionButtons/g) || []).length, 1,
    "the correction buttons are mounted more than once");
  // Behind the same tier gate as the score they correct: a business that
  // cannot see points has nothing to correct.
  assert.match(leadModal, /\{showIntel && \(\s*<LeadCorrectionButtons/);
});

test("nothing in IL-2 names a vendor or says 'tenant' to a human", () => {
  for (const [name, src] of [["LeadCorrectionButtons", corrections]]) {
    assert.doesNotMatch(src, /claude|anthropic|openai|gpt-|haiku|sonnet|opus/i, `${name} names a vendor`);
    const strings = src.match(/>[^<>{}]*\btenants?\b[^<>{}]*</gi) || [];
    assert.deepEqual(strings, [], `${name} says "tenant" in visible copy`);
  }
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
