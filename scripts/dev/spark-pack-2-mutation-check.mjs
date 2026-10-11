// spark-pack-2-mutation-check — Portal.
//
// A green guard proves nothing until you make it fail on purpose
// (`feedback_mutation_test_your_guards`).
//
//   node scripts/dev/spark-pack-2-mutation-check.mjs

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const abs = (p) => path.join(REPO, p);
const T = "test/spark-pack-2-ui.test.mjs";
const CHAT = "test/web-chat-ui.test.mjs";
const TAP = "test/tap-targets.test.mjs";

const MUTATIONS = [
  {
    id: "P1",
    what: "the Conversations row is hidden again, so a conversation with no lead has nowhere to be",
    file: "src/components/SubNav.tsx",
    find: '{ key: "spark_conversations", label: "Conversations", route: "/app/services/spark_conversations" }',
    to: '{ key: "spark_conversations", label: "Conversations", route: "/app/services/spark_conversations", hidden: true }',
    test: T,
  },
  {
    id: "P2",
    what: "the Conversations row grows an add-on gate, hiding a business's OWN texts behind something they buy",
    file: "src/components/SubNav.tsx",
    find: '{ key: "spark_conversations", label: "Conversations", route: "/app/services/spark_conversations" }',
    to: '{ key: "spark_conversations", label: "Conversations", route: "/app/services/spark_conversations", addon: "leadgen" }',
    test: T,
  },
  {
    id: "P3",
    what: "the Lead Inbox stops offering the way through",
    file: "src/pages/spark/SparkLeadInboxPage.tsx",
    find: 'href="/app/services/spark_conversations"',
    to: 'href="/app/services/spark_lead_inbox"',
    test: T,
  },
  {
    id: "P4",
    what: "the reply refusal is swallowed, so the owner presses Send and nothing happens",
    file: "src/pages/spark/SparkConversationsPage.tsx",
    find: "      setSendError(msg);",
    to: "      void msg;",
    test: T,
  },
  {
    id: "P5",
    what: "a widget that failed to load renders as a number rather than as a failure",
    file: "src/pages/spark/SparkDashboardsPage.tsx",
    find: '        if (!cancelled) setState("error");',
    to: '        if (!cancelled) setState("ready");',
    test: T,
  },
  {
    id: "P6",
    what: "a default widget points at an endpoint that has never existed",
    file: "src/components/spark/dashboardWidgets.ts",
    find: '  "/api/v1/contacts?limit=1",\n  "/api/v1/leads?status=new&limit=1",',
    to: '  "/api/v1/contacts/count",\n  "/api/v1/leads?status=new&limit=1",',
    test: T,
  },
  {
    id: "P7",
    what: "an unread total we could not read renders as a page size rather than as nothing",
    file: "src/components/spark/dashboardWidgets.ts",
    find: "  // No meta on this response — the length of the page is the honest floor, and\n  // it is only right when the page held everything. Rather than report a page\n  // size as a total, say we do not know.\n  return null;\n}",
    to: "  return arr(p.data).length;\n}",
    test: T,
  },
  {
    id: "P8",
    what: "the Reputation Hub goes back to reporting every saved reply as posted",
    file: "src/pages/spark/SparkReviewsPage.tsx",
    find: '              if (r.response_source_status === "published") {\n                return <span className="text-xs text-emerald-700">✓ Posted on Google</span>;\n              }',
    to: '              return <span className="text-xs text-emerald-700">✓ Posted on Google</span>;\n              if (false) {}',
    test: T,
  },
  {
    id: "P9",
    what: "the Reputation Hub is cut from the nav again, leaving a SPARK-only business with no reputation surface",
    file: "src/components/SubNav.tsx",
    find: '{ key: "spark_reviews", label: "Reputation Hub", route: "/app/services/spark_reviews" }',
    to: '{ key: "spark_reviews", label: "Reputation Hub", route: "/app/services/spark_reviews", hidden: true }',
    test: T,
  },
  {
    id: "P10",
    what: "the deleted SPARK Social address 404s instead of pointing at where the feature went",
    file: "src/pages/ServiceRouter.tsx",
    find: "  if (serviceKey === 'spark_social') {\n    return <Navigate to=\"/app/services/my_brand_calendar\" replace />;\n  }",
    to: "  if (false) {\n    return <Navigate to=\"/app/services/my_brand_calendar\" replace />;\n  }",
    test: T,
  },
  {
    id: "P11",
    what: "a My Brand channel row promises a version instead of naming the vendor step",
    file: "src/config/serviceCatalog.ts",
    find: "Each platform has to approve our app for your business before we can connect it, and those reviews are with them.",
    to: "Connecting channels ships with v1.1.",
    test: T,
  },
  {
    id: "P12",
    what: "the image and design half states its own 'coming soon' again instead of the catalog's availability",
    file: "src/config/serviceCatalog.ts",
    find: "{ key: 'my_brand_image_studio', displayName: 'Image Studio', section: 'MY_BRAND', route",
    to: "{ key: 'my_brand_image_studio', displayName: 'Image Studio', section: 'MY_BRAND', defaultStatus: 'coming_soon', route",
    test: T,
  },
  {
    id: "P13",
    what: "Lead sources goes back to claiming there is nothing to paste, for a business whose site we do not host",
    file: "src/pages/spark/SparkLeadSourcesPage.tsx",
    find: "                A website we host needs nothing pasted. For any other website, add it below and\n                copy one line into it.",
    to: "                No key, nothing to paste. These are already yours; you just switch them on.",
    test: CHAT,
  },
  {
    id: "P14",
    what: "the Conversations filters grow an inline 24px chip instead of using the one component",
    file: "src/pages/spark/SparkConversationsPage.tsx",
    find: '            <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>\n              Unread only\n            </FilterChip>',
    to: '            <button onClick={() => setUnreadOnly((v) => !v)} className="rounded-full px-3 py-1 text-xs font-semibold">Unread only</button>',
    test: TAP,
  },
];

