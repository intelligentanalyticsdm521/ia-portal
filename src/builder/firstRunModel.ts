/**
 * builder/firstRunModel.ts — the three things to know, said once.
 *
 * The name differs from `FirstRun.tsx` by more than case on purpose: on
 * Windows `FirstRun.tsx` and `firstRun.ts` are the same path, and tsc says so
 * — the same trap §11.9's template library hit.
 *
 * §9 of BUILDER_USER_TEST_2026-09-16 is three stories about a person who did
 * not know what the builder wanted from them. A builder that has to be
 * explained in a document has already lost, but three sentences on the first
 * open cost nothing and answer the three questions everybody asks: how do I
 * add something, how do I change the words, and how does it reach the
 * customer.
 *
 * ── SHOWN ONCE, AND REPLAYABLE ────────────────────────────────────────────
 * Once per browser, under one key. Never a server round trip: this is a
 * preference of the person sitting there, not a fact about the business, and a
 * walk-through that needs an API call to decide whether to appear is a
 * walk-through that appears late.
 *
 * `localStorage` throws in a private window and comes back empty after a
 * clear, so every read and write is wrapped and the page renders correctly
 * either way — worst case somebody is shown three sentences twice.
 */

/** The key. Versioned, so a rewritten walk-through can be shown again. */
export const FIRST_RUN_KEY = "iadm.builder.firstrun.v1";

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

/** Should the walk-through open? Only when nothing has been stored. */
export function shouldShowFirstRun(stored: string | null | undefined): boolean {
  return !stored;
}

/** The next step, or null when the last one has been read. */
export function nextStep(index: number, total = FIRST_RUN_STEPS.length): number | null {
  const next = index + 1;
  return next < total ? next : null;
}

/** Read the flag. Never throws — see the header. */
export function readFirstRun(store?: Pick<Storage, "getItem">): string | null {
  try {
    const s = store ?? (typeof localStorage === "undefined" ? null : localStorage);
    return s ? s.getItem(FIRST_RUN_KEY) : null;
  } catch { return null; }
}

/** Remember that it has been seen. Never throws. */
export function markFirstRunSeen(store?: Pick<Storage, "setItem">): void {
  try {
    const s = store ?? (typeof localStorage === "undefined" ? null : localStorage);
    s?.setItem(FIRST_RUN_KEY, new Date().toISOString());
  } catch { /* a private window is not a reason to fail an open */ }
}
