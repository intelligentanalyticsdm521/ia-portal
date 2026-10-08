// Access follows the subscription — the Portal's half (the off surfaces).
// SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2 and §5, stream 2.
//
// What this file proves:
//   G  the product gate: only a DECIDED owned:false closes a product's pages;
//      undecided, missing or an ungated product stays open (SEAM-3-B). The
//      plan page (<product>_usage) is never closed. ServiceRouter puts the gate
//      BEFORE the tier check, and the rail and SubNav read the same source.
//   S  every sentence, word for word: ended, never bought, not an admin, the
//      founder viewing a client, and the Plan & Pricing line for each state.
//   R  RENDERED and clicked (esbuild + jsdom, the real components): the off
//      notice says the sentence and Re-subscribe sends POST /billing/resubscribe
//      { product } and leaves for the checkout it answered with; a non-admin
//      and the founder read why instead of a disabled button; the plan line's
//      Remove asks in the card, then sends POST /billing/change
//      { product, action: 'remove' }; Keep sends DELETE /billing/pending-change
//      { product }.
//   C  the stream-1 contract these controls call, pinned by path and body.
//   P  a product whose payment FAILED (unpaid): the gate, the menu notice and
//      the rail say what the Plan & Pricing card says, with Update card, never
//      "isn't part of your plan yet" with "Add" (decision (d)).
//   Q  the other two HELD-but-not-paid states (2026-10-08 open minor): an
//      INCOMPLETE first payment and a PAUSED subscription are listed by the
//      billing API and read the same way everywhere - their own sentence, no
//      control (nothing of ours fixes either), and never "Add <PRODUCT>".
//
// Mutations run against this file are listed in the stream-2 report.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
// The billing dates must not move with the viewer's clock: run every test in a
// US zone, where a UTC-midnight period end is the evening before.
process.env.TZ = "America/Chicago";
import {
  productSwitchedOff, productLockedOnRail, gateExemptServiceKey, planPagePath,
  endedSentence, neverBoughtSentence, offNotice, planCardLine, removeConfirmSentence,
  billingRefusalSentence, rowForProduct, rowIsLive, payloadForTenant, offNoticeShownByPage,
  planCardForViewer, railLockWords, offReasons, offReasonForRow, formatLongDate,
} from "../src/lib/productAccess.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");
const TZ = "UTC";

const decided = (products) => ({ tenant_id: "T", resolved_at: "", decided: true, products, addons: {}, limits: {} });

/* ══════════════════════════════════════════════════════════════════════════
   G — the gate
   ══════════════════════════════════════════════════════════════════════════ */
