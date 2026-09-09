// scripts/dev/stella-pack2-ui-mutation-check.mjs
//
// A green guard proves nothing until you make it fail on purpose
// (feedback_mutation_test_your_guards).
//
// Each mutation breaks one thing STELLA pack 2 put on screen, runs the test
// that is supposed to catch it, and asserts the test goes RED. The file is then
// restored byte for byte and the restore is VERIFIED.
//
//   node scripts/dev/stella-pack2-ui-mutation-check.mjs

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const abs = (p) => path.join(REPO, p);
const TEST = "test/stella-pack2-ui.test.mjs";

const MUTATIONS = [
  {
    id: "U1",
    what: "the AP Aging placeholder comes back, so Reports promises a feature that shipped",
    file: "src/pages/stella/StellaReportsPage.tsx",
    find: "const PLACEHOLDERS: Record<string, { title: string; note: string; bullets: string[]; tier?: \"Pro\" }> = {};",
    to: "const PLACEHOLDERS: Record<string, { title: string; note: string; bullets: string[]; tier?: \"Pro\" }> = { ap_aging: { title: \"AP Aging\", note: \"Arrives with Bill Pay\", bullets: [] } };",
  },
  {
    id: "U2",
    what: "the cash-flow statement stops saying whether it reconciles",
    file: "src/pages/stella/StellaReportsPage.tsx",
    find: "              : `These sections are out by ${fmtMoney(Math.abs(cashFlow.totals.difference))} against what your bank accounts did. Do not hand this to anybody — run Rebuild the ledger under Accounting, then look for a hand-written entry that does not balance.`}",
    to: "              : \"Some numbers did not add up.\"}",
  },
  {
    id: "U3",
    what: "a whole taxpayer id is rendered on the 1099 screen",
    file: "src/pages/stella/StellaReportsPage.tsx",
    find: "                        {v.tin_masked || <span style={{ color: \"#B4531F\" }}>none on file</span>}",
    to: "                        {v.tin || <span style={{ color: \"#B4531F\" }}>none on file</span>}",
  },
  {
    id: "U4",
    what: "the 1099 download stops saying it is recorded",
    file: "src/pages/stella/Ten99Download.tsx",
    find: "This download is recorded.",
    to: "Have it.",
  },
  {
    id: "U5",
    what: "deposit grouping shows itself on a business with nothing waiting to be banked",
    file: "src/pages/stella/DepositGroupingPanel.tsx",
    find: "  if (!rows.length) return null;",
    to: "  if (false) return null;",
  },
  {
    id: "U6",
    what: "the register drops the closed-month padlock",
    file: "src/pages/stella/StellaTransactionsPage.tsx",
    find: "                <Lock size={11} />",
    to: "                <span />",
  },
  {
    id: "U7",
    what: "the role hook stops trying the bookkeeping door, so a STELLA-only accountant vanishes again",
    file: "src/hooks/useOliverRole.ts",
    find: '        .catch(() => stella.get<OliverRoleInfo>("/ledger/me")\n          .then((r) => {\n            cachedRoleInfo = r;\n            return r;\n          }))',
    to: "",
  },
  {
    id: "U8",
    what: "the sales-tax page stops saying who keeps the rates current",
    file: "src/pages/stella/StellaSalesTaxPage.tsx",
    find: "<strong>You keep these rates current.</strong>",
    to: "<strong>Sales tax.</strong>",
  },
  {
    id: "U9",
    what: "a business with no rates gets an empty table instead of being told what to do",
    file: "src/pages/stella/StellaReportsPage.tsx",
    find: "            {salesTax.needs_setup ? (",
    to: "            {false ? (",
  },
  {
    id: "U10",
    what: "the bills page starts computing a balance of its own",
    file: "src/pages/stella/StellaBillsPage.tsx",
    find: "        <Fig label=\"Still owed\" value={fmtMoney(bill.balance_due)} strong />",
    to: "        <Fig label=\"Still owed\" value={fmtMoney(Number(bill.total) - Number(bill.amount_paid))} strong />",
  },
  {
    id: "U11",
    what: "a pack 2 page says 'tenant' to a human",
    file: "src/pages/stella/StellaBillsPage.tsx",
    find: "      subtitle=\"What you owe your suppliers — recorded when the bill arrives, cleared when you pay it.\"",
    to: "      subtitle=\"What this tenant owes its suppliers.\"",
  },
  {
    id: "U12",
    what: "a pack 2 page calls fetch() itself instead of the one API hook",
    file: "src/pages/stella/StellaAssetsPage.tsx",
    find: "const today = () => new Date().toISOString().slice(0, 10);",
    to: "const today = () => new Date().toISOString().slice(0, 10);\nasync function sneak() { await fetch(\"/ledger/assets\"); }",
  },
  {
    id: "U13",
    what: "Bills disappears from the nav while its page and route stay",
    file: "src/components/SubNav.tsx",
    find: '        { key: "stella_bills", label: "Bills", route: "/app/services/stella_bills" },\n',
    to: "",
  },
  {
    id: "U14",
    what: "the inbox suggestion stops naming the rule it came from",
    file: "src/pages/stella/StellaLedgerInboxPage.tsx",
    find: "            <span style={{ fontSize: 10, color: \"#94A3B8\" }}>{r.suggestion.why}</span>",
    to: "            <span style={{ fontSize: 10, color: \"#94A3B8\" }}>suggested</span>",
  },
  {
    id: "U15",
    what: "the asset page implies the monthly figure is what you file",
    file: "src/pages/stella/StellaAssetsPage.tsx",
    find: "the monthly posting is a bookkeeping estimate, not a tax return.",
    to: "the monthly posting is what you file.",
  },
];