let caught = 0;
let survived = 0;
const survivors = [];

function runTest(file) {
  const r = spawnSync(process.execPath, ["--test", file], { cwd: REPO, encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const m = /^# fail (\d+)$/m.exec(out);
  return { failed: m ? Number(m[1]) : (r.status === 0 ? 0 : 1), out };
}

console.log("SPARK pack 2 — Portal mutation check\n");

for (const m of MUTATIONS) {
  const p = abs(m.file);
  const original = fs.readFileSync(p, "utf8");
  const lf = m.find;
  const crlf = m.find.replace(/\n/g, "\r\n");
  const which = original.includes(lf) ? lf : (original.includes(crlf) ? crlf : null);
  if (!which) {
    survived += 1;
    survivors.push(`${m.id}: ANCHOR MISSING in ${m.file} — this mutation tested nothing.`);
    console.log(`  ????  ${m.id}  ${m.what}\n        anchor not found in ${m.file}`);
    continue;
  }
  const to = which === crlf ? m.to.replace(/\n/g, "\r\n") : m.to;
  try {
    // EVERY occurrence: a rule written twice is broken only when both copies are.
    fs.writeFileSync(p, original.split(which).join(to), "utf8");
    const { failed } = runTest(m.test);
    if (failed > 0) {
      caught += 1;
      console.log(`  RED   ${m.id}  ${m.what}\n        caught by ${m.test} (${failed} failing)`);
    } else {
      survived += 1;
      survivors.push(`${m.id}: ${m.what} — SURVIVED ${m.test}`);
      console.log(`  GREEN ${m.id}  ${m.what}\n        !! SURVIVED ${m.test} — the guard is decoration`);
    }
  } finally {
    fs.writeFileSync(p, original, "utf8");
    if (fs.readFileSync(p, "utf8") !== original) {
      console.error(`\n!! ${m.file} was NOT restored.`);
      process.exit(2);
    }
  }
}

console.log("\nre-running the guard files to prove the restore:");
for (const f of [T, CHAT, TAP]) {
  const { failed } = runTest(f);
  console.log(`  ${failed === 0 ? "PASS" : "FAIL"}  ${f} back to ${failed} failing`);
  if (failed !== 0) process.exit(2);
}

console.log(`\n${caught}/${MUTATIONS.length} mutations caught`);
if (survivors.length) {
  console.log("\nSURVIVORS — each one is a guard that does not guard:");
  for (const s of survivors) console.log(`  · ${s}`);
}
process.exit(survived === 0 ? 0 : 1);
