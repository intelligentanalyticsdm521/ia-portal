// test/argus-team-lib.test.mjs — ARGUS → Your team, the pure half
// (contract CONTRACT_ARGUS_EMPLOYEES_PHASE1_2026-10-08 §C, §E, §F, §H.5).
//
// src/lib/team.ts, src/components/argus/team/doors.ts and the six new answers in
// src/lib/businessProfileForm.ts decide every sentence and every request the
// employee pages, ARGUS → Workflows and the in-place doors make. Pinned here:
//   · what a job row shows for every state (a switch, a door, the words), and
//     that an always-asks job never offers Automatic (M19)
//   · the toast, the halted line, the "not on your team" and "add the product" lines
//   · "Written from your business details (version N, saved D): …", and version 0
//   · Needs you: a 403 is "nothing from that product"; any other failure is a
//     line of its own, never a silent empty list (M20)
//   · the body each Approve sends, in each route's own field names, and that a
//     row can never send a decision to another product's route
//   · the door adapters' reads and writes
//   · the six Brief answers round-trip, and a refused save says the label
//   · (fixer, 8 Oct) what the screen derives from the servers' COMMITTED answers
//     (test/fixtures/argus-team-server-shapes.mjs): Run it now's sentence for
//     every runner shape, the employee's standing from GET /me/team, a skip-only
//     row's button, a 2xx decision that failed, the door's words and Last sent
//
// MUTATIONS: node scripts/dev/argus-team-mutation-check.mjs (every line must say RED).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPLOYEE_KEYS, TEAM_SERVICE_KEY, employeeFromServiceKey, employeeRoute, yourEmployee, YourEmployee,
  jobRowState, shownMode, modeToast, enabledToast, needCountWords, lastDidWords, haltedLine,
  notOnTeamWords, productNotOwnedWords, versionLine, briefCitedLine, briefPhrase, briefFieldRoute,
  waitingForBriefWords, knowFields, sourceResult, mergeNeedsYou, sourceFailedWords, statusOfError,
  fromJobLine, heldWordsOf, skipPrompt, approveAllowed, isWaitingItem, teamLoadWords, knownJobKeys, decidePathOk, approveBody, tomorrowAtTen,
  localToIso, runNowCall, runResult, belongsTo, lastRunByJob, waitingByJob, whatIDid,
  canRunNow, decisionResult, cardKind, cardRow, employeeStanding, withStanding, jobWriteWords, whenWords,
  choiceLabel, employeeLoadWords, reviewRepliesIntro, productNotOwnedWords as notOwnedWords,
  RUN_SPEND_LIMIT_WORDS, RUN_HALTED_WORDS, RUN_OFF_WORDS, RUN_FAILED_WORDS, RUN_PAUSED_WORDS, RUN_NOT_OWNED_WORDS,
  RUN_UNKNOWN_WORDS, RUN_NOTHING_WORDS, RUN_PART_FAILED_WORDS, SCHEDULE_FAILED_WORDS, NOTHING_CHANGED_SAVED_WORDS, NEVER_WORDS,
  varsPayload, varText, varLimitWords, teamRefusal, madeByWords, employeeTabFrom, pausedWords,
  dayMonth, relativeTime, WAITING_PATHS, TEAM_PATHS, NOT_BUILT_WORDS, UNDECIDED_WORDS, NOT_ADMIN_WORDS,
  UNREACHABLE_WORDS, runNowFailure, jobProblem, RUN_SERVER_FAULT_WORDS, RUN_NO_ANSWER_WORDS,
} from "../src/lib/team.ts";
import {
  DOOR_KNOBS, doorReads, doorState, doorWrite, doorPlace, doorRowView, doorRefusalWords,
} from "../src/components/argus/team/doors.ts";
import * as WIRE from "./fixtures/argus-team-server-shapes.mjs";
import {
  toDraft, toFields, changedFields, splitPair, saveRefusalWords, FIELD_LABELS, EMPTY_DRAFT,
} from "../src/lib/businessProfileForm.ts";

/** A JobView with every field, overridden per case. */
function job(over = {}) {
  return {
    job_key: "arion.blog_posts", employee_key: "web", display_name: "Blog posts",
    description_plain: "Writes a post.", state: "live", runner_kind: "agent", setting_home: "team",
    trigger_words: "Every Monday", mode_rule: "either", lock_words: null, hire_required: true,
    sends_to_customer: true, enabled: false, mode: "review", mode_set_by: null, mode_set_at: null,
    vars: {}, var_defs: {}, available: { ok: true, decided: true }, automatic: { ok: true, decided: true },
    on_team: true, door: null, playbook: null, waiting_for_brief: [],
    ...over,
  };
}

/* ── the three employees ─────────────────────────────────────────────── */

test("three employees, three pages, plain names", () => {
  assert.deepEqual([...EMPLOYEE_KEYS], ["web", "marketer", "office"]);
  assert.equal(TEAM_SERVICE_KEY.web, "argus_team_web");
  assert.equal(employeeFromServiceKey("argus_team_office"), "office");
  assert.equal(employeeFromServiceKey("arion_agents"), null);
  assert.equal(employeeRoute("marketer"), "/app/services/argus_team_marketer");
  assert.equal(employeeRoute("web", "jobs"), "/app/services/argus_team_web?tab=jobs");
  assert.equal(yourEmployee("office"), "your office administrator");
  assert.equal(YourEmployee("web"), "Your web person");
  assert.equal(madeByWords("marketer"), "Made by: your marketer");
  assert.equal(employeeTabFrom("know"), "know");
  assert.equal(employeeTabFrom("anything"), "today");
  assert.equal(employeeTabFrom(null), "today");
});

/* ── a job row ───────────────────────────────────────────────────────── */

test("a planned job shows 'Not built yet' and no switch", () => {
  const st = jobRowState(job({ state: "planned", setting_home: "none", lock_words: "Not built yet" }));
  assert.equal(st.control, "none");
  assert.equal(st.lockLine, "Not built yet");
  assert.equal(st.modeControl, false);
  assert.equal(jobRowState(job({ state: "planned", setting_home: "none", lock_words: null })).lockLine, NOT_BUILT_WORDS);
});

test("a locked job shows its lock words and no switch", () => {
  const st = jobRowState(job({ state: "locked", setting_home: "none", mode_rule: "none", lock_words: "Always yours: your logo, colours and voice" }));
  assert.equal(st.control, "none");
  assert.equal(st.lockLine, "Always yours: your logo, colours and voice");
  assert.equal(st.modeControl, false);
});

test("a live job with no switch of its own (the lead summary) shows its words", () => {
  const st = jobRowState(job({ setting_home: "none", mode_rule: "none", lock_words: "Comes with lead search" }));
  assert.equal(st.control, "none");
  assert.equal(st.lockLine, "Comes with lead search");
});

test("a door job is switched where it lives, and never offers Automatic", () => {
  const st = jobRowState(job({ setting_home: "door", mode_rule: "always_asks", lock_words: "Always asks you before it sends" }));
  assert.equal(st.control, "door");
  assert.equal(st.modeControl, false);
  assert.equal(st.modeLine, "Always asks you before it sends");
});

test("an always-asks team job never shows the mode control (M19)", () => {
  const st = jobRowState(job({ job_key: "spark.winback", mode_rule: "always_asks", lock_words: "Always asks you first" }));
  assert.equal(st.control, "switch");
  assert.equal(st.modeControl, false);
  assert.equal(st.modeLine, "Always asks you first");
  assert.equal(st.automaticLine, null);
});

test("an either job shows the mode control, and the review line under it", () => {
  const st = jobRowState(job({ job_key: "arion.review_replies", lock_words: "Reviews of 3 stars or fewer always wait for you" }));
  assert.equal(st.control, "switch");
  assert.equal(st.modeControl, true);
  assert.equal(st.modeLine, "Reviews of 3 stars or fewer always wait for you");
});

test("an employee not on the team: no switch, and no words on the row (the page says it once)", () => {
  const st = jobRowState(job({ on_team: false }));
  assert.equal(st.control, "none");
  assert.equal(st.lockLine, null);
});

