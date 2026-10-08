// Chat workflows — the review fixes of 7 Oct 2026 (contract
// CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.1–F.3).
//
// The sentences an owner reads are built by pure helpers in
// src/lib/chatWorkflows.ts and checked here as the whole visible sentence,
// built from rows in LUMEN's own wording (test/fixtures/lumen-chat-words.json,
// produced by LUMEN's functions) — not from this repo's source text. Where a
// screen decision cannot be pulled into a helper, the source is pinned at the
// one line that makes the decision.
//
// Every guard here was removed in turn and this file went RED; re-run them all
// with  node scripts/dev/chat-workflows-mutation-check.mjs  (ids F1–F30; each line names what the mutation breaks).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/screenWords.mjs";

import {
  ADD_TO_CHAT_LABEL, ADD_TO_CHAT_WORDS, CODE_WORDS, NOT_DONE_WORDS,
  hiddenLinkLine, hiddenLinksOf, linkAddress, loadFailedWords,
  ADMIN_ONLY_WORDS, MORE_STEPS_WORDS, NOT_ALLOWED_WORDS, UNREACHABLE_WORDS,
  buildDisplayTree, cardWarningLines, errorCodeOf, historyCursor, historyLine, intentLine,
  isPackageRefusal, mergeHistory, openResultWords, refusalSentences, toolsOffered,
  visitorEmailSiteIds, workflowGate, workflowsTabFrom, workflowsUsingTool, zoneKnown, zoneTargets,
} from "../src/lib/chatWorkflows.ts";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const LUMEN = JSON.parse(read("test/fixtures/lumen-chat-words.json"));
const page = stripComments(read("src/pages/argus/ArgusWorkflowsPage.tsx"));
const card = stripComments(read("src/components/spark/ChatWorkflowCard.tsx"));
const sources = stripComments(read("src/pages/spark/SparkLeadSourcesPage.tsx"));
const panel = stripComments(read("src/components/spark/LeadChatPanel.tsx"));
const treeTsx = stripComments(read("src/components/spark/ChatWorkflowTree.tsx"));

const apiErr = (status, body) => new Error(`SPARK API ${status}: ${JSON.stringify(body)}`);

/** The body of `async function <name>(…) { … }` in a source file. */
function fnBody(src, name) {
  const at = src.indexOf(`async function ${name}(`);
  assert.ok(at >= 0, `${name} must exist`);
  let i = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  const start = i;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}
const catchOf = (body) => body.slice(body.indexOf("catch (err)"), body.indexOf("finally"));

describe("ARGUS → Workflows: the package gate on each row", () => {
  test("only an explicit allowed:true gets the mode and the switch", () => {
    assert.deepEqual(workflowGate({ allowed: true, allowed_words: null }), { controls: true, words: null });
    const refused = workflowGate({ allowed: false, allowed_words: "Chat workflows with buttons come with the SPARK Leads Growth package." });
    assert.equal(refused.controls, false);
    assert.equal(refused.words, "Chat workflows with buttons come with the SPARK Leads Growth package.");
    // A row that says nothing about the package is refused, not opened (fail closed).
    assert.deepEqual(workflowGate({}), { controls: false, words: NOT_ALLOWED_WORDS });
    assert.deepEqual(workflowGate({ allowed: undefined, allowed_words: "  " }), { controls: false, words: NOT_ALLOWED_WORDS });
  });

  test("the row renders the select and the switch only on the allowed side of the gate", () => {
    assert.match(page, /const gate = workflowGate\(w\);/);
    const gateAt = page.indexOf("{!gate.controls ? (");
    assert.ok(gateAt > 0, "the row decides on the gate");
    const refusedSide = page.slice(gateAt, page.indexOf(") : (", gateAt));
    assert.match(refusedSide, /\{gate\.words\}/);
    assert.equal(/<select|<input|<button/.test(refusedSide), false, "no control beside the package sentence");
    const selectAt = page.indexOf("<select");
    const switchAt = page.indexOf('role="switch"');
    assert.ok(selectAt > gateAt && switchAt > gateAt, "the mode select and the On switch sit behind the gate");
    assert.equal((page.match(/<select/g) || []).length, 1);
  });

  test("the type carries the gate the server sends", () => {
    const lib = read("src/lib/chatWorkflows.ts");
    const row = lib.slice(lib.indexOf("export interface ArgusWorkflowRow"), lib.indexOf("export interface NeedsYouHeld"));
    assert.match(row, /allowed\?: boolean;/);
    assert.match(row, /allowed_words\?: string \| null;/);
  });
});

