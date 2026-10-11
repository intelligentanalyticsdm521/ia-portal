// ARGUS → Your team, the screens (contract CONTRACT_ARGUS_EMPLOYEES_PHASE1_2026-10-08
// §F, §E.2, §F.5, §H.5). Source-pinned: which page each route lands on, which
// old route redirects where, what each control calls, the words, and that
// nothing on these screens names a business.
//
// The pure half (every sentence, every request body) is test/argus-team-lib.
//
// MUTATIONS: node scripts/dev/argus-team-mutation-check.mjs (every line must say RED).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments, screenWords } from "./helpers/screenWords.mjs";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const page = read("src/pages/argus/ArgusEmployeePage.tsx");
const jobRow = read("src/components/argus/team/JobRow.tsx");
const drawer = read("src/components/argus/team/JobDrawer.tsx");
const list = read("src/components/argus/team/NeedsYouList.tsx");
const cardSrc = read("src/components/argus/team/NeedsYouCard.tsx");
const voice = read("src/components/argus/team/LearnedVoice.tsx");
const doors = read("src/components/argus/team/doors.ts");
const lib = read("src/lib/team.ts");
const useTeam = read("src/hooks/useTeam.ts");
const useNeeds = read("src/hooks/useNeedsYou.ts");
const workflows = read("src/pages/argus/ArgusWorkflowsPage.tsx");
const router = read("src/pages/ServiceRouter.tsx");
const catalog = read("src/config/serviceCatalog.ts");
const subnav = read("src/components/SubNav.tsx");
const settingsRoutes = read("src/pages/settings/SettingsRoutes.tsx");
const yourBusiness = read("src/pages/settings/YourBusinessPage.tsx");
const responder = read("src/pages/settings/ResponderSettingsPage.tsx");
const reviews = read("src/arion/pages/business/BusinessReviews.tsx");
const arionApi = read("src/lib/arionApi.ts");
const arionCtx = read("src/arion/useArionContext.ts");
const platformApi = read("src/lib/platformApi.ts");
const guide = read("src/journeys/content/argusPages.ts");
const approvalCard = read("src/components/agents/AgentApprovalCard.tsx");

/* ── where it lives ──────────────────────────────────────────────────── */

test("three employee pages in the catalog, all the same page", () => {
  for (const [key, name] of [["argus_team_web", "The web person"], ["argus_team_marketer", "The marketer"], ["argus_team_office", "The office administrator"]]) {
    assert.match(catalog, new RegExp(`\\{ key: '${key}', displayName: '${name}', section: 'ARGUS', route: '/app/services/${key}'`));
  }
  assert.match(router, /const ArgusEmployeePage = lazyNamed\(\(\) => import\('\.\/argus\/ArgusEmployeePage'\), 'ArgusEmployeePage'\);/);
  assert.match(router, /const teamEmployee = employeeFromServiceKey\(service\.key\);/);
  assert.match(router, /<ArgusEmployeePage key=\{teamEmployee\} employeeKey=\{teamEmployee\} \/>/);
});

test("the menu: a 'Your team' group first in ARGUS, with the three plain names; no Agents entries anywhere", () => {
  const argus = subnav.slice(subnav.indexOf("const ARGUS_NAV"), subnav.indexOf("export const SUB_NAV_CONFIGS"));
  const team = argus.indexOf('label: "Your team"');
  assert.ok(team > 0 && team < argus.indexOf('label: "Workflows"'), "Your team is the first ARGUS group");
  assert.match(argus, /\{ key: "argus_team_web",\s+label: "The web person",\s+route: "\/app\/services\/argus_team_web" \}/);
  assert.match(argus, /\{ key: "argus_team_marketer", label: "The marketer",\s+route: "\/app\/services\/argus_team_marketer" \}/);
  assert.match(argus, /\{ key: "argus_team_office",\s+label: "The office administrator", route: "\/app\/services\/argus_team_office" \}/);
  assert.equal(/key: "(arion|oliver|spark)_agents"/.test(subnav), false);
  assert.equal(/_agents"\)\) return "settings_/.test(subnav), false);
  assert.equal(/key: '(arion|oliver|spark)_agents'/.test(catalog), false);
  assert.equal(/\/app\/services\/(arion|oliver|spark)_agents/.test(settingsRoutes), false, "the Settings index has no Agents tiles");
});

