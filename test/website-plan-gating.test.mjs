// test/website-plan-gating.test.mjs — what a business's PLAN lets them add.
//
// D-157 (DECISIONS_QUEUE, 2026-09-17), Brandon: "ARION Lite plan does not get
// elementor pro so we need to lock down some of those widgets based on their
// specific plan."
//
// What this pins:
//   1. THE ANSWER IS THE SERVER'S — the plan is READ off the reply the builder
//      already makes on open, never decided in the Portal. A second table here
//      would be a second answer, and the first time the two disagreed a client
//      would be locked out of something they pay for.
//   2. A LITE BUSINESS CANNOT INSERT A PRO WIDGET, AND A STANDARD ONE CAN.
//   3. THE LOCK IS VISIBLE AND IN PLAIN WORDS — the row stays in the picker
//      and says why; a hidden row is indistinguishable from a bug.
//   4. BOTH DOORS — the pane's insert and the gallery's place go through the
//      same gate, because only one of them is the picker.
//
// MUTATION CHECKS — each made red on purpose on 2026-09-17, then restored:
//   · `readSitePlan` ignores `available: false`      → "a Lite business" red
//   · `lockFor` always answers null                  → "a Lite business" red
//   · delete the `lockFor` call in `insertWidget`    → "both doors" red
//   · `DEFAULT_LOCK` names the page engine's vendor  → "plain words" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  readSitePlan, lockFor, canAdd, pickerLock, EMPTY_PLAN, DEFAULT_LOCK,
} from "../src/builder/adapters/website/sitePlan.ts";
// THE THREE SENTENCES live in ONE module, shared by the website's sections and
// the engine's widgets (catalogue G.4, conformance 2026-09-17).
import { PLAN_SENTENCE, ownershipSentence, widgetLock } from "../src/builder/tier.ts";

const SRC = path.join(process.cwd(), "src", "builder", "adapters", "website");
const BUILDER = readFileSync(path.join(SRC, "WebsiteBuilder.tsx"), "utf8");

/**
 * The reply arion-api makes on open, as both plans see it.
 *
 * Byte for byte the shape `routes/arion/pages.js` sends: `sections[]` from
 * `sectionCatalog({ allowPro })` — which carries `tier`, `available` and
 * `unavailableReason` — plus the single `elementorProAvailable`.
 */
const LITE_REPLY = {
  elementorProAvailable: false,
  sections: [
    { kind: "hero", label: "Banner", blurb: "…", tier: "free", available: true, unavailableReason: null },
    { kind: "services", label: "Services", blurb: "…", tier: "free", available: true, unavailableReason: null },
    {
      kind: "contact",
      label: "Contact",
      blurb: "…",
      tier: "pro",
      available: false,
      unavailableReason: "Available on ARION Standard and above. This section includes a form, and a form needs a plan above Lite — or choose a layout without a form.",
    },
  ],
};

const STANDARD_REPLY = {
  elementorProAvailable: true,
  sections: LITE_REPLY.sections.map((s) => ({ ...s, available: true, unavailableReason: null })),
};

