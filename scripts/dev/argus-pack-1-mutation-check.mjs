// Portal-septa-argus1/scripts/dev/argus-pack-1-mutation-check.mjs
//
// A green guard proves nothing until you make it fail on purpose
// (feedback_mutation_test_your_guards).
//
// Each mutation below BREAKS one guard ARGUS pack 1 added, runs the test that is
// supposed to catch it, and asserts the test goes RED. Then it puts the file
// back, byte for byte, and re-runs to prove the restore worked. A mutation that
// SURVIVES is printed as a survivor: the guard is decoration and the test is not
// pinning what it claims to pin.
//
//   node scripts/dev/argus-pack-1-mutation-check.mjs
//
// It edits files in the working tree and restores them from an in-memory copy in
// a finally block, so an interrupt cannot leave a mutation behind — and it
// verifies the restore rather than assuming it.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const abs = (p) => path.join(REPO, p);

/**
 * Each mutation: the file, the exact text to swap, and the test that must fail.
 *
 * `find` is asserted present before the swap. A mutation whose anchor has moved
 * is a mutation that silently tests nothing, so a missing anchor is a failure of
 * this harness and not a pass.
 */
const MUTATIONS = [
  {
    id: "M1",
    what: "the ARION page loses its Put-it-live button, so approving is the only step",
    file: "src/pages/arion/ArionAgentsPage.tsx",
    find: "Put it live",
    to: "Approve",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M2",
    what: "held-back drafts are merged into the normal list (AC2 broken on screen)",
    file: "src/pages/arion/ArionAgentsPage.tsx",
    find: "Held back for a person to read",
    to: "More drafts",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M3",
    what: "the run-history panel starts showing a dollar figure to the client",
    file: "src/components/agents/AgentRunHistoryPanel.tsx",
    find: "        <div className=\"text-xs text-slate-800\">{row.outcome_label}</div>",
    to: "        <div className=\"text-xs text-slate-800\">{row.outcome_label} {row.cost_usd}</div>",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M4",
    what: "the run history disappears from a product page",
    file: "src/pages/oliver/OliverAgentsPage.tsx",
    find: "        <AgentRunHistoryPanel",
    to: "        {false && <AgentRunHistoryPanel",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M5",
    what: "Run it now grows a second start path instead of calling the agent's own route",
    file: "src/pages/oliver/OliverAgentsPage.tsx",
    find: '    qtc: "/qtc-agent/run",',
    to: '    qtc: "/agents/start-a-cycle",',
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M6",
    what: "a founder switch takes a boolean instead of the typed words",
    file: "src/pages/admin/AgentControlsCard.tsx",
    find: "confirm: typed",
    to: "confirm: true",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M7",
    what: "an unreadable spend switch renders as 'off' instead of UNKNOWN",
    file: "src/pages/admin/AgentControlsCard.tsx",
    find: '"UNKNOWN',
    to: '"Stopped.',
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M8",
    what: "the oversight layer's indexed runs are printed as its own runs and cost",
    file: "src/pages/admin/AgentsAcrossBusinessesPage.tsx",
    find: '                  {a.kind === "oversight" ? (',
    to: "                  {false ? (",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M9",
    what: "the proposal queue stops saying that approving does not apply anything",
    file: "src/pages/admin/AgentCodeProposalsCard.tsx",
    find: "Approving does not apply anything.",
    to: "Approve to apply.",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M10",
    what: "the ARION page starts spelling an attribution line itself again",
    file: "src/pages/arion/ArionAgentsPage.tsx",
    find: "  const api = useArionAgentsApi();",
    to: "  const api = useArionAgentsApi(); // Created by Intelligent Analytics",
    test: "test/agent-surfaces-ui.test.mjs",
  },
  {
    id: "M11",
    what: "the word tenant reaches a client-facing agent page",
    file: "src/pages/arion/ArionAgentsPage.tsx",
    find: "  const [runs, setRuns] = useState<AgentRunsPayload | null>(null);",
    to: '  const [runs, setRuns] = useState<AgentRunsPayload | null>(null);\n  const tenantLabel = "tenant";',
    test: "test/agent-surfaces-ui.test.mjs",
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

console.log("ARGUS pack 1 — Portal mutation check");
console.log("Each line breaks one guard and asserts the test that should catch it goes RED.\n");

for (const m of MUTATIONS) {
  const p = abs(m.file);
  const original = fs.readFileSync(p, "utf8");
  if (!original.includes(m.find)) {
    survived += 1;
    survivors.push(`${m.id}: ANCHOR MISSING in ${m.file} — this mutation tested nothing. Fix the harness.`);
    console.log(`  ????  ${m.id}  ${m.what}\n        anchor not found in ${m.file}`);
    continue;
  }
  try {
    // EVERY occurrence, not the first. A rule that appears twice in a file — the
    // same guard in two tables, the same confirm prompt in two branches — is
    // "broken" only when both copies are broken, and replacing one left the test
    // matching the survivor and reported a false SURVIVED. Found by this harness
    // being wrong about the Portal.
    const mutated = original.split(m.find).join(m.to);
    fs.writeFileSync(p, mutated, "utf8");
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
      console.error(`\n!! ${m.file} was NOT restored. Fix it by hand before committing.`);
      process.exit(2);
    }
  }
}

// The suite must be green again, or the restore lied.
console.log("\nre-running both guard files to prove the restore:");
for (const f of ["test/agent-surfaces-ui.test.mjs"]) {
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
