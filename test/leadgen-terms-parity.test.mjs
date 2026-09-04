// The in-app Lead Use Terms and the canonical markdown must say the same thing.
//
// Growth D21 added §10 (aggregate learning — the L5 wording approved in
// DECISIONS_QUEUE.md) and §11 (Intake sources) to BOTH
// src/pages/spark/SparkLeadGenTermsPage.tsx and
// overnight-report/LEADGEN_CLIENT_TERMS_v1.md. Two copies of a legal text drift
// the moment somebody edits one of them, and the drift is invisible: the page
// still renders, the markdown still reads well, and only a client comparing
// them ever finds out.
//
// This asserts PRESENCE, not absence (feedback_assert_presence_not_just_absence):
// the exact sentences must APPEAR, in the page and in the markdown, and the
// version and effective date on the page must match the markdown's header. A
// test that only checked "the page has eleven sections" would pass on an empty
// §11.
//
// The markdown lives in the docs tree, not in this repo, so the cross-document
// half runs when that tree is on disk and says loudly when it is not. The
// in-repo half — the page carries these exact sentences — always runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "src", "pages", "spark", "SparkLeadGenTermsPage.tsx");

// Candidate homes for the canonical markdown, relative to this worktree.
const MARKDOWN_CANDIDATES = [
  join(ROOT, "..", "..", "claude code", "overnight-report", "LEADGEN_CLIENT_TERMS_v1.md"),
  join(ROOT, "..", "..", "..", "claude code", "overnight-report", "LEADGEN_CLIENT_TERMS_v1.md"),
];

const VERSION = "1.1";
const EFFECTIVE_PAGE = "September 5, 2026";
const EFFECTIVE_MD = "2026-09-05";

// The sentences under contract. Written once here; the page and the markdown
// are both measured against this, so neither is the source of truth for the
// other and a one-sided edit fails.
const SECTIONS = [
  {
    id: "10",
    pageHeading: "10. Aggregate learning",
    mdHeading: "## 10. Aggregate learning",
    sentences: [
      "We learn from anonymised, aggregated results across our clients — for example how often leads from a source become jobs in your industry — to improve scoring and suggestions for everyone.",
      "Nothing that identifies you, your customers or your leads leaves your account, and this data is never sold or shared.",
    ],
  },
  {
    id: "11",
    pageHeading: "11. Leads from platforms you connect",
    mdHeading: "## 11. Leads from platforms you connect",
    sentences: [
      "You can connect the platforms you already use — for example Google lead forms, Local Services Ads, Facebook and Instagram lead forms, your Google Business Profile, and your own website forms — so the leads they produce arrive in your Lead Inbox.",
      "We receive only what the connected platform sends for the accounts you connect: the person's name and contact details, what they asked for, their answers to that form's own questions, and the platform's own identifier for the lead.",
      "We use it only to deliver that lead to you and to run the features you have turned on: matching it against leads you already have so you are not called twice about the same job, scoring it, labelling where it came from, and drafting a reply where you enabled that.",
      "It is your data. We do not sell it, we do not share it with another client, and we never add it to the pool of businesses we find for anyone else.",
      "You are the controller of these records and you remain the sender of anything you send in reply (section 5).",
      "You can disconnect a platform at any time and the flow stops; ask us and we delete what we already received.",
    ],
  },
];

/**
 * Reduce rendered prose to comparable text: strip JSX tags, decode the handful
 * of entities this page uses, collapse the line breaks JSX introduces for
 * formatting. Markdown gets the same treatment so `**bold**` and a `<strong>`
 * compare equal.
 */
function normalise(src) {
  return src
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const pageSrc = readFileSync(PAGE, "utf8");
const pageText = normalise(pageSrc);

const markdownPath = MARKDOWN_CANDIDATES.find((p) => existsSync(p)) || null;
const markdownText = markdownPath ? normalise(readFileSync(markdownPath, "utf8")) : null;

test("the page carries the §10 and §11 sentences word for word", () => {
  for (const section of SECTIONS) {
    // The heading is a JSX attribute (<Section title="…">), so it is checked
    // against the raw source — normalise() strips tags and takes attributes
    // with them.
    assert.ok(
      pageSrc.includes(`title="${section.pageHeading}"`),
      `the page is missing <Section title="${section.pageHeading}">`,
    );
    for (const sentence of section.sentences) {
      assert.ok(
        pageText.includes(normalise(sentence)),
        `the page is missing this §${section.id} sentence:\n  ${sentence}`,
      );
    }
  }
});

test("the page's version and effective date were bumped with the new sections", () => {
  assert.match(pageSrc, new RegExp(`const VERSION = "${VERSION}"`),
    `the page must declare VERSION "${VERSION}" — new sections without a version bump are invisible to a client`);
  assert.match(pageSrc, new RegExp(`const EFFECTIVE = "${EFFECTIVE_PAGE}"`),
    `the page must declare EFFECTIVE "${EFFECTIVE_PAGE}"`);
});

test("the canonical markdown carries the same §10 and §11 sentences", (t) => {
  if (!markdownText) {
    return t.skip(
      "overnight-report/LEADGEN_CLIENT_TERMS_v1.md is not on disk from this worktree — "
      + `looked in:\n  ${MARKDOWN_CANDIDATES.join("\n  ")}`,
    );
  }
  for (const section of SECTIONS) {
    assert.ok(
      markdownText.includes(normalise(section.mdHeading)),
      `${markdownPath} is missing "${section.mdHeading}"`,
    );
    for (const sentence of section.sentences) {
      assert.ok(
        markdownText.includes(normalise(sentence)),
        `${markdownPath} is missing this §${section.id} sentence:\n  ${sentence}`,
      );
    }
  }
});

test("the markdown header shows the same version and effective date as the page", (t) => {
  if (!markdownText) return t.skip("canonical markdown not on disk from this worktree");
  assert.ok(markdownText.includes(`v${VERSION}, effective ${EFFECTIVE_MD}`),
    `the markdown header must read "v${VERSION}, effective ${EFFECTIVE_MD}" so the two documents cannot claim different versions`);
});

test("§10 is the approved L5 wording, not a paraphrase", () => {
  // The one sentence Brandon approved (DECISIONS_QUEUE L5, drafted at
  // SCOPE_IL_LEARNING_2026-09-04.md D5). Pinned separately from the loop so a
  // future edit to it is a deliberate, visible change to an approved text.
  const approved = "We learn from anonymised, aggregated results across our clients — for example how often leads from a source become jobs in your industry — to improve scoring and suggestions for everyone. Nothing that identifies you, your customers or your leads leaves your account, and this data is never sold or shared.";
  assert.ok(pageText.includes(normalise(approved)), "the page's §10 is not the approved L5 wording");
  if (markdownText) {
    assert.ok(markdownText.includes(normalise(approved)), "the markdown's §10 is not the approved L5 wording");
  }
});

test("§11 does not promise a product that does not exist yet", () => {
  // SCOPE_GROWTH_GAPS Block D6 also drafted a household (consumer) records
  // section. B2C is the October build and nothing can be bought today, so it
  // is deliberately NOT in these terms. If it appears here without the product,
  // the terms describe something a client cannot have.
  assert.ok(!/household records/i.test(pageText),
    "household (consumer) records belong in the terms when the B2C product ships, not before");
});
