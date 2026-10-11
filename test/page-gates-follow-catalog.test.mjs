// test/page-gates-follow-catalog.test.mjs — the gates INSIDE a page read the
// one feature list too.
//
// Brandon, 11 Oct 2026: "I would think we have a feature list and then a
// subscription tier list and those are synced up." test/nav-keys-in-catalog
// covers the menu and the page wall. This file covers what that pass left:
// the in-page locks (My Brand studio and social, the ARION analytics /
// business / hosting / SEO sections, OLIVER locations, portals and
// automations, the SPARK suggestions tab, the STELLA plan badges) and the
// API refusal every client reads. Each block goes red if a page states a
// tier of its own again:
//   1. the rule RUNS: featureAllows (read opens on undecided, a send / spend
//      holds, a decided false refuses), the same rule platform-api exports;
//   2. a refusal from any API is read once (lib/planRefusal), with the
//      catalog's `needs`, and no client fills in a tier;
//   3. the plan badge the menu shows is the catalog's min_tier;
//   4. the cards render the catalog's `needs` (real components, rendered);
//   5. every key an in-page gate names is a catalog key;
//   6. the old in-page tier maps stay deleted.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { featureAllows, featureNeeds } from "../src/lib/entitlements.ts";
import {
  planRefusalFromBody, planRefusalFromText, planRefusalSentence, planRefusalNeeds, isHeldSend, errorCodeOf,
} from "../src/lib/planRefusal.ts";
import { planBadgeLabel, planBadgeTitle } from "../src/components/navVisibility.ts";
import { MyBrandUpgradeGate } from "../src/components/MyBrandUpgradeGate.tsx";
import { OliverUpgradeGate } from "../src/components/OliverUpgradeGate.tsx";
import { LockedIntelligenceCard } from "../src/components/iainsights/LockedIntelligenceCard.tsx";
import { doorRefusalWords } from "../src/components/argus/team/doors.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const FIXTURE = JSON.parse(read("test/fixtures/feature-keys.json"));
const KEYS = new Set(Array.isArray(FIXTURE) ? FIXTURE : FIXTURE.keys);

/** One entry exactly as platform-api featuresFor() shapes it. */
const entry = (over = {}) => ({
  allowed: true, reason: "", needs: null, product: "my_brand", min_tier: null,
  addon: null, addon_min_tier: null, kind: "action", availability: "live", ...over,
});

describe("1. the in-page rule runs on the catalog answer", () => {
  const features = {
    yes: entry(),
    no: entry({ allowed: false, needs: "ARION Pro", min_tier: "pro" }),
    unknown: entry({ allowed: null, needs: "ARION Pro" }),
  };
  test("allowed false refuses every intent, and names what to buy", () => {
    for (const intent of ["read", "write", "send", "spend", "job", "cross_write"]) {
      assert.equal(featureAllows(features, "no", intent), false, intent);
    }
    assert.equal(featureNeeds(features, "no"), "ARION Pro");
  });
  test("allowed null: a read or write runs (a paying business is never locked out), a send / spend / job holds", () => {
    assert.equal(featureAllows(features, "unknown"), true, "read is the default intent");
    assert.equal(featureAllows(features, "unknown", "write"), true);
    for (const intent of ["send", "spend", "job", "cross_write"]) {
      assert.equal(featureAllows(features, "unknown", intent), false, intent);
    }
  });
  test("allowed true runs every intent", () => {
    for (const intent of ["read", "write", "send", "spend", "job"]) assert.equal(featureAllows(features, "yes", intent), true, intent);
    assert.equal(featureNeeds(features, "yes"), null);
  });
  test("a key missing from the answer, or no answer at all: a read runs, a spend holds", () => {
    assert.equal(featureAllows(features, "not_in_catalog"), true);
    assert.equal(featureAllows(features, "not_in_catalog", "spend"), false);
    assert.equal(featureAllows(null, "my_brand_bg_remove"), true);
    assert.equal(featureAllows(null, "my_brand_bg_remove", "spend"), false);
    assert.equal(featureNeeds(null, "x"), null);
  });
});

