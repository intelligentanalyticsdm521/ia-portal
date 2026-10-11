// SPARK pack 2 — the Portal half.
//
// WHAT THESE PIN
//
//   Conversations       the page exists, is in the nav beside the Lead Inbox,
//                       and the Lead Inbox links to it — because the whole
//                       point is that a conversation which never became a lead
//                       now has somewhere to be.
//   Dashboards          every widget in the default layout has a READER; the
//                       "widget renderer pending" banner is gone; and loading,
//                       error and empty are three different things on screen.
//   Reputation Hub      back in the nav, and it never says "posted" on its own
//                       — the page renders what the API said actually happened.
//   SPARK Social        the page is DELETED, the nav row is gone, the catalog
//                       row is gone, and the route redirects rather than 404s.
//   My Brand            the four halves that need no vendor are `enabled`; the
//                       five that do stay `coming_soon` with a sentence that
//                       names the step rather than a date.
//
// SOURCE-LEVEL, like the Portal's other guard files: what is worth pinning is
// that the page says the true thing, and that is a property of the file.
//
// MUTATION-TESTED by scripts/dev/spark-pack-2-mutation-check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

/** Strip //-comments and block comments so a test cannot pass on a comment. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const subnav = read("components/SubNav.tsx");
const catalog = read("config/serviceCatalog.ts");
const router = read("pages/ServiceRouter.tsx");
const conversations = read("pages/spark/SparkConversationsPage.tsx");
const dashboards = read("pages/spark/SparkDashboardsPage.tsx");
const widgets = read("components/spark/dashboardWidgets.ts");
const reviews = read("pages/spark/SparkReviewsPage.tsx");
const leadInbox = read("pages/spark/SparkLeadInboxPage.tsx");

/* ══ Conversations ═════════════════════════════════════════════════════════ */

test("the Conversations page exists, routes, and is in the nav beside the Lead Inbox", () => {
  assert.ok(fs.existsSync(path.join(SRC, "pages/spark/SparkConversationsPage.tsx")));
  assert.match(router, /case 'spark_conversations': sparkPage = <SparkConversationsPage \/>; break;/);
  assert.match(subnav, /key: "spark_conversations", label: "Conversations"/);
  // Ordered next to the inbox it feeds.
  const inboxAt = subnav.indexOf('key: "spark_lead_inbox"');
  const convAt = subnav.indexOf('key: "spark_conversations"');
  assert.ok(inboxAt > 0 && convAt > inboxAt && convAt - inboxAt < 800);
});

test("the Lead Inbox offers the way through to everything that is NOT a lead", () => {
  assert.match(leadInbox, /\/app\/services\/spark_conversations/);
});

test("Conversations is UNIVERSAL — no add-on, no tier gate", () => {
  const row = subnav.split("\n").find((l) => l.includes('key: "spark_conversations"')) || "";
  assert.equal(/addon:/.test(row), false, "a business's own texts and chats are not something they buy from us");
  assert.equal(/minTier:/.test(row), false);
  assert.equal(/hidden: true/.test(row), false);
});

test("the page reads the ONE inbox endpoint, and replies through the ONE reply route", () => {
  assert.match(conversations, /\/api\/v1\/conversations\/inbox\?/);
  assert.match(conversations, /\/api\/v1\/conversations\/inbox\/counts/);
  assert.match(conversations, /conversations\/inbox\/\$\{[\w.]+\}\/\$\{[\w.]+\}\/reply/);
  // It does NOT reach for a per-lead route, which would only work for the
  // conversations that already became leads.
  assert.equal(/\/leads\/\$\{[^}]+\}\/sms\/reply/.test(conversations), false);
});

