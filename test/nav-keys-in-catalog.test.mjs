// test/nav-keys-in-catalog.test.mjs — one feature list, one answer.
//
// Brandon, 11 Oct 2026: "I would think we have a feature list and then a
// subscription tier list and those are synced up." (SCOPE_FEATURE_CATALOG_
// 2026-10-11 §2.5.) Replaces test/nav-tier-every-item.test.mjs, which pinned a
// tier rule or an `everyTier` reason on every menu row: the rows now name a
// feature key and nothing else, and the tier lives once, in platform-api's
// catalog. Each block goes red if that comes back apart:
//   1. every SubNav key and every serviceCatalog key is a catalog key
//      (test/fixtures/feature-keys.json), and that fixture is the seed's;
//   2. the wall RUNS on the catalog answer: allowed false locks with `needs`,
//      null opens and logs, true opens, coming_soon / hidden do what they say;
//   3. no Portal file states a tier any more (the old columns stay deleted);
//   4. the menu, the page wall and the lock label read the answer, with the
//      walk rows for Briarwood (ARION Pro) and RII (ARION Pro + SPARK
//      Standard + OLIVER Pro);
//   5. the product gate (kept from the 11 Oct file: ARGUS closes, FORGE has no
//      node).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  featureState, isEntitled, isVisible, isRoutable, isHiddenFeature, isComingSoon,
  requirementLabel, planWallLocks, productOffFor, featureContext, myBrandLockedOnRail, stepsShown,
} from "../src/components/navVisibility.ts";
import { enabledFeatureKeys, featuresOf, featureOf } from "../src/lib/entitlements.ts";
import { SERVICE_CATALOG, resolveServiceStatus } from "../src/config/serviceCatalog.ts";
import {
  OFF_GATED_PRODUCTS, SELF_SERVE_BILLING_PRODUCTS, isOffGatedProduct, isSelfServeBillingProduct,
  gateExemptServiceKey, offNotice, offReasons, offNoticeShownByPage, productSwitchedOff,
  ARGUS_PAGES_OPEN_WHEN_OFF,
} from "../src/lib/productAccess.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const nav = read("src/components/SubNav.tsx");
const catalogSrc = read("src/config/serviceCatalog.ts");

const FIXTURE = JSON.parse(read("test/fixtures/feature-keys.json"));
const FIXTURE_KEYS = Array.isArray(FIXTURE) ? FIXTURE : FIXTURE.keys;
const KEYS = new Set(FIXTURE_KEYS);

// The seed lives in the sibling platform-api checkout. It is read, never
// written; a machine without the sibling (the Portal's own pipeline) skips the
// one comparison that needs it and says why.
const SEED_PATH = path.resolve(ROOT, "..", "platform-api-septa", "db", "seed", "feature_catalog.json");
const SEED = existsSync(SEED_PATH) ? JSON.parse(readFileSync(SEED_PATH, "utf8")) : null;
const SEED_ROWS = SEED ? (Array.isArray(SEED) ? SEED : SEED.features) : [];
const SEED_BY_KEY = Object.fromEntries(SEED_ROWS.map((r) => [r.key, r]));
const NO_SEED = SEED ? false : `platform-api-septa is not checked out beside this repo (${SEED_PATH})`;

/** Every menu row key in SubNav.tsx, single-line rows and the multi-line FORGE pointer. */
const NAV_KEYS = [...new Set([...nav.matchAll(/\bkey: "([a-z0-9_]+)"/g)].map((m) => m[1]))];

// navVisibility logs undecided / mismatch ONCE per id for the life of the
// process; tests that assert a log use ids no other test touches.
const logged = [];
const realError = console.error;
const realWarn = console.warn;
beforeEach(() => {
  logged.length = 0;
  console.error = (...a) => logged.push(["error", a.join(" ")]);
  console.warn = (...a) => logged.push(["warn", a.join(" ")]);
});
afterEach(() => { console.error = realError; console.warn = realWarn; });

/** One entry exactly as platform-api featuresFor() shapes it. */
const entry = (over = {}) => ({
  allowed: true, reason: "SPARK Standard includes it", needs: null, product: "spark",
  min_tier: null, addon: null, addon_min_tier: null, kind: "page", availability: "live", ...over,
});