test("the three old Agents routes redirect to the employee who does that work, before the catalog lookup", () => {
  assert.match(router, /arion_agents: 'argus_team_web',/);
  assert.match(router, /spark_agents: 'argus_team_marketer',/);
  assert.match(router, /oliver_agents: 'argus_team_office',/);
  const redirect = router.indexOf("if (serviceKey && OLD_AGENTS_PAGES[serviceKey])");
  assert.ok(redirect > 0, "the redirect exists");
  assert.ok(redirect < router.indexOf("  if (!service) {"), "it runs before 'Service not found' (the old catalog rows are gone)");
});

test("the router calls every hook before its first redirect (one instance redirects, then renders)", () => {
  // Found on the dev pane 8 Oct: /oliver_agents → /argus_team_office kept the
  // same ServiceRouterInner, which had returned <Navigate> before its catalog
  // useMemo; the next render had one more hook and React drew nothing.
  const inner = router.slice(router.indexOf("function ServiceRouterInner()"));
  const lookup = inner.indexOf("const service: PortalService | null = useMemo(");
  const firstReturn = inner.indexOf("return <Navigate");
  assert.ok(lookup > 0 && lookup < firstReturn, "the catalog useMemo sits above the first early return");
  const body = inner.slice(firstReturn, inner.indexOf("\nfunction ", 10) > 0 ? inner.indexOf("\nfunction ", 10) : undefined);
  assert.equal(/\buse(Memo|State|Effect|Callback|Ref)\(/.test(body), false, "no hook after an early return");
  assert.match(router, /return <Navigate to=\{`\/app\/services\/\$\{OLD_AGENTS_PAGES\[serviceKey\]\}`\} replace \/>;/);
});

test("each employee page has its page guide", () => {
  for (const k of ["argus_team_web", "argus_team_marketer", "argus_team_office"]) assert.match(guide, new RegExp(`${k}: \\{`));
});

/* ── the employee page ───────────────────────────────────────────────── */

test("Back is the first thing top left, and pops one level: the drawer, else Workflows", () => {
  const ret = page.slice(page.indexOf("  return (\n    <OliverPageWrapper"));
  const firstButton = ret.indexOf("<button");
  assert.ok(firstButton > 0 && firstButton < ret.indexOf("<header"), "Back comes before the header");
  assert.match(ret.slice(firstButton, firstButton + 200), /onClick=\{back\}/);
  assert.match(page, /const back = \(\) => \(openJobKey \? closeJob\(\) : navigate\(WORKFLOWS_ROUTE\)\);/);
});

test("five tabs, in the URL; the open job is in the URL too", () => {
  assert.match(lib, /\{ key: "today", label: "Today" \},\s*\{ key: "needs-you", label: "Needs you" \},\s*\{ key: "jobs", label: "Jobs" \},\s*\{ key: "history", label: "History" \},\s*\{ key: "know", label: "What I know" \},/);
  assert.match(page, /const tab = employeeTabFrom\(params\.get\("tab"\)\);/);
  assert.match(page, /const openJobKey = params\.get\("job"\);/);
  assert.match(page, /\{t\.key === "needs-you" \? `Needs you \(\$\{myRows\.length\}\)` : t\.label\}/);
});

test("the header: the name, the job line, '{n} need you'", () => {
  assert.match(page, /const name = employee\?\.display_name \|\| EMPLOYEE_NAME\[employeeKey\];/);
  assert.match(page, /\{employee\?\.job_line && <p/);
  assert.match(page, /const need = needCountWords\(myRows\.length\);/);
});

test("show, don't hide: the product not owned and not on the team each say so once", () => {
  assert.match(page, /\{productNotOwnedWords\(employeeKey\)\}/);
  assert.match(page, /to=\{PLAN_PRICING_ROUTE\}/);
  assert.match(page, /\{notOnTeamWords\(employeeKey\)\}/);
  // The two lines are decided from GET /me/team (the only answer with
  // product_owned / on_team), merged onto GET /me/team/:key — see argus-team-lib.
  assert.match(page, /setEmployee\(withStanding\(emp\.employee, listed\)\);/);
  assert.match(page, /const standing = employeeStanding\(employee, jobs\);/);
  assert.match(page, /const notOwned = standing === "not_owned";/);
  assert.match(page, /const notOnTeam = standing === "not_on_team";/);
  assert.match(useTeam, /const list = useCallback\(async \(\) => getTeam\(await params\(\)\), \[params\]\);/);
});

test("a business without the product: its doors and its History say so, never 'couldn't read'", () => {
  assert.match(page, /const row = doorRowView\(job, state, standing === "not_owned" \? productNotOwnedWords\(employeeKey\) : null\);/);
  assert.match(page, /\{runsError && !notOwned && \(/);
  assert.match(page, /emptyBody=\{notOwned\s*\? productNotOwnedWords\(employeeKey\)/);
  assert.match(jobRow, /\{view\.control === "locked" && \(/);
  assert.match(jobRow, /\{view\.control === "unread" && \(/);
  assert.match(page, /setDoorRefusal\(\(r\) => \(\{ \.\.\.r, \[job\.job_key\]: doorRefusalWords\(err, job\) \}\)\);/, "a door's refusal is a plain sentence");
});

test("one load on arrival; the learned voice on its first open; no polling", () => {
  assert.match(page, /await Promise\.all\(\[\s*team\.employee\(employeeKey\),\s*team\.list\(\)[^\n]*\n\s*loadRuns\(\), loadSettings\(\),\s*\]\)/);
  assert.match(page, /if \(!ready \|\| tab !== "know" \|\| employeeKey !== "web" \|\| voiceAsked\.current\) return;/);
  for (const [name, src] of [["page", page], ["useNeedsYou", useNeeds], ["useTeam", useTeam], ["JobDrawer", drawer]]) {
    assert.equal(/setInterval\s*\(/.test(stripComments(src)), false, `${name} must not poll`);
  }
  assert.match(useTeam, /return useMemo\(\(\) => \(\{ ready, list, employee, jobsOn, putJob, changes \}\)/, "a stable api object");
});

test("Today: what I did, and the first three that need you, each opening Needs you", () => {
  assert.match(page, /const did = whatIDid\(myRuns\);/);
  assert.match(page, /myRows\.slice\(0, 3\)\.map/);
  assert.match(page, /onClick=\{\(\) => setTab\("needs-you"\)\}/);
});

test("Jobs: every row through JobRow, with its last run, its count, the halted line, Run it now and the door", () => {
  assert.match(page, /<JobRow\s+key=\{job\.job_key\}/);
  assert.match(page, /lastDidIso=\{lastRun\[job\.job_key\] \|\| null\}/);
  assert.match(page, /needCount=\{waitingCount\[job\.job_key\] \|\| 0\}/);
  assert.match(page, /halted=\{haltedFor\(job\)\}/);
  assert.match(page, /onRunNow=\{call \? \(\) => void runNow\(job\) : null\}/);
  assert.match(page, /door=\{doorFor\(job\)\}/);
});

test("Run it now: what came of it is green only when it worked, rose otherwise; the button follows canRunNow", () => {
  assert.match(page, /const result = runResult\(out\);\s*if \(result\.ok\) setNotice\(result\.words\);\s*else setPageAlert\(result\.words\);/);
  assert.equal(/setNotice\(runResult/.test(page), false);
  assert.match(jobRow, /const canRun = canRunNow\(\{ hasRunRoute: !!onRunNow, isOn, paused: st\.paused, halted: !!halted, problem: job\.problem \}\);/);
  assert.match(jobRow, /\{canRun && \(/);
});

test("Run it now refused or broken: the page says runNowFailure's sentence, never the server's body", () => {
  const body = page.slice(page.indexOf("const runNow = async"), page.indexOf("const saveFounderKnob"));
  assert.match(body, /\} catch \(err\) \{\s*(?:\/\/[^\n]*\n\s*)*setPageAlert\(runNowFailure\(err\)\);/);
  assert.equal(/apiErrorMessage\(/.test(body), false, "a 500's text never reaches the alert through apiErrorMessage");
});

test("On, but it can't read its job description: the row and the drawer say the server's sentence in rose", () => {
  // The row: one ProblemLine, rose, role=alert, drawn from jobRowState's problemLine.
  assert.match(jobRow, /export function ProblemLine\(\{ words \}: \{ words: string \}\) \{\s*return \(\s*<div className="[^"]*bg-rose-50[^"]*text-rose-800[^"]*" role="alert" data-job-problem>\s*<AlertTriangle[^>]*\/>\s*<span>\{words\}<\/span>/);
  assert.match(jobRow, /\{st\.problemLine && !hideSwitch && <ProblemLine words=\{st\.problemLine\} \/>\}/, "on the switch, wherever the switch is shown");
  assert.match(jobRow, /\{st\.control === "door" && st\.problemLine && <ProblemLine words=\{st\.problemLine\} \/>\}/, "on a door job's row too");
  // The drawer: the same sentence at the top, rose, role=alert.
  assert.match(drawer, /const problem = jobProblem\(job\);/);
  assert.match(drawer, /\{problem && \(\s*<div className="[^"]*bg-rose-50[^"]*text-rose-800[^"]*" role="alert" data-job-problem>\s*<AlertTriangle[^>]*\/>\s*<span>\{problem\}<\/span>/);
});

test("What I never do: the drawer shows the server's sentences as sent and writes none of its own", () => {
  assert.match(drawer, /\{pb\.never\.length \? <ul className="space-y-0\.5">\{pb\.never\.map\(\(w, i\) => <li key=\{i\}>· \{w\}<\/li>\)\}<\/ul>/);
  assert.equal(/never to mention|competitor|proof you allow|is enforced/i.test(stripComments(drawer)), false,
    "no rule sentence is written in the Portal: whether a list is empty is the server's to say");
});

test("Run it now: the runners' own routes; campaign from a brief asks one line in the app's dialog", () => {
  assert.match(page, /const call = runNowCall\(job\.job_key, brief\);/);
  assert.match(page, /if \(call\.asksBrief && !brief\) \{ setAskingBrief\(job\.job_key\); return; \}/);
  assert.match(page, /title="What should it be about\?"/);
  assert.match(page, /<NameBlockDialog/);
  assert.equal(/(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/.test(stripComments(page)), false);
});

test("the founder's knobs show only for the founder, on the web person's Jobs tab", () => {
  assert.match(page, /\{employeeKey === "web" && isFounder && contentAgent && \(/);
  assert.match(page, /saveFounderKnob\(\{ price_usd_monthly:/);
  assert.match(page, /saveFounderKnob\(\{ keyword_provider: e\.target\.value \}\)/);
});

test("What I know: the answers the live jobs read, set or not set, each linked to its box", () => {
  assert.match(page, /const know = knowFields\(jobs\);/);
  assert.match(page, /<Link to=\{briefFieldRoute\(f\.field\)\} className="font-semibold underline">Change it<\/Link>/);
  assert.match(page, /\{employeeKey === "web" && <LearnedVoice voice=\{voice\} \/>\}/);
  assert.match(voice, /What I&apos;ve learned about your writing/);
  assert.equal(existsSync(path.join(ROOT, "src/components/argus/team/LearnedVoice.tsx")), true);
});

/* ── the job row and the switch ──────────────────────────────────────── */

test("the row decides through jobRowState; the mode select exists only when it says so (M19)", () => {
  assert.match(jobRow, /const st = jobRowState\(job\);/);
  assert.match(jobRow, /\{st\.modeControl && !hideMode \? \(/);
  assert.match(jobRow, /<option value="automatic" disabled=\{!!st\.automaticLine\}>Automatic<\/option>/);
  assert.match(jobRow, /<option value="review">Send me first<\/option>/);
  assert.match(jobRow, /disabled=\{busy \|\| st\.switchLocked\}/);
});

test("one writer: the switch and the mode PUT /me/team/jobs/:key and show what the server answered", () => {
  assert.match(jobRow, /const out = await writer\.write\(job, patch\);/);
  assert.match(jobRow, /if \(out\.ok\) \{\s*onChanged\(out\.job\);/);
  assert.equal((stripComments(jobRow).match(/onChanged\(/g) || []).length, 1,
    "the row changes only to what the server answered — never an optimistic guess first");
  assert.match(useTeam, /const next = await team\.putJob\(job\.job_key, patch\);/);
  assert.match(platformApi, /return teamRequest<JobView & \{ changed\?: boolean \}>\(params, `\/me\/team\/jobs\/\$\{encodeURIComponent\(params\.jobKey\)\}`, \{\s*method: 'PUT',/);
  assert.match(useTeam, /return \{ ok: true, job: next, words: jobWriteWords\(job\.display_name, patch, next\) \};/, "the toast is built from the server's answer");
  assert.equal(/setJobs\(\(list\) => list\.map\(\(j\) => \(j\.job_key === job\.job_key \? \{ \.\.\.j, enabled/.test(page), false, "no optimistic switch");
});

test("a refusal shows in rose on the row; the green notice is only for what worked", () => {
  assert.match(jobRow, /setRefusal\(out\.words\);/);
  assert.match(jobRow, /bg-rose-50[^"]*" role="alert">\s*<AlertTriangle[^>]*\/>\s*<span>\{refusal\}<\/span>/);
});

test("the drawer: When I do it, the steps, allowed / never, How much, what it reads, the version, runs, notes", () => {
  for (const t of ["When I do it", "The steps", "What I'm allowed to do", "What I never do", "How much",
    "What I read about your business", "Last 20 runs", "Notes and activity"]) {
    assert.match(drawer, new RegExp(`title="${t}"`), t);
  }
  assert.match(drawer, /versionLine\(pb\)/);
  assert.match(drawer, /const checked = varsPayload\(defs, only\);/);
  assert.match(drawer, /const out = await writer\.write\(job, \{ vars: checked\.vars \}\);/);
  assert.match(drawer, /loadChanges\(job\.job_key\)/);
  assert.match(drawer, /<DoorKnobs knobs=\{door\.state\.knobs\}/, "a door job shows its door's knobs");
});

test("doors write the home OLIVER already has, never the team table", () => {
  assert.match(page, /if \(w\.method === "PUT"\) setSettings\(await fns\.current\.oliver\.put<AgentSettingsResponse>\(w\.path, w\.body\)\);/);
  assert.match(page, /else setRule\(await fns\.current\.oliver\.patch<DoorRule>\(w\.path, w\.body\)\);/);
  assert.match(doors, /return \{ method: "PUT", path: "\/agents\/settings", body: \{ \[section\]: patch \} \};/);
});

/* ── Needs you ───────────────────────────────────────────────────────── */

test("Needs you asks each product's own endpoint at once, and a failure is never silent (M20)", () => {
  assert.match(useNeeds, /const settled = await Promise\.allSettled\(list\.map\(\(s\) => fetchSource\(s\)\)\);/);
  assert.match(useNeeds, /const merged = mergeNeedsYou\(list\.map\(\(s, i\) => sourceResult\(s, settled\[i\]\)\)\);/);
  assert.match(useNeeds, /setFailures\(merged\.failures\);/);
  assert.match(list, /\{failures\.map\(\(f\) => \(/);
  assert.match(list, />\s*Try again\s*</);
});

test("each button calls the route the row names, after checking it belongs to that product", () => {
  assert.match(useNeeds, /if \(!decidePathOk\(source, path\)\) \{/);
  assert.match(useNeeds, /approveBody\(row\.source, d\.approve\.path, d\.approve, input\.edits \|\| null, input\.scheduledFor\)/);
  assert.match(arionApi, /if \(!decidePathOk\('arion', params\.path\)\) \{/);
  assert.match(useNeeds, /const result = decisionResult\(which, out\);/, "a 2xx that says it failed is not said in green");
});

test("the card answers four things before any button, and says which Brief it was written from", () => {
  assert.match(cardSrc, /const shown = cardRow\(row, jobName\);/, "the products' attribution line is blanked (lib cardRow)");
  assert.equal(/row\.attribution/.test(stripComments(cardSrc)), false, "the card never draws row.attribution");
  assert.match(cardSrc, /row=\{shown\}/);
  assert.match(cardSrc, /approveLabel=\{approve\.label\}/);
  assert.match(cardSrc, /const cited = briefCitedLine\(row\.brief_cited\);/);
  assert.match(cardSrc, /secondaryLabel="Skip"/);
  assert.match(cardSrc, /declinePrompt=\{skipPrompt\(d\.skip\?\.reason\)\}/);
  assert.match(cardSrc, /declineNoteOptional=\{d\.skip\?\.reason !== "required"\}/);
  assert.match(cardSrc, /requireEditsToApprove=\{!approveAllowed\(approve, false\)\}/);
  assert.match(cardSrc, /const \[when, setWhen\] = useState\(\(\) => tomorrowAtTen\(\)\);/);
  assert.match(cardSrc, /type="datetime-local"/);
  assert.equal(/approve all/i.test(stripComments(cardSrc + list + page + workflows)), false, "no approve-all for anything that reaches a customer");
});

test("a row whose only decision is Skip has a Skip button wired to the row's skip route", () => {
  assert.match(cardSrc, /const kind = cardKind\(d\);/);
  const branch = cardSrc.slice(cardSrc.indexOf('if (kind === "skip" && d.skip) {'), cardSrc.indexOf('if (kind !== "approve" || !d.approve) {'));
  assert.ok(branch.length > 100, "the skip-only branch exists, before the no-buttons branch");
  assert.match(branch, /void run\("skip", \{ reason: r \}\)/);
  assert.match(branch, /disabled=\{skipBusy \|\| \(required && !reason\.trim\(\)\)\}/, "a required reason is required");
  assert.match(branch, /placeholder=\{skipPrompt\(d\.skip\.reason\)\}/);
  assert.match(branch, /<Trash2 className="h-3 w-3" \/>Skip/);
});

test("a social post's time picker shows while editing too: Save & approve never uses a hidden time", () => {
  const editing = approvalCard.slice(approvalCard.indexOf("{editing ? ("), approvalCard.indexOf(") : (\n          <>"));
  assert.ok(editing.length > 50);
  assert.match(editing, /\{extra\}\s*<button\s*onClick=\{\(\) => \{ onApprove\(row, \{ subject, body \}\); setEditing\(false\); \}\}/);
  assert.match(cardSrc, /extra=\{extra\}/);
});

test("the drawer's When I do it and choice options are words", () => {
  assert.match(drawer, /\{whenWords\(job\)\}/);
  assert.match(drawer, /<option key=\{o\} value=\{o\}>\{choiceLabel\(name, o\)\}<\/option>/);
  assert.match(reviews, /\{reviewRepliesIntro\(job \? job\.enabled : null\)\}/);
  assert.equal(/Used by:<\/span> your agents/.test(yourBusiness), false, "Your business never says agents");
});

/* ── ARGUS → Workflows ───────────────────────────────────────────────── */

test("All: one row per switched-on job, made by whom, with the same controls; Open goes to the employee", () => {
  assert.match(workflows, /const r = await team\.jobsOn\(\);/);
  assert.match(workflows, /<span>· \{madeByWords\(j\.employee_key\)\}<\/span>/);
  assert.match(workflows, /<JobControls job=\{j\} onChanged=\{replaceJob\} onNotice=\{setNotice\} \/>/);
  assert.match(workflows, /<Link to=\{employeeRoute\(j\.employee_key, "jobs"\)\}[^>]*>Open<\/Link>/);
});

test("a business without SPARK still sees its jobs and its team's Needs you", () => {
  assert.match(workflows, /\{!loading && tab === "all" && \(\s*<div className="mb-3 space-y-3">/, "the job rows are not behind noSpark");
  assert.match(workflows, /\{!loading && tab === "needs-you" && \(\s*<div className="mb-3">\s*<NeedsYouList/, "nor is the team's Needs you");
  assert.match(workflows, /chips=\{\{ picked, onPick: pick \}\}/);
  assert.match(workflows, /const needsCount = needsYou\.length \+ needs\.rows\.length;/, "the tab count is the sum");
});

/* ── doors in place: the Responder and ARION → Reviews ───────────────── */

test("Settings → The Responder: draft and send-by-itself are the inquiry-reply job's switch and mode", () => {
  assert.match(responder, /const reply = useTeamJob\('marketer', 'spark\.inquiry_reply'\);/);
  assert.match(responder, /<JobControls job=\{reply\.job\} hideMode onChanged=\{reply\.setJob\} onNotice=\{setJobNotice\} \/>/);
  assert.match(responder, /<JobControls job=\{reply\.job\} hideSwitch onChanged=\{reply\.setJob\} onNotice=\{setJobNotice\} \/>/);
});

test("ARION → Reviews: the review-reply job's switch, mode and star limit; the old auto-reply is gone", () => {
  assert.match(reviews, /const reply = useTeamJob\('web', 'arion\.review_replies'\);/);
  assert.match(reviews, /<JobControls job=\{job\} onChanged=\{reply\.setJob\} onNotice=\{setNotice\} \/>/);
  assert.match(reviews, /writer\.write\(job, \{ vars: \{ automatic_min_stars: n \} \}\)/);
  for (const [name, src] of [["BusinessReviews", reviews], ["arionApi", arionApi], ["useArionContext", arionCtx]]) {
    assert.equal(/GbpAutoReply|reviews\/auto-reply/.test(src), false, `${name} must not keep the old auto-reply`);
  }
});

/* ── Your business → What your team knows ────────────────────────────── */

test("the six answers are a new section on the same page, each with its anchor, saved by the one Save", () => {
  assert.match(yourBusiness, /<h2 className="text-base font-semibold text-gray-900">What your team knows<\/h2>/);
  for (const f of ["offersAllowed", "proofAllowed", "namesNeverMention", "namesYouMayMention", "competitors", "customerWords"]) {
    assert.match(yourBusiness, new RegExp(`<div id="${f}">`), `${f} has its anchor`);
    assert.match(yourBusiness, new RegExp(`label=\\{FIELD_LABELS\\.${f}\\}`), `${f} uses its label`);
  }
  assert.equal((yourBusiness.match(/updateBusinessProfile\(/g) || []).length, 1, "one Save for the whole page");
  for (const f of ["services", "servicesSummary", "serviceArea", "brandVoice", "doNotSay", "noGoList", "idealCustomer", "differentiators", "responsePromiseText"]) {
    assert.match(yourBusiness, new RegExp(`ids=\\{\\[[^\\]]*'${f}'`), `"Change it" for ${f} has somewhere to land`);
  }
  assert.match(yourBusiness, /const el = document\.getElementById\(decodeURIComponent\(hash\.slice\(1\)\)\);/);
  assert.match(yourBusiness, /saveRefusalWords\(body, \(e as Error\)\.message\)/);
});

/* ── the words, and no business named ────────────────────────────────── */

const SCREENS = [
  "src/pages/argus/ArgusEmployeePage.tsx",
  "src/components/argus/team/JobRow.tsx",
  "src/components/argus/team/JobDrawer.tsx",
  "src/components/argus/team/NeedsYouList.tsx",
  "src/components/argus/team/NeedsYouCard.tsx",
  "src/components/argus/team/LearnedVoice.tsx",
  "src/components/argus/team/doors.ts",
  "src/lib/team.ts",
];

test("the words checklist: no jargon, no account-record word, no vendor or model name", () => {
  const slices = [
    yourBusiness.slice(yourBusiness.indexOf("What your team knows — ARGUS"), yourBusiness.indexOf("Borrowed basics, for completeness")),
    responder.slice(responder.indexOf("Your marketer's job: Replies"), responder.indexOf("How you want it to sound")),
    reviews.slice(reviews.indexOf("function ReviewRepliesCard"), reviews.indexOf("function Stars")),
    guide.slice(guide.indexOf("argus_team_web:"), guide.indexOf("argus_settings:")),
  ];
  // The extractor reads JSX text between > and <, which also catches a TypeScript
  // generic spanning code (get<{ … }>(…) … get<); those fragments are code, not words.
  const isCode = (w) => /;\s*\n|\bawait\b|\)\)\.|: [A-Z][A-Za-z]+(\[\])? \| null;/.test(w);
  const words = [...SCREENS.map(read), ...slices].flatMap(screenWords).filter((w) => !isCode(w));
  assert.ok(words.some((w) => w.includes("What I know about your business")), "the extractor must see the page's words");
  assert.ok(words.some((w) => w.includes("What your team knows")));
  const BANNED = /\b(tenant|playbooks?|skills?|agents?|guardrails?|JSON|toggle|queue|runner|escalated)\b|anthropic|claude|openai|gpt-|gemini|sonnet|haiku|opus|llama/i;
  assert.deepEqual(words.filter((w) => BANNED.test(w)), []);
});

test("no business is named and no id is written in this build's code", () => {
  const BAD = /Intelligent Analytics|intelligentanalyticsdm|ia-dm\.com|Web Design|Website audit|walkthrough|Des Moines|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const NEW = [...SCREENS, "src/hooks/useTeam.ts", "src/hooks/useNeedsYou.ts"];
  for (const f of NEW) {
    const hit = stripComments(read(f)).split("\n").find((l) => BAD.test(l));
    assert.equal(hit, undefined, `${f}: ${hit}`);
  }
  // Shared files this build changed: every hit must be one that was there before
  // this build (findings, not this build's to fix), named here exactly.
  const PRE_EXISTING = [
    'placeholder="We clean and repair gutters for homes across the Des Moines metro."',
    'placeholder="Ankeny, Des Moines"',
    "Intelligent Analytics only</h2>",
    '"https://intelligentanalyticsdm.com/forge",',
    "xxx.customer.ia-dm.com",
    "whether Intelligent Analytics manages this account",
    // arionApi.ts, since b6086bb (2026-04-19): an example in a trailing comment on a type.
    '// long: "Google USA · Des Moines, Iowa · EN"',
  ];
  for (const f of [
    "src/pages/settings/YourBusinessPage.tsx", "src/pages/settings/ResponderSettingsPage.tsx",
    "src/arion/pages/business/BusinessReviews.tsx", "src/pages/argus/ArgusWorkflowsPage.tsx",
    "src/pages/ServiceRouter.tsx", "src/components/SubNav.tsx", "src/config/serviceCatalog.ts",
    "src/pages/settings/SettingsRoutes.tsx", "src/lib/businessProfileForm.ts", "src/lib/chatWorkflows.ts",
    "src/components/agents/AgentApprovalCard.tsx", "src/components/agents/types.ts",
    "src/journeys/content/argusPages.ts", "src/lib/platformApi.ts",
    // Changed by this build too (contract §0.2: every file the build adds or changes).
    "src/lib/arionApi.ts", "src/arion/useArionContext.ts",
  ]) {
    const hits = stripComments(read(f)).split("\n").filter((l) => BAD.test(l));
    for (const h of hits) {
      assert.ok(PRE_EXISTING.some((p) => h.includes(p)), `${f} gained a business name or an id: ${h.trim()}`);
    }
  }
});

test("the guard itself catches a name (presence)", () => {
  const BAD = /Intelligent Analytics|Des Moines|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.equal(BAD.test(stripComments('const x = "Des Moines";')), true);
  assert.equal(BAD.test(stripComments("const id = '6f616b42-0ed8-571e-823f-ee4aca6b7ce9';")), true);
  assert.equal(BAD.test(stripComments("// Intelligent Analytics in a comment\nconst y = 1;")), false);
});
