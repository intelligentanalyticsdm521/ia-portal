// test/nav-tier-every-item.test.mjs — "it's by their subscription".
//
// Brandon, 11 Oct 2026: "this should just be a top level permissions setting.
// If you don't have the subscription you don't get any features." / "ARION pro
// has different features than ARION lite."
//
// Before this pass ARION's 51 menu rows carried ONE tier rule, OLIVER 12 of
// 25, SPARK 21 of 41 and STELLA none, so a Lite ARION business could open
// Business Profile, Staging and every analytics page. Each block below goes
// red if that comes back:
//   1. every row of the four product menus carries a rule OR says, in an
//      `everyTier` reason, why it is in every tier;
//   2. the rows FEATURE_TIER_MATRIX_FULL.md names carry the tier it names
//      (section 13 / 6 / 7 where they supersede section 1);
//   3. pages with no menu row follow the plan too, and the route guard reads
//      the same rules (a deep link shows "Not in your plan");
//   4. the product gate covers ARGUS, and FORGE is left out for the stated
//      reason (no forge node in the entitlement payload).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { myBrandLockedOnRail } from "../src/components/navVisibility.ts";
import {
  OFF_GATED_PRODUCTS, SELF_SERVE_BILLING_PRODUCTS, isOffGatedProduct, isSelfServeBillingProduct,
  gateExemptServiceKey, offNotice, offReasons, offNoticeShownByPage, productSwitchedOff,
  ARGUS_PAGES_OPEN_WHEN_OFF,
} from "../src/lib/productAccess.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const nav = read("src/components/SubNav.tsx");
const block = (start, end) => nav.slice(nav.indexOf(start), nav.indexOf(end));
const NAVS = {
  OLIVER: block("const OLIVER_NAV", "const ARION_NAV"),
  ARION: block("const ARION_NAV", "const SPARK_NAV"),
  SPARK: block("const SPARK_NAV", "const CONSULTING_NAV"),
  STELLA: block("const STELLA_NAV", "const SETTINGS_NAV"),
};
const rowsOf = (b) => b.split("\n").filter((l) => /\{ key: "/.test(l));
const row = (key) => {
  const hit = nav.split("\n").find((l) => l.includes(`{ key: "${key}"`));
  assert.ok(hit, `menu row ${key} exists`);
  return hit;
};
const RULE = /minTier: "|addon: "|hidden: true|merged: true|everyTier: /;

describe("1. every row has a rule or says why it is in every tier", () => {
  for (const [name, b] of Object.entries(NAVS)) {
    test(`${name}: no row without a rule`, () => {
      const rows = rowsOf(b);
      assert.ok(rows.length > 10, `${name} menu parsed (${rows.length} rows)`);
      const bare = rows.filter((l) => !RULE.test(l)).map((l) => l.trim().slice(0, 90));
      assert.deepEqual(bare, [], `${name} rows with neither a tier rule nor an everyTier reason`);
    });
  }
  test("an everyTier reason is words, not an empty string", () => {
    for (const b of Object.values(NAVS)) {
      for (const l of rowsOf(b)) {
        const m = l.match(/everyTier: "([^"]*)"/);
        if (m) assert.ok(m[1].trim().length >= 10, `reason too short: ${l.trim().slice(0, 80)}`);
      }
    }
  });
});

describe("2. the matrix rows carry the tier the matrix names", () => {
  const expectTier = (key, tier) => assert.match(row(key), new RegExp(`minTier: "${tier}"`), `${key} = ${tier}`);
  test("ARION section 1: Staging, Business Profile = Pro", () => {
    expectTier("arion_website_staging", "pro");
    for (const k of ["overview", "locations", "reviews", "insights", "posts", "services", "bing_overview", "apple_overview"]) {
      expectTier(`arion_business_${k}`, "pro");
    }
  });
  test("ARION section 1: GA4 Overview/Traffic + Search Console + Bing + Vulnerabilities = Standard", () => {
    for (const k of ["arion_analytics_overview", "arion_analytics_traffic", "arion_search_performance",
      "arion_search_indexing", "arion_search_bing_copilot", "arion_website_security_vulnerabilities"]) expectTier(k, "standard");
  });
  test("ARION section 1: Audience / Content / Conversions = Pro", () => {
    for (const k of ["audience", "content", "conversions"]) expectTier(`arion_analytics_${k}`, "pro");
  });
  test("ARION section 6: IA Insights Intelligence = Pro; Health / Trends / Reports every tier", () => {
    expectTier("arion_ia_insights_intelligence", "pro");
    for (const k of ["health", "trends", "reports"]) assert.match(row(`arion_ia_insights_${k}`), /everyTier: /);
  });
  test("ARION sections 7 + 13: SEO is the add-on on ANY base tier (no minTier); Market Monitor = Authority", () => {
    for (const l of rowsOf(NAVS.ARION).filter((x) => x.includes('key: "arion_seo_'))) {
      assert.match(l, /addon: "seo"/, l.trim().slice(0, 60));
      assert.doesNotMatch(l, /minTier:/, "a Standard site that bought the add-on must get it");
    }
    assert.match(row("arion_seo_market_monitor"), /addonTier: "authority"/);
  });
  test("My Brand (sections 10 + 13): Standard, judged on the derived My Brand tier", () => {
    for (const l of rowsOf(NAVS.ARION).filter((x) => x.includes('key: "my_brand_'))) {
      assert.match(l, /minTier: "standard", tierProduct: "my_brand"/, l.trim().slice(0, 60));
    }
  });
  test("OLIVER section 2: Crew Performance = Pro (crew_performance_reporting)", () => {
    expectTier("oliver_crew_performance", "pro");
  });
  test("OLIVER section 13: the Invoicing tier keeps quotes, invoices, payments", () => {
    for (const k of ["oliver_quotes", "oliver_invoices", "oliver_payments", "oliver_contacts"]) {
      assert.doesNotMatch(row(k), /minTier:/, k);
    }
  });
  test("SPARK: Webhook deliveries follows Webhooks (Pro); Business suite stays Business", () => {
    expectTier("spark_webhooks", "pro");
    expectTier("spark_webhook_deliveries", "pro");
    for (const k of ["spark_journey_builder", "spark_approvals", "spark_anomaly_alerts", "spark_audience_sync",
      "spark_nps", "spark_referrals", "spark_contact_360", "spark_health_score", "spark_intelligence"]) expectTier(k, "business");
  });
  test("STELLA section 9: SQL Editor = Pro; section 6: Intelligence = Pro; the rest every tier", () => {
    expectTier("stella_report_sql", "pro");
    expectTier("stella_ia_insights_intelligence", "pro");
    const pro = new Set(["stella_report_sql", "stella_ia_insights_intelligence"]);
    for (const l of rowsOf(NAVS.STELLA)) {
      const key = l.match(/key: "([^"]+)"/)[1];
      if (!pro.has(key)) assert.match(l, /everyTier: /, key);
    }
  });
});

