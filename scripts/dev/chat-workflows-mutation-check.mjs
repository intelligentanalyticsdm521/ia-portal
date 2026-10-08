// scripts/dev/chat-workflows-mutation-check.mjs — the Portal's chat-workflow
// guards, each removed in turn: edit → run the test file that pins it →
// restore. Every line must print RED; a GREEN line is a guard no test watches.
//
//   node scripts/dev/chat-workflows-mutation-check.mjs
//
// Contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §G.4 (P1–P4 plus the
// card's own guards, and F1–F27 from the 7 Oct review fixes). Files are
// restored byte for byte in a finally, and the deleted old page is removed
// again after P4. P4 reads the old page from the commit before the one that
// deleted it, so it runs on any later tree.
//
//   node scripts/dev/chat-workflows-mutation-check.mjs F      (only ids starting F)
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (rel) => path.join(ROOT, rel);
const LIB = "src/lib/chatWorkflows.ts";
const PAGE = "src/pages/argus/ArgusWorkflowsPage.tsx";
const CARD = "src/components/spark/ChatWorkflowCard.tsx";
const SOURCES = "src/pages/spark/SparkLeadSourcesPage.tsx";
const FIX = "test/chat-workflow-fixes.test.mjs";

function runTest(file) {
  const r = spawnSync(process.execPath, ["--import", "./scripts/test-ts-loader.mjs", "--test", file], { cwd: ROOT, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const fails = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { code: r.status, fails };
}

const M = [
  { id: "P1", file: "src/pages/argus/ArgusWorkflowsPage.tsx", test: "test/argus-workflows-ui.test.mjs",
    from: "Nothing needs you right now.", to: "Nothing needs you right now. No intent matched." },
  { id: "P2", file: "src/pages/argus/ArgusWorkflowsPage.tsx", test: "test/argus-workflows-ui.test.mjs",
    from: "  const needsCount = needsYou.length;", to: "  useEffect(() => { const t = setInterval(() => void loadNeedsYou(), 5000); return () => clearInterval(t); }, [loadNeedsYou]);\n  const needsCount = needsYou.length;" },
  { id: "P3", file: "src/components/spark/ChatWorkflowCard.tsx", test: "test/chat-workflow-card-ui.test.mjs",
    from: "onClose={() => { setSecret(null); setCopied(false); }}", to: "onClose={() => { setCopied(false); }}" },
  { id: "P4", restoreOld: true, test: "test/argus-workflows-ui.test.mjs" },
  { id: "C1", file: "src/lib/chatWorkflows.ts", test: "test/chat-workflow-card-ui.test.mjs",
    from: "typeof p.enabled === \"boolean\" ? p.enabled : switches[str(p.key)] !== false;", to: "typeof p.enabled === \"boolean\" ? p.enabled : true;" },
  { id: "C2", file: "src/pages/spark/SparkLeadSourcesPage.tsx", test: "test/chat-workflow-card-ui.test.mjs",
    from: "const emailsOn = site.visitor_emails_enabled !== false;", to: "const emailsOn = site.visitor_emails_enabled === true;" },
  { id: "C3", file: "src/components/spark/ChatWorkflowCard.tsx", test: "test/chat-workflow-card-ui.test.mjs",
    from: "          {playbook.allowed_words || \"Chat workflows with buttons come with the SPARK Leads Growth package.\"}\n        </p>",
    to: "          {playbook.allowed_words || \"Chat workflows with buttons come with the SPARK Leads Growth package.\"}\n        </p>\n        <Switch checked={live} onChange={setLive} label=\"Live\" />" },
  { id: "C4", file: "src/lib/chatWorkflows.ts", test: "test/chat-workflow-card-ui.test.mjs",
    from: "      if (seen.has(id)) break;\n", to: "" },
  { id: "C5", file: "src/lib/chatWorkflows.ts", test: "test/chat-workflow-card-ui.test.mjs",
    from: 'enabled: typeof p.on === "boolean" ? p.on : p.enabled !== false,', to: "enabled: true," },
  { id: "C6", file: "src/lib/chatWorkflows.ts", test: "test/chat-workflow-card-ui.test.mjs",
    from: "const bare = words.replace(PREFIX, \"\");", to: "const bare = words;" },
  { id: "W1", file: "src/pages/argus/ArgusWorkflowsPage.tsx", test: "test/argus-workflows-ui.test.mjs",
    from: "...(isFounder ? [{ key: \"setup\" as Tab, label: \"Set-up runs\" }] : []),", to: "{ key: \"setup\" as Tab, label: \"Set-up runs\" }," },
  { id: "H1", file: "src/pages/argus/ArgusWorkflowsPage.tsx", test: "test/chat-workflow-card-ui.test.mjs",
    from: "const itemKey = ", to: "const OWNER = \"Intelligent Analytics\";\nconst itemKey = " },
  { id: "L1", file: "src/components/spark/LeadChatPanel.tsx", test: "test/web-chat-ui.test.mjs",
    from: "          {c.workflow && <WorkflowBlock w={c.workflow} />}\n", to: "" },
  { id: "R1", file: "src/pages/argus/ArgusWorkflowsPage.tsx", test: "test/argus-workflows-ui.test.mjs",
    from: "        initialTab=\"conversation\"\n", to: "" },

  // ── 7 Oct review fixes (test/chat-workflow-fixes.test.mjs) ──────────────
  { id: "F1", file: LIB, test: FIX, note: "row gate opens on anything but false",
    from: "  if (w.allowed === true) return { controls: true, words: null };", to: "  if (w.allowed !== false) return { controls: true, words: null };" },
  { id: "F2", file: PAGE, test: FIX, note: "row renders the controls whatever the gate says",
    from: "{!gate.controls ? (", to: "{false ? (" },
  { id: "F3", file: PAGE, test: FIX, note: "a refused mode change goes back into the green notice",
    from: "      setRowError((e) => ({ ...e, [w.workflow_id]: refusalSentences(err) }));", to: "      setNotice(refusalSentences(err).join(\" \"));" },
  { id: "F4", file: PAGE, test: FIX, note: "the row's rose refusal is not rendered",
    from: "                <Refusal lines={rowError[w.workflow_id]} />\n", to: "" },
  { id: "F5", file: LIB, test: FIX, note: "any 403 reads as 'comes with SPARK'",
    from: "  return statusOf(err) === 403 && errorCodeOf(err) === \"not_allowed\";", to: "  return statusOf(err) === 403;" },
  { id: "F6", file: LIB, test: FIX, note: "History says the step's name twice",
    from: "  if (words.toLowerCase().startsWith(label.toLowerCase())) return words;\n", to: "" },
  { id: "F7", file: LIB, test: FIX, note: "'Looks like: Looks like …'",
    from: "const sentence = /^looks like\\b/i.test(w) || notSure ? w : `Looks like: ${w}`;", to: "const sentence = `Looks like: ${w}`;" },
  { id: "F8", file: LIB, test: FIX, note: "'Not sure what they want (sure)'",
    from: "  return s && !notSure ? `${sentence} (${s})` : sentence;", to: "  return s ? `${sentence} (${s})` : sentence;" },
  { id: "F9", file: CARD, test: FIX, note: "the add-tool form hardcodes 'report' again",
    from: "          result_label: form.result_label.trim() || \"report\",", to: "          result_label: \"report\"," },
  { id: "F10", file: LIB, test: FIX, note: "a raw JavaScript message reaches the owner",
    from: "    return [UNREACHABLE_WORDS];\n  }\n  try {", to: "    return [msg || UNREACHABLE_WORDS];\n  }\n  try {" },
  { id: "F11", file: LIB, test: FIX, note: "'Requires one of: admin. Your role: member.' reaches the owner",
    from: "    if (body.error === \"forbidden\") return [ADMIN_ONLY_WORDS];\n", to: "" },
  { id: "F12", file: LIB, test: FIX, note: "?tab=setup opens for anyone (blank page)",
    from: "  if (v === \"setup\" && isFounder) return \"setup\";", to: "  if (v === \"setup\") return \"setup\";" },
  { id: "F13", file: PAGE, test: FIX, note: "a failed History load can never be asked again",
    from: "      if (!older) historyAsked.current = false;\n", to: "" },
  { id: "F14", file: LIB, test: FIX, note: "Show older echoes the rounded time (skips a run)",
    from: "  return Number.isNaN(t) ? null : new Date(t + 1).toISOString();", to: "  return last;" },
  { id: "F15", file: LIB, test: FIX, note: "a run repeated across pages is shown twice",
    from: "    if (seen.has(r.run_id)) continue;\n", to: "" },
  { id: "F16", file: LIB, test: FIX, note: "one step count for the whole tree (late paths empty)",
    from: "    budget = MAX_STEPS;\n    cut = false;\n", to: "    cut = false;\n" },
  { id: "F17", file: LIB, test: FIX, note: "a cut path stops silently",
    from: "        if (!cut) { out.push({ kind: \"more\", text: MORE_STEPS_WORDS }); cut = true; }\n", to: "" },
  { id: "F18", file: LIB, test: FIX, note: "a chip into a switched-off path reads live",
    from: "const on = c.on !== false;", to: "const on = true;" },
  { id: "F19", file: LIB, test: FIX, note: "Remove matches tool names exactly",
    from: "const toolKey = (name: string) => (name || \"\").trim().toLowerCase();", to: "const toolKey = (name: string) => name;" },
  { id: "F20", file: LIB, test: FIX, note: "the time zone overwrites websites that have one",
    from: "  return sites.filter((s) => !(s.timezone || \"\").trim()).map((s) => s.site_id);", to: "  return sites.map((s) => s.site_id);" },
  { id: "F21", file: CARD, test: FIX, note: "the card saves to every website again",
    from: "      for (const id of tzTargets) {", to: "      for (const id of sites.map((x) => x.site_id)) {" },
  { id: "F22", file: LIB, test: FIX, note: "the time-zone line stays after it is answered",
    from: "  const shown = tzAnswered ? warnings.filter((w) => !isTimezoneWarning(w)) : warnings;", to: "  const shown = warnings;" },
  { id: "F23", file: LIB, test: FIX, note: "Email visitors shown beside refused workflows",
    from: "    if (p.allowed !== true) continue;\n", to: "" },
  { id: "F24", file: SOURCES, test: FIX, note: "Email visitors shown on every website row",
    from: "{emailsApply && (() => {", to: "{(() => {" },
  { id: "F25", file: LIB, test: FIX, note: "Your own tools offered with no yes from the server",
    from: "  return !!playbooks && playbooks.some((p) => p.allowed === true);", to: "  return true;" },
  { id: "F26", file: SOURCES, test: FIX, note: "the reviewer's mutation: `{chatActions && (`",
    from: "{chatActions && toolsOffered(playbooks, playbooksAllowed) && (", to: "{chatActions && (" },
  { id: "F27", file: CARD, test: FIX, note: "an older rotate answer is shown (dead secret)",
    from: "      if (seq !== rotateSeq.current[a.action_id]) return;\n", to: "" },
  { id: "F28", file: CARD, test: FIX, note: "Replace the secret clickable mid-request",
    from: "                    disabled={busy.has(`rotate:${a.action_id}`)}\n", to: "" },
  { id: "F29", file: CARD, test: FIX, note: "one shared busy for every path switch",
    from: "    const key = `path:${p.key}`;\n    if (!busy.start(key)) return;", to: "    const key = \"path\";\n    if (!busy.start(key)) return;" },
  { id: "F30", file: CARD, test: FIX, note: "the card's confirmation is not shown beside the click",
    from: "      <Said words={said} />\n\n      <label className=\"mt-3 block text-xs\">", to: "\n      <label className=\"mt-3 block text-xs\">" },
];

const only = process.argv[2] || "";
const results = [];
for (const m of M.filter((x) => x.id.startsWith(only))) {
  if (m.restoreOld) {
    const rel = "src/pages/argus/ArgusWorkflowAutomationsPage.tsx";
    const p = f(rel);
    let r;
    try {
      // the commit that deleted it, then its parent: works on any later tree
      const gone = execFileSync("git", ["log", "--diff-filter=D", "-1", "--format=%H", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim();
      if (!gone) { results.push({ id: m.id, red: null, fails: ["DELETING COMMIT NOT FOUND"] }); continue; }
      const body = execFileSync("git", ["show", `${gone}^:${rel}`], { cwd: ROOT, encoding: "utf8" });
      writeFileSync(p, body);
      r = runTest(m.test);
    } finally {
      if (existsSync(p)) unlinkSync(p);
    }
    results.push({ id: m.id, red: r.fails.length > 0, fails: r.fails });
    continue;
  }
  const p = f(m.file);
  const orig = readFileSync(p, "utf8");
  if (!orig.includes(m.from)) { results.push({ id: m.id, red: null, fails: ["MUTATION TEXT NOT FOUND"] }); continue; }
  writeFileSync(p, orig.replace(m.from, m.to));
  let r;
  try { r = runTest(m.test); } finally { writeFileSync(p, orig); }
  results.push({ id: m.id, red: r.fails.length > 0, fails: r.fails });
}
let green = 0;
for (const r of results) { if (!r.red) green += 1; }
for (const r of results) console.log(`${r.id}\t${r.red ? "RED" : r.red === null ? "NOT APPLIED" : "GREEN (guard not caught!)"}\t${r.fails.join(" | ")}`);
console.log("old page present after run:", existsSync(f("src/pages/argus/ArgusWorkflowAutomationsPage.tsx")));
process.exitCode = green ? 1 : 0;
