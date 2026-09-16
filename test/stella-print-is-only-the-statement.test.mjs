// Printing a financial statement must put the STATEMENT on the paper.
//
// PRE-WALK 1b, 2026-09-16, walk row S2: "the print preview shows only the
// statement … Fail if the app menus print."
//
// Measured on the live page by applying the print rules as ordinary CSS and
// reading what survived. On the Balance Sheet, this printed:
//
//   Welcome, Summit Lawn & Landscape
//   Home · Digital Presence · Invoicing & Administration · CRM & Marketing ·
//   Ledger & Data Management · Integrations & Software · Agents & Automations ·
//   Consulting · Settings
//   STELLA / Ledger & Unit Economics
//   Explain this page
//   Record
//   … the statement …
//   Ask ARGUS
//
// The rules said `.stella-no-print, nav, aside, header button, [data-tour]
// button`. The shell has ONE <nav> (the sub-nav's link list) and NO <aside>:
// the product rail is a plain div, the sub-nav's "STELLA / Ledger & Unit
// Economics" heading sits OUTSIDE that nav, and the header's business name is
// text, not a button. So almost none of the chrome matched.
//
// The fix is one marker, `data-app-chrome`, on every piece of shell. These
// tests check the rule covers it and that the shell actually carries it —
// a rule naming an attribute nothing has is the same defect again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

const BAR = read("src", "pages", "stella", "StatementExportBar.tsx");
const SHELL = read("src", "components", "AppShell.tsx");
const HELP = read("src", "components", "PageHelpButton.tsx");
const CHATBOT = read("src", "components", "argus", "ArgusChatbot.tsx");
const STELLA_SHELL = read("src", "pages", "stella", "StellaShell.tsx");

/** The one `display:none` selector list inside @media print. */
function printHideSelectors() {
  const block = BAR.match(/@media print \{([\s\S]*?)\n      \}/);
  assert.ok(block, "StellaPrintStyles still has an @media print block");
  // Strip CSS comments first — this block is heavily commented, and a comment
  // ending in a `/` swallows the start of the selector list otherwise.
  const css = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = css.match(/([^;{}]*)\{\s*display: none !important;\s*\}/);
  assert.ok(rule, "and a display:none rule inside it");
  return rule[1].split(",").map((s) => s.trim()).filter(Boolean);
}

test("the print rules hide everything marked as app chrome", () => {
  const selectors = printHideSelectors();
  assert.ok(selectors.includes("[data-app-chrome]"), `got ${JSON.stringify(selectors)}`);
  assert.ok(selectors.includes(".stella-no-print"), "and the statement page's own controls");
});

test("the header is hidden whole, not only its buttons", () => {
  const selectors = printHideSelectors();
  assert.ok(
    selectors.includes("header") || selectors.includes("[data-app-chrome]"),
    "`header button` alone left the business name printing",
  );
  assert.ok(
    !selectors.includes("header button"),
    "hiding only the header's BUTTONS is what left 'Welcome, <business>' on the paper",
  );
});

test("every piece of shell carries the marker", () => {
  // The rail + sub-nav wrapper, the top header, the three founder banners.
  assert.ok(
    (SHELL.match(/data-app-chrome/g) || []).length >= 5,
    "AppShell marks the header, the rail/sub-nav wrapper and the banners",
  );
  assert.match(SHELL, /<header data-app-chrome/, "the top header");
  assert.match(
    SHELL,
    /data-app-chrome\n\s+className=\{\n?\s*"flex md:relative/,
    "the icon rail + sub-nav wrapper — the product rail and the sub-nav heading live in here",
  );
  assert.match(HELP, /<div data-app-chrome/, "Explain this page / Do it with me");
  assert.ok(
    (CHATBOT.match(/data-app-chrome/g) || []).length >= 2,
    "the ARGUS launcher and its panel",
  );
});

test("the statement page's own control row is marked too", () => {
  assert.match(
    STELLA_SHELL,
    /<div className="stella-no-print" style=\{\{ display: "flex", gap: 8, alignItems: "center" \}\}>/,
    "the month picker, basis toggle, Export and Record are controls, not statement",
  );
});

// The regression itself, stated as a fact about the shell rather than about
// the CSS: the things that printed are not inside a <nav> or an <aside>, so a
// rule built out of those two element names can never cover them again.
test("the chrome that printed is not reachable by nav/aside alone", () => {
  assert.ok(
    !/<aside/.test(SHELL),
    "AppShell has no <aside> — a print rule naming one hides nothing",
  );
  assert.match(
    SHELL,
    /<header data-app-chrome className="iadm-header shrink-0">/,
    "the header is a <header>, and its TEXT (the business name) is what printed",
  );
});
