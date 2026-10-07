// Chat workflows — SPARK → Leads → Lead sources → Website chat (contract
// CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.1, §G.3).
//
// Two kinds of test, as everywhere in this suite:
//   • the PURE module (src/lib/chatWorkflows.ts) is imported and driven: the
//     tree an owner reads is built from a real definition fixture, the
//     switches, the drafts, the refusal sentences;
//   • the screens are source-pinned: which route a control calls, that the
//     secret is shown once and cleared, that a refused business sees one
//     sentence and no switch, that the visitor-emails switch defaults ON.
//
// MUTATIONS RUN (edit → npm test → restore); re-run them all with
//   node scripts/dev/chat-workflows-mutation-check.mjs   (every line must say RED)
//   P3  ChatWorkflowCard: drop `setSecret(null)` from the secret modal's
//       onClose                                → "the secret ... clears on close" RED
//   C1  lib: `switches[key] !== false` → `true` (ignore the owner's switch)
//                                              → "a switched-off path reads off" RED
//   C2  SparkLeadSourcesPage: `!== false` → `=== true` on visitor emails
//       (default OFF)                          → "defaults ON" RED
//   C3  ChatWorkflowCard: render the Live switch above the not-allowed return
//                                              → "a refused business" RED
//   C4  lib: drop the ancestor `seen` check     → "a loop in a definition" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments, screenWords } from "./helpers/screenWords.mjs";

import {
  buildDisplayTree, workflowsUsingTool, refusalSentences, statusOf, sureWords,
  heldSentence, modeLine, relativeTime, isTimezoneWarning, warningWords, fillTokens,
  CHAT_WF, NEEDS_YOU_ROUTE, SECRET_SENTENCE,
} from "../src/lib/chatWorkflows.ts";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const DEF = JSON.parse(read("test/fixtures/chat-workflow-definition.json"));

const card = read("src/components/spark/ChatWorkflowCard.tsx");
const treeTsx = read("src/components/spark/ChatWorkflowTree.tsx");
const lib = read("src/lib/chatWorkflows.ts");
const sources = read("src/pages/spark/SparkLeadSourcesPage.tsx");

const FACTS = { business: "Summit Lawn & Landscape", owner: "Avery" };

function flat(steps, out = []) {
  for (const s of steps) {
    out.push(s);
    if (s.kind === "buttons") for (const g of s.groups) flat(g.children, out);
  }
  return out;
}
const lines = (steps) => flat(steps).map((s) => s.text || s.label || "").filter(Boolean);