describe("1. every key the Portal names is a catalog key", () => {
  test("the fixture is a non-empty list of keys with its count", () => {
    assert.ok(FIXTURE_KEYS.length > 300, `fixture parsed (${FIXTURE_KEYS.length} keys)`);
    if (!Array.isArray(FIXTURE)) assert.equal(FIXTURE.count, FIXTURE_KEYS.length, "count matches the list");
    assert.equal(KEYS.size, FIXTURE_KEYS.length, "no duplicate keys");
  });
  test("every SubNav row's key is in the catalog", () => {
    assert.ok(NAV_KEYS.length > 150, `menu parsed (${NAV_KEYS.length} keys)`);
    assert.ok(NAV_KEYS.includes("forge_catalog"), "the multi-line FORGE pointer row is read too");
    assert.deepEqual(NAV_KEYS.filter((k) => !KEYS.has(k)), [], "menu keys the catalog does not have");
  });
  test("every serviceCatalog page key is in the catalog", () => {
    const keys = SERVICE_CATALOG.map((s) => s.key);
    assert.ok(keys.length > 250, `catalog parsed (${keys.length} pages)`);
    assert.deepEqual(keys.filter((k) => !KEYS.has(k)), [], "page keys the catalog does not have");
  });
  test("the fixture matches platform-api db/seed/feature_catalog.json", { skip: NO_SEED }, () => {
    const seedKeys = SEED_ROWS.map((r) => r.key).sort();
    assert.deepEqual([...FIXTURE_KEYS].sort(), seedKeys,
      "refresh test/fixtures/feature-keys.json from platform-api-septa/test/fixtures/feature-keys.json");
  });
});

