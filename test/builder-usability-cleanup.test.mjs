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
//   · find.ts: `createsRecords` back to `return false`                      → RED
//     (builder-polish.test.mjs — and it was GREEN before this pass, which is
//      the whole point)
//   · find.ts: drop the `createsRecord !== true` filter in findResults      → RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  PROPOSAL_ANCHORS, ANCHORLESS, requestItemAnchor, isRequestItemAnchor,
} from "../src/builder/proposal/refusalAnchors.ts";

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
 * Strip comments, then look for the CALL.
 *
 * Comments are stripped because the files that dropped a `window.confirm` say
 * so in the comment above the replacement, and a scanner that cannot tell a
 * mention from a call is a scanner that gets deleted the first time it cries
 * wolf. The fixture below proves both halves: a call is caught, a mention is
 * not.
 */
export function nativeDialogHits(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")           // /* … */ and JSX {/* … */}
    .split("\n")
    .map((line) => line.replace(/(^|[^:\w])\/\/.*$/, "$1"))
    .join("\n");
  return [...code.matchAll(/\bwindow\.(confirm|prompt|alert)\s*\(/g)].map((m) => m[1]);
}

const SWEPT = ["builder", path.join("arion", "pages", "website"), path.join("pages", "spark")];

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("§11.11 · the builder surfaces ask in the app's own dialog", () => {
  test("the scanner catches a call and ignores a mention (the known-bad fixture)", () => {
    // PRESENCE, not absence: a sweep test that can only ever say "nothing
    // found" is a sweep test that passes when the regex is broken.
    const bad = 'function go() {\n  if (!window.confirm("Delete it?")) return;\n}\n';
    assert.deepEqual(nativeDialogHits(bad), ["confirm"], "a real call must be caught");
    assert.deepEqual(nativeDialogHits('const x = window.prompt("name");'), ["prompt"]);
    assert.deepEqual(nativeDialogHits("window.alert('oops')"), ["alert"]);
    // …and the mentions the swept files legitimately carry are NOT hits.
    assert.deepEqual(nativeDialogHits("// it used to be a window.confirm(…) here"), []);
    assert.deepEqual(nativeDialogHits("/* window.prompt(\"x\") */"), []);
    assert.deepEqual(nativeDialogHits(" * It replaces a `window.prompt`, which is grey."), []);
  });

  test("not one native dialog survives under builder, arion/pages/website or pages/spark", () => {
    const offenders = [];
    for (const rel of SWEPT) {
      for (const file of filesUnder(path.join(SRC_ROOT, rel))) {
        const hits = nativeDialogHits(readFileSync(file, "utf8"));
        if (hits.length) offenders.push(`${path.relative(SRC_ROOT, file)} → window.${hits.join(", window.")}`);
      }
    }
    assert.deepEqual(offenders, [],
      "the browser's grey box is back on a builder surface:\n  " + offenders.join("\n  "));
  });

  test("the scanner is actually looking at the files it claims to", () => {
    // Belt and braces on the walk itself: if `filesUnder` ever returns nothing
    // the sweep above passes vacuously.
    const seen = SWEPT.flatMap((rel) => filesUnder(path.join(SRC_ROOT, rel)));
    assert.ok(seen.length > 40, `expected the three trees to hold real files, saw ${seen.length}`);
    assert.ok(seen.some((f) => f.endsWith("WebsiteBuilder.tsx")));
    assert.ok(seen.some((f) => f.endsWith("SparkAgentsPage.tsx")));
    assert.ok(seen.some((f) => f.endsWith("WebsiteUpdates.tsx")));
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

  test("the website inspector no longer asks the same question twice", () => {
    const inspector = SRC("builder/adapters/website/SiteInspectorExtras.tsx");
    assert.match(inspector, /void deps\.onUndoAdoption/);
    assert.equal(/if \(window\.confirm/.test(inspector), false);
    // The adapter owns the one question.
    assert.match(website, /Put this section back the way your website built it\?/);
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
