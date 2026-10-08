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
import {
  productSwitchedOff, productLockedOnRail, gateExemptServiceKey, planPagePath,
  endedSentence, neverBoughtSentence, offNotice, planCardLine, removeConfirmSentence,
  billingRefusalSentence, rowForProduct, rowIsLive,
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

  test("ServiceRouter closes the product BEFORE the tier check, on the decided answer, and exempts the plan page", () => {
    const src = read("src/pages/ServiceRouter.tsx");
    const body = src.slice(src.indexOf("export function ServiceRouter()"));
    const gate = body.indexOf("return <ProductEndedNotice product={product} />");
    const tierBranch = body.indexOf("if (!locked || !service) return <ServiceRouterInner />");
    assert.ok(gate > 0, "the gate renders ProductEndedNotice");
    assert.ok(tierBranch > gate, "the product gate runs before the tier check");
    const cond = body.slice(body.indexOf("const { isOff } = useProductAccess(serviceKey);"), gate);
    assert.match(cond, /isOffGatedProduct\(product\)/);
    assert.match(cond, /!gateExemptServiceKey\(serviceKey\)/);
    assert.match(cond, /isOff\(product\)/);
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
    const ended = { at: "2026-11-01T12:00:00Z" };
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

    const ended = planCardLine("spark", { product: "spark", tier: null, status: "canceled", ended: { at: end, tier: "standard" } }, TZ);
    assert.equal(ended.line, "Your SPARK subscription ended on November 1, 2026. Re-subscribe to pick up where you left off.");
    assert.deepEqual(ended.control, { kind: "resubscribe", label: "Re-subscribe" });

    const setUpByUs = planCardLine("spark", { product: "spark", tier: "business", status: "active", current_period_end: null, source: "entitlement" }, TZ);
    assert.deepEqual(setUpByUs, { state: "active", line: null, control: null, canRemove: false },
      "a product on in our records with no paid subscription has nothing to renew and nothing to remove");

    const never = planCardLine("spark", null, TZ);
    assert.equal(never.line, "Not subscribed");
    assert.deepEqual(never.control, { kind: "add", label: "Add SPARK to your account" });
  });
  test("past_due still counts as paid for (§1.3): it is live, never 'ended'", () => {
    assert.equal(rowIsLive({ product: "spark", status: "past_due" }), true);
    assert.equal(rowIsLive({ product: "spark", status: "unpaid" }), false);
    const rows = [
      { product: "spark", status: "canceled", ended: { at: "2026-10-01T00:00:00Z" } },
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
      "src/components/PendingChangeBanner.tsx"];
    for (const f of files) {
      const code = strip(read(f));
      const strings = [...code.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]).filter((t) => /\s/.test(t) && /[A-Za-z]{3}/.test(t));
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
        import { clearSubscriptionsCache } from "./src/lib/billingApi.ts";
        export { act, clearSubscriptionsCache, ProductEndedNotice, ProductPlanStatus };
        const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
        function Where() { const l = useLocation(); return createElement("output", { "data-where": l.pathname }); }
        export function mount(C, props) {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const root = createRoot(host);
          const tree = () => createElement(MemoryRouter, { future: FUTURE, initialEntries: ["/app/services/spark_contacts"] },
            createElement(Where), createElement(C, props));
          act(() => { root.render(tree()); });
          return { host, unmount: () => act(() => root.unmount()) };
        }
      `,
      resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
    },
    bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env": JSON.stringify({ VITE_OLIVER_API_BASE: "http://oliver.test" }),
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
  world.answer = async (call) => {
    if (call.method === "GET" && call.path === "/billing/subscriptions") {
      return { status: 200, body: { data: { subscriptions: subs, hasAnySubscription: subs.length > 0, customerId: "cus_1", owner: false } } };
    }
    return { status: 200, body: { data: {} } };
  };
}
const ENDED_SPARK = [{ product: "spark", tier: null, status: "canceled", current_period_end: null, monthly_usd: 0, items: [],
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