test("the page shows the refusal REASON rather than swallowing it", () => {
  assert.match(conversations, /cannot_reply_message/);
  assert.match(conversations, /setSendError\(msg\)/);
  // The SEND path specifically must not swallow. (Two other catches ARE
  // deliberate no-ops — a failed badge refresh and a failed assignment — and
  // each carries a written reason, which is the sanctioned shape.)
  const start = conversations.indexOf("const send = useCallback");
  const send = conversations.slice(start, conversations.indexOf("}, [detail", start));
  assert.match(send, /catch \(e\) \{/, "the send path catches the refusal");
  assert.match(send, /setSendError\(msg\);/, "and puts it in front of the owner");
  assert.equal(/catch\s*(\(\w+\))?\s*\{\s*\}/.test(send), false, "never silently");
});

test("no unread state is invented in the browser", () => {
  // The counts come from the API. A page that counted rows itself would
  // disagree with the badge the moment paging kicked in.
  assert.match(conversations, /get<\{ data: Counts \}>\("\/api\/v1\/conversations\/inbox\/counts"\)/);
  assert.equal(/rows\.filter\(\(r\) => r\.unread\)\.length/.test(conversations), false);
});

/* ══ Dashboards ════════════════════════════════════════════════════════════ */

test("the 'widget renderer pending' banner is gone, in both places it appeared", () => {
  // Comments stripped: the file's own header explains the defect it closed,
  // and a test that failed on the explanation would be a test that punished
  // writing one down.
  const code = stripComments(dashboards);
  assert.equal(/ComingSoonBanner/.test(code), false);
  assert.equal(/Widget renderer pending/.test(code), false);
  assert.equal(/layout shape and source endpoint/.test(code), false);
});

test("every default widget has a reader, by construction", () => {
  // The old default layout named /contacts/count and /campaigns/count, which
  // have never existed. The defaults are now BUILT from the catalogue.
  assert.match(dashboards, /DEFAULT_WIDGET_SOURCES\.map\(\(source\) =>/);
  const sources = [...widgets.matchAll(/source: "([^"]+)"/g)].map((m) => m[1]);
  const defaults = [...widgets.matchAll(/^\s{2}"(\/api\/v1\/[^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(defaults.length >= 5, "the default layout is not empty");
  for (const d of defaults) {
    assert.ok(sources.includes(d), `default widget ${d} has no reader`);
  }
  assert.equal(sources.includes("/api/v1/contacts/count"), false, "that endpoint has never existed");
});

test("loading, error and empty are three different things", () => {
  assert.match(dashboards, /useState<"loading" \| "ready" \| "error" \| "unsupported">/);
  assert.match(dashboards, /state === "error"/);
  assert.match(dashboards, /problem on our side, not with your account/);
  // A failed fetch must NOT fall through to a number.
  assert.match(dashboards, /\.catch\(\(\) => \{[\s\S]{0,200}setState\("error"\)/);
});

test("a widget we cannot read says so rather than drawing a zero", () => {
  assert.match(dashboards, /state === "unsupported"/);
  assert.match(dashboards, /we do not have a reader for/);
});

test("a real zero is a real answer, and a missing one is not", () => {
  // metric == null → the empty note. metric === 0 → the number 0.
  assert.match(dashboards, /value\.metric == null \?/);
  assert.match(widgets, /return null;\s*\n\}/);
});

/* ══ Reputation Hub ════════════════════════════════════════════════════════ */

test("the Reputation Hub is back in the nav", () => {
  const row = subnav.split("\n").find((l) => l.includes('key: "spark_reviews"')) || "";
  assert.ok(row, "the row exists");
  assert.equal(/hidden: true/.test(row), false, "a business with SPARK and no ARION had no reputation surface");
});

test("the page never says 'posted' on its own", () => {
  // The old banner promised v1.1 publishing while the route stamped a date.
  assert.equal(/ComingSoonBanner/.test(reviews), false);
  assert.equal(/ships\s*\n?\s*with v1\.1/.test(reviews), false);
  // Three states, from the API's own answer.
  assert.match(reviews, /response_source_status === "published"/);
  assert.match(reviews, /response_source_status === "failed"/);
  assert.match(reviews, /Posted on Google/);
  assert.match(reviews, /Saved — not posted/);
  assert.match(reviews, /Saved here/);
});

test("what can be published is asked BEFORE anybody types", () => {
  assert.match(reviews, /\/api\/v1\/reviews\/publishing/);
  assert.match(reviews, /capability\?\.can_publish/);
  // And the sentence comes from the server, not a second copy here.
  assert.match(reviews, /\{capability\.message\}/);
});

/* ══ the SPARK Social Scheduler is DELETED ═════════════════════════════════ */

test("the page, the nav row and the catalog row are all gone", () => {
  assert.equal(fs.existsSync(path.join(SRC, "pages/spark/SparkSocialPage.tsx")), false);
  assert.equal(/key: "spark_social",/.test(subnav), false);
  assert.equal(/key: 'spark_social',/.test(catalog), false);
  assert.equal(/SparkSocialPage/.test(router), false);
});

test("the old address redirects rather than saying 'Service not found'", () => {
  assert.match(router, /if \(serviceKey === 'spark_social'\) \{[\s\S]{0,200}my_brand_calendar/);
});

test("nothing in the Portal still calls the deleted API", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const code = stripComments(fs.readFileSync(p, "utf8"));
        if (/\/api\/v1\/social-(accounts|posts)/.test(code)) offenders.push(path.relative(SRC, p));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, []);
});

/* ══ My Brand, in two halves ═══════════════════════════════════════════════ */

function catalogRow(key) {
  return catalog.split("\n").find((l) => l.includes(`{ key: '${key}',`)) || "";
}

// 2026-10-11: live / coming soon is the feature catalog's availability
// (platform-api db/seed/feature_catalog.json), no longer a column on these
// rows. Both halves are live pages there (the menu shows Social Hub and
// Social Content); the channel half says in its own words what it waits on.
test("the image and design half is live", () => {
  for (const key of ["my_brand_image_studio", "my_brand_voice", "my_brand_templates", "my_brand_assets"]) {
    const row = catalogRow(key);
    assert.ok(row, `${key} row missing`);
    assert.doesNotMatch(row, /defaultStatus|coming_soon/, `${key} states no status of its own`);
  }
});

test("the channel half stays off, and each row NAMES the step rather than a date", () => {
  for (const key of ["my_brand_social_channels", "my_brand_compose", "my_brand_calendar",
    "my_brand_social_content", "my_brand_social_report"]) {
    const row = catalogRow(key);
    assert.ok(row, `${key} row missing`);
    assert.match(row, /approv|connect/i, `${key} says what it waits on`);
    assert.equal(/v1\.1|v2|next (month|quarter)|later this year/.test(row), false,
      `${key} must not promise a version or a date`);
  }
  // At least one of them says WHY, in the client's words.
  assert.match(catalogRow("my_brand_social_channels"), /approve our app/);
});
