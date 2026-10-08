// scripts/dev/argus-team-mutation-check.mjs
//
// ARGUS → Your team (contract ARGUS employees phase 1 §H.4): a green guard proves
// nothing until it is made to fail on purpose (feedback_mutation_test_your_guards).
//
// Each mutation below BREAKS one guard this build added, runs the test that is
// supposed to catch it, and asserts that test goes RED. Then it puts the file
// back, byte for byte, and proves the restore by running the tests green again.
//
//   node scripts/dev/argus-team-mutation-check.mjs        (every line must say RED)
//
// Before any mutation, every guard test must be GREEN as it stands — a test that
// cannot even load would otherwise "catch" every mutation and prove nothing.
// The tests run with the repo's TypeScript loader, exactly as `npm test` does.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const abs = (p) => path.join(REPO, p);
const LIB = "test/argus-team-lib.test.mjs";
const UI = "test/argus-team-ui.test.mjs";
const SURFACES = "test/agent-surfaces-ui.test.mjs";

const MUTATIONS = [
  { id: "M19", what: "an always-asks job gets the mode control", file: "src/lib/team.ts",
    find: 'const modeControl = job.mode_rule === "either";', to: "const modeControl = true;", test: LIB },
  { id: "M19b", what: "the job row draws the mode select whatever jobRowState says", file: "src/components/argus/team/JobRow.tsx",
    find: "{st.modeControl && !hideMode ? (", to: "{!hideMode ? (", test: UI },
  { id: "M20", what: "Needs you drops a failed source silently", file: "src/lib/team.ts",
    find: "    if (r.failed) failures.push({ source: r.source, words: sourceFailedWords(r.source) });\n", to: "", test: LIB },
  { id: "M20b", what: "the hook stops keeping the failure lines", file: "src/hooks/useNeedsYou.ts",
    find: "    setFailures(merged.failures);", to: "    setFailures([]);", test: UI },
  { id: "T21", what: "the oversight layer's checks and notes count as waiting items", file: "src/lib/team.ts",
    find: "    const rows = (Array.isArray(settled.value) ? settled.value : []).filter(isWaitingItem);", to: "    const rows = Array.isArray(settled.value) ? settled.value : [];", test: LIB },
  { id: "T22", what: "a hook comes back below the router's redirects (blank page after a redirect)", file: "src/pages/ServiceRouter.tsx",
    find: "  if (!service) {", to: "  const late = useMemo(() => null, []);\n  if (!service) {", test: UI },
  { id: "T1", what: "a held draft can be approved without a changed word", file: "src/lib/team.ts",
    find: "  return approve.edits_required ? changed : true;", to: "  return true;", test: LIB },
  { id: "T2", what: "an ARION item can send its decision anywhere", file: "src/lib/team.ts",
    find: '  if (source === "arion") return pathname.startsWith("/arion/");', to: '  if (source === "arion") return true;', test: LIB },
  { id: "T3", what: "every failure is read as 'product not owned' (silent)", file: "src/lib/team.ts",
    find: "  if (statusOfError(settled.reason) === 403) return", to: "  if (true) return", test: LIB },
  { id: "T4", what: "a planned job gets a switch", file: "src/lib/team.ts",
    find: '  if (job.state === "planned") return { ...base, lockLine: words || NOT_BUILT_WORDS };\n', to: "", test: LIB },
  { id: "T5", what: "a job of an employee not on the team gets a switch", file: "src/lib/team.ts",
    find: "  if (!job.on_team) return { ...base, lockLine: null };\n", to: "", test: LIB },
  { id: "T6", what: "a refusal naming the account record reaches the screen", file: "src/lib/team.ts",
    find: "/tenant|\\bjson\\b|playbook/i.test(t)", to: "/^$/.test(t)", test: LIB },
  { id: "T7", what: "a knob change on a rule door is sent as 'switch it off'", file: "src/components/argus/team/doors.ts",
    find: '  if (!("enabled" in change) || !door.rule_key) return null;\n  const key = encodeURIComponent(door.rule_key);\n  return { method: "PATCH", path: `/automations/rules/${key}`, body: { is_enabled: change.enabled } };',
    to: '  const key = encodeURIComponent(door.rule_key || "");\n  return { method: "PATCH", path: `/automations/rules/${key}`, body: { is_enabled: "enabled" in change ? change.enabled : false } };',
    test: LIB },
  { id: "T8", what: "a stored stars minimum below 4 is trusted", file: "src/lib/team.ts",
    find: 'const min = def.type === "stars" ? Math.max(4, def.min ?? 4) : def.min;', to: 'const min = def.type === "stars" ? (def.min ?? 4) : def.min;', test: LIB },
  { id: "T9", what: "version 0 reads as if it were written from saved details", file: "src/lib/team.ts",
    find: "  if (c.version <= 0) {", to: "  if (false) {", test: LIB },
  { id: "T10", what: "a business without SPARK loses its jobs on Workflows again", file: "src/pages/argus/ArgusWorkflowsPage.tsx",
    find: '{!loading && tab === "all" && (\n        <div className="mb-3 space-y-3">', to: '{!loading && !noSpark && tab === "all" && (\n        <div className="mb-3 space-y-3">', test: UI },
  { id: "T11", what: "the employee page starts polling", file: "src/pages/argus/ArgusEmployeePage.tsx",
    find: "    if (!ready) return;\n    void load();\n  }, [ready, load]);", to: "    if (!ready) return;\n    void load();\n    const t = setInterval(load, 5000);\n    return () => clearInterval(t);\n  }, [ready, load]);", test: UI },
  { id: "T12", what: "an answer loses its anchor, so Change it lands nowhere", file: "src/pages/settings/YourBusinessPage.tsx",
    find: '<div id="offersAllowed">', to: "<div>", test: UI },
  { id: "T13", what: "a decision is sent without checking the route belongs to its product", file: "src/hooks/useNeedsYou.ts",
    find: "    if (!decidePathOk(source, path)) {", to: "    if (false) {", test: UI },
  { id: "T14", what: "the Needs-you card lets a held draft be approved as written", file: "src/components/argus/team/NeedsYouCard.tsx",
    find: "requireEditsToApprove={!approveAllowed(approve, false)}", to: "requireEditsToApprove={false}", test: UI },
  { id: "T15", what: "the approval card's Approve ignores 'edits required'", file: "src/components/agents/AgentApprovalCard.tsx",
    find: "disabled={approveBusy || !!requireEditsToApprove}", to: "disabled={approveBusy}", test: SURFACES },
  { id: "T16", what: "a refused save shows the api name instead of the question's label", file: "src/lib/businessProfileForm.ts",
    find: "  const label = (f: string | undefined) => (f && FIELD_LABELS[f]) || 'One answer';", to: "  const label = (f: string | undefined) => f || 'One answer';", test: LIB },
  { id: "T17", what: "an old Agents link stops redirecting", file: "src/pages/ServiceRouter.tsx",
    find: "  if (serviceKey && OLD_AGENTS_PAGES[serviceKey]) {", to: "  if (false && serviceKey && OLD_AGENTS_PAGES[serviceKey]) {", test: UI },
  { id: "T18", what: "the word for the account record reaches a job row", file: "src/components/argus/team/JobRow.tsx",
    find: '{running ? "Running…" : "Run it now"}', to: '{running ? "Running…" : "Run it now for this tenant"}', test: UI },
  { id: "T19", what: "a business's town is written into the code", file: "src/lib/team.ts",
    find: 'export const NOT_BUILT_WORDS = "Not built yet";', to: 'export const NOT_BUILT_WORDS = "Not built yet in Des Moines";', test: UI },
  { id: "T20", what: "the switch shows an optimistic On before the server answers", file: "src/components/argus/team/JobRow.tsx",
    find: "    if (out.ok) {\n      onChanged(out.job);", to: "    onChanged({ ...job, ...patch } as JobView);\n    if (out.ok) {\n      onChanged(out.job);", test: UI },

  // ── the fixer's guards (review of 7565300, 8 Oct) ──
  { id: "F1a", what: "a single run that stopped, was off or failed is said as success", file: "src/lib/team.ts",
    find: "  const failed = runFailure(d);\n  if (failed) return { ok: false, words: failed };\n", to: "", test: LIB },
  { id: "F1b", what: "a tick's blocked, failed or halted entries are ignored", file: "src/lib/team.ts",
    find: "    const failures = entries.map(runFailure).filter((w): w is string => !!w);", to: "    const failures: string[] = [];", test: LIB },
  { id: "F1c", what: "the page shows a failed run in the green notice", file: "src/pages/argus/ArgusEmployeePage.tsx",
    find: "      else setPageAlert(result.words);", to: "      else setNotice(result.words);", test: UI },
  { id: "F1d", what: "a review run whose Google read failed reads as nothing to do", file: "src/lib/team.ts",
    find: "    if (Array.isArray(d.errors) && d.errors.length) failures.push(RUN_PART_FAILED_WORDS);\n", to: "", test: LIB },
  { id: "F2a", what: "a business without the product is not told so", file: "src/lib/team.ts",
    find: '  if (row.product_owned === false) return "not_owned";\n', to: "", test: LIB },
  { id: "F2b", what: "the page stops reading GET /me/team (standing from the :key answer alone)", file: "src/pages/argus/ArgusEmployeePage.tsx",
    find: "      setEmployee(withStanding(emp.employee, listed));", to: "      setEmployee(emp.employee);", test: UI },
  { id: "F2c", what: "a door of a product not owned says 'couldn't read' again", file: "src/components/argus/team/doors.ts",
    find: '  if (notOwnedWords) return { control: "locked", words: notOwnedWords, link: { label: "Plan & Pricing", to: PLAN_PRICING_ROUTE } };\n', to: "", test: LIB },
  { id: "F3a", what: "a social post approved but not scheduled reads green", file: "src/lib/team.ts",
    find: "  const failed = d.scheduled === false || d.ok === false", to: "  const failed = d.ok === false", test: LIB },
  { id: "F3b", what: "the hook treats every 2xx decision as ok again", file: "src/hooks/useNeedsYou.ts",
    find: "      const result = decisionResult(which, out);", to: "      const result = { ok: true, words: 'Done.' };", test: UI },
  { id: "F4a", what: "Run it now is offered on a job that is off", file: "src/lib/team.ts",
    find: "  return p.hasRunRoute === true && p.isOn === true && !p.paused && !p.halted;", to: "  return p.hasRunRoute === true && !p.paused && !p.halted;", test: LIB },
  { id: "F4b", what: "the row ignores canRunNow (the reviewer's surviving mutation)", file: "src/components/argus/team/JobRow.tsx",
    find: "  const canRun = canRunNow({ hasRunRoute: !!onRunNow, isOn, paused: st.paused, halted: !!halted, problem: job.problem });", to: "  const canRun = !!onRunNow;", test: UI },
  { id: "F5", what: "an encoded dot segment carries a decision onto another route", file: "src/lib/team.ts",
    find: "  if (/%2e|%2f|%5c/i.test(path)) return false;\n  let pathname: string;\n  try { pathname = new URL(path, \"http://x\").pathname; } catch { return false; }\n  const asked = path.split(/[?#]/)[0];\n  if (pathname !== asked) return false;\n",
    to: "  let pathname: string = path;\n", test: LIB },
  { id: "F6a", what: "the toast says the asked mode, not the server's", file: "src/lib/team.ts",
    find: "  if (patch.mode !== undefined) return modeToast(name, shownMode(next), next.mode_set_by, next.mode_set_at, next.enabled);", to: "  if (patch.mode !== undefined) return modeToast(name, patch.mode, next.mode_set_by, next.mode_set_at, next.enabled);", test: LIB },
  { id: "F6b", what: "changed:false still reads as a change", file: "src/lib/team.ts",
    find: "  if (next.changed === false) return NOTHING_CHANGED_SAVED_WORDS;\n", to: "", test: LIB },
  { id: "F7", what: "the time picker is hidden while editing a social post", file: "src/components/agents/AgentApprovalCard.tsx",
    find: "                  editing too: Save & approve must never use a value the screen hid. */}\n              {extra}\n", to: "                  editing too: Save & approve must never use a value the screen hid. */}\n", test: UI },
  { id: "F10a", what: "a skip-only row gets no button (lib)", file: "src/lib/team.ts",
    find: '  if (d.skip) return "skip";\n', to: "", test: LIB },
  { id: "F10b", what: "a skip-only row gets no button (card)", file: "src/components/argus/team/NeedsYouCard.tsx",
    find: '  if (kind === "skip" && d.skip) {', to: "  if (false) {", test: UI },
  { id: "F12a", what: "the products' attribution line reaches the card (lib)", file: "src/lib/team.ts",
    find: '  return { ...row, attribution: "", hold_note:', to: "  return { ...row, hold_note:", test: LIB },
  { id: "F12b", what: "the card draws the row as the product sent it", file: "src/components/argus/team/NeedsYouCard.tsx",
    find: "  const shown = cardRow(row, jobName);", to: "  const shown = { ...row, agent_label: row.attribution };", test: UI },
  { id: "F14", what: "a door with no section writes the Quote-to-Cash switch by guess", file: "src/components/argus/team/doors.ts",
    find: '    if (door.section !== "qtc" && door.section !== "fieldops") return null;\n    const section = door.section;', to: '    const section = door.section || "qtc";', test: LIB },
  { id: "F15a", what: "a plan refusal on a door shows the machine message", file: "src/components/argus/team/doors.ts",
    find: "  if (TIER_CODES.test(code)) {", to: "  if (false) {", test: LIB },
  { id: "F15b", what: "the page shows a door refusal through apiErrorMessage again", file: "src/pages/argus/ArgusEmployeePage.tsx",
    find: "[job.job_key]: doorRefusalWords(err, job) }", to: "[job.job_key]: apiErrorMessage(err) }", test: UI },
  { id: "F15c", what: "a door the plan refuses can be switched on", file: "src/components/argus/team/doors.ts",
    find: '  if (refused && state.enabled !== true) return { control: "locked", words: gateLine!.words, link: gateLine!.link };\n', to: "", test: LIB },
  { id: "F16", what: "a list setting splits on commas again", file: "src/lib/team.ts",
    find: "      const items = v.split(/\\r?\\n/).map((s) => s.trim()).filter(Boolean);", to: "      const items = v.split(/\\r?\\n|,/).map((s) => s.trim()).filter(Boolean);", test: LIB },
  { id: "F17", what: "a locked job's drawer says 'When you ask'", file: "src/lib/team.ts",
    find: '  if (job.state === "locked") return (job.lock_words || "").trim() || NEVER_WORDS;\n', to: "", test: LIB },
  { id: "F18", what: "a skipped or failed rule run reads as Last sent", file: "src/components/argus/team/doors.ts",
    find: '  const sent = runs.find((r) => r.status === "success") || null;', to: "  const sent = runs[0] || null;", test: LIB },
  { id: "F19a", what: "an Off job's mode toast promises it will go out", file: "src/lib/team.ts",
    find: "  const later = enabled === true ? \"\" : \" once it's on\";", to: "  const later = \"\";", test: LIB },
  { id: "F19b", what: "ARION → Reviews says it answers reviews while the job is off", file: "src/lib/team.ts",
    find: '  if (enabled === true) return "Your web person writes a reply', to: '  if (true) return "Your web person writes a reply', test: LIB },
  { id: "F19c", what: "a choice option shows its code", file: "src/lib/team.ts",
    find: "  const w = CHOICE_WORDS[varKey]?.[option];", to: "  const w = option;", test: LIB },
  { id: "F20", what: "the load-failure line says itself twice", file: "src/lib/team.ts",
    find: '  const generic = w === "Try again in a minute." || w.startsWith("We couldn\'t reach the server");', to: "  const generic = true;", test: LIB },
  // ── the fixer's guards (verifier, 8 Oct 14:48Z) ──
  { id: "B1a", what: "Run it now is offered on a job that is on but can't read its job description", file: "src/lib/team.ts",
    find: '  if (typeof p.problem === "string" && p.problem.trim()) return false;\n', to: "", test: LIB },
  { id: "B1b", what: "the row stops passing the job's problem to canRunNow", file: "src/components/argus/team/JobRow.tsx",
    find: "halted: !!halted, problem: job.problem });", to: "halted: !!halted });", test: UI },
  { id: "B1c", what: "jobRowState drops the problem, so the row reads a quiet On", file: "src/lib/team.ts",
    find: "    paused: on && refused,\n    problemLine,\n", to: "    paused: on && refused,\n", test: LIB },
  { id: "B1d", what: "the row stops drawing the problem line", file: "src/components/argus/team/JobRow.tsx",
    find: "      {st.problemLine && !hideSwitch && <ProblemLine words={st.problemLine} />}\n", to: "", test: UI },
  { id: "B1e", what: "the drawer stops saying the problem", file: "src/components/argus/team/JobDrawer.tsx",
    find: "        {problem && (", to: "        {false && (", test: UI },
  { id: "B1f", what: "the problem line is not an alert", file: "src/components/argus/team/JobRow.tsx",
    find: '" role="alert" data-job-problem>', to: '" data-job-problem>', test: UI },
  { id: "B3a", what: "a 500 on Run it now shows the server's body", file: "src/lib/team.ts",
    find: "  if (status !== null && status >= 500) return RUN_SERVER_FAULT_WORDS;\n", to: "", test: LIB },
  { id: "B3b", what: "the page shows a Run it now failure through apiErrorMessage again", file: "src/pages/argus/ArgusEmployeePage.tsx",
    find: "      setPageAlert(runNowFailure(err));", to: "      setPageAlert(apiErrorMessage(err));", test: UI },
  { id: "B3c", what: "a 4xx body that is not a sentence reaches the alert", file: "src/lib/team.ts",
    find: "    const said = runnerSentence(b.words) || runnerSentence(b.message) || runnerSentence(inner);",
    to: "    const said = String(b.words || b.message || inner || \"\") || null;", test: LIB },
  { id: "B3d", what: "arion's kill switch (503 AGENT_DISABLED) reads as a fault to retry", file: "src/lib/team.ts",
    find: "  if (errorCodeOf(body) === \"AGENT_DISABLED\") return RUN_PAUSED_WORDS;\n", to: "", test: LIB },
  { id: "B3e", what: "a top-level message that is not a sentence reaches the alert", file: "src/lib/team.ts",
    find: "    const said = runnerSentence(b.words) || runnerSentence(b.message) || runnerSentence(inner);",
    to: "    const said = runnerSentence(b.words) || (typeof b.message === \"string\" ? b.message : null) || runnerSentence(inner);", test: LIB },
  { id: "B1g", what: "a blank problem keeps Run it now off", file: "src/lib/team.ts",
    find: "  if (typeof p.problem === \"string\" && p.problem.trim()) return false;", to: "  if (typeof p.problem === \"string\" && p.problem.length) return false;", test: LIB },
  { id: "B6", what: "a run that wrote some pieces and couldn't finish others reads green", file: "src/lib/team.ts",
    find: "        if (f > 0) failures.push(runnerSentence(e.words) || partNotFinishedWords(f, num(e.attempted) || dr + f));\n", to: "", test: LIB },
  { id: "B4", what: "arion's productOff: true reads as 'couldn't finish'", file: "src/lib/team.ts",
    find: "  if (d.productOff === true) return { ok: false, words: RUN_NOT_OWNED_WORDS };\n", to: "", test: LIB },
  { id: "B5", what: "the drawer writes its own 'never' sentence", file: "src/components/argus/team/JobDrawer.tsx",
    find: '<p className="text-slate-500">Nothing listed.</p>}\n              </Section>\n            </>',
    to: '<p className="text-slate-500">Nothing listed.</p>}\n                <p>Never names a competitor.</p>\n              </Section>\n            </>', test: UI },
];