let caught = 0;
let survived = 0;
const survivors = [];

function runTest() {
  const r = spawnSync(process.execPath, ["--test", TEST], { cwd: REPO, encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const m = /^# fail (\d+)$/m.exec(out);
  return m ? Number(m[1]) : (r.status === 0 ? 0 : 1);
}

console.log("STELLA pack 2 — Portal mutation check");
console.log("Each line breaks one thing on screen and asserts the test catches it.\n");

for (const m of MUTATIONS) {
  const p = abs(m.file);
  const original = fs.readFileSync(p, "utf8");
  const find = original.includes(m.find) ? m.find : m.find.replace(/\n/g, "\r\n");
  const to = original.includes(m.find) ? m.to : m.to.replace(/\n/g, "\r\n");
  if (!original.includes(find)) {
    survived += 1;
    survivors.push(`${m.id}: ANCHOR MISSING in ${m.file} — this mutation tested nothing.`);
    console.log(`  ????  ${m.id}  ${m.what}\n        anchor not found in ${m.file}`);
    continue;
  }
  try {
    fs.writeFileSync(p, original.split(find).join(to), "utf8");
    const failed = runTest();
    if (failed > 0) {
      caught += 1;
      console.log(`  RED   ${m.id}  ${m.what}`);
    } else {
      survived += 1;
      survivors.push(`${m.id}: ${m.what} — SURVIVED`);
      console.log(`  GREEN ${m.id}  ${m.what}\n        !! SURVIVED — the guard is decoration`);
    }
  } finally {
    fs.writeFileSync(p, original, "utf8");
    if (fs.readFileSync(p, "utf8") !== original) {
      console.error(`\n!! ${m.file} was NOT restored. Fix it by hand before committing.`);
      process.exit(2);
    }
  }
}

console.log("\nre-running the guard file to prove the restore:");
const back = runTest();
console.log(`  ${back === 0 ? "PASS" : "FAIL"}  ${TEST} back to ${back} failing`);
if (back !== 0) process.exit(2);

console.log(`\n${caught}/${MUTATIONS.length} mutations caught`);
if (survivors.length) {
  console.log("\nSURVIVORS — each one is a guard that does not guard:");
  for (const s of survivors) console.log(`  · ${s}`);
}
process.exit(survived === 0 ? 0 : 1);
