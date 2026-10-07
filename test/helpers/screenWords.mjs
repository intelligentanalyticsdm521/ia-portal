// screenWords.mjs — the words a person can read on a screen, pulled out of a
// .tsx/.ts source so a words test can check them (chat workflows, 2026-10-07).
//
// What counts as "on screen": JSX text between tags, and string/template
// literals that read like words (they carry a space, or start with a capital
// letter). What does not: comments, import lines, className values, route
// paths ("/api/v1/…"), and identifiers — so `intent_words` in code is not the
// word "intent" on screen, but "Looks like a request" in a string is.

export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([;{}),])\s*\/\/[^\n"'`]*$/gm, "$1");
}

export function screenWords(src) {
  const code = stripComments(src)
    .replace(/^\s*import[\s\S]*?;\s*$/gm, " ")
    .replace(/className=("[^"]*"|\{`[^`]*`\})/g, " ");
  const out = [];
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const t = m[1].trim();
    if (t && !/^[=&|?:]/.test(t)) out.push(t);
  }
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!t || t.startsWith("/") || /api\/v1/.test(t)) continue;
    if (/\s/.test(t) || /^[A-Z][a-z]/.test(t)) out.push(t.replace(/\$\{[^}]*\}/g, " "));
  }
  return out;
}
