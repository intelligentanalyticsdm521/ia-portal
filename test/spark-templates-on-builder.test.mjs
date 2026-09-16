// test/spark-templates-on-builder.test.mjs — the SPARK email TEMPLATE on the
// one builder (BUILDER_PLATFORM_SCOPE_2026-09-15 §13.5, §13.8).
//
// §13.8's outstanding item, in its own words: "The template editor
// (SparkTemplateEditorModal) still uses the form-and-TipTap shape. It is the
// third door in §13.5's table and the only one not yet moved; blocks_json
// already accepts the model."
//
// ── WHAT THESE PIN, AND THE MUTATION THAT TURNS EACH RED ──────────────────
// Only #1 was actually run on 2026-09-16. The rest are written down so the
// next person can run them, not claimed as run — a green check proves nothing
// until somebody makes it fail on purpose.
//
//   1. A SAVE WRITES BOTH — the rendered body AND the design, from one render.
//      `body_html` is what `emailSender.renderTemplate` mails and what every
//      automation, welcome worker and POST /email-templates/send goes through;
//      `blocks_json` is what the builder opens next time. A save that wrote
//      only the design would leave a template that opens beautifully and mails
//      nothing.
//        MUTATION RUN 2026-09-16: delete `body_html` from templateDoc's
//        designFields → "a saved template is still mailable by the old send
//        path" RED, and three more with it. Restored.
//
//   2. THE ROUND TRIP — what a save writes, the builder opens again as the
//      same document, with NO "we interpreted this" note.
//        mutation: have templateRowForBuilder return content_html only → the
//        note appears and the widgets come back re-scanned → red.
//
//   3. A LEGACY BODY IS NOT LOST — a template written in the old editor opens
//      with its words, its links and its pictures, and SAYS it was interpreted.
//        mutation: drop openEmailDocument's html branch → red.
//
//   4. CREATE ≠ UPDATE — `is_active` is absent from the create body (the route
//      does not accept it and the column defaults to 1) and `template_key` is
//      absent from the update body (it is the handle automations hold).
//        mutation: spread the same object into both → red.
//
//   5. THERE IS ONE EMAIL EDITOR — the library opens the builder, and the old
//      modal no longer has an email branch to drift from it.
//        mutation: re-add `body_html` to SparkTemplateEditorModal → red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { emptyDocument, makeSection, makeWidget, resetIds } from "../src/builder/model.ts";
import { makeEmailContext, hasFooter } from "../src/builder/adapters/email/emailRender.ts";
import { openEmailDocument, toEmailWire } from "../src/builder/adapters/email/emailDoc.ts";
import { ensureFooter } from "../src/builder/adapters/email/emailTemplates.ts";
import {
  templateRowForBuilder, templateCreateBody, templatePatchBody, templateBlockers,
  slugifyTemplateKey, hasDesign, settingsFromRow, DEFAULT_TEMPLATE_SETTINGS,
} from "../src/builder/adapters/email/templateDoc.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/**
 * The CODE, without the prose around it.
 *
 * Every "this is gone" assertion below reads a file for a word that must no
 * longer appear. The header comments explain what was deleted and WHY, and say
 * the deleted things by name — so a raw grep would fail on the explanation and
 * the fix would be to delete the explanation. Same discipline as brand-kit's
 * own grep, and for the same reason.
 */
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "")
   .replace(/^[ 	]*\/\/.*$/gm, "")
   .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const code = (rel) => stripComments(read(rel));
const FIX = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "email-render-cases.json"), "utf8"));
const BUSINESS = FIX.context.business;

/** A small template document: a greeting, a paragraph and the locked footer. */
function templateDocument() {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    label: "Body",
    columns: [{
      id: "c1",
      widgets: [
        makeWidget("personal_note", { greeting: "Hi {{first name}},", text: "Your appointment is confirmed.", signoff: "— Rolling In It" }),
        makeWidget("paragraph", { text: 'Questions? <a href="https://rollinginit.example.test">Get in touch</a>.' }),
      ],
    }],
    layout: 1,
  })];
  return ensureFooter(doc, BUSINESS);
}

const ctx = (doc) => makeEmailContext(doc, FIX.context);
const META = { title: "Appointment confirmed", subject: "You're booked, {{first name}}", preheader: "See you soon" };
const SETTINGS = { ...DEFAULT_TEMPLATE_SETTINGS, category: "transactional", from_email: "hello@example.test" };

