// test/navVisibility.test.mjs — the product feature wall (components/navVisibility).
//
// Phase B1 (PRICING_REWORK_PHASE_B_SCOPE_2026-08-21 §B1.5): "SEO items hidden
// without the add-on; Market Monitor hidden below Authority; no-tier row shows
// everything + logs". Every expectation below is the rule an ARION / OLIVER /
// SPARK customer actually hits through SubNav + ServiceRouter.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isVisible, isRoutable, requirementLabel, isGatedProduct, ADDON_LABELS,
} from "../src/components/navVisibility.ts";
import { tierMeets } from "../src/lib/tierRank.ts";

// warnFailOpen logs ONCE per rule for the life of the process, so the tests
// that assert the log run first (node:test runs a file's tests in order) and
// assert PRESENCE — "allow + log" means the log must actually appear.
const logged = [];
const realError = console.error;
beforeEach(() => { logged.length = 0; console.error = (...a) => logged.push(a.join(" ")); });
afterEach(() => { console.error = realError; });

const ctx = (over = {}) => ({ tier: "business", addons: ["seo"], seoAddonTier: "authority", gatingActive: true, ...over });

const MARKET_MONITOR = { addon: "seo", addonTier: "authority" };
const SEO_KEYWORDS = { addon: "seo" };

describe("fail open logs (first — the warning is one-shot per rule)", () => {
  test("unresolved SEO rung → visible AND a [navVisibility] fail-open line", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: null })), true);
    assert.ok(
      logged.some((l) => l.includes("[navVisibility]") && l.includes('add-on "seo" tier') && l.includes("fail open")),
      `expected the SEO-rung fail-open log, got: ${JSON.stringify(logged)}`,
    );
  });
  test("unresolved subscription tier → visible AND logs", () => {
    assert.equal(isVisible({ minTier: "business" }, ctx({ tier: null })), true);
    assert.ok(logged.some((l) => l.includes("subscription tier") && l.includes("fail open")));
  });
  test("unresolved add-on ownership → visible AND logs", () => {
    assert.equal(isVisible(SEO_KEYWORDS, ctx({ addons: null })), true);
    assert.ok(logged.some((l) => l.includes('add-on "seo"') && l.includes("fail open")));
  });
});

describe("addonTier — Market Monitor is SEO Authority only", () => {
  test("Authority rung → visible + routable", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx()), true);
    assert.equal(isRoutable(MARKET_MONITOR, ctx()), true);
  });

  for (const rung of ["starter", "essentials", "growth"]) {
    test(`${rung} rung (positively resolved, below Authority) → hidden + not routable`, () => {
      assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: rung })), false);
      assert.equal(isRoutable(MARKET_MONITOR, ctx({ seoAddonTier: rung })), false);
    });
  }

  test("rung compares case-insensitively (DB may carry 'AUTHORITY')", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: "AUTHORITY" })), true);
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: "Growth" })), false);
  });

  test("a lower rung still sees the plain SEO rows (addonTier never leaks onto them)", () => {
    assert.equal(isVisible(SEO_KEYWORDS, ctx({ seoAddonTier: "starter" })), true);
    assert.equal(isRoutable(SEO_KEYWORDS, ctx({ seoAddonTier: "starter" })), true);
  });

  test("FAIL OPEN: add-on owned but rung unresolved (null/undefined) → visible", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: null })), true);
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: undefined })), true);
    assert.equal(isRoutable(MARKET_MONITOR, ctx({ seoAddonTier: undefined })), true);
  });

  test("FAIL OPEN: an unrecognised rung is unresolved, not 'below'", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ seoAddonTier: "platinum" })), true);
  });

  test("add-on NOT owned (positively resolved) → hidden regardless of rung", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ addons: [], seoAddonTier: "authority" })), false);
    assert.equal(isVisible(SEO_KEYWORDS, ctx({ addons: [] })), false);
    assert.equal(isRoutable(SEO_KEYWORDS, ctx({ addons: [] })), false);
  });

  test("add-on ownership unresolved (addons null) → visible (fail open)", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ addons: null, seoAddonTier: null })), true);
    assert.equal(isVisible(SEO_KEYWORDS, ctx({ addons: null })), true);
  });

  test("non-gated product ignores add-on + rung entirely", () => {
    assert.equal(isVisible(MARKET_MONITOR, ctx({ gatingActive: false, addons: [], seoAddonTier: "starter" })), true);
  });

  test("addonTier without addon:'seo' is inert (only the SEO ladder has rungs)", () => {
    assert.equal(isVisible({ addon: "leadgen", addonTier: "authority" }, ctx({ addons: ["leadgen"], seoAddonTier: "starter" })), true);
  });
});

