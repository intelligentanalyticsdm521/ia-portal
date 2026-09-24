// STELLA Reports on the IA report structure — D-177 (24 Sept 2026).
//
// Brandon, 22 Sept: "why are our STELLA reports a different format than the
// rest of our IA reports?" The Reports page (route key stella_ledger_reports)
// is now the standard InsightsReportsCatalog, fed by oliver-api
// GET /ledger/insights-detail. The fixture is that endpoint's real answer for
// the dev fixture business (Summit, August 2026, cash basis), captured from
// the dev stack on 24 Sept — so these tests hold the Portal to the contract the
// server actually sends.
//
// What has to stay true:
//   • the catalog files all eleven STELLA reports under the dashboards'
//     sections — none falls into a stray "report:<id>" group
//   • the catalog renders them, and a report with no rows but a stated fact
//     ("You owe $0.00 on open bills") still has its door
//   • the report modal renders the caller's header actions (Export/Print) for
//     the report ON SCREEN, and a caller that passes none renders as before
//   • money is exact cents, QuickBooks-style: $44,182.86 and -$1,999.98 —
//     never the rounded "$44.2k" the dashboards use
//   • the server's facts ("Balanced: NO — out by …") lead "What this means"
//   • every report has an export pointed at the statement it is drawn from
//
// MUTATION-TESTED: see the D-177 scope doc §6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildReportGroups } from "../src/analytics/reportGroups.ts";
import { STELLA_DASHBOARDS, STELLA_FEATURE_LABEL, STELLA_ANSWERS, STELLA_REPORT_IDS } from "../src/analytics/stellaDashboards.ts";
import { deriveDeepReport, fmtV } from "../src/analytics/deepReport.ts";
import { deepConfigFor } from "../src/analytics/deepConfigs.ts";
import { reportNotesFor } from "../src/analytics/reportNotes.ts";
import { InsightsReportsCatalog } from "../src/components/insights/InsightsReportsCatalog.tsx";
import { ReportGroupModal } from "../src/components/insights/ReportGroupModal.tsx";
import { DeepReportView } from "../src/components/insights/DeepReportView.tsx";
import { statementExportFor } from "../src/pages/stella/stellaReportExports.ts";

const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "stella-insights-detail.json"), "utf8"));
const detail = FIXTURE.detail;
const period = FIXTURE.period;

const ELEVEN = [
  "stella_income_by_account", "stella_expenses_by_account", "stella_net_profit",
  "stella_cash_flow", "stella_balance_sheet", "stella_ar_aging", "stella_ap_aging",
  "stella_sales_tax", "stella_1099", "stella_trial_balance", "stella_general_ledger",
];

test("the fixture is the endpoint's eleven reports", () => {
  assert.deepEqual(Object.keys(detail).sort(), [...ELEVEN].sort());
  assert.deepEqual([...STELLA_REPORT_IDS].sort(), [...ELEVEN].sort());
});

test("every STELLA report files under a dashboard section — none in a stray group", () => {
  const groups = buildReportGroups(detail, STELLA_DASHBOARDS);
  const filed = groups.flatMap((g) => g.reports.map((r) => r.id)).sort();
  assert.deepEqual(filed, [...ELEVEN].sort(), "a report was dropped from the catalog");
  for (const g of groups) {
    assert.ok(!g.key.startsWith("report:"), `${g.reports[0].id} has no section in stellaDashboards.ts`);
    assert.ok(STELLA_FEATURE_LABEL[g.dashboardKey], `no feature label for dashboard ${g.dashboardKey}`);
  }
  // The six doors, in nav order.
  assert.deepEqual(groups.map((g) => g.key), [
    "profitability.statements", "cash_flow.position",
    "revenue_quality.receivables", "revenue_quality.payables",
    "books.tax", "books.ledger",
  ]);
});

test("a report with no rows but a stated fact keeps its door; one with neither does not", () => {
  // Summit has no open bills and no sales-tax rates on dev — the two reports
  // come back with no rows and a sentence saying so.
  assert.equal(detail.stella_ap_aging.items.length, 0);
  assert.ok(detail.stella_ap_aging.facts.length > 0);
  const groups = buildReportGroups(detail, STELLA_DASHBOARDS);
  assert.ok(groups.some((g) => g.reports.some((r) => r.id === "stella_ap_aging")));
  const silent = { ...detail, stella_ap_aging: { ...detail.stella_ap_aging, facts: [] } };
  assert.ok(!buildReportGroups(silent, STELLA_DASHBOARDS).some((g) => g.reports.some((r) => r.id === "stella_ap_aging")),
    "an empty report with nothing to say must not get a door");
});