function runTest(file) {
  const r = spawnSync(process.execPath, ["--import", "./scripts/test-ts-loader.mjs", "--test", file], { cwd: REPO, encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const m = /^# fail (\d+)$/m.exec(out);
  return { failed: m ? Number(m[1]) : (r.status === 0 ? 0 : 1), out };
}

console.log("ARGUS → Your team — Portal mutation check");
for (const f of [LIB, UI, SURFACES]) {
  const { failed } = runTest(f);
  console.log(`  baseline ${failed === 0 ? "GREEN" : "RED  "} ${f}`);
  if (failed !== 0) { console.error("A guard test is red before any mutation; fix that first."); process.exit(2); }
}
console.log("Each line breaks one guard and asserts the test that should catch it goes RED.\n");

let caught = 0;
const survivors = [];
for (const m of MUTATIONS) {
  const p = abs(m.file);
  const original = fs.readFileSync(p, "utf8");
  if (!original.includes(m.find)) {
    survivors.push(`${m.id}: ANCHOR MISSING in ${m.file} — this mutation tested nothing. Fix the harness.`);
    console.log(`  ????  ${m.id}  ${m.what}\n        anchor not found in ${m.file}`);
    continue;
  }
  try {
    fs.writeFileSync(p, original.split(m.find).join(m.to), "utf8");
    const { failed } = runTest(m.test);
    if (failed > 0) {
      caught += 1;
      console.log(`  RED   ${m.id}  ${m.what}\n        caught by ${m.test} (${failed} failing)`);
    } else {
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

console.log("\nre-running the guard files to prove the restore:");
for (const f of [LIB, UI, SURFACES]) {
  const { failed } = runTest(f);
  console.log(`  ${failed === 0 ? "PASS" : "FAIL"}  ${f}`);
  if (failed !== 0) process.exit(2);
}
console.log(`\n${caught}/${MUTATIONS.length} mutations caught`);
if (survivors.length) {
  console.log("\nSURVIVORS — each one is a guard that does not guard:");
  for (const s of survivors) console.log(`  · ${s}`);
}
process.exit(survivors.length === 0 ? 0 : 1);