describe("the plan comes off the server's own reply", () => {
  test("a Lite business gets the locked kind and the sentence the server sent", () => {
    const plan = readSitePlan(LITE_REPLY);
    assert.equal(plan.proAvailable, false);
    assert.deepEqual(Object.keys(plan.locked), ["contact"]);
    // THE REFUSAL, not a bare sentence: which of the three states, the words,
    // and the gate it came from (catalogue G.4).
    assert.match(plan.locked.contact.sentence, /ARION Standard and above/);
    assert.equal(plan.locked.contact.reason, "plan");
    assert.equal(plan.locked.contact.tier, "pro");
  });

  test("a Standard business has nothing locked", () => {
    const plan = readSitePlan(STANDARD_REPLY);
    assert.equal(plan.proAvailable, true);
    assert.deepEqual(plan.locked, {});
  });

  test("an older server that says nothing locks NOTHING — silence is not a refusal", () => {
    const plan = readSitePlan({ sections: [{ kind: "contact", label: "Contact" }] });
    assert.equal(plan.proAvailable, null);
    assert.deepEqual(plan.locked, {});
    assert.equal(canAdd(plan, "contact"), true);
  });

  test("no reply at all is not a locked builder", () => {
    assert.deepEqual(readSitePlan(null), EMPTY_PLAN);
    assert.deepEqual(readSitePlan(undefined), EMPTY_PLAN);
  });

  test("THE PORTAL HOLDS NO TIER TABLE OF ITS OWN — one answer, and it is the server's", () => {
    const src = readFileSync(path.join(SRC, "sitePlan.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    // No list of which kinds are paid, and no tier comparison: the words
    // 'pro' and 'lite' may appear only in the fallback sentence.
    assert.ok(!/arion_?tier|meetsMinTier|TIER_ORDER/i.test(code),
      "the website adapter started deciding the plan for itself");
    assert.ok(!/\bcontact\b|\bsite_contact\b/.test(code),
      "a hardcoded list of paid sections appeared in the Portal");
  });
});

describe("a Lite business cannot insert a pro widget and a Standard one can", () => {
  const lite = readSitePlan(LITE_REPLY);
  const standard = readSitePlan(STANDARD_REPLY);

  test("the section the plan does not carry is refused, with the sentence", () => {
    assert.equal(canAdd(lite, "contact"), false);
    assert.match(lockFor(lite, "contact").sentence, /ARION Standard and above/);
  });

  test("the same section on Standard is offered", () => {
    assert.equal(canAdd(standard, "contact"), true);
    assert.equal(lockFor(standard, "contact"), null);
  });

  test("everything free is offered on BOTH plans — the lock is narrow, not a blanket", () => {
    for (const kind of ["hero", "services"]) {
      assert.equal(canAdd(lite, kind), true, `${kind} was locked on Lite`);
      assert.equal(canAdd(standard, kind), true, `${kind} was locked on Standard`);
    }
  });

  test("the picker asks by the BUILDER's name for the widget, not the section's", () => {
    const arionKindOf = (w) => (w === "site_contact" ? "contact" : (w === "site_hero" ? "hero" : null));
    assert.match(pickerLock(lite, arionKindOf, { kind: "site_contact" }).sentence, /ARION Standard/);
    assert.equal(pickerLock(lite, arionKindOf, { kind: "site_hero" }), null);
    // A FREE widget that is not a website section at all is never locked.
    assert.equal(pickerLock(lite, arionKindOf, { kind: "heading" }), null);
    // A PAID one with no section behind it still is — its own `tier` says
    // which gate applies and the SITE's own answer says it does not pass it.
    const paid = pickerLock(lite, arionKindOf, { kind: "card", tier: "pro" });
    assert.equal(paid.reason, "plan");
    assert.match(paid.sentence, /website plan/);
    // …and on Standard the same widget is offered.
    assert.equal(pickerLock(standard, arionKindOf, { kind: "card", tier: "pro" }), null);
    // AN OWNERSHIP GATE IS A DIFFERENT REFUSAL, with its own sentence, and it
    // never reads as "not on your plan" (reference_nav_visibility_semantics).
    const owned = widgetLock("ia:oliver", true);
    assert.equal(owned.reason, "ownership");
    assert.match(owned.sentence, /Needs OLIVER, which this business does not have/);
    assert.notEqual(owned.sentence, widgetLock("pro", true).sentence);
  });
});

describe("the lock is visible, and in plain words", () => {
  test("no vendor name reaches a client sentence", () => {
    const vendor = /elementor|wordpress|rank ?math|astra|hostinger|wp-admin/i;
    assert.doesNotMatch(DEFAULT_LOCK, vendor);
    assert.doesNotMatch(readSitePlan(LITE_REPLY).locked.contact.sentence, vendor);
    assert.doesNotMatch(PLAN_SENTENCE, vendor);
    assert.doesNotMatch(ownershipSentence("OLIVER"), vendor);
    // AND NEVER THE BARE WORD. "Locked" says nothing a business can act on.
    for (const words of [PLAN_SENTENCE, ownershipSentence("OLIVER"), DEFAULT_LOCK]) {
      assert.doesNotMatch(words, /locked/i, `a client sentence says "locked": ${words}`);
    }
  });

  test("the sentence says the plan, which is the only thing the business can act on", () => {
    assert.match(DEFAULT_LOCK, /ARION Standard and above/);
  });

  test("a locked section stays IN the gallery, with the reason as its line", () => {
    assert.match(
      BUILDER,
      /description: canAdd\(plan, p\.kind\) \? p\.description : lockFor\(plan, p\.kind\)!\.sentence/,
      "the gallery hides a locked section instead of explaining it",
    );
    // …and the gallery card carries WHICH of the three states it is in, the
    // same three words the pane and the picker carry.
    const GALLERY = readFileSync(path.join(SRC, "..", "..", "SectionGallery.tsx"), "utf8");
    assert.match(GALLERY, /"data-widget-state": s\.locked\.reason/);
    assert.match(GALLERY, /"data-widget-state": "offered"/);
  });
});

describe("both doors go through the same gate", () => {
  test("the pane's insert asks the plan before anything is built", () => {
    const insert = BUILDER.slice(BUILDER.indexOf("const insertWidget"), BUILDER.indexOf("const payload"));
    assert.match(insert, /const locked = lockFor\(plan, kind\);/);
    assert.match(insert, /if \(locked\) \{ setErr\(locked\.sentence\); return false; \}/);
    assert.ok(
      insert.indexOf("lockFor(plan, kind)") < insert.indexOf("addFromServer"),
      "the section is built before the plan is asked",
    );
  });

  test("the gallery's place asks the same question", () => {
    const place = BUILDER.slice(BUILDER.indexOf("const placePremade"), BUILDER.indexOf("const insertWidget"));
    assert.match(place, /lockFor\(plan, row\.kind\)/);
  });

  test("the plan is read from the reply, and read ONCE", () => {
    assert.match(BUILDER, /setPlan\(readSitePlan\(lib\?\.data\)\);/);
    assert.equal((BUILDER.match(/readSitePlan\(/g) || []).length, 1);
  });
});
