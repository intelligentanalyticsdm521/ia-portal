// StellaOverviewPage — Ledger → Overview (the STELLA landing page, and the
// section's landing per SubNav STELLA_NAV / AppShell.defaultRouteFor).
//
// Founder-approved design: the entry-level-QuickBooks-replacement look — a
// glanceable "how is the business doing" page, not a data-entry grid.
// Degrades gracefully while the backend lands: a 404 renders an honest
// "service not live yet" card, never a broken page and never fake numbers.
//
// 1 Oct 2026 — the PRODUCT overview. Brandon: "STELLA is the only section that
// doesn't have its own overview … this is helpful for things like 'Finish
// Setup' that I need to do for STELLA to connect my accounts." The page now
// reads, top to bottom: the four money numbers → Finish setup (six steps that
// tick themselves, stellaSetupSteps.ts) → the headline, charts and cards that
// were already here. The drawing lives in StellaOverviewView.tsx; this file
// fetches.
//
//   GET /ledger/overview?month=        the money numbers, charts, cards
//   GET /ledger/plaid/status + /items  step 1, step 2, and the Accounts card
//   GET /ledger/coa                    step 3
//   GET /ledger/tax-rates              step 4
//   GET /ledger/transactions?status=categorized|reconciled&limit=1   step 5
//   localStorage (accountant pack downloaded on this browser)       step 6
//
// The setup reads are non-fatal: one that fails leaves its step as a reminder
// and never breaks the Overview.
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { useEffectiveTenantId } from "../../lib/tenantContext";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";
import { StellaOverviewView, toNum, type LedgerOverview, type PlaidItemSummary } from "./StellaOverviewView";
import {
  packDownloaded, stellaSetupSteps,
  type CoaAccountInput, type PlaidStatusInput, type StellaSetupStep, type TaxRateInput,
} from "./stellaSetupSteps";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

type PlaidItemRow = PlaidItemSummary & { is_personal_card?: boolean | number | null };

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function StellaOverviewPage() {
  const { get, getFull, ready } = useStellaApi();
  const businessId = useEffectiveTenantId();
  const [month, setMonth] = useState(currentMonth());
  const [ov, setOv] = useState<LedgerOverview | null>(null);
  // Plaid connections (GET /ledger/plaid/status + /items) — shown in the
  // Accounts card once itemCount > 0, until real balances land via ingestion.
  const [plaidItems, setPlaidItems] = useState<PlaidItemSummary[]>([]);
  const [setupSteps, setSetupSteps] = useState<StellaSetupStep[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Backend contract is being shipped by a sibling build — a 404 means "not
  // live on this environment yet", which gets an honest card, not a red error.
  const [notLive, setNotLive] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotLive(false);
    try {
      const data = await get<LedgerOverview>(`/ledger/overview?month=${month}`);
      // Defensive normalize — a partial payload must never crash the landing.
      setOv({
        month: data?.month || month,
        income: toNum(data?.income),
        expenses: toNum(data?.expenses),
        net: toNum(data?.net),
        owedToYou: toNum(data?.owedToYou),
        inboxCount: toNum(data?.inboxCount),
        expensesByAccount: Array.isArray(data?.expensesByAccount) ? data.expensesByAccount : [],
        cashflow: Array.isArray(data?.cashflow) ? data.cashflow : [],
        upcomingRecurring: Array.isArray(data?.upcomingRecurring) ? data.upcomingRecurring : [],
        accounts: Array.isArray(data?.accounts) ? data.accounts : [],
      });
    } catch (e) {
      // PRE-WALK 1b: stellaApi now puts the SERVER'S SENTENCE in `message` and
      // the code in `status`, so "is this a 404" is a number to compare rather
      // than a string to search. The old substring is still accepted because a
      // non-JSON body can still come back prefixed.
      const status = (e as { status?: number })?.status;
      if (status === 404 || (e instanceof Error && e.message.includes("STELLA API 404"))) setNotLive(true);
      else setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, month]);

  // Finish setup + the Accounts card's connections. Not month-bound, so it
  // does not re-run when the month picker moves. Every read is best-effort.
  const reloadSetup = useCallback(async () => {
    const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
      try { return await p; } catch { return null; }
    };
    const bookedTotal = (r: { pagination?: { total?: number } } | null) =>
      r ? Number(r.pagination?.total || 0) : null;
    const [ps, pi, coa, rates, categorized, reconciled] = await Promise.all([
      safe(get<PlaidStatusInput>("/ledger/plaid/status")),
      safe(get<PlaidItemRow[]>("/ledger/plaid/items")),
      safe(get<CoaAccountInput[]>("/ledger/coa")),
      safe(get<TaxRateInput[]>("/ledger/tax-rates")),
      safe(getFull<{ pagination?: { total?: number } }>("/ledger/transactions?status=categorized&limit=1")),
      safe(getFull<{ pagination?: { total?: number } }>("/ledger/transactions?status=reconciled&limit=1")),
    ]);
    const items = Array.isArray(pi) ? pi : null;
    const plaidStatus = ps ? { configured: !!ps.configured, itemCount: Number(ps.itemCount || 0) } : null;
    setPlaidItems(plaidStatus && plaidStatus.itemCount > 0 && items ? items : []);
    const c = bookedTotal(categorized);
    const r = bookedTotal(reconciled);
    setSetupSteps(
      stellaSetupSteps({
        plaidStatus,
        plaidItems: items,
        coa: Array.isArray(coa) ? coa : null,
        taxRates: Array.isArray(rates) ? rates : null,
        bookedCount: c === null && r === null ? null : (c || 0) + (r || 0),
        accountantPackDownloaded: packDownloaded(browserStorage(), businessId),
      })
    );
  }, [get, getFull, businessId]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  useEffect(() => {
    if (ready) reloadSetup();
  }, [ready, reloadSetup]);

  const isCurrentMonth = month === currentMonth();

  return (
    <StellaShell
      title="Overview"
      subtitle="Your books at a glance — money in and out, what's left to set up, what needs review, and what you're owed."
      showRecord
      onRecorded={() => { reload(); reloadSetup(); }}
      actions={
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
        />
      }
      error={error}
      loading={loading && !ov && !notLive}
    >
      {notLive ? (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>The ledger service isn't reachable yet</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 6, maxWidth: 480, margin: "6px auto 0", lineHeight: 1.55 }}>
            The Overview reads live totals from the STELLA ledger API, which is still being deployed on this environment.
            Nothing is broken — this page fills in the moment the service is up.
          </div>
          <button
            onClick={() => reload()}
            style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#fff", background: STELLA_INDIGO, border: 0, borderRadius: 6, cursor: "pointer" }}
          >
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      ) : ov ? (
        <StellaOverviewView
          ov={ov}
          month={month}
          isCurrentMonth={isCurrentMonth}
          plaidItems={plaidItems}
          setupSteps={setupSteps}
        />
      ) : null}
    </StellaShell>
  );
}