test("can't be switched on: the switch is locked with the plan sentence; undecided is not a refusal", () => {
  const refused = jobRowState(job({ available: { ok: false, decided: true, words: "Your web person works on ARION. Add ARION to switch this on.", link: { label: "Plan & Pricing", to: "/app/settings/plan-pricing" } } }));
  assert.equal(refused.switchLocked, true);
  assert.equal(refused.gateLine.words, "Your web person works on ARION. Add ARION to switch this on.");
  assert.equal(refused.gateLine.link.to, "/app/settings/plan-pricing");
  const undecided = jobRowState(job({ available: { ok: false, decided: false } }));
  assert.equal(undecided.switchLocked, false, "we don't know is never a lock on the screen; the server decides");
  assert.equal(undecided.gateLine, null);
});

test("on, but its plan stopped holding: Paused, and the switch still turns it off", () => {
  const st = jobRowState(job({ enabled: true, available: { ok: false, decided: true, words: "Google review replies come with ARION Pro." } }));
  assert.equal(st.paused, true);
  assert.equal(st.switchLocked, false);
  assert.equal(pausedWords(st.gateLine.words), "Paused: Google review replies come with ARION Pro.");
});

test("Automatic not allowed yet: the option is off and the sentence says why", () => {
  const st = jobRowState(job({ automatic: { ok: false, decided: true, words: "Sending by itself comes with the SPARK Leads Authority package." } }));
  assert.equal(st.modeControl, true);
  assert.equal(st.automaticLine.words, "Sending by itself comes with the SPARK Leads Authority package.");
});

test("the mode shown: an always-asks job reads Send me first whatever is stored", () => {
  assert.equal(shownMode({ mode: "automatic", mode_rule: "always_asks" }), "review");
  assert.equal(shownMode({ mode: "automatic", mode_rule: "either" }), "automatic");
  assert.equal(shownMode({ mode: null, mode_rule: "either" }), "review");
});

/* ── sentences ───────────────────────────────────────────────────────── */

test("the mode toast names who approved in advance, and when", () => {
  assert.equal(
    modeToast("Blog posts", "automatic", "Dana Ruiz", "2026-10-08T15:00:00Z"),
    "Blog posts will go out without waiting for you. Approved in advance by Dana Ruiz on 8 Oct.",
  );
  assert.equal(modeToast("Blog posts", "review", "Dana Ruiz", null), "Blog posts will wait for you again.");
  assert.equal(modeToast("Blog posts", "automatic", null, null), "Blog posts will go out without waiting for you. Approved in advance by you.");
});

test("the switch toast, the counts and the last-did line", () => {
  assert.equal(modeToast("Blog posts", "automatic", "Dana Ruiz", null, false),
    "Blog posts will go out without waiting for you once it's on. Approved in advance by Dana Ruiz.", "an Off job promises nothing now");
  assert.equal(modeToast("Blog posts", "review", null, null, false), "Blog posts will wait for you again once it's on.");
  assert.equal(enabledToast("Blog posts", true), "Switched on: Blog posts.");
  assert.equal(enabledToast("Blog posts", false), "Switched off: Blog posts. It does nothing until you switch it back on.");
  assert.equal(needCountWords(0), null);
  assert.equal(needCountWords(1), "1 needs you");
  assert.equal(needCountWords(3), "3 need you");
  const now = Date.parse("2026-10-08T12:00:00Z");
  assert.equal(lastDidWords("2026-10-08T10:00:00Z", now), "Last did 2 hr ago");
  assert.equal(lastDidWords(null, now), null, "no run, no line");
  assert.equal(relativeTime("2026-10-07T11:00:00Z", now), "yesterday");
});

test("the halted line says when and why; the button beside it is Start it again", () => {
  assert.equal(haltedLine("It hit this month's spending limit.", "2026-10-06T12:00:00Z"), "Stopped itself on 6 Oct: It hit this month's spending limit.");
  assert.equal(haltedLine(null, null), "Stopped itself: it hit one of its own limits.");
});

test("not on the team, and the product not owned — show, don't hide", () => {
  assert.equal(notOnTeamWords("web"), "Your web person isn't on your team yet. Ask your account contact to add them.");
  assert.equal(productNotOwnedWords("web"), "Your web person works on ARION. Add ARION to have them on your team.");
  assert.equal(productNotOwnedWords("marketer"), "Your marketer works on SPARK. Add SPARK to have them on your team.");
  assert.equal(productNotOwnedWords("office"), "Your office administrator works on OLIVER. Add OLIVER to have them on your team.");
});

test("the version line", () => {
  assert.equal(versionLine({ version: 1, source: "starter" }), "Version 1, the standard set");
  assert.equal(versionLine({ version: 4, source: "fixture" }), "Version 4, set up for your business");
  assert.equal(versionLine({ version: 2, source: "owner" }), "Version 2, set up for your business");
  assert.equal(versionLine(null), null);
});

/* ── the Business Brief ──────────────────────────────────────────────── */

test("'Written from your business details', and version 0 says so", () => {
  assert.deepEqual(
    briefCitedLine({ version: 7, saved_at: "2026-10-02T14:10:00Z", used: ["services", "serviceArea", "brandVoice", "offersAllowed"] }),
    { words: "Written from your business details (version 7, saved 2 Oct): what you sell, where you work, how you talk, offers you allow.", link: false },
  );
  assert.deepEqual(briefCitedLine({ version: 0, saved_at: null, used: [] }),
    { words: "Written without your business details. Fill them in on Your business.", link: true });
  assert.equal(briefCitedLine(null), null);
});

test("each answer in words, and where to change it", () => {
  assert.equal(briefPhrase("namesNeverMention"), "names never to mention");
  assert.equal(briefPhrase("somethingNew", "Something New"), "something New");
  assert.equal(briefFieldRoute("offersAllowed"), "/app/settings/your-business#offersAllowed");
  assert.equal(briefFieldRoute("businessName"), "/app/settings/business-profile");
  assert.equal(waitingForBriefWords({ field: "services", label: "What you sell" }),
    "I'm waiting for you to tell me what you sell (Settings → Your business).");
});

test("What I know: every answer the live jobs read, once each", () => {
  const pb = (reads) => ({ version: 1, source: "starter", steps: [], allowed: [], never: [], reads });
  const out = knowFields([
    job({ playbook: pb([{ field: "services", label: "What you sell", set: true }, { field: "brandVoice", label: "How you talk", set: false }]) }),
    job({ job_key: "arion.social_posts", playbook: pb([{ field: "services", label: "What you sell", set: true }]) }),
    job({ job_key: "arion.seo_fixes", state: "planned", playbook: pb([{ field: "competitors", label: "Competitors", set: false }]) }),
  ]);
  assert.deepEqual(out.map((f) => [f.field, f.set]), [["services", true], ["brandVoice", false]]);
});

/* ── Needs you ───────────────────────────────────────────────────────── */

const row = (over = {}) => ({
  agent: "content", agent_label: "Blog posts", product: "arion", kind: "proposal", id: "1",
  summary: "A post", detail: { body: "Hello" }, status: "proposed", status_label: "", hold_note: null,
  proposed_at: "2026-10-08T10:00:00Z", decided_at: null, cost_units: null, cost_note: "",
  can_decide: true, attribution: "", links: [], ...over,
});

test("a 403 is a product this business does not have: nothing, and nothing to say", () => {
  for (const reason of [
    Object.assign(new Error("not allowed"), { status: 403 }),
    new Error('SPARK API 403: {"error":"not_allowed"}'),
    { type: "tier_gate", tierRequired: "pro" },
  ]) {
    const r = sourceResult("spark", { status: "rejected", reason });
    assert.equal(r.notOwned, true);
    assert.equal(r.failed, false);
  }
});