describe("3. deep links follow the same plan", () => {
  const router = read("src/pages/ServiceRouter.tsx");
  test("pages with no menu row carry their matrix tier into SERVICE_VISIBILITY", () => {
    const routeOnly = nav.slice(nav.indexOf("export const ROUTE_ONLY_RULES"), nav.indexOf("export const SERVICE_VISIBILITY"));
    assert.match(routeOnly, /arion_hosting_performance: \{ minTier: "standard" \}/);
    assert.match(routeOnly, /arion_analytics_pages: \{ minTier: "pro" \}/);
    assert.match(routeOnly, /arion_analytics_reports: \{ minTier: "business" \}/);
    assert.match(routeOnly, /arion_search_bing_indexnow: \{ minTier: "standard" \}/);
    assert.match(routeOnly, /arion_seo_reports: \{ addon: "seo" \}/);
    assert.match(nav, /const map: Record<string, VisibilityRules> = \{ \.\.\.ROUTE_ONLY_RULES \};/);
    assert.match(nav, /minTier: item\.minTier, tierProduct: item\.tierProduct,/, "the route guard keeps tierProduct");
  });
  test("the route guard judges my_brand_* pages as ARION pages on the My Brand tier", () => {
    const wall = read("src/components/PlanWall.tsx");
    assert.match(wall, /const wallProduct = wallProductOfServiceKey\(serviceKey\);/);
    assert.match(wall, /const gatingActive = isGatedProduct\(wallProduct\);/);
    assert.match(wall, /isRoutable\(rules, \{ tier, addons, seoAddonTier, gatingActive, myBrandTier \}\)/);
    assert.match(wall, /requiredPlan=\{requirementLabel\(rules, wallProduct\)\}/);
    assert.match(router, /<PlanWall serviceKey=\{serviceKey\}>\s*<ServiceRouterInner \/>\s*<\/PlanWall>/);
    assert.match(nav, /const visCtx = \{ tier, addons, seoAddonTier, gatingActive, myBrandTier \};/);
  });

  // 2026-10-11 skeptic pass. ROUTE_ONLY_RULES covered ARION only, so ~20
  // tiered pages opened by URL on any plan (the Pro Workflows page at
  // /spark_rules, OLIVER Job Costing on Invoicing, SMS campaigns on SPARK
  // Standard, four My Brand pages on ARION Lite).
  const routeOnly = nav.slice(nav.indexOf("export const ROUTE_ONLY_RULES"), nav.indexOf("export const ROUTE_ONLY_EVERY_TIER"));
  const everyRoute = nav.slice(nav.indexOf("export const ROUTE_ONLY_EVERY_TIER"), nav.indexOf("export const SERVICE_VISIBILITY"));
  const expectRoute = (key, rule) => assert.ok(routeOnly.includes(`${key}: { ${rule} }`), `${key}: { ${rule} }`);
  test("OLIVER pages with no menu row carry tierFeatures' tier", () => {
    for (const k of ["oliver_projects", "oliver_job_offers", "oliver_support_tickets", "oliver_workflow_templates", "oliver_messages", "oliver_portal_domains"]) expectRoute(k, 'minTier: "standard"');
    for (const k of ["oliver_quote_options", "oliver_time_tracking", "oliver_expenses"]) expectRoute(k, 'minTier: "pro"');
    for (const k of ["oliver_job_costing", "oliver_territories", "oliver_sla_policies"]) expectRoute(k, 'minTier: "business"');
  });
  test("SPARK: the folded Workflows keys are Pro, SMS is Pro (matrix 11), Contact Score Tuning is Business", () => {
    for (const k of ["spark_automations", "spark_workflow_triggers", "spark_automation_builder", "spark_rules",
      "spark_scoring_rules", "spark_routing_rules", "spark_autotag_rules", "spark_inbound_webhooks",
      "spark_sms_campaigns", "spark_sms_templates"]) expectRoute(k, 'minTier: "pro"');
    expectRoute("spark_contact_scoring", 'minTier: "business"');
  });
  test("My Brand pages with no menu row: Standard on the derived My Brand tier", () => {
    for (const k of ["my_brand_compose", "my_brand_social_channels", "my_brand_social_report", "my_brand_voice"]) {
      expectRoute(k, 'minTier: "standard", tierProduct: "my_brand"');
    }
  });
  test("EVERY page ServiceRouter can open for a gated product carries a plan or says why it has none", () => {
    const cases = [...router.matchAll(/case '((?:arion|spark|oliver|stella|my_brand)_[a-z0-9_]+)':([^\n]*)/g)];
    assert.ok(cases.length > 150, `router cases parsed (${cases.length})`);
    const bare = [];
    for (const [, key, rest] of cases) {
      if (/<Navigate /.test(rest)) continue;                         // a redirect: the target page is judged
      if (nav.includes(`{ key: "${key}"`)) continue;                 // a menu row (rule or everyTier, block 1)
      if (routeOnly.includes(`  ${key}: {`)) continue;               // a route-only plan
      if (everyRoute.includes(`  ${key}: "`)) continue;              // every tier, with the reason
      bare.push(key);
    }
    assert.deepEqual([...new Set(bare)], [], "routed pages with neither a plan nor an every-tier reason");
  });
  test("a page on its own route goes through the same wall (Contact Scoring = Business)", () => {
    const app = read("src/App.tsx");
    assert.ok(app.includes('<PlanWall serviceKey="spark_contact_scoring"><SparkContactScoringPage /></PlanWall>'));
    assert.ok(read("src/components/consulting/ClientTenantModal.tsx").includes('<PlanWall serviceKey="spark_contact_scoring"><SparkContactScoringPage /></PlanWall>'));
  });
  test("My Brand rows lock on product only when BOTH ARION and SPARK are known locked (SPARK-only owns My Brand)", () => {
    assert.equal(myBrandLockedOnRail(true, false), false, "SPARK-only business pays for My Brand Standard");
    assert.equal(myBrandLockedOnRail(false, true), false, "ARION-only business");
    assert.equal(myBrandLockedOnRail(true, true), true, "neither product: locked");
    assert.equal(myBrandLockedOnRail(true, null), false, "SPARK not known: open");
    assert.equal(myBrandLockedOnRail(null, null), false, "nothing known: open");
    assert.match(nav, /it\.tierProduct === "my_brand" \? myBrandLocked : productLocked/);
    assert.match(nav, /myBrandLockedOnRail\(lockKnown\("arion"\), lockKnown\("spark"\)\)/);
  });
  test("a locked deep link says 'Not in your plan' first", () => {
    const card = read("src/components/FeatureLocked.tsx");
    assert.match(card, /data-feature-locked-heading[\s\S]{0,80}Not in your plan/);
  });
});

describe("4. the product gate covers every product the payload answers", () => {
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
