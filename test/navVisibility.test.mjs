// test/navVisibility.test.mjs — the feature wall (components/navVisibility).
//
// Since 11 Oct 2026 the wall states no tier: it reads platform-api's catalog
// answer (features[key] on /me/entitlements). The SEO add-on, its rungs, the
// My Brand tier and every product tier are decided THERE (platform-api
// lib/featureCatalog.js decideFeature, tested in that repo); this file pins
// what the Portal does with each answer, using the entries platform-api sends
// for the cases the old rules covered (Phase B1: "SEO items locked without the
// add-on; Market Monitor locked below Authority; undecided shows everything +
// logs").
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isVisible, isRoutable, isEntitled, requirementLabel, featureState, featureContext,
} from "../src/components/navVisibility.ts";

// Undecided answers log once per product for the life of the process, so the
// test that asserts the log runs first and uses a product nothing else uses.
const logged = [];
const realWarn = console.warn;
const realError = console.error;
beforeEach(() => {
  logged.length = 0;
  console.warn = (...a) => logged.push(a.join(" "));
  console.error = (...a) => logged.push(a.join(" "));
});
afterEach(() => { console.warn = realWarn; console.error = realError; });

const entry = (over = {}) => ({
  allowed: true, reason: "", needs: null, product: "arion", min_tier: null,
  addon: null, addon_min_tier: null, kind: "page", availability: "live", ...over,
});
const ctxOf = (features) => ({ features });

// What platform-api answers for Market Monitor (SEO add-on, Authority rung).
const MARKET_MONITOR = {
  authority: entry({ addon: "seo", addon_min_tier: "authority" }),
  growth: entry({ addon: "seo", addon_min_tier: "authority", allowed: false, needs: "the ARION SEO add-on (Authority)" }),
  none: entry({ addon: "seo", addon_min_tier: "authority", allowed: false, needs: "the ARION SEO add-on (Authority)" }),
  unknownRung: entry({ addon: "seo", addon_min_tier: "authority", allowed: null, needs: "the ARION SEO add-on (Authority)", product: "arion_probe" }),
};

describe("undecided logs (first: the warning is one-shot per product)", () => {
  test("an undecided SEO rung -> visible AND a [navVisibility] log line", () => {
    const ctx = ctxOf({ arion_seo_market_monitor: MARKET_MONITOR.unknownRung });
    assert.equal(isVisible({ key: "arion_seo_market_monitor" }, ctx), true);
    assert.ok(logged.some((l) => l.includes("[navVisibility]") && l.includes("undecided allows a read")),
      `expected the undecided log, got ${JSON.stringify(logged)}`);
  });
});

describe("Market Monitor — the SEO add-on's Authority rung, as platform-api answers it", () => {
  test("Authority -> visible + routable", () => {
    const ctx = ctxOf({ arion_seo_market_monitor: MARKET_MONITOR.authority });
    assert.equal(isVisible({ key: "arion_seo_market_monitor" }, ctx), true);
    assert.equal(isRoutable("arion_seo_market_monitor", ctx), true);
  });
  for (const why of ["growth", "none"]) {
    test(`${why} -> locked, menu and route, labelled with the rung`, () => {
      const ctx = ctxOf({ arion_seo_market_monitor: MARKET_MONITOR[why] });
      assert.equal(isVisible({ key: "arion_seo_market_monitor" }, ctx), false);
      assert.equal(isRoutable("arion_seo_market_monitor", ctx), false);
      assert.equal(requirementLabel("arion_seo_market_monitor", ctx), "the ARION SEO add-on (Authority)");
    });
  }
  test("a lower rung still opens the plain SEO rows (each row is its own answer)", () => {
    const ctx = ctxOf({
      arion_seo_market_monitor: MARKET_MONITOR.growth,
      arion_seo_keywords: entry({ addon: "seo" }),
    });
    assert.equal(isVisible({ key: "arion_seo_keywords" }, ctx), true);
    assert.equal(isVisible({ key: "arion_seo_market_monitor" }, ctx), false);
  });
});

