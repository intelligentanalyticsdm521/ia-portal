// tap-targets.test.mjs — October pull-forward P4.1.
//
// Small pack 2's phone pass raised twelve surfaces to a 40px tap target and
// left two: the Lead Inbox's ten filter chips (24px, written out as the same
// Tailwind string in five places) and "Explain this page" (28px, the smallest
// control on most pages and the one somebody reaches for precisely when they
// are stuck).
//
// This is the SOURCE half of the proof. The other half is
// scripts/dev/measure-tap-targets.mjs, which renders these same exported class
// strings in a real Chromium at 375x812 and asserts 40px, and at 1440x900 and
// 800x900 that the desktop is byte-identical to what it was. Together: this
// says the pages use the classes, that says the classes measure 40px. Either
// one alone is a claim.
//
// Source shape is read with \r\n normalised — every file here is CRLF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, "/");

const CHIP = read(path.join(SRC, "components", "spark", "FilterChip.tsx"));
const HELP = read(path.join(SRC, "components", "PageHelpButton.tsx"));
const INBOX = read(path.join(SRC, "pages", "spark", "SparkLeadInboxPage.tsx"));

test("the chip carries a 40px tap target, and only on a phone", () => {
  const chipBase = CHIP.match(/export const CHIP_BASE =([\s\S]*?);\n/)[1];
  assert.match(chipBase, /max-md:min-h-\[40px\]/,
    "40px is the smallest a thumb reliably hits — and it must be in the CLASS, not the comment");
  // Unprefixed min-h would change the desktop. Every sizing rule this
  // component adds must be behind max-md:.
  const base = CHIP.match(/const CHIP_BASE =([\s\S]*?);\n/)[1];
  const unprefixed = [...base.matchAll(/(?:^|\s)"?\s*((?:min-h|h|py|p)-\[?[\w.]+\]?)/g)]
    .map((m) => m[1])
    .filter((c) => !base.includes(`max-md:${c}`) && c !== "py-1");
  assert.deepEqual(unprefixed, [],
    `these sizing utilities are not behind max-md: and would move the desktop: ${unprefixed}`);
});

test("the chip row scrolls sideways on a phone and is INVISIBLE to layout on desktop", () => {
  const row = CHIP.match(/const CHIP_ROW =([\s\S]*?);\n/)[1];
  // `contents` is what buys "no desktop pixel moves": the wrapper has no box,
  // so the container around it lays the chips out exactly as it did before
  // this component existed.
  assert.match(row, /(^|["\s])contents(\s|"|$)/, "the row must be display:contents on desktop");
  assert.match(row, /max-md:flex\b/);
  assert.match(row, /max-md:flex-nowrap/, "wrapping ten 40px chips is four rows of a phone screen");
  assert.ok(!/max-md:flex-wrap\b/.test(row), "nowrap, not wrap");
  assert.match(row, /max-md:overflow-x-auto/);

  // shrink-0 on the chip: inside a nowrap scrolling row a flex child WILL be
  // squeezed narrower than its text, and "Failed verification" would ellipsis
  // rather than scroll into view.
  assert.match(CHIP, /const CHIP_BASE =[\s\S]*?shrink-0/);
});

test("every Lead Inbox filter chip goes through FilterChip", () => {
  const code = stripComments(INBOX);
  // Matched on the NAMES rather than the literal line: pre-walk pass 2 added
  // TAB_STRIP_ROW / TAB_STRIP_ITEM to the same import, and a test that pins the
  // exact spelling of an import list fails on every future addition without
  // anything being wrong. What must hold is that both come from this module.
  const imp = code.match(/import \{([^}]*)\} from "\.\.\/\.\.\/components\/spark\/FilterChip"/);
  assert.ok(imp, "SparkLeadInboxPage no longer imports from components/spark/FilterChip");
  const names = imp[1].split(",").map((n) => n.trim());
  assert.ok(names.includes("FilterChip"), `FilterChip is not imported (got ${names.join(", ")})`);
  assert.ok(names.includes("FilterChipRow"), `FilterChipRow is not imported (got ${names.join(", ")})`);
  assert.match(code, /<FilterChipRow>/);
  // Five sites used to carry the same Tailwind string. A sixth copy appearing
  // is a sixth thing to raise the next time somebody measures a phone.
  const inlineChips = [...code.matchAll(/rounded-full px-3 py-1 text-xs font-semibold/g)];
  assert.equal(inlineChips.length, 0,
    `${inlineChips.length} chip(s) still written inline instead of using FilterChip`);
  // And all five kinds are present as components.
  assert.ok((code.match(/<FilterChip\b/g) || []).length >= 4,
    "the tier, verified and source chips all render through the component");
});

test('"Explain this page" and "Do it with me" carry the phone tap target', () => {
  assert.match(HELP, /export const HELP_BUTTON_CLASS/,
    "exported so the measuring script reads the shipped string, not a copy");
  // Against the CONSTANT, not the file. The JSDoc above it quotes
  // `max-md:min-h-[40px]` while explaining why it is there, so a file-wide
  // match was satisfied by the PROSE — the mutation harness deleted the rule
  // from the constant and this test still passed.
  const helpClass = HELP.match(/export const HELP_BUTTON_CLASS =([\s\S]*?);\n/)[1];
  assert.match(helpClass, /max-md:min-h-\[40px\]/,
    "the 40px phone tap target must be in the class, not only in the comment");
  // BOTH buttons use it. The first draft raised only the first one, which is
  // the half-fix that looks done.
  const uses = (stripComments(HELP).match(/className=\{HELP_BUTTON_CLASS\}/g) || []).length;
  assert.equal(uses, 2, `both buttons must use it, found ${uses}`);
  assert.ok(!/className="inline-flex items-center gap-1\.5 rounded-lg border/.test(HELP),
    "the inline copy of the class string is gone");
});

test("no chip or help class leaks a desktop change", () => {
  // Every utility this pack ADDED is behind max-md:. If an unprefixed sizing
  // utility appears in either constant, the measuring script's 1440 and 800
  // checks are the ones that would catch it — this is the cheap early warning.
  for (const [name, src] of [["FilterChip.tsx", CHIP], ["PageHelpButton.tsx", HELP]]) {
    const added = [...src.matchAll(/max-md:([\w[\]\-.]+)/g)].map((m) => m[1]);
    assert.ok(added.length > 0, `${name} has no max-md: utilities at all`);
  }
});

test("the measuring script exists and is pointed at the real components", () => {
  // A source test that pins classes nothing measures is a test that pins a
  // string. The pair is the point.
  const script = read(path.join(process.cwd(), "scripts", "dev", "measure-tap-targets.mjs"));
  assert.match(script, /constFrom\("src\/components\/spark\/FilterChip\.tsx", "CHIP_BASE"\)/);
  assert.match(script, /constFrom\("src\/components\/PageHelpButton\.tsx", "HELP_BUTTON_CLASS"\)/);
  assert.match(script, /assertHasMaxMd/,
    "it must refuse to run if it read a constant with no phone rules in it — its own first run did exactly that and reported a false 24px");
});

test("no OTHER page grew an inline 24px filter chip while this was being fixed", () => {
  // The Lead Inbox is the one the brief named. This catches the next one
  // before it ships rather than at the next phone pass.
  const offenders = FILES
    .filter((p) => !p.endsWith("FilterChip.tsx"))
    .filter((p) => /rounded-full px-3 py-1 text-xs font-semibold/.test(stripComments(read(p))))
    .map(rel);
  assert.deepEqual(offenders, [],
    `these files write a filter chip inline instead of using FilterChip:\n  ${offenders.join("\n  ")}`);
});

// ── Pre-walk pass 2, 2026-09-07 — the tab strip nobody could reach ──────────
//
// Measured live on the SPARK Lead Inbox at 375x812: the tab strip was 442px of
// content inside a 333px container, clipped by `.spark-page { overflow-x:
// hidden }` with no scrollbar. The four tabs sat at x = 21-113, 117-244,
// 248-365 and 369-463 — so **Billing** began 6px past the right edge of a
// 375px screen and could be neither tapped nor scrolled to, and Territories was
// half cut off. Exactly W-SP2-C.4's fail ("a tab exists that cannot be
// reached"); small pack 2 fixed that shape for the contact and job tab strips
// and this strip was not on its list.
//
// Same treatment as the chips: nowrap + overflow-x on `max-md:` only, so
// desktop is untouched by construction rather than by inspection.

test("the tab strip scrolls on a phone instead of clipping a tab", () => {
  const row = CHIP.match(/export const TAB_STRIP_ROW =([\s\S]*?);\n/);
  assert.ok(row, "TAB_STRIP_ROW is gone from FilterChip.tsx");
  assert.match(row[1], /max-md:flex-nowrap/,
    "without flex-nowrap the strip wraps instead of scrolling and the fix is invisible");
  assert.match(row[1], /max-md:overflow-x-auto/,
    "overflow-x-auto is the whole fix: the strip must be its own scroll container, "
    + "because its ancestor .spark-page is overflow-x:hidden and will clip it silently");

  // Every mobile rule, and ONLY mobile rules. A bare `overflow-x-auto` here
  // would put a scrollbar under the tabs on every desktop too.
  for (const cls of row[1].match(/[a-z0-9:[\]#.\-/]+/gi) || []) {
    if (cls === "max" || !cls.includes("-")) continue;
    assert.ok(cls.startsWith("max-md:"),
      `TAB_STRIP_ROW must be mobile-only; "${cls}" applies at every width`);
  }

  const item = CHIP.match(/export const TAB_STRIP_ITEM =([\s\S]*?);\n/);
  assert.ok(item, "TAB_STRIP_ITEM is gone");
  assert.match(item[1], /shrink-0/,
    "inside a nowrap row a flex child is squeezed narrower than its text, so "
    + "'Suppressed Domains' would ellipsis rather than scroll into view");
});

test("the Lead Inbox tab strip actually uses them", () => {
  const src = stripComments(INBOX);
  assert.match(src, /TAB_STRIP_ROW/,
    "SparkLeadInboxPage no longer applies TAB_STRIP_ROW — the strip clips again");
  assert.match(src, /TAB_STRIP_ITEM/,
    "the tabs no longer carry TAB_STRIP_ITEM — they will be squeezed, not scrolled");
  // The strip is identified by the border it draws; pin that the class lands on
  // THAT element and not on some other flex row that happens to be nearby.
  const strip = src.match(/className=\{`mb-4 flex items-end gap-1 border-b[^`]*`\}/);
  assert.ok(strip, "the tab strip's className is no longer a template literal — is TAB_STRIP_ROW still on it?");
  assert.match(strip[0], /TAB_STRIP_ROW/, "TAB_STRIP_ROW is not on the bordered tab strip");
});
