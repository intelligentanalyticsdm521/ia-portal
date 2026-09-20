/**
 * test/helpers/familyContract.mjs — THE ONE HELPER EVERY FAMILY TEST CALLS.
 *
 * B-168 §C.1 item 3. Ten agents, ten folders, and one thing they all have to
 * prove about their own widgets:
 *
 *   1. every DEF has a renderer and every RENDERER has a def — a def without
 *      one is a tile that puts a blank on the page, and a renderer without one
 *      is code nothing can reach;
 *   2. every def names builders, out of the offer file's five;
 *   3. every def is IN THE OFFER for every builder it claims — D-168's
 *      absolute rule, checked per family so the failure names the folder;
 *   4. every SETTINGS KEY an emitter produces exists on the Elementor widget it
 *      claims to be, per `WIDGET_SETTINGS_KEYS.json`. An emitted key the engine
 *      does not have is silently dropped on publish and the author's change
 *      does nothing on the live page.
 *
 * A family's test is three lines:
 *
 *   import { FAMILY } from "../src/builder/widgets/families/f1-words/index.ts";
 *   import { assertFamilyContract } from "./helpers/familyContract.mjs";
 *   test("f1-words keeps the contract", () => assertFamilyContract("f1-words", FAMILY));
 *
 * …and, where the family also writes an arion emitter, one more call with the
 * emitted settings: `assertSettingsKeys("price-table", emitted)`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* THE THREE ADAPTERS' OWN HANDS. Imported, never re-typed: a list copied here
   would be a second answer to "does that surface already draw this". */
import { STUDIO_OWN_KINDS } from "../../src/builder/adapters/mybrand/insert.ts";
import { EMAIL_RENDERED_KINDS as EMAIL_OWN_KINDS } from "../../src/builder/adapters/email/emailRender.ts";
import { LANDING_RENDERED_KINDS as LANDING_OWN_KINDS } from "../../src/builder/adapters/landing/landingRender.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "..", "fixtures");

export const SETTINGS_KEYS = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "WIDGET_SETTINGS_KEYS.json"), "utf8"));

export const OFFERS = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "BUILDER_OFFERS_2026-09-19.json"), "utf8"));

/** The five builders, in the offer file's own words. */
export const BUILDER_NAMES = ["website", "landing", "newsletter", "proposal", "mybrand"];

/**
 * EVERYTHING A BUILDER MAY OFFER, as a set of lower-cased names.
 *
 * The offer file lists Elementor SLUGS and IA names. A family declares a
 * `kind`, and a kind is our spelling of the same thing — `icon_box` for
 * `icon-box`, `star_rating` for `rating`. So the set carries the slug, the slug
 * with underscores, and Elementor's own TITLE, and a def matches on any of the
 * three. The offer is what is being checked, not our spelling of it.
 */
export function offeredNames(builder) {
  const b = OFFERS.builders[builder];
  assert.ok(b, `No such builder in the offer file: ${builder}`);
  const slugs = [
    ...(b.elementor || []), ...(b.elementor_free || []), ...(b.elementor_pro || []),
    ...(b.canvas_pieces || []),
  ];
  const out = new Set();
  for (const s of slugs) {
    out.add(norm(s));
    const title = SETTINGS_KEYS.widgets[s]?.title;
    if (title) out.add(norm(title));
  }
  for (const s of (b.ia || [])) out.add(norm(s));
  return out;
}

