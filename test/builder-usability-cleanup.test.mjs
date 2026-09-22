// test/builder-usability-cleanup.test.mjs — the usability CLEANUP pass
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.11, 2026-09-17).
//
// Three things the 2026-09-16 pass left half-done, and one thing it left
// dressed up as finished:
//
//   1. THE LAST THREE REFUSALS. D-20 said a refusal must appear at the control
//      that was pressed. Three did not: the template save, the two answers to
//      "Save these details to the property", and a request tick that failed to
//      write. All three printed in the far-left pane's red line while their
//      button was elsewhere on the screen. They now name an anchor, and the
//      pane-bottom line is DELETED — there is no second place a message lands.
//
//   2. THE BROWSER'S GREY BOXES. `window.confirm` / `window.prompt` on the
//      builder surfaces: six in the website builder, one in its inspector, one
//      in the newsletter list, one in the SPARK agents page, one in the website
//      updates page — beside a Publish that already asked in an `IadmModal`.
//      One dialog now, everywhere.
//
//   2b. …AND THE GUARD THAT COULD NOT SEE HALF OF THEM (2026-09-17). The sweep
//      matched `/\bwindow\.(confirm|prompt|alert)\s*\(/` — the QUALIFIED
//      spelling only. A verifier dropped a bare `confirm("Are you sure?")` into
//      a swept file and this test stayed green, with 211 live native dialogs
//      sitting inside the trees it walks. The scanner now matches both
//      spellings and lives in scripts/dev/native-dialog-scanner.mjs, and:
//        · src/builder and src/arion/pages/website are asserted at ZERO
//          (WebsiteSupport's alert() is now a refusal beside its Submit button,
//           the D-20 way — an alert is a statement, so no dialog replaces it);
//        · src/pages/spark is a RATCHET at 210 calls across 49 files —
//          test/fixtures/native-dialog-ratchet.json. SWEEPING THOSE 210 IS
//          SCHEDULED WORK (tracker, §11.11). This test does not claim they are
//          gone; it claims the pile can only shrink. Lower the bar with
//          `npm run ratchet:native-dialogs` after removing some.
//
//   3. `createsRecords()` WAS `return false`. A constant in the shape of a
//      guard. It is now read off the action rows, and `findResults` drops a
//      flagged row rather than trusting the comment above it. (Driven in
//      builder-polish.test.mjs, beside the rest of Find.)
//
// MUTATIONS RUN AND RESTORED (2026-09-17), so the next person can re-run them:
//   · ProposalBuilder: drop `data-builder-anchor` from "Save as template"   → RED
//     ("save-template is refused with but never rendered")
//   · WebsiteBuilder: put one `window.confirm(...)` back                    → RED
//     (the sweep test names the file and the line)
//   · WebsiteBuilder: put one BARE `confirm("Are you sure?")` back          → RED
//     (2026-09-17 — this one was GREEN before this pass; that is the point)
//   · SparkTasksPage: one bare `confirm(...)` beyond the recorded count     → RED
//     ("1 recorded, 2 found", with src/pages/spark/…:LINE printed)
//   · find.ts: `createsRecords` back to `return false`                      → RED
//     (builder-polish.test.mjs — and it was GREEN before this pass, which is
//      the whole point)
//   · find.ts: drop the `createsRecord !== true` filter in findResults      → RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PROPOSAL_ANCHORS, ANCHORLESS, requestItemAnchor, isRequestItemAnchor,
} from "../src/builder/proposal/refusalAnchors.ts";
import {
  NATIVE_DIALOG_CALL, nativeDialogSites, nativeDialogHits, filesUnder, scanTree,
} from "../scripts/dev/native-dialog-scanner.mjs";

export { nativeDialogHits };

const SRC_ROOT = path.join(process.cwd(), "src");
const SRC = (p) => readFileSync(path.join(SRC_ROOT, p), "utf8");

/* ══════════════════════════════════════════════════════════════════════════
   1 — every refusal names a control, and every named control exists
   ══════════════════════════════════════════════════════════════════════════ */

const PROPOSAL = SRC("builder/proposal/ProposalBuilder.tsx");

