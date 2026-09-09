/**
 * insightsDemo — the ONE switch that allows made-up numbers on an insights page,
 * and it only exists in a dev build.
 *
 * The seeded demo generators (analytics/sparkDashboards.demoSparkMetrics,
 * analytics/sparkDetail.demoSparkDetail, analytics/healthSummary.demoBusinessPulse)
 * are genuinely useful: they let somebody look at the layout of a dashboard
 * without a database full of a year's marketing. What they must never do is stand
 * in for a real business's numbers, which is exactly what they did until
 * 2026-09-08 — every SPARK insight page fell back to them whenever the metrics
 * fetch failed or came back empty, with nothing on screen saying so.
 *
 * TWO LOCKS, and production has neither:
 *   1. `import.meta.env.DEV` — false in every built bundle, so a production
 *      deploy cannot render a sample number whatever anybody sets.
 *   2. `VITE_INSIGHTS_DEMO=1` — off by default even in dev, so the default dev
 *      experience is the honest empty state (which is the thing that needs
 *      looking at, and the thing a walk row checks).
 *
 * And when it IS on, every page that uses it renders <SampleDataBadge/>. A sample
 * number with no label is the defect; a sample number with a label is a tool.
 */
export function insightsDemoAllowed(): boolean {
  try {
    // Vite replaces both at build time; the guard is here for a test runner that
    // does not define import.meta.env at all.
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env || {};
    if (!env.DEV) return false;
    return String(env.VITE_INSIGHTS_DEMO ?? "") === "1";
  } catch {
    return false;
  }
}
