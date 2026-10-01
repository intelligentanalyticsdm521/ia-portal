// stellaSetupSteps — the six "Finish setup" steps on STELLA's Overview, and
// the rule that ticks each one from the business's own data.
//
// Brandon, 1 Oct 2026: "STELLA is the only section that doesn't have its own
// overview. All the rest have a main overview with the key points; this is
// helpful for things like 'Finish Setup' that I need to do for STELLA to
// connect my accounts through Plaid."
//
// Every step ticks itself from something the API already says — nobody ticks
// a box by hand:
//   1 Connect your bank and card   GET /ledger/plaid/status itemCount > 0
//   2 Mark your personal card      GET /ledger/plaid/items  any is_personal_card
//   3 Confirm your chart of accounts  GET /ledger/coa — an account edited
//                                  (updated_at is only ever set by a saved edit)
//                                  or added after the chart was first set up
//   4 Set your sales-tax rate      GET /ledger/tax-rates   any active rate
//   5 Review your first statement  GET /ledger/transactions — any booked row
//                                  (status categorized or reconciled)
//   6 Accountant pack              downloaded once from this browser — the API
//                                  keeps no record of a download, so this one
//                                  is remembered locally (see markPackDownloaded)
//
// An input that could not be read arrives as null and its step stays not-done
// with its ordinary sentence: a reminder, never a false tick.
//
// Zero imports — test/stella-overview-setup walks every rule.

export interface PlaidStatusInput {
  configured: boolean;
  itemCount: number;
}
export interface PlaidItemInput {
  is_personal_card?: boolean | number | null;
}
export interface CoaAccountInput {
  created_at?: string | null;
  updated_at?: string | null;
}
export interface TaxRateInput {
  is_active?: boolean | number | null;
}

export interface StellaSetupInputs {
  plaidStatus: PlaidStatusInput | null;
  plaidItems: PlaidItemInput[] | null;
  coa: CoaAccountInput[] | null;
  taxRates: TaxRateInput[] | null;
  /** How many transactions are booked (categorized + reconciled); null = unknown. */
  bookedCount: number | null;
  accountantPackDownloaded: boolean;
}

export interface StellaSetupStep {
  key: "bank" | "personal_card" | "coa" | "sales_tax" | "first_statement" | "accountant_pack";
  label: string;
  /** One plain sentence. */
  detail: string;
  done: boolean;
  route: string;
  /** Where the link goes, in the words of the nav. */
  linkLabel: string;
}

export const STELLA_SETUP_ROUTES = {
  bank: "/app/services/stella_settings_bank",
  statementImport: "/app/services/stella_ledger_accounting?tab=reconcile",
  coa: "/app/services/stella_ledger_coa",
  salesTax: "/app/services/stella_settings_sales_tax",
  inbox: "/app/services/stella_ledger_inbox",
  accountantPack: "/app/services/stella_ledger_reports?open=accountant_pack",
} as const;

/** An account created this long after the first one was added later, by someone — not by the first setup. */
export const COA_ADDED_LATER_MS = 10 * 60 * 1000;

const BANK_LINK = "Settings → Bank and card accounts";

export function bankStep(status: PlaidStatusInput | null): StellaSetupStep {
  const count = Number(status?.itemCount || 0);
  const done = count > 0;
  // Automatic connection not switched on here (dev, or before keys): the way
  // in is a statement import, and the step says so rather than pointing at a
  // greyed-out button. The tick still follows itemCount — a connection already
  // on file is a connection.
  if (status && !status.configured) {
    return {
      key: "bank",
      label: "Connect your bank and card",
      detail: done
        ? `${count} ${count === 1 ? "connection is" : "connections are"} on file, but automatic bank connection isn't switched on yet — open a reconciliation and use Import a bank statement for new transactions.`
        : "Automatic bank connection isn't switched on yet — open a reconciliation and use Import a bank statement to bring your transactions in.",
      done,
      route: STELLA_SETUP_ROUTES.statementImport,
      // The import lives inside a reconciliation, so the link names the tab it
      // really lands on (clicked 1 Oct: the list of reconciliations, not an
      // import screen).
      linkLabel: "Accounting → Bank Reconciliation",
    };
  }
  return {
    key: "bank",
    label: "Connect your bank and card",
    detail: done
      ? `Connected (${count} ${count === 1 ? "connection" : "connections"}) — new transactions come in on their own.`
      : "Link your business bank account and card so transactions come in on their own.",
    done,
    route: STELLA_SETUP_ROUTES.bank,
    linkLabel: BANK_LINK,
  };
}