function savedWire() {
  const doc = templateDocument();
  return { doc, wire: toEmailWire(doc, ctx(doc), { subject: META.subject, preheader: META.preheader }) };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. A save writes BOTH, from one render
   ══════════════════════════════════════════════════════════════════════════ */

describe("a template saved from the builder keeps working for every existing sender", () => {
  test("a saved template is still mailable by the old send path — MUTATION 1", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    // renderTemplate reads body_html and NOTHING else. This is the assertion
    // that the design did not replace the thing that actually gets mailed.
    assert.equal(typeof body.body_html, "string");
    assert.ok(body.body_html.length > 0, "body_html must carry the rendered email");
    assert.match(body.body_html, /Your appointment is confirmed\./);
    assert.match(body.body_html, /<table/i, "the mailed body is table-based");
    assert.equal(typeof body.body_text, "string");
    assert.match(body.body_text, /Your appointment is confirmed\./);
  });

  test("the design goes to blocks_json — the column that already held it", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    assert.equal(body.blocks_json, wire.document_json, "the model itself, not a copy of it");
    assert.equal(body.blocks_json.v, 2);
    assert.ok(Array.isArray(body.blocks_json.sections));
  });

  test("the body and the design are produced from ONE render, so they cannot disagree", () => {
    const { doc, wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    // Re-render the stored model and get the same string back.
    const again = toEmailWire(body.blocks_json, ctx(doc), { subject: META.subject, preheader: META.preheader });
    assert.equal(again.content_html, body.body_html);
  });

  test("the merge tags are stored AS WRITTEN — a template is not previewed into every recipient", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    // §13.3: the stored body uses "send" mode. Dana is the preview contact in
    // the fixture; a template that greeted the whole list as Dana is exactly
    // the defect the walk found in the inbox.
    assert.match(body.body_html, /\{\{first name\}\}/);
    assert.doesNotMatch(body.body_html, /Dana/);
  });

  test("the unsubscribe footer is on the body a template stores", () => {
    const { doc, wire } = savedWire();
    assert.ok(hasFooter(doc), "the model carries it");
    const body = templateCreateBody(wire, META, SETTINGS);
    assert.match(body.body_html, /[Uu]nsubscribe/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The round trip
   ══════════════════════════════════════════════════════════════════════════ */

describe("what a save writes, the builder opens again", () => {
  test("a designed row comes back as the SAME document, uninterpreted — MUTATION 2", () => {
    const { wire } = savedWire();
    const saved = templateCreateBody(wire, META, SETTINGS);
    // The row as LUMEN would hand it back.
    const row = {
      id: 7, name: saved.name, subject: saved.subject, preheader: saved.preheader,
      body_html: saved.body_html, body_text: saved.body_text, blocks_json: saved.blocks_json,
    };
    const opened = openEmailDocument(templateRowForBuilder(row), BUSINESS, "#0C4A60");
    assert.equal(opened.note, null, "nothing was guessed, so nothing is announced");
    const kinds = opened.doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets.map((w) => w.kind)));
    assert.deepEqual(kinds, ["personal_note", "paragraph", "email_footer"]);
  });

  test("it survives the JSON round trip SQL actually performs", () => {
    const { wire } = savedWire();
    const saved = templateCreateBody(wire, META, SETTINGS);
    // NVARCHAR(MAX) in, string out — the driver hands back text, not an object.
    const row = { blocks_json: JSON.stringify(saved.blocks_json), body_html: saved.body_html };
    const opened = openEmailDocument(templateRowForBuilder(row), BUSINESS, "#0C4A60");
    assert.equal(opened.note, null);
    const kinds = opened.doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets.map((w) => w.kind)));
    assert.deepEqual(kinds, ["personal_note", "paragraph", "email_footer"]);
  });

  test("the design wins over the body, when a row carries both", () => {
    const { wire } = savedWire();
    const saved = templateCreateBody(wire, META, SETTINGS);
    const row = { blocks_json: saved.blocks_json, body_html: "<p>a stale body nobody should see</p>" };
    const opened = openEmailDocument(templateRowForBuilder(row), BUSINESS, "#0C4A60");
    const text = JSON.stringify(opened.doc);
    assert.doesNotMatch(text, /stale body/);
    assert.match(text, /Your appointment is confirmed/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. A legacy template loses nothing
   ══════════════════════════════════════════════════════════════════════════ */

describe("a template written in the old editor opens on the canvas", () => {
  const LEGACY = {
    id: 3,
    name: "Welcome",
    subject: "Welcome to {{business name}}",
    body_html: [
      "<h2>Welcome aboard</h2>",
      "<p>Hi {{first name}}, thanks for joining <strong>us</strong>.</p>",
      '<p>Your <a href="https://example.test/setup">setup link</a> is ready.</p>',
      '<img src="https://cdn.example.test/hero.png" alt="Our team" />',
      "<ul><li>One</li><li>Two</li></ul>",
    ].join("\n"),
    blocks_json: null,
  };

  test("the words, the pictures and the links all arrive — MUTATION 3", () => {
    const opened = openEmailDocument(templateRowForBuilder(LEGACY), BUSINESS, "#0C4A60");
    const widgets = opened.doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets));
    const kinds = widgets.map((w) => w.kind);
    assert.ok(kinds.includes("heading"), "the heading survived");
    assert.ok(kinds.includes("paragraph"), "the prose survived");
    assert.ok(kinds.includes("image"), "the picture survived");
    assert.ok(kinds.includes("list"), "the bullets survived");
    const text = JSON.stringify(widgets);
    assert.match(text, /Welcome aboard/);
    assert.match(text, /https:\/\/example\.test\/setup/, "the link is still a link");
    assert.match(text, /<strong>us<\/strong>/, "the bold survived");
    assert.match(text, /\{\{first name\}\}/, "the merge tag was not resolved on the way in");
  });

  test("it SAYS it was interpreted, rather than quietly guessing", () => {
    const opened = openEmailDocument(templateRowForBuilder(LEGACY), BUSINESS, "#0C4A60");
    assert.ok(opened.note, "the author is told the layout was read back");
    assert.match(opened.note, /old editor/i);
  });

  test("it opens with the masthead and the locked footer a legal email needs", () => {
    const opened = openEmailDocument(templateRowForBuilder(LEGACY), BUSINESS, "#0C4A60");
    assert.ok(hasFooter(opened.doc), "a legacy template gains the unsubscribe footer on open");
  });

  test("saving it then writes BOTH, so the next open is not a re-scan", () => {
    const opened = openEmailDocument(templateRowForBuilder(LEGACY), BUSINESS, "#0C4A60");
    const wire = toEmailWire(opened.doc, ctx(opened.doc), { subject: LEGACY.subject });
    const body = templatePatchBody(wire, { ...META, title: "Welcome" }, SETTINGS);
    assert.ok(body.body_html.length > 0);
    assert.equal(body.blocks_json.v, 2);
    const again = openEmailDocument(templateRowForBuilder({ blocks_json: body.blocks_json, body_html: body.body_html }), BUSINESS);
    assert.equal(again.note, null, "the second open interprets nothing");
  });

  test("an empty template opens on the starting screen, not on a broken page", () => {
    assert.equal(templateRowForBuilder(null), null);
    const opened = openEmailDocument(templateRowForBuilder({ body_html: "", blocks_json: null }), BUSINESS);
    assert.equal(opened.note, null);
    assert.ok(hasFooter(opened.doc));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Create is not update
   ══════════════════════════════════════════════════════════════════════════ */

describe("the two payloads say only what their route accepts", () => {
  test("create never sends is_active — the route drops it and the column defaults to 1 — MUTATION 4", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    assert.ok(!("is_active" in body), "sending a field the route ignores reads as 'I set this'");
  });

  test("create derives the stable key from the name", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, SETTINGS);
    assert.equal(body.template_key, "appointment_confirmed");
  });

  test("update never sends template_key — a rename must not repoint an automation", () => {
    const { wire } = savedWire();
    const body = templatePatchBody(wire, { ...META, title: "Renamed entirely" }, SETTINGS);
    assert.ok(!("template_key" in body));
    assert.equal(body.name, "Renamed entirely");
  });

  test("update does carry is_active, which is the only place it can be set", () => {
    const { wire } = savedWire();
    assert.equal(templatePatchBody(wire, META, { ...SETTINGS, is_active: false }).is_active, false);
    assert.equal(templatePatchBody(wire, META, { ...SETTINGS, is_active: true }).is_active, true);
  });

  test("the template-only settings ride along, and blank means null rather than empty string", () => {
    const { wire } = savedWire();
    const body = templateCreateBody(wire, META, { ...DEFAULT_TEMPLATE_SETTINGS, category: "marketing" });
    assert.equal(body.category, "marketing");
    assert.equal(body.description, null);
    assert.equal(body.from_email, null);
    assert.equal(body.reply_to, null);
  });

  test("a preview line left blank is null, not the empty string", () => {
    const { wire } = savedWire();
    assert.equal(templateCreateBody(wire, { ...META, preheader: "" }, SETTINGS).preheader, null);
  });

  test("what is still missing is said in words, before the route answers 400", () => {
    assert.deepEqual(templateBlockers({ title: "", subject: "", preheader: "" }), ["a name at the top", "a subject line"]);
    assert.deepEqual(templateBlockers({ title: "Named", subject: "", preheader: "" }), ["a subject line"]);
    assert.deepEqual(templateBlockers(META), []);
  });

  test("the key is a slug, and the SMS editor spells it the same way", () => {
    assert.equal(slugifyTemplateKey("Welcome — new customer!"), "welcome_new_customer");
    assert.equal(slugifyTemplateKey("  "), "");
    assert.match(read("components/spark/SparkTemplateEditorModal.tsx"), /slugifyTemplateKey/,
      "one spelling of a template key, imported rather than copied");
  });

  test("settingsFromRow reads a row without inventing anything", () => {
    assert.deepEqual(settingsFromRow(null), DEFAULT_TEMPLATE_SETTINGS);
    const s = settingsFromRow({ category: "system", description: "d", from_name: "N", from_email: "e@x.test", reply_to: "r@x.test", is_active: false });
    assert.equal(s.category, "system");
    assert.equal(s.is_active, false);
    // A row that predates the column is ACTIVE, not inactive — an absent flag
    // must never switch a working template off.
    assert.equal(settingsFromRow({}).is_active, true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The library, and the editor that is gone
   ══════════════════════════════════════════════════════════════════════════ */

describe("there is ONE email editor", () => {
  const PAGE = code("pages/spark/SparkTemplatesPage.tsx");
  const OLD = code("components/spark/SparkTemplateEditorModal.tsx");
  const NEW = code("components/spark/SparkTemplateBuilderModal.tsx");

  test("the old modal has no email branch left to drift — MUTATION 5", () => {
    for (const gone of ["body_html", "SparkBodyEditor", "CTAEditorBlock", "preheader", "email-templates"]) {
      assert.ok(!OLD.includes(gone), `SparkTemplateEditorModal still carries ${gone} — two editors over one column`);
    }
  });

  test("it is SMS, and it still is", () => {
    assert.match(OLD, /sms-templates/);
    assert.match(OLD, /segment\(s\)/, "the one thing an SMS writer needs to see");
  });

  test("the library opens an email template on the builder", () => {
    assert.match(PAGE, /SparkTemplateBuilderModal/);
    assert.match(PAGE, /Design in the builder/);
    assert.match(NEW, /EmailBuilder/);
  });

  test("the dead 'advanced editor' link is gone — it routed back to this page", () => {
    assert.ok(!PAGE.includes("spark_email_templates"), "the link pointed at a page that redirects here");
    assert.ok(!OLD.includes("spark_email_templates"));
  });

  test("the builder door does not render its own canvas, subject box or widget pane", () => {
    for (const engine of ["BuilderShell", "BuilderFrame", "Canvas", "renderEmailSection", "SectionGallery"]) {
      assert.ok(!NEW.includes(engine), `SparkTemplateBuilderModal reaches past EmailBuilder for ${engine}`);
    }
  });

  test("it follows the clone a system template turns into, instead of cloning again", () => {
    // PATCH on a platform-tenant system row returns a NEW tenant-owned row.
    assert.match(NEW, /savingToId/);
    assert.match(NEW, /saved\.id !== savingToId/);
  });
});

describe("the library can say which rows were designed", () => {
  test("hasDesign is true for a builder document and for the old block tree", () => {
    const { wire } = savedWire();
    assert.equal(hasDesign({ blocks_json: wire.document_json }), true);
    assert.equal(hasDesign({ blocks_json: JSON.stringify(wire.document_json) }), true);
    assert.equal(hasDesign({ blocks_json: { blocks: [{ type: "paragraph", text: "x" }] } }), true);
  });

  test("and false for a row that has none — including the shapes SQL hands back", () => {
    assert.equal(hasDesign(null), false);
    assert.equal(hasDesign({}), false);
    assert.equal(hasDesign({ blocks_json: null }), false);
    assert.equal(hasDesign({ blocks_json: "" }), false);
    assert.equal(hasDesign({ blocks_json: "not json at all" }), false);
  });

  test("the chip is drawn from PRESENCE, never from an absent field", () => {
    const PAGE = code("pages/spark/SparkTemplatesPage.tsx");
    // An older API that does not send has_design must label a row NEITHER —
    // `=== true` and `=== false`, never a truthiness test that would put
    // "Old editor" on every template the day the Portal ships first.
    assert.match(PAGE, /has_design === true/);
    assert.match(PAGE, /has_design === false/);
  });
});

describe("merge tags reach the words a template is made of", () => {
  const BUILDER = code("builder/adapters/email/EmailBuilder.tsx");

  test("the builder opens THE merge-tag picker, not a list of its own", () => {
    assert.match(BUILDER, /from "\.\.\/\.\.\/\.\.\/components\/spark\/MergeTagPicker"/);
  });

  test("every widget that holds a sentence can take one", () => {
    for (const kind of ["heading", "paragraph", "personal_note", "button", "testimonial"]) {
      assert.match(BUILDER, new RegExp(`\\b${kind}: \\[`), `${kind} has no merge-tag field`);
    }
  });

  test("a web address is NOT one of them — a tag in a URL is a 404 for everyone", () => {
    const targets = BUILDER.slice(BUILDER.indexOf("const MERGE_TARGETS"), BUILDER.indexOf("/** One field's picker"));
    assert.ok(!/key: "url"/.test(targets));
    assert.ok(!/key: "src"/.test(targets));
    assert.ok(!/key: "href"/.test(targets));
  });
});