/** One spelling for `icon-box`, `icon_box`, `Icon Box` and `iconBox`. */
export function norm(s) {
  return String(s ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Assert every claim a family makes about its own widgets. Throws on the first. */
export function assertFamilyContract(name, family) {
  assert.ok(family && Array.isArray(family.defs) && family.renderers,
    `${name}: a family exports { defs, renderers }`);

  const defined = family.defs.map((d) => d.kind);

  /*
   * A WIDGET IS "DRAWN" ON THE SURFACE IT IS OFFERED ON — CHANGED 2026-09-19.
   *
   * This asked one question: is the kind in `renderers`? That was the whole
   * contract when a family had one door. D-168 item 5b gave it three more —
   * `emailRenderers`, `landingRenderers`, `studioInserts` — because a widget on
   * the newsletter panel is drawn by the MAILBOX renderer and never by the page
   * one. IA Posts (wave 2) is the first widget offered to the newsletter and
   * nowhere else, and under the old rule the only way to pass was to write a
   * page renderer nothing would ever call.
   *
   * So the question is now asked PER SURFACE, and it is the same question
   * `familySurfaceGaps()` asks of the merged set in `families/index.ts` — one
   * rule, in two places that cannot disagree because they are the same words:
   * newsletter is the mailbox half; a landing page is its own half or the page
   * one; My Brand is the studio insert; a website or a proposal is the page
   * half. This is STRICTER than the line it replaces, not weaker: a widget
   * offered on the newsletter used to pass with a page renderer alone.
   */
  /* …AND THE ADAPTER'S OWN HAND IS AN ANSWER TOO (B-168, landing).
     The mailbox asks the family's mailbox half, then its PAGE half, then
     gives up — the same order the hosted landing page uses — so a page
     renderer really does draw in a newsletter, and `checkEmailSafe` over the
     goldens is what keeps it honest. The My Brand studio has drawn thirteen
     kinds in its own look since before the families existed
     (`STUDIO_OWN_KINDS`), and a family row beside one of those would be the
     second mechanism, not the first. Same words as `familySurfaceGaps()`. */
  const surfaceOf = (d, b) => {
    if (b === "newsletter") {
      return [["emailRenderers", family.emailRenderers], ["renderers", family.renderers]];
    }
    if (b === "landing") return [["landingRenderers", family.landingRenderers], ["renderers", family.renderers]];
    if (b === "mybrand") return [["studioInserts", family.studioInserts]];
    return [["renderers", family.renderers]];
  };
  for (const d of family.defs) {
    for (const b of (d.builders || [])) {
      if (b === "mybrand" && STUDIO_OWN_KINDS.includes(d.kind)) continue;
      if (b === "newsletter" && EMAIL_OWN_KINDS.includes(d.kind)) continue;
      if (b === "landing" && LANDING_OWN_KINDS.includes(d.kind)) continue;
      const doors = surfaceOf(d, b);
      assert.ok(doors.some(([, map]) => map && typeof map[d.kind] === "function"),
        `${name}/${d.kind}: offered on the ${b} panel and nothing draws it there — `
        + `the tile would put a blank in front of a customer. Write ${doors[0][0]}.${d.kind}.`);
    }
  }

  for (const door of ["renderers", "emailRenderers", "landingRenderers", "studioInserts"]) {
    for (const k of Object.keys(family[door] || {})) {
      assert.ok(defined.includes(k),
        `${name}: ${door}.${k} is drawn with no definition — nothing can reach it`);
    }
  }
  assert.equal(new Set(defined).size, defined.length,
    `${name}: the same kind is declared twice`);

  for (const d of family.defs) {
    assert.ok(Array.isArray(d.builders) && d.builders.length,
      `${name}/${d.kind}: must name at least one builder`);
    for (const b of d.builders) {
      assert.ok(BUILDER_NAMES.includes(b),
        `${name}/${d.kind}: "${b}" is not one of ${BUILDER_NAMES.join(", ")}`);
      assert.ok(offeredNames(b).has(norm(d.kind)) || offeredNames(b).has(norm(d.label)),
        `${name}/${d.kind}: NOT in the ${b} offer. D-168: a widget is an Elementor `
        + `widget by Elementor's own name, or an IA widget named in the offer file. `
        + `If you think it is missing, write it in the handoff — do not build it.`);
    }
    assert.ok(typeof d.label === "string" && d.label.trim(), `${name}/${d.kind}: needs a label`);
    assert.ok(d.description, `${name}/${d.kind}: needs one plain sentence`);
    /* Ships with no gate: Brandon decides the tiers in October and that must be
       a change to DATA, not a rebuild. See families/types.ts. */
    if (d.requires) {
      assert.ok(d.requires.product || d.requires.minTier,
        `${name}/${d.kind}: an empty \`requires\` says nothing — leave it off`);
    }
  }
}

/**
 * Every key an emitter produced exists on the Elementor widget it claims to be.
 *
 * `widgetType` is Elementor's own slug. A key with a `_tablet` / `_mobile`
 * suffix is checked against its desktop twin, because that is how Elementor
 * stores a responsive control and the machine file lists both.
 */
export function assertSettingsKeys(widgetType, settings, where = "") {
  const w = SETTINGS_KEYS.widgets[widgetType];
  assert.ok(w, `${where}${widgetType}: not an Elementor widget in WIDGET_SETTINGS_KEYS.json`);
  assert.ok(w.keys.length,
    `${where}${widgetType}: the catalogue reports no controls for this widget, so nothing `
    + `can be checked against it — say so rather than asserting against an empty list`);
  const legal = new Set(w.keys);
  const bad = Object.keys(settings || {}).filter((k) => {
    if (legal.has(k)) return false;
    return !legal.has(k.replace(/_(tablet|mobile)$/, ""));
  });
  assert.deepEqual(bad, [],
    `${where}${widgetType}: these settings keys are not on the widget, so the page engine `
    + `drops them silently on publish and the author's change does nothing: ${bad.join(", ")}`);
}
