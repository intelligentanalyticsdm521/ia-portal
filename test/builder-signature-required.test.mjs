// test/builder-signature-required.test.mjs — D-174, the Portal's half.
//
// WHAT WAS WRONG. The Signature widget has carried `required: true` in its
// defaults since it existed and NOTHING read it — not the panel, which had no
// switch for it, and not the server, which refused every acceptance without a
// typed name whatever the document said. And the customer signed in a panel at
// the FOOT of the page, not on the acceptance block they were looking at.
//
// WHAT THIS PINS:
//   · the switch is a real control on the widget's own Content tab, drawn by
//     the one control mechanism — nothing new anywhere on the builder screen.
//   · a switch with nothing stored shows the widget's OWN default, so a block
//     a template placed cannot say "off" while the server says "on".
//   · the acceptance block is a paper form: Printed name · Signature · Date,
//     twice, and one painter draws all four of its states.
//   · the customer's page reads `signature_required` and never computes it.
//
// MUTATION CHECKS — each break run, seen red, and restored (2026-09-22):
//   · registry: delete the `required` control       → "the switch is on the panel" red
//   · definitionControls: `isOn(valueOf(c))`        → "shows the widget's own default" red
//   · render: drop `ctx.signing` from `signable`    → "the boxes are ON the block" red
//   · render: delete the `p.approved` branch        → "an approved block never shows rules" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { WIDGETS_BY_KIND, controlTab } from "../src/builder/registry.ts";
import { defaultOf, isOn } from "../src/builder/definitionControls.tsx";
import { deserialise } from "../src/builder/model.ts";
import { DOCUMENT_CSS, makeContext, renderDocument } from "../src/builder/render.ts";

