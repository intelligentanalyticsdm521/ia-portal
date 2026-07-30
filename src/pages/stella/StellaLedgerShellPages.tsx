// StellaLedgerShellPages — the remaining scaffolded Ledger surfaces after the
// 2026-07-30 nav consolidation (8-item cap; house pattern: fewer pages, tabs).
//
//   - StellaMileageMaterialsPage — ONE nav item, two in-page tabs (Mileage |
//     Materials); replaces the two single scaffold pages. Data lands P3.
//   - StellaBankPage + StellaPeriodClosePage — moved OUT of the STELLA nav
//     into the SETTINGS hub (keys stella_settings_bank /
//     stella_settings_period_close). They are configuration surfaces, not
//     daily-work pages.
//
// Retired from this module (absorbed elsewhere): Income + Recurring (tabs on
// Transactions), Receipts (modal hint on Transactions until OCR ships),
// Balance Sheet / Cash Flow / AR Aging / AP Aging / Sales Tax / 1099
// (report picker on StellaReportsPage).
import { useState } from "react";
import { StellaScaffoldCard, StellaScaffoldPage, StellaShell, StellaTabs } from "./StellaShell";

// ── Mileage & Materials (one page, two tabs) ─────────────────────────────────

const MM_TABS = [
  { key: "mileage", label: "Mileage" },
  { key: "materials", label: "Materials" },
];

export function StellaMileageMaterialsPage() {
  const [tab, setTab] = useState("mileage");
  return (
    <StellaShell
      title="Mileage & Materials"
      subtitle="Job-cost capture — business miles at the IRS rate, and materials that feed per-job margin."
    >
      <StellaTabs tabs={MM_TABS} active={tab} onChange={setTab} />
      {tab === "mileage" ? (
        <StellaScaffoldCard
          phase="P3"
          note="Log business miles and STELLA applies the current IRS rate to compute your deduction. GPS-assisted capture arrives in a later phase."
          bullets={["Manual trip entry", "Current IRS deduction rate", "Rolls into your P&L and Schedule-C view"]}
        />
      ) : (
        <StellaScaffoldCard
          phase="P3"
          tier="Pro"
          note="Track materials purchased for jobs so they flow into per-job costing and unit economics."
          bullets={["Per-job materials capture", "Feeds job-level margin", "Pro tier and above"]}
        />
      )}
    </StellaShell>
  );
}

// ── Settings-hub surfaces (SETTINGS_NAV → STELLA group) ──────────────────────

export function StellaBankPage() {
  return (
    <StellaScaffoldPage
      title="Bank Connections"
      subtitle="Connect, reconnect, and manage your bank & card feeds."
      phase="P3"
      note="Securely link accounts so clean transactions flow into the Inbox on your tier's cadence (weekly / daily / hourly), with statement reconciliation."
      bullets={["Add / remove / reconnect feeds", "Tier-based sync cadence", "One-click statement reconciliation (Pro)"]}
    />
  );
}

export function StellaPeriodClosePage() {
  return (
    <StellaScaffoldPage
      title="Period Close"
      subtitle="Close a month, lock prior periods, and post adjusting entries."
      phase="P5"
      note="Run a monthly close: reconcile, post adjusting entries, then lock the period so the books stay trustworthy."
      bullets={["Monthly close checklist", "Lock prior periods", "Adjusting entries"]}
    />
  );
}
