// reportGroups.ts — the catalog's unit is a GROUP, not a single report.
//
// Brandon, 2026-08-16: "Traffic by Channel, Traffic by Medium — do we need two
// reports for that as far as visible clickable independent reports, or do we
// merge them into a Traffic report and then inside the report we have a tab for
// each... 20+ reports are hard to know where I go to find the data."
//
// The reports themselves are right; there were just too many front doors. So
// this groups them for DISPLAY only. Nothing merges at the data level, and that
// is deliberate: deriveDeepReport computes its narrative, bands, movement,
// concentration and volatility across one item list, so folding "Visitors by
// Country" and "Experience by Browser" into a single report would have it
// comparing Canada to Safari and stating the result as fact. Tabs keep each
// report's analysis exactly as it is and put them behind one door.
//
// The grouping key is the `section` every report already carries — the same
// anchor the Trends drill-through uses. So the catalog ends up with the same
// shape as the nav (dashboard > section > report) instead of being a flat list
// nobody can map back to where the score came from, and no new taxonomy had to
// be invented to get there.

import type { DetailPayload, DetailReport } from "./detail";
import type { DashboardDef } from "./catalog";

export interface ReportGroup {
  /** Section key, e.g. "audience_conversion.traffic_volume". */
  key: string;
  /** Section label from the dashboard def — "Traffic Volume". */
  label: string;
  /** Dashboard key, so the catalog can group by feature as before. */
  dashboardKey: string;
  /** The reports in this group, in catalog order. One per tab. */
  reports: DetailReport[];
}

/** "dashKey.sectionKey" → the section's own label, taken from the dashboards. */
export function sectionLabels(dashboards: DashboardDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of dashboards) {
    for (const s of d.sections) out[`${d.key}.${s.key}`] = s.label;
  }
  return out;
}

/**
 * Group a product's reports by the section they belong to.
 *
 * A section holding a single report still becomes a group — it just renders
 * without a tab strip, so the catalog stays one consistent kind of card.
 */
export function buildReportGroups(
  detail: DetailPayload | undefined,
  dashboards: DashboardDef[],
): ReportGroup[] {
  const labels = sectionLabels(dashboards);
  const byKey = new Map<string, ReportGroup>();

  for (const rep of Object.values(detail || {})) {
    // Same rule as everywhere: no data, no door — EXCEPT a report whose server
    // stated a fact about the empty state. "You owe $0.00 on open bills" is an
    // answer, not an absence (STELLA's AP Aging with nothing open, D-177).
    if (!rep?.items?.length && !rep?.facts?.length) continue;
    const section = String(rep.section || "");
    const dashboardKey = section.split(".")[0];
    // A report whose section is unknown to the dashboards (an Intelligence
    // mirror, say) still needs a home, so it groups under its own id and shows
    // its own label rather than being dropped or piled into a junk bucket.
    const key = labels[section] ? section : `report:${rep.id}`;
    const label = labels[section] || rep.label;

    let g = byKey.get(key);
    if (!g) {
      g = { key, label, dashboardKey, reports: [] };
      byKey.set(key, g);
    }
    g.reports.push(rep);
  }

  for (const g of byKey.values()) {
    g.reports.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Order follows the dashboards, then their sections, so the catalog reads in
  // the same order as the nav.
  const order: string[] = [];
  for (const d of dashboards) for (const s of d.sections) order.push(`${d.key}.${s.key}`);
  return [...byKey.values()].sort((a, b) => {
    const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

/** The group containing a given report id, plus which tab it is. */
export function findGroupFor(
  groups: ReportGroup[],
  reportId: string,
): { group: ReportGroup; tabIndex: number } | null {
  for (const g of groups) {
    const i = g.reports.findIndex((r) => r.id === reportId);
    if (i >= 0) return { group: g, tabIndex: i };
  }
  return null;
}