describe("the read-only tree is built from the workflow's own definition", () => {
  const tree = buildDisplayTree(DEF, FACTS);

  test("every service is listed with its own paths, and the shared paths apart", () => {
    assert.deepEqual(tree.services.map((s) => s.label), ["Web Design", "Digital Marketing"]);
    assert.deepEqual(tree.services[0].paths.map((p) => p.label), ["Has a website: free audit", "No website yet"]);
    assert.deepEqual(tree.shared.map((p) => p.label), ["Call a rep now", "Get a custom quote"]);
  });

  test("the question before the paths is shown once, its answers pointing at the paths", () => {
    const intro = tree.services[0].intro;
    assert.equal(intro[0].kind, "buttons");
    assert.equal(intro[0].text, "Do you have a website today?");
    const yes = intro[0].groups.find((g) => g.labels.includes("Yes"));
    assert.deepEqual(yes.children, [{ kind: "goto", label: "Has a website: free audit" }]);
  });

  test("a path reads as steps an owner understands, in order", () => {
    const audit = tree.services[0].paths[0];
    const words = lines(audit.steps);
    for (const w of [
      "Asks their name",
      "Asks their business name (they can skip it)",
      "Asks their email",
      "Saves them as a lead",
      "Runs your tool: Website audit",
      "Adds them to your follow-up: Audit follow-up",
    ]) assert.ok(words.includes(w), `missing "${w}" in ${JSON.stringify(words)}`);
    assert.ok(words.indexOf("Asks their email") < words.indexOf("Saves them as a lead"));
    // "Not now" leads to the two shared paths, shown as chips, not copied in.
    const gotos = flat(audit.steps).filter((s) => s.kind === "goto").map((s) => s.label);
    assert.ok(gotos.includes("Call a rep now") && gotos.includes("Get a custom quote"));
  });

  test("sentences carry the business's name, not braces", () => {
    const noSite = tree.services[0].paths[1];
    assert.equal(noSite.steps[0].text, "Summit Lawn & Landscape specializes in custom website design.");
    assert.equal(fillTokens("Thanks, {name} — {owner} will call {phone}.", FACTS),
      "Thanks, [their name] — Avery will call [their number].");
    assert.equal(fillTokens("{owner} will reply", { business: "Fernbrook" }), "Fernbrook will reply");
  });

  test("a link button is marked as one", () => {
    const groups = tree.services[0].paths[1].steps[0].groups;
    const link = groups.find((g) => g.link);
    assert.deepEqual(link.labels, ["Build one in minutes"]);
  });

  test("answers that lead to the same place share one line", () => {
    const dm = tree.services[1].paths[0].steps[0];
    assert.equal(dm.groups.length, 1);
    assert.deepEqual(dm.groups[0].labels, ["Calls and leads", "Reviews and reputation", "Social and content"]);
  });

  test("the shared paths say what they do", () => {
    const call = lines(tree.shared[0].steps);
    assert.ok(call.includes("Shows your phone number"));
    assert.ok(call.includes("Tells you: Chat visitor calling now: [their name]"));
    const quote = lines(tree.shared[1].steps);
    assert.ok(quote.includes("Emails them: Avery will reply within one business day."));
    assert.ok(quote.includes("Good question — Avery will answer that."));
  });

  test("a switched-off path reads off; every other path reads on", () => {
    const byKey = Object.fromEntries([...tree.services.flatMap((s) => s.paths), ...tree.shared].map((p) => [p.key, p.enabled]));
    assert.equal(byKey["web_design.no_site"], false);
    assert.equal(byKey["web_design.audit"], true);
    assert.equal(byKey["shared.call"], true);
  });

  test("the switches are read whether they arrive as an object, a string, or on the path", () => {
    const asString = buildDisplayTree({ ...DEF, path_switches: undefined, path_switches_json: '{"shared.call":false}' });
    assert.equal(asString.shared[0].enabled, false);
    const onPath = buildDisplayTree({ ...DEF, path_switches: { "shared.quote": true },
      paths: DEF.paths.map((p) => (p.key === "shared.quote" ? { ...p, enabled: false } : p)) });
    assert.equal(onPath.shared.find((p) => p.key === "shared.quote").enabled, false, "the path's own flag wins");
  });

  test("drafts are listed apart and never as live paths", () => {
    assert.deepEqual(tree.drafts, [{ key: "draft.17", label: "do you sell tractors?" }]);
    assert.ok(!tree.shared.some((p) => p.key === "draft.17"));
    const extra = buildDisplayTree({ ...DEF, drafts: [{ key: "draft.18", label: "Do you mow on Sundays?" }] });
    assert.equal(extra.drafts.length, 2);
  });

  test("the tools a workflow runs are known, so Remove can name the workflows", () => {
    assert.deepEqual(tree.toolsUsed, ["Website audit"]);
    const rows = [{ name: "Website chat", tree: DEF }, { name: "Other chat", tree: { nodes: {} } }];
    assert.deepEqual(workflowsUsingTool(rows, "Website audit"), ["Website chat"]);
    assert.deepEqual(workflowsUsingTool(rows, "Something else"), []);
  });

  test("a loop in a definition ends instead of hanging the page", () => {
    const loop = {
      services: [{ key: "a", label: "A", start: "n1" }],
      paths: [{ key: "a.main", service: "a", label: "Main", entry: "n1" }],
      nodes: {
        n1: { type: "say", say: "one", next: "n2" },
        n2: { type: "say", say: "two", next: "n1" },
      },
    };
    const t = buildDisplayTree(loop);
    assert.deepEqual(lines(t.services[0].paths[0].steps), ["one", "two"]);
  });

  test("anything that is not a tree is an empty tree, never a crash", () => {
    for (const v of [null, undefined, "x", 3, [], { services: "no" }]) {
      const t = buildDisplayTree(v);
      assert.deepEqual([t.services.length, t.shared.length, t.drafts.length], [0, 0, 0]);
    }
  });

  test("an already-walked tree is read as it comes", () => {
    const t = buildDisplayTree({
      services: [{ key: "s", label: "S", paths: [{ key: "s.p", label: "P", enabled: false, steps: [{ kind: "do", text: "Saves them as a lead" }, { kind: "bogus" }] }] }],
    });
    assert.equal(t.services[0].paths[0].enabled, false);
    assert.deepEqual(t.services[0].paths[0].steps, [{ kind: "do", text: "Saves them as a lead" }]);
  });
});