describe("2. the wall runs on the catalog answer", () => {
  test("allowed false -> locked, menu and route, and the label is the catalog's needs", () => {
    const ctx = { features: { spark_segments: entry({ allowed: false, needs: "SPARK Pro", min_tier: "pro", reason: "Segments needs SPARK Pro; this business has SPARK Standard" }) } };
    assert.equal(featureState("spark_segments", ctx), "locked");
    assert.equal(isEntitled("spark_segments", ctx), false);
    assert.equal(isVisible({ key: "spark_segments" }, ctx), false);
    assert.equal(isRoutable("spark_segments", ctx), false);
    assert.equal(requirementLabel("spark_segments", ctx), "SPARK Pro");
    assert.equal(planWallLocks("spark_segments", ctx, false), true);
    assert.deepEqual(logged, [], "a decided answer logs nothing");
  });
  test("allowed null -> open (a page view is a read) AND a log line naming the product", () => {
    const ctx = { features: { stella_report_sql: entry({ allowed: null, product: "stella", needs: "STELLA Pro", reason: "could not tell whether STELLA is in this business's subscription" }) } };
    assert.equal(isEntitled("stella_report_sql", ctx), true);
    assert.equal(isRoutable("stella_report_sql", ctx), true);
    assert.equal(planWallLocks("stella_report_sql", ctx, false), false);
    assert.ok(logged.some(([lvl, l]) => lvl === "warn" && l.includes("[navVisibility] stella") && l.includes("undecided allows a read")),
      `expected the undecided log, got ${JSON.stringify(logged)}`);
  });
  test("allowed true -> open, no lock, no log", () => {
    const ctx = { features: { oliver_dispatch: entry({ product: "oliver", min_tier: "standard", reason: "OLIVER Pro includes it" }) } };
    assert.equal(featureState("oliver_dispatch", ctx), "open");
    assert.equal(isVisible({ key: "oliver_dispatch" }, ctx), true);
    assert.equal(isRoutable("oliver_dispatch", ctx), true);
    assert.deepEqual(logged, []);
  });
  test("availability hidden -> not a menu row, not routable, whatever allowed says", () => {
    const ctx = { features: { spark_api_keys: entry({ availability: "hidden" }) } };
    assert.equal(featureState("spark_api_keys", ctx), "hidden");
    assert.equal(isHiddenFeature("spark_api_keys", ctx), true);
    assert.equal(isVisible({ key: "spark_api_keys" }, ctx), false);
    assert.equal(isRoutable("spark_api_keys", ctx), false);
    assert.equal(planWallLocks("spark_api_keys", ctx, false), true);
    assert.equal(requirementLabel("spark_api_keys", ctx), "a higher plan", "a cut page names no plan");
  });
  test("availability coming_soon -> the page's coming-soon status; still a menu row", () => {
    const ctx = { features: { forge_coming: entry({ product: "forge", availability: "coming_soon" }) } };
    assert.equal(featureState("forge_coming", ctx), "coming_soon");
    assert.equal(isComingSoon("forge_coming", ctx), true);
    assert.equal(isVisible({ key: "forge_coming" }, ctx), true);
    const service = { key: "forge_coming", displayName: "Coming Soon", section: "FORGE", route: "/x", description: "" };
    assert.equal(resolveServiceStatus(service, ctx.features), "coming_soon");
  });
  test("merged -> not a menu row, but routable when the plan includes it", () => {
    const yes = { features: { spark_contact_360: entry({ min_tier: "business" }) } };
    const no = { features: { spark_contact_360: entry({ allowed: false, min_tier: "business", needs: "SPARK Business" }) } };
    assert.equal(isVisible({ key: "spark_contact_360", merged: true }, yes), false);
    assert.equal(isRoutable("spark_contact_360", yes), true);
    assert.equal(isRoutable("spark_contact_360", no), false, "Standard opens Contact 360 by URL: the old hole stays shut");
  });
  test("a key missing from a present answer -> open as a read, logged at ERROR (catalog mismatch)", () => {
    const ctx = { features: { spark_contacts: entry() } };
    assert.equal(isEntitled("spark_mismatch_probe", ctx), true);
    assert.ok(logged.some(([lvl, l]) => lvl === "error" && l.includes('"spark_mismatch_probe"') && l.includes("catalog mismatch")),
      `expected the mismatch log, got ${JSON.stringify(logged)}`);
  });
  test("no answer at all -> every page open, one log line", () => {
    const ctx = { features: null };
    assert.equal(isEntitled("spark_segments", ctx), true);
    assert.equal(isRoutable("arion_seo_market_monitor", ctx), true);
    assert.equal(planWallLocks("spark_ai_writer", ctx, false), false);
    assert.equal(requirementLabel("spark_segments", ctx), "a higher plan");
    assert.ok(logged.filter(([, l]) => l.includes("no feature answer")).length <= 1);
  });
  test("featuresOf: an unreadable catalog or an older platform-api is NO answer, never a lock", () => {
    const base = { tenant_id: "t", resolved_at: "x", decided: true, products: {}, addons: {}, limits: {} };
    assert.equal(featuresOf(null), null);
    assert.equal(featuresOf(base), null, "an older platform-api sends no features");
    assert.equal(featuresOf({ ...base, features: { a: entry() }, sources: { catalog: "unreadable" } }), null);
    const ok = { ...base, features: { a: entry() }, sources: { catalog: "ok" } };
    assert.deepEqual(featuresOf(ok), { a: entry() });
    assert.equal(featureOf(ok, "a").allowed, true);
    assert.equal(featureOf(ok, "b"), null);
  });
  test("enabledServices = keys the answer does not refuse, availability live", () => {
    const features = {
      a: entry(), b: entry({ allowed: null }), c: entry({ allowed: false, needs: "SPARK Pro" }),
      d: entry({ availability: "coming_soon" }), e: entry({ availability: "hidden" }),
    };
    assert.deepEqual([...enabledFeatureKeys(features)].sort(), ["a", "b"]);
    assert.equal(enabledFeatureKeys(null).size, 0);
  });
  test("resolveServiceStatus: not in the plan -> not_subscribed; no entry -> enabled (undecided read)", () => {
    const svc = (key) => ({ key, displayName: key, section: "LUMEN", route: "/x", description: "" });
    const features = { spark_segments: entry({ allowed: false, needs: "SPARK Pro" }), spark_contacts: entry() };
    assert.equal(resolveServiceStatus(svc("spark_segments"), features), "not_subscribed");
    assert.equal(resolveServiceStatus(svc("spark_contacts"), features), "enabled");
    assert.equal(resolveServiceStatus(svc("spark_unknown"), features), "enabled");
    assert.equal(resolveServiceStatus(svc("spark_contacts"), null), "enabled");
  });
  test("a product that is OFF leaves its plan page and the ARGUS control pages to the product gate", () => {
    const ctx = featureContext({
      tenant_id: "t", resolved_at: "x", decided: true, addons: {}, limits: {},
      products: { arion: { owned: false, decided: true }, spark: { owned: true, tier: "standard", decided: true } },
      features: {
        arion_usage: entry({ product: "arion", allowed: false, needs: "ARION" }),
        arion_dashboard: entry({ product: "arion", allowed: false, needs: "ARION" }),
        spark_segments: entry({ allowed: false, needs: "SPARK Pro" }),
      },
    });
    assert.equal(productOffFor("arion_usage", ctx), true);
    assert.equal(planWallLocks("arion_usage", ctx, gateExemptServiceKey("arion_usage")), false, "where they buy ARION back");
    assert.equal(planWallLocks("arion_dashboard", ctx, gateExemptServiceKey("arion_dashboard")), true);
    assert.equal(productOffFor("spark_segments", ctx), false, "owned, plan below: the wall's job");
    assert.equal(planWallLocks("spark_segments", ctx, true), true);
  });
  test("tours never offer a page the catalog cuts", () => {
    const steps = [{ id: "settings.spark_quiet_hours" }, { id: "settings.spark_tracking" }, { id: "settings.settings_profile" }];
    const features = { spark_quiet_hours: entry({ availability: "hidden" }), spark_tracking: entry({ availability: "hidden" }) };
    assert.deepEqual(stepsShown(steps, { features }).map((s) => s.id), ["settings.settings_profile"]);
    assert.equal(stepsShown(steps, { features: null }).length, 3, "no answer: nothing is cut");
    assert.match(read("src/components/GuidedTourLauncher.tsx"), /steps: stepsShown\(j\.steps, \{ features \}\)/);
  });
  test("My Brand rows take the product lock only when BOTH ARION and SPARK are known locked", () => {
    assert.equal(myBrandLockedOnRail(true, false), false, "SPARK-only business pays for My Brand Standard");
    assert.equal(myBrandLockedOnRail(false, true), false, "ARION-only business");
    assert.equal(myBrandLockedOnRail(true, true), true, "neither product: locked");
    assert.equal(myBrandLockedOnRail(true, null), false, "SPARK not known: open");
    assert.equal(myBrandLockedOnRail(null, null), false, "nothing known: open");
  });
});