const PAGE = readFileSync(new URL("../src/pages/public/PublicProposalPage.tsx", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("../src/builder/definitionControls.tsx", import.meta.url), "utf8");

const docWith = (props) => deserialise({
  v: 2,
  settings: {},
  sections: [{
    id: "s1", layout: 1,
    columns: [{ id: "c1", widgets: [{ id: "w1", kind: "signature", props }] }],
  }],
});
const draw = (props, partial = {}) => {
  const doc = docWith(props);
  return renderDocument(doc, makeContext(doc, { mode: "view", business: { name: "Summit Lawn" }, ...partial }));
};

/* ══════════════════════════════════════════════════════════════════════════
   1. The switch
   ══════════════════════════════════════════════════════════════════════════ */

describe("Required to accept — the switch that was already in the defaults", () => {
  const def = WIDGETS_BY_KIND.signature;

  test("the switch is on the panel, on the widget's own Content tab", () => {
    const c = (def.controls || []).find((x) => x.key === "required");
    assert.ok(c, "the Signature widget has no Required to accept control");
    assert.equal(c.label, "Required to accept");
    assert.equal(c.type, "toggle", "Elementor's on/off shape is the Switcher, which is `toggle`");
    assert.equal(controlTab(c), "content");
    assert.ok(c.help, "a switch that changes what the customer must do says so");
  });

  test("it starts ON, because that is what every document does today", () => {
    assert.equal(def.defaults.required, true);
  });

  test("a block with nothing stored shows the widget's own default", () => {
    // Found by driving it: the Acceptance section template places a Signature
    // widget WITHOUT `required`, so the switch arrived OFF on a document the
    // server treats as requiring a signature. A panel that says off while the
    // document says on is the worst of the three possible screens.
    const c = (def.controls || []).find((x) => x.key === "required");
    assert.equal(isOn(undefined), false, "nothing stored is not, by itself, on");
    assert.equal(isOn(defaultOf(def, c, "desktop")), true, "…so the DEFAULT is what the panel shows");
    // A control whose default is off still reads off, and one with no default
    // at all reads off — nothing is invented.
    const off = { key: "flag", label: "Flag", type: "toggle" };
    assert.equal(isOn(defaultOf({ defaults: { flag: false } }, off, "desktop")), false);
    assert.equal(isOn(defaultOf({ defaults: {} }, off, "desktop")), false);
    assert.equal(defaultOf(undefined, off, "desktop"), undefined);
  });

  test("…and the Switcher in the panel is the thing that reads it", () => {
    // `defaultOf` being right proves nothing if the panel does not ask it.
    // There is ONE Switcher in the panel and this is the line that draws it.
    assert.ok(CONTROLS.includes("on={isOn(valueOf(c) ?? defaultOf(p.def, c, p.device))}"),
      "the panel's Switcher does not fall back to the widget's default");
    assert.equal((CONTROLS.match(/on=\{isOn\(/g) || []).length, 1,
      "there is a second on/off shape in the panel with rules of its own");
  });

  test("a phone or tablet twin falls back to its own device, not to a default", () => {
    // Elementor stores `<key>_tablet` / `<key>_mobile` beside the desktop key,
    // and an unset twin means "the same as the screen above it" — which the
    // engine already answers. A default here would override that.
    const responsive = { key: "flag", label: "Flag", type: "toggle", responsive: true };
    const def = { defaults: { flag: true } };
    assert.equal(defaultOf(def, responsive, "desktop"), true);
    assert.equal(defaultOf(def, responsive, "phone"), undefined);
    assert.equal(defaultOf(def, responsive, "tablet"), undefined);
  });

  test("the switch is the ONLY thing D-174 adds to the panel", () => {
    // THE SCREEN LAW (D-172): if the reference editor does not have it, it is
    // not on our screen. A widget control is the one place a setting belongs.
    const keys = (def.controls || []).map((c) => c.key);
    assert.deepEqual(keys, ["heading", "body", "customerLabel", "businessLabel", "required", "consent"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The block, as paper
   ══════════════════════════════════════════════════════════════════════════ */

describe("the acceptance block is a paper form", () => {
  test("unsigned: three labelled rules a side, and nothing filled in", () => {
    const html = draw({ heading: "Acceptance" });
    for (const label of ["Printed name", "Signature", "Date"]) {
      assert.ok(html.includes(`>${label}</div>`), `the block is missing its "${label}" line`);
    }
    // Two of each: the customer's side and the business's.
    assert.equal((html.match(/Printed name/g) || []).length, 2);
    assert.ok(html.includes('data-sign-slot="customer-date"'));
    assert.ok(html.includes('data-sign-slot="business-printed"'));
    assert.ok(!html.includes("data-sign-input"), "nobody is signing, so there is nothing to type in");
  });

  test("signed: the printed name, the signature in the signature face, the date", () => {
    const html = draw({
      heading: "Acceptance",
      printedName: "DANA REED", signedName: "Dana Reed", signedOn: "2026-09-22",
    });
    assert.ok(html.includes("DANA REED"));
    assert.ok(html.includes('<span class="bx-signed">Dana Reed</span>'), "the signature is in the signature face");
    assert.ok(html.includes("2026-09-22"), "the date line is filled from the record");
  });

  test("being signed: the boxes are ON the block, and the tick is under it", () => {
    const html = draw({ heading: "Acceptance" }, { signing: true });
    assert.ok(html.includes('data-sign-input="printed"'), "no Printed name box on the block");
    assert.ok(html.includes('data-sign-input="signature"'), "no Signature box on the block");
    assert.ok(html.includes('placeholder="Type your full name to sign"'));
    assert.ok(html.includes("data-sign-agree"), "the consent tick must sit under the block");
    // The business's side is never typed into by the customer.
    assert.ok(!html.includes('data-sign-input="business"'));
  });

  test("…and never on a block that has already been signed", () => {
    const html = draw({ signedName: "Dana Reed" }, { signing: true });
    assert.ok(!html.includes("data-sign-input"), "a signed block is not signable again");
  });

  test("…and never in the editor, whatever the context says", () => {
    const doc = docWith({ heading: "Acceptance" });
    const html = renderDocument(doc, makeContext(doc, { mode: "edit", signing: true, business: { name: "Summit" } }));
    assert.ok(!html.includes("data-sign-input"), "the author is not the signer");
  });

  test("approved: one honest sentence, and no blank signature rules", () => {
    const html = draw({
      heading: "Acceptance", approved: true, approvedName: "Sam Cole", approvedOn: "2026-09-22",
    });
    assert.ok(html.includes("Approved by Sam Cole"), "it must say what actually happened");
    assert.ok(html.includes("on 2026-09-22"));
    assert.ok(!html.includes("Printed name"),
      "a blank signature block under an approved document is a claim about something nobody did");
    assert.ok(!html.includes("bx-sign-line"));
  });

  test("the stylesheet dresses every part the renderer writes", () => {
    for (const cls of ["bx-sign-row", "bx-sign-rl", "bx-sign-in", "bx-sign-agree", "bx-approved"]) {
      assert.ok(DOCUMENT_CSS.includes(`.${cls}`), `${cls} is written and never styled`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The customer's page asks the server, and never decides
   ══════════════════════════════════════════════════════════════════════════ */

describe("the customer's copy", () => {
  test("it reads signature_required and computes nothing", () => {
    assert.ok(PAGE.includes("data?.signature_required !== false"),
      "the page must read the server's answer");
    assert.ok(!/props[^\n]*\.required/.test(PAGE),
      "the page works out for itself whether a signature is required — that is a second decider");
  });

  test("required + a block on the page: the foot has NO name box of its own", () => {
    assert.ok(PAGE.includes("signatureRequired && !signingOnDocument"),
      "the foot's name box must be conditional on there being nowhere else to type");
    assert.ok(PAGE.includes("Sign on the document above"));
  });

  test("not required: one Approve button, and the sentence that says what it means", () => {
    assert.ok(PAGE.includes("By pressing Approve you agree to this document."));
    assert.ok(PAGE.includes('const verb = signatureRequired ? "Accept" : "Approve";'));
    assert.ok(PAGE.includes("const ready = !signatureRequired || (signature.trim().length >= 2 && agreed);"),
      "an approval must not wait for a name nobody is asked for");
  });

  test("afterwards it says Signed or Approved, honestly, and links the PDF either way", () => {
    assert.ok(PAGE.includes('signatureRequired ? "Signed and accepted. Thank you." : "Approved. Thank you."'));
    assert.ok(PAGE.includes('signatureRequired ? "Signed by " : "Approved by "'));
    assert.ok(PAGE.includes('signatureRequired ? "Open the signed PDF" : "Open the PDF"'));
  });

  test("it only calls the PDF a SIGNED pdf when it was signed", () => {
    // Found by driving it (2026-09-22): the header link read "Signed PDF" on an
    // approved document, which is a claim about something nobody did.
    assert.ok(PAGE.includes('{isAccepted && signatureRequired ? "Signed PDF" : "PDF"}'));
  });

  test("the printed name is sent with the signature", () => {
    assert.ok(PAGE.includes("printed_name: printedName.trim()"));
  });
});
