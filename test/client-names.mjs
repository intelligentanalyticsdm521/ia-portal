/**
 * test/client-names.mjs — THE ONE HOME FOR THE CLIENT SPELLINGS.
 *
 * The businesses whose documents this builder was traced from. D-146's first
 * ask is that no template ever names one of them, and the guard is a denylist.
 *
 * ── WHY IT IS A MODULE OF ITS OWN (D-164 follow-up, 2026-09-18) ────────────
 * The list was declared inside `builder-template-library.test.mjs`, and when a
 * second suite needed it (`snow-agreement-template.test.mjs`) the names were
 * TYPED AGAIN. A client's name written into the repository twice in order to
 * forbid it once is the defect the denylist exists to prevent, wearing the
 * denylist's own clothes.
 *
 * It is not a `.test.mjs` and declares no tests, so importing it costs nothing
 * and running the suite does not run anything twice — which importing one test
 * file from another would. Every suite that needs the list imports it from
 * here; `builder-template-library.test.mjs` re-exports it under the name it has
 * always used, so nothing that reads that file has to learn a new one.
 *
 * ADD A NAME HERE and every denylist on the platform gains it in the same edit.
 */
export const CLIENT_NAMES = [
  "Rolling In It",
  "RollingInIt",
  "MS Moments",
  "Hope Ministries",
  "Summit Lawn",
  "Cedarline",
  "Top Maid",
  "Hestia",
  "Nathan",
  "Dannen",
];

export default { CLIENT_NAMES };
