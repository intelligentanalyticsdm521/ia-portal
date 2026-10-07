// ARGUS → Workflows (contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.2,
// §F.3, §G.3). Source-pinned: which page the route lands on, which tabs exist
// for whom, what each Needs-you button calls, and the words.
//
// MUTATIONS RUN (edit → npm test → restore); re-run them all with
//   node scripts/dev/chat-workflows-mutation-check.mjs   (every line must say RED)
//   P4  restore src/pages/argus/ArgusWorkflowAutomationsPage.tsx
//                                 → "the old page is gone" RED
//   P2  add a setInterval(load, 5000) to ArgusWorkflowsPage
//                                 → "no polling" RED
//   W1  show "Set-up runs" to everyone (drop `isFounder ?`)
//                                 → "Set-up runs is the founder's" RED
//   W2  put "intent" in a visible sentence
//                                 → "the words checklist" RED
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments, screenWords } from "./helpers/screenWords.mjs";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const page = read("src/pages/argus/ArgusWorkflowsPage.tsx");
const router = read("src/pages/ServiceRouter.tsx");
const catalog = read("src/config/serviceCatalog.ts");
const subnav = read("src/components/SubNav.tsx");
const guide = read("src/journeys/content/argusPages.ts");
const observe = read("src/components/argus/OnboardingObservePanel.tsx");
const modal = read("src/components/spark/SparkLeadModal.tsx");