describe("the tree LUMEN walks (definition.tree) reads the same way", () => {
  const WALKED = JSON.parse(read("test/fixtures/chat-workflow-tree-walked.json"));
  const tree = buildDisplayTree(WALKED, FACTS);

  test("six services, their paths, the shared paths, the owner's switch", () => {
    assert.equal(tree.services.length, 6);
    assert.deepEqual(tree.services[0].paths.map((p) => [p.label, p.enabled]),
      [["Has a website: free audit", true], ["No website yet", false]]);
    assert.deepEqual(tree.shared.map((p) => p.label), ["Call a rep now", "Get a custom quote"]);
  });

  test("the server's words are shown with the business's name filled in, prefixes not doubled", () => {
    const noSite = tree.services[0].paths[1].steps[0];
    assert.equal(noSite.kind, "buttons");
    assert.equal(noSite.text, "Summit Lawn & Landscape specializes in custom website design.");
    const audit = lines(tree.services[0].paths[0].steps);
    assert.ok(audit.includes("Runs your tool: Website audit"));
    assert.ok(audit.includes("Saves them as a lead"));
    assert.ok(!audit.some((l) => /^ARGUS (says|asks):/.test(l)), "the renderer adds 'ARGUS says:' once");
  });

  test("a button into another path is a chip, answers to the same place share a line", () => {
    const notNow = tree.services[0].paths[0].steps[0].groups.find((g) => g.labels.includes("Not now"));
    const chips = flat(notNow.children).filter((s) => s.kind === "goto").map((s) => s.label);
    assert.deepEqual(chips, ["Call a rep now", "Get a custom quote"]);
    const dm = tree.services[1].paths[0].steps[0];
    assert.deepEqual(dm.groups[0].labels, ["Calls and leads", "Reviews and reputation", "Social and content"]);
  });

  test("the tool is known by name, and the hidden link buttons are said", () => {
    assert.deepEqual(tree.toolsUsed, ["Website audit"]);
    assert.ok(tree.notes.some((n) => /is hidden because no web address is set for it\./.test(n)));
    assert.ok(card.includes("...tree.notes"), "the card shows the tree's notes with the warnings");
  });
});

