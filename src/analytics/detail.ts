// detail.ts — types + helpers for the dimensioned DETAIL reports.
//
// A detail report is the line-item layer under a section: the individual
// queries, referrers, keywords, pages, devices — each with its own 12-month
// trend and month-over-month, or (for feeds like reviews/audit issues) a list
// with columns. This is the depth Brandon required — "online.seranking.com, up
// or down" — not a single aggregate per month.

import type { ValueFormat } from "./scoring";

export interface DetailColumn {
  key: string;
  label: string;
  format: ValueFormat | "text";
  lowerBetter?: boolean;
}

export interface DetailItem {
  name: string;
  series: Array<number | null>;      // primary metric, 12 months (empty for feeds)
  extra?: Record<string, number | string>;
  momPct?: number | null;            // precomputed MoM of the primary series
}

export interface DetailReport {
  id: string;
  section: string;                   // "dashboardKey.sectionKey"
  label: string;
  itemLabel: string;
  primaryLabel?: string;
  format: ValueFormat;
  higherIsBetter: boolean;
  columns?: DetailColumn[];
  items: DetailItem[];
  kind?: "trend" | "feed";
}

export type DetailPayload = Record<string, DetailReport>;

/** MoM of an item's primary series (fallback if the server didn't precompute). */
export function itemMom(item: DetailItem): number | null {
  if (item.momPct != null) return item.momPct;
  const s = item.series?.filter((v): v is number => v != null) || [];
  if (s.length < 2) return null;
  const cur = s[s.length - 1], prev = s[s.length - 2];
  return prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;
}

/** Pluralize an item label: query → queries, crew → crews, business → businesses. */
export function pluralize(label: string, n: number): string {
  const l = label.toLowerCase();
  if (n === 1) return l;
  if (/[sxz]$|[cs]h$/.test(l)) return l + "es";
  if (/[^aeiou]y$/.test(l)) return l.slice(0, -1) + "ies";
  return l + "s";
}

/** The detail reports that belong to one section, in a stable order. */
export function reportsForSection(detail: DetailPayload | undefined, dashKey: string, secKey: string): DetailReport[] {
  if (!detail) return [];
  const want = `${dashKey}.${secKey}`;
  return Object.values(detail).filter((r) => r.section === want);
}
