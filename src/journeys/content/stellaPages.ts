// stellaPages.ts — teaching copy for the LIVE STELLA Ledger + Unit Economics
// pages (August build: Ledger L1 + Unit Economics L2).
//
// Only live pages get authored copy — gated Database Manager / Custom
// Reporting / IA Insights surfaces and the P3 Mileage & Materials page are
// deliberately unauthored, so buildPageSteps skips them instead of walking a
// user into a locked screen (missingPageContent reports them honestly).
//
// Money caution (the OLIVER rule): the ONE hands-on exercise records a small
// test expense and marks it reimbursed — reversible via Void, never touching
// bank connections or real payment rails. Nothing here deletes financial data.
import type { PageContentMap } from "../pageGuide";

export const STELLA_PAGES: PageContentMap = {
  // ── Ledger ──────────────────────────────────────────────────────────────
  stella_ledger_overview: {
    title: "Overview — how the business is doing",
    body:
      "STELLA is your ledger: every dollar in and out, categorized so reports write themselves. This landing page answers one question at a glance — how is the business doing this month — and points you at the single most useful next step.",
    onPage: [
      {
        title: "The headline picks itself",
        body:
          "This banner always shows the one thing that matters most right now: transactions waiting for review, money you're owed back, or the month's profit verdict. The button on the right takes you straight to it.",
        targetSelector: '[data-tour="stella-overview-hero"]',
        placement: "bottom",
      },
      {
        title: "The four money numbers",
        body:
          "Money in, money out, net, and owed to you — for the month in the picker above. Net green means in the black. These are the same totals your P&L is built from, so this row and Reports never disagree.",
        targetSelector: '[data-tour="stella-overview-kpis"]',
        placement: "bottom",
      },
      {
        title: "Owed to you — paying yourself back",
        body:
          "Expenses you covered with a personal card or cash sit here until you reimburse yourself. It's the number most owners quietly lose track of — STELLA holds it in view until it's settled.",
        targetSelector: '[data-tour="stella-owed-tile"]',
        placement: "bottom",
      },
      {
        title: "Your accounts",
        body:
          "Connected bank and card balances live here, with a Personal badge on any card you've marked as personal-but-business-use. Nothing linked yet? The link below jumps to Bank and card accounts to set it up.",
        targetSelector: '[data-tour="stella-accounts-card"]',
        placement: "top",
      },
    ],
  },
  stella_ledger_inbox: {
    title: "Inbox — the five-minute bookkeeping habit",
    body:
      "New transactions queue here until you've told STELLA what they are. Clear it with coffee once a week and your books stay accurate without ever feeling like bookkeeping.",
    onPage: [
      {
        title: "Categorize in one tap",
        body:
          "Every uncategorized line carries its own account picker, expense accounts first for money out and revenue first for money in. Pick one, hit Categorize, and the row leaves the queue — no forms, no second screen.",
        targetSelector: '[data-tour="stella-inbox-quick-categorize"]',
        placement: "left",
      },
      {
        title: "Open a row for the personal stuff",
        body:
          "Click any row for the full detail — fix the date, add a memo, flag it as paid personally so it lands in Owed to you, or mark a charge as a purely personal expense so it's excluded from your business books entirely.",
        targetSelector: ".tbl",
        placement: "top",
      },
    ],
  },
  stella_ledger_transactions: {
    title: "Transactions — the canonical ledger",
    body:
      "Every money-in and money-out line your business has, in one table. Bank feeds, manual entries, and recurring templates all land here — this page is the source of truth every report reads from.",
    onPage: [
      {
        title: "The money bar doubles as a filter",
        body:
          "This month's totals, live. Click Money in to see just income, Money out for expenses, Net to reset — same numbers as the Overview, one click closer to the lines behind them.",
        targetSelector: '[data-tour="stella-money-bar"]',
        placement: "bottom",
      },
      {
        title: "All, Income, Expenses, Recurring",
        body:
          "The tabs slice the same ledger. Recurring is where rent, software, and insurance templates will live once bank ingestion lands — detected from your history instead of typed in by hand.",
        targetSelector: '[data-tour="stella-txn-tabs"]',
        placement: "bottom",
      },
      {
        title: "Reimbursable — what the business owes you",
        body:
          "One click shows only personal-card expenses still waiting to be paid back, with the owed total on the pill. Rows carry a Personal card tag, and job-tagged lines show a job chip — click a chip to see everything for that job.",
        targetSelector: '[data-tour="stella-reimbursable-pill"]',
        placement: "bottom",
      },
    ],
    doIt: [
      {
        targetSelector: '[data-tour="stella-record"]',
        advance: "click",
        title: "Let's record your first expense",
        body:
          "We'll enter a small test expense together, mark it paid personally, then reimburse it — the full loop. Click + Record to open the menu.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-tour="stella-record-expense"]',
        advance: "click",
        waitForMs: 1500,
        title: "Choose Record expense",
        body:
          "Income and expenses use the same quick form — only the account list changes. Pick Record expense.",
        placement: "left",
      },
      {
        targetSelector: '[data-tour="stella-record-counterparty"]',
        advance: "input",
        waitForMs: 2000,
        title: "Vendor — type: Test vendor",
        body:
          "Who you paid. Type Test vendor — we're practicing, so anything works. Press Enter when you're done, or click Next.",
        placement: "right",
      },
      {
        targetSelector: '[data-tour="stella-record-account"]',
        advance: "input",
        waitForMs: 1500,
        title: "Pick an expense account",
        body:
          "This is the categorization — it decides where the line shows on your P&L. Any expense account is fine for the test; Next lights up once you've picked one.",
        placement: "right",
      },
      {
        targetSelector: '[data-tour="stella-record-amount"]',
        advance: "input",
        title: "Amount — type: 12.50",
        body:
          "Enter the amount as a positive number; STELLA knows it's money out because you chose expense. Press Enter or click Next when it's in.",
        placement: "right",
      },
      {
        targetSelector: '[data-tour="stella-record-personal"]',
        advance: "click",
        title: "Say you paid personally",
        body:
          "Tick this box — it's the scenario where you covered a business cost with your own card or cash. STELLA will hold it under Owed to you until the business pays you back.",
        placement: "top",
      },
      {
        targetSelector: '[data-tour="stella-record-save"]',
        advance: "click",
        title: "Record it",
        body:
          "Click Record expense. The line is saved to your ledger immediately and shows up in the table behind this window.",
        placement: "top",
      },
      {
        // The page marks ONLY the transaction this session just recorded
        // (rowClassName → .stella-txn-new keyed on the POST's transaction_id),
        // so this can never spotlight a same-day stranger. If the save failed
        // there's no marked row and the runner stops honestly.
        targetSelector: ".tbl tbody tr.stella-txn-new",
        advance: "click",
        waitForMs: 3000,
        title: "There it is — open it",
        body:
          "Your new line is highlighted in the ledger, with a Personal card tag on the amount. Click the row to open the full detail.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-tour="stella-mark-reimbursed"]',
        advance: "click",
        waitForMs: 2500,
        title: "Pay yourself back",
        body:
          "When the business actually reimburses you, this is the button. Click Mark reimbursed — it saves instantly, no separate Save needed.",
        placement: "top",
      },
      {
        targetSelector: '[data-tour="stella-reimburse-box"]',
        advance: "next",
        waitForMs: 1500,
        title: "Settled — that's the whole loop",
        body:
          "The expense no longer counts toward Owed to you, and the ledger keeps the reimbursement date. Since this was just practice, click Delete in the footer to remove it entirely — manual entries can be deleted; real imported transactions can only be voided, which is proper bookkeeping. Click Finish — you now know the full expense cycle.",
        placement: "top",
      },
    ],
  },
  stella_ledger_vendors: {
    title: "Vendors & Customers — everyone money moves with",
    body:
      "One list of everyone you pay and everyone who pays you, built from your transactions. This is also where 1099 season stops being a scramble — W-9 status and tax IDs live on each vendor.",
    onPage: [
      {
        title: "Click a name for the 360 view",
        body:
          "Each row opens the full picture: every transaction with that counterparty, totals over time, and the W-9 / 1099 / TIN details you'll want filled in before January.",
        targetSelector: ".tbl",
        placement: "top",
      },
    ],
  },
  stella_ledger_coa: {
    title: "Chart of Accounts — the backbone of every report",
    body:
      "The buckets your money is sorted into, pre-seeded for a service business so you're not designing an accounting system from scratch. Every categorize action and every report line traces back to one of these accounts.",
    onPage: [
      {
        title: "Click an account to open its register",
        body:
          "Any row drills straight into Transactions filtered to just that account — the classic register view. It's the fastest way to answer questions like where did the fuel spend go this quarter.",
        targetSelector: ".tbl",
        placement: "top",
      },
    ],
  },
  stella_ledger_mileage_materials: {
    // P3 surface — tour explains it exists, no hands-on until capture lands.
    title: "Mileage & Materials — coming in a later phase",
    body:
      "Per-job mileage and material capture lands here in a later build phase. Until then, record material costs as ordinary expenses and tag them to a job — they'll count as direct job cost in Margins already.",
  },

  // ── Unit Economics ──────────────────────────────────────────────────────
  stella_ue_margins: {
    title: "Margins — what each job actually made",
    body:
      "Revenue minus direct cost minus a fair share of overhead, per job and per customer. This is the page that turns 'we were busy' into 'we made money' — and shows which work is quietly unprofitable.",
    onPage: [
      {
        title: "Pick the period",
        body:
          "Margins are computed for the window you set here — it defaults to the last full month. If no allocation run covers the exact period, overhead shows as zero and the page says so rather than guessing.",
        targetSelector: '[data-tour="stella-margins-period"]',
        placement: "bottom",
      },
      {
        title: "Per-job, then per-customer",
        body:
          "The jobs table breaks each job into revenue, direct (job-tagged) cost, allocated overhead, and margin in dollars and percent. Below it, the same picture rolls up by customer — your best and worst clients by actual profit.",
        targetSelector: ".tbl",
        placement: "top",
      },
    ],
  },

  // ── IA Insights group (Reports lives here per the 2026-07-30 decision) ──
  stella_ledger_reports: {
    title: "Reports — your financial statements",
    body:
      "The statements an accountant or lender asks for, generated live from your ledger: P&L, Cash Flow, AR Aging, Sales Tax, and 1099 are working today. No exports, no spreadsheet gymnastics — categorize in the Inbox and these stay current.",
    onPage: [
      {
        title: "One page, every report",
        body:
          "Switch between reports with these tabs. P&L is the one to check monthly — income and expenses by account with the bottom line. Sales Tax and 1099 are calendar-year views for filing season.",
        targetSelector: '[data-tour="stella-reports-tabs"]',
        placement: "bottom",
      },
    ],
  },

  // ── Unit Economics ───────────────────────────────────────────────────────
  // Added 2026-09-01: 20 of STELLA's 28 nav pages had no teaching copy, the
  // worst coverage of any product.
  stella_ue_allocations: {
    title: "Allocations — splitting shared costs fairly",
    body:
      "Some costs don't belong to one job: insurance, the truck, your software. Allocation decides how those get spread across the work, so a job's true cost isn't just its materials. Pick a method (by revenue, by hours, evenly, and so on), run it, and the run history shows exactly what moved and when.",
    onPage: [
      {
        title: "The method is a judgement, not a fact",
        body:
          "There is no single correct way to split overhead. Choose the one that matches how the cost is actually driven — spread by hours if it's time-driven, by revenue if it scales with size — and stay consistent, because the comparison between months is what you're really after.",
      },
    ],
  },
  stella_ue_reconciliation: {
    title: "Reconciliation — does the ledger agree with the rest of the platform?",
    body:
      "Checks allocated costs back against the source systems — the jobs in OLIVER, the sends in SPARK, the sites in ARION. It answers one question: does what the books say match what actually happened? A difference here is a signal to look, not a number to edit.",
  },
  stella_ia_insights_trends: {
    body:
      "Income against expenses over time, where spend is heading, and how margin is moving. Direction matters more than any single month — one bad month is noise, three in a row is a trend.",
  },
  stella_ia_insights_intelligence: {
    body:
      "The modelled read on your finances — unusual spend, costs drifting from their norm, and early cash-flow signals. It points at things worth a look; it does not touch your books.",
  },

  // ── Database Manager ─────────────────────────────────────────────────────
  stella_db_registry: {
    title: "View Registry — the catalogue of what you can report on",
    body:
      "A list of every data view available to report against, and who can see it. Think of it as the index at the front of the book: before building a report you look here to find what's actually available.",
  },
  stella_db_entry: {
    body:
      "Type data straight in, using the shape the system already knows. Useful for the handful of records that don't arrive from anywhere else and aren't worth a spreadsheet import.",
  },
  stella_db_upload: {
    title: "Uploads — bring a spreadsheet in, safely",
    body:
      "Import a CSV or Excel file. It validates BEFORE committing, shows you what would land and what it objects to, and can roll a batch back after the fact. Import history means a bad file is an inconvenience rather than a mess to unpick by hand.",
    onPage: [
      {
        title: "Always read the validation step",
        body:
          "The point of validating first is that you see the broken rows while nothing has been written. Fix the file and re-upload — that is far cheaper than committing and then hunting the bad rows through your ledger.",
      },
    ],
  },
  stella_db_tags: {
    body:
      "Labels you can attach to records so you can group and filter by something the standard fields don't capture. Tags are cheap and informal — use them before you reach for a custom field.",
  },
  stella_db_custom_fields: {
    body:
      "Where a tag isn't enough, a custom field adds a proper, typed field to a record — one that can be validated, reported on, and relied upon.",
  },
  stella_db_documents: {
    body:
      "Files kept with the records they belong to — folders, tags and links back to the entity. Somewhere a receipt or a contract can live next to the transaction it explains.",
  },
  stella_db_compliance: {
    title: "Compliance Reminders — dates you can't afford to miss",
    body:
      "Track the recurring obligations a business forgets: filings, renewals, registrations. Note that this page keeps the list — it does NOT email you. Treat it as a register you check, not an alarm that will find you.",
  },
  stella_db_warnings: {
    body:
      "A queue for data problems worth a human look — duplicates, gaps, values that don't add up. The queue exists now; the rules that raise entries into it are still being built, so an empty page here is expected rather than broken.",
  },

  // ── Custom Reporting ─────────────────────────────────────────────────────
  stella_report_library: {
    body:
      "Your saved reports, in folders. Run one, change its chart, or export it straight from the row. This is where a report you built last quarter is still waiting.",
  },
  stella_report_builder: {
    title: "Report Builder — pick fields, get a report",
    body:
      "Choose the fields you care about and it works out the rest: numbers get totalled, everything else becomes a grouping. Change the date bucket, switch the chart, add a filter, save it. The preview runs the same engine a saved or scheduled report uses, so what you see is genuinely what you'll get.",
  },
  stella_report_dashboards: {
    body:
      "Several reports on one screen, each tile running its own query. The thing to have open on a Monday morning rather than clicking through five separate reports.",
  },
  stella_report_scheduled: {
    title: "Scheduled Reports — set it, then check it worked",
    body:
      "Have a report built and delivered on a schedule. Run it once by hand first: a schedule that quietly fails for a month is worse than no schedule, and the row shows failures in red with the reason.",
  },
  stella_report_sql: {
    title: "SQL Editor — for when the builder isn't enough",
    body:
      "Write a query directly. Two rules are enforced for you: use bare table names, and everything is already limited to your business — you cannot read another tenant's data, and nothing here can write. Every query, including refused ones, is logged.",
  },
  stella_report_exports: {
    body:
      "CSV, Excel and PDF copies of any saved report, with one history covering both manual exports and scheduled runs.",
  },

  // ── STELLA settings ──────────────────────────────────────────────────────
  stella_settings_bank: {
    title: "Bank and card accounts — where transactions come from",
    body:
      "Connect an account and transactions flow in automatically instead of being typed. Everything then lands in the Inbox for you to categorise, which is the difference between books that stay current and books you rebuild in a panic each quarter.",
  },
  stella_settings_period_close: {
    title: "Period Close — drawing a line under a month",
    body:
      "Closing a period locks it, so a stray edit can't quietly change a month you've already reported on. It checks the ledger balances before it will let you close, and reopening is deliberate and recorded. Close a month once you're confident in it, not before.",
  },
};
