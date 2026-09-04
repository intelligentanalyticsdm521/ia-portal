// IL step 8 UI — the monthly "what worked" report on the page.
//
// Source-pinning, like il3-rules-suggestions-ui.test.mjs: these are wiring and
// wording facts a typecheck cannot see.
//
// What has to stay true:
//   • L4 — a suggested next move is steps and a LINK. There is no button
//     anywhere in the Portal that applies one, and no client path that could.
//   • the client surfaces call /insights/findings and /insights/playbooks, NOT
//     /il/admin/* (founder-only, fails closed).
//   • the route key `spark_what_worked` matches the path the monthly EMAIL
//     links to. A report whose email lands on a 404 is worse than no email.
//   • the two tier reasons stay two reasons — Hot/Warm/Cold is Pro,
//     the paragraph is Standard — never collapsed into one "locked"
//     (`reference_nav_visibility_semantics`).
//   • no vendor and no model is named anywhere the owner can see
//     (`reference_intelligence_layer_terminology`); "Powered by ARGUS AI" is.
//   • the word "tenant" never reaches a person (`feedback_no_tenant_in_ui`).
//   • the report is in the nav on EVERY tier — gating depth is the rule and a
//     hidden report cannot sell an upgrade (`reference_report_tier_model`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const api = read("lib/ilFindingsApi.ts");
const card = read("components/spark/WhatWorkedCard.tsx");
const page = read("pages/spark/SparkWhatWorkedPage.tsx");
const overview = read("pages/spark/SparkOverviewPage.tsx");
const router = read("pages/ServiceRouter.tsx");
const subnav = read("components/SubNav.tsx");
const catalog = read("config/serviceCatalog.ts");

/** The copy a person can actually read: comments stripped, so a header that
 *  says "never say tenant" is not mistaken for a screen that says it. */
function copyOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const OWNER_FACING = [card, page];
const OWNER_COPY = OWNER_FACING.map(copyOnly);

test("the client calls the tenant prefixes and nothing founder-only", () => {
  for (const p of [
    "/api/v1/insights/findings",
    "/api/v1/insights/findings/periods",
    "/api/v1/insights/playbooks/",
  ]) {
    assert.ok(api.includes(p), `missing ${p}`);
  }
  // Comments stripped: this file's own header NAMES the founder prefix to say
  // it is somewhere else, and a header that documents a boundary must not trip
  // the test that enforces it.
  for (const src of [api, card, page]) {
    assert.equal(/\/il\/admin/.test(copyOnly(src)), false, "a client surface must never call the founder prefix");
  }
});

test("there is no Apply — Done and Dismiss are the only two verbs", () => {
  assert.ok(page.includes("playbookDone") && page.includes("playbookDismiss"));
  for (const src of [api, card, page]) {
    assert.equal(/playbookApply|\/apply\b|applyPlaybook/.test(src), false, "an apply path exists");
  }
  // and nothing in the client types can carry something runnable
  assert.equal(/action_json|steps_json|automation_id|template_key/.test(api), false,
    "the client type carries a payload field");
});

test("a play's link is rendered as a route, never as an external href", () => {
  // <Link to={play.action_url}> — react-router, which cannot leave the app.
  assert.match(page, /<Link\s+to=\{play\.action_url\}/);
  assert.equal(/href=\{play\.action_url\}/.test(page), false, "a raw href would follow anything");
});

test("the route key matches the path the monthly email links to", () => {
  // services/il/findingsTemplate.js sends the client to
  // /app/services/spark_what_worked. All four registrations must agree.
  assert.match(router, /case 'spark_what_worked': sparkPage = <SparkWhatWorkedPage \/>; break;/);
  assert.match(catalog, /key: 'spark_what_worked'[\s\S]{0,240}route: '\/app\/services\/spark_what_worked'/);
  assert.ok(subnav.includes('"/app/services/spark_what_worked"'), "the nav row is missing");
  assert.ok(card.includes("/app/services/spark_what_worked"), "the card does not link to the page");
});

test("the report is in the nav on every tier — no minTier on this row", () => {
  const row = subnav.split("\n").find((l) => l.includes('key: "spark_what_worked"'));
  assert.ok(row, "the nav row is missing");
  assert.equal(/minTier/.test(row), false, "gating existence hides the upgrade the page is meant to sell");
});

test("the two tier reasons stay two reasons", () => {
  // narrative_available -> the paragraph is a Standard feature
  // lead_intelligence   -> Hot / Warm / Cold is a Pro feature
  assert.ok(page.includes("narrative_available"), "the paragraph gate is not read");
  assert.ok(page.includes("lead_intelligence"), "the band gate is not read");
  const copy = copyOnly(page);
  assert.match(copy, /comes with Standard/);
  assert.match(copy, /comes with Pro/);
  // and neither is described as the page simply being locked
  assert.equal(/\bupgrade to unlock\b/i.test(copy), false);
});

