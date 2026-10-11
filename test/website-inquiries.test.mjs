// test/website-inquiries.test.mjs — Website → Overview → Website inquiries
// and the per-form "Send this form to my SPARK inbox" switch.
//
// Features audit row 41 (2026-10-11): an ARION-only business had no screen
// showing the inquiries its website took. And since iadm-webhooks ff70c79 an
// inquiry reaches SPARK only when SPARK is in the subscription AND the form's
// arion.site_form_config row has is_active = 1, so that switch has to exist,
// default off, and never appear on "we don't know".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SWITCH_LABEL, NOT_IN_PLAN_SENTENCE, captureSwitchState, configWithSwitch, formsSeen,
  inquiryRows, submissionsOf, configsOf, unidentifiedCount, formLabel, isActiveFlag,
} from "../src/lib/websiteInquiries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const sub = (id, over = {}) => ({
  submission_id: id, form_id: "contact-1", form_type: "contact", first_name: "Ann", last_name: "Lee",
  email: "ann@example.com", phone: "555-0100", message: "Need a quote", submitted_at: "2026-10-10T15:00:00Z", ...over,
});
const payload = (spark, decided = true) => ({
  tenant_id: "t", resolved_at: "x", decided, products: spark ? { spark } : {}, addons: {}, limits: {},
});

describe("the inquiries list", () => {
  test("newest first, with name, email, phone, form, received and message", () => {
    const rows = inquiryRows([
      sub("a", { submitted_at: "2026-10-01T10:00:00Z" }),
      sub("b", { submitted_at: "2026-10-09T10:00:00Z", first_name: "Bo", last_name: null }),
    ]);
    assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
    assert.equal(rows[0].name, "Bo");
    assert.equal(rows[1].name, "Ann Lee");
    assert.equal(rows[1].email, "ann@example.com");
    assert.equal(rows[1].phone, "555-0100");
    assert.equal(rows[1].message, "Need a quote");
    assert.equal(rows[1].receivedAt, "2026-10-01T10:00:00Z");
  });
  test("falls back to the raw form fields a WordPress form sends", () => {
    const [r] = inquiryRows([sub("c", {
      first_name: null, last_name: null, email: null, phone: null, message: null,
      raw_fields: JSON.stringify({ "your-name": "Cy", "Your-Email": "cy@example.com", tel: "555-0199", "your-message": "Hi" }),
    })]);
    assert.deepEqual([r.name, r.email, r.phone, r.message], ["Cy", "cy@example.com", "555-0199", "Hi"]);
  });
  test("the form shows its saved name when it has one", () => {
    const [r] = inquiryRows([sub("d")], [{ form_id: "contact-1", form_name: "Contact us" }]);
    assert.equal(r.form, "Contact us");
    assert.equal(formLabel(null, "contact", "contact-1"), "Contact form (contact-1)");
    assert.equal(formLabel(null, null, null), "Website form");
  });
  test("reads the { data, meta } envelope and ignores rows without an id", () => {
    assert.equal(submissionsOf({ data: [sub("e"), { form_id: "x" }], meta: { total: 2 } }).length, 1);
    assert.deepEqual(submissionsOf(null), []);
    assert.equal(configsOf({ data: [{ form_id: "" }, { form_id: "f" }] }).length, 1);
  });
});

describe("the forms list", () => {
  test("every distinct form_id the site has seen, plus config rows with no inquiry yet", () => {
    const forms = formsSeen(
      [sub("1"), sub("2"), sub("3", { form_id: "quote-2", form_type: "quote" })],
      [{ form_id: "newsletter", form_name: "Newsletter", is_active: 1 }],
    );
    const byId = Object.fromEntries(forms.map((f) => [f.formId, f]));
    assert.deepEqual(Object.keys(byId).sort(), ["contact-1", "newsletter", "quote-2"]);
    assert.equal(byId["contact-1"].count, 2);
    assert.equal(byId.newsletter.count, 0);
    assert.equal(byId.newsletter.sendsToSpark, true);
  });
  test("DEFAULT OFF: a form with no config row does not send to SPARK", () => {
    const [f] = formsSeen([sub("1")], []);
    assert.equal(f.config, null);
    assert.equal(f.sendsToSpark, false);
  });
  test("a config row with is_active 0 is off; 1 / true is on", () => {
    assert.equal(formsSeen([], [{ form_id: "a", is_active: 0 }])[0].sendsToSpark, false);
    assert.equal(formsSeen([], [{ form_id: "a", is_active: false }])[0].sendsToSpark, false);
    assert.equal(isActiveFlag(1), true);
    assert.equal(isActiveFlag(true), true);
    assert.equal(isActiveFlag(null), false);
  });
  test("an inquiry with no form_id gets no switch (the inbox rule keys on form_id), but is counted", () => {
    const subs = [sub("1", { form_id: null }), sub("2", { form_id: "" }), sub("3")];
    assert.deepEqual(formsSeen(subs, []).map((f) => f.formId), ["contact-1"]);
    assert.equal(unidentifiedCount(subs), 2);
  });
});