describe("sentences the screens share", () => {
  test("a refused publish shows the server's own sentences", () => {
    const e = new Error('SPARK API 400: {"error":"invalid","errors":["Chat sentences can\'t carry a price.","Add your tool first."]}');
    assert.deepEqual(refusalSentences(e), ["Chat sentences can't carry a price.", "Add your tool first."]);
    assert.deepEqual(refusalSentences(new Error('SPARK API 503: {"message":"We can\'t store tools safely right now."}')),
      ["We can't store tools safely right now."]);
    assert.match(refusalSentences(new Error("SPARK API 502: <html>")).join(""), /didn't work .*502.*try again/);
    assert.equal(statusOf(new Error("SPARK API 403: {}")), 403);
    assert.equal(statusOf(new Error("network")), null);
  });

  test("sure words, the held sentence and the mode line", () => {
    assert.equal(sureWords("fairly sure"), "fairly sure");
    assert.equal(sureWords("0.82"), null, "a number is never shown");
    assert.equal(heldSentence({ visitor_name: "Sam Test", action_label: "Website audit" }),
      "Sam Test asked for Website audit. It's waiting for you.");
    assert.equal(heldSentence({ visitor_name: null, action_label: "the report" }),
      "A visitor asked for the report. It's waiting for you.");
    assert.equal(modeLine("automatic"), "Runs automatically");
    assert.equal(modeLine("review"), "Waits for you before it sends anything");
    assert.equal(modeLine(undefined), "Waits for you before it sends anything", "no mode reads as the careful one");
  });

  test("a time is only ever the server's time", () => {
    assert.equal(relativeTime(null), null);
    assert.equal(relativeTime("not a date"), null);
    const now = Date.parse("2026-10-07T22:00:00Z");
    assert.equal(relativeTime("2026-10-07T21:55:00Z", now), "5 min ago");
  });

  test("the time-zone warning is recognised by its code or its words", () => {
    assert.equal(isTimezoneWarning({ code: "timezone_unknown", words: "x" }), true);
    assert.equal(isTimezoneWarning("Pick your time zone so ARGUS knows when you're open."), true);
    assert.equal(isTimezoneWarning("The builder button is hidden."), false);
    assert.equal(warningWords({ words: "A" }), "A");
  });

  test("the routes are the ones LUMEN serves", () => {
    assert.equal(CHAT_WF.path("p1", "web_design.no_site"), "/api/v1/chat/playbooks/p1/paths/web_design.no_site");
    assert.equal(CHAT_WF.playbooks, "/api/v1/chat/playbooks");
    assert.equal(CHAT_WF.actions, "/api/v1/chat/actions");
    assert.equal(CHAT_WF.rotate("a1"), "/api/v1/chat/actions/a1/rotate-secret");
    assert.equal(CHAT_WF.test("a1"), "/api/v1/chat/actions/a1/test");
    assert.equal(CHAT_WF.site("s1"), "/api/v1/chat/sites/s1");
    assert.equal(NEEDS_YOU_ROUTE, "/app/services/argus_workflows?tab=needs-you");
  });
});

describe("the workflow card on Lead sources", () => {
  test("Lead sources loads the workflows and the tools in its one pass, each failing on its own", () => {
    const all = sources.slice(sources.indexOf("await Promise.all(["), sources.indexOf("]);", sources.indexOf("await Promise.all([")));
    assert.match(all, /get<\{ data: ChatPlaybookRow\[\] \}>\(CHAT_WF\.playbooks\)\.catch\(\(\) => null\)/);
    assert.match(all, /get<\{ data: ChatActionRow\[\] \}>\(CHAT_WF\.actions\)\.catch\(\(\) => null\)/);
    assert.match(sources, /<ChatWorkflowCard\b/);
    assert.match(sources, /<ChatOwnTools\b/);
  });

  test("the card renders the tree in words", () => {
    assert.match(card, /<ChatWorkflowSteps steps=\{p\.steps\} \/>/);
    assert.match(treeTsx, /ARGUS says: &ldquo;\{s\.text\}&rdquo;/);
    for (const w of ["Saves them as a lead", "Runs your tool: ", "Tells you: ", "Shows your phone number", "Asks their email"]) {
      assert.ok(lib.includes(w), `the step words must include "${w}"`);
    }
    assert.match(card, /Chat workflow · \{playbook\.name\}/);
    assert.match(card, /\{live \? "Live" : "Off"\}/);
    assert.match(card, /Live on \$\{where\}/);
    assert.match(card, /playbook\.site_label \|\| "all your websites"/);
    assert.match(card, /Change in ARGUS → Workflows/);
    assert.match(card, /The name visitors see when someone will reply/);
    assert.match(card, /Draft — not shown to visitors: &lsquo;\{d\.label\}&rsquo;/);
  });

  test("the path switch PUTs that path, the Live switch PUTs the status, the name saves on blur", () => {
    assert.match(card, /put\(CHAT_WF\.path\(playbook\.playbook_id, p\.key\), \{ enabled \}\)/);
    assert.match(card, /put\(CHAT_WF\.playbook\(playbook\.playbook_id\), \{ status: on \? "live" : "off" \}\)/);
    assert.match(card, /onBlur=\{\(\) => void saveOwner\(\)\}/);
    assert.match(card, /\{ owner_display: value \|\| null \}/);
    // A refused publish shows the server's sentences, inline.
    assert.match(card, /setRefusal\(refusalSentences\(err\)\)/);
    assert.match(card, /<Sentences lines=\{refusal\} \/>/);
  });

  test("Needs you shows only when something needs the owner, and links to it", () => {
    assert.match(card, /\{playbook\.needs_you_count > 0 && \(\s*<Link to=\{NEEDS_YOU_ROUTE\}/);
  });

  test("a refused business sees the one sentence and no switch", () => {
    const start = card.indexOf("if (!playbook.allowed) {");
    assert.ok(start > 0, "the card must decide 'not allowed' before anything else renders");
    const end = card.indexOf("\n  }\n", start);
    const block = card.slice(start, end);
    assert.match(block, /playbook\.allowed_words/);
    assert.equal(/<Switch|<input|<select|<button/.test(block), false, "no control beside the 'not allowed' sentence");
    // and nothing interactive is rendered before that return
    const before = card.slice(card.indexOf("export function ChatWorkflowCard"), start);
    assert.equal(/return \(/.test(before.replace(/function renderPath[\s\S]*?\n  }\n/, "")), false);
  });

  test("the time-zone picker sits where the warning is and saves through the site", () => {
    assert.match(card, /tzWarning && siteIds\.length > 0 &&/);
    assert.match(card, /put\(CHAT_WF\.site\(id\), \{ timezone: tz \}\)/);
  });

  test("the visitor-emails switch is on every website row and defaults ON", () => {
    assert.match(sources, /Email visitors what they asked for/);
    assert.match(sources, /const emailsOn = site\.visitor_emails_enabled !== false;/);
    assert.match(sources, /put\(CHAT_WF\.site\(site\.site_id\), \{ visitor_emails_enabled: on \}\)/);
    assert.match(sources, /"Visitors get an email with what they asked for\."/);
    assert.match(sources, /"Visitors won't get emails from the chat on this website\."/);
  });
});

describe("Your own tools", () => {
  test("add, test, replace, remove — each calls its own route", () => {
    assert.match(card, /post<\{ data: ChatActionRow; secret: string \}>\(CHAT_WF\.actions, \{/);
    assert.match(card, /post<\{ ok: boolean; ms: number; plain: string \}>\(CHAT_WF\.test\(a\.action_id\), \{\}\)/);
    assert.match(card, /post<\{ data: ChatActionRow; secret: string \}>\(CHAT_WF\.rotate\(a\.action_id\), \{\}\)/);
    assert.match(card, /patch\(CHAT_WF\.action\(a\.action_id\), \{ status: "off" \}\)/);
    for (const w of ["+ Add a tool", "Test this tool", "Replace the secret", "Remove", "Email the result to the visitor", "Keep the file on the lead", "Send them:", "Web address"]) {
      assert.ok(card.includes(w), `the tools section must say "${w}"`);
    }
    // the visitor and the lead both get the result unless the owner says no
    assert.match(card, /email_visitor: true, attach_to_lead: true,/);
  });

  test("Remove asks first, naming the workflows that run the tool", () => {
    assert.match(card, /const using = workflowsUsingTool\(playbooks, a\.name/);
    assert.match(card, /confirmLabel: "Yes, remove it"/);
    assert.match(card, /onClick=\{\(\) => askRemove\(a\)\}/);
    assert.match(card, /onClick=\{\(\) => askRotate\(a\)\}/);
  });

  test("the secret is shown once and clears on close (P3)", () => {
    assert.match(card, /title="Your tool's secret"/);
    assert.ok(card.includes("{SECRET_SENTENCE}"));
    assert.equal(SECRET_SENTENCE, "Paste this into your tool's settings. It's shown once — if you lose it, replace it.");
    // Only the create and rotate answers ever put a secret in state…
    const sets = [...card.matchAll(/setSecret\(\{ name: [^,]+, value: ([^}]+) \}\)/g)].map((m) => m[1].trim());
    assert.deepEqual(sets, ["r.secret", "r.secret"]);
    // …and closing the modal, either way, takes it out again.
    assert.match(card, /onClose=\{\(\) => \{ setSecret\(null\); setCopied\(false\); \}\}/);
    assert.match(card, /<IadmButton variant="primary" onClick=\{\(\) => \{ setSecret\(null\); setCopied\(false\); \}\}>/);
    assert.equal(/localStorage|sessionStorage/.test(card), false, "a secret never goes in browser storage");
    // The list shows the start of the secret only.
    assert.match(card, /Secret starting \{a\.secret_prefix\}…/);
  });

  test("the card asks in the app's own dialog, never the browser's", () => {
    assert.equal(/(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/.test(stripComments(card)), false);
  });
});

describe("words on these screens (P1) and nothing hardcoded for any business (§0.2)", () => {
  const SCREENS = [
    "src/components/spark/ChatWorkflowCard.tsx",
    "src/components/spark/ChatWorkflowTree.tsx",
    "src/lib/chatWorkflows.ts",
  ];
  const BANNED = /\b(tenant|playbooks?|node|nodes|intent|confidence|HMAC|webhooks?|payload|JSON)\b|anthropic|claude|openai|gpt-|sonnet|haiku|opus/i;

  test("the words checklist reads real sentences (presence first)", () => {
    const words = SCREENS.flatMap((f) => screenWords(read(f)));
    assert.ok(words.some((w) => w.includes("Your own tools")), "the extractor must see the card's words");
    assert.ok(words.some((w) => w.includes("Saves them as a lead")));
    const hits = words.filter((w) => BANNED.test(w));
    assert.deepEqual(hits, [], "no jargon, no 'tenant', no vendor or model name on screen");
  });

  test("no business is named in the code (new files, and this build's lines in shared files)", () => {
    const NEW_FILES = [
      ...SCREENS,
      "src/pages/argus/ArgusWorkflowsPage.tsx",
      "src/components/argus/OnboardingObservePanel.tsx",
      "src/components/spark/LeadChatPanel.tsx",
      "src/components/spark/SparkLeadModal.tsx",
      "src/pages/spark/SparkLeadSourcesPage.tsx",
      "src/journeys/content/argusPages.ts",
    ];
    const BAD = /Intelligent Analytics|intelligentanalyticsdm|Web Design|Website audit|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const f of NEW_FILES) {
      assert.ok(existsSync(path.join(ROOT, f)), `${f} must exist`);
      const code = stripComments(read(f));
      const hit = code.split("\n").find((l) => BAD.test(l));
      assert.equal(hit, undefined, `${f} names a business or carries an id: ${hit}`);
    }
    // serviceCatalog.ts and SubNav.tsx are shared and carry older lines; this
    // build's lines in them are the argus_workflows rows.
    for (const f of ["src/config/serviceCatalog.ts", "src/components/SubNav.tsx"]) {
      const rows = read(f).split("\n").filter((l) => l.includes("argus_workflows"));
      assert.ok(rows.length > 0);
      for (const l of rows) assert.equal(BAD.test(l), false, `${f}: ${l}`);
    }
  });

  test("the guard itself catches a name (presence)", () => {
    const BAD = /Intelligent Analytics|intelligentanalyticsdm|Web Design|Website audit/i;
    assert.equal(BAD.test(stripComments('const x = "Web Design";')), true);
    assert.equal(BAD.test(stripComments("// Web Design in a comment\nconst y = 1;")), false);
  });
});
