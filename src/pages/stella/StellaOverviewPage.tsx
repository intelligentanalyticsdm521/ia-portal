// StellaOverviewPage — Ledger → Overview, the LEDGER feature's overview (the
// Ledger group's landing in SubNav STELLA_NAV).
//
// 2 Oct 2026 — no longer STELLA's landing. Brandon: "Everything is in
// STELLA>Ledger>Overview. Each feature has an overview and then STELLA is
// supposed to have it's own dashboard/overview." STELLA's rail icon now opens
// the product Dashboard (StellaDashboardPage, stella_dashboard), first item in
// the STELLA nav like every other product's.
//
// 2 Oct 2026 (independent review) — and so the "Finish setup" card is no longer
// drawn here. The same six-step card sat on both pages and was read twice;
// cross-feature setup is the Dashboard's job (Brandon: "that's where the
// platform cross features stuff lives, like finish set up"), and no other
// product puts its setup checklist on a feature overview. This page reads only
// what it draws: the money numbers, and the bank connections for its Accounts
// card (GET /ledger/plaid/items — the rows that are not removed, the same set
// /ledger/plaid/status counts).
//
// Founder-approved design: the entry-level-QuickBooks-replacement look — a
// glanceable "how is the business doing" page, not a data-entry grid.
// Degrades gracefully while the backend lands: a 404 renders an honest
// "service not live yet" card, never a broken page and never fake numbers.
//
// 1 Oct 2026 this page briefly carried "Finish setup" as STELLA's product
// overview; on 2 Oct that role (and the checklist) moved to the Dashboard. It
// reads, top to bottom: the four money numbers → the headline, charts and
// cards. The drawing lives in StellaOverviewView.tsx; this file fetches.
//
//   GET /ledger/overview?month=        the money numbers, charts, cards
//   GET /ledger/plaid/items            the connections the Accounts card shows
//
// The connections read is non-fatal: if it fails the card shows its empty
// state and the Overview still draws.
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";
import { StellaOverviewView, toNum, type LedgerOverview, type PlaidItemSummary } from "./StellaOverviewView";
import { safeRead } from "./stellaSetupLoad";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function StellaOverviewPage() {
  const { get, ready } = useStellaApi();
  const [month, setMonth] = useState(currentMonth());
  const [ov, setOv] = useState<LedgerOverview | null>(null);
  // Plaid connections (GET /ledger/plaid/items) — shown in the Accounts card
  // once one exists, until real balances land via ingestion.
  const [plaidItems, setPlaidItems] = useState<PlaidItemSummary[]>([]);
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

  // The Accounts card's connections. Not month-bound, so it does not re-run
  // when the month picker moves. Best-effort.
  const reloadAccounts = useCallback(async () => {
    const items = await safeRead(get<PlaidItemSummary[]>("/ledger/plaid/items"));
    setPlaidItems(Array.isArray(items) ? items : []);
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  useEffect(() => {
    if (ready) reloadAccounts();
  }, [ready, reloadAccounts]);

  const isCurrentMonth = month === currentMonth();

  return (
    <StellaShell
      title="Overview"
      subtitle="Your books at a glance — money in and out, what needs review, and what you're owed."
      showRecord
      onRecorded={() => { reload(); }}
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
        />
      ) : null}
    </StellaShell>
  );
}
