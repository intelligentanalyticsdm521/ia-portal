/**
 * test/helpers/panelOrder.mjs — THE PANEL'S ORDER, READ FROM THE MACHINE FILE.
 *
 * D-168 item 7. Four test files held an exact, hand-typed list of every tile on
 * a panel, in order:
 *
 *   test/builder-widget-set.test.mjs   §2, four adapters
 *   test/builder-registry.test.mjs     REQUIRED, and the per-panel label lists
 *   test/email-builder.test.mjs        the newsletter's row
 *   test/mybrand-studio.test.mjs       the studio's row
 *
 * Every one of the ten family agents hit at least one of them, every one of them
 * was stale within an hour of being typed, and f1-words said in the handoff
 * (§6.3) that ten half-passes at them would be worse than none. They are not
 * fixed here by re-typing the kinds. They READ the order, from the two places
 * that actually decide it:
 *
 *   · `test/fixtures/elementor-panel.json` — machine-cut by
 *     `scripts/gen-elementor-panel.mjs` from the two 2026-09-17 scrapes of a
 *     real Elementor install with Pro. Which group a tile is in and where in
 *     that group it sits are ELEMENTOR'S answers and we do not get a vote.
 *   · the definition's own `order`, for the Intelligent Analytics group, which
 *     Elementor cannot answer for because Elementor does not ship it.
 *
 * ── WHY THIS IS A REAL TEST AND NOT A MIRROR ──────────────────────────────
 * The thing under test — `registry.widgetsFor` — sorts by `panelAt`, which
 * reads the generated MODULE (`src/builder/elementorPanel.ts`). This helper
 * reads the generated FIXTURE. They are two files, and
 * `builder-override.test.mjs` asserts they agree, so a hand edit to either one
 * is red. What is being checked here is that the panel's order IS Elementor's,
 * not that two copies of our own opinion match.
 *
 * MEMBERSHIP is not this helper's question — `builder-offers.test.mjs` owns
 * that, against the offer file Brandon approved. This one owns ORDER.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const PANEL = JSON.parse(readFileSync(
  path.join(process.cwd(), "test/fixtures/elementor-panel.json"), "utf8"));

/** The groups the panel draws, in Elementor Pro's own order, ours last. */
export const GROUPS = [...PANEL.groups, "Intelligent Analytics"];

/** Where Elementor puts the tile with this title, or `null` — not theirs. */
export function elementorPlace(label) {
  return PANEL.widgets[String(label || "").trim()] ?? null;
}

/**
 * Where this tile sits, as a pair that sorts: [which group, where in it].
 *
 * A widget of OURS is in the Intelligent Analytics group and carries its own
 * `order`; one without an order sorts last in that group, which is what
 * `registry.unorderedKinds()` is red about.
 */
export function placeOf(def, label) {
  const own = elementorPlace(label);
  if (own && own.group === def.category) {
    return [GROUPS.indexOf(own.group), own.order];
  }
  const group = GROUPS.indexOf(def.category);
  return [group < 0 ? GROUPS.length : group, typeof def.order === "number" ? def.order : Number.MAX_SAFE_INTEGER];
}

/**
 * EVERY WAY THIS PANEL IS OUT OF ELEMENTOR'S ORDER, as sentences.
 *
 * Returns an empty array when the panel reads exactly as Elementor's does. Each
 * string names the two tiles that are the wrong way round and where Elementor
 * puts them, so the failure tells you what to move without opening a catalogue.
 */
export function panelOrderFaults(defs, labelOf) {
  const out = [];
  let last = null;
  for (const def of defs) {
    const label = labelOf(def);
    const place = placeOf(def, label);
    if (last && (place[0] < last.place[0] || (place[0] === last.place[0] && place[1] < last.place[1]))) {
      out.push(
        `${label} (${GROUPS[place[0]] ?? def.category} #${place[1]}) is drawn after `
        + `${last.label} (${GROUPS[last.place[0]] ?? last.def.category} #${last.place[1]}) — `
        + `Elementor draws it before.`);
    }
    last = { def, label, place };
  }
  return out;
}

/**
 * EVERY TILE WHOSE GROUP IS NOT THE ONE ELEMENTOR PUTS IT IN.
 *
 * D-168 item 6: Elementor's 37 Pro widgets belong in the **Pro** group and its
 * 13 theme pieces in **Site**. They were in General with a padlock, which is a
 * difference a person sees the second they open our panel beside the real
 * editor. A tile whose name Elementor does not ship is not this test's business.
 */
export function groupFaults(defs, labelOf) {
  const out = [];
  for (const def of defs) {
    /* AN IA TWIN WEARS ELEMENTOR'S NAME ON PURPOSE, and stays in our group.
       The offer file's own words: `ia_reviews` is the *"twin of Reviews: the
       business's real reviews"*. It is called Reviews because that is what a
       person looking for it will look for, and it is in Intelligent Analytics
       because Elementor's Reviews is a different widget reading a different
       source. Reading Elementor's group for it would move our own widget into
       Elementor's Pro group and lock it behind a website plan. */
    if (def.category === "Intelligent Analytics") continue;
    const label = labelOf(def);
    const own = elementorPlace(label);
    if (own && own.group !== def.category) {
      out.push(`${label} is in ${def.category}; Elementor draws it in ${own.group}.`);
    }
  }
  return out;
}
