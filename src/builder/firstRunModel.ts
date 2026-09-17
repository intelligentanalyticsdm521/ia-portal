/**
 * builder/firstRunModel.ts — the three things to know, on every open.
 *
 * The name differs from `FirstRun.tsx` by more than case on purpose: on
 * Windows `FirstRun.tsx` and `firstRun.ts` are the same path, and tsc says so
 * — the same trap §11.9's template library hit.
 *
 * §9 of BUILDER_USER_TEST_2026-09-16 is three stories about a person who did
 * not know what the builder wanted from them. A builder that has to be
 * explained in a document has already lost, but three sentences on the open
 * cost nothing and answer the three questions everybody asks: how do I add
 * something, how do I change the words, and how does it reach the customer.
 *
 * ── SHOWN UNTIL THEY SAY STOP (§11.12, D-154) ─────────────────────────────
 * This used to be once per browser, under a localStorage key. Brandon,
 * 2026-09-17: "lets keep it unless they mark don't show me this again. Like add
 * a little checkbox with that."
 *
 * So it opens EVERY time a builder opens, and the way out is the checkbox on
 * the box itself, which writes `tutorials.builderTips` = false for THE PERSON,
 * server-side (lib/userPreferences.ts → core.user_preference). A note in one
 * browser was never the right home: on a second computer the box was back with
 * no way to stop it, and no setting anywhere could turn it on again.
 *
 * The "?" in the header replays the box whatever the switch says — asking for
 * help is not a preference.
 *
 * THE KEY, THE STORAGE AND THE READ/WRITE WRAPPERS THAT USED TO BE HERE ARE
 * GONE, not deprecated. `usePreference("tutorials.builderTips")` is the one
 * mechanism; a second one would be a second answer to the same question, and
 * the two would disagree the first time somebody used two computers.
 */

export interface FirstRunStep {
  title: string;
  body: string;
}

/**
 * Three steps. In a business owner's words, and naming no other product —
 * the point is what to DO here, not what this is like.
 */
export const FIRST_RUN_STEPS: FirstRunStep[] = [
  {
    title: "Add things with +",
    body: "Every gap on the page has a + on it. Press one and pick what goes there — your customer and property, lines from your catalogue, words, pictures. It lands where you pressed.",
  },
  {
    title: "Type straight on the page",
    body: "There is no separate form. Click any words and type; what you see is exactly what your customer will read. Settings for the thing you clicked are on the right.",
  },
  {
    title: "Send when ready",
    body: "Save keeps it as a draft you can come back to. Send emails your customer a link to sign. Anything still blank is listed for you before it goes.",
  },
];

/**
 * Should the box open when a builder opens?
 *
 * The person's `tutorials.builderTips` switch, and nothing else. `undefined` is
 * "the server has not answered yet", and the answer to that is YES: the switch
 * defaults to on, so a builder opened in the first half-second behaves the same
 * as one opened later. Only an explicit `false` — somebody ticked the box or
 * turned the switch off in Settings → Tutorials — keeps it away.
 */
export function shouldShowFirstRun(builderTips: boolean | undefined): boolean {
  return builderTips !== false;
}

/**
 * What closing the box MEANS for the person's switch.
 *
 * `false` — turn Builder tips off — when and only when they ticked "Don't show
 * me this again". `null` is "leave the switch alone", which is what Skip, the ×
 * and "Start building" mean on their own: reading the box is not a request to
 * stop being shown it.
 *
 * It is a function and not two lines inside the shell so that "ticking the box
 * writes FALSE" is a test rather than something you check by clicking.
 */
export function builderTipsAfterClose(dontShowAgain: boolean): boolean | null {
  return dontShowAgain ? false : null;
}

/** The next step, or null when the last one has been read. */
export function nextStep(index: number, total = FIRST_RUN_STEPS.length): number | null {
  const next = index + 1;
  return next < total ? next : null;
}