describe("G: only a decided 'not owned' closes a product", () => {
  test("decided owned:false closes; decided owned:true opens", () => {
    assert.equal(productSwitchedOff(decided({ spark: { owned: false, decided: true } }), "spark"), true);
    assert.equal(productSwitchedOff(decided({ spark: { owned: true, decided: true } }), "spark"), false);
  });
  test("undecided stays OPEN: no payload, an undecided payload, an undecided node, a missing node", () => {
    assert.equal(productSwitchedOff(null, "spark"), false, "no answer from platform-api");
    assert.equal(productSwitchedOff({ ...decided({ spark: { owned: false, decided: true } }), decided: false }, "spark"), false,
      "the whole payload is undecided");
    assert.equal(productSwitchedOff(decided({ spark: { owned: false, decided: false } }), "spark"), false,
      "this product's node is undecided (Stripe unreadable)");
    assert.equal(productSwitchedOff(decided({}), "spark"), false, "the product is not in the answer at all");
  });
  test("only OLIVER, SPARK, ARION and STELLA are gated by this build", () => {
    for (const p of ["oliver", "spark", "arion", "stella"]) {
      assert.equal(productSwitchedOff(decided({ [p]: { owned: false, decided: true } }), p), true, p);
    }
    for (const p of ["forge", "argus", "consulting", undefined]) {
      assert.equal(productSwitchedOff(decided({ [p]: { owned: false, decided: true } }), p), false, String(p));
    }
  });
  test("the product's own plan page is never closed — it is where they buy it back", () => {
    assert.equal(gateExemptServiceKey("spark_usage"), true);
    assert.equal(gateExemptServiceKey("oliver_usage"), true);
    assert.equal(gateExemptServiceKey("arion_usage"), true);
    assert.equal(gateExemptServiceKey("spark_contacts"), false);
    assert.equal(gateExemptServiceKey("oliver_jobs"), false);
    assert.equal(planPagePath("spark"), "/app/services/spark_usage");
    assert.equal(planPagePath("oliver"), "/app/services/oliver_usage");
    assert.equal(planPagePath("arion"), "/app/services/arion_usage");
    assert.equal(planPagePath("stella"), "/app/settings/plan-pricing", "STELLA has no plan page of its own");
  });
  test("the rail's padlock: decided payload first, then the sign-in list, null when neither knows", () => {
    const owned = new Set(["spark", "oliver"]);
    assert.equal(productLockedOnRail(decided({ spark: { owned: false, decided: true } }), owned, "spark"), true,
      "switched off mid-session: the payload wins over the sign-in list");
    assert.equal(productLockedOnRail(null, owned, "spark"), false, "no payload: the sign-in list says owned");
    assert.equal(productLockedOnRail(null, owned, "arion"), true, "no payload: the sign-in list says not owned");
    assert.equal(productLockedOnRail(null, new Set(), "arion"), null, "dev/preview: nobody knows, caller keeps its fallback");
  });

  test("ServiceRouter puts ProductGate OUTSIDE the tier check (the gate itself is rendered in R: the product gate)", () => {
    const src = read("src/pages/ServiceRouter.tsx");
    const body = src.slice(src.indexOf("export function ServiceRouter()"));
    const gate = body.indexOf("<ProductGate product={product} serviceKey={serviceKey}>");
    const tier = body.indexOf("<FeatureLocked");
    const close = body.indexOf("</ProductGate>");
    assert.ok(gate > 0, "ServiceRouter renders ProductGate");
    assert.ok(tier > gate && close > tier, "the tier lock is INSIDE the product gate");
    assert.doesNotMatch(body.slice(0, gate), /return <ServiceRouterInner \/>/, "no page is returned before the gate");
  });
  test("SPARK's own routes sit behind the same gate; only spark/pricing (where it is bought) stays open", () => {
    const app = read("src/App.tsx");
    for (const [route, el] of [["spark/contact-scoring", "SparkContactScoringPage"], ["spark/leadgen", "RequireLeadgenRoute"],
      ["spark/customer-flow", "SparkCustomerFlowPage"], ["spark/lifecycle", "SparkLifecyclePage"], ["spark/sync-issues", "SparkSyncIssuesPage"]]) {
      assert.match(app, new RegExp(`<Route path="${route}" element=\\{<ProductGate product="spark"><${el} /></ProductGate>\\}`), route);
    }
    assert.match(app, /<Route path="spark\/pricing" element=\{<SparkPricingPage \/>\} \/>/, "the pricing page is never gated");
  });
  test("the rail's padlock never locks on 'we don't know' (an undecided payload, or an undecided node)", () => {
    const owned = new Set(["spark"]);
    assert.equal(productLockedOnRail({ ...decided({ spark: { owned: false, decided: false } }), decided: false }, owned, "spark"), false,
      "undecided payload: the sign-in list (owned) decides, never the payload's owned:false");
    assert.equal(productLockedOnRail(decided({ spark: { owned: false, decided: false } }), owned, "spark"), false,
      "decided payload, undecided node: the same");
    assert.equal(productLockedOnRail({ ...decided({ spark: { owned: false, decided: true } }), decided: false }, new Set(), "spark"), null,
      "undecided payload and no sign-in list: nobody knows, never a lock");
  });
  test("an answer counts only for the business it was asked about (switching business never shows the last one's 'off')", () => {
    const p = decided({ spark: { owned: false, decided: true } });
    assert.equal(payloadForTenant({ tenantId: "AAAA", payload: p }, "aaaa"), p);
    assert.equal(payloadForTenant({ tenantId: "AAAA", payload: p }, "BBBB"), null);
    assert.equal(payloadForTenant(null, "AAAA"), null);
    assert.equal(payloadForTenant({ tenantId: "AAAA", payload: p }, null), null);
    const hook = read("src/hooks/useProductAccess.ts");
    assert.match(hook, /setHeld\(\{ tenantId: activeTenantId, payload: p \}\)/);
    assert.match(hook, /const payload = payloadForTenant\(held, activeTenantId\);/);
  });
  test("one sentence per screen: the menu banner is quiet where the page itself is the notice", () => {
    assert.equal(offNoticeShownByPage("/app/services/spark_contacts", "spark"), true);
    assert.equal(offNoticeShownByPage("/app/services/spark_usage", "spark"), false, "the plan page is open; the banner speaks there");
    assert.equal(offNoticeShownByPage("/app/services/oliver_jobs", "spark"), false, "another product's page");
    assert.equal(offNoticeShownByPage("/app/spark/leadgen/jobs/12", "spark"), true);
    assert.equal(offNoticeShownByPage("/app/spark/pricing", "spark"), false);
    assert.equal(offNoticeShownByPage("/app/settings/plan-pricing", "stella"), false);
    assert.match(read("src/components/SubNav.tsx"),
      /productLocked && isOffGatedProduct\(productKey\) && !\(productAccess\.isOff\(productKey\) && offNoticeShownByPage\(location\.pathname, productKey\)\) && \(/);
  });
  test("the rail says ENDED for an ended product, in the notice's words; ADD for one never bought", () => {
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", { kind: "ended", at: "2026-11-01T00:00:00Z" }),
      { badge: "ENDED", title: "Your SPARK subscription ended. Open SPARK to re-subscribe." });
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", { kind: "never" }),
      { badge: "ADD", title: "SPARK is not part of your plan — add SPARK to enable Marketing" });
    // Nothing known at all reads as never bought, never as a held product.
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", null),
      { badge: "ADD", title: "SPARK is not part of your plan — add SPARK to enable Marketing" });
    assert.deepEqual([...offReasons([{ product: "spark", status: "ended", ended: { at: "2026-11-01T00:00:00Z" } },
      { product: "oliver", status: "active" }])], [["spark", { kind: "ended", at: "2026-11-01T00:00:00Z" }]]);
    const rail = read("src/components/IconRail.tsx");
    assert.match(rail, /\{lockWords\.badge\}/);
    assert.match(rail, /title=\{locked \? lockWords\.title : /);
  });
  test("the rail and SubNav read the same source; SubNav shows the same sentence and control", () => {
    const rail = read("src/components/IconRail.tsx");
    assert.match(rail, /const access = useProductAccess\(location\.pathname\);/);
    assert.match(rail, /const railLock = access\.isLockedOnRail\(serviceKey\);\s*\n\s*if \(railLock !== null\) return \{ \.\.\.p, enabled: !railLock \};/);
    const sub = read("src/components/SubNav.tsx");
    assert.match(sub, /const productAccess = useProductAccess\(location\.pathname\);/);
    assert.match(sub, /<ProductEndedNotice product=\{productKey\} variant="nav" \/>/);
  });
  test("the hook asks platform-api once per navigation, never on a timer, and also under dev sign-in", () => {
    const hook = read("src/hooks/useProductAccess.ts");
    assert.match(hook, /\}, \[activeTenantId, getToken, refreshKey\]\);/);
    assert.doesNotMatch(hook, /setInterval|setTimeout/);
    assert.doesNotMatch(hook.replace(/\/\/.*$/gm, ""), /DEV_AUTH/, "the dev stack must see a product go off like production");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   S — the sentences
   ══════════════════════════════════════════════════════════════════════════ */
describe("S: the words, as Brandon wrote them", () => {
  test("ended, with the date", () => {
    assert.equal(endedSentence("spark", "2026-11-01T12:00:00Z", TZ),
      "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
  });
  test("never bought", () => {
    assert.equal(neverBoughtSentence("spark"), "SPARK isn't part of your plan yet.");
  });
  test("the off notice for each viewer: admin gets the control; a member and the founder read why, with no button", () => {
    const ended = { kind: "ended", at: "2026-11-01T12:00:00Z" };
    assert.deepEqual(offNotice("spark", ended, "admin", TZ).action, { kind: "resubscribe", label: "Re-subscribe" });
    assert.equal(offNotice("spark", ended, "admin", TZ).note, null);
    const member = offNotice("spark", ended, "member", TZ);
    assert.equal(member.action, null);
    assert.equal(member.note, "Ask an admin on your team to re-subscribe.");
    const founder = offNotice("spark", ended, "viewing_client", TZ);
    assert.equal(founder.action, null);
    assert.equal(founder.note, "Switch to your own business to change billing.");
    assert.equal(founder.sentence, "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    const never = offNotice("spark", null, "admin", TZ);
    assert.equal(never.sentence, "SPARK isn't part of your plan yet.");
    assert.deepEqual(never.action, { kind: "add", label: "Add SPARK" });
  });

  test("Plan & Pricing: one line per state (§5)", () => {
    const end = "2026-11-01T12:00:00Z";
    const active = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: end }, TZ);
    assert.equal(active.state, "active");
    assert.equal(active.line, "Renews November 1, 2026");
    assert.equal(active.canRemove, true);

    const down = planCardLine("oliver", { product: "oliver", tier: "pro", status: "active", current_period_end: end,
      next_change: { kind: "tier", to_tier: "lite", at: end } }, TZ);
    assert.equal(down.line, "OLIVER Pro until November 1, 2026, then Invoicing", "OLIVER lite is sold as Invoicing");
    assert.deepEqual(down.control, { kind: "keep", label: "Keep my plan" });

    const ends = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: end,
      next_change: { kind: "ends", at: end } }, TZ);
    assert.equal(ends.line, "SPARK Standard until November 1, 2026, then it ends");
    assert.deepEqual(ends.control, { kind: "keep", label: "Keep SPARK" });
    assert.equal(ends.canRemove, false, "already ending");

    const cancelFlag = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: end, cancel_at_period_end: true }, TZ);
    assert.equal(cancelFlag.state, "ending", "cancel_at_period_end reads as ending too");

    const pastDue = planCardLine("spark", { product: "spark", tier: "standard", status: "past_due", current_period_end: end }, TZ);
    assert.equal(pastDue.line, "Your last payment didn't go through. Update your card to keep your plan.");
    assert.deepEqual(pastDue.control, { kind: "update_card", label: "Update card" });

    const ended = planCardLine("spark", { product: "spark", tier: null, status: "ended", ended: { at: end, tier: "standard" } }, TZ);
    assert.equal(ended.line, "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    assert.deepEqual(ended.control, { kind: "resubscribe", label: "Re-subscribe" });

    const setUpByUs = planCardLine("spark", { product: "spark", tier: "business", status: "active", current_period_end: null, source: "entitlement" }, TZ);
    assert.deepEqual(setUpByUs, { state: "active", line: null, control: null, canRemove: false },
      "a product on in our records with no paid subscription has nothing to renew and nothing to remove");

    const never = planCardLine("spark", null, TZ);
    assert.equal(never.line, "Not subscribed");
    assert.deepEqual(never.control, { kind: "add", label: "Add SPARK to your account" });
  });
  test("one time zone for every billing date: a UTC-midnight period end reads as the SAME day the billing API says", () => {
    // The API: "SPARK stays on until November 1, 2026" (routes/billing.js longDate, timeZone UTC).
    assert.equal(formatLongDate("2026-11-01T02:00:00Z"), "November 1, 2026", "not October 31 in Chicago");
    assert.equal(formatLongDate("2026-11-01T02:00:00Z", "America/Chicago"), "October 31, 2026", "(the zone really is US here)");
    const card = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: "2026-11-01T02:00:00Z",
      next_change: { kind: "ends", at: "2026-11-01T02:00:00Z" } });
    assert.equal(card.line, "SPARK Standard until November 1, 2026, then it ends");
    assert.equal(removeConfirmSentence("spark", "2026-11-01T02:00:00Z"), "SPARK stays on until November 1, 2026, then it ends. Your other products are not changed.");
  });
  test("a change within the same tier (a SPARK volume cut, an ARION add-on removed) says the plan gets smaller, never 'then Standard'", () => {
    const end = "2026-11-01T12:00:00Z";
    const spark = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: end,
      next_change: { kind: "tier", to_tier: "standard", at: end } }, TZ);
    assert.equal(spark.line, "SPARK Standard until November 1, 2026, then a smaller plan");
    const arion = planCardLine("arion", { product: "arion", tier: "pro", status: "active", current_period_end: end,
      next_change: { kind: "tier", to_tier: "PRO", at: end } }, TZ);
    assert.equal(arion.line, "ARION Pro until November 1, 2026, then a smaller plan");
  });
  test("the card for each viewer: a member and the founder viewing a client get NO control, and one sentence why", () => {
    const end = "2026-11-01T12:00:00Z";
    const active = planCardLine("spark", { product: "spark", tier: "standard", status: "active", current_period_end: end }, TZ);
    assert.deepEqual(planCardForViewer("spark", active, "admin"), { card: active, note: null });
    const f = planCardForViewer("spark", active, "viewing_client");
    assert.equal(f.card.control, null); assert.equal(f.card.canRemove, false);
    assert.equal(f.note, "Switch to your own business to change billing.");
    assert.equal(f.card.line, "Renews November 1, 2026", "the line itself is still shown");
    const ended = planCardLine("spark", { product: "spark", status: "ended", ended: { at: end } }, TZ);
    assert.equal(planCardForViewer("spark", ended, "member").note, "Ask an admin on your team to re-subscribe.");
    assert.equal(planCardForViewer("spark", active, "member").note, "Ask an admin on your team to change SPARK's plan.");
    const pastDue = planCardLine("spark", { product: "spark", status: "past_due", current_period_end: end }, TZ);
    assert.equal(planCardForViewer("spark", pastDue, "member").note, "Ask an admin on your team to update the card.");
    const quiet = planCardLine("spark", { product: "spark", tier: "business", status: "active", source: "entitlement" }, TZ);
    assert.equal(planCardForViewer("spark", quiet, "viewing_client").note, null, "nothing to act on, nothing to explain");
  });
  test("past_due still counts as paid for (§1.3): it is live, never 'ended'", () => {
    assert.equal(rowIsLive({ product: "spark", status: "past_due" }), true);
    assert.equal(rowIsLive({ product: "spark", status: "unpaid" }), false);
    const rows = [
      { product: "spark", status: "ended", ended: { at: "2026-10-01T00:00:00Z" } },
      { product: "spark", status: "active", tier: "pro" },
    ];
    assert.equal(rowForProduct(rows, "spark").status, "active", "a live row beats an ended record");
  });
  test("Remove asks first, with the end date", () => {
    assert.equal(removeConfirmSentence("spark", "2026-11-01T12:00:00Z", TZ),
      "SPARK stays on until November 1, 2026, then it ends. Your other products are not changed.");
  });
  test("a billing refusal is a sentence, never a code", () => {
    assert.equal(billingRefusalSentence({ error: "past_due", message: "Your last payment didn't go through. Update your card first, then change your plan." }, 409),
      "Your last payment didn't go through. Update your card first, then change your plan.");
    assert.equal(billingRefusalSentence({ error: { code: "TENANT_ADMIN_REQUIRED", message: "Only a business admin can change billing. Ask an admin on your team." } }, 403),
      "Only a business admin can change billing. Ask an admin on your team.");
    assert.equal(billingRefusalSentence({ error: "internal_error" }, 500), "That did not go through. Nothing was changed. Try again in a minute.");
  });
  test("no 'tenant' and no vendor name in the words this build put on screen", () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const files = ["src/lib/productAccess.ts", "src/components/ProductEndedNotice.tsx", "src/components/ProductPlanStatus.tsx",
      "src/components/PendingChangeBanner.tsx", "src/components/ProductGate.tsx", "src/hooks/useBillingViewer.ts"];
    let scanned = 0;
    for (const f of files) {
      const code = strip(read(f));
      const strings = [...code.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]).filter((t) => /\s/.test(t) && /[A-Za-z]{3}/.test(t));
      scanned += strings.length;
      if (/productAccess|ProductPlanStatus|ProductEndedNotice/.test(f)) {
        assert.ok(strings.length > 5, `${f}: the scan found its sentences (a scan that finds nothing proves nothing): ${strings.length}`);
      }
      for (const t of strings) {
        assert.doesNotMatch(t, /\btenant\b/i, `${f}: "${t}"`);
        assert.doesNotMatch(t, /\bStripe\b/, `${f}: "${t}"`);
      }
    }
    const hub = strip(read("src/pages/settings/TenantSettings.tsx"));
    const tab = hub.slice(hub.indexOf("export function SubscriptionBillingTab()"), hub.indexOf("Tab: Team"));
    assert.doesNotMatch(tab, /Stripe Billing Portal|Opening Stripe|Manage billing \/ Cancel|alert\(/,
      "the Plan & Pricing tab names no vendor and raises no browser pop-up");
    assert.match(tab, /"Payment method & invoices"/);
    assert.match(read("src/arion/useArionContext.ts"), /"ARION isn't part of this business's plan\."/);
    assert.match(read("src/components/OliverUpgradeGate.tsx"), /href="\/app\/services\/oliver_usage"/, "F10: OLIVER's upgrade opens OLIVER's plan page");
  });
  test("each usage page's banner names its own product (one product's change never shows as another's)", () => {
    assert.match(read("src/pages/spark/SparkUsagePage.tsx"), /<PendingChangeBanner [^>]*product="spark" \/>/);
    assert.match(read("src/pages/oliver/OliverUsagePage.tsx"), /<PendingChangeBanner [^>]*product="oliver" \/>/);
    assert.match(read("src/pages/arion/ArionUsagePage.tsx"), /<PendingChangeBanner [^>]*product="arion" \/>/);
    assert.doesNotMatch(read("src/components/PendingChangeBanner.tsx"), /fetchPendingChange|core\.tenants\.pending_\* via GET.*\n.*fetch/,
      "the one-per-business pending row is no longer read");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R — rendered and clicked
   ══════════════════════════════════════════════════════════════════════════ */
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/app/services/spark_contacts" });
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "Event", "MouseEvent", "sessionStorage", "localStorage"]) {
  if (globalThis[k] === undefined) {
    try { globalThis[k] = k === "window" ? dom.window : dom.window[k]; } catch { /* read-only global */ }
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const NodeMessageChannel = globalThis.MessageChannel;
globalThis.MessageChannel = class {
  constructor() {
    const port1 = { onmessage: null, close() {} };
    this.port1 = port1;
    this.port2 = { postMessage: (data) => setImmediate(() => port1.onmessage?.({ data })), close() {} };
  }
};

// The world the components see, set per test.
const world = {
  appState: { activeTenantId: "11111111-1111-4111-8111-111111111111", bootstrap: { user: { isFounder: false }, homeTenantId: null }, ownedProducts: new Set() },
  role: "admin",
  left: [],
  calls: [],
  answer: async () => ({ status: 200, body: { data: {} } }),
};
globalThis.__offWorld = world;
const NodeFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const call = { method: init.method || "GET", path: u.pathname, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} };
  world.calls.push(call);
  const a = await world.answer(call);
  return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
};