describe("2. one reader for a plan refusal from any API", () => {
  test("feature_not_in_plan carries the catalog key, needs and the API's sentence", () => {
    const r = planRefusalFromBody({ error: "feature_not_in_plan", feature: "spark_segments", needs: "SPARK Pro", message: "Not in your plan. This needs SPARK Pro." });
    assert.equal(r.type, "tier_gate");
    assert.equal(r.feature, "spark_segments");
    assert.equal(r.needs, "SPARK Pro");
    assert.equal(planRefusalSentence(r), "Not in your plan. This needs SPARK Pro.");
    assert.equal(planRefusalNeeds(r), "SPARK Pro");
    assert.equal(r.tierRequired, "", "no tier is filled in");
  });
  test("the older shapes still read, with the API's tier verbatim and never a default", () => {
    assert.equal(planRefusalFromBody({ error: "tier_upgrade_required", requiredTier: "business" }).tierRequired, "business");
    assert.equal(planRefusalFromBody({ error: "feature_not_available", details: { required_tier: "pro" } }).tierRequired, "pro");
    const bare = planRefusalFromBody({ error: "tier_required" });
    assert.equal(bare.tierRequired, "", "the clients used to default this to \"pro\"");
    assert.equal(planRefusalNeeds(bare), "a higher plan");
    assert.equal(planRefusalSentence(bare), "Not in your plan.");
  });
  test("anything else is not a refusal; a held send is told apart", () => {
    assert.equal(planRefusalFromBody({ error: "validation_failed" }), null);
    assert.equal(planRefusalFromBody(null), null);
    assert.equal(planRefusalFromText("not json"), null);
    assert.equal(errorCodeOf({ error: { code: "SEO_ADDON_REQUIRED" } }), "SEO_ADDON_REQUIRED");
    assert.equal(isHeldSend(503, { error: "subscription_undecided" }), true, "LUMEN's hold");
    assert.equal(isHeldSend(503, { error: "plan_not_confirmed" }), true, "arion-api's hold");
    assert.equal(isHeldSend(403, { error: "subscription_undecided" }), false);
  });
  test("every API client reads the refusal through it, and none fills in a tier", () => {
    for (const f of ["lumenApi", "sparkApi", "oliverApi", "stellaApi"]) {
      const src = read(`src/lib/${f}.ts`);
      assert.match(src, /planRefusalFromBody\(/, `${f} reads the catalog refusal`);
      assert.doesNotMatch(src, /\|\| "pro"|\|\| "standard"/, `${f} defaults a tier`);
    }
    assert.match(read("src/lib/arionApi.ts"), /if \(refusal\) msg = planRefusalSentence\(refusal\);/);
  });
  test("an ARGUS door refused with feature_not_in_plan says the job's plan sentence", () => {
    const words = doorRefusalWords({ body: { error: "feature_not_in_plan" } }, { available: { ok: false, decided: true, words: "Comes with OLIVER Pro." } });
    assert.equal(words, "Comes with OLIVER Pro.");
  });
});

describe("3. the plan badge is the catalog's min_tier", () => {
  test("the menu's abbreviations, read from the answer; no answer, no badge", () => {
    const ctx = { features: { a: entry({ min_tier: "standard" }), b: entry({ min_tier: "pro" }), c: entry({ min_tier: null }) } };
    assert.equal(planBadgeLabel("a", ctx), "S");
    assert.equal(planBadgeLabel("b", ctx), "Pro");
    assert.equal(planBadgeLabel("c", ctx), null, "every plan of the product: no badge");
    assert.equal(planBadgeLabel("a", { features: null }), null);
    assert.equal(planBadgeTitle("b", ctx), "Comes with the Pro plan");
  });
  test("STELLA's menu rows ask for the badge and write no letter of their own", () => {
    const nav = read("src/components/SubNav.tsx");
    assert.doesNotMatch(nav, /tag: \{ label: "(S|Pro|Business|Standard)"/);
    assert.equal((nav.match(/planBadge: STELLA_TAG/g) || []).length, 16);
    assert.match(nav, /\{planBadgeLabel\(item\.key, visCtx\)\}/);
    assert.doesNotMatch(nav, /gated: true|item\.gated/, "the static padlock that ignored the plan is gone");
  });
});

describe("4. the cards say the catalog's needs (rendered)", () => {
  const quiet = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };
  test("My Brand: 'Not in your plan. This needs …', no tier word of its own", () => {
    const html = quiet(() => renderToStaticMarkup(h(MyBrandUpgradeGate, { featureName: "Template Studio", needs: "ARION Standard or SPARK" })));
    assert.match(html, /Not in your plan\. This needs <span[^>]*>ARION Standard or SPARK<\/span>/);
    assert.match(html, /Upgrade to ARION Standard or SPARK/);
    assert.doesNotMatch(html, /You are currently on|-tier/);
  });
  test("OLIVER / SPARK refusal card: the refusal's needs, else the older tier, else 'a higher plan'", () => {
    const withNeeds = renderToStaticMarkup(h(OliverUpgradeGate, { featureName: "Segments", needs: "SPARK Pro", tierRequired: "", currentTier: "" }));
    assert.match(withNeeds, /This needs <span[^>]*>SPARK Pro<\/span>/);
    assert.doesNotMatch(withNeeds, /You are currently on/);
    const older = renderToStaticMarkup(h(OliverUpgradeGate, { featureName: "Dispatch", tierRequired: "business", currentTier: "standard" }));
    assert.match(older, /This needs <span[^>]*>Business<\/span>/);
    const none = renderToStaticMarkup(h(OliverUpgradeGate, { featureName: "X", tierRequired: "", currentTier: "" }));
    assert.match(none, /a higher plan/);
  });
  test("Intelligence locked card: 'Requires <needs>'", () => {
    const html = quiet(() => renderToStaticMarkup(h(MemoryRouter, null, h(LockedIntelligenceCard, { name: "Churn Risk", description: "d", needs: "SPARK Pro", lockReason: "r" }))));
    assert.match(html, /Requires SPARK Pro/);
    assert.match(html, /Upgrade to SPARK Pro/);
  });
});

// Every page gate names its key one of these ways.
const KEY_CALL = /(?:featureGate|gate)\.(?:allows|locked|needs|entry)\(\s*["']([a-z0-9_]+)["']|featureKey[=:]\s*["']([a-z0-9_]+)["']|badgeKey: "([a-z0-9_]+)"/g;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("5. every key an in-page gate names is a catalog key", () => {
  const named = new Map();
  for (const file of walk(path.join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(KEY_CALL)) {
      const key = m[1] || m[2] || m[3];
      if (!named.has(key)) named.set(key, path.relative(ROOT, file));
    }
  }
  test("the scan finds the page gates", () => {
    for (const k of ["my_brand_social_calendar_grid", "my_brand_bg_remove", "arion_analytics_pages", "oliver_multi_location",
      "arion_seo_ai_search", "spark_campaign_suggest", "oliver_portal_domains", "stella_db_registry"]) {
      assert.ok(named.has(k), `${k} is named by a page gate`);
    }
  });
  test("none is missing from test/fixtures/feature-keys.json (the seed's keys)", () => {
    const missing = [...named].filter(([k]) => !KEYS.has(k)).map(([k, f]) => `${k} (${f})`);
    assert.deepEqual(missing, []);
  });
});

describe("6. the in-page tier maps stay deleted", () => {
  test("My Brand's own tier table is gone; its pages ask the catalog", () => {
    assert.equal(existsSync(path.join(ROOT, "src/hooks/useMyBrandTier.ts")), false);
    for (const f of ["ImageStudioPage", "SocialAnalyticsPage", "SocialCalendarPage", "SocialChannelsPage", "TemplateStudioPage", "VoicePage"]) {
      const src = read(`src/pages/myBrand/${f}.tsx`);
      assert.match(src, /useFeatureGate\(\)/, f);
      assert.doesNotMatch(src, /useMyBrandTier|requiredTier=|tierMeets|useProductTier/, f);
    }
    assert.doesNotMatch(read("src/components/MyBrandUpgradeGate.tsx"), /requiredTier|TIER_LABELS/);
    assert.match(read("src/pages/myBrand/SocialCalendarPage.tsx"), /const hasCalendar = gate\.allows\("my_brand_social_calendar_grid"\);/,
      "the grid read the SPARK tier until 11 Oct");
  });
  test("ARION sections name a key; no site tier is compared", () => {
    const ui = read("src/arion/components/Ui.tsx");
    assert.doesNotMatch(ui, /meetsMinTier|TIER_ORDER|requiredTier/);
    assert.match(ui, /if \(!gate\.locked\(featureKey\)\) return <>\{children\}<\/>;/);
    for (const f of ["analytics/AnalyticsOverview", "analytics/AnalyticsTraffic", "analytics/AnalyticsAudience", "analytics/AnalyticsContent",
      "analytics/AnalyticsConversions", "analytics/AnalyticsPages", "analytics/AnalyticsReports", "business/BusinessLocations",
      "business/BusinessServices", "hosting/HostingPerformance", "hosting/HostingDomainDns", "website/WebsiteContent", "seo/SeoAiSearch"]) {
      const src = read(`src/arion/pages/${f}.tsx`);
      assert.doesNotMatch(src, /meetsMinTier|requiredTier=|tier === 'pro'|tier === 'business'|tier === 'standard'|tierRank/, f);
    }
    assert.match(read("src/arion/pages/analytics/AnalyticsReports.tsx"), /featureKey="arion_analytics_reports"/,
      "the page said Pro while the menu and arion-api say Business");
    assert.match(read("src/arion/pages/hosting/HostingPerformance.tsx"), /featureKey="arion_hosting_performance"/,
      "the page said Pro while the menu and arion-api say Standard");
  });
  test("studio smart tools, OLIVER locations, portals and automations read the answer", () => {
    const studio = read("src/builder/adapters/mybrand/StudioBuilder.tsx");
    assert.doesNotMatch(studio, /useProductTier|tierMeets|Pro\+/);
    assert.match(studio, /const canRemoveBackground = featureGate\.allows\("my_brand_bg_remove", "spend"\);/, "a model spend holds while undecided");
    assert.doesNotMatch(read("src/builder/adapters/mybrand/LayerInspector.tsx"), /Pro\+|Pro feature/);
    const locs = read("src/hooks/useOliverLocations.ts");
    assert.doesNotMatch(locs, /tierMeets|useProductTier|"business"/);
    assert.doesNotMatch(read("src/lib/oliverLocations.ts"), /MULTI_LOCATION_PLAN_LABEL/);
    const domains = read("src/pages/oliver/OliverPortalDomainsPage.tsx");
    assert.doesNotMatch(domains, /tierGate|Pro\+|Standard\+/);
    const autos = read("src/pages/oliver/OliverAutomationsPage.tsx");
    assert.match(autos, /const locked = rule\.in_plan === false;/, "every Pro rule read locked, even for a Pro business");
    assert.doesNotMatch(autos, /required_tier === "pro"|Pro\+/);
    const steps = read("src/lib/onboardingRunner/oliverSteps.ts");
    assert.doesNotMatch(steps, /tier === "pro" \|\| tier === "business"/);
  });
  test("SPARK suggestions, the API reference and the Intelligence card state no tier", () => {
    const composer = read("src/components/spark/SparkCampaignComposerModal.tsx");
    assert.doesNotMatch(composer, /tenantTier|isPlatformOwner/, "a tier compare and a by-name platform-owner pass");
    assert.match(composer, /featureGate\.allows\("spark_campaign_suggest"\)/);
    assert.doesNotMatch(read("src/pages/spark/SparkApiReferencePage.tsx"), /minTier/);
    assert.doesNotMatch(read("src/components/iainsights/LockedIntelligenceCard.tsx"), /minTier|TIER_LABEL/);
    assert.doesNotMatch(read("src/lib/tierRank.ts"), /IntelMinTier/);
  });
});
