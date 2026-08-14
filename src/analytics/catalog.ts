// catalog.ts — shared dashboard-catalog types + builder for every platform.
//
// A platform's Trends dashboards are declared as data (DashboardDef[]); this
// turns that + a monthly-series payload into scored DashboardScore[] via the
// scoring engine. ARION / SPARK / OLIVER / ARGUS all use this.

import {
  scoreDashboard,
  type DashboardInput, type DashboardScore, type DataPointInput,
  type Benchmark, type ValueFormat, type VisualKind, type BenchmarkKind,
} from "./scoring";
import type { MetricsPayload } from "./arionDashboards";

export interface MetricDef {
  key: string;
  label: string;
  what: string;
  higherIsBetter: boolean;
  format: ValueFormat;
  visual: VisualKind;
  weight: number;
  sufficiencyFloor?: number;
  benchmark?: { value: number; kind: BenchmarkKind };
}
export interface SectionDef { key: string; label: string; weight: number; metrics: MetricDef[]; }
export interface DashboardDef { key: string; label: string; question: string; sections: SectionDef[]; }

/** Compact metric constructor. */
export const met = (
  key: string, label: string, format: ValueFormat, visual: VisualKind,
  higherIsBetter: boolean, weight: number, what: string,
  benchmark?: { value: number; kind: BenchmarkKind }, sufficiencyFloor?: number,
): MetricDef => ({ key, label, format, visual, higherIsBetter, weight, what, benchmark, sufficiencyFloor });

/** Build scored dashboards from defs + monthly-series payload. */
export function buildDashboards(
  defs: DashboardDef[],
  payload: MetricsPayload,
  unmeasuredFor: (dashKey: string) => { reason: string; kind: "connect" | "plan" },
): DashboardScore[] {
  const M = payload?.metrics || {};
  return defs.map((dash): DashboardScore => {
    const input: DashboardInput = {
      key: dash.key, label: dash.label,
      sections: dash.sections.map((sec) => ({
        key: sec.key, label: sec.label, weight: sec.weight,
        dataPoints: sec.metrics.map((mm): DataPointInput => {
          const series = M[mm.key];
          const unmeasured = !series || series.every((v) => v == null) ? unmeasuredFor(dash.key) : undefined;
          // Industry benchmark ladder (2026-07-26): the payload can carry
          // per-tenant researched benchmarks (arion.ia_insights_benchmark,
          // resolved detail→medium→high→default server-side). They override
          // the catalog's hardcoded defaults — this is what lets a strong
          // business score ABOVE 70 instead of capping at own-average.
          const industry = payload?.benchmarks?.[mm.key];
          const benchmark = industry != null
            ? ({ value: Number(industry), kind: "absolute" } as Benchmark)
            : (mm.benchmark as Benchmark | undefined);
          return {
            key: mm.key, label: mm.label, what: mm.what,
            series: series || [null], higherIsBetter: mm.higherIsBetter,
            format: mm.format, visual: mm.visual, weight: mm.weight,
            sufficiencyFloor: mm.sufficiencyFloor,
            benchmark,
            unmeasured,
          };
        }),
      })),
    };
    const scored = scoreDashboard(input);
    // carry the question through for the detail header
    (scored as any).question = dash.question;
    return scored;
  });
}