test("any other failure is a line of its own, never a silent empty list (M20)", () => {
  const ok = sourceResult("arion", { status: "fulfilled", value: [row({ id: "a", proposed_at: "2026-10-08T09:00:00Z" })] });
  const broken = sourceResult("oliver", { status: "rejected", reason: new Error("OLIVER API 500: {}") });
  const offline = sourceResult("spark", { status: "rejected", reason: new TypeError("Failed to fetch") });
  assert.equal(broken.failed, true);
  assert.equal(offline.failed, true);
  const merged = mergeNeedsYou([ok, broken, offline]);
  assert.deepEqual(merged.failures, [
    { source: "oliver", words: "We couldn't load what your office administrator left for you. Try again." },
    { source: "spark", words: "We couldn't load what your marketer left for you. Try again." },
  ]);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].source, "arion");
  assert.equal(sourceFailedWords("arion"), "We couldn't load what your web person left for you. Try again.");
});

test("only what a person can act on, from the team's jobs, counts as waiting", () => {
  // Found on the dev pane 8 Oct: an endpoint that ignores ?waiting=1 sends its
  // whole list — the oversight layer's checks, notes, stood-down suggestions.
  assert.equal(isWaitingItem(row({ agent: "governance", kind: "note" })), false, "the oversight layer's checks are nobody's job");
  assert.equal(isWaitingItem(row({ agent: "fieldops", status: "stopped" })), false, "a suggestion that stood down is nothing to decide");
  assert.equal(isWaitingItem(row({ agent: "content", status: "approved", can_publish: true })), true, "approved, not yet on the website");
  assert.equal(isWaitingItem(row({ agent: "qtc" })), true);
  assert.equal(isWaitingItem(row({ agent: "something_else" })), false);
  assert.equal(isWaitingItem(row({ agent: "x", status: "declined", decide: { approve: { path: "/a", label: "Try again", edits: [] } } })), true,
    "a row the product says can be decided is shown");
  const r = sourceResult("oliver", { status: "fulfilled", value: [row({ agent: "governance", kind: "note" }), row({ agent: "qtc", id: "q" })] });
  assert.deepEqual(r.rows.map((x) => x.id), ["q"]);
});

test("rows from every source in one list, newest first", () => {
  const merged = mergeNeedsYou([
    sourceResult("arion", { status: "fulfilled", value: [row({ id: "old", proposed_at: "2026-10-01T00:00:00Z" })] }),
    sourceResult("spark", { status: "fulfilled", value: [row({ id: "new", proposed_at: "2026-10-08T00:00:00Z", agent: "campaign" })] }),
  ]);
  assert.deepEqual(merged.rows.map((r) => r.id), ["new", "old"]);
});

test("the status inside whatever a client threw", () => {
  assert.equal(statusOfError(new Error("OLIVER API 409: {}")), 409);
  assert.equal(statusOfError(Object.assign(new Error("x"), { status: 503 })), 503);
  assert.equal(statusOfError(new Error("nope")), null);
});

test("the card's words: from which job, why it waited, the Skip question", () => {
  assert.equal(fromJobLine({ employee_key: "web", job_key: "arion.blog_posts", agent_label: "Content" }, "Blog posts"), "from your web person · Blog posts");
  assert.equal(fromJobLine({ source: "oliver", agent_label: "Quote follow-up" }), "from your office administrator · Quote follow-up");
  assert.equal(heldWordsOf({ held_words: "Reviews of 3 stars or fewer always wait for you.", hold_note: "x" }), "Reviews of 3 stars or fewer always wait for you.");
  assert.equal(heldWordsOf({ held_words: null, hold_note: "Held: a price." }), "Held: a price.");
  assert.equal(heldWordsOf({}), "It's waiting for you to look.");
  assert.equal(skipPrompt("optional"), "Why? (optional — it helps your team learn)");
  assert.equal(skipPrompt("required"), "Why? (needed)");
});

test("a held draft is approved only after a word changes", () => {
  assert.equal(approveAllowed({ edits_required: true }, false), false);
  assert.equal(approveAllowed({ edits_required: true }, true), true);
  assert.equal(approveAllowed({}, false), true);
  assert.equal(approveAllowed(undefined, true), false, "no approve route, no Approve");
});

test("a row can never send a decision to another product's route", () => {
  assert.equal(decidePathOk("arion", "/arion/review-replies/1/approve"), true);
  assert.equal(decidePathOk("arion", "/api/v1/campaign-agent/queue/1/approve"), false);
  assert.equal(decidePathOk("spark", "/api/v1/leads/4/drafts/9/approve"), true);
  assert.equal(decidePathOk("spark", "/arion/x"), false);
  assert.equal(decidePathOk("oliver", "/qtc-agent/queue/1/approve"), true);
  assert.equal(decidePathOk("oliver", "/arion/x"), false);
  for (const bad of ["https://elsewhere.example/x", "//elsewhere/x", "/arion/../admin", "", null]) {
    assert.equal(decidePathOk("arion", bad), false, String(bad));
  }
});

test("an encoded dot segment or a backslash can't carry a decision onto another route", () => {
  // The browser's URL parser turns these into /admin/x on the same host.
  for (const bad of ["/arion/%2e%2e/admin/x", "/arion/%2E%2E/admin/x", "/arion/.%2e/admin", "/arion/%2e./admin",
    "/arion\\..\\admin", "/arion/x\\y", "/arion/./x", "/api/v1/%2e%2e/arion/x", "/qtc-agent/%2e%2e/x"]) {
    for (const src of ["arion", "spark", "oliver"]) assert.equal(decidePathOk(src, bad), false, `${src} ${bad}`);
  }
  assert.equal(new URL("/arion/%2e%2e/admin/x", "http://x").pathname, "/admin/x", "why it matters");
  assert.equal(decidePathOk("arion", "/arion/content-agent/queue/6f1c/approve"), true, "a real path still passes");
});

test("each Approve sends its route's own field names, and only what may be edited", () => {
  const edits = { title: "T", subject: "S", body: "B" };
  assert.deepEqual(approveBody("arion", "/arion/content-agent/queue/1/approve", { edits: ["title", "body"] }, edits), { title: "T", body_markdown: "B" });
  assert.deepEqual(approveBody("arion", "/arion/review-replies/1/approve", { edits: ["body"] }, edits), { body: "B" });
  assert.deepEqual(approveBody("spark", "/api/v1/campaign-agent/queue/1/approve", { edits: ["subject", "body"] }, edits), { subject_line: "S", body_html: "B" });
  assert.deepEqual(approveBody("spark", "/api/v1/leads/4/drafts/9/approve", { edits: ["subject", "body"] }, edits), { subject: "S", body: "B" });
  assert.deepEqual(approveBody("oliver", "/qtc-agent/queue/1/approve", { edits: ["subject", "body"] }, edits), { subject_line: "S", message_body: "B" });
  assert.deepEqual(approveBody("oliver", "/fieldops-agent/suggestions/1/accept", { edits: [] }, edits), {});
  assert.deepEqual(approveBody("arion", "/arion/content-agent/queue/1/approve", { edits: ["body"] }, edits), { body_markdown: "B" }, "a title it may not edit is not sent");
  assert.deepEqual(approveBody("arion", "/arion/content-agent/queue/1/approve", { edits: ["body"] }, null), {}, "no edit, nothing but the approval");
  assert.deepEqual(
    approveBody("arion", "/arion/content-agent/queue/2/approve", { edits: ["body"], when: "schedule" }, null, "2026-10-09T15:00:00.000Z"),
    { scheduled_for: "2026-10-09T15:00:00.000Z" },
  );
});

test("a social post goes out tomorrow at 10:00 unless the owner picks another time", () => {
  const v = tomorrowAtTen(new Date(2026, 9, 8, 16, 30));
  assert.equal(v, "2026-10-09T10:00");
  assert.equal(localToIso(v), new Date(2026, 9, 9, 10, 0).toISOString());
  assert.equal(localToIso("not a time"), null);
});

/* ── On, but it can't read its job description (JobView.problem) ─────── */