describe("tiers — whatever product, the answer decides", () => {
  test("ARION Lite: a Pro row is locked and says ARION Pro; Pro opens it", () => {
    const lite = ctxOf({ arion_business_reviews: entry({ min_tier: "pro", allowed: false, needs: "ARION Pro" }) });
    const pro = ctxOf({ arion_business_reviews: entry({ min_tier: "pro" }) });
    assert.equal(isEntitled("arion_business_reviews", lite), false);
    assert.equal(requirementLabel("arion_business_reviews", lite), "ARION Pro");
    assert.equal(isEntitled("arion_business_reviews", pro), true);
  });
  test("OLIVER Invoicing: the jobs rows say OLIVER Standard", () => {
    const ctx = ctxOf({ oliver_job_board: entry({ product: "oliver", min_tier: "standard", allowed: false, needs: "OLIVER Standard" }) });
    assert.equal(isVisible({ key: "oliver_job_board" }, ctx), false);
    assert.equal(requirementLabel("oliver_job_board", ctx), "OLIVER Standard");
  });
  test("My Brand names both ways to Standard (the catalog's words, not a Portal rule)", () => {
    const ctx = ctxOf({ my_brand_image_studio: entry({ product: "my_brand", min_tier: "standard", allowed: false, needs: "ARION Standard or SPARK" }) });
    assert.equal(requirementLabel("my_brand_image_studio", ctx), "ARION Standard or SPARK");
  });
  test("ARION Lite + SPARK: platform-api answers My Brand allowed, and the Portal opens it", () => {
    const ctx = ctxOf({ my_brand_image_studio: entry({ product: "my_brand", min_tier: "standard" }) });
    assert.equal(isRoutable("my_brand_image_studio", ctx), true);
  });
});

describe("the menu and the route judge the plan with the SAME function", () => {
  for (const allowed of [true, false, null]) {
    test(`allowed ${allowed}`, () => {
      const ctx = ctxOf({ spark_segments: entry({ product: "spark", allowed, needs: allowed ? null : "SPARK Pro" }) });
      assert.equal(isVisible({ key: "spark_segments" }, ctx), isEntitled("spark_segments", ctx));
      assert.equal(isRoutable("spark_segments", ctx), isEntitled("spark_segments", ctx));
    });
  }
  test("merged: out of the menu, routable when the plan includes it", () => {
    const ctx = ctxOf({ spark_tags: entry({ product: "spark" }) });
    assert.equal(isVisible({ key: "spark_tags", merged: true }, ctx), false);
    assert.equal(isRoutable("spark_tags", ctx), true);
  });
  test("hidden: never in the menu, never routable", () => {
    const ctx = ctxOf({ spark_secrets: entry({ product: "spark", availability: "hidden" }) });
    assert.equal(featureState("spark_secrets", ctx), "hidden");
    assert.equal(isVisible({ key: "spark_secrets" }, ctx), false);
    assert.equal(isRoutable("spark_secrets", ctx), false);
  });
});

describe("featureContext — one /me/entitlements answer feeds the menu and the page", () => {
  test("no payload, no features: undecided (open)", () => {
    assert.deepEqual(featureContext(null), { features: null, products: null });
    assert.equal(isEntitled("spark_segments", featureContext(null)), true);
  });
  test("the founder's own business is open BY THE ANSWER (platform-api: agency = owned, business), never a bypass", () => {
    const agency = {
      tenant_id: "ia", resolved_at: "x", decided: true, addons: {}, limits: {},
      products: { spark: { owned: true, tier: "business", decided: true } },
      features: { spark_ai_writer: entry({ product: "spark", min_tier: "business" }) },
    };
    assert.equal(isEntitled("spark_ai_writer", featureContext(agency)), true);
    const client = { ...agency, features: { spark_ai_writer: entry({ product: "spark", min_tier: "business", allowed: false, needs: "SPARK Business" }) } };
    assert.equal(isEntitled("spark_ai_writer", featureContext(client)), false, "viewing a client shows the client's plan");
  });
});
