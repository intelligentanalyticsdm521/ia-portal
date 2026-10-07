// scripts/dev/chat-workflows-mutation-check.mjs — the Portal's chat-workflow
// guards, each removed in turn: edit → run the test file that pins it →
// restore. Every line must print RED; a GREEN line is a guard no test watches.
//
//   node scripts/dev/chat-workflows-mutation-check.mjs
//
// Contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §G.4 (P1–P4 plus the
// card's own guards). Files are restored byte for byte in a finally, and the
// deleted old page is removed again after P4.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (rel) => path.join(ROOT, rel);

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
];

const results = [];
for (const m of M) {
  if (m.restoreOld) {
    const p = f("src/pages/argus/ArgusWorkflowAutomationsPage.tsx");
    const body = execFileSync("git", ["show", "HEAD:src/pages/argus/ArgusWorkflowAutomationsPage.tsx"], { cwd: ROOT, encoding: "utf8" });
    writeFileSync(p, body);
    const r = runTest(m.test);
    unlinkSync(p);
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