test("a job that is On but can't read its job description says so, and Run it now is not offered", () => {
  const live = {
    state: "live", setting_home: "team", mode_rule: "either", lock_words: null, on_team: true, enabled: true,
    available: { ok: true, decided: true }, automatic: { ok: true, decided: true },
  };
  const st = jobRowState({ ...live, problem: WIRE.CANT_READ_DESCRIPTION_WORDS });
  assert.equal(st.problemLine, WIRE.CANT_READ_DESCRIPTION_WORDS, "the server's sentence, as sent");
  assert.equal(st.control, "switch", "it can still be switched off and on again");
  assert.equal(jobRowState(live).problemLine, null, "no problem, no line");
  assert.equal(jobRowState({ ...live, problem: "   " }).problemLine, null);
  assert.equal(jobRowState({ ...live, setting_home: "door", problem: WIRE.CANT_READ_DESCRIPTION_WORDS }).problemLine, WIRE.CANT_READ_DESCRIPTION_WORDS, "a door job too");
  assert.equal(jobProblem({ problem: null }), null);
  const ok = { hasRunRoute: true, isOn: true, paused: false, halted: false };
  assert.equal(canRunNow(ok), true);
  assert.equal(canRunNow({ ...ok, problem: null }), true);
  assert.equal(canRunNow({ ...ok, problem: WIRE.CANT_READ_DESCRIPTION_WORDS }), false, "on, but the runners drop it: never offered");
  assert.equal(canRunNow({ ...ok, problem: "   " }), true, "a blank problem is no problem");
});

/* ── Run it now ──────────────────────────────────────────────────────── */

test("Run it now calls each runner's own route", () => {
  assert.deepEqual(runNowCall("arion.blog_posts"), { source: "arion", path: "/arion/agents/run", body: { job_key: "arion.blog_posts" }, asksBrief: false });
  assert.deepEqual(runNowCall("arion.social_posts").body, { job_key: "arion.social_posts" });
  assert.equal(runNowCall("arion.review_replies").path, "/arion/review-replies/run");
  assert.equal(runNowCall("spark.winback").path, "/api/v1/campaign-agent/run-winback");
  assert.deepEqual(runNowCall("spark.campaign_from_brief", " Spring "), { source: "spark", path: "/api/v1/campaign-agent/draft", body: { brief: "Spring" }, asksBrief: true });
  assert.equal(runNowCall("oliver.quote_payment_followups").path, "/qtc-agent/run");
  assert.equal(runNowCall("oliver.crew_suggestions").path, "/fieldops-agent/run");
  for (const k of ["spark.inquiry_reply", "spark.lead_digest", "oliver.review_asks", "arion.brand_changes", "arion.seo_fixes"]) {
    assert.equal(runNowCall(k), null, `${k} has no Run it now`);
  }
});

test("what came of a run: a plain count is said in green", () => {
  assert.deepEqual(runResult({ data: { drafted: 2 } }), { ok: true, words: "It has had a look and wrote 2 things for you. They're in Needs you." });
  assert.deepEqual(runResult({ drafted: 1 }), { ok: true, words: "It has had a look and wrote 1 thing for you. It's in Needs you." });
  assert.deepEqual(runResult({ data: { drafted: 0 } }), { ok: true, words: RUN_NOTHING_WORDS });
  assert.deepEqual(runResult(null), { ok: true, words: RUN_UNKNOWN_WORDS });
  assert.deepEqual(runResult({ data: { drafted: null } }), { ok: true, words: RUN_UNKNOWN_WORDS }, "a count it did not send is unknown, never 0");
});

test("Run it now, the web person's posts (arion content tick): every way it did NOT run is said in rose", () => {
  const T = WIRE.CONTENT_TICK;
  assert.deepEqual(runResult(T.drafted(1)), { ok: true, words: "It has had a look and wrote 1 thing for you. It's in Needs you." });
  assert.deepEqual(runResult(T.drafted(2, 1)), { ok: true, words: "It has had a look and posted 1 by itself, and wrote 1 thing for you. It's in Needs you." },
    "one that went out by itself is not described as waiting");
  assert.deepEqual(runResult(T.drafted(1, 1)), { ok: true, words: "It has had a look and posted 1 by itself." });
  assert.deepEqual(runResult(T.nothingToWrite), { ok: true, words: RUN_NOTHING_WORDS });
  assert.deepEqual(runResult(T.tickError), { ok: false, words: RUN_FAILED_WORDS });
  assert.deepEqual(runResult(T.briefUnreadable), { ok: false, words: "I couldn't read your business details, so I didn't write anything." });
  assert.deepEqual(runResult(T.blocked), { ok: false, words: "I'm waiting for you to tell me what you sell (Settings → Your business)." });
  assert.deepEqual(runResult(T.suiteCeiling), { ok: false, words: RUN_SPEND_LIMIT_WORDS });
  assert.deepEqual(runResult(T.skippedHalted), { ok: false, words: RUN_HALTED_WORDS });
  assert.deepEqual(runResult(T.stateUnreadable), { ok: false, words: "ARGUS couldn't check which jobs are switched on, so it did nothing this time." });
  assert.deepEqual(runResult(T.killSwitch), { ok: false, words: RUN_PAUSED_WORDS });
  assert.deepEqual(runResult(T.productOff), { ok: false, words: RUN_NOT_OWNED_WORDS });
});

test("Run it now, review replies (arion review tick): posted counted apart, a failed fetch or blocked run is rose", () => {
  const R = WIRE.REVIEW_TICK;
  assert.deepEqual(runResult(R.automaticMixed), { ok: true, words: "It has had a look and posted 1 by itself, and wrote 1 thing for you. It's in Needs you." });
  assert.deepEqual(runResult(R.heldTwo), { ok: true, words: "It has had a look and wrote 2 things for you. They're in Needs you." });
  assert.deepEqual(runResult(R.nothingDue), { ok: true, words: RUN_NOTHING_WORDS });
  assert.deepEqual(runResult(R.googleFetchFailed), { ok: false, words: RUN_PART_FAILED_WORDS }, "never 'nothing to do' when Google could not be read");
  assert.deepEqual(runResult(R.failedNoWords), { ok: false, words: RUN_FAILED_WORDS }, "a failed run with no words of its own is rose");
  const refused = runResult(R.postRefused);
  assert.equal(refused.ok, false);
  assert.match(refused.words, /^1 reply didn't go to Google\. It's in Needs you to try again\./);
  assert.equal(/fetchReviews|401/.test(runResult(R.googleFetchFailed).words), false, "the machine error never reaches the screen");
});

test("Run it now, a business without the product: arion's own answer's productOff: true is said as not on the plan", () => {
  assert.deepEqual(runResult(WIRE.CONTENT_TICK.ownProductOff), { ok: false, words: RUN_NOT_OWNED_WORDS });
  assert.deepEqual(runResult({ productOff: true, ran: 0, results: [] }), { ok: false, words: RUN_NOT_OWNED_WORDS }, "with or without the envelope");
  assert.deepEqual(runResult({ data: { productOff: true } }), { ok: false, words: RUN_NOT_OWNED_WORDS }, "a single-run shape too");
});