function renderCatalog(extra = {}) {
  return renderToStaticMarkup(h(InsightsReportsCatalog, {
    product: "stella", detail, loading: false,
    dashboards: STELLA_DASHBOARDS, featureLabel: STELLA_FEATURE_LABEL, answers: STELLA_ANSWERS,
    ...extra,
  }));
}

test("the catalog renders all eleven STELLA reports from the payload", () => {
  const html = renderCatalog({ controls: h("div", { id: "stella-period-controls" }, "Month") });
  // Six doors…
  assert.equal((html.match(/Open report/g) || []).length, 6);
  // …holding eleven reports: a multi-report door names its tabs, a single one
  // states the question it answers.
  const named = ELEVEN.filter((id) => html.includes(detail[id].label.replace(/&/g, "&amp;")) || html.includes(STELLA_ANSWERS[id].replace(/'/g, "&#x27;")));
  assert.deepEqual(named.sort(), [...ELEVEN].sort(), `missing: ${ELEVEN.filter((i) => !named.includes(i))}`);
  for (const f of ["Profit &amp; Loss", "Cash &amp; balance", "What you&#x27;re owed and owe", "The books"]) {
    assert.ok(html.includes(f), `feature heading ${f} missing`);
  }
  // The month picker + basis toggle sit ABOVE the sections.
  assert.ok(html.indexOf("stella-period-controls") < html.indexOf("Open report"));
  assert.ok(!html.includes("Still collecting data"));
});

function group(id) {
  return buildReportGroups(detail, STELLA_DASHBOARDS).find((g) => g.reports.some((r) => r.id === id));
}

test("the report modal renders the caller's actions for the report on screen", () => {
  const g = group("stella_net_profit");
  const tab = g.reports.findIndex((r) => r.id === "stella_net_profit");
  const html = renderToStaticMarkup(h(ReportGroupModal, {
    group: g, initialTab: tab, product: "stella", onClose: () => {},
    actions: (report) => h("span", { className: "probe" }, `EXPORT-FOR-${report.id}`),
  }));
  assert.ok(html.includes("data-report-actions"), "the actions slot did not render");
  assert.ok(html.includes("EXPORT-FOR-stella_net_profit"), "the actions were not for the report on screen");
  assert.ok(!html.includes("EXPORT-FOR-stella_income_by_account"));
  // With actions the report body is the print root, under a print-only title.
  assert.ok(html.includes("data-report-print-root"));

  // A node (not a function) works too.
  const html2 = renderToStaticMarkup(h(ReportGroupModal, {
    group: g, product: "stella", onClose: () => {}, actions: h("b", null, "STATIC-ACTION"),
  }));
  assert.ok(html2.includes("STATIC-ACTION"));
});

test("a modal with no actions renders exactly as before — no slot, no print root", () => {
  const g = group("stella_cash_flow");
  const html = renderToStaticMarkup(h(ReportGroupModal, { group: g, product: "spark", onClose: () => {} }));
  assert.ok(!html.includes("data-report-actions"));
  assert.ok(!html.includes("data-report-print-root"));
  assert.ok(html.includes("Cash flow"));
});

test("money is exact cents with the minus before the dollar sign; currency is untouched", () => {
  assert.equal(fmtV(44182.86, "money"), "$44,182.86");
  assert.equal(fmtV(-1999.98, "money"), "-$1,999.98");
  assert.equal(fmtV(0, "money"), "$0.00");
  // The dashboards' rounded format stays exactly what it was for every product.
  assert.equal(fmtV(44182.86, "currency"), "$44.2k");
  assert.equal(fmtV(-2000, "currency"), "$-2000");
});

test("a STELLA balance-sheet row renders $44,182.86-style, and a negative as -$1,999.98", () => {
  const bs = {
    ...detail.stella_balance_sheet,
    items: [
      { name: "1000 · Cash — Operating", series: [], extra: { type: "Asset", amount: 44182.86 } },
      { name: "1610 · Accumulated Depreciation", series: [], extra: { type: "Asset", amount: -1999.98 } },
    ],
  };
  const html = renderToStaticMarkup(h(DeepReportView, { deep: deriveDeepReport(bs, deepConfigFor(bs.id)) }));
  assert.ok(html.includes("$44,182.86"), "the amount is not exact cents");
  assert.ok(html.includes("-$1,999.98"), "a negative is not -$1,999.98");
  assert.ok(!/\$44\.2k|\$-2000/.test(html), "the rounded dashboard format leaked into a statement");
});

test("every STELLA report and money column is in exact-cents money format", () => {
  for (const id of ELEVEN) {
    assert.equal(detail[id].format, "money", `${id} format`);
    for (const c of detail[id].columns || []) {
      assert.ok(["money", "text", "count", "percent"].includes(c.format), `${id}.${c.key} is ${c.format}`);
    }
  }
});

test("the server's facts lead 'What this means' — the balance verdict first, to the cent", () => {
  const deep = deriveDeepReport(detail.stella_balance_sheet, deepConfigFor("stella_balance_sheet"));
  assert.match(deep.meaning[0].text, /^Balanced: YES — .*\(difference \$0\.00\)/);
  const out = {
    ...detail.stella_trial_balance, balanced: false, difference: 1999.98,
    facts: [{ tone: "bad", text: "Balanced: NO — debits $10.00 and credits $2,009.98 differ by $1,999.98." }],
  };
  const d2 = deriveDeepReport(out, deepConfigFor(out.id));
  assert.equal(d2.meaning[0].tone, "bad");
  assert.match(d2.meaning[0].text, /differ by \$1,999\.98/);
});

// Click-through 24 Sept: the Net profit tab listed Expenses (up 88%) as its
// BIGGEST GAINER in green. A line can run against its report's direction.
test("on net profit, rising Expenses is a loss, not a gain — in the movers and on the row", () => {
  const rep = detail.stella_net_profit;
  const exp = rep.items.find((i) => i.name === "Expenses");
  assert.equal(exp.extra?.lowerIsBetter, true);
  assert.ok(exp.series[12] > exp.series[11], "fixture: August expenses rose");
  const deep = deriveDeepReport(rep, deepConfigFor("stella_net_profit"));
  const gain = deep.movements.find((m) => /gainers/i.test(m.title));
  const lose = deep.movements.find((m) => /losers/i.test(m.title));
  assert.ok(!gain || !gain.items.some((r) => r.name === "Expenses"), "rising Expenses listed as a gainer");
  const row = lose && lose.items.find((r) => r.name === "Expenses");
  assert.ok(row, "rising Expenses missing from the losers");
  assert.equal(row.lowerBetter, true, "the mover row would paint +% green");
  // A report whose lines all share its direction carries no per-row flag.
  const inc = deriveDeepReport(detail.stella_income_by_account, deepConfigFor("stella_income_by_account"));
  assert.ok(inc.movements.every((m) => m.items.every((r) => r.lowerBetter === undefined)));
  // The body still renders, and never says "1 lines up".
  const html = renderToStaticMarkup(h(DeepReportView, { deep }));
  assert.ok(!/A mixed month: \d+ lines up/.test(html), "'1 lines up'");
});

// Click-through 24 Sept: "4 activitys", and bars labelled Oct … Oct.
test("the modal says 'activities', and the chart labels are the server's months", () => {
  const cf = detail.stella_cash_flow;
  const html = renderToStaticMarkup(h(ReportGroupModal, { group: { key: "k", label: "Cash flow", reports: [cf] }, product: "stella", onClose() {} }));
  assert.ok(!/activitys/.test(html), "'activitys'");
  assert.match(html, /4 activities/);
  const deep = deriveDeepReport(cf, deepConfigFor(cf.id));
  assert.deepEqual(deep.months, cf.monthLabels);
  assert.equal(deep.months.at(-1), "Aug '26", "the last bar is the picked month");
  // Other products send no labels and keep counting back from today.
  const { monthLabels: _drop, ...bare } = cf;
  assert.equal(deriveDeepReport(bare, deepConfigFor(cf.id)).months.length, 13);
  assert.notDeepEqual(deriveDeepReport(bare, deepConfigFor(cf.id)).months, cf.monthLabels);
});

// Click-through 24 Sept: the "More than 60 days late" and "W-9 missing" lists
// printed "—" beside every invoice and vendor (a feed has no series).
test("problem lists on feeds print the balance / amount paid, not a dash", () => {
  for (const [id, key] of [["stella_ar_aging", "balance"], ["stella_1099", "paid_ytd"]]) {
    const deep = deriveDeepReport(detail[id], deepConfigFor(id));
    const op = deep.opportunities[0];
    assert.ok(op && op.items.length, `${id}: no list`);
    assert.equal(op.valueKey, key);
    const html = renderToStaticMarkup(h(DeepReportView, { deep }));
    // Only the list itself — the full table further down has the amounts anyway.
    const start = html.indexOf(op.title);
    const list = html.slice(start, html.indexOf("<table", start));
    assert.ok(start > 0 && list.length > 0, `${id}: list not rendered before the table`);
    const first = op.items[0];
    assert.ok(list.includes(fmtV(first.extra[key], "money")), `${id}: ${first.name} shows no amount in the list`);
  }
  assert.equal(deepConfigFor("stella_ap_aging").opportunities[0].valueKey, "balance");
});

test("net profit and cash flow do not add different measures into a 'Total'", () => {
  for (const id of ["stella_net_profit", "stella_cash_flow"]) {
    const deep = deriveDeepReport(detail[id], deepConfigFor(id));
    assert.ok(!deep.stats.some((s) => /^Total/.test(s.label)), `${id} states a meaningless total`);
    assert.ok(!deep.distribution, `${id} stacks different measures into a composition chart`);
  }
  // The account reports DO add up, so they keep their total and mix.
  const inc = deriveDeepReport(detail.stella_expenses_by_account, deepConfigFor("stella_expenses_by_account"));
  assert.ok(inc.stats.some((s) => /^Total/.test(s.label)));
});

test("trend reports carry 13 months, oldest first", () => {
  for (const id of ["stella_income_by_account", "stella_expenses_by_account", "stella_net_profit", "stella_cash_flow"]) {
    for (const it of detail[id].items) assert.equal(it.series.length, 13, `${id}/${it.name}`);
  }
  assert.equal(period.month_list.length, 13);
  assert.equal(period.month_list.at(-1), period.month);
});

test("every report has plain-language notes and a deep config", () => {
  for (const id of ELEVEN) {
    const n = reportNotesFor(id);
    assert.ok(n && n.about.length > 40 && n.reading.length > 40, `${id} has no notes`);
    assert.ok(deepConfigFor(id) !== undefined, `${id} has no deep config`);
    assert.ok(!/tenant/i.test(n.about + n.reading), `${id} says "tenant" to a human`);
  }
});

test("every report exports from the statement it is drawn from, for the server's period", () => {
  for (const id of ELEVEN) {
    const t = statementExportFor(id, period);
    assert.ok(t && t.path.startsWith("/ledger/"), `${id} has no export`);
    assert.ok(!/format=/.test(t.path), "the bar adds ?format itself");
  }
  assert.equal(statementExportFor("stella_net_profit", period).path,
    `/ledger/income-statement?basis=cash&from=${period.from}&to=${period.to}`);
  assert.equal(statementExportFor("stella_balance_sheet", period).path,
    `/ledger/balance-sheet?basis=cash&as_of=${period.as_of}`);
  assert.equal(statementExportFor("stella_trial_balance", period).path,
    `/ledger/trial-balance?basis=cash&to=${period.as_of}`);
  assert.equal(statementExportFor("nope", period), null);
});

test("the page is the catalog: product stella, controls, actions, and the records footer with Accountant pack", () => {
  const read = (rel) => readFileSync(path.join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");
  const page = read("pages/stella/StellaReportsPage.tsx");
  assert.match(page, /<InsightsReportsCatalog\s*\n\s*product="stella"/);
  assert.match(page, /useProductInsightsPayload\("stella", \{ month, basis \}\)/);
  assert.match(page, /controls=\{controls\}/);
  assert.match(page, /<StellaPrintStyles \/>/);
  assert.match(page, /<ReportsHubPage platform="STELLA" bare onAction=/);
  assert.match(page, /<AccountantPack \/>/);
  assert.ok(!/StellaTabs|\/ledger\/pnl/.test(page), "the ten-tab page is back");
  // An empty statement still exports (AP aging with no bills, Sales Tax with no rates).
  assert.ok(!/<StatementExportBar[^>]*disabled=/.test(page), "Export is greyed out on an empty statement");
  const hub = read("components/insights/ReportsHubPage.tsx");
  for (const l of ["Report Library", "Report Builder", "Scheduled Reports", "Exports", "Accountant pack"]) {
    assert.ok(hub.includes(`label: "${l}"`), `${l} missing from the STELLA records footer`);
  }
  const hook = read("hooks/useProductInsightsPayload.ts");
  assert.match(hook, /\/ledger\/insights-detail\?/);
  // The route key and the nav do not change.
  assert.match(read("pages/ServiceRouter.tsx"), /case 'stella_ledger_reports': stellaPage = <StellaReportsPage \/>;/);
  assert.match(read("components/SubNav.tsx"), /key: "stella_ledger_reports", label: "Reports", route: "\/app\/services\/stella_ledger_reports"/);
});
