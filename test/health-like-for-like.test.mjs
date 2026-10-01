// test/health-like-for-like.test.mjs — the Platform gauge's "previous" is like
// for like (Brandon, 1 Oct 2026).
//
// The Platform Score is 50/50 Trend + Intelligence. Its "previous" used to be
// blend(Trend prior, Intelligence prior) — and the Intelligence mirror carries
// no prior, so that fell back to the Trend prior ALONE: the gauge compared a
// blended score with a Trend-only one and showed (Intelligence − Trend) / 2 as
// a change every month even when nothing moved (live: SPARK 63 vs 60 "+3",
// like for like 63 vs 64).
//
// The rule now is LUMEN's monthly review (lumen-api src/services/insightsReview/
// review.js scoreProduct → likePrior): last month's Trend prior blended with the
// Intelligence score re-run on the series without their last month. The email
// and the gauge say the same change.
//
// Run:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as H from "../src/analytics/healthSummary.ts";
import { buildSparkDashboards, demoSparkMetrics } from "../src/analytics/sparkDashboards.ts";
import { demoArionMetricsClient } from "../src/analytics/arionDemoClient.ts";
import { demoOliverMetrics } from "../src/analytics/oliverDashboards.ts";
import { buildIntelligenceMirror, SPARK_MIRROR } from "../src/analytics/intelligenceMirror.ts";

/** A business where nothing moved: every series holds one value all year. */
function flatPayload(live = demoSparkMetrics("spark")) {
  const metrics = Object.fromEntries(
    Object.entries(live.metrics).map(([k, s]) => [k, s.map(() => s.find((v) => v != null) ?? null)]),
  );
  return { ...live, metrics };
}

function health(p) {
  const trend = buildSparkDashboards(p);
  const intel = buildIntelligenceMirror(p, SPARK_MIRROR).dashboards;
  return H.platformHealth(trend, intel, "/t", "/i", H.priorIntelligence(p, SPARK_MIRROR));
}

test("fixture: Intelligence differs from Trend and nothing moved", () => {
  const h = health(flatPayload());
  assert.ok(h.trendScore != null && h.intelScore != null);
  assert.notEqual(h.intelScore, h.trendScore, "the fixture must have Intelligence ≠ Trend, or it proves nothing");
  assert.equal(h.trendPrior, h.trendScore, "nothing moved on the Trend side");
  // The old rule's answer on this fixture — the defect this test exists for.
  assert.notEqual(H.blend5050(h.trendPrior, h.intelPrior), h.platformScore,
    "with the Trend prior alone the gauge would show a change here");
});

test("nothing moved → the Platform gauge says no change", () => {
  const h = health(flatPayload());
  assert.equal(h.platformPrior, h.platformScore);
});

test("the previous is the Trend prior blended with Intelligence re-run without the last month", () => {
  const p = demoSparkMetrics("spark");
  const h = health(p);
  const intelBefore = H.rollupScore(buildIntelligenceMirror(H.withoutLastMonth(p), SPARK_MIRROR).dashboards).score;
  assert.equal(h.platformPrior, H.blend5050(h.trendPrior, intelBefore));
});

test("withoutLastMonth drops the final month of every series and keeps the months list (as LUMEN does)", () => {
  const p = { source: "demo", months: ["2026-07", "2026-08", "2026-09"], metrics: { a: [1, 2, 3], b: [null, 5, 6] } };
  const w = H.withoutLastMonth(p);
  assert.deepEqual(w.metrics, { a: [1, 2], b: [null, 5] });
  assert.deepEqual(w.months, p.months);
  assert.deepEqual(p.metrics.a, [1, 2, 3], "the page's own payload is not touched");
});

test("Business Pulse's previous is built from the like-for-like platform previouses", () => {
  const bp = H.demoBusinessPulse("spark", {
    arionPayload: flatPayload(demoArionMetricsClient("spark")),
    sparkPayload: flatPayload(),
    oliverPayload: flatPayload(demoOliverMetrics("spark")),
  });
  assert.ok(bp.pulse != null);
  // Nothing moved in any product, so the Pulse did not move either.
  assert.equal(bp.prior, bp.pulse);
});

test("every Health page passes last month's Intelligence to the gauge", () => {
  for (const rel of [
    "arion/pages/iainsights/ArionIAInsightsHealthPage.tsx",
    "pages/spark/SparkIAInsightsHealthPage.tsx",
    "pages/oliver/OliverIAInsightsHealthPage.tsx",
    "pages/argus/ArgusHealthPage.tsx",
  ]) {
    const src = fs.readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
    assert.match(src, /platformHealth\([^)]*priorIntelligence\(/, `${rel} builds the gauge without last month's Intelligence`);
  }
});

test("the old blend of the two priors is gone from healthSummary", () => {
  const src = fs.readFileSync(new URL("../src/analytics/healthSummary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /prior: blend5050\(t\.prior, i\.prior\)|platformPrior: blend5050\(t\.prior, i\.prior\)/);
});
