// StellaReportsPage — STELLA → IA Insights → Reports (route key
// stella_ledger_reports). D-177, 24 Sept 2026.
//
// Brandon, 22 Sept: "why are our STELLA reports a different format than the
// rest of our IA reports?" This page was ten hand-rendered tabs. It is now the
// standard IA report catalog — the same InsightsReportsCatalog SPARK, OLIVER
// and ARION use — so a STELLA report opens in the same branded modal, with the
// same "what this report is / how to read it", the same summary, and the same
// "what this means for you", as every other report on the platform.
//
// What STELLA keeps that the others do not have:
//   * one month picker and one cash/accrual toggle above the sections, which
//     re-fetch every report (GET /ledger/insights-detail);
//   * Export (CSV / Excel / PDF) and Print in each report's modal header,
//     pointed at the statement route that report is drawn from — so the file
//     is the server's, from the same payload as the numbers on screen;
//   * the 1099-NEC form and filing-file downloads on the 1099 report;
//   * Accountant pack, opened from the Operational records footer.
//
// The numbers are oliver-api's, built from the SAME statement functions the
// /ledger routes use — this page does no money arithmetic of its own.
import { useState } from "react";
import { InsightsReportsCatalog } from "../../components/insights/InsightsReportsCatalog";
import { ReportsHubPage } from "../../components/insights/ReportsHubPage";
import { IadmModal } from "../../components/IadmModal";
import type { DetailReport } from "../../analytics/detail";
import { STELLA_DASHBOARDS, STELLA_FEATURE_LABEL, STELLA_ANSWERS } from "../../analytics/stellaDashboards";
import { useProductInsightsPayload, type StellaReportPeriod } from "../../hooks/useProductInsightsPayload";
import { AccountantPack } from "./accounting/AccountantPack";
import { StatementExportBar, StellaPrintStyles } from "./StatementExportBar";
import { Ten99Download, Ten99CsvDownload } from "./Ten99Download";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";
import { statementExportFor, currentMonth } from "./stellaReportExports";

type Basis = "cash" | "accrual";

export function StellaReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [basis, setBasis] = useState<Basis>("cash");
  const [packOpen, setPackOpen] = useState(false);
  const state = useProductInsightsPayload("stella", { month, basis });
  const period = state.status === "ready" ? state.payload.period : undefined;

  const controls = (
    <div className="stella-no-print flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        Month
        <input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="Month the reports end on"
          title="The reports show the 13 months ending here; point-in-time statements are as of its last day"
          style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
        />
      </label>
      <div role="group" aria-label="Basis" style={{ display: "inline-flex", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, overflow: "hidden" }}>
        {(["cash", "accrual"] as Basis[]).map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={b === basis}
            onClick={() => setBasis(b)}
            title={b === "cash" ? "Count income when the money arrives and costs when you pay them" : "Count income when you invoice and costs when you are billed"}
            style={{
              padding: "6px 14px", fontSize: 12, fontWeight: b === basis ? 700 : 500, border: 0, cursor: "pointer",
              background: b === basis ? STELLA_INDIGO : "#fff", color: b === basis ? "#fff" : "#5A7A8A",
            }}
          >
            {b === "cash" ? "Cash basis" : "Accrual basis"}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-slate-500">
        {period
          ? `13 months to ${period.to} · statements as of ${period.as_of} · ${period.basis} basis`
          : "One month and one basis for every report below."}
      </span>
    </div>
  );

  return (
    <div className="p-1">
      <StellaPrintStyles />
      {state.status === "error" && (
        <div className="mx-auto mb-4 max-w-[1500px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We could not read your books just now, so no report is shown rather than a wrong one. Try again in a
          moment; if it keeps happening, the Accounting page's Rebuild the ledger is the first thing to run.
        </div>
      )}
      <InsightsReportsCatalog
        product="stella"
        detail={state.payload?.detail}
        loading={state.status === "loading"}
        dashboards={STELLA_DASHBOARDS}
        featureLabel={STELLA_FEATURE_LABEL}
        answers={STELLA_ANSWERS}
        intro="Your financial statements, grouped by the question they answer. Each opens the full report — pick the month and the basis once, and every report follows. Export and Print are in each report's header."
        controls={controls}
        reportActions={period ? (report: DetailReport) => <ReportActions report={report} period={period} /> : undefined}
        footer={<ReportsHubPage platform="STELLA" bare onAction={(a) => a === "accountant_pack" && setPackOpen(true)} />}
      />
      {packOpen && (
        <IadmModal open onClose={() => setPackOpen(false)} product="stella" title="Accountant pack" subtitle="For your accountant" size="report">
          <div className="px-4 py-4 sm:px-5">
            <AccountantPack />
          </div>
        </IadmModal>
      )}
    </div>
  );
}

/** Export + Print for the report on screen; on the 1099 report, the form downloads too. */
function ReportActions({ report, period }: { report: DetailReport; period: StellaReportPeriod }) {
  const target = statementExportFor(report.id, period);
  if (!target) return null;
  return (
    // A white chip: the export bar is drawn for a white page, and the modal
    // header is ink.
    <div className="flex items-center gap-2 rounded-md bg-white/95 px-2 py-1">
      {report.id === "stella_1099" && <Ten99Forms report={report} year={period.year} />}
      {/* Never greyed for an empty statement: "You owe $0.00" is a statement an
          accountant or lender can ask for, and the old page exported it (walk
          W-ST1-02 exports an empty Sales Tax). Found by the D-177 click-through. */}
      <StatementExportBar path={target.path} fileBase={target.fileBase} />
    </div>
  );
}

/**
 * The two 1099-NEC downloads (STELLA pack 2, item 4): one vendor's form, and
 * the whole year in the shape a filing service imports. Both carry the whole
 * taxpayer id, so both are audited server-side; the id itself is never in the
 * report payload.
 */
function Ten99Forms({ report, year }: { report: DetailReport; year: number }) {
  const vendors = report.items.map((it) => ({
    id: String(it.extra?.counterparty_id || ""),
    name: it.name,
    hasTin: it.extra?.tin_on_file === "yes",
  })).filter((v) => v.id);
  const [pick, setPick] = useState(vendors[0]?.id || "");
  const chosen = vendors.find((v) => v.id === pick);
  return (
    <div className="stella-no-print flex items-center gap-2">
      {vendors.length > 0 && (
        <>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Vendor for the 1099-NEC form"
            title="Pick the vendor whose 1099-NEC to download"
            style={{ padding: "4px 6px", fontSize: 11, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24", background: "#fff", maxWidth: 160 }}
          >
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {chosen && <Ten99Download counterpartyId={chosen.id} year={year} name={chosen.name} disabled={!chosen.hasTin} />}
        </>
      )}
      <Ten99CsvDownload year={year} disabled={!vendors.length} />
    </div>
  );
}

export default StellaReportsPage;
