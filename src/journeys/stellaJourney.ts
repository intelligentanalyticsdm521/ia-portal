// stellaJourney.ts — Ledger & Data Management (STELLA) walkthrough.
//
// Steps are GENERATED from the live STELLA nav (pageGuide.ts) exactly like
// the SPARK/OLIVER/ARION journeys, so page coverage can never drift; teaching
// copy per page lives in content/stellaPages.ts. Gated Database Manager /
// Custom Reporting / IA Insights surfaces have no authored copy on purpose —
// buildPageSteps skips them rather than touring locked screens.
//
// ONE hand-appended step: "Bank and card accounts" lives under the SETTINGS
// nav (key stella_settings_bank — moved out of the Ledger group per the
// 2026-07-30 nav decision), so the nav-driven generator can't reach it from
// SUB_NAV_CONFIGS.stella. It's still core curriculum (connect + the
// personal-card switch), so it's appended here with the same step shape.
//
// The interactive mode carries exactly one exercise — "Record your first
// expense with me" (Transactions doIt): record a small test expense, mark it
// paid personally, find it in the ledger, mark it reimbursed. Reversible via
// Void; it never touches bank connections or real payment rails.
import type { Journey, JourneyStep } from "./types";
import { buildPageSteps } from "./pageGuide";
import { STELLA_PAGES } from "./content/stellaPages";

const BANK_ROUTE = "/app/services/stella_settings_bank";

const BANK_STEP: JourneyStep = {
  id: "stella.stella_settings_bank",
  label: "Bank and card accounts",
  sectionLabel: "Settings",
  route: BANK_ROUTE,
  keywords: ["bank", "connect bank", "card", "personal card", "plaid", "accounts"],
  explain: {
    title: "Bank and card accounts — stop typing, start syncing",
    body:
      "Everything so far works with manual entry, but the real magic is connecting your bank and cards — transactions pull in automatically and queue in the Inbox for a one-tap review. This page lives under Settings because you set it up once.",
    targetSelector: `a[href='${BANK_ROUTE}']`,
    placement: "right",
  },
  onPage: [
    {
      title: "Connect a bank or card",
      body:
        "One button starts the secure Plaid flow — your credentials go to your bank, never to STELLA. If it reads 'Plaid keys pending', the connection service isn't enabled on this environment yet and the button says so honestly.",
      targetSelector: '[data-tour="stella-bank-connect"]',
      placement: "left",
    },
    {
      title: "The personal-card switch",
      body:
        "For the card you personally own but sometimes use for the business: flip its switch and new charges arrive flagged 'needs reimbursement', rolling into Owed to you until you pay yourself back. Purely personal charges can be excluded from the books entirely.",
      targetSelector: '[data-tour="stella-bank-personal"]',
      placement: "top",
    },
  ],
  // No doIt on purpose — connecting a live bank is not a practice exercise.
};

export const STELLA_JOURNEY: Journey = {
  product: "stella",
  productLabel: "Ledger & Data Management",
  accent: "#4C5BD4", // STELLA Indigo
  tourId: "journey_stella_tour_v1",
  interactiveId: "journey_stella_interactive_v1",
  tourTitle: "Ledger & Data Management — guided by your consultant",
  interactiveTitle: "Record your first expense with me",
  oneLiner: "Your ledger top to bottom — then record and reimburse your first expense",
  steps: [...buildPageSteps("stella", STELLA_PAGES), BANK_STEP],
};