describe("minTier — subscription tier wall", () => {
  test("ARION Lite hides a Pro surface; Pro and Business see it", () => {
    const gbp = { minTier: "pro" };
    assert.equal(isVisible(gbp, ctx({ tier: "lite" })), false);
    assert.equal(isVisible(gbp, ctx({ tier: "standard" })), false);
    assert.equal(isVisible(gbp, ctx({ tier: "pro" })), true);
    assert.equal(isVisible(gbp, ctx({ tier: "business" })), true);
  });

  test("OLIVER Invoicing (lite) hides Standard+ rows (jobs)", () => {
    assert.equal(isVisible({ minTier: "standard" }, ctx({ tier: "lite" })), false);
    assert.equal(isVisible({ minTier: "standard" }, ctx({ tier: "standard" })), true);
  });

  test("FAIL OPEN: no tier row (null) shows everything", () => {
    assert.equal(isVisible({ minTier: "business" }, ctx({ tier: null })), true);
    assert.equal(isRoutable({ minTier: "business" }, ctx({ tier: null })), true);
  });

  test("legacy 'active' tier counts as Standard", () => {
    assert.equal(isVisible({ minTier: "standard" }, ctx({ tier: "active" })), true);
    assert.equal(isVisible({ minTier: "pro" }, ctx({ tier: "active" })), false);
  });
});

describe("hidden / merged / undeclared", () => {
  test("hidden → never in the menu, never routable", () => {
    assert.equal(isVisible({ hidden: true }, ctx()), false);
    assert.equal(isRoutable({ hidden: true }, ctx()), false);
  });
  test("merged → not in the menu, but routable from its new parent", () => {
    assert.equal(isVisible({ merged: true }, ctx()), false);
    assert.equal(isRoutable({ merged: true }, ctx()), true);
  });
  test("undeclared item is visible (adding a nav row never hides it)", () => {
    assert.equal(isVisible(undefined, ctx({ tier: "lite", addons: [] })), true);
    assert.equal(isRoutable(undefined, ctx({ tier: "lite", addons: [] })), true);
  });
});

describe("requirementLabel — menu tooltip and FeatureLocked agree", () => {
  test("addonTier names the rung", () => {
    assert.equal(requirementLabel(MARKET_MONITOR, "arion"), "the ARION SEO Authority add-on");
    assert.equal(requirementLabel({ addon: "seo", addonTier: "growth" }, "arion"), "the ARION SEO Growth add-on");
  });
  test("plain SEO add-on keeps the generic label", () => {
    assert.equal(requirementLabel(SEO_KEYWORDS, "arion"), ADDON_LABELS.seo);
    assert.equal(requirementLabel(SEO_KEYWORDS, "arion"), "the ARION SEO add-on");
  });
  test("minTier → '<BRAND> <Tier>'", () => {
    assert.equal(requirementLabel({ minTier: "standard" }, "oliver"), "OLIVER Standard");
    assert.equal(requirementLabel({ minTier: "pro" }, "arion"), "ARION Pro");
  });
  test("no rules → generic", () => {
    assert.equal(requirementLabel(undefined, "spark"), "a higher plan");
  });
});

describe("gated products + tier ladder", () => {
  test("spark / oliver / arion are gated; stella / settings are not", () => {
    assert.equal(isGatedProduct("spark"), true);
    assert.equal(isGatedProduct("oliver"), true);
    assert.equal(isGatedProduct("arion"), true);
    assert.equal(isGatedProduct("stella"), false);
    assert.equal(isGatedProduct(undefined), false);
  });
  test("tierMeets ladder lite < standard = active < pro < business", () => {
    assert.equal(tierMeets("business", "pro"), true);
    assert.equal(tierMeets("pro", "business"), false);
    assert.equal(tierMeets("active", "standard"), true);
    assert.equal(tierMeets(null, "standard"), false);
  });
});