describe("the switch is offered only on a DECIDED 'SPARK is in your plan'", () => {
  test("decided owned -> offer", () => {
    assert.equal(captureSwitchState(payload({ owned: true, decided: true })), "offer");
  });
  test("decided not owned -> the one sentence", () => {
    assert.equal(captureSwitchState(payload({ owned: false, decided: true })), "not_in_plan");
    assert.equal(NOT_IN_PLAN_SENTENCE, "Inquiries stay here. Add SPARK to send them to a lead inbox.");
  });
  test("undecided never offers a send into another product", () => {
    assert.equal(captureSwitchState(null), "unknown", "no answer from platform-api");
    assert.equal(captureSwitchState(payload({ owned: true, decided: true }, false)), "unknown", "the payload is undecided");
    assert.equal(captureSwitchState(payload({ owned: true, decided: false })), "unknown", "SPARK's node is undecided");
    assert.equal(captureSwitchState(payload(null)), "unknown", "SPARK is not in the answer");
    assert.equal(captureSwitchState(payload({ decided: true })), "unknown", "owned is not a boolean");
  });
});

describe("the switch writes is_active and keeps every other column", () => {
  test("a saved row goes back as it was, parsed out of its stored JSON, with only is_active changed", () => {
    const config = {
      form_id: "contact-1", form_name: "Contact us", form_type: "quote",
      field_map: '{"email":"your-email"}', is_active: 0,
      apply_tags: '["Website","Hot"]', add_to_list_id: 7, marketing_optin: 1,
    };
    const body = configWithSwitch({ formId: "contact-1", formType: "contact", config }, true);
    assert.deepEqual(body, {
      form_id: "contact-1", form_name: "Contact us", form_type: "quote",
      field_map: { email: "your-email" }, is_active: true,
      apply_tags: ["Website", "Hot"], add_to_list_id: 7, marketing_optin: true,
    });
  });
  test("turning it off sends is_active false explicitly (the route reads a missing one as ON)", () => {
    const body = configWithSwitch({ formId: "a", formType: "contact", config: { form_id: "a", is_active: 1 } }, false);
    assert.equal(body.is_active, false);
    assert.ok("is_active" in body);
  });
  test("a form with no row yet gets the route's own defaults", () => {
    assert.deepEqual(configWithSwitch({ formId: "q", formType: null, config: null }, true), {
      form_id: "q", form_name: null, form_type: "contact", field_map: null, is_active: true,
      apply_tags: null, add_to_list_id: null, marketing_optin: false,
    });
  });
});

describe("the page", () => {
  const overview = read("src/arion/pages/website/WebsiteOverview.tsx");
  const section = read("src/arion/pages/website/WebsiteInquiries.tsx");
  const api = read("src/lib/arionApi.ts");
  test("Website → Overview mounts the section for the selected site", () => {
    assert.match(overview, /<WebsiteInquiries siteId=\{siteId\} arionApi=\{arionApi\} \/>/);
  });
  test("the switch renders only in the 'offer' state, with the agreed words", () => {
    assert.match(section, /\{switchState === 'offer' && \(/);
    assert.match(section, /role="switch"/);
    assert.equal(SWITCH_LABEL, "Send this form to my SPARK inbox");
    assert.match(section, /\{switchState === 'not_in_plan' && \(/);
    assert.match(section, /navigate\(planPagePath\('spark'\)\)/, "Add SPARK goes where SPARK is bought");
  });
  test("delete asks first and uses the existing DELETE route", () => {
    assert.match(section, /Delete this inquiry\? It can't be brought back\./);
    assert.match(api, /method: 'DELETE',\n\s+path: `\/arion\/sites\/\$\{encodeURIComponent\(params\.siteId\)\}\/forms\/submissions\/\$\{encodeURIComponent\(params\.submissionId\)\}`/);
  });
  test("the switch saves through POST /forms/config with the merged body", () => {
    assert.match(section, /const body = configWithSwitch\(form, !form\.sendsToSpark\);/);
    assert.match(api, /method: 'POST', path: `\/arion\/sites\/\$\{encodeURIComponent\(params\.siteId\)\}\/forms\/config`/);
  });
  test("no client-facing 'tenant' and no native dialogs", () => {
    assert.doesNotMatch(section, /tenant/i);
    assert.doesNotMatch(section, /window\.(confirm|alert|prompt)/);
  });
});
