// test/builder-offers.test.mjs — THE OFFER IS THE PANEL. Nothing else may be
// on it.
//
// B-168, and D-168 behind it. Brandon has asked all week for one thing: mimic
// Elementor. Every pass so far agreed and then invented widgets he never asked
// for — Key fact, Personal detail, Title page, Property service plan, a Details
// block, and on 2026-09-19 three "Customer / Service Location / Business Info"
// block widgets. In his words: *"I have said probably 15 times this week to
// inventory Elementor widgets and just use those."*
//
// A paragraph in a scope document has not stopped that happening. A failing
// test does. So:
//
//   (a) EVERY TILE ON A PANEL IS IN THE OFFER, by Elementor's own title or by
//       the IA name the offer file gives it. An extra tile FAILS THE BUILD.
//   (b) Which offered widgets are still MISSING is reported as a to-do list
//       and does not fail yet — the ten families are what closes it, and the
//       lander flips this to failing when they have.
//
// THE OFFER FILE IS `test/fixtures/BUILDER_OFFERS_2026-09-19.json`, a copy of
// the one Brandon approved at 12:58 CDT on 2026-09-19 (DECISIONS_QUEUE D-168),
// byte for byte. Where scope 11.13.3 and the offer file disagree, the offer
// file wins.
//
// ── MUTATION CHECK (done, not assumed) ────────────────────────────────────
// Run on 2026-09-19 by adding a def with kind `sparkle_box` to
// `families/f6-money`: "website offers only what the offer file lists" went
// red naming the tile and the builder; removing it went green again. The TODO
// block was also made to fail on purpose by flipping STRICT below, which is the
// one line the lander changes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { widgetsFor } from "../src/builder/registry.ts";
import { BUILDER_OF } from "../src/builder/widgets/families/types.ts";
import { BUILDER_NAMES, OFFERS, SETTINGS_KEYS, norm, offeredNames } from "./helpers/familyContract.mjs";

/**
 * THE LANDER'S ONE LINE.
 *
 * `false` today: the panel is still missing most of the offer, because the ten
 * families have not been built yet, and a red suite on day one tells nobody
 * anything. The agent who lands the last family flips this to `true` and the
 * missing list becomes a failure.
 */
const STRICT_MISSING = false;

/** The adapter a builder's panel is drawn for. One table, in families/types. */
const ADAPTER_OF = Object.fromEntries(
  Object.entries(BUILDER_OF).map(([adapter, builder]) => [builder, adapter]));

/** Every tile a builder's panel actually shows today. */
function tilesOf(builder) {
  return widgetsFor(ADAPTER_OF[builder]).map((w) => ({ kind: w.kind, label: w.label }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   The offer file itself — read before anything is asserted against it.
   ═════════════════════════════════════════════════════════════════════════ */

describe("the offer file", () => {
  test("names the five builders, and nothing else", () => {
    assert.deepEqual(Object.keys(OFFERS.builders).sort(), [...BUILDER_NAMES].sort());
  });

  test("every Elementor slug it lists is a real Elementor widget", () => {
    // Not a spelling check for its own sake: a slug the machine files do not
    // carry is a widget we would never be able to build, and the offer would
    // quietly stay unmet forever.
    const unknown = [];
    for (const [builder, b] of Object.entries(OFFERS.builders)) {
      for (const s of [...(b.elementor || []), ...(b.elementor_free || []), ...(b.elementor_pro || [])]) {
        if (!SETTINGS_KEYS.widgets[s]) unknown.push(`${builder}: ${s}`);
      }
    }
    assert.deepEqual(unknown, [],
      "these are in the offer but not in the 2026-09-17 Elementor catalogues");
  });

  test("reports any IA name it lists with no entry in ia_twins", () => {
    // D-168: an IA widget exists ONLY as the database twin of an Elementor
    // widget, or because no normal widget can do the job, and `ia_twins` is
    // where that reason is written down.
    //
    // REPORTED, NOT FAILED, and deliberately: the offer file is the contract
    // Brandon approved, so a gap in it is a note for the main session to fill
    // in, not a thing a build agent may decide is wrong. Four names were short
    // an entry on 2026-09-19 — ia_mega_menu, ia_mobile_menu, ia_social_links,
    // ia_oliver_invoice — and they are in the D168 handoff.
    const explained = new Set(Object.keys(OFFERS.ia_twins || {}));
    const missing = [];
    for (const [builder, b] of Object.entries(OFFERS.builders)) {
      for (const name of (b.ia || [])) if (!explained.has(name)) missing.push(`${builder}: ${name}`);
    }
    console.log(`  NOTE ia_twins has no entry for: ${missing.length ? missing.join(", ") : "nothing — all explained"}`);
    assert.ok(Array.isArray(missing));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   (a) NOTHING ON A PANEL THAT IS NOT IN THE OFFER. This is the one that fails.
   ═════════════════════════════════════════════════════════════════════════ */

describe("every tile on a panel is in the offer", () => {
  for (const builder of BUILDER_NAMES) {
    test(`${builder} offers only what the offer file lists`, () => {
      const offered = offeredNames(builder);
      /* The box itself is not a tile anybody chose to offer — it is the engine's
         own node, and `container` is in the offer for every builder that has a
         flow anyway. Grid is that same box with a different layout (a PRESET,
         see registry.LAYOUT_PRESETS), so it rides on Container's entry. */
      const engineOwn = new Set(["container", "grid"]);
      const extra = tilesOf(builder)
        .filter((t) => !engineOwn.has(t.kind))
        .filter((t) => !offered.has(norm(t.kind)) && !offered.has(norm(t.label)))
        .map((t) => `${t.label} (${t.kind})`);
      assert.deepEqual(extra, [],
        `These tiles are on the ${builder} panel and are NOT in the offer Brandon approved. `
        + `D-168: a widget is either an Elementor widget by Elementor's own name, or an IA `
        + `widget named in BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you think `
        + `one is missing, write it in the handoff under "IA twin candidates" — do not build it.`);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   (b) WHAT IS STILL MISSING — a to-do list, not a failure. Yet.
   ═════════════════════════════════════════════════════════════════════════ */

describe("what the panel still owes the offer", () => {
  for (const builder of BUILDER_NAMES) {
    test(`${builder}: the offered widgets not built yet`, () => {
      const have = new Set();
      for (const t of tilesOf(builder)) { have.add(norm(t.kind)); have.add(norm(t.label)); }
      const b = OFFERS.builders[builder];
      const wanted = [
        ...(b.elementor || []), ...(b.elementor_free || []), ...(b.elementor_pro || []),
        ...(b.canvas_pieces || []), ...(b.ia || []),
      ];
      const missing = wanted.filter((s) => {
        const title = SETTINGS_KEYS.widgets[s]?.title;
        return !have.has(norm(s)) && !(title && have.has(norm(title)));
      });
      console.log(`  TODO ${builder}: ${missing.length} of ${wanted.length} offered widgets not built — `
        + (missing.length ? missing.join(", ") : "none"));
      if (STRICT_MISSING) {
        assert.deepEqual(missing, [], `${builder} does not yet offer everything the offer file lists`);
      }
    });
  }
});