test("Run it now refused or broken: the runner's refusal sentence; a fault is one plain sentence, never its body", () => {
  // review replies: a blocked run is a 409 NOT_RUN with its words, not a 200
  assert.equal(runNowFailure(WIRE.REVIEW_RUN_REFUSED.briefBlocked()), "I couldn't read your business details, so I didn't answer any reviews.");
  assert.equal(runNowFailure(WIRE.REVIEW_RUN_REFUSED.ceiling()), "This month's ARGUS spending limit for your business is reached, so I didn't write any replies.");
  assert.equal(runNowFailure(WIRE.ARION_JOB_OFF()), "That job is off. Switch it on first.");
  // a 500 carries the exception's text: never shown
  assert.equal(runNowFailure(WIRE.ARION_FAULT()), RUN_SERVER_FAULT_WORDS);
  // arion's kill switch is a 503 with the code AGENT_DISABLED: paused for everyone, not a fault to retry
  const killSwitch = Object.assign(new Error("x"), { status: 503, body: { error: { code: "AGENT_DISABLED", message: "Nothing ran: the writing is switched off for everyone just now.", status: 503 } } });
  assert.equal(runNowFailure(killSwitch), RUN_PAUSED_WORDS);
  assert.equal(runNowFailure(new Error('ARION API 503: {"error":{"code":"AGENT_DISABLED","message":"Nothing ran.","status":503}}')), RUN_PAUSED_WORDS);
  // a top-level message that is not a sentence never reaches the screen either
  assert.equal(runNowFailure(Object.assign(new Error("x"), { status: 409, body: { message: "No tenant row for {id}" } })), RUN_FAILED_WORDS, "a top-level non-sentence message is not shown");
  const spark500 = Object.assign(new Error('SPARK API 500: {"error":"Internal","message":"connect ECONNREFUSED 127.0.0.1:1433"}'), {});
  assert.equal(runNowFailure(spark500), RUN_SERVER_FAULT_WORDS);
  assert.equal(runNowFailure(new Error("OLIVER API 503: <html>Service Unavailable</html>")), RUN_SERVER_FAULT_WORDS);
  for (const e of [WIRE.ARION_FAULT(), spark500]) {
    assert.equal(/recordset|ECONNREFUSED|1433|Cannot read/.test(runNowFailure(e)), false, "the body never reaches the screen");
  }
  // a 4xx whose body is not the server's words shape
  assert.equal(runNowFailure(Object.assign(new Error("x"), { status: 400, body: { raw: "<html>Bad gateway</html>" } })), RUN_FAILED_WORDS);
  assert.equal(runNowFailure(Object.assign(new Error("x"), { status: 409, body: { error: "not_enabled" } })), RUN_FAILED_WORDS, "a code is not a sentence");
  assert.equal(runNowFailure(Object.assign(new Error("x"), { status: 409, body: { error: { message: "No tenant row for {id}" } } })), RUN_FAILED_WORDS);
  // OLIVER / SPARK refusals in their own shapes
  assert.equal(runNowFailure(new Error('OLIVER API 409: {"error":"halted","message":"It stopped itself. Start it again first."}')), "It stopped itself. Start it again first.");
  assert.equal(runNowFailure(Object.assign(new Error("x"), { status: 422, body: { words: "Say what the campaign is about first." } })), "Say what the campaign is about first.");
  // no answer at all: it may have run
  assert.equal(runNowFailure(new TypeError("Failed to fetch")), RUN_NO_ANSWER_WORDS);
  assert.equal(runNowFailure(Object.assign(new Error("Request to arion-api timed out after 120000ms"), { status: 0, body: null })), RUN_NO_ANSWER_WORDS);
});

test("Run it now, the office administrator (oliver answers 200 for a job that did nothing)", () => {
  const O = WIRE.OLIVER_RUN;
  assert.deepEqual(runResult(O.qtcNotEnabled), { ok: false, words: RUN_OFF_WORDS });
  assert.deepEqual(runResult(O.fieldopsNotEnabled), { ok: false, words: RUN_OFF_WORDS });
  assert.deepEqual(runResult(O.qtcSuiteCeiling), { ok: false, words: RUN_SPEND_LIMIT_WORDS });
  assert.deepEqual(runResult(O.qtcStickyHalt), { ok: false, words: RUN_HALTED_WORDS });
  assert.deepEqual(runResult(O.qtcFailed), { ok: false, words: RUN_FAILED_WORDS });
  assert.deepEqual(runResult(O.fieldopsFailed), { ok: false, words: RUN_FAILED_WORDS }, "never the SQL error");
  assert.deepEqual(runResult(O.qtcDrafted), { ok: true, words: "It has had a look and wrote 2 things for you. They're in Needs you." });
  assert.deepEqual(runResult(O.qtcNothingDue), { ok: true, words: RUN_NOTHING_WORDS });
  assert.deepEqual(runResult(O.fieldopsSuggested), { ok: true, words: "It has had a look and wrote 3 things for you. They're in Needs you." });
});

test("Run it now, the marketer (LUMEN)", () => {
  const S = WIRE.SPARK_RUN;
  assert.deepEqual(runResult(S.jobOff), { ok: false, words: "Win back quiet customers is off, so I did nothing." });
  assert.deepEqual(runResult(S.costCeiling), { ok: false, words: RUN_SPEND_LIMIT_WORDS });
  assert.deepEqual(runResult(S.briefUnreadable), { ok: false, words: "I couldn't read your business details, so I didn't write anything." });
  assert.deepEqual(runResult(S.noCohort), { ok: true, words: RUN_NOTHING_WORDS });
  assert.deepEqual(runResult(S.drafted), { ok: true, words: "It has had a look and wrote 1 thing for you. It's in Needs you." });
});

test("Run it now is offered only for a job that is on, not paused and not stopped (fails closed)", () => {
  assert.equal(canRunNow({ hasRunRoute: true, isOn: true, paused: false, halted: false }), true);
  assert.equal(canRunNow({ hasRunRoute: true, isOn: false, paused: false, halted: false }), false, "an Off job has no Run it now");
  assert.equal(canRunNow({ hasRunRoute: true, isOn: null, paused: false, halted: false }), false, "unknown is not on");
  assert.equal(canRunNow({ hasRunRoute: true, isOn: true, paused: true, halted: false }), false, "paused by its plan");
  assert.equal(canRunNow({ hasRunRoute: true, isOn: true, paused: false, halted: true }), false, "stopped itself");
  assert.equal(canRunNow({ hasRunRoute: false, isOn: true, paused: false, halted: false }), false, "no run route");
});

/* ── runs and counts per job ─────────────────────────────────────────── */

test("runs belong to a job by its key, else by the product's agent; oversight is nobody's", () => {
  const web = ["arion.blog_posts", "arion.social_posts", "arion.review_replies"];
  assert.equal(belongsTo({ job_key: "arion.blog_posts" }, web), true);
  assert.equal(belongsTo({ agent: "content" }, web), true);
  assert.equal(belongsTo({ agent: "governance" }, ["oliver.quote_payment_followups"]), false);
  const runs = [
    { started_at: "2026-10-08T05:41:00Z", agent: "content", job_key: "arion.blog_posts" },
    { started_at: "2026-10-01T05:41:00Z", agent: "content", job_key: "arion.blog_posts" },
    { started_at: "2026-10-07T06:20:00Z", agent: "review_replies" },
  ];
  assert.deepEqual(lastRunByJob(runs, web), { "arion.blog_posts": "2026-10-08T05:41:00Z", "arion.review_replies": "2026-10-07T06:20:00Z" });
  assert.deepEqual(waitingByJob([{ job_key: "arion.blog_posts" }, { job_key: "arion.blog_posts" }, { agent: "review_replies" }], web),
    { "arion.blog_posts": 2, "arion.review_replies": 1 });
});

test("Today: the last 7 days of runs, newest first", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const out = whatIDid([
    { run_id: "a", started_at: "2026-09-20T00:00:00Z", outcome_label: "Old", agent_label: "x" },
    { run_id: "b", started_at: "2026-10-06T00:00:00Z", outcome_label: "Wrote a blog post: waiting for you", agent_label: "x" },
    { run_id: "c", started_at: "2026-10-08T05:00:00Z", outcome_label: "Nothing to do this week", agent_label: "x" },
  ], now);
  assert.deepEqual(out.map((r) => r.words), ["Nothing to do this week", "Wrote a blog post: waiting for you"]);
});

/* ── How much ────────────────────────────────────────────────────────── */

test("a list setting is one per line: a comma stays inside its item", () => {
  const defs = { seed_topics: { label: "Topics", type: "list", max_items: 5, max_len: 80 } };
  assert.deepEqual(varsPayload(defs, { seed_topics: "Mulch, edging and spring clean-ups\nGutters" }),
    { ok: true, vars: { seed_topics: ["Mulch, edging and spring clean-ups", "Gutters"] } });
  assert.deepEqual(varsPayload(defs, { seed_topics: "a\r\nb" }), { ok: true, vars: { seed_topics: ["a", "b"] } });
});

