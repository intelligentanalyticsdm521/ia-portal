/**
 * builder/inlineSafe.ts — the six inline tags a mailbox may keep, in a module
 * that imports nothing.
 *
 * ── WHY IT MOVED HERE (D-168 wave 2) ──────────────────────────────────────
 * It lived in `adapters/email/emailRender.ts`, and a FAMILY folder must not
 * import an adapter: `families/types.ts` says so, and the reason is the import
 * ring — `emailRender.ts` imports `families/index.ts`, so a family reaching
 * back into it pulls that index into its own graph. `b168/override` moved `esc`
 * out of `render.ts` for exactly this reason and left the pattern to follow.
 *
 * A family that writes a mailbox renderer needs this function and must not
 * write a SECOND allowlist of its own: two answers to "what mark-up may an
 * author write" is how one of them quietly keeps a `<script>`. So the one
 * answer lives here, imports nothing, and `emailRender.ts` re-exports it so no
 * existing caller changes.
 *
 * ── WHY THERE IS AN ALLOWLIST AT ALL ──────────────────────────────────────
 * A newsletter written in the old editor is a TipTap document: paragraphs with
 * bold runs and LINKS inside them. Escaping the lot would open every past issue
 * with its links turned into visible angle brackets, and retyping them by hand
 * is not a migration. So six tags survive, each with its attributes checked
 * rather than trusted:
 *
 *   <a href="…">  http, https and mailto only — never javascript:
 *   <strong> <b> <em> <i> <br>
 *
 * Everything else — every script, every style, every event handler, every
 * attribute not named above — is already escaped by the time this runs and
 * stays that way.
 */
export function inlineSafe(escaped: string): string {
  return String(escaped)
    .replace(/&lt;(\/?)(strong|b|em|i)&gt;/gi, (_m, slash, tag) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/&lt;a href=&quot;((?:https?:\/\/|mailto:)[^"&<>\s]*)&quot;&gt;/gi,
      (_m, href) => `<a href="${href}" style="color:inherit;text-decoration:underline;">`)
    .replace(/&lt;\/a&gt;/gi, "</a>");
}
