// test/portal-wording.test.mjs — the Look tab's Wording card (D-CP10), the
// Portal's half.
//
// Brandon, 30 Sep 2026, on the Look tab: "let them edit some of the verbiage
// and disable specific buttons". The buttons were already there; this is the
// verbiage. The contract all three builders share:
//
//   portal_design.customer.wording = { subtitle, greeting, book_label,
//   request_label, change_time_title, footer_line }, each plain text of at
//   most 60 characters (trimmed; HTML tags and control characters refused
//   with 400 wording_invalid; "" or missing = the standard text; unknown keys
//   dropped). The resolved look carries every key with the standard filled
//   in and the {time} {name} {business} tokens NOT expanded. PATCH
//   /portals/design?kind=customer takes { preset, use_brand, features,
//   wording }. The preview is posted the whole look, wording included.
//
// What is tested here: the six keys and their standard text; reading the
// saved wording back; "Unsaved changes" on a wording edit; a cleared line (or
// "Use the standard wording") resolving to the standard; the PATCH body; the
// rules a line is held to before Save; placing the API's wording_invalid
// sentence on its field; and source pins for the card, the editor wiring and
// the footer's Save look.
//
// Each test below was made to fail once on purpose (the mutation is named in
// a comment on the test) and then put back.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STANDARD_WORDING,
  WORDING_FIELDS,
  WORDING_KEYS,
  WORDING_MAX,
  choiceFromSaved,
  lookMessage,
  lookSaveBody,
  normalizeFeatures,
  normalizeWording,
  resolvePreviewLook,
  sameChoice,
  wordingErrorFromApi,
  wordingProblem,
  wordingProblems,
} from "../src/pages/oliver/look/lookModel.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const OPTS = { brandAllowed: true, removePoweredBy: false };
const EMPTY = { subtitle: "", greeting: "", book_label: "", request_label: "", change_time_title: "", footer_line: "" };

// The way lib/oliverApi.ts throws a refused request.
function apiError(status, body) {
  return Object.assign(new Error(`OLIVER API ${status}: ${JSON.stringify(body)}`), {
    status, code: body.error, body,
  });
}

// ── The contract ───────────────────────────────────────────────────────────