/** Every anchor name this file refuses WITH, however it is spelled. */
function refusedAnchors(src) {
  const names = new Set();
  // refuse("save-close", …) and refuse("load", …)
  for (const m of src.matchAll(/refuse\(\s*"([^"]+)"/g)) names.add(m[1]);
  // const anchor = send ? "send" : "save";  → both branches
  for (const line of src.split("\n")) {
    if (!/const\s+anchor\s*=/.test(line)) continue;
    for (const m of line.matchAll(/"([^"]+)"/g)) names.add(m[1]);
  }
  // refuse(PROPOSAL_ANCHORS.saveTemplate, …) → the table's own value
  for (const m of src.matchAll(/refuse\(\s*PROPOSAL_ANCHORS\.(\w+)/g)) {
    names.add(PROPOSAL_ANCHORS[m[1]]);
  }
  return names;
}

/** Every anchor name this file RENDERS on a control. */
function renderedAnchors(src) {
  const names = new Set();
  for (const m of src.matchAll(/data-builder-anchor="([^"]+)"/g)) names.add(m[1]);
  for (const m of src.matchAll(/data-builder-anchor=\{PROPOSAL_ANCHORS\.(\w+)\}/g)) {
    names.add(PROPOSAL_ANCHORS[m[1]]);
  }
  return names;
}

describe("D-20 · a refusal appears at the control that was pressed — all of them", () => {
  test("every anchor the builder refuses with is rendered on a control", () => {
    const refused = refusedAnchors(PROPOSAL);
    const rendered = renderedAnchors(PROPOSAL);
    assert.ok(refused.size >= 5, `expected the refusals to be found, got ${[...refused]}`);
    for (const name of refused) {
      if (ANCHORLESS[name]) continue;                // deliberate, and said why
      assert.ok(
        rendered.has(name),
        `"${name}" is refused with but never rendered — that refusal lands at the top of the window, not beside its button`,
      );
    }
  });

  test("every anchor in the table is BOTH refused with and rendered", () => {
    const refused = refusedAnchors(PROPOSAL);
    const rendered = renderedAnchors(PROPOSAL);
    for (const name of Object.values(PROPOSAL_ANCHORS)) {
      assert.ok(rendered.has(name), `${name}: no control carries it`);
      assert.ok(refused.has(name), `${name}: nothing ever refuses at it — a dead anchor`);
    }
  });

  test("the three that were left behind each name their own control", () => {
    // Save as template — the header button, not the pane.
    assert.match(PROPOSAL, /data-builder-anchor=\{PROPOSAL_ANCHORS\.saveTemplate\}/);
    assert.match(PROPOSAL, /refuse\(PROPOSAL_ANCHORS\.saveTemplate, `Could not save the template/);
    // The property save — BOTH answers, the refusal and the failure.
    const property = [...PROPOSAL.matchAll(/refuse\(PROPOSAL_ANCHORS\.propertySave,/g)];
    assert.equal(property.length, 2, "both property-field answers go to the button");
    assert.match(PROPOSAL, /data-builder-anchor=\{PROPOSAL_ANCHORS\.propertySave\}/);
    // The request tick — per ROW, so the sentence is under the box that moved.
    assert.match(PROPOSAL, /refuse\(requestItemAnchor\(index\), `Could not save that tick/);
    assert.match(PROPOSAL, /data-builder-anchor=\{requestItemAnchor\(i\)\}/);
  });

  test("the pane-bottom red line is GONE, and so is the state behind it", () => {
    assert.equal(/\bsetErr\(/.test(PROPOSAL), false,
      "setErr survives — that is the second home for a message this pass deleted");
    assert.equal(/const \[err, setErr\]/.test(PROPOSAL), false);
    assert.equal(/\{err &&/.test(PROPOSAL), false,
      "the pane still renders `err` — a refusal can still land where nobody looks");
  });

  test("the one anchorless refusal is the one that HAS no control, and says so", () => {
    assert.deepEqual(Object.keys(ANCHORLESS), ["load"]);
    assert.match(ANCHORLESS.load, /no control/);
    // It is a load failure in both spellings — the document and the revision.
    assert.equal([...PROPOSAL.matchAll(/refuse\("load",/g)].length, 2);
  });

  test("request-item anchors are per row, and read as such", () => {
    assert.equal(requestItemAnchor(0), "request-item-0");
    assert.equal(requestItemAnchor(11), "request-item-11");
    assert.notEqual(requestItemAnchor(0), requestItemAnchor(1),
      "one anchor for every tick would put the sentence under the wrong box");
    assert.ok(isRequestItemAnchor("request-item-3"));
    assert.equal(isRequestItemAnchor("save"), false);
    assert.equal(isRequestItemAnchor("request-item-"), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 — the browser's grey boxes are gone from the builder surfaces
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The scanner lives in scripts/dev/native-dialog-scanner.mjs so this guard and
 * the ratchet regenerator cannot drift apart. Its regex, in full:
 *
 *     /(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/g
 *
 * BOTH SPELLINGS. Until 2026-09-17 it read `/\bwindow\.(confirm|prompt|alert)\s*\(/`
 * and therefore saw only half the calls there are. A verifier dropped a bare
 * `confirm("Are you sure?")` into a swept file and this test stayed green while
 * 211 live native dialogs sat inside the very trees it walks. That is the
 * failure mode a sweep test exists to prevent, so the fixture below now asserts
 * the BARE call is caught, not just the qualified one.
 */
const ZERO_TREES = ["builder", path.join("arion", "pages", "website")];
const RATCHET_TREE = "pages/spark";
const RATCHET = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "native-dialog-ratchet.json"), "utf8"),
);

describe("§11.11 · the builder surfaces ask in the app's own dialog", () => {
  test("the scanner catches BOTH spellings of a call, and ignores everything else", () => {
    // PRESENCE, not absence: a sweep test that can only ever say "nothing
    // found" is a sweep test that passes when the regex is broken.
    // ── qualified ──
    assert.deepEqual(
      nativeDialogHits('function go() {\n  if (!window.confirm("Delete it?")) return;\n}\n'),
      ["confirm"], "a real call must be caught");
    assert.deepEqual(nativeDialogHits('const x = window.prompt("name");'), ["prompt"]);
    assert.deepEqual(nativeDialogHits("window.alert('oops')"), ["alert"]);
    assert.deepEqual(nativeDialogHits("window . confirm('spaced out')"), ["confirm"]);
    // ── BARE, the half that used to walk straight through ──
    assert.deepEqual(nativeDialogHits('confirm("Are you sure?")'), ["confirm"],
      "a BARE confirm is the same grey box — the old regex missed every one of these");
    assert.deepEqual(nativeDialogHits('if (!confirm("Delete this secret?")) return;'), ["confirm"]);
    assert.deepEqual(nativeDialogHits("alert(`Failed: ${e.message}`);"), ["alert"]);
    assert.deepEqual(nativeDialogHits('const name = prompt("Name?");'), ["prompt"]);
    assert.deepEqual(nativeDialogHits('await x(); alert("done");'), ["alert"]);
    // ── somebody ELSE's method of the same name is NOT the browser's ──
    assert.deepEqual(nativeDialogHits('foo.confirm("x")'), [], "a method on another object");
    assert.deepEqual(nativeDialogHits('dialog.confirm("x")'), []);
    assert.deepEqual(nativeDialogHits("modal.alert('x')"), []);
    assert.deepEqual(nativeDialogHits("this.prompt('x')"), []);
    assert.deepEqual(nativeDialogHits("deps.onConfirm(); reconfirm(); myAlert('x'); alerts(1)"), [],
      "neither a longer identifier nor a differently-cased one is the global");
    // ── and a MENTION is not a call ──
    assert.deepEqual(nativeDialogHits('// it used to be a confirm("x") here'), [],
      "a line comment naming confirm( must not be a hit");
    assert.deepEqual(nativeDialogHits("// it used to be a window.confirm(…) here"), []);
    assert.deepEqual(nativeDialogHits('/* confirm("x") and alert("y") */'), []);
    assert.deepEqual(nativeDialogHits(" * It replaces a `window.prompt`, which is grey."), []);
    // …and in CRLF, which is what every file in this repo actually is. The old
    // rule was `/(^|[^:\w])\/\/.*$/` — `.` does not match `\r`, so it never
    // stripped a single line comment here and a mention WAS a hit.
    assert.deepEqual(nativeDialogHits('  // alert(1)\r\nconst a = 1;\r\n'), [],
      "a line comment in CRLF must still be a comment");
    assert.deepEqual(nativeDialogSites('  // alert(1)\r\nalert(2);\r\n'), [{ kind: "alert", line: 2 }]);
    // A URL in a string is not the start of a comment.
    assert.deepEqual(nativeDialogHits('const u = "https://x.io/a"; alert(1);'), ["alert"]);
    // ── the line number is the line a human would open ──
    assert.deepEqual(nativeDialogSites('const a = 1;\n\nalert("no");\n'), [{ kind: "alert", line: 3 }]);
    assert.deepEqual(
      nativeDialogSites('/* two\n   line\n   comment */\nconfirm("x");\n'),
      [{ kind: "confirm", line: 4 }],
      "blanking a block comment must not shift the lines below it");
    // The regex is a literal in the scanner, not something this test rebuilt.
    assert.equal(NATIVE_DIALOG_CALL.source,
      "(?<![.\\w$])(?:window\\s*\\.\\s*)?(confirm|prompt|alert)\\s*\\(");
  });

  test("ZERO native dialogs under src/builder and src/arion/pages/website", () => {
    const offenders = [];
    for (const rel of ZERO_TREES) {
      const { sites } = scanTree(SRC_ROOT, rel);
      for (const [file, found] of Object.entries(sites)) {
        for (const s of found) offenders.push(`src/${file}:${s.line} → ${s.kind}(`);
      }
    }
    assert.deepEqual(offenders, [],
      "the browser's grey box is back on a builder surface:\n  " + offenders.join("\n  "));
  });

  test("the scanner is actually looking at the files it claims to", () => {
    // Belt and braces on the walk itself: if `filesUnder` ever returns nothing
    // the sweeps above pass vacuously.
    const seen = [...ZERO_TREES, RATCHET_TREE]
      .flatMap((rel) => filesUnder(path.join(SRC_ROOT, rel)));
    assert.ok(seen.length > 40, `expected the three trees to hold real files, saw ${seen.length}`);
    assert.ok(seen.some((f) => f.endsWith("WebsiteBuilder.tsx")));
    assert.ok(seen.some((f) => f.endsWith("SparkAgentsPage.tsx")));
    assert.ok(seen.some((f) => f.endsWith("WebsiteUpdates.tsx")));
    assert.ok(seen.some((f) => f.endsWith("WebsiteSupport.tsx")));
  });

  test("the website support form refuses BESIDE its button, not in a grey box", () => {
    const support = SRC("arion/pages/website/WebsiteSupport.tsx");
    // It was an alert() — a statement, not a question — so it is neither a
    // ConfirmDialog (which has a yes and a no) nor a NameBlockDialog (which
    // takes a name). D-20 says a refusal appears at the control that was
    // pressed: it now shares the slot the success line already occupies.
    assert.deepEqual(nativeDialogHits(support), [], "the alert() is gone");
    assert.match(support, /This used to be `alert\('Failed to submit request/,
      "…and the comment saying so is a MENTION, which the scanner must not count");
    assert.match(support, /const \[refusal, setRefusal\] = useState\(''\)/);
    assert.match(support, /setRefusal\('We could not send that request just now/);
    assert.match(support, /data-support-refusal=\{refusal \? 'yes' : undefined\}/);
    assert.match(support, /\{refusal \|\| \(submitted \? 'Request submitted!' : ''\)\}/);
    // Pressing Submit again must not show yesterday's refusal.
    assert.match(support, /setSubmitting\(true\);\s*\n\s*setRefusal\(''\);/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2b — src/pages/spark: a RATCHET, not a claim
   ──────────────────────────────────────────────────────────────────────────
   210 native dialogs across 49 files still live under src/pages/spark. This
   test does NOT say they are gone — SWEEPING THEM IS SCHEDULED WORK, tracked on
   MASTER_TRACKER_2026-09-04.md beside the rest of §11.11. What it says is that
   the pile may only ever get smaller: the count per file is checked in at
   test/fixtures/native-dialog-ratchet.json, and a new dialog in any of those
   files — or in a file that has none today — is a failure that prints the line.

   When you remove some, run `npm run ratchet:native-dialogs` to lower the bar.
   The regenerator refuses to RAISE it.
   ══════════════════════════════════════════════════════════════════════════ */

describe("§11.11 · src/pages/spark native dialogs only ever go down", () => {
  test("the ratchet baseline is the real shape of the tree, not a guess", () => {
    assert.equal(RATCHET.tree, "src/pages/spark");
    assert.ok(RATCHET.total > 0, "a zero baseline would make this test vacuous");
    assert.equal(RATCHET.fileCount, Object.keys(RATCHET.files).length);
    assert.equal(
      Object.values(RATCHET.files).reduce((a, b) => a + b, 0), RATCHET.total,
      "the per-file counts must add up to the recorded total");
    assert.match(RATCHET.$comment, /RATCHET, not a claim that they are gone/);
  });

  test("no file gains a native dialog, and the total never grows", () => {
    const { counts, sites } = scanTree(SRC_ROOT, RATCHET_TREE);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const grown = [];
    for (const [file, n] of Object.entries(counts)) {
      const allowed = RATCHET.files[file] ?? 0;
      if (n <= allowed) continue;
      // Every site in the file, not a guessed tail: the ratchet stores a COUNT,
      // so it cannot say which of these is the new one. Printing all of them is
      // what lets the reader find it.
      const lines = sites[file].map((s) => `src/${file}:${s.line} → ${s.kind}(`);
      grown.push(`${file}: ${allowed} recorded, ${n} found — one of these is new\n      ${lines.join("\n      ")}`);
    }
    assert.deepEqual(grown, [],
      "a native browser dialog was ADDED under src/pages/spark. Use ConfirmDialog, " +
      "NameBlockDialog, or an inline refusal beside the control:\n    " + grown.join("\n    "));

    assert.ok(total <= RATCHET.total,
      `src/pages/spark native dialogs went UP: ${RATCHET.total} recorded, ${total} found`);
  });

  test("when they are removed, the baseline is stale — say so rather than drifting", () => {
    const { counts } = scanTree(SRC_ROOT, RATCHET_TREE);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    assert.equal(total, RATCHET.total,
      total < RATCHET.total
        ? `${RATCHET.total - total} native dialogs were removed — lower the bar with ` +
          "`npm run ratchet:native-dialogs` so the next one cannot sneak back in"
        : `the ratchet is out of date: ${RATCHET.total} recorded, ${total} found`);
  });
});

describe("§11.11 · ONE confirm mechanism, and it is the app's modal", () => {
  const dialog = SRC("components/ConfirmDialog.tsx");
  const website = SRC("builder/adapters/website/WebsiteBuilder.tsx");

  test("ConfirmDialog IS the IadmModal the Publish confirms already used", () => {
    assert.match(dialog, /size="confirm"/);
    assert.match(dialog, /from "\.\/IadmModal"/);
    // Named buttons, never OK/Cancel — that is the whole complaint.
    assert.match(dialog, /confirmLabel/);
    assert.equal(/>OK</.test(dialog), false);
    assert.match(dialog, /cancelLabel \|\| "Not now"/);
  });

  test("the website builder asks its SIX questions through one piece of state", () => {
    const asks = [...website.matchAll(/setConfirmAsk\(\{/g)].length;
    assert.ok(asks >= 6, `expected every question to go through setConfirmAsk, found ${asks}`);
    assert.equal([...website.matchAll(/<ConfirmDialog /g)].length, 1,
      "one dialog in the tree, not one per question");
    // Publish came the other way — it was already a modal, and is now the same
    // modal as the rest rather than a seventh hand-rolled one.
    assert.match(website, /const askPublish = useCallback/);
    assert.equal(/confirmPublish/.test(website), false, "the bespoke publish modal is deleted");
  });

  test("the website inspector never reaches for the browser's own box", () => {
    /* The question this row was written about — "Undo adoption", asked once by
       `window.confirm` and again by the adapter — is GONE with adoption itself
       (B-168, 2026-09-22). The rule it was protecting is not: no file in this
       builder asks anything with the browser's grey box.  */
    const inspector = SRC("builder/adapters/website/SiteInspectorExtras.tsx");
    // The CODE, not the comment that records why the code is the way it is.
    const live = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.equal(/window\.confirm/.test(live(inspector)), false);
    assert.equal(/window\.confirm/.test(live(website)), false);
    assert.equal(/onUndoAdoption|onAdopt/.test(inspector), false, "adoption is deleted, not hidden");
  });

  test("Save as template asks in the builder's own dialog, with two boxes", () => {
    assert.match(PROPOSAL, /<NameBlockDialog/);
    assert.match(PROPOSAL, /confirmLabel="Save the template"/);
    assert.match(PROPOSAL, /setNamingTemplate\(true\)/);
    // The note the author types is what the gallery row says.
    assert.match(PROPOSAL, /description: note \|\|/);
  });

  test("the agents page asks its one question in the ONE-field dialog", () => {
    const agents = SRC("pages/spark/SparkAgentsPage.tsx");
    const nameDialog = SRC("builder/NameBlockDialog.tsx");
    assert.match(agents, /<NameBlockDialog/);
    assert.match(agents, /askNote=\{false\}/);
    // One dialog with a switch, not a second component that drifts.
    assert.match(nameDialog, /p\.askNote !== false && \(/);
    assert.match(nameDialog, /namePlaceholder/);
  });
});
