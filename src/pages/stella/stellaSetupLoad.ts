// stellaSetupLoad — read the six "Finish setup" signals from the STELLA API,
// once, for whichever page draws STELLA's setup checklist.
//
// Two pages draw it: the product Dashboard (stella_dashboard, 2 Oct 2026 —
// Brandon: "STELLA is supposed to have it's own dashboard/overview … that's
// where the platform cross features stuff lives, like finish set up") and
// Ledger → Overview (1 Oct 2026). They read the same six signals, so they read
// them HERE — one list of endpoints, not two copies that drift apart.
//
//   GET /ledger/plaid/status + /items  step 1, step 2 (and the Ledger
//                                      Overview's Accounts card)
//   GET /ledger/coa                    step 3
//   GET /ledger/tax-rates              step 4
//   GET /ledger/transactions?status=categorized|reconciled&limit=1   step 5
//   localStorage (accountant pack downloaded on this browser)       step 6
//
// Every read is best-effort: one that fails arrives as null and its step stays
// a reminder (stellaSetupSteps.ts) — never a false tick, never a broken page.
//
// No React, no MSAL, no import.meta.env: the caller hands in its `get` /
// `getFull`, so test/stella-dashboard reads it with a fake API.
import {
  packDownloaded,
  stellaSetupSteps,
  type CoaAccountInput,
  type PackStorage,
  type PlaidItemInput,
  type PlaidStatusInput,
  type StellaSetupStep,
  type TaxRateInput,
} from "./stellaSetupSteps";

/** The two reads useStellaApi gives a page: `get` unwraps { data }, `getFull` keeps the envelope. */
export interface StellaReader {
  get<T>(path: string): Promise<T>;
  getFull<T>(path: string): Promise<T>;
}

export const STELLA_SETUP_READS = {
  plaidStatus: "/ledger/plaid/status",
  plaidItems: "/ledger/plaid/items",
  coa: "/ledger/coa",
  taxRates: "/ledger/tax-rates",
  categorized: "/ledger/transactions?status=categorized&limit=1",
  reconciled: "/ledger/transactions?status=reconciled&limit=1",
} as const;

/** GET /ledger/plaid/items row, as far as the setup steps and the Accounts card read it. */
export interface PlaidItemRow extends PlaidItemInput {
  item_id: string;
  institution_name?: string | null;
}

export interface StellaSetupData {
  steps: StellaSetupStep[];
  /** null = the status read failed. */
  plaidStatus: PlaidStatusInput | null;
  /** null = the items read failed. */
  plaidItems: PlaidItemRow[] | null;
  /** Booked (categorized + reconciled) transactions; null = both reads failed. */
  bookedCount: number | null;
}

/** A failed read becomes null instead of a throw. */
export async function safeRead<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

type Paged = { pagination?: { total?: number } };

function pagedTotal(r: Paged | null): number | null {
  return r ? Number(r.pagination?.total || 0) : null;
}

export async function loadStellaSetup(
  api: StellaReader,
  storage: PackStorage | null | undefined,
  businessId: string | null | undefined,
): Promise<StellaSetupData> {
  const R = STELLA_SETUP_READS;
  const [ps, pi, coa, rates, categorized, reconciled] = await Promise.all([
    safeRead(api.get<PlaidStatusInput>(R.plaidStatus)),
    safeRead(api.get<PlaidItemRow[]>(R.plaidItems)),
    safeRead(api.get<CoaAccountInput[]>(R.coa)),
    safeRead(api.get<TaxRateInput[]>(R.taxRates)),
    safeRead(api.getFull<Paged>(R.categorized)),
    safeRead(api.getFull<Paged>(R.reconciled)),
  ]);
  const plaidItems = Array.isArray(pi) ? pi : null;
  const plaidStatus = ps ? { configured: !!ps.configured, itemCount: Number(ps.itemCount || 0) } : null;
  const c = pagedTotal(categorized);
  const r = pagedTotal(reconciled);
  const bookedCount = c === null && r === null ? null : (c || 0) + (r || 0);
  return {
    steps: stellaSetupSteps({
      plaidStatus,
      plaidItems,
      coa: Array.isArray(coa) ? coa : null,
      taxRates: Array.isArray(rates) ? rates : null,
      bookedCount,
      accountantPackDownloaded: packDownloaded(storage, businessId),
    }),
    plaidStatus,
    plaidItems,
    bookedCount,
  };
}

/** window.localStorage, or null where the browser blocks it. */
export function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