describe("the six lines and their standard text (D-CP10 contract)", () => {
  // Mutation: STANDARD_WORDING.greeting → "Good {time} {name}" turns this red.
  test("exactly the contract's keys, in order, with its standard text and the 60-character limit", () => {
    assert.deepEqual([...WORDING_KEYS], ["subtitle", "greeting", "book_label", "request_label", "change_time_title", "footer_line"]);
    assert.deepEqual({ ...STANDARD_WORDING }, {
      subtitle: "Customer portal",
      greeting: "Good {time}, {name}",
      book_label: "Book a visit",
      request_label: "Request service",
      change_time_title: "Need to change your time?",
      footer_line: "{business}",
    });
    assert.equal(WORDING_MAX, 60);
    for (const k of WORDING_KEYS) assert.ok(STANDARD_WORDING[k].length <= WORDING_MAX, `${k}'s own standard fits`);
  });

  // Mutation: drop the footer_line row from WORDING_FIELDS turns this red.
  test("one field per key, in the same order, each saying where the customer sees it; hints only where there are braces", () => {
    assert.deepEqual(WORDING_FIELDS.map((f) => f.key), [...WORDING_KEYS]);
    for (const f of WORDING_FIELDS) {
      assert.ok(f.label && !/_/.test(f.label), `${f.key} needs an owner-facing label`);
      assert.ok(f.where && f.where.endsWith("."), `${f.key} needs a plain "where it shows"`);
    }
    const hinted = WORDING_FIELDS.filter((f) => f.hint).map((f) => f.key);
    assert.deepEqual(hinted, ["greeting", "footer_line"]);
    const greeting = WORDING_FIELDS.find((f) => f.key === "greeting").hint;
    assert.match(greeting, /\{time\}/);
    assert.match(greeting, /morning, afternoon or evening/);
    assert.match(greeting, /\{name\}/);
    assert.match(greeting, /first name/);
    assert.match(WORDING_FIELDS.find((f) => f.key === "footer_line").hint, /\{business\}.*business's name/);
  });
});

// ── Reading it back ────────────────────────────────────────────────────────

describe("the saved wording loads back", () => {
  // Mutation: in choiceFromSaved, `wording: normalizeWording(undefined)` turns this red.
  test("the business's own lines, trimmed; the standard and anything that is not text read as empty; unknown keys dropped", () => {
    const c = choiceFromSaved({
      preset: "grounded",
      wording: { greeting: "  Hi {name}  ", subtitle: "Customer portal", footer_line: 5, book_label: "Book now", colour: "red" },
    });
    assert.deepEqual(c.wording, { ...EMPTY, greeting: "Hi {name}", book_label: "Book now" });
    assert.deepEqual(choiceFromSaved({}).wording, EMPTY, "nothing saved: every line shows the standard");
    assert.deepEqual(choiceFromSaved({ wording: "nonsense" }).wording, EMPTY);
  });

  // Mutation: read `s.wording` only (no `look?.wording` fallback) turns this red.
  test("an answer that carries the wording only in the resolved look reads the same; the stored wording wins when both come", () => {
    const resolved = { ...STANDARD_WORDING, request_label: "Ask for a quote" };
    assert.deepEqual(choiceFromSaved({ look: { wording: resolved } }).wording, { ...EMPTY, request_label: "Ask for a quote" });
    assert.deepEqual(
      choiceFromSaved({ wording: { subtitle: "Members area" }, look: { wording: resolved } }).wording,
      { ...EMPTY, subtitle: "Members area" },
    );
  });
});

// ── Unsaved changes ────────────────────────────────────────────────────────

describe("a wording edit marks the look unsaved", () => {
  // Mutation: drop the `return sameWording(...)` line from sameChoice (always true) turns this red.
  test("typing in a line is a change; typing it back, or only adding spaces, is not", () => {
    const saved = choiceFromSaved({ wording: { greeting: "Hello {name}" } });
    const edited = { ...saved, wording: { ...saved.wording, greeting: "Hi {name}" } };
    assert.equal(sameChoice(saved, edited), false, "an edited line is unsaved");
    assert.equal(sameChoice(saved, { ...saved, wording: { ...saved.wording, greeting: "Hello {name}" } }), true);
    assert.equal(sameChoice(saved, { ...saved, wording: { ...saved.wording, greeting: "  Hello {name} " } }), true, "spaces are trimmed on save");
    assert.equal(sameChoice(saved, { ...saved, wording: { ...saved.wording, book_label: "Book a visit" } }), true, "typing the standard changes nothing");
  });

  // Mutation: in sameWording, count an emptied line as no change (`x[k] === y[k] || !y[k]`) turns this red.
  test("clearing a saved line is a change", () => {
    const saved = choiceFromSaved({ wording: { footer_line: "{business} · Since 1998" } });
    assert.equal(sameChoice(saved, { ...saved, wording: { ...EMPTY } }), false);
    assert.equal(sameChoice(choiceFromSaved({}), { ...choiceFromSaved({}), wording: { ...EMPTY } }), true);
  });
});

// ── Cleared means standard ─────────────────────────────────────────────────

describe("a cleared line shows the standard text", () => {
  // Mutation: resolveWording returns `w[key]` without the standard fallback turns this red.
  test("the preview look carries every key: the business's text where set, the standard where empty, braces left for the portal", () => {
    const choice = choiceFromSaved({ wording: { greeting: "  Welcome back, {name}! ", change_time_title: "Running late?" } });
    const look = resolvePreviewLook(choice, null, OPTS);
    assert.deepEqual(look.wording, {
      ...STANDARD_WORDING,
      greeting: "Welcome back, {name}!",
      change_time_title: "Running late?",
    });
    assert.match(look.wording.greeting, /\{name\}/, "the portal fills {name}, not the Portal");
    assert.equal(look.wording.footer_line, "{business}");
  });

  // Mutation: lookSaveBody sends `resolveWording(draft.wording)` (the standard text instead of "") turns this red.
  test("'Use the standard wording' empties all six lines: the preview shows the standard, the save sends \"\" for each", () => {
    const custom = choiceFromSaved({ wording: { subtitle: "Members", greeting: "Hey", book_label: "Book", request_label: "Ask", change_time_title: "Late?", footer_line: "Bye" } });
    const cleared = { ...custom, wording: normalizeWording(null) };
    assert.deepEqual(cleared.wording, EMPTY);
    assert.deepEqual(resolvePreviewLook(cleared, null, OPTS).wording, { ...STANDARD_WORDING });
    assert.deepEqual(lookSaveBody(cleared, true).wording, EMPTY);
    assert.equal(sameChoice(custom, cleared), false, "and it is an unsaved change until Save look");
  });

  // Mutation: drop `wording: resolveWording(choice.wording)` from resolvePreviewLook turns this red.
  test("the message posted to the preview frame carries the wording", () => {
    const look = resolvePreviewLook(choiceFromSaved({ wording: { book_label: "Pick a time" } }), null, OPTS);
    const msg = lookMessage(look);
    assert.equal(msg.type, "oliver-look");
    assert.equal(msg.look.wording.book_label, "Pick a time");
    assert.equal(msg.look.wording.request_label, "Request service");
  });
});

// ── The PATCH body ─────────────────────────────────────────────────────────

describe("Save look sends { preset, use_brand, features, wording }", () => {
  // Mutation: leave `wording` out of lookSaveBody turns this red.
  test("all six lines go every time, trimmed, \"\" for the standard; nothing else rides along", () => {
    const draft = {
      ...choiceFromSaved({ preset: "sturdy", use_brand: true, features: { quotes: false } }),
      wording: { ...EMPTY, greeting: "  Morning, {name} ", book_label: "Book a visit", footer_line: "{business} — licensed & insured" },
    };
    const body = lookSaveBody(draft, true);
    assert.deepEqual(Object.keys(body).sort(), ["features", "preset", "use_brand", "wording"]);
    assert.equal(body.preset, "sturdy");
    assert.equal(body.use_brand, true);
    assert.deepEqual(body.features, normalizeFeatures({ quotes: false }));
    assert.deepEqual(body.wording, { ...EMPTY, greeting: "Morning, {name}", footer_line: "{business} — licensed & insured" });
    assert.deepEqual(Object.keys(body.wording), [...WORDING_KEYS], "every key, so a cleared line is cleared on the server too");
  });

  // Mutation: `use_brand: draft.use_brand` (ignoring the plan) turns this red.
  test("below Standard the brand switch is sent off, as it shows on screen", () => {
    const draft = choiceFromSaved({ use_brand: true });
    assert.equal(lookSaveBody(draft, false).use_brand, false);
    assert.equal(lookSaveBody(draft, true).use_brand, true);
  });
});

// ── The rules a line is held to ────────────────────────────────────────────

describe("before Save: the line rules oliver-api enforces", () => {
  // Mutation: WORDING_MAX check `t.length > WORDING_MAX + 1` turns this red.
  test("up to 60 characters after trimming; 61 is refused with the count", () => {
    const sixty = "x".repeat(60);
    assert.equal(wordingProblem(sixty), null);
    assert.equal(wordingProblem(`   ${sixty}   `), null, "spaces around the line do not count");
    assert.equal(wordingProblem(`${sixty}y`), "Keep this to 60 characters or fewer; it has 61.");
    assert.equal(wordingProblem(""), null);
    assert.equal(wordingProblem("   "), null, "blank means the standard");
  });

  // Mutation: WORDING_TAG → /<script>/i turns this red.
  test("HTML tags and control characters are refused; a lone < or > in a sentence is fine", () => {
    assert.equal(wordingProblem("<b>Hi</b> {name}"), "Plain words only: take out anything written between < and >.");
    assert.equal(wordingProblem("Book <a href=x>now</a>"), "Plain words only: take out anything written between < and >.");
    assert.equal(wordingProblem("Hello</br>"), "Plain words only: take out anything written between < and >.");
    assert.equal(wordingProblem("Prices < $50 > never"), null);
    assert.equal(wordingProblem("Tab\there"), "Keep this to one plain line: take out the tab or line break.");
    assert.equal(wordingProblem("Line\u0007bell"), "Keep this to one plain line: take out the tab or line break.");
    assert.deepEqual(wordingProblems({ ...EMPTY, subtitle: "<i>x</i>", greeting: "Fine" }), {
      subtitle: "Plain words only: take out anything written between < and >.",
    });
    assert.deepEqual(wordingProblems(EMPTY), {});
  });
});

// ── 400 wording_invalid ────────────────────────────────────────────────────

describe("the API's wording_invalid sentence goes on its field", () => {
  // Mutation: read the key from `body.line` only turns this red.
  test("the line named by the answer, and the API's own sentence", () => {
    const e = apiError(400, { error: "wording_invalid", message: "The home greeting can be at most 60 characters.", field: "greeting" });
    assert.deepEqual(wordingErrorFromApi(e), { key: "greeting", message: "The home greeting can be at most 60 characters." });
    const k = apiError(400, { error: "wording_invalid", message: "Plain words only in the footer.", key: "footer_line" });
    assert.deepEqual(wordingErrorFromApi(k), { key: "footer_line", message: "Plain words only in the footer." });
    const d = apiError(400, { error: "wording_invalid", message: "Too long.", details: { field: "subtitle" } });
    assert.equal(wordingErrorFromApi(d).key, "subtitle");
  });

  // Mutation: return null when no key is named turns this red.
  test("a refusal that names no line (or an unknown one) still carries the sentence; a thrown message alone is read too", () => {
    const e = apiError(400, { error: "wording_invalid", message: "Each line must be plain words.", field: "headline" });
    assert.deepEqual(wordingErrorFromApi(e), { key: null, message: "Each line must be plain words." });
    const bare = new Error('OLIVER API 400: {"error":"wording_invalid","message":"Too long.","field":"book_label"}');
    assert.deepEqual(wordingErrorFromApi(bare), { key: "book_label", message: "Too long." });
  });

  // Mutation: drop the `code !== "wording_invalid"` check turns this red.
  test("every other error is not a wording error", () => {
    assert.equal(wordingErrorFromApi(apiError(400, { error: "look_unreadable", message: "The main colour …", pair: "primary_on_surface" })), null);
    assert.equal(wordingErrorFromApi(new Error("Failed to fetch")), null);
    assert.equal(wordingErrorFromApi({ type: "tier_gate", message: "Pro plan" }), null);
    assert.equal(wordingErrorFromApi(null), null);
    assert.equal(wordingErrorFromApi("wording_invalid"), null);
  });
});

// ── The card, the editor, the footer (source pins) ─────────────────────────

describe("the Wording card on the Look tab", () => {
  const tab = read("src/pages/oliver/look/LookTab.tsx");

  // Mutation: move <WordingCard … /> above the Buttons & functions section turns this red.
  test("sits under Buttons & functions, in the left-hand settings beside the live preview", () => {
    const buttons = tab.indexOf("Buttons &amp; functions</h3>");
    const card = tab.indexOf("<WordingCard editor={editor} wording={draft.wording} />");
    const preview = tab.indexOf("Right: the live preview");
    assert.ok(buttons > 0 && card > 0 && preview > 0);
    assert.ok(buttons < card && card < preview, "Buttons & functions, then Wording, then the preview");
  });

  // Mutation: change the input's placeholder to {field.label} turns this red.
  test("six fields from WORDING_FIELDS: standard text as placeholder, a 60 limit with a counter, the hint, the problem", () => {
    const card = tab.slice(tab.indexOf("function WordingCard("), tab.indexOf("// ── Live preview"));
    assert.match(card, /<h3 id="look-wording-heading"[^>]*>Wording<\/h3>/);
    assert.match(card, /WORDING_FIELDS\.map\(\(f\) => \(/);
    assert.match(card, /placeholder=\{STANDARD_WORDING\[field\.key\]\}/);
    assert.match(card, /maxLength=\{WORDING_MAX\}/);
    assert.match(card, /\{count\}\/\{WORDING_MAX\}/);
    assert.match(card, /\{field\.hint && <p id=\{hintId\}/);
    assert.match(card, /\{problem && <p id=\{problemId\} role="alert"/);
    assert.match(card, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
    assert.match(card, /onChange=\{\(text\) => editor\.setWording\(f\.key, text\)\}/);
  });

  // Mutation: the link calls editor.discard instead of editor.clearWording turns this red.
  test("one 'Use the standard wording' link that clears all six", () => {
    const card = tab.slice(tab.indexOf("function WordingCard("), tab.indexOf("function WordingInput("));
    const links = card.match(/Use the standard wording\s*<\/button>/g) || [];
    assert.equal(links.length, 1);
    assert.match(card, /onClick=\{editor\.clearWording\}/);
    assert.match(tab, /clearWording: \(\) => edit\(\(d\) => \(\{ \.\.\.d, wording: normalizeWording\(null\) \}\)\)/);
  });

  // Mutation: the field's problem reads only editor.wordingProblems (not the API's) turns this red.
  test("the API's wording_invalid sentence is printed under its field, the cursor goes there, and it is not repeated in the banner", () => {
    assert.match(tab, /problem=\{apiError\?\.key === f\.key \? apiError\.message : editor\.wordingProblems\[f\.key\] \?\? null\}/);
    assert.match(tab, /document\.getElementById\(wordingInputId\(apiError\.key\)\)/);
    assert.match(tab, /const wording = wordingErrorFromApi\(e\);\s*setWordingError\(wording\);\s*setSaveError\(wording \? null : apiErrorMessage\(e\)\);/);
    assert.match(tab, /\{apiError && !apiError\.key && \(/, "a sentence naming no line shows at the top of the card");
  });

  // Mutation: setWording writes without going through edit( turns this red.
  test("an edit goes through the editor (dirty, errors cleared, preview repainted) and Save look sends lookSaveBody", () => {
    assert.match(tab, /setWording: \(k, text\) => edit\(\(d\) => \(\{ \.\.\.d, wording: \{ \.\.\.d\.wording, \[k\]: text \} \}\)\)/);
    const edit = tab.slice(tab.indexOf("const edit = useCallback"), tab.indexOf("const save = useCallback"));
    assert.match(edit, /setWordingError\(null\)/);
    assert.match(tab, /draft \? resolvePreviewLook\(draft, brand,/, "the preview is painted from the draft, wording included");
    assert.match(tab, /useEffect\(\(\) => \{ if \(ready\) send\(\); \}, \[ready, look, send\]\);/, "every change is posted");
    assert.match(tab, /const body = lookSaveBody\(draft, allowances\.brand\);/);
    assert.match(tab, /if \(!draft \|\| saving \|\| problems\.length \|\| wordingBlocked\) return;/);
  });

  // Mutation: drop `|| wordingBlocked` from the hub's saveBlocked turns this red.
  test("Save look in the footer stays off while a line can't be saved", () => {
    const hub = read("src/pages/oliver/OliverPortalsHubPage.tsx");
    assert.match(hub, /const wordingBlocked = Object\.keys\(look\.wordingProblems\)\.length > 0;/);
    assert.match(hub, /const saveBlocked = !look\.dirty \|\| look\.saving \|\| look\.problems\.length > 0 \|\| wordingBlocked;/);
  });
});