test("a choice setting's options are words, not codes", () => {
  assert.equal(choiceLabel("winback_cohort_source", "auto"), "Pick for me");
  assert.equal(choiceLabel("winback_cohort_source", "job"), "Anyone you've done a job for");
  assert.equal(choiceLabel("winback_cohort_source", "invoice"), "Anyone who has paid an invoice");
  assert.equal(choiceLabel("something_new", "last_visit"), "Last visit");
});

test("When I do it: a locked job never says 'When you ask'", () => {
  assert.equal(whenWords(job({ state: "locked", setting_home: "none", trigger_words: "", lock_words: "Always yours: your logo, colours and voice" })),
    "Always yours: your logo, colours and voice");
  assert.equal(whenWords(job({ state: "locked", setting_home: "none", trigger_words: "", lock_words: null })), NEVER_WORDS);
  assert.equal(whenWords(job({ state: "locked", setting_home: "team", trigger_words: "Every Monday", lock_words: "Always yours." })), "Always yours.",
    "a locked job never shows a trigger, whatever else its row says");
  assert.equal(whenWords(job({ state: "live", setting_home: "none", trigger_words: "", lock_words: null })), NEVER_WORDS);
  assert.equal(whenWords(job({ state: "planned", trigger_words: "" })), NOT_BUILT_WORDS);
  assert.equal(whenWords(job({ trigger_words: "Every Monday" })), "Every Monday");
  assert.equal(whenWords(job({ trigger_words: "" })), "When you ask");
});

test("the owner's limits are checked like the server checks them, in words", () => {
  const defs = {
    posts_per_week: { label: "Posts a week", type: "int", min: 1, max: 3 },
    seed_topics: { label: "Topics to lean towards", type: "list", max_items: 2, max_len: 10 },
    automatic_min_stars: { label: "Answer by itself from", type: "stars", min: 3, max: 5 }, // a stored min below 4 is never trusted
    post_time: { label: "Post at", type: "time" },
    winback_cohort_source: { label: "Count quiet time from", type: "choice", options: ["auto", "job", "invoice"] },
  };
  assert.deepEqual(varsPayload(defs, { posts_per_week: "2", seed_topics: "a\nb", post_time: "10:00", winback_cohort_source: "job" }),
    { ok: true, vars: { posts_per_week: 2, seed_topics: ["a", "b"], post_time: "10:00", winback_cohort_source: "job" } });
  assert.deepEqual(varsPayload(defs, { posts_per_week: "9" }), { ok: false, errors: ["Posts a week must be between 1 and 3."] });
  assert.deepEqual(varsPayload(defs, { automatic_min_stars: "3" }), { ok: false, errors: ["Answer by itself from must be between 4 and 5."] },
    "a review of 3 stars or fewer always waits for you");
  assert.equal(varsPayload(defs, { seed_topics: "a\nb\nc" }).ok, false);
  assert.equal(varsPayload(defs, { seed_topics: "a much longer topic" }).ok, false);
  assert.equal(varsPayload(defs, { post_time: "25:00" }).ok, false);
  assert.equal(varsPayload(defs, { winback_cohort_source: "magic" }).ok, false);
  assert.deepEqual(varsPayload(defs, { nope: "1" }), { ok: false, errors: ["This job has no setting called that."] });
  assert.equal(varText(["a", "b"]), "a\nb");
  assert.equal(varText(null), "");
  assert.equal(varLimitWords(defs.posts_per_week), "From 1 to 3.");
});

/* ── refusals ────────────────────────────────────────────────────────── */

test("a refusal is the server's sentence, and the fallbacks say nothing changed", () => {
  const e = (status, body) => Object.assign(new Error("x"), { status, body });
  assert.equal(teamRefusal(e(409, { words: "This job always asks you first." })), "This job always asks you first.");
  assert.equal(teamRefusal(e(409, { message: "That job isn't built yet." })), "That job isn't built yet.");
  assert.equal(teamRefusal(e(503, {})), UNDECIDED_WORDS);
  assert.equal(teamRefusal(e(403, { error: "Not authorized" })), NOT_ADMIN_WORDS);
  assert.equal(teamRefusal(new TypeError("Failed to fetch")), UNREACHABLE_WORDS);
  assert.equal(teamRefusal(e(400, { error: "Tenant not resolved" })), "That didn't go through, so nothing changed. Try again in a minute.",
    "the account record's internal name never reaches the screen");
  assert.equal(/tenant/i.test(teamRefusal(e(409, { words: "The tenant is wrong" }))), false);
});

test("the team's routes", () => {
  assert.equal(TEAM_PATHS.job("arion.blog_posts"), "/me/team/jobs/arion.blog_posts");
  assert.equal(TEAM_PATHS.jobsOn, "/me/team/jobs?enabled=1");
  assert.equal(TEAM_PATHS.changes("spark.winback"), "/me/team/jobs/spark.winback/changes");
  assert.equal(WAITING_PATHS.arion, "/arion/agents/activity?waiting=1");
  assert.equal(WAITING_PATHS.spark, "/api/v1/agents/activity?waiting=1");
  assert.equal(WAITING_PATHS.oliver, "/agents/activity?waiting=1");
  assert.equal(dayMonth("garbage"), null);
});

/* ── doors ───────────────────────────────────────────────────────────── */

const settings = {
  engine: "ARGUS AI",
  agents: [
    { key: "qtc", label: "", product: "oliver", blurb: "", attribution: "", enabled: true, paused: true, paused_reason: "Spending limit", settings: { quote_followup_days: 3, dunning_days_csv: "3,7,14" } },
    { key: "fieldops", label: "", product: "oliver", blurb: "", attribution: "", enabled: false, settings: { confidence_percent: 35 } },
  ],
};

test("a door reads the home the switch already has", () => {
  assert.deepEqual(doorReads({ kind: "oliver_agent", section: "qtc" }), ["/agents/settings"]);
  assert.deepEqual(doorReads({ kind: "oliver_rule", rule_key: "review_request_after_job" }),
    ["/automations/rules/review_request_after_job", "/automations/runs?rule_key=review_request_after_job&limit=20"]);
  const q = doorState({ kind: "oliver_agent", section: "qtc" }, settings, null, null);
  assert.equal(q.enabled, true);
  assert.equal(q.paused, true);
  assert.deepEqual(q.knobs.map((k) => k.label), ["Chase a quote after", "Remind about an unpaid invoice after"]);
  assert.equal(q.values.quote_followup_days, 3);
  assert.equal(doorState({ kind: "oliver_agent", section: "fieldops" }, settings, null, null).enabled, false);
  const unread = doorState({ kind: "oliver_agent", section: "qtc" }, null, null, null);
  assert.equal(unread.enabled, null, "could not read is not 'off'");
  const rule = doorState({ kind: "oliver_rule", rule_key: "review_request_after_job" }, null, { key: "review_request_after_job", is_enabled: true }, [{ fired_at: "2026-10-07T12:00:00Z", status: "success" }]);
  assert.equal(rule.enabled, true);
  assert.equal(rule.lastSentAt, "2026-10-07T12:00:00Z");
  assert.equal(doorState({ kind: "oliver_rule", rule_key: "x" }, null, null, null).enabled, null);
});