test("the page never decides entitlement for itself", () => {
  // The server strips. The page reads flags. A component that computed a tier
  // would be a second answer to the same question.
  assert.equal(/getTenantSparkTier|meets\(|useTier\(/.test(page), false);
  assert.equal(/getTenantSparkTier|meets\(|useTier\(/.test(card), false);
});

test("no vendor, no model, no engine name reaches the owner", () => {
  for (const copy of OWNER_COPY) {
    for (const banned of [/anthropic/i, /\bclaude\b/i, /\bhaiku\b/i, /\bsonnet\b/i, /\bopenai\b/i, /\bGPT\b/,
      /\bbrave\b/i, /\bmojeek\b/i, /\bhunter\b/i]) {
      assert.equal(banned.test(copy), false, `${banned} is visible to the owner`);
    }
  }
  assert.ok(copyOnly(page).includes("Powered by ARGUS AI"));
  assert.ok(copyOnly(card).includes("Powered by ARGUS AI"));
});

test("the word 'tenant' never reaches a person, and neither does the jargon", () => {
  for (const copy of OWNER_COPY) {
    for (const banned of [/\btenant\b/i, /\bCRM\b/, /\bpipeline\b/i, /\bconversion rate\b/i, /\bROI\b/, /\battribution\b/i]) {
      assert.equal(banned.test(copy), false, `${banned} is visible to the owner`);
    }
  }
});

test("the evidence is one click away, and it is labelled in plain words", () => {
  assert.match(page, /Where this came from/);
  assert.ok(api.includes("EVIDENCE_LABEL"), "the evidence keys are not translated");
  // a few the owner would otherwise read as column names
  for (const [k, v] of [["money_collected_usd", "Money collected"], ["cost_per_paid_job_usd", "Cost per paid job"],
    ["mean_hours_to_first_reply", "Average hours to first reply"]]) {
    assert.ok(api.includes(`${k}: "${v}"`), `${k} has no plain label`);
  }
});

test("the card and the page read the same payload the email is built from", () => {
  assert.ok(card.includes("IL_FINDINGS_PATHS.report()"));
  assert.ok(page.includes("IL_FINDINGS_PATHS.report("));
  // and the card renders nothing when there is nothing to say
  assert.match(card, /if \(!report \|\| report\.empty \|\| !report\.findings\.length\) return null;/);
});

test("the card is mounted once on the SPARK overview", () => {
  const mounts = (overview.match(/<WhatWorkedCard\s*\/>/g) || []).length;
  assert.equal(mounts, 1, `expected one mount, found ${mounts}`);
  assert.ok(overview.includes('from "../../components/spark/WhatWorkedCard"'));
});

test("money is rendered as money and never as a bare number", () => {
  assert.ok(api.includes("MONEY_KEYS"));
  for (const k of ["money_collected_usd", "lead_cost_usd", "cost_per_lead_usd", "cost_per_paid_job_usd", "total_cost_usd"]) {
    assert.ok(api.includes(`"${k}"`), `${k} is not in MONEY_KEYS`);
  }
});

test("every screen a suggested move can open actually exists", () => {
  // These are the deep links LUMEN's services/il/playbooks.js hands out. They
  // are written down HERE as well because a route rename in the Portal would
  // otherwise be invisible until a client pressed a monthly report's link and
  // landed on nothing. If this list and that file disagree, one of them is
  // wrong and the walk will find it.
  //
  // Every one is a screen a CLIENT can open. The Lead Gen search screens are
  // founder-only today (App.tsx puts RequireFounderRoute on /app/spark/leadgen,
  // Hotfix B 2026-09-03), so no play may link there — a monthly report that
  // hands a client a link into a 403 is worse than no link.
  const TARGETS = [
    "/app/services/spark_contacts",   // ask_for_referrals
    "/app/services/spark_leads",      // lean_into_source, review_paid_source, work_the_hot_ones
    "/app/settings/responder",        // speed_up_replies
    "/app/services/spark_campaigns",  // repeat_best_campaign
  ];
  const app = read("App.tsx");
  for (const target of TARGETS) {
    const m = target.match(/^\/app\/services\/([a-z0-9_]+)$/);
    if (m) {
      assert.ok(catalog.includes(`key: '${m[1]}'`), `${target} is not a registered service key`);
    } else {
      const rel = target.replace(/^\/app\//, "");
      assert.ok(app.includes(`"${rel}"`) || app.includes(`path="${rel}"`),
        `${target} is not a registered route`);
    }
  }
});

test("no suggested move links into a founder-only area", () => {
  // The mirror of the list above: /app/spark/leadgen is behind
  // RequireFounderRoute, so it must not appear as a play target.
  const app = read("App.tsx");
  assert.match(app, /<Route path="spark\/leadgen" element=\{<RequireFounderRoute \/>\}>/,
    "the founder gate on Lead Gen moved — re-check the play targets in LUMEN services/il/playbooks.js");
});