describe("3. no Portal file states a tier", () => {
  test("SubNav rows carry no minTier / addon / addonTier / tierProduct / everyTier / hidden", () => {
    const rows = nav.split("\n").filter((l) => /\bkey: "/.test(l));
    const offenders = rows.filter((l) => /minTier:|\baddon:|addonTier:|tierProduct:|everyTier:|hidden: true/.test(l));
    assert.deepEqual(offenders.map((l) => l.trim().slice(0, 90)), []);
  });
  test("the route-only tier maps are gone, and so is the derived map the wall read", () => {
    assert.doesNotMatch(nav, /ROUTE_ONLY_RULES|ROUTE_ONLY_EVERY_TIER|SERVICE_VISIBILITY/);
    assert.doesNotMatch(read("src/components/PlanWall.tsx"), /SERVICE_VISIBILITY|useProductTier|useNavAddons/);
  });
  test("VisibilityRules declares only `merged` (menu structure the catalog has no column for)", () => {
    const vis = read("src/components/navVisibility.ts");
    const iface = vis.slice(vis.indexOf("export interface VisibilityRules"), vis.indexOf("export interface VisibilityContext"));
    assert.match(iface, /merged\?: boolean;/);
    assert.doesNotMatch(iface, /hidden\?|addon\?|addonTier\?|minTier\?|tierProduct\?|everyTier\?/);
  });
  test("serviceCatalog.ts has no defaultStatus and no tierGate", () => {
    assert.doesNotMatch(catalogSrc, /defaultStatus: '|tierGate: '|defaultStatus: ServiceStatus|tierGate\?:/);
    for (const s of SERVICE_CATALOG) {
      assert.equal("defaultStatus" in s, false, s.key);
      assert.equal("tierGate" in s, false, s.key);
    }
  });
  test("AppState builds no per-product key lists; the enabled set is the catalog answer", () => {
    const app = read("src/app/AppState.tsx");
    assert.doesNotMatch(app, /function buildEnabledServices|keys\.add\(|import\.meta\.env\.VITE_ENABLED_SERVICES/);
    assert.doesNotMatch(app, /enabledServices: Set<string>/);
    const hook = read("src/hooks/useEnabledServices.ts");
    assert.match(hook, /enabledFeatureKeys\(features\)/);
    assert.doesNotMatch(read("src/components/consulting/ClientTenantModal.tsx"), /enabled\.add\(|"arion_dashboard","arion_website_overview"/);
  });
  test("the SEO add-on is read from the answer, not from a second ARION sites fetch", () => {
    assert.equal(existsSync(path.join(ROOT, "src/hooks/useNavAddons.ts")), false);
  });
});

describe("4. the menu, the page and the label read the one answer", () => {
  const wall = read("src/components/PlanWall.tsx");
  test("SubNav: rows are cut by the catalog, locked by allowed:false, labelled by needs", () => {
    assert.match(nav, /const visCtx = featureContext\(productAccess\.payload\);/);
    assert.match(nav, /\.filter\(\(it\) => !it\.merged && !isHiddenFeature\(it\.key, visCtx\)\)/);
    assert.match(nav, /\(it\.key\.startsWith\("my_brand_"\) \? myBrandLocked : productLocked\) \|\| !isEntitled\(it\.key, visCtx\)/);
    assert.match(nav, /title=\{`Requires \$\{requirementLabel\(item\.key, visCtx\)\}`\}/);
    assert.match(nav, /myBrandLockedOnRail\(lockKnown\("arion"\), lockKnown\("spark"\)\)/);
  });
  test("PlanWall: the page's key decides, the card says the catalog's needs", () => {
    assert.match(wall, /const ctx = featureContext\(payload\);/);
    assert.match(wall, /planWallLocks\(serviceKey, ctx, gateExemptServiceKey\(serviceKey\)\)/);
    assert.match(wall, /requiredPlan=\{requirementLabel\(serviceKey, ctx\)\}/);
    const router = read("src/pages/ServiceRouter.tsx");
    assert.match(router, /<PlanWall serviceKey=\{serviceKey\}>\s*<ServiceRouterInner \/>\s*<\/PlanWall>/);
    assert.match(router, /const status: ServiceStatus = resolveServiceStatus\(service, features\);/);
  });
  test("a page on its own route goes through the same wall (Contact Scoring)", () => {
    const app = read("src/App.tsx");
    assert.ok(app.includes('<PlanWall serviceKey="spark_contact_scoring"><SparkContactScoringPage /></PlanWall>'));
    assert.ok(read("src/components/consulting/ClientTenantModal.tsx").includes('<PlanWall serviceKey="spark_contact_scoring"><SparkContactScoringPage /></PlanWall>'));
  });
  test("a locked page says 'Not in your plan' first, then the needs text", () => {
    const card = read("src/components/FeatureLocked.tsx");
    assert.match(card, /data-feature-locked-heading[\s\S]{0,80}Not in your plan/);
    assert.match(card, /\{requiredPlan\.toUpperCase\(\)\}/);
  });

  // The walk rows (walkSteps in the orchestrator's result). Each entry is what
  // platform-api answers for that business; the seed check pins the row so a
  // catalog edit that moves the tier goes red here first.
  const WALK = [
    // business, key, menu path, owned tier, expected allowed, expected needs
    { who: "RII", key: "spark_segments", path: "SPARK > CRM > Segments", product: "spark", have: "standard", min: "pro", allowed: false, needs: "SPARK Pro" },
    { who: "RII", key: "spark_ai_writer", path: "SPARK > AI Tools > AI Writer", product: "spark", have: "standard", min: "business", allowed: false, needs: "SPARK Business" },
    { who: "RII", key: "stella_report_sql", path: "STELLA > Custom Reporting > SQL Editor", product: "stella", have: null, min: "pro", allowed: false, needs: "STELLA Pro" },
    { who: "Briarwood", key: "oliver_dispatch", path: "OLIVER > Jobs > Dispatch", product: "oliver", have: null, min: "standard", allowed: false, needs: "OLIVER Standard" },
    { who: "RII", key: "oliver_dispatch", path: "OLIVER > Jobs > Dispatch", product: "oliver", have: "pro", min: "standard", allowed: true, needs: null },
    { who: "Briarwood", key: "arion_business_reviews", path: "ARION > Business Profile > Reviews", product: "arion", have: "pro", min: "pro", allowed: true, needs: null },
  ];
  for (const w of WALK) {
    test(`${w.who}: ${w.path} -> ${w.allowed ? "open" : `locked, "${w.needs}"`}`, () => {
      assert.ok(NAV_KEYS.includes(w.key), `${w.key} is a menu row`);
      assert.ok(KEYS.has(w.key), `${w.key} is a catalog key`);
      const ctx = { features: { [w.key]: entry({ product: w.product, min_tier: w.min, allowed: w.allowed, needs: w.needs }) } };
      assert.equal(isEntitled(w.key, ctx), w.allowed);
      assert.equal(isRoutable(w.key, ctx), w.allowed);
      assert.equal(requirementLabel(w.key, ctx), w.allowed ? "a higher plan" : w.needs);
    });
  }
  test("the walk rows' tiers are the seed's", { skip: NO_SEED }, () => {
    for (const w of WALK) {
      const row = SEED_BY_KEY[w.key];
      assert.ok(row, `${w.key} in the seed`);
      assert.equal(row.product, w.product, `${w.key} product`);
      assert.equal(row.min_tier, w.min, `${w.key} min_tier`);
      assert.equal(row.availability, "live", `${w.key} is live`);
    }
    assert.equal(SEED_BY_KEY.arion_seo_market_monitor.addon, "seo");
    assert.equal(SEED_BY_KEY.arion_seo_market_monitor.addon_min_tier, "authority");
  });
  test("the seed's six cut pages are exactly the rows that used to say hidden", { skip: NO_SEED }, () => {
    const cut = SEED_ROWS.filter((r) => r.availability === "hidden").map((r) => r.key).sort();
    assert.deepEqual(cut, ["spark_api_keys", "spark_calendar_sync", "spark_config_backup", "spark_quiet_hours", "spark_secrets", "spark_tracking"]);
  });
});

describe("5. the product gate covers every product the payload answers", () => {
  test("ARGUS closes on a decided 'not owned'; FORGE has no node and is not listed", () => {
    assert.equal(isOffGatedProduct("argus"), true);
    assert.equal(isOffGatedProduct("forge"), false);
    assert.deepEqual([...OFF_GATED_PRODUCTS].sort(), ["argus", "arion", "oliver", "spark", "stella"]);
  });
  test("ARGUS's off notice offers the plans page, never a checkout the billing API refuses", () => {
    assert.equal(isSelfServeBillingProduct("argus"), false);
    assert.deepEqual([...SELF_SERVE_BILLING_PRODUCTS].sort(), ["arion", "oliver", "spark", "stella"]);
    const never = offNotice("argus", { kind: "never" }, "admin");
    assert.equal(never.sentence, "ARGUS isn't part of your plan yet.");
    assert.deepEqual(never.action, { kind: "add", label: "Add ARGUS" });
    const ended = offNotice("argus", { kind: "ended", at: "2026-10-01T00:00:00Z" }, "admin");
    assert.equal(ended.action?.kind, "add", "not Re-subscribe");
    assert.equal(offNotice("argus", null, "member").action, null);
    assert.equal(offNotice("argus", null, "viewing_client").action, null);
    assert.equal(offReasons([{ product: "argus", status: "canceled", ended: { at: "2026-10-01T00:00:00Z" } }]).has("argus"), false,
      "the rail never reads an ARGUS billing row as ENDED");
  });
  test("ARGUS pages that control work under other products stay open; the reports close", () => {
    for (const k of ["argus_team_web", "argus_team_marketer", "argus_team_office", "argus_workflows", "argus_settings"]) {
      assert.equal(gateExemptServiceKey(k), true, k);
      assert.ok(ARGUS_PAGES_OPEN_WHEN_OFF.includes(k), k);
    }
    for (const k of ["argus_health", "argus_trends", "argus_cross_platform", "argus_ia_insights"]) {
      assert.equal(gateExemptServiceKey(k), false, k);
      assert.equal(offNoticeShownByPage(`/app/services/${k}`, "argus"), true, k);
    }
    assert.equal(offNoticeShownByPage("/app/services/argus_team_web", "argus"), false);
    const off = { tenant_id: "t", resolved_at: "x", decided: true, products: { argus: { owned: false, decided: true } }, addons: {}, limits: {} };
    assert.equal(productSwitchedOff(off, "argus"), true);
  });
  test("the billing card keeps to the products the billing API sells", () => {
    const settings = read("src/pages/settings/TenantSettings.tsx");
    assert.match(settings, /const gated = isSelfServeBillingProduct\(p\.key\);/);
  });
});
