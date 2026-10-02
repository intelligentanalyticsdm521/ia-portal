// StellaDashboardPage — STELLA → Dashboard (stella_dashboard), the PRODUCT
// dashboard: the first item in the STELLA nav, and what STELLA's rail icon
// opens (AppShell.defaultRouteFor → navRoleFilter.railRouteFor takes the first
// item of the nav this person sees), the same as OLIVER's, SPARK's and ARION's
// Dashboards.
//
// Brandon, 2 Oct 2026: "I still do not see the STELLA overview. Everything is
// in STELLA>LEdger>Overview. Each feature has an overview and then STELLA is
// supposed to have it's own dashboard/overview. all the other platforms call
// it a dashboard and that's where the platform cross features stuff lives,
// like finish set up, etc."
//
// Ledger → Overview stays the Ledger feature's own overview (money in and out,
// charts, accounts). This page is the cross-feature layer above it, and the
// only page that draws the setup checklist:
//
//   loadStellaSetup (stellaSetupLoad.ts)   Finish setting up — six steps
//   GET /ledger/overview                   inbox count + owed to you (all time)
//   GET /ledger/ap-aging                   open bills: overdue, due this week
//   GET /ledger/periods                    is last month closed?
//   GET /ledger/transactions?from=&to=&limit=1               anything dated last month?
//   GET /ledger/transactions?from=&to=&status=void&limit=1   … less the voided lines
//
// Fetched once per visit (convention_data_fetching), all in parallel, every
// read best-effort. A read that fails shows "Couldn't check right now" on its
// own tile — never "nothing to do". If NOTHING answers: a refusal that will not
// go away (STELLA not on the plan, or this person not given it) says so in
// words; anything else gets one plain line and a Try again.
//
// The accountant's view (useOliverRole → allowedServiceKeys) hides the owner's
// bank setup steps and the areas their nav does not hold (StellaDashboardView).
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { useOliverRole } from "../../hooks/useOliverRole";
import { useEffectiveTenantId } from "../../lib/tenantContext";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";
import { StellaDashboardView } from "./StellaDashboardView";
import type { StellaSetupStep } from "./stellaSetupSteps";
import { browserStorage, loadStellaSetup } from "./stellaSetupLoad";
import {
  STELLA_ACCESS_SENTENCES, accessFromFailures, lastMonthBookCount, lastMonthRange, localDateString, stellaNeedsYou,
  type ApAgingInput, type DashboardAccess, type NeedTile, type OverviewInput, type PeriodInput,
} from "./stellaDashboard";

export const STELLA_DASHBOARD_READS = {
  overview: "/ledger/overview",
  apAging: "/ledger/ap-aging",
  periods: "/ledger/periods",
  lastMonth: (start: string, end: string) => `/ledger/transactions?from=${start}&to=${end}&limit=1`,
  lastMonthVoid: (start: string, end: string) => `/ledger/transactions?from=${start}&to=${end}&status=void&limit=1`,
} as const;

type Paged = { pagination?: { total?: number } };

export function StellaDashboardPage() {
  const { get, getFull, ready } = useStellaApi();
  const { roleInfo } = useOliverRole();
  const businessId = useEffectiveTenantId();
  const [setupSteps, setSetupSteps] = useState<StellaSetupStep[] | null>(null);
  const [needs, setNeeds] = useState<NeedTile[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [access, setAccess] = useState<DashboardAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const today = localDateString(new Date());
    const lm = lastMonthRange(today);
    const R = STELLA_DASHBOARD_READS;
    // Each failure is kept, so a permanent refusal (403) can be told apart
    // from a blip.
    const failures: unknown[] = [];
    const read = async <T,>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch (e) {
        failures.push(e);
        return null;
      }
    };
    const [setup, overview, apAging, periods, lastMonth, lastMonthVoid] = await Promise.all([
      loadStellaSetup({ get, getFull }, browserStorage(), businessId),
      read(get<OverviewInput>(R.overview)),
      read(get<ApAgingInput>(R.apAging)),
      read(get<PeriodInput[]>(R.periods)),
      read(getFull<Paged>(R.lastMonth(lm.start, lm.end))),
      read(getFull<Paged>(R.lastMonthVoid(lm.start, lm.end))),
    ]);
    // Nothing answered at all: the service is down, not deployed here, or
    // refusing this business / this person for good.
    const none = !overview && !apAging && !periods && !lastMonth && !setup.plaidStatus && setup.bookedCount === null;
    setUnreachable(none);
    setAccess(none ? accessFromFailures(failures) : null);
    setSetupSteps(setup.steps);
    setNeeds(
      stellaNeedsYou({
        overview,
        apAging,
        periods: Array.isArray(periods) ? periods : null,
        lastMonthCount: lastMonthBookCount(
          lastMonth ? Number(lastMonth.pagination?.total || 0) : null,
          lastMonthVoid ? Number(lastMonthVoid.pagination?.total || 0) : null,
        ),
        today,
      })
    );
    setLoading(false);
  }, [get, getFull, businessId]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  return (
    <StellaShell
      title="Dashboard"
      subtitle="Across STELLA — what's left to set up, what needs you, and a way into each part."
      showRecord
      onRecorded={() => { reload(); }}
      loading={loading && !needs}
    >
      {unreachable && access ? (
        <div data-access={access} style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>{STELLA_ACCESS_SENTENCES[access].title}</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", maxWidth: 480, margin: "6px auto 0", lineHeight: 1.55 }}>
            {STELLA_ACCESS_SENTENCES[access].detail}
          </div>
        </div>
      ) : unreachable ? (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>We couldn't reach your books just now</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", maxWidth: 480, margin: "6px auto 0", lineHeight: 1.55 }}>
            Nothing is lost — this page fills in as soon as STELLA answers.
          </div>
          <button
            onClick={() => reload()}
            style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#fff", background: STELLA_INDIGO, border: 0, borderRadius: 6, cursor: "pointer" }}
          >
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      ) : needs ? (
        <StellaDashboardView setupSteps={setupSteps} needs={needs} allowedServiceKeys={roleInfo.allowedServiceKeys} />
      ) : null}
    </StellaShell>
  );
}
