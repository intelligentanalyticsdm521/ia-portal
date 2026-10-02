// stellaSetupLoad — read the six "Finish setting up" signals from the STELLA
// API, once, for STELLA's product Dashboard.
//
// Brandon, 2 Oct 2026: "STELLA is supposed to have it's own dashboard/overview
// … that's where the platform cross features stuff lives, like finish set up".
// Ledger → Overview drew the same checklist until the independent review of
// the same day (the same six-step card, read twice); it now draws none, and
// reads only GET /ledger/plaid/items for its Accounts card.
//
//   GET /ledger/plaid/status + /items  step 1, step 2 (a connection that needs
//                                      attention keeps step 1 open)
//   GET /ledger/coa                    step 3
//   GET /ledger/tax-rates              step 4
//   GET /ledger/transactions?status=categorized|reconciled&limit=1   step 5
//   GET /ledger/audit-log?entity_table=stella.accountant_pack&action=export&limit=1
//     + localStorage (a download from this browser before the API kept a
//       record)                                                      step 6
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
  // oliver-api routes/stellaAccountantExport.js records each real download.
  packExports: "/ledger/audit-log?entity_table=stella.accountant_pack&action=export&limit=1",
} as const;

/** GET /ledger/plaid/items row, as far as the setup steps read it. */
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
  const [ps, pi, coa, rates, categorized, reconciled, packRows] = await Promise.all([
    safeRead(api.get<PlaidStatusInput>(R.plaidStatus)),
    safeRead(api.get<PlaidItemRow[]>(R.plaidItems)),
    safeRead(api.get<CoaAccountInput[]>(R.coa)),
    safeRead(api.get<TaxRateInput[]>(R.taxRates)),
    safeRead(api.getFull<Paged>(R.categorized)),
    safeRead(api.getFull<Paged>(R.reconciled)),
    safeRead(api.get<unknown[]>(R.packExports)),
  ]);
  const plaidItems = Array.isArray(pi) ? pi : null;
  const plaidStatus = ps ? { configured: !!ps.configured, itemCount: Number(ps.itemCount || 0) } : null;
  const c = pagedTotal(categorized);
  const r = pagedTotal(reconciled);
  const bookedCount = c === null && r === null ? null : (c || 0) + (r || 0);
  const packRecorded = Array.isArray(packRows) && packRows.length > 0;
  return {
    steps: stellaSetupSteps({
      plaidStatus,
      plaidItems,
      coa: Array.isArray(coa) ? coa : null,
      taxRates: Array.isArray(rates) ? rates : null,
      bookedCount,
      accountantPackDownloaded: packRecorded || packDownloaded(storage, businessId),
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
