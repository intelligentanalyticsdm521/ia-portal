// test/portal-settings-window.test.mjs — the OLIVER portal settings window
// (Customer & Crew Portals → Edit portal), 1 Oct 2026.
//
// Brandon, walking Section 21 of the test book, on the Signup form tab:
//
//   "the save signup form button can we move that next to done. I missed it
//    because you have to scroll down to do it."
//   "since there is so much with this customer portal settings, layout and
//    forms and whatnot, lets make this our extra large modal"
//
// So two things hold here and are easy to lose in a refactor:
//
//   1. "Save signup form" is a FOOTER button of the window, rendered beside
//      Done, and the signup panel itself renders no Save of its own when the
//      window owns the draft (SignupFormBuilder inline + draft prop).
//   2. The window is size="xl" — 90vw × 90vh, the extra-large modal — and the
//      signup panel fills that height with three columns that scroll on
//      their own, rather than the whole tab scrolling to reach a button.
//
// The Portal's runner is `node --test` over pure modules, so like the other
// portal tests this one reads the source and the pure size table.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODAL_SIZES, widthFractionAt, heightFractionOf } from "../src/components/iadmModalSizes.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const hub = read("src/pages/oliver/OliverPortalsHubPage.tsx");
const builder = read("src/components/oliver/SignupFormBuilder.tsx");

// The one IadmModal that is the settings window: from `<IadmModal` with the
// portal settings title up to its closing tag.
const windowStart = hub.indexOf("portal settings`}");
const windowSrc = hub.slice(hub.lastIndexOf("<IadmModal", windowStart), hub.indexOf("</IadmModal>", windowStart));
const footerSrc = windowSrc.slice(windowSrc.indexOf("footer={"), windowSrc.indexOf("<div className=\"flex h-full flex-col\">"));

test("the settings window is the extra-large modal", () => {
  assert.match(windowSrc, /size="xl"/, "the portal settings window is not size=\"xl\"");
  assert.doesNotMatch(windowSrc, /size="info"/);
  assert.equal(MODAL_SIZES.xl.width, "90vw");
  assert.equal(MODAL_SIZES.xl.height, "90vh");
  assert.equal(widthFractionAt("xl", 2560), 0.9);
  assert.equal(heightFractionOf("xl"), 0.9);
});

test("'Save signup form' is a footer button beside Done, shown on the Signup form tab", () => {
  assert.match(footerSrc, /tab === "signup" && \(/, "the footer has no Signup form branch");
  const signupBranch = footerSrc.slice(footerSrc.indexOf('tab === "signup" && ('), footerSrc.indexOf('tab === "look" ?'));
  assert.match(signupBranch, /"Save signup form"/);
  assert.match(signupBranch, /onClick=\{\(\) => \{ void signup\.save\(\); \}\}/);
  assert.match(signupBranch, /signup\.dirty \? "Unsaved changes" : "All changes saved"/);
  // Done comes after it in the same footer, so the two sit side by side.
  assert.ok(footerSrc.indexOf("Save signup form") < footerSrc.indexOf(">Done</IadmButton>"));
});

test("the window owns the signup draft, so the panel renders no Save of its own and an edit survives a tab change", () => {
  assert.match(hub, /function useSignupEditor\(/);
  assert.match(hub, /const signup = useSignupEditor\(onSaved\);/);
  // The tab hands the draft down and takes edits back up.
  assert.match(hub, /draft=\{editor\.draft\}/);
  assert.match(hub, /onDraftChange=\{editor\.setDraft\}/);
  // The old tab-local state is gone (it reloaded the config on every tab visit).
  assert.doesNotMatch(hub, /function SignupTabStub/);
  // The builder: controlled when a draft is given; its own Save only otherwise.
  assert.match(builder, /const controlled = inline && draftProp !== undefined;/);
  const inlineBranch = builder.slice(builder.indexOf("if (inline) {"), builder.indexOf("return (\n    <IadmModal") > 0 ? builder.indexOf("return (\n    <IadmModal") : builder.indexOf("return (\r\n    <IadmModal"));
  assert.match(inlineBranch, /\{!controlled && \(/, "the inline panel's Save is not gated on the window not owning the draft");
});

test("the signup panel fills the window's height instead of the tab scrolling", () => {
  assert.match(hub, /<SignupTab portalKind=\{portalKind\} editor=\{signup\} \/>/);
  const body = hub.slice(hub.indexOf('tab === "signup" ? ('), hub.indexOf("<SignupTab "));
  assert.match(body, /min-h-0 flex-1 flex-col overflow-hidden/);
  assert.doesNotMatch(builder, /min-h-\[520px\]/, "the fixed 520px floor is back; the panel should take the window's height");
  assert.match(builder, /className="flex h-full min-h-0 flex-col"/);
});

test("closing with an unsaved signup form asks first, like an unsaved look", () => {
  assert.match(hub, /const unsavedSignup = signup\.dirty && !signup\.saving;/);
  assert.match(hub, /if \(unsavedLook \|\| unsavedSignup\) setConfirmClose\(true\);/);
  assert.match(hub, /subtitle=\{`Your portal's \$\{unsavedWhat\}`\}/);
  // The Signup form tab shows the amber dot when its draft differs.
  assert.match(hub, /\(t\.key === "signup" && signup\.dirty\)/);
});