test("a door writes the home with the route it already answers; a rule has only its switch", () => {
  assert.deepEqual(doorWrite({ kind: "oliver_agent", section: "qtc" }, { enabled: true }), { method: "PUT", path: "/agents/settings", body: { qtc: { enabled: true } } });
  assert.deepEqual(doorWrite({ kind: "oliver_agent", section: "fieldops" }, { knob: { field: "confidence_percent", value: 50 } }),
    { method: "PUT", path: "/agents/settings", body: { fieldops: { confidence_percent: 50 } } });
  assert.deepEqual(doorWrite({ kind: "oliver_agent", section: "qtc" }, { resume: true }), { method: "PUT", path: "/agents/settings", body: { qtc: { paused: false } } });
  assert.deepEqual(doorWrite({ kind: "oliver_rule", rule_key: "review_request_after_job" }, { enabled: false }),
    { method: "PATCH", path: "/automations/rules/review_request_after_job", body: { is_enabled: false } });
  assert.equal(doorWrite({ kind: "oliver_rule", rule_key: "review_request_after_job" }, { knob: { field: "x", value: 1 } }), null,
    "a change the rule has no control for sends nothing — never a write that means something else");
  assert.equal(doorWrite({ kind: "oliver_agent" }, { enabled: true }), null, "a door with no section writes nothing (never the Quote-to-Cash switch by guess)");
  assert.equal(doorWrite({ kind: "oliver_agent", section: "elsewhere" }, { enabled: true }), null);
  assert.equal(doorPlace({ kind: "oliver_rule" }), "OLIVER → Jobs → Settings");
  assert.equal(DOOR_KNOBS.fieldops[0].label, "Only name someone when it is at least");
});

/* ── Your business → What your team knows ────────────────────────────── */

const SAVED = {
  industry: null, description: null, tagline: null, targetAudience: null, brandVoice: null, services: null,
  servicesSummary: null, serviceArea: null, capacity: null, capacityNote: null, idealJob: null, idealCustomer: null,
  differentiators: null, noGoList: null, doNotSay: null, rulesPlainText: null, responsePromiseMinutes: null,
  responsePromiseText: null, escalation: null, languages: null,
  offersAllowed: [{ words: "10% off a yearly plan" }, { words: "A free first visit", note: "new customers only" }],
  proofAllowed: [{ words: "Came the same day", from: "Google review, March 2026" }],
  namesNeverMention: ["Smith, Jones & Co"],
  namesYouMayMention: ["Pat Lee"],
  competitors: ["Acme Lawn"],
  customerWords: ["yard clean-up"],
};

test("the six answers round-trip through the form and a page nobody touched sends nothing", () => {
  const d = toDraft(SAVED);
  assert.equal(d.offersAllowedText, "10% off a yearly plan\nA free first visit — new customers only");
  assert.equal(d.proofAllowedText, "Came the same day — Google review, March 2026");
  assert.equal(d.namesNeverMentionText, "Smith, Jones & Co", "a name with a comma stays one name");
  const f = toFields(d);
  assert.deepEqual(f.offersAllowed, SAVED.offersAllowed);
  assert.deepEqual(f.proofAllowed, SAVED.proofAllowed);
  assert.deepEqual(f.namesNeverMention, ["Smith, Jones & Co"]);
  assert.deepEqual(changedFields(SAVED, d), {});
});

test("adding one offer sends that answer alone, in one save", () => {
  const d = { ...toDraft(SAVED), offersAllowedText: "10% off a yearly plan\nA free first visit — new customers only\nFree spring yard check" };
  assert.deepEqual(changedFields(SAVED, d), {
    offersAllowed: [...SAVED.offersAllowed, { words: "Free spring yard check" }],
  });
});

test("an empty list is not set (null), and proof with no source keeps an empty 'from' for the server's sentence", () => {
  const f = toFields({ ...EMPTY_DRAFT, proofAllowedText: "Great work" });
  assert.equal(f.offersAllowed, null);
  assert.equal(f.competitors, null);
  assert.deepEqual(f.proofAllowed, [{ words: "Great work", from: "" }]);
  assert.deepEqual(splitPair("a — b — c"), { head: "a — b", tail: "c" });
  assert.deepEqual(splitPair("plain"), { head: "plain", tail: null });
});

test("the six labels, and a refused save says the label, never the api name", () => {
  assert.equal(FIELD_LABELS.offersAllowed, "Offers you allow");
  assert.equal(FIELD_LABELS.proofAllowed, "Proof you allow");
  assert.equal(FIELD_LABELS.namesNeverMention, "Names never to mention");
  assert.equal(FIELD_LABELS.namesYouMayMention, "Names you may mention (they said yes in writing)");
  assert.equal(FIELD_LABELS.competitors, "Competitors (never named)");
  assert.equal(FIELD_LABELS.customerWords, "Words your customers use");
  assert.equal(
    saveRefusalWords({ rejected: [{ field: "offersAllowed", message: "Write the offer without a dollar amount (for example '10% off a yearly plan')." }] }, "x"),
    "Offers you allow: Write the offer without a dollar amount (for example '10% off a yearly plan').",
  );
  assert.equal(saveRefusalWords({ details: ["namesYouMayMention: 'Pat' is in both lists. Take it out of one."] }, "x"),
    "Names you may mention (they said yes in writing): 'Pat' is in both lists. Take it out of one.");
  assert.equal(saveRefusalWords(null, "Request failed (500)"), "Request failed (500)");
});

test("a failed READ never says nothing changed; the fallback job keys are the product's own", () => {
  const e = (status, body) => Object.assign(new Error("x"), { status, body });
  assert.equal(teamLoadWords(e(404, {})), "Try again in a minute.");
  assert.equal(teamLoadWords(new TypeError("Failed to fetch")), "We couldn't reach the server. Check your connection and try again.");
  assert.equal(teamLoadWords(e(404, { words: "That isn't one of your team." })), "That isn't one of your team.");
  assert.equal(/nothing changed/.test(teamLoadWords(e(500, {}))), false);
  assert.deepEqual(knownJobKeys("web").sort(), ["arion.blog_posts", "arion.review_replies", "arion.social_posts"]);
  assert.deepEqual(knownJobKeys("office").sort(), ["oliver.crew_suggestions", "oliver.quote_payment_followups"]);
});

/* ── the fixer's pins, from the servers' committed answers ───────────── */

test("the employee's standing comes from GET /me/team; GET /me/team/:key carries neither field", () => {
  const emp = WIRE.EMPLOYEE_ANSWER.employee;
  assert.equal("product_owned" in emp, false, "the fixture is the real route: no product_owned on /:employeeKey");
  assert.equal(employeeStanding(emp), "unknown", "the :key answer alone says nothing either way");
  const merged = withStanding(emp, WIRE.TEAM_LIST_NO_ARION.employees);
  assert.equal(merged.product_owned, false);
  const hireJobs = [{ hire_required: true, on_team: false }];
  assert.equal(employeeStanding(merged, hireJobs), "not_owned", "a business without ARION is told to add ARION…");
  assert.notEqual(employeeStanding(merged, hireJobs), "not_on_team", "…never to ask its account contact to add the web person");
  assert.equal(notOwnedWords("web"), "Your web person works on ARION. Add ARION to have them on your team.");
  const marketer = withStanding({ ...emp, employee_key: "marketer", product: "spark" }, WIRE.TEAM_LIST_NO_ARION.employees);
  assert.equal(employeeStanding(marketer, hireJobs), "ok", "on the team (founder grant)");
  const office = withStanding({ ...emp, employee_key: "office", product: "oliver" }, WIRE.TEAM_LIST_NO_ARION.employees);
  assert.equal(employeeStanding(office, hireJobs), "unknown", "plan not readable: nothing is said either way");
  assert.equal(employeeStanding({ product_owned: true, on_team: { yes: false, source: null } }, hireJobs), "not_on_team");
  assert.equal(employeeStanding({ product_owned: true, on_team: { yes: false, source: null } }, [{ hire_required: false, on_team: false }]), "ok",
    "jobs without a hire keep their switches, so there is nothing to say");
  assert.equal(withStanding(emp, null), emp, "the list could not be read: the :key answer as it is");
});

test("a skip-only row (Quote-to-Cash escalated, a crew suggestion that names nobody) gets its Skip button", () => {
  assert.equal(cardKind(WIRE.QTC_ESCALATED_ROW.decide), "skip");
  assert.equal(cardKind(WIRE.FIELDOPS_NOBODY_ROW.decide), "skip");
  assert.equal(isWaitingItem(WIRE.QTC_ESCALATED_ROW), true, "it counts in Needs you, so it must have a button");
  assert.equal(cardKind({ approve: { path: "/a", label: "Approve", edits: [] }, skip: { path: "/s", reason: "optional" } }), "approve");
  assert.equal(cardKind({ publish: { path: "/p", label: "Put it on your website" } }), "publish");
  assert.equal(cardKind({}), "none");
  assert.equal(cardKind(null), "none");
  assert.equal(skipPrompt(WIRE.QTC_ESCALATED_ROW.decide.skip.reason), "Why? (needed)");
  assert.equal(decidePathOk("oliver", WIRE.QTC_ESCALATED_ROW.decide.skip.path), true);
});