test("both workflow keys land on the new page", () => {
  assert.match(router, /const ArgusWorkflowsPage = lazyNamed\(\(\) => import\('\.\/argus\/ArgusWorkflowsPage'\), 'ArgusWorkflowsPage'\);/);
  assert.match(router, /if \(service\.key === 'argus_workflows' \|\| service\.key === 'argus_workflow_automations'\) \{\s*return <Suspense fallback=\{<RouteLoading \/>\}><ArgusWorkflowsPage \/><\/Suspense>;/);
});

test("the old page is gone, not left beside the new one (P4)", () => {
  assert.equal(existsSync(path.join(ROOT, "src/pages/argus/ArgusWorkflowAutomationsPage.tsx")), false);
  assert.equal(/ArgusWorkflowAutomationsPage/.test(router), false);
});

test("the Business Rules tab is gone; the onboarding views moved into the founder's panel", () => {
  assert.equal(/Business Rules"\]/.test(observe) || /\/automations\/rules/.test(observe), false);
  assert.match(observe, /\/automations\/workflows/);
  assert.match(observe, /\/automations\/onboarding-runs\?limit=100/);
  assert.match(observe, /export function OnboardingObservePanel\(\)/);
  assert.equal(/Business Rules/.test(stripComments(page)), false);
});

test("Set-up runs is the founder's, and only the founder's", () => {
  assert.match(page, /const isFounder = useIsFounder\(\);/);
  assert.match(page, /\.\.\.\(isFounder \? \[\{ key: "setup" as Tab, label: "Set-up runs" \}\] : \[\]\)/);
  assert.match(page, /\{tab === "setup" && isFounder && <OnboardingObservePanel \/>\}/);
});

test("three tabs for every owner, and ?tab=needs-you opens that one", () => {
  assert.match(page, /\{ key: "all", label: "All" \}/);
  assert.match(page, /\{ key: "needs-you", label: `Needs you \(\$\{needsCount\}\)` \}/);
  assert.match(page, /\{ key: "history", label: "History" \}/);
  assert.match(page, /const tab = tabFrom\(params\.get\("tab"\)\);/);
  assert.match(page, /v === "needs-you" \|\| v === "history" \|\| v === "setup" \? v : "all"/);
});

test("one load on arrival: the workflows and Needs you together; History on its first open", () => {
  assert.match(page, /await Promise\.all\(\[\s*get<[^>]+>\(CHAT_WF\.workflows\),\s*get<[^>]+>\(CHAT_WF\.needsYou\),\s*\]\)/);
  assert.match(page, /if \(!ready \|\| tab !== "history" \|\| historyAsked\.current\) return;/);
  // the steps load the first time a row is opened, once
  assert.match(page, /if \(treesAsked\.current\) return;\s*treesAsked\.current = true;/);
});

test("no polling on the new screens (P2)", () => {
  for (const f of [
    "src/pages/argus/ArgusWorkflowsPage.tsx",
    "src/components/spark/ChatWorkflowCard.tsx",
    "src/components/spark/ChatWorkflowTree.tsx",
    "src/lib/chatWorkflows.ts",
  ]) {
    assert.equal(/setInterval\s*\(/.test(stripComments(read(f))), false, `${f} must not poll`);
  }
});

test("a business without SPARK reads the sentence, not an error", () => {
  assert.match(page, /if \(statusOf\(err\) === 403\) setNoSpark\(true\);/);
  assert.match(read("src/lib/chatWorkflows.ts"),
    /"Your workflows appear here\. Right now the only kind is the website chat, which comes with SPARK\."/);
  assert.match(page, /else setLoadError\(friendlyApiError\(err\)\.message\);/);
});

test("All: the trigger, the mode in words, the switch, last ran and this month", () => {
  assert.match(page, /\{w\.trigger\?\.label \|\| "Chat message"\}/);
  assert.match(page, /<option value="automatic">Automatic<\/option>/);
  assert.match(page, /<option value="review">Send me first<\/option>/);
  assert.match(page, /put\(CHAT_WF\.workflow\(w\.workflow_id\), \{ mode \}\)/);
  assert.match(page, /put\(CHAT_WF\.workflow\(w\.workflow_id\), \{ enabled \}\)/);
  assert.match(page, /setNotice\(modeChangedWords\(w\.name, mode\)\)/);
  assert.match(page, /ran \? `Last ran \$\{ran\}` : "Hasn't run yet"/);
  assert.match(page, /\{w\.runs_this_month\} this month/);
  assert.match(page, /Switch paths on or off in SPARK → Lead sources/);
  assert.match(page, /<ChatWorkflowSteps steps=\{p\.steps\} \/>/);
});

test("Needs you: Send it now / Don't send call approve / skip", () => {
  assert.match(page, /decide\(item, CHAT_WF\.approve\(item\.run_id\),/);
  assert.match(page, /decide\(item, CHAT_WF\.skip\(item\.run_id\),/);
  assert.match(page, />\s*Send it now\s*</);
  assert.match(page, /Don&rsquo;t send/);
  assert.match(page, /\{heldSentence\(item\)\}/);
});

test("Needs you: an unmatched message can be answered, added, or ignored", () => {
  assert.match(page, /&ldquo;\{item\.text\}&rdquo;/);
  assert.match(page, /Looks like: \{item\.intent_words\}/);
  assert.match(page, /Complaint, refund or legal — answer it yourself/);
  assert.match(page, /decide\(item, CHAT_WF\.addToChat\(item\.unmatched_id\), "Saved as a draft path\. It isn't shown to visitors\."\)/);
  assert.match(page, /decide\(item, CHAT_WF\.ignore\(item\.unmatched_id\),/);
  assert.match(page, />\s*Add to the chat as a new path\s*</);
  assert.match(page, /Nothing needs you right now\./);
});

test("Reply now opens the lead's own modal on its Conversation tab, right here", () => {
  assert.match(page, /import \{ SparkLeadModal \} from "\.\.\/\.\.\/components\/spark\/SparkLeadModal";/);
  assert.match(page, /onClick=\{\(\) => setReplyLead\(item\.lead_id\)\}/);
  assert.match(page, /<SparkLeadModal\s+leadId=\{replyLead\}\s+open=\{replyLead != null\}\s+initialTab="conversation"/);
  // the modal honours it
  assert.match(modal, /initialTab\?: SparkLeadModalTab;/);
  assert.match(modal, /setTab\(initialTab \?\? "overview"\)/);
  // and after it closes, one read of Needs you shows the answered row gone
  assert.match(page, /void loadNeedsYou\(\)\.catch/);
});

test("History: what it did, with the report link", () => {
  assert.match(page, /\{h\.action_label\} — \{h\.status_words\}/);
  assert.match(page, /<a href=\{h\.file_url\} target="_blank" rel="noopener"[^>]*>Open the report<\/a>/);
});

test("the catalog, the menu and the page guide say Workflows", () => {
  assert.match(catalog, /\{ key: 'argus_workflows', displayName: 'ARGUS — Workflows', section: 'ARGUS',[^\n]*description: 'Every process that runs for your business in one list: what starts it, whether it runs automatically or waits for you, and what it did\.' \}/);
  assert.equal(/key: 'argus_automation'/.test(catalog), false, "the 'coming soon' Automation placeholder is deleted");
  assert.match(subnav, /label: "Workflows", icon: Zap, collapsible: false, sectionId: "argus_workflow"/);
  assert.match(subnav, /\{ key: "argus_workflows",\s+label: "Workflows", route: "\/app\/services\/argus_workflows"/);
  assert.match(guide, /title: "Workflows — what runs for you, and what needs you"/);
  assert.match(guide, /Needs you is where those wait, along with chat messages ARGUS couldn't place\./);
});

test("the words checklist: no jargon, no 'tenant', no vendor (P1)", () => {
  const words = [page, guide.slice(guide.indexOf("argus_workflows:"), guide.indexOf("argus_coming"))].flatMap(screenWords);
  assert.ok(words.some((w) => w.includes("Nothing needs you right now.")), "the extractor must see the page's words");
  const BANNED = /\b(tenant|playbooks?|node|nodes|intent|confidence|HMAC|webhooks?|payload|JSON)\b|anthropic|claude|openai|gpt-|sonnet|haiku|opus/i;
  assert.deepEqual(words.filter((w) => BANNED.test(w)), []);
});

test("the page asks nothing in the browser's own dialog", () => {
  assert.equal(/(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/.test(stripComments(page)), false);
});
