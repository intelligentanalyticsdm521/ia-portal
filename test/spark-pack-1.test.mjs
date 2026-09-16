// SPARK pack 1 — "no client sees a stub" (2026-09-08), Portal half.
//
// Source assertions, like the rest of this suite: each one names the thing that
// was on the screen before it, because that is what a regression would put back.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(SRC, rel));

/**
 * The file with its COMMENTS REMOVED.
 *
 * Every "this must no longer appear" assertion below runs against this, not the
 * raw file — because the change these tests pin is exactly the one that leaves a
 * comment behind saying what used to be there and why it went. Asserting over the
 * raw text makes a good comment fail the test the comment exists to explain, and
 * the only way to pass it is deleting the explanation.
 */
function code(rel) {
  // LINE comments first, then block comments. The other order eats the file: a
  // `//` comment mentioning a path like `/lifecycle/*` contains the characters
  // `/*`, and the block pass then swallows everything from there to the next
  // `*/` — 9KB of SparkLifecyclePage, in the case that found this.
  return read(rel)
    .replace(/^[ \t]*\/\/.*$/gm, "")      // whole-line // comments
    .replace(/\/\*[\s\S]*?\*\//g, "");    // block comments, JSX {/* */} included
}

/* ══ item 1 — the Lead Gen gate is the server's allow-list ═════════════════ */

test("no Portal file gates Lead Gen on who you are any more", () => {
  const sites = [
    "App.tsx", "components/SidebarNav.tsx", "components/GlobalSearch.tsx",
    "pages/ServiceRouter.tsx", "components/AppShell.tsx",
  ];
  for (const rel of sites) {
    const s = read(rel);
    if (!s.includes("LEADGEN_LOCKED_KEYS") && !s.includes("spark/leadgen")) continue;
    // The Lead Gen decision must not read isFounder. (AppShell and ServiceRouter
    // still use isFounder for the CONSULTING keys, which is correct — so the
    // assertion is about the Lead Gen expression, not the file.)
    const leadgenLines = s.split("\n").filter((l) => /LEADGEN_LOCKED_KEYS|spark\/leadgen/.test(l));
    for (const line of leadgenLines) {
      assert.ok(!/isFounder/.test(line), `${rel}: Lead Gen must not be gated on isFounder — ${line.trim()}`);
    }
  }
});

test("the search routes are behind RequireLeadgenRoute; the founder ADMIN is not", () => {
  const app = read("App.tsx");
  assert.match(app, /<Route path="spark\/leadgen" element=\{<RequireLeadgenRoute \/>\}>/);
  // /app/admin/leadgen is the term-review queue and the block list — internal
  // tooling, and it keeps the founder gate.
  assert.match(app, /<Route path="admin\/leadgen" element=\{<RequireFounderRoute \/>\}>/);
});

test("the access hook fails CLOSED while unresolved, and says why in the file", () => {
  const hook = read("hooks/useLeadgenAccess.ts");
  assert.match(hook, /\/api\/v1\/leadgen\/access/);
  assert.match(hook, /allowed: boolean \| null/);
  // The one place in the nav that does NOT fail open, with the reason written down.
  assert.match(hook, /CLOSED WHILE UNRESOLVED/);
  assert.match(hook, /console\.error/, "a failed fetch must not be swallowed");
  const guard = read("app/RequireLeadgenRoute.tsx");
  assert.match(guard, /if \(allowed === null\) return null;/,
    "unresolved must hold the frame, not bounce somebody off a page they can use");
});

/* ══ item 2 — the texting banners ══════════════════════════════════════════ */

test("the three 'may go to a stub until v1.1' banners are gone", () => {
  for (const rel of ["pages/spark/SparkSmsTemplatesPage.tsx", "pages/spark/SparkSmsCampaignsPage.tsx"]) {
    const s = code(rel);
    assert.doesNotMatch(s, /ComingSoonBanner/, `${rel} must not carry a Coming Soon banner`);
    assert.doesNotMatch(s, /stub/i);
    assert.doesNotMatch(s, /v1\.1/);
    assert.match(s, /TextingOffNotice/, `${rel} must read the one honest sentence`);
  }
  // The third was on the SMS Inbox page, which is deleted (item 3).
  assert.equal(exists("pages/spark/SparkSmsInboxPage.tsx"), false);
});

test("the honest sentence comes from the server, and names the real reason", () => {
  const notice = code("components/spark/TextingOffNotice.tsx");
  assert.match(notice, /useSmsCapability/);
  assert.match(notice, /if \(enabled !== false \|\| !reason\) return null;/,
    "it must render nothing when texting is on, and nothing while unresolved");
  // No wording of its own: one sentence, from the gate that stops the send.
  assert.doesNotMatch(notice, /Coming Soon|v1\.|Beta/i);
  const hook = read("hooks/useSmsCapability.ts");
  assert.match(hook, /\/api\/v1\/sms\/capability/);
});

/* ══ item 3 — one inbox ════════════════════════════════════════════════════ */

test("nothing routes to, links to or names the deleted SMS Inbox page", () => {
  assert.equal(exists("pages/spark/SparkSmsInboxPage.tsx"), false);
  const router = code("pages/ServiceRouter.tsx");
  assert.doesNotMatch(router, /SparkSmsInboxPage/);
  // A bookmark lands somewhere real rather than on "Service not found".
  assert.ok(router.includes("if (serviceKey === 'spark_sms_inbox')"), "the old route must be handled");
  const redirect = router.slice(router.indexOf("if (serviceKey === 'spark_sms_inbox')"), router.indexOf("if (serviceKey === 'spark_sms_inbox')") + 200);
  assert.match(redirect, /spark_lead_inbox" replace/,
    "and it must land on the inbox texts actually arrive in");
  const catalog = code("config/serviceCatalog.ts");
  assert.doesNotMatch(catalog, /key: 'spark_sms_inbox'/);
  const subnav = code("components/SubNav.tsx");
  assert.doesNotMatch(subnav, /key: "spark_sms_inbox"/);
  const tour = code("components/GuidedTour.tsx");
  assert.doesNotMatch(tour, /spark_sms_inbox/, "a tour step pointing at a deleted page stops the tour dead");
  const intents = code("components/argus/argusIntents.ts");
  assert.doesNotMatch(intents, /to: "\/app\/services\/spark_sms_inbox"/);
  assert.match(intents, /Open Lead Inbox/, "the assistant must send people where texts actually are");
});

test("the parked shared-line texts have a screen", () => {
  const page = read("pages/settings/PhoneTextingSettingsPage.tsx");
  assert.match(page, /\/api\/v1\/conversations\/unassigned/);
  assert.match(page, /Texts we could not match to anyone/);
  // Nothing to reply to: the section must not offer one.
  const bare = code("pages/settings/PhoneTextingSettingsPage.tsx");
  const section = bare.slice(bare.indexOf("Texts we could not match"), bare.indexOf("QuietHoursCard"));
  assert.ok(section.length > 100, "the section has to be there for this to mean anything");
  // There is nobody to reply TO, so the section carries no control at all —
  // asserted on the markup, not on the word, because the copy explains why.
  assert.doesNotMatch(section, /<button/, "an unmatched text has no action available");
  assert.doesNotMatch(section, /<textarea|<input/);
});

/* ══ item 4 — the Lead Inbox is universal ══════════════════════════════════ */

test("no nav row hides a business's own leads behind the Leads add-on", () => {
  const subnav = read("components/SubNav.tsx");
  const rows = subnav.split("\n").filter((l) => /key: "spark_lead_(inbox|sources)"/.test(l));
  assert.equal(rows.length, 2, "both rows must still exist");
  for (const r of rows) assert.ok(!/addon:/.test(r), `must not be add-on gated: ${r.trim()}`);
  // And the add-on itself is gone, because nothing declares it.
  const nav = code("components/navVisibility.ts");
  assert.match(nav, /export type NavAddon = "seo";/);
  assert.doesNotMatch(nav, /leadgen: "the Lead Gen add-on"/);
  const addons = code("hooks/useNavAddons.ts");
  assert.doesNotMatch(addons, /"leadgen" as NavAddon/, "handing out an add-on nothing declares is dead code");
});

/* ══ item 6 — Contact 360 opens from everywhere ════════════════════════════ */

test("Contact 360 reads the URL and no longer asks for a database id", () => {
  const p = code("pages/spark/SparkContact360Page.tsx");
  assert.doesNotMatch(p, /Contact ID/, "nobody knows their contact id");
  assert.doesNotMatch(p, /function lookup\(/);
  assert.match(p, /const contactId = \/\^\\d\+\$\/\.test\(urlId\)/, "derived from the URL, not copied into state");
  assert.match(p, /Open this from a person/, "the empty state must say where to open it from");
});

test("the three places that know a contact id link to it", () => {
  const modal = read("components/spark/SparkLeadModal.tsx");
  assert.match(modal, /spark_contact_360\?id=\$\{lead\.contact_id\}/);
  const contacts = read("pages/spark/SparkContactsPage.tsx");
  // `c.customer_id` since 2026-09-16: the list is the MIXED customer list and a
  // row's id is `customer_id`. The assertion still means "the row links to the
  // person it already knows the id of", which is what it was written for.
  assert.match(contacts, /spark_contact_360\?id=\$\{c\.customer_id\}/);
  const smsCampaigns = code("pages/spark/SparkSmsCampaignsPage.tsx");
  assert.match(smsCampaigns, /spark_contact_360\?id=\$\{s\.contact_id\}/);
  assert.doesNotMatch(smsCampaigns, /spark_contacts\?id=/,
    "that URL pointed a per-person link at a list page that ignores the id");
});

/* ══ item 8 — insights never invent numbers for a real business ════════════ */

test("the insights hook reports loading, error, empty and ready as different things", () => {
  const hook = read("hooks/useProductInsightsPayload.ts");
  for (const st of ['"loading"', '"error"', '"empty"', '"ready"']) {
    assert.ok(hook.includes(st), `missing state ${st}`);
  }
  assert.doesNotMatch(code("hooks/useProductInsightsPayload.ts"), /catch \s*\{\s*\}/,
    "the empty catch that turned every failure into null must not come back");
  assert.match(hook, /console\.error/, "a failed fetch must be reported, not turned into null");
});

test("the three SPARK insight pages never fall back to demo data on their own", () => {
  for (const rel of [
    "pages/spark/SparkIAInsightsTrendsPage.tsx",
    "pages/spark/SparkIAInsightsIntelligencePage.tsx",
    "pages/spark/SparkIAInsightsHealthPage.tsx",
  ]) {
    const s = code(rel);
    // The exact expression that used to draw a year of invented history.
    assert.doesNotMatch(s, /payload \|\| demoSparkMetrics/, `${rel}: the silent fallback is back`);
    assert.doesNotMatch(s, /sparkPayload \|\| demoSparkMetrics/, `${rel}: the silent fallback is back`);
    // Every demo path is behind the dev-only flag AND labelled.
    assert.match(s, /insightsDemoAllowed\(\)/, `${rel} must gate demo data on the dev flag`);
    // The USAGE, not the import: deleting <SampleDataBadge /> and leaving the
    // import line kept this green while the label was gone (mutation check).
    assert.match(s, /<SampleDataBadge \/>/, `${rel} must RENDER the sample-data label`);
    assert.match(s, /InsightsEmpty/, `${rel} must have an honest empty state`);
    assert.match(s, /InsightsError/, `${rel} must distinguish "we could not load" from "you have nothing"`);
  }
});

test("the demo flag has TWO locks and production has neither", () => {
  const flag = read("components/insights/insightsDemo.ts");
  assert.match(flag, /env\.DEV/, "a production bundle must not be able to render a sample number");
  assert.match(flag, /VITE_INSIGHTS_DEMO/);
  assert.match(flag, /if \(!env\.DEV\) return false;/);
});

test("the empty state names what fills it, and every link is a real service key", () => {
  const sources = read("components/insights/sparkInsightSources.ts");
  const catalog = read("config/serviceCatalog.ts");
  const routes = [...sources.matchAll(/to: '(\/app\/services\/[a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(routes.length >= 3, "an empty state that says 'no data' and nothing else is a dead end");
  for (const r of routes) {
    const key = r.split("/").pop();
    assert.ok(catalog.includes(`key: '${key}'`), `${r} is not a registered service key`);
  }
});

/* ══ item 9 — AI Writer is the real API ════════════════════════════════════ */

test("the AI Writer page calls the metered endpoints and prints no price of its own", () => {
  const p = code("pages/spark/SparkAiWriterPage.tsx");
  for (const ep of ["/ai-writer/pricing", "/ai-writer/generate-email", "/ai-writer/suggest-subject",
                    "/ai-writer/improve-copy", "/ai-writer/draft"]) {
    assert.ok(p.includes(ep), `missing call to ${ep}`);
  }
  // The old placeholder's copy, all of it untrue.
  assert.doesNotMatch(p, /provisioning pending/i);
  assert.doesNotMatch(p, /coming with v2|Coming Soon/i);
  assert.doesNotMatch(p, /1 credit = \$0\.10/);
  assert.doesNotMatch(p, /credits\/mo/);
  assert.doesNotMatch(p, /credits: \d/, "a price typed into the page is a price that drifts from the list");
  // Prices come from the payload.
  assert.match(p, /pricing\?\.charging/);
  assert.match(p, /c\?\.priced/);
  // And it is in nav again, because it works.
  const subnav = read("components/SubNav.tsx");
  assert.match(subnav, /key: "spark_ai_writer".*minTier: "business"/);
});

/* ══ item 11 — the webhooks page ═══════════════════════════════════════════ */

test("the Webhooks page is the existing API, not a promise", () => {
  const p = code("pages/spark/SparkWebhooksPage.tsx");
  assert.doesNotMatch(p, /ComingSoonBanner/);
  assert.doesNotMatch(p, /SPARK v1\.5/);
  for (const ep of ["/api/v1/webhook-subscriptions"]) assert.ok(p.includes(ep));
  assert.match(p, /known_events/, "the event list must come from the server");
  assert.match(p, /\/test`/, "Send test");
  assert.match(p, /\/deliveries\?limit=/, "the delivery log");
  // Reveal-once, said plainly.
  assert.match(p, /cannot see it again/i);
  assert.match(p, /signing_secret/);
  const catalog = read("config/serviceCatalog.ts");
  const row = catalog.split("\n").find((l) => l.includes("key: 'spark_webhooks'"));
  assert.ok(row && !row.includes("coming_soon"), "the catalog row must stop saying coming_soon");
});

/* ══ item 13 — the disabled lifecycle option ═══════════════════════════════ */

test("the greyed-out 'Coming soon' lifecycle option is removed, not disabled", () => {
  const p = code("pages/spark/SparkLifecyclePage.tsx");
  assert.doesNotMatch(p, /on_counter_reply", label:/);
  assert.doesNotMatch(p, /Auto when they reply with changes/);
  assert.doesNotMatch(p, /Coming soon/i);
  assert.doesNotMatch(p, /disabled: true/);
  // The type keeps the value so an already-saved row still round-trips.
  assert.match(p, /negotiation_trigger: "manual" \| "on_counter_reply" \| null/);
});

/* ══ item 10 — the checklist has a surface, and every row links ════════════ */

test("the onboarding checklist is rendered somewhere, and drops rows it cannot open", () => {
  const card = read("components/spark/SparkSetupChecklist.tsx");
  assert.match(card, /\/api\/v1\/onboarding\/checklist/);
  assert.match(card, /steps\.filter\(\(s\) => !!s\.route\)/,
    "a row that names a task and cannot open it is a to-do list item");
  assert.match(card, /if \(outstanding\.length === 0\) return null;/, "it must disappear when it is done");
  const overview = read("pages/spark/SparkOverviewPage.tsx");
  assert.match(overview, /<SparkSetupChecklist \/>/);
});