test("the Needs-you card never draws the products' attribution line (it names a company and says Agent)", () => {
  for (const r of [WIRE.QTC_ESCALATED_ROW, WIRE.FIELDOPS_NOBODY_ROW]) {
    const shown = cardRow({ ...r, source: "oliver" }, "Quote and payment follow-ups");
    assert.equal(shown.attribution, "");
    assert.equal(shown.agent_label, "from your office administrator · Quote and payment follow-ups");
    assert.equal(/Agent|Created by/.test(JSON.stringify([shown.attribution, shown.agent_label, shown.hold_note])), false);
  }
});

test("a 2xx decision that says it failed is said in rose", () => {
  assert.deepEqual(decisionResult("approve", WIRE.SOCIAL_APPROVE_NOT_SCHEDULED),
    { ok: false, words: "Your social scheduler couldn't be reached, so it isn't scheduled yet. Press Try again." });
  assert.deepEqual(decisionResult("approve", WIRE.SOCIAL_APPROVE_NOT_SCHEDULED_NO_WORDS), { ok: false, words: SCHEDULE_FAILED_WORDS });
  assert.deepEqual(decisionResult("approve", WIRE.SOCIAL_APPROVE_SCHEDULED), { ok: true, words: "Scheduled for 9 Oct 10:00." });
  assert.deepEqual(decisionResult("approve", WIRE.BLOG_APPROVE), { ok: true, words: 'Approved. It goes on your website when you press "Put it on your website".' });
  assert.deepEqual(decisionResult("skip", WIRE.REVIEW_SKIP), { ok: true, words: "Skipped. It won't come back." });
  assert.deepEqual(decisionResult("publish", {}), { ok: true, words: "Sent to your website." });
  assert.equal(decisionResult("approve", { ok: false }).ok, false);
  assert.equal(decisionResult("approve", { data: { failed: true, words: "It didn't go." } }).words, "It didn't go.");
});

test("a switch or mode that is already set: platform-api answers 409 with its sentence, said as the refusal", () => {
  assert.equal(teamRefusal(WIRE.alreadySetError()), WIRE.ALREADY_SET_WORDS);
});

test("the toast follows the server's answer, never the request", () => {
  const asked = { mode: "automatic" };
  const kept = { enabled: true, mode: "review", mode_rule: "either", mode_set_by: null, mode_set_at: null };
  assert.equal(jobWriteWords("Blog posts", asked, kept), "Blog posts will wait for you again.", "the server kept Send me first");
  assert.equal(jobWriteWords("Blog posts", asked, { ...kept, changed: false }), NOTHING_CHANGED_SAVED_WORDS);
  assert.equal(jobWriteWords("Blog posts", asked, { ...kept, mode: "automatic", mode_set_by: "Dana Ruiz", mode_set_at: "2026-10-08T15:00:00Z" }),
    "Blog posts will go out without waiting for you. Approved in advance by Dana Ruiz on 8 Oct.");
  assert.equal(jobWriteWords("Blog posts", asked, { ...kept, enabled: false, mode: "automatic", mode_set_by: "Dana Ruiz" }),
    "Blog posts will go out without waiting for you once it's on. Approved in advance by Dana Ruiz.");
  assert.equal(jobWriteWords("Blog posts", { enabled: true }, { ...kept, enabled: false }),
    "Switched off: Blog posts. It does nothing until you switch it back on.", "the server's switch, not the asked one");
  assert.equal(jobWriteWords("Blog posts", { vars: { posts_per_week: 2 } }, kept), "Saved: Blog posts.");
});

test("a rule door: Last sent is the last run that SENT; a newer skipped or failed run is said as such", () => {
  const st = doorState({ kind: "oliver_rule", rule_key: "review_request_after_job" }, null, { key: "review_request_after_job", is_enabled: true }, WIRE.RULE_RUNS);
  assert.equal(st.lastSentAt, "2026-10-01T10:00:00Z");
  assert.equal(st.lastMissAt, "2026-10-08T10:00:00Z");
  const never = doorState({ kind: "oliver_rule", rule_key: "x" }, null, { key: "x", is_enabled: true }, [WIRE.RULE_RUNS[0]]);
  assert.equal(never.lastSentAt, null, "a skipped run never reads as Last sent");
  assert.match(doorReads({ kind: "oliver_rule", rule_key: "x" })[1], /limit=20$/, "enough runs to find the last one that sent");
});

test("a door's row: not owned says so; a plan refusal is its plain sentence; unread is never shown as off", () => {
  const avail = { ok: false, decided: true, words: "Review asks come with OLIVER Pro.", link: { label: "Plan & Pricing", to: "/app/settings/plan-pricing" } };
  const j = (over = {}) => ({ display_name: "Review asks after a job", available: { ok: true, decided: true }, ...over });
  const notOwned = doorRowView(j(), { enabled: null }, notOwnedWords("office"));
  assert.equal(notOwned.control, "locked");
  assert.equal(notOwned.words, "Your office administrator works on OLIVER. Add OLIVER to have them on your team.");
  assert.equal(notOwned.link.to, "/app/settings/plan-pricing");
  assert.equal(/couldn.t read/.test(notOwned.words), false, "a business without OLIVER is not told something failed");
  assert.deepEqual(doorRowView(j(), { enabled: null }, null), { control: "unread", words: "We couldn't read whether Review asks after a job is on just now. Open the page again to retry." });
  assert.deepEqual(doorRowView(j({ available: avail }), { enabled: false }, null), { control: "locked", words: avail.words, link: avail.link });
  assert.deepEqual(doorRowView(j({ available: avail }), { enabled: true }, null), { control: "switch", canSwitchOn: false, gate: { words: avail.words, link: avail.link } },
    "on but no longer allowed: it can still be switched off");
  assert.deepEqual(doorRowView(j(), { enabled: false }, null), { control: "switch", canSwitchOn: true, gate: null });
  assert.equal(doorRefusalWords(WIRE.tierNotMetError(), j({ available: avail })), "Review asks come with OLIVER Pro.");
  const plain = doorRefusalWords(WIRE.tierNotMetError(), j());
  assert.equal(/Automation rule|tier_not_met|review_request_after_job/.test(plain), false, plain);
  assert.equal(doorRefusalWords({ type: "tier_gate", tierRequired: "pro" }, j({ available: avail })), avail.words);
  const other = Object.assign(new Error("OLIVER API 409: {}"), { status: 409, body: { message: "That switch is already on." } });
  assert.equal(doorRefusalWords(other, j()), "That switch is already on.");
});

test("the page's load-failure line is said once", () => {
  const e = (status, body) => Object.assign(new Error("x"), { status, body });
  assert.equal(employeeLoadWords("web", e(500, { error: "We couldn't load your team just now. Try again in a minute.", message: "We couldn't load your team just now. Try again in a minute." })),
    "We couldn't load your team just now. Try again in a minute.");
  assert.equal(employeeLoadWords("web", e(404, {})), "We couldn't load your web person's jobs. Try again in a minute.");
  assert.equal(employeeLoadWords("office", new TypeError("Failed to fetch")),
    "We couldn't load your office administrator's jobs. We couldn't reach the server. Check your connection and try again.");
});

test("ARION → Reviews says the web person answers reviews only while the job is on", () => {
  assert.equal(reviewRepliesIntro(true), "Your web person writes a reply to each new review in your voice.");
  assert.equal(/^Your web person writes/.test(reviewRepliesIntro(false)), false);
  assert.equal(/^Your web person writes/.test(reviewRepliesIntro(null)), false);
});