describe("ARGUS → Workflows: a refusal is never shown as a success", () => {
  test("the mode and On catches put the server's sentences on the row, never in the green notice", () => {
    for (const fn of ["setMode", "setEnabled"]) {
      const c = catchOf(fnBody(page, fn));
      assert.match(c, /setRowError\(\(e\) => \(\{ \.\.\.e, \[w\.workflow_id\]: refusalSentences\(err\) \}\)\)/, `${fn} keeps its refusal on its row`);
      assert.equal(/setNotice\(/.test(c), false, `${fn} must not put a refusal in the success notice`);
    }
    // No catch anywhere on the page feeds the green notice.
    for (const m of page.matchAll(/catch \(err\) \{([\s\S]*?)\n\s*\}/g)) {
      assert.equal(/setNotice\(/.test(m[1]), false, `a catch feeds the success notice: ${m[1].trim().slice(0, 80)}`);
    }
    assert.equal(/\.catch\(\(err\) => setNotice/.test(page), false);
  });

  test("the row's refusal is rose, with role=alert", () => {
    assert.match(page, /<Refusal lines=\{rowError\[w\.workflow_id\]\} \/>/);
    const refusal = page.slice(page.indexOf("function Refusal("), page.indexOf("export function ArgusWorkflowsPage"));
    assert.match(refusal, /bg-rose-50/);
    assert.match(refusal, /role="alert"/);
  });

  test("the page's 'comes with SPARK' sentence is for the package refusal only", () => {
    assert.equal(isPackageRefusal(apiErr(403, { error: "not_allowed", message: "x" })), true);
    assert.equal(isPackageRefusal(apiErr(403, { error: "forbidden", message: "Requires one of: admin. Your role: member." })), false);
    assert.equal(isPackageRefusal(apiErr(403, { error: "missing_header" })), false);
    assert.equal(isPackageRefusal(new Error("Failed to fetch")), false);
    assert.equal(errorCodeOf(apiErr(400, { error: "bad_mode" })), "bad_mode");
    assert.match(page, /if \(isPackageRefusal\(err\)\) setNoSpark\(true\);/);
  });
});

describe("words an owner reads, built from LUMEN's own wording", () => {
  test("History says each step's name once", () => {
    assert.deepEqual(LUMEN.history.map(historyLine), [
      "Website audit — finished, score 62",
      "Email to the visitor — not sent: visitor emails are off",
      "Saved as a lead — done",
      "Website audit — didn't finish: the tool did not answer",
    ]);
    // and if LUMEN ever sends the bare words, the name is added once
    assert.equal(historyLine({ action_label: "Website audit", status_words: "finished, score 62" }), "Website audit — finished, score 62");
    assert.match(page, /\{historyLine\(h\)\}/);
    assert.equal(/\{h\.action_label\} — \{h\.status_words\}/.test(page), false);
  });

  test("'Looks like' is said once, and 'Not sure' never says it is sure", () => {
    const W = LUMEN.intent_words;
    assert.equal(intentLine(W.complaint, "sure"), "Looks like a complaint (sure)");
    assert.equal(intentLine(W.quote_request, "fairly sure"), "Looks like a request for a quote (fairly sure)");
    assert.equal(intentLine(W.other, "sure"), "Not sure what they want");
    assert.equal(intentLine(W.other, "not sure"), "Not sure what they want");
    for (const words of Object.values(W)) {
      for (const sure of [...LUMEN.sure_words, null]) {
        const line = intentLine(words, sure);
        assert.equal((line.match(/looks like/gi) || []).length <= 1, true, line);
        assert.equal(/not sure what they want \((sure|fairly sure|not sure)\)/i.test(line), false, line);
      }
    }
    assert.equal(intentLine("a booking", "sure"), "Looks like: a booking (sure)");
    assert.equal(intentLine(null, "sure"), null);
    assert.equal(intentLine(W.booking, "0.91"), "Looks like they want to book a time", "a number is never shown");
    // both screens use the one helper
    assert.match(page, /const looks = intentLine\(item\.intent_words, item\.sure\);/);
    assert.match(panel, /const looks = intentLine\(w\.intent_words, w\.sure\);/);
    assert.equal(/Looks like: \{/.test(page) || /Looks like: \{/.test(panel), false);
  });

  test("the file link is named for what the tool sends back", () => {
    assert.equal(openResultWords("quote"), "Open the quote");
    assert.equal(openResultWords(" estimate "), "Open the estimate");
    assert.equal(openResultWords(null), "Open the report", "LUMEN's own default name");
    assert.equal(openResultWords(""), "Open the report");
    assert.match(page, /\{openResultWords\(h\.result_label\)\}/);
    assert.match(panel, /\{openResultWords\(r\.result_label\)\}/);
    // the add-tool form asks, and sends the owner's word
    assert.match(card, /What your tool sends back \(a report, a quote…\)/);
    assert.match(card, /result_label: form\.result_label\.trim\(\) \|\| "report",/);
    assert.equal(/result_label: "report" \}/.test(card), false, "the form no longer hardcodes the word");
  });

  test("a fault that is not the server's answer reads as a plain sentence", () => {
    const warn = console.warn;
    const logged = [];
    console.warn = (...a) => logged.push(a.join(" "));
    try {
      assert.deepEqual(refusalSentences(new TypeError("Cannot read properties of undefined (reading 'name')")), [UNREACHABLE_WORDS]);
      assert.deepEqual(refusalSentences(new Error("Failed to fetch")), [UNREACHABLE_WORDS]);
      assert.deepEqual(refusalSentences(undefined), [UNREACHABLE_WORDS]);
    } finally { console.warn = warn; }
    assert.ok(logged.some((l) => l.includes("Failed to fetch")), "the raw message goes to the console");
    assert.equal(UNREACHABLE_WORDS, "We couldn't reach the server. Check your connection and try again.");
    // the server's own sentences still come through
    assert.deepEqual(refusalSentences(apiErr(409, { error: "another_live", message: "Another chat workflow is already live on this website. Switch that one off first." })),
      ["Another chat workflow is already live on this website. Switch that one off first."]);
  });

  test("a write by someone who is not an admin says who can", () => {
    assert.deepEqual(refusalSentences(apiErr(403, { error: "forbidden", message: "Requires one of: admin. Your role: member." })), [ADMIN_ONLY_WORDS]);
    assert.equal(ADMIN_ONLY_WORDS, "Only an admin on your account can change this. Ask one of them, or sign in as one.");
  });
});

describe("ARGUS → Workflows: tabs, retries, paging", () => {
  test("?tab=setup is the founder's; anyone else lands on All, never a blank page", () => {
    assert.equal(workflowsTabFrom("setup", false), "all");
    assert.equal(workflowsTabFrom("setup", true), "setup");
    assert.equal(workflowsTabFrom("needs-you", false), "needs-you");
    assert.equal(workflowsTabFrom("history", false), "history");
    assert.equal(workflowsTabFrom("nonsense", true), "all");
    assert.equal(workflowsTabFrom(null, true), "all");
    assert.match(page, /const tab = workflowsTabFrom\(params\.get\("tab"\), isFounder\);/);
  });

  test("a failed History load can be asked again, and the step error clears on a retry", () => {
    const body = fnBody(page.replace("const loadHistory = useCallback(async (", "async function loadHistory("), "loadHistory");
    assert.match(catchOf(body), /if \(!older\) historyAsked\.current = false;/);
    assert.match(page, />\s*Try again\s*</);
    const open = fnBody(page, "openRow");
    assert.ok(open.indexOf("setTreeError(null);") > 0 && open.indexOf("setTreeError(null);") < open.indexOf("await get"),
      "the old step error is cleared before the retry");
  });

  test("Show older never skips a run that shares the boundary's millisecond, and never repeats one", () => {
    const rows = LUMEN.history;
    assert.equal(historyCursor(rows), "2026-10-07T20:57:00.001Z", "one millisecond past the last row");
    assert.equal(historyCursor(rows, "cursor-from-server"), "cursor-from-server");
    assert.equal(historyCursor([]), null);
    // the server returns the boundary row again (<= at ms precision): it is shown once
    const again = [rows[3], { ...rows[3], run_id: "r5" }];
    const m = mergeHistory(rows, again);
    assert.deepEqual(m.rows.map((r) => r.run_id), ["r1", "r2", "r3", "r4", "r5"]);
    assert.equal(m.added, 1);
    assert.equal(mergeHistory(rows, rows).added, 0);
    assert.match(page, /setHistoryMore\(rows\.length >= 50 && merged\.added > 0\);/);
  });
});

describe("the read-only tree", () => {
  test("a long path never leaves the next one empty; a cut path says so", () => {
    // 6 services, each a buttons node with 8 answers that meet on a 12-node
    // tail: 126 nodes, under LUMEN's 200.
    const nodes = {}; const services = []; const paths = [];
    for (let s = 0; s < 6; s += 1) {
      const tail = Array.from({ length: 12 }, (_, i) => `s${s}.t${i}`);
      tail.forEach((id, i) => { nodes[id] = { type: "say", say: `Line ${i}`, next: tail[i + 1] || null }; });
      const answers = Array.from({ length: 8 }, (_, i) => `s${s}.a${i}`);
      answers.forEach((id) => { nodes[id] = { type: "say", say: "Thanks", next: tail[0] }; });
      nodes[`s${s}.q`] = { type: "buttons", say: "Which?", buttons: answers.map((id, i) => ({ label: `A${i}`, goto: id })) };
      services.push({ key: `svc${s}`, label: `Service ${s}`, start: `s${s}.q` });
      paths.push({ key: `svc${s}.main`, label: `Path ${s}`, service: `svc${s}`, entry: `s${s}.q` });
    }
    assert.equal(Object.keys(nodes).length, 126);
    const tree = buildDisplayTree({ schema: "chat-playbook/1", nodes, services, paths }, {});
    const counts = tree.services.map((s) => {
      const flat = (steps) => steps.flatMap((x) => [x, ...(x.kind === "buttons" ? x.groups.flatMap((g) => flat(g.children)) : [])]);
      return flat(s.paths[0].steps).length;
    });
    assert.deepEqual(counts, [105, 105, 105, 105, 105, 105], "every path is shown in full");

    // one path longer than the count: the owner reads that it was cut
    const long = {};
    for (let i = 0; i < 450; i += 1) long[`n${i}`] = { type: "say", say: `Step ${i}`, next: i < 449 ? `n${i + 1}` : null };
    const t2 = buildDisplayTree({ nodes: long, services: [{ key: "x", label: "X", start: "n0" }], paths: [{ key: "x.p", label: "P", service: "x", entry: "n0" }] }, {});
    const steps = t2.services[0].paths[0].steps;
    assert.deepEqual(steps[steps.length - 1], { kind: "more", text: MORE_STEPS_WORDS });
    assert.equal(MORE_STEPS_WORDS, "More steps than we can show here.");
    assert.match(treeTsx, /case "more":/);
  });

  test("an answer into a switched-off path reads off", () => {
    const walked = {
      services: [{ key: "a", label: "A", paths: [{ key: "a.p", label: "P", on: true, steps: [
        { kind: "buttons", words: "ARGUS asks: Next?", buttons: [
          { label: "Call a rep now", goes_to: { key: "shared.call", label: "Call a rep now" }, on: true },
          { label: "Get a custom quote", goes_to: { key: "shared.quote", label: "Get a custom quote" }, on: false },
        ] },
      ] }] }],
      shared: [],
    };
    const b = buildDisplayTree(walked).services[0].paths[0].steps[0];
    assert.deepEqual(b.groups.map((g) => g.children[0]), [
      { kind: "goto", label: "Call a rep now", on: true },
      { kind: "goto", label: "Get a custom quote", on: false },
    ]);
    assert.match(treeTsx, /<Chip label=\{s\.label\} off=\{s\.on === false\} \/>/);
    assert.match(treeTsx, /\{off \? " \(off\)" : ""\}/);
  });
});

describe("Remove names every workflow that runs the tool, however it is cased", () => {
  test("names match trimmed and in any case, as LUMEN's validate does", () => {
    const pb = (name, action) => ({ name, tree: { nodes: { a: { type: "action", kind: "custom", params: { action_name: action } } }, services: [], paths: [{ key: "p", label: "P", service: "", entry: "a" }] } });
    const pbs = [pb("Website chat", "Website audit")];
    assert.deepEqual(workflowsUsingTool(pbs, "website audit"), ["Website chat"]);
    assert.deepEqual(workflowsUsingTool(pbs, " Website Audit "), ["Website chat"]);
    assert.deepEqual(workflowsUsingTool(pbs, "Quote tool"), []);
  });
});

describe("Lead sources: the switches mean what they say", () => {
  test("the time zone is saved only where none is set, and the question is answered once every website has one", () => {
    const sites = [{ site_id: "a", timezone: "America/Chicago" }, { site_id: "b", timezone: null }, { site_id: "c" }];
    assert.deepEqual(zoneTargets(sites), ["b", "c"], "a website with a zone keeps it");
    assert.equal(zoneKnown(sites), false);
    assert.equal(zoneKnown([{ site_id: "a", timezone: "America/Chicago" }]), true);
    assert.equal(zoneKnown([]), false, "no website, nothing answered");
    assert.match(card, /for \(const id of tzTargets\) \{/);
    assert.equal(/for \(const id of siteIds\)/.test(card), false, "never every site regardless");
  });

  test("once the zone is answered its amber line goes with the picker", () => {
    const tz = "Pick your time zone so the chat knows when you're closed.";
    const other = "The 'Build one' button is hidden because no web address is set for it.";
    assert.deepEqual(cardWarningLines([tz, other], [other], false), [tz, other]);
    assert.deepEqual(cardWarningLines([tz, other], [], true), [other]);
    assert.match(card, /const tzAnswered = !!tzSaved \|\| zoneKnown\(sites\);/);
    assert.match(card, /const amber = cardWarningLines\(warnings, tree\.notes, tzAnswered, tree\.hiddenLinks, links\);/);
    // a partial save says which websites saved and which did not
    assert.match(card, /Saved on \$\{saved\.map\(nameOf\)\.join\(", "\)\}\./);
    assert.match(card, /Not saved on \$\{failed\.map\(\(f\) => nameOf\(f\.id\)\)\.join\(", "\)\}/);
    // and the page learns the zone, so a reload of the card agrees
    assert.match(sources, /onZoneSaved=\{\(ids, tz\) => setChatSites/);
  });

  test("Email visitors is shown only where an allowed chat workflow runs", () => {
    const ids = ["s1", "s2"];
    assert.deepEqual([...visitorEmailSiteIds(null, ids)], [], "workflows unknown → no switch");
    assert.deepEqual([...visitorEmailSiteIds([], ids)], []);
    assert.deepEqual([...visitorEmailSiteIds([{ allowed: false, site_id: null }], ids)], [], "refused workflows → no switch");
    assert.deepEqual([...visitorEmailSiteIds([{ allowed: true, site_id: null }], ids)], ["s1", "s2"]);
    assert.deepEqual([...visitorEmailSiteIds([{ allowed: true, site_id: "S2" }], ids)], ["s2"]);
    assert.match(sources, /const emailsApply = emailSites\.has\(site\.site_id\);/);
    assert.match(sources, /\{emailsApply && \(\s*<ChatVisitorEmailsSwitch/);
  });

  test("Your own tools is offered only on an explicit yes", () => {
    assert.equal(toolsOffered(null), false, "a failed load");
    assert.equal(toolsOffered([]), false, "no workflows and no answer");
    assert.equal(toolsOffered([{ allowed: false }]), false);
    assert.equal(toolsOffered([{ allowed: true }]), true);
    assert.equal(toolsOffered([], true), true, "the server's package answer");
    assert.equal(toolsOffered([{ allowed: true }], false), false, "the server's no wins");
    assert.match(sources, /\{chatActions && toolsOffered\(playbooks, playbooksAllowed\) && \(/);
  });
});

describe("the card: one request per control, the newest secret, words beside the click", () => {
  test("Replace the secret is disabled while one is in flight, and an older answer is dropped", () => {
    assert.match(card, /disabled=\{busy\.has\(`rotate:\$\{a\.action_id\}`\)\}/);
    const rot = fnBody(card, "rotate");
    assert.match(rot, /if \(!busy\.start\(key\)\) return;/);
    assert.equal((rot.match(/if \(seq !== rotateSeq\.current\[a\.action_id\]\) return;/g) || []).length, 2,
      "both the answer and the refusal of an older request are dropped");
  });

  test("each path has its own request in flight", () => {
    const sp = fnBody(card, "setPath");
    assert.match(sp, /const key = `path:\$\{p\.key\}`;\s*if \(!busy\.start\(key\)\) return;/);
    assert.match(sp, /busy\.stop\(key\);/);
    assert.match(card, /disabled=\{busy\.has\(`path:\$\{p\.key\}`\)\}/);
    assert.equal(/useState<string \| null>\(null\);\s*\n\s*const \[refusal/.test(card), false, "no single shared busy string");
  });

  test("what a click did is said on the card, with role=status", () => {
    const said = card.slice(card.indexOf("function Said("), card.indexOf("export interface CardSite"));
    assert.match(said, /role="status"/);
    assert.match(card, /<Sentences lines=\{refusal\} \/>\s*<Said words=\{said\} \/>/);
    assert.equal(/onNotice/.test(card), false, "the card no longer sends its words to the top of the page");
    assert.match(sources, /text-emerald-900" role="status">/);
  });
});

describe("second run (8 Oct): every refusal is a sentence, one instruction each", () => {
  test("each bare code PUT /chat/sites/:siteId answers has its own sentence, never the code", () => {
    assert.ok(LUMEN.site_put_bare_codes.length >= 3, "the codes are read from LUMEN (presence)");
    for (const code of LUMEN.site_put_bare_codes) {
      const said = refusalSentences(apiErr(code === "no_such_site" ? 404 : code === "chat_site_save_failed" ? 500 : 400, { error: code, details: "Timeout: Request failed" }));
      assert.equal(said.length, 1, code);
      assert.equal(said[0], CODE_WORDS[code], `${code} has its sentence`);
      assert.equal(/_|Timeout/.test(said[0]), false, `${code}: no code, no details`);
    }
    assert.equal(refusalSentences(apiErr(404, { error: "no_such_site" }))[0],
      "That website isn't on your account any more. Reload the page to see your websites.");
    // a code we have no sentence for: the plain sentence, never the code with spaces
    assert.deepEqual(refusalSentences(apiErr(400, { error: "some_new_code" })), [NOT_DONE_WORDS]);
    // the server's own message still wins over its code
    assert.deepEqual(refusalSentences(apiErr(400, { error: "bad_timezone", message: "That time zone isn't one we recognise. Pick one from the list." })),
      ["That time zone isn't one we recognise. Pick one from the list."]);
  });

  test("a failed load says what happened and then one thing to do", () => {
    const words = loadFailedWords(refusalSentences(new TypeError("Failed to fetch")));
    assert.equal(words, "We couldn't load your workflows. We couldn't reach the server. Check your connection and try again.");
    assert.equal((words.match(/try again|Reload/gi) || []).length, 1);
    assert.match(page, /\{loadFailedWords\(\[loadError\]\)\}/);
    assert.equal(/Reload the page to try again/.test(page), false);
  });

  test("Needs you: the button and its sentence are LUMEN's honest answer", () => {
    assert.equal(ADD_TO_CHAT_WORDS, LUMEN.add_to_playbook_words);
    assert.equal(ADD_TO_CHAT_LABEL, "Save for when you edit the chat");
  });

  test("a hidden button's line points at Links on the card, and goes once its address is set", () => {
    const tree = { services: [], shared: [], hidden_links: [{ label: "Book it", var: "booking_url", words: "The 'Book it' button is hidden because no web address is set for it. Add the address of your booking page under Links to show it." }] };
    const hidden = hiddenLinksOf(tree);
    assert.deepEqual(hidden.map((h) => [h.label, h.key]), [["Book it", "booking_url"]]);
    const links = [{ key: "booking_url", label: "Booking page", url: null }];
    assert.equal(hiddenLinkLine(hidden[0], links), "The 'Book it' button is hidden from visitors because it has no web address yet. Add the address of your booking page under Links, below.");
    assert.equal(hiddenLinkLine(hidden[0], [{ ...links[0], url: "https://book.example.com" }]), null);
    // a name keeps its capitals mid-sentence (LUMEN's label "Website Builder sign-up page")
    assert.match(hiddenLinkLine({ label: "Build one", key: "builder_url", words: "" }, [{ key: "builder_url", label: "Website Builder sign-up page", url: null }]),
      /Add the address of your Website Builder sign-up page under Links, below\.$/);
    // a button whose link the workflow does not declare: no instruction that cannot be followed
    assert.equal(hiddenLinkLine({ label: "Odd", key: null, words: "" }, links), "The 'Odd' button is hidden from visitors because it has no web address.");
    // the server's sentence is replaced, not added to
    assert.deepEqual(cardWarningLines([hidden[0].words], [hidden[0].words], false, hidden, links),
      ["The 'Book it' button is hidden from visitors because it has no web address yet. Add the address of your booking page under Links, below."]);
    assert.deepEqual(cardWarningLines([hidden[0].words], [hidden[0].words], false, hidden, [{ ...links[0], url: "https://b.example.com" }]), []);
  });

  test("a bare address gets https:// in front; anything with a scheme is left for the server to judge", () => {
    assert.equal(linkAddress("  book.example.com/demo "), "https://book.example.com/demo");
    assert.equal(linkAddress("https://book.example.com"), "https://book.example.com");
    assert.equal(linkAddress("http://trial.example.com"), "http://trial.example.com");
    assert.equal(linkAddress("   "), "");
  });
});