export function personalCardStep(items: PlaidItemInput[] | null): StellaSetupStep {
  const list = Array.isArray(items) ? items : [];
  const done = list.some((i) => !!i.is_personal_card);
  return {
    key: "personal_card",
    label: "Mark your personal card",
    detail: done
      ? "Your personal card is marked — its business charges add up under Owed to you."
      : list.length === 0
        ? "Once your cards are connected, turn on the personal-card switch on any card that's your own."
        : "If one of your connected cards is your own, turn on its personal-card switch so you can pay yourself back.",
    done,
    route: STELLA_SETUP_ROUTES.bank,
    linkLabel: BANK_LINK,
  };
}

/** The chart has been made the business's own: an account edited, or one added after the first setup. */
export function coaMadeOwn(coa: CoaAccountInput[] | null): boolean {
  if (!Array.isArray(coa) || coa.length === 0) return false;
  if (coa.some((a) => !!a.updated_at)) return true;
  const times = coa.map((a) => Date.parse(String(a.created_at ?? ""))).filter((t) => Number.isFinite(t));
  if (times.length < 2) return false;
  const first = Math.min(...times);
  return times.some((t) => t - first > COA_ADDED_LATER_MS);
}

export function coaStep(coa: CoaAccountInput[] | null): StellaSetupStep {
  const done = coaMadeOwn(coa);
  const empty = Array.isArray(coa) && coa.length === 0;
  return {
    key: "coa",
    label: "Confirm your chart of accounts",
    detail: done
      ? "You've made the list your own."
      : empty
        ? "Set up the list of accounts your money is sorted into — the standard set for a service business is one click."
        : "Look over the accounts your money is sorted into, and rename, add or hide any that don't fit.",
    done,
    route: STELLA_SETUP_ROUTES.coa,
    linkLabel: "Ledger → Chart of Accounts",
  };
}

export function salesTaxStep(rates: TaxRateInput[] | null): StellaSetupStep {
  const active = (Array.isArray(rates) ? rates : []).filter((r) => r.is_active === undefined || r.is_active === null || !!r.is_active);
  const done = active.length > 0;
  return {
    key: "sales_tax",
    label: "Set your sales-tax rate",
    detail: done
      ? `${active.length === 1 ? "Your rate is" : `${active.length} rates are`} set — keep ${active.length === 1 ? "it" : "them"} current when the rate changes.`
      : "Enter the sales-tax rate you charge so invoices and your sales-tax total come out right.",
    done,
    route: STELLA_SETUP_ROUTES.salesTax,
    linkLabel: "Settings → Sales tax",
  };
}

export function firstStatementStep(bookedCount: number | null): StellaSetupStep {
  const done = Number(bookedCount || 0) > 0;
  return {
    key: "first_statement",
    label: "Review your first statement",
    detail: done
      ? "Transactions are being booked — keep the Inbox clear as new ones arrive."
      : "Go through the transactions waiting in the Inbox and give each one an account.",
    done,
    route: STELLA_SETUP_ROUTES.inbox,
    linkLabel: "Ledger → Inbox",
  };
}

export function accountantPackStep(downloaded: boolean): StellaSetupStep {
  return {
    key: "accountant_pack",
    label: "Accountant pack",
    detail: downloaded
      ? "Downloaded — make a fresh one whenever your accountant asks."
      : "Download the general ledger, trial balance and transaction list for your accountant in one go.",
    done: !!downloaded,
    route: STELLA_SETUP_ROUTES.accountantPack,
    linkLabel: "Reports → Accountant pack",
  };
}

/** The six steps, in order. */
export function stellaSetupSteps(i: StellaSetupInputs): StellaSetupStep[] {
  return [
    bankStep(i.plaidStatus),
    personalCardStep(i.plaidItems),
    coaStep(i.coa),
    salesTaxStep(i.taxRates),
    firstStatementStep(i.bookedCount),
    accountantPackStep(i.accountantPackDownloaded),
  ];
}

export function allStepsDone(steps: StellaSetupStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

// ── Accountant pack: remembered on this browser ────────────────────────────
// The export route writes no record of a download, so "done once" is kept in
// localStorage per business. Honest about its limits: another browser or a
// cleared profile shows the step again.

export interface PackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function packKey(businessId: string | null | undefined): string {
  return `stella_accountant_pack_downloaded:${businessId || "self"}`;
}

export function markPackDownloaded(storage: PackStorage | null | undefined, businessId: string | null | undefined, now: number): void {
  if (!storage) return;
  try {
    storage.setItem(packKey(businessId), String(now));
  } catch {
    /* blocked storage — the step simply stays a reminder */
  }
}

export function packDownloaded(storage: PackStorage | null | undefined, businessId: string | null | undefined): boolean {
  if (!storage) return false;
  try {
    return !!storage.getItem(packKey(businessId));
  } catch {
    return false;
  }
}