const stubs = {
  name: "stub-off-world",
  setup(b) {
    const map = {
      "app/AppState": `export function useAppState() { return globalThis.__offWorld.appState; }`,
      "auth/useAccessToken": `const r = { accessToken: "tok" }; const getToken = async () => r; const v = { getToken }; export function useAccessToken() { return v; }`,
      "hooks/useUserAccess": `export function useUserAccess() { return { access: { role: globalThis.__offWorld.role } }; }`,
      "lib/leaveForCheckout": `export function leaveForCheckout(url) { globalThis.__offWorld.left.push(url); }`,
    };
    b.onResolve({ filter: /(app\/AppState|auth\/useAccessToken|hooks\/useUserAccess|lib\/leaveForCheckout)$/ }, (args) => {
      const key = Object.keys(map).find((k) => args.path.endsWith(k));
      return { path: key, namespace: "offstub" };
    });
    b.onLoad({ filter: /.*/, namespace: "offstub" }, (args) => ({ contents: map[args.path], loader: "js" }));
  },
};

let ui;
before(async () => {
  const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");
  const built = await esbuild.build({
    stdin: {
      contents: `
        import { createElement, act } from "react";
        import { createRoot } from "react-dom/client";
        import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
        import { ProductEndedNotice } from "./src/components/ProductEndedNotice.tsx";
        import { ProductPlanStatus } from "./src/components/ProductPlanStatus.tsx";
        import { ProductGate } from "./src/components/ProductGate.tsx";
        import { useOffReasons } from "./src/hooks/useOffReasons.ts";
        import { railLockWords } from "./src/lib/productAccess.ts";
        import { clearSubscriptionsCache } from "./src/lib/billingApi.ts";
        import { clearEntitlementCache } from "./src/lib/entitlements.ts";
        export { act, clearSubscriptionsCache, clearEntitlementCache, ProductEndedNotice, ProductPlanStatus, ProductGate, createElement };
        // The rail's reading, as IconRail makes it: useOffReasons, then railLockWords.
        export function RailProbe({ product }) {
          const why = useOffReasons(true, "probe");
          const w = railLockWords(product, product.toUpperCase(), "Marketing", why.get(product) ?? "never");
          return createElement("span", { "data-rail-probe": "1", "data-badge": w.badge, title: w.title });
        }
        const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
        function Where() {
          const l = useLocation();
          return createElement("output", { "data-where": l.pathname, "data-state": JSON.stringify(l.state ?? null) });
        }
        export function mount(C, props, opts = {}) {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const root = createRoot(host);
          const at = opts.at || "/app/services/spark_contacts";
          const tree = (p) => createElement(MemoryRouter, { future: FUTURE, initialEntries: [opts.state ? { pathname: at, state: opts.state } : at] },
            createElement(Where), createElement(C, p));
          act(() => { root.render(tree(props)); });
          return { host, rerender: (p) => act(() => { root.render(tree(p || props)); }), unmount: () => act(() => root.unmount()) };
        }
      `,
      resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
    },
    bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env": JSON.stringify({ VITE_OLIVER_API_BASE: "http://oliver.test", VITE_PLATFORM_API_BASE_URL: "http://platform.test" }),
    },
    plugins: [stubs],
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "off-surfaces-"));
  const file = path.join(dir, "bundle.mjs");
  fs.writeFileSync(file, built.outputFiles[0].text);
  try { ui = await import(pathToFileURL(file).href); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
after(() => { dom.window.close(); globalThis.MessageChannel = NodeMessageChannel; globalThis.fetch = NodeFetch; });

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await ui.act(async () => { for (let i = 0; i < 8; i += 1) await tick(); }); };
async function click(el) { await ui.act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); for (let i = 0; i < 8; i += 1) await tick(); }); }
function text(el) {
  if (!el) return "";
  const walk = el.ownerDocument.createTreeWalker(el, 4);
  const parts = [];
  while (walk.nextNode()) parts.push(walk.currentNode.nodeValue);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
const button = (host, words) => [...host.querySelectorAll("button")].find((b) => text(b) === words);
const where = (host) => host.querySelector("[data-where]")?.getAttribute("data-where");

function reset({ role = "admin", founderViewing = false, subs = [] } = {}) {
  world.role = role;
  world.left = [];
  world.calls = [];
  world.appState = {
    activeTenantId: "11111111-1111-4111-8111-111111111111",
    bootstrap: founderViewing
      ? { user: { isFounder: true }, homeTenantId: "99999999-9999-4999-8999-999999999999" }
      : { user: { isFounder: false }, homeTenantId: null },
    ownedProducts: new Set(),
  };
  ui.clearSubscriptionsCache();
  ui.clearEntitlementCache();
  world.answer = async (call) => {
    if (call.method === "GET" && call.path === "/billing/subscriptions") {
      return { status: 200, body: { data: { subscriptions: subs, hasAnySubscription: subs.length > 0, customerId: "cus_1", owner: false } } };
    }
    return { status: 200, body: { data: {} } };
  };
}
const ENDED_SPARK = [{ product: "spark", tier: null, status: "ended", current_period_end: null, monthly_usd: 0, items: [],
  ended: { at: "2026-11-01T18:00:00Z", tier: "standard" } }];

describe("R: the off notice, rendered and clicked", () => {
  test("ended: the sentence, and Re-subscribe is ONE click to the checkout for the same prices", async () => {
    reset({ subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")),
      "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    world.answer = async (call) => call.path === "/billing/resubscribe"
      ? { status: 200, body: { data: { mode: "checkout", url: "https://checkout.example/c/s_1" } } }
      : { status: 200, body: { data: {} } };
    await click(button(v.host, "Re-subscribe"));
    const sent = world.calls.filter((c) => c.method === "POST");
    assert.deepEqual(sent.map((c) => [c.path, c.body]), [["/billing/resubscribe", { product: "spark" }]]);
    assert.equal(sent[0].headers["x-tenant-key"], "11111111-1111-4111-8111-111111111111");
    assert.deepEqual(world.left, ["https://checkout.example/c/s_1"], "the browser goes to the checkout the API answered with");
    v.unmount();
  });

  test("Re-subscribe that cannot open a checkout (a price was archived) takes them to the plan page", async () => {
    reset({ subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    world.answer = async () => ({ status: 200, body: { data: { mode: "plan_page" } } });
    await click(button(v.host, "Re-subscribe"));
    assert.deepEqual(world.left, []);
    assert.equal(where(v.host), "/app/services/spark_usage");
    v.unmount();
  });

  test("a refusal is said beside the button, as a sentence", async () => {
    reset({ subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    world.answer = async () => ({ status: 403, body: { error: { code: "TENANT_ADMIN_REQUIRED", message: "Only a business admin can change billing. Ask an admin on your team." } } });
    await click(button(v.host, "Re-subscribe"));
    assert.equal(text(v.host.querySelector('[role="alert"]')), "Only a business admin can change billing. Ask an admin on your team.");
    v.unmount();
  });

  test("never bought: the sentence and Add SPARK, which opens SPARK's plan page", async () => {
    reset({ subs: [] });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")), "SPARK isn't part of your plan yet.");
    await click(button(v.host, "Add SPARK"));
    assert.equal(where(v.host), "/app/services/spark_usage");
    assert.equal(world.calls.filter((c) => c.method !== "GET").length, 0, "Add only navigates");
    v.unmount();
  });

  test("not an admin: the sentence, and why — no button at all", async () => {
    reset({ role: "user", subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(v.host.querySelectorAll("button").length, 0, "never a disabled button that only exists to say no");
    assert.equal(text(v.host.querySelector("[data-notice-note]")), "Ask an admin on your team to re-subscribe.");
    v.unmount();
  });

  test("the founder viewing a client: the sentence, and 'Switch to your own business to change billing.'", async () => {
    reset({ founderViewing: true, subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(v.host.querySelectorAll("button").length, 0);
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")),
      "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    assert.equal(text(v.host.querySelector("[data-notice-note]")), "Switch to your own business to change billing.");
    v.unmount();
  });
});

describe("R: the Plan & Pricing line, rendered and clicked", () => {
  const ACTIVE_SPARK = { product: "spark", tier: "standard", status: "active", current_period_end: "2026-11-01T18:00:00Z", monthly_usd: 99, items: [] };

  test("Remove asks in the card first, then sends POST /billing/change { product, action: 'remove' } and says what happens", async () => {
    reset();
    let changed = 0;
    const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row: ACTIVE_SPARK, addTo: "/app/services/spark_usage", onChanged: () => { changed += 1; } });
    await settle();
    assert.equal(text(v.host.querySelector("[data-plan-line]")), "Renews November 1, 2026");
    await click(button(v.host, "Remove SPARK"));
    assert.equal(world.calls.length, 0, "nothing is sent before they confirm");
    assert.equal(text(v.host.querySelector("[data-plan-remove-confirm] p")),
      "SPARK stays on until November 1, 2026, then it ends. Your other products are not changed.");
    world.answer = async () => ({ status: 200, body: { data: { mode: "scheduled", message: "SPARK stays on until November 1, 2026, then it ends. Your other products are not changed." } } });
    await click(button(v.host, "Yes, remove SPARK"));
    assert.deepEqual(world.calls.map((c) => [c.method, c.path, c.body]), [["POST", "/billing/change", { product: "spark", action: "remove" }]]);
    assert.equal(text(v.host.querySelector("[data-plan-message]")), "SPARK stays on until November 1, 2026, then it ends. Your other products are not changed.");
    assert.equal(changed, 1, "the card re-reads the plan once");
    v.unmount();
  });

  test("Keep SPARK on a scheduled end sends DELETE /billing/pending-change { product } for THIS product only", async () => {
    reset();
    const row = { ...ACTIVE_SPARK, next_change: { kind: "ends", at: "2026-11-01T18:00:00Z" } };
    const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row, addTo: "/app/services/spark_usage" });
    await settle();
    assert.equal(text(v.host.querySelector("[data-plan-line]")), "SPARK Standard until November 1, 2026, then it ends");
    world.answer = async () => ({ status: 200, body: { data: { message: "SPARK stays on and renews on November 1, 2026." } } });
    await click(button(v.host, "Keep SPARK"));
    assert.deepEqual(world.calls.map((c) => [c.method, c.path, c.body]), [["DELETE", "/billing/pending-change", { product: "spark" }]]);
    assert.equal(text(v.host.querySelector("[data-plan-message]")), "SPARK stays on and renews on November 1, 2026.");
    v.unmount();
  });

  test("Update card on a failed payment opens the payment page for this product", async () => {
    reset();
    const row = { ...ACTIVE_SPARK, status: "past_due" };
    const opened = [];
    const realOpen = window.open;
    window.open = (u) => { opened.push(u); return null; };
    try {
      const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row, addTo: "/app/services/spark_usage" });
      await settle();
      assert.equal(text(v.host.querySelector("[data-plan-line]")), "Your last payment didn't go through. Update your card to keep your plan.");
      world.answer = async () => ({ status: 200, body: { data: { mode: "portal", url: "https://billing.example/p/1" } } });
      await click(button(v.host, "Update card"));
      assert.deepEqual(world.calls.map((c) => [c.method, c.path, c.body?.product]), [["POST", "/billing/portal-session", "spark"]]);
      assert.deepEqual(opened, ["https://billing.example/p/1"]);
      assert.equal(button(v.host, "Remove SPARK"), undefined, "no Remove while a payment is failing");
      v.unmount();
    } finally { window.open = realOpen; }
  });

  test("ended on the card: the sentence and Re-subscribe", async () => {
    reset();
    const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row: ENDED_SPARK[0], addTo: "/app/services/spark_usage" });
    await settle();
    assert.equal(text(v.host.querySelector("[data-plan-line]")),
      "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    world.answer = async () => ({ status: 200, body: { data: { mode: "checkout", url: "https://checkout.example/c/s_2" } } });
    await click(button(v.host, "Re-subscribe"));
    assert.deepEqual(world.calls.map((c) => [c.method, c.path, c.body]), [["POST", "/billing/resubscribe", { product: "spark" }]]);
    assert.deepEqual(world.left, ["https://checkout.example/c/s_2"]);
    v.unmount();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   C — the stream-1 contract (oliver-api routes/billing.js)
   ══════════════════════════════════════════════════════════════════════════ */
describe("C: the billing routes these controls call, as the scope names them", () => {
  test("paths and bodies", () => {
    const api = read("src/lib/billingApi.ts");
    assert.match(api, /method: "POST", path: "\/billing\/resubscribe", body: \{ product: params\.product \}/);
    assert.match(api, /method: "POST", path: "\/billing\/change", body: \{ product: params\.product, action: "remove" \}/);
    assert.match(api, /method: "DELETE", path: "\/billing\/pending-change", body: \{ product: params\.product \}/);
    assert.match(api, /next_change\?: \{ kind: "tier" \| "ends"; to_tier\?: string \| null; at\?: string \| null \} \| null;/);
    assert.match(api, /ended\?: \{ at: string \| null; tier\?: string \| null \} \| null;/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R — review fixes of 2026-10-08, rendered and clicked
   ══════════════════════════════════════════════════════════════════════════ */
const stateOf = (host) => JSON.parse(host.querySelector("[data-where]")?.getAttribute("data-state") || "null");
const TA = "11111111-1111-4111-8111-111111111111";
const TB = "22222222-2222-4222-8222-222222222222";
const SPARK_OFF = { tenant_id: TA, resolved_at: "", decided: true, products: { spark: { owned: false, decided: true } }, addons: {}, limits: {} };
const SPARK_ON = { ...SPARK_OFF, products: { spark: { owned: true, decided: true } } };
const PAGE = () => ui.createElement("p", { "data-real-page": "1" }, "SPARK contacts");

describe("R: the product gate (the real ProductGate and useProductAccess, rendered)", () => {
  function gateWorld(byTenant) {
    reset({ subs: ENDED_SPARK });
    const base = world.answer;
    world.answer = async (call) => {
      if (call.path === "/me/entitlements") {
        const a = byTenant[call.headers["x-tenant-key"]];
        return typeof a === "function" ? a() : a;
      }
      return base(call);
    };
  }
  test("decided owned:false: the page is replaced by the off notice", async () => {
    gateWorld({ [TA]: { status: 200, body: SPARK_OFF } });
    const v = ui.mount(ui.ProductGate, { product: "spark", serviceKey: "spark_contacts", children: PAGE() });
    await settle();
    assert.equal(v.host.querySelector("[data-real-page]"), null);
    assert.ok(v.host.querySelector('[data-product-ended="spark"]'));
    v.unmount();
  });
  test("undecided, no answer, or owned: the page shows (never a lock on 'we don't know')", async () => {
    for (const answer of [{ status: 200, body: { ...SPARK_OFF, decided: false } }, { status: 503, body: {} }, { status: 200, body: SPARK_ON },
      { status: 200, body: { ...SPARK_OFF, products: { spark: { owned: false, decided: false } } } }]) {
      gateWorld({ [TA]: answer });
      const v = ui.mount(ui.ProductGate, { product: "spark", serviceKey: "spark_contacts", children: PAGE() });
      await settle();
      assert.ok(v.host.querySelector("[data-real-page]"), JSON.stringify(answer));
      assert.equal(v.host.querySelector("[data-product-ended]"), null);
      v.unmount();
    }
  });
  test("the plan page stays open even when decided off", async () => {
    gateWorld({ [TA]: { status: 200, body: SPARK_OFF } });
    const v = ui.mount(ui.ProductGate, { product: "spark", serviceKey: "spark_usage", children: PAGE() });
    await settle();
    assert.ok(v.host.querySelector("[data-real-page]"));
    v.unmount();
  });
  test("switching business: the last business's 'off' never shows under the new one while its answer is on the way", async () => {
    let release;
    const pendingB = new Promise((r) => { release = r; });
    gateWorld({ [TA]: { status: 200, body: SPARK_OFF }, [TB]: () => pendingB });
    const v = ui.mount(ui.ProductGate, { product: "spark", serviceKey: "spark_contacts", children: PAGE() });
    await settle();
    assert.ok(v.host.querySelector('[data-product-ended="spark"]'), "business A: SPARK is off");
    world.appState = { ...world.appState, activeTenantId: TB };
    v.rerender();
    await settle();
    assert.ok(v.host.querySelector("[data-real-page]"), "business B, answer not back yet: open, not A's notice");
    assert.equal(v.host.querySelector("[data-product-ended]"), null);
    release({ status: 200, body: { ...SPARK_ON, tenant_id: TB } });
    await settle();
    assert.ok(v.host.querySelector("[data-real-page]"));
    v.unmount();
  });
});

describe("R: who is looking at the Plan & Pricing card", () => {
  const ACTIVE = { product: "spark", tier: "standard", status: "active", current_period_end: "2026-11-01T18:00:00Z", monthly_usd: 99, items: [] };
  const ENDING = { ...ACTIVE, next_change: { kind: "ends", at: "2026-11-01T18:00:00Z" } };
  for (const [label, opts, note] of [
    ["the founder viewing a client", { founderViewing: true }, "Switch to your own business to change billing."],
    ["a team member who is not an admin", { role: "user" }, null],
  ]) {
    test(`${label}: the line, NO Remove / Keep / Re-subscribe / Update card, and one sentence why`, async () => {
      for (const row of [ACTIVE, ENDING, { ...ACTIVE, status: "past_due" }, ENDED_SPARK[0]]) {
        reset(opts);
        const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row, addTo: "/app/services/spark_usage" });
        await settle();
        assert.equal(v.host.querySelectorAll("button").length, 0, `${label} / ${row.status}: no button at all`);
        assert.ok(text(v.host.querySelector("[data-plan-line]")).length > 0, "the line is still said");
        const said = text(v.host.querySelector("[data-plan-note]"));
        if (note) assert.equal(said, note);
        else assert.match(said, /^Ask an admin on your team to /);
        assert.equal(world.calls.filter((c) => c.method !== "GET").length, 0);
        v.unmount();
      }
    });
  }
  test("the Plan & Pricing page hides the payment-page buttons from both and says why", () => {
    const hub = read("src/pages/settings/TenantSettings.tsx");
    const tab = hub.slice(hub.indexOf("export function SubscriptionBillingTab()"), hub.indexOf("Tab: Team"));
    assert.match(tab, /const canBill = viewer === 'admin';/);
    assert.match(tab, /\{!isOwner && canBill && \(/);
    assert.match(tab, /\{canBill && <div className="flex flex-col items-end gap-1">/);
    assert.match(tab, /You're viewing a client's business\. \$\{SWITCH_TO_OWN_BUSINESS\}/);
  });
});

describe("R: Re-subscribe with no checkout says why, and never loops", () => {
  const ENDED_STELLA = { product: "stella", tier: null, status: "ended", current_period_end: null, monthly_usd: 0, items: [], ended: { at: "2026-11-01T18:00:00Z" } };
  const PLAN_PAGE = { status: 200, body: { data: { mode: "plan_page", url: null, message: "Choose a SPARK plan to pick up where you left off." } } };

  test("SPARK on its own plan page: the sentence is said beside the button, and nothing navigates", async () => {
    reset();
    const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row: ENDED_SPARK[0] }, { at: "/app/services/spark_usage" });
    await settle();
    world.answer = async () => PLAN_PAGE;
    await click(button(v.host, "Re-subscribe"));
    assert.equal(where(v.host), "/app/services/spark_usage");
    assert.equal(text(v.host.querySelector("[data-plan-message]")), "Choose a SPARK plan to pick up where you left off.");
    v.unmount();
  });

  test("SPARK from Plan & Pricing: to SPARK's plan page, carrying the sentence, which the plan line there shows", async () => {
    reset();
    const v = ui.mount(ui.ProductPlanStatus, { product: "spark", row: ENDED_SPARK[0], addTo: "/app/services/spark_usage" }, { at: "/app/settings/plan-pricing" });
    await settle();
    world.answer = async () => PLAN_PAGE;
    await click(button(v.host, "Re-subscribe"));
    assert.equal(where(v.host), "/app/services/spark_usage");
    const carried = stateOf(v.host);
    assert.deepEqual(carried, { planNotice: { product: "spark", text: "Choose a SPARK plan to pick up where you left off." } });
    v.unmount();
    const there = ui.mount(ui.ProductPlanStatus, { product: "spark", row: ENDED_SPARK[0] }, { at: "/app/services/spark_usage", state: carried });
    await settle();
    assert.equal(text(there.host.querySelector("[data-plan-message]")), "Choose a SPARK plan to pick up where you left off.");
    there.unmount();
  });

  test("STELLA on Plan & Pricing: no loop — the sentence, then STELLA's plans in the card, each opening the checkout", async () => {
    reset();
    const v = ui.mount(ui.ProductPlanStatus, { product: "stella", row: ENDED_STELLA, addTo: null }, { at: "/app/settings/plan-pricing" });
    await settle();
    world.answer = async () => ({ status: 200, body: { data: { mode: "plan_page", url: null, message: "Choose a STELLA plan to pick up where you left off." } } });
    await click(button(v.host, "Re-subscribe"));
    assert.equal(where(v.host), "/app/settings/plan-pricing", "it does not navigate to the page it is on");
    assert.equal(text(v.host.querySelector("[data-plan-message]")), "Choose a STELLA plan to pick up where you left off.");
    assert.equal(text(v.host.querySelector("[data-plan-pick] p")), "Choose a STELLA plan. You'll see the price before you pay.");
    assert.equal(button(v.host, "Re-subscribe"), undefined, "the plans replace the button that could not open a checkout");
    world.calls = [];
    world.answer = async () => ({ status: 200, body: { data: { mode: "checkout", url: "https://checkout.example/c/stella" } } });
    await click(button(v.host, "STELLA Pro"));
    assert.deepEqual(world.calls.map((c) => [c.method, c.path, c.body]), [["POST", "/billing/change", { product: "stella", billing_cycle: "monthly", plan: "pro" }]]);
    assert.deepEqual(world.left, ["https://checkout.example/c/stella"]);
    v.unmount();
  });

  test("STELLA never bought: a real control (its plans), not 'Ask us about STELLA'", async () => {
    reset();
    const v = ui.mount(ui.ProductPlanStatus, { product: "stella", row: null, addTo: null }, { at: "/app/settings/plan-pricing" });
    await settle();
    assert.doesNotMatch(text(v.host), /Ask us about/);
    await click(button(v.host, "Add STELLA to your account"));
    assert.deepEqual(["STELLA Standard", "STELLA Pro", "STELLA Business"].map((l) => !!button(v.host, l)), [true, true, true]);
    v.unmount();
  });

  test("the off notice: 'SPARK is already on.' is said beside the button; plan_page carries its sentence to the plan page", async () => {
    reset({ subs: ENDED_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    world.answer = async () => ({ status: 200, body: { data: { mode: "active", url: null, message: "SPARK is already on." } } });
    await click(button(v.host, "Re-subscribe"));
    assert.equal(text(v.host.querySelector("[data-notice-said]")), "SPARK is already on.");
    assert.equal(where(v.host), "/app/services/spark_contacts", "nothing navigates");
    world.answer = async () => PLAN_PAGE;
    await click(button(v.host, "Re-subscribe"));
    assert.equal(where(v.host), "/app/services/spark_usage");
    assert.equal(stateOf(v.host).planNotice.text, "Choose a SPARK plan to pick up where you left off.");
    v.unmount();
  });

  test("the STELLA off notice: Add STELLA opens Plan & Pricing with STELLA's plans showing", async () => {
    reset({ subs: [] });
    const v = ui.mount(ui.ProductEndedNotice, { product: "stella" }, { at: "/app/services/stella_books" });
    await settle();
    await click(button(v.host, "Add STELLA"));
    assert.equal(where(v.host), "/app/settings/plan-pricing");
    assert.deepEqual(stateOf(v.host), { planNotice: { product: "stella", text: "Choose a STELLA plan. You'll see the price before you pay.", pick: true } });
    v.unmount();
    const there = ui.mount(ui.ProductPlanStatus, { product: "stella", row: null, addTo: null }, { at: "/app/settings/plan-pricing", state: { planNotice: { product: "stella", text: "x", pick: true } } });
    await settle();
    assert.ok(button(there.host, "STELLA Standard"), "the plans are already showing");
    there.unmount();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   P — a product whose payment FAILED (unpaid), on the off surfaces
   (decision (d), 2026-10-08). The sync switched it off, so ProductGate and
   the SPARK menu show the off notice, and the rail shows the lock. Each says
   what the Plan & Pricing card says, "Your last payment didn't go through,
   so SPARK is paused.", with Update card, never "isn't part of your plan
   yet" with "Add SPARK". One reading decides all three: offReasonForRow.
   ══════════════════════════════════════════════════════════════════════════ */
const UNPAID_SENTENCE = "Your last payment didn't go through, so SPARK is paused. Update your card to turn it back on.";
const UNPAID_SPARK = [{ product: "spark", tier: null, status: "unpaid", current_period_end: null, monthly_usd: 0, items: [],
  ended: null, message: UNPAID_SENTENCE, action: "update_card" }];
const NEVER_WORDS = /isn't part of your plan|Add SPARK|Re-subscribe/;

describe("P: an unpaid product, read once for every surface", () => {
  test("offReasonForRow: unpaid carries the API's sentence; ended carries its date; nothing else is 'never'", () => {
    assert.deepEqual(offReasonForRow("spark", UNPAID_SPARK[0]),
      { kind: "held", status: "unpaid", sentence: UNPAID_SENTENCE, action: "update_card" });
    // An older billing API sent no sentence and no action: unpaid still offers
    // Update card, because that screen exists.
    assert.deepEqual(offReasonForRow("oliver", { product: "oliver", status: "unpaid" }),
      { kind: "held", status: "unpaid", action: "update_card",
        sentence: "Your last payment didn't go through, so OLIVER is paused. Update your card to turn it back on." });
    assert.deepEqual(offReasonForRow("spark", ENDED_SPARK[0]), { kind: "ended", at: "2026-11-01T18:00:00Z" });
    assert.deepEqual(offReasonForRow("spark", null), { kind: "never" });
    // an unpaid row beside an older ended record is still unpaid (rowForProduct picks it)
    const bothRows = offReasonForRow("spark", rowForProduct([...ENDED_SPARK, ...UNPAID_SPARK], "spark"));
    assert.equal(bothRows.kind, "held");
    assert.equal(bothRows.status, "unpaid");
  });

  test("the off notice and the Plan & Pricing card say the SAME sentence, with the same control", () => {
    const row = rowForProduct(UNPAID_SPARK, "spark");
    const card = planCardLine("spark", row, TZ);
    const notice = offNotice("spark", offReasonForRow("spark", row), "admin", TZ);
    assert.equal(notice.sentence, card.line);
    assert.equal(notice.sentence, UNPAID_SENTENCE);
    assert.deepEqual(notice.action, { kind: "update_card", label: "Update card" });
    assert.deepEqual(card.control, { kind: "update_card", label: "Update card" });
    assert.doesNotMatch(JSON.stringify(notice), NEVER_WORDS);
  });

  test("the off notice for each viewer: a member and the founder read the sentence and why, never a button", () => {
    const why = offReasonForRow("spark", UNPAID_SPARK[0]);
    const member = offNotice("spark", why, "member", TZ);
    assert.equal(member.action, null);
    assert.equal(member.note, "Ask an admin on your team to update the card.");
    assert.equal(member.note, planCardForViewer("spark", planCardLine("spark", UNPAID_SPARK[0]), "member").note, "the card's own words");
    const founder = offNotice("spark", why, "viewing_client", TZ);
    assert.equal(founder.action, null);
    assert.equal(founder.note, "Switch to your own business to change billing.");
    assert.equal(founder.sentence, UNPAID_SENTENCE);
  });

  test("the rail: PAUSED and the payment words for an unpaid product, never ADD", () => {
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", offReasonForRow("spark", UNPAID_SPARK[0])),
      { badge: "PAUSED", title: "Your last payment didn't go through, so SPARK is paused. Open SPARK to update your card." });
    assert.deepEqual([...offReasons(UNPAID_SPARK)],
      [["spark", { kind: "held", status: "unpaid", sentence: UNPAID_SENTENCE, action: "update_card" }]]);
    const several = [...offReasons([...ENDED_SPARK, { product: "oliver", status: "unpaid" }, { product: "arion", status: "active" }])];
    assert.deepEqual(several.map(([p, why]) => [p, why.kind, why.status ?? null]),
      [["oliver", "held", "unpaid"], ["spark", "ended", null]]);
  });

  test("one source: the card, the notice, the rail's reasons and IconRail all read offReasonForRow / offReasons", () => {
    const lib = read("src/lib/productAccess.ts");
    const fn = (name) => lib.slice(lib.indexOf(`export function ${name}(`), lib.indexOf("\n}\n", lib.indexOf(`export function ${name}(`)));
    assert.match(fn("planCardLine"), /const why = offReasonForRow\(product, row\);/);
    assert.match(fn("offReasons"), /const why = offReasonForRow\(p, row\);/);
    assert.doesNotMatch(fn("planCardLine"), /row\.message|unpaidSentence\(/, "the card does not read the unpaid row on its own");
    const notice = read("src/components/ProductEndedNotice.tsx");
    assert.match(notice, /setWhy\(offReasonForRow\(product, rowForProduct\(r\?\.subscriptions, product\)\)\)/);
    const rail = read("src/components/IconRail.tsx");
    assert.match(rail, /const offWhy = useOffReasons\(FEATURE_GATING_ENABLED && anyGatedLocked, location\.pathname\);/);
    assert.match(rail, /railLockWords\(PRODUCT_SERVICE_KEY\[p\.key\] \|\| p\.key, p\.tagline, p\.label, offWhy\.get\(PRODUCT_SERVICE_KEY\[p\.key\] \|\| ""\) \?\? null\)/);
    assert.match(read("src/hooks/useOffReasons.ts"), /why: offReasons\(r\?\.subscriptions\)/);
    // Update card is ONE action, used by the card and by the notice
    assert.match(read("src/components/ProductPlanStatus.tsx"), /const said = await openUpdateCard\(\{ token, tenantId, product \}\);/);
    assert.match(notice, /const text = await openUpdateCard\(\{ token: t\.accessToken, tenantId: activeTenantId, product \}\);/);
    assert.doesNotMatch(notice + read("src/components/ProductPlanStatus.tsx"), /createPortalSession/, "nobody opens the payment page on their own");
  });
});

describe("P: an unpaid product, rendered and clicked", () => {
  function unpaidGate() {
    reset({ subs: UNPAID_SPARK });
    const base = world.answer;
    world.answer = async (call) => (call.path === "/me/entitlements" ? { status: 200, body: SPARK_OFF } : base(call));
  }
  async function updateCardClick(v) {
    const opened = [];
    const realOpen = window.open;
    window.open = (u) => { opened.push(u); return null; };
    try {
      world.calls = [];
      const base = world.answer;
      world.answer = async (call) => (call.path === "/billing/portal-session"
        ? { status: 200, body: { data: { mode: "portal", url: "https://billing.example/p/spark" } } } : base(call));
      await click(button(v.host, "Update card"));
    } finally { window.open = realOpen; }
    return opened;
  }

  test("ProductGate (Left rail → SPARK → Contacts): the payment sentence and Update card, never 'Add SPARK'", async () => {
    unpaidGate();
    const v = ui.mount(ui.ProductGate, { product: "spark", serviceKey: "spark_contacts", children: PAGE() });
    await settle();
    assert.equal(v.host.querySelector("[data-real-page]"), null, "the page itself is still closed (the sync switched SPARK off)");
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")), UNPAID_SENTENCE);
    assert.equal(button(v.host, "Add SPARK"), undefined);
    assert.equal(button(v.host, "Re-subscribe"), undefined);
    assert.doesNotMatch(text(v.host), NEVER_WORDS);
    const opened = await updateCardClick(v);
    assert.deepEqual(world.calls.filter((c) => c.method === "POST").map((c) => [c.path, c.body]),
      [["/billing/portal-session", { product: "spark", return_url: "http://localhost/app/settings/plan-pricing?refresh=1" }]],
      "the card's own Update card: the payment page for SPARK, back to Plan & Pricing");
    assert.deepEqual(opened, ["https://billing.example/p/spark"]);
    assert.equal(where(v.host), "/app/services/spark_contacts", "Update card never sends them to the plan page to buy again");
    assert.equal(world.calls.filter((c) => /\/billing\/(change|resubscribe)/.test(c.path)).length, 0, "nothing is bought");
    v.unmount();
  });

  test("the SPARK menu notice (SubNav, variant nav): the same sentence and Update card", async () => {
    reset({ subs: UNPAID_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark", variant: "nav" });
    await settle();
    assert.equal(v.host.querySelector('[data-product-ended="spark"]')?.getAttribute("data-variant"), "nav");
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")), UNPAID_SENTENCE);
    assert.doesNotMatch(text(v.host), NEVER_WORDS);
    const opened = await updateCardClick(v);
    assert.deepEqual(world.calls.filter((c) => c.method === "POST").map((c) => c.path), ["/billing/portal-session"]);
    assert.deepEqual(opened, ["https://billing.example/p/spark"]);
    v.unmount();
  });

  test("no payment page to open: its sentence is said beside the button", async () => {
    reset({ subs: UNPAID_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    world.answer = async (call) => (call.path === "/billing/portal-session"
      ? { status: 200, body: { data: { mode: "owner", message: "There is no card to update on this account." } } } : { status: 200, body: { data: {} } });
    await click(button(v.host, "Update card"));
    assert.equal(text(v.host.querySelector("[data-notice-said]")), "There is no card to update on this account.");
    v.unmount();
  });

  test("a team member: the sentence and 'Ask an admin on your team to update the card.', no button", async () => {
    reset({ role: "user", subs: UNPAID_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(v.host.querySelectorAll("button").length, 0);
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")), UNPAID_SENTENCE);
    assert.equal(text(v.host.querySelector("[data-notice-note]")), "Ask an admin on your team to update the card.");
    v.unmount();
  });

  test("the founder viewing a client: the sentence and 'Switch to your own business to change billing.'", async () => {
    reset({ founderViewing: true, subs: UNPAID_SPARK });
    const v = ui.mount(ui.ProductEndedNotice, { product: "spark" });
    await settle();
    assert.equal(v.host.querySelectorAll("button").length, 0);
    assert.equal(text(v.host.querySelector("[data-notice-sentence]")), UNPAID_SENTENCE);
    assert.equal(text(v.host.querySelector("[data-notice-note]")), "Switch to your own business to change billing.");
    v.unmount();
  });

  test("the rail's reading (the real useOffReasons hook): SPARK unpaid gives PAUSED and the payment words", async () => {
    reset({ subs: UNPAID_SPARK });
    const v = ui.mount(ui.RailProbe, { product: "spark" });
    await settle();
    const probe = v.host.querySelector("[data-rail-probe]");
    assert.equal(probe?.getAttribute("data-badge"), "PAUSED");
    assert.equal(probe?.getAttribute("title"), "Your last payment didn't go through, so SPARK is paused. Open SPARK to update your card.");
    v.unmount();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Q: the other two HELD-but-not-paid states (open minor, 2026-10-08 11:15Z)

   GET /billing/subscriptions used to list only live and UNPAID rows, so a
   product an INCOMPLETE or PAUSED subscription held fell through to "Not
   subscribed" + "Add <PRODUCT>". Pressing Add was refused with the right
   sentence and nobody was double-charged, but the words on the card, the
   product's own pages, its menu and the rail were all wrong.
   ══════════════════════════════════════════════════════════════════════════ */

const INCOMPLETE_SENTENCE = "Your first payment for SPARK hasn't gone through yet, so SPARK is switched off. Check your email from us to finish it.";
const PAUSED_SENTENCE = "SPARK is paused, so it's switched off. Contact us and we'll turn it back on.";
const heldRow = (status, message) => ({
  product: "spark", tier: null, status, current_period_end: null, monthly_usd: 0, items: [],
  ended: null, message, action: null, subscription_id: "sub_h",
});

describe("Q: an incomplete or paused subscription still holds the product", () => {
  test("rowForProduct keeps a held row (it used to be dropped, which is what said 'Add SPARK')", () => {
    for (const status of ["unpaid", "incomplete", "paused"]) {
      const row = rowForProduct([heldRow(status, "x")], "spark");
      assert.ok(row, `${status} must survive rowForProduct`);
      assert.equal(row.status, status);
    }
    // A live row still wins, and an ended record is still last.
    assert.equal(rowForProduct([heldRow("paused", "x"), { product: "spark", status: "active" }], "spark").status, "active");
    // Two held rows: the billing API's HELD_NOT_PAID order (unpaid first), so
    // the card names the same subscription the refusal does.
    assert.equal(rowForProduct([heldRow("paused", "p"), heldRow("unpaid", "u")], "spark").message, "u");
  });

  test("the API's sentence is the one said, and each state has its own fallback", () => {
    assert.deepEqual(offReasonForRow("spark", heldRow("incomplete", INCOMPLETE_SENTENCE)),
      { kind: "held", status: "incomplete", sentence: INCOMPLETE_SENTENCE, action: null });
    assert.deepEqual(offReasonForRow("spark", heldRow("paused", PAUSED_SENTENCE)),
      { kind: "held", status: "paused", sentence: PAUSED_SENTENCE, action: null });
    // No sentence from the API (an older oliver-api): the Portal's own words,
    // which say the same thing.
    assert.equal(offReasonForRow("spark", { product: "spark", status: "incomplete" }).sentence, INCOMPLETE_SENTENCE);
    assert.equal(offReasonForRow("spark", { product: "spark", status: "paused" }).sentence, PAUSED_SENTENCE);
  });

  test("neither sentence promises Update card, because nothing of ours resumes or finishes one", () => {
    for (const sentence of [INCOMPLETE_SENTENCE, PAUSED_SENTENCE]) {
      assert.doesNotMatch(sentence, /update (your )?card/i);
      assert.doesNotMatch(sentence, NEVER_WORDS);
    }
    assert.match(UNPAID_SENTENCE, /Update your card/);
  });

  test("the card: its own badge state, its own sentence, and NO control", () => {
    for (const [status, sentence, state] of [
      ["incomplete", INCOMPLETE_SENTENCE, "payment_incomplete"],
      ["paused", PAUSED_SENTENCE, "paused"],
    ]) {
      const card = planCardLine("spark", rowForProduct([heldRow(status, sentence)], "spark"), TZ);
      assert.equal(card.state, state);
      assert.equal(card.line, sentence);
      assert.equal(card.control, null, "no button that cannot do anything");
      assert.equal(card.canRemove, false);
      assert.doesNotMatch(JSON.stringify(card), NEVER_WORDS);
      assert.notEqual(card.state, "never", 'never == "Not subscribed" + Add');
    }
    // UNPAID is unchanged: a failed payment keeps its red badge and its button.
    const unpaid = planCardLine("spark", UNPAID_SPARK[0], TZ);
    assert.equal(unpaid.state, "past_due");
    assert.deepEqual(unpaid.control, { kind: "update_card", label: "Update card" });
  });

  test("Payment pending and Paused are real badges on the Plan & Pricing card", () => {
    const page = read("src/pages/settings/TenantSettings.tsx");
    assert.match(page, /payment_incomplete: \{ text: "Payment pending"/);
    assert.match(page, /paused: \{ text: "Paused"/);
    // The line is not grey as if nothing were wrong.
    assert.match(read("src/components/ProductPlanStatus.tsx"),
      /card\.state === 'payment_incomplete' \|\| card\.state === 'paused' \? 'text-amber-700'/);
  });

  test("the off notice on the product's pages and menu: the sentence alone, for every viewer", () => {
    for (const [status, sentence] of [["incomplete", INCOMPLETE_SENTENCE], ["paused", PAUSED_SENTENCE]]) {
      const why = offReasonForRow("spark", heldRow(status, sentence));
      for (const viewer of ["admin", "member", "viewing_client"]) {
        const n = offNotice("spark", why, viewer, TZ);
        assert.equal(n.sentence, sentence);
        assert.equal(n.action, null, `${viewer} is offered no control for ${status}`);
        assert.equal(n.note, null, "and is not told to ask an admin for something nobody can do");
        assert.doesNotMatch(JSON.stringify(n), NEVER_WORDS);
      }
      // The card and the notice still say ONE sentence.
      assert.equal(offNotice("spark", why, "admin", TZ).sentence,
        planCardLine("spark", rowForProduct([heldRow(status, sentence)], "spark"), TZ).line);
    }
  });

  test("the rail: its own badge and title, never ADD", () => {
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", offReasonForRow("spark", heldRow("incomplete", INCOMPLETE_SENTENCE))),
      { badge: "PENDING", title: "Your first payment for SPARK hasn't gone through yet. Open SPARK to see what to do." });
    assert.deepEqual(railLockWords("spark", "SPARK", "Marketing", offReasonForRow("spark", heldRow("paused", PAUSED_SENTENCE))),
      { badge: "PAUSED", title: "SPARK is paused. Open SPARK to see what to do." });
    for (const status of ["incomplete", "paused"]) {
      const [[key, why]] = [...offReasons([heldRow(status, "x")])];
      assert.equal(key, "spark");
      assert.equal(why.kind, "held");
      assert.equal(why.status, status);
    }
  });
});
