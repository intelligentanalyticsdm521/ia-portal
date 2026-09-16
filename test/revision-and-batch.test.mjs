// test/revision-and-batch.test.mjs — the revision page on the builder, and the
// month-end batch screen.
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §11.5 ("the revision PAGE is still the
// pre-builder one") and CUSTOMER_MODEL_MULTISITE_2026-09-15 §9.12 ("the
// month-end screen has an API and no UI").
//
// SEVENTEEN MUTATION CHECKS, each broken on purpose and restored, every one
// caught. Written down so the next person can re-run them:
//   diff.ts        match sections by INDEX not by id · `if (!base)` badge
//                  everything · stop stripping `id` in contentOf()
//   render.ts      drop `changeBadge` from renderSection
//   ProposalBuilder  drop `revision ? { changed: diff.sections } : {}`
//   PublicRevisionPage  drop `changed: diff.sections` · delete the sign-again
//                  block · print the customer's note twice again
//   OliverProposalsPage  put the pre-builder AddRevisionModal back
//   readyToInvoice.ts  paysForItself → `locations.length === 1` · put no-site
//                  jobs in the first site's bucket · hide the skipped jobs from
//                  the summary · orderForScreen stops ranking billable first
//   OliverInvoicesPage  take the view out of the URL · show group headings on a
//                  single-site invoice
//   ReadyToInvoicePanel  take a tooltip off a button · move Back below the
//                  heading
//
// Two assertions were WORTHLESS until a mutation said so and were rewritten:
// the tooltip scan (a regex stopped inside `onClick={() => …}`, so a button
// WITH a tooltip read as one without — it now tracks brace depth), and the
// note-printed-once check (it matched the expression inside a `false &&`).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, emptyDocument, makeSection, makeWidget, moveSection, patchWidget,
  resetIds, addWidget,
} from "../src/builder/model.ts";
import * as deserialiseModule from "../src/builder/model.ts";
import { renderDocument, renderSection, makeContext } from "../src/builder/render.ts";
import { diffDocuments, diffSummary } from "../src/builder/diff.ts";
import {
  groupJobsByLocation, paysForItself, invoiceCount, batchSummary, orderForScreen,
  addressLineOf, billToAddressLine,
} from "../src/lib/readyToInvoice.ts";

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Every opening JSX tag for the named components, as source text.
 *
 * A regex cannot do this: `onClick={() => x}` contains a `>` that is not the
 * end of the tag, so `/<Button[\s\S]*?>/` stops in the middle of an attribute
 * and a button WITH a tooltip reads as one without. The scan tracks brace depth
 * and quotes instead.
 */
function openingTags(source, names) {
  const out = [];
  for (const name of names) {
    const needle = `<${name}`;
    let at = source.indexOf(needle);
    while (at >= 0) {
      const after = source[at + needle.length];
      // `<button` must not also match `<buttonish`; `<Button` must not match
      // `<ButtonGroup`.
      if (after && /[\s/>]/.test(after)) {
        let i = at + needle.length;
        let depth = 0;
        let quote = null;
        for (; i < source.length; i++) {
          const ch = source[i];
          if (quote) { if (ch === quote) quote = null; continue; }
          if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (ch === ">" && depth === 0) break;
        }
        out.push(source.slice(at, i + 1));
      }
      at = source.indexOf(needle, at + needle.length);
    }
  }
  return out;
}

/** A two-section document with a price in the second one. */
function baseDoc() {
  resetIds();
  let doc = emptyDocument({ accent: "#0C4A60" });
  const intro = makeSection({ label: "Introduction" });
  const pricing = makeSection({ label: "Pricing" });
  doc = addSection(doc, intro);
  doc = addSection(doc, pricing);
  doc = addWidget(doc, intro.id, 0, makeWidget("paragraph", { text: "Thank you for the chance to quote." }));
  doc = addWidget(doc, pricing.id, 0, makeWidget("priced_line", { name: "Seasonal plowing", amount: 4800 }));
  return { doc, introId: intro.id, pricingId: pricing.id };
}

/* ══════════════════════════════════════════════════════════════════════════
   A. The diff
   ══════════════════════════════════════════════════════════════════════════ */

describe("a revision knows what it changed", () => {
  test("an untouched copy is identical", () => {
    const { doc } = baseDoc();
    const d = diffDocuments(doc, doc);
    assert.equal(d.identical, true);
    assert.deepEqual(d.sections, {});
    assert.equal(diffSummary(d), "Nothing has changed yet.");
  });

  test("changing a price badges THAT section and no other", () => {
    const { doc, introId, pricingId } = baseDoc();
    const next = patchWidget(doc, { sectionId: pricingId, columnIndex: 0, widgetIndex: 0 }, { amount: 5200 });
    const d = diffDocuments(doc, next);
    // The wanted output APPEARS — not merely "no error"
    // (feedback_assert_presence_not_just_absence).
    assert.equal(d.sections[pricingId], "changed");
    assert.equal(d.sections[introId], undefined);
    assert.equal(d.changed, 1);
    assert.equal(d.added, 0);
    assert.equal(d.identical, false);
    assert.match(diffSummary(d), /1 section changed/);
  });

  test("a new section reads as added, not as changed", () => {
    const { doc } = baseDoc();
    const extra = makeSection({ label: "Severe weather" });
    const next = addSection(doc, extra);
    const d = diffDocuments(doc, next);
    assert.equal(d.sections[extra.id], "added");
    assert.equal(d.added, 1);
    assert.equal(d.changed, 0);
  });

  test("moving a section is not a change — the words did not move", () => {
    // MUTATION: match by index instead of by id and this goes red, because both
    // moved sections then compare against the wrong baseline.
    const { doc, introId, pricingId } = baseDoc();
    const next = moveSection(doc, pricingId, 0);
    const d = diffDocuments(doc, next);
    assert.deepEqual(d.sections, {});
    assert.equal(d.identical, true, "a reorder must not badge anything");
    assert.equal(d.sections[introId], undefined);
  });

  test("a removed section is counted and NAMED — you cannot badge an absence", () => {
    const { doc, pricingId } = baseDoc();
    const next = { ...doc, sections: doc.sections.filter((s) => s.id !== pricingId) };
    const d = diffDocuments(doc, next);
    assert.equal(d.removed, 1);
    assert.deepEqual(d.removedLabels, ["Pricing"]);
    assert.match(diffSummary(d), /removed \(Pricing\)/);
  });

  test("no baseline badges NOTHING, rather than badging everything", () => {
    // MUTATION: `if (!base) return everything-changed` and this goes red. A
    // document nobody has revised must carry no badges, or a badge stops
    // meaning anything.
    const { doc } = baseDoc();
    const d = diffDocuments(null, doc);
    assert.deepEqual(d.sections, {});
    assert.equal(d.identical, true);
  });

  test("ids are identity, not content — a re-minted widget id is not a change", () => {
    // MUTATION: stop stripping `id` in contentOf() and this goes red.
    //
    // The real case, not a hypothetical: the baseline is read from
    // `base_document_json` and the working copy from `document_json`. A widget
    // stored without an id gets a FRESH one from deserialise() on each read —
    // w1 on the first, w2 on the second — so every section carrying one would
    // badge itself as changed on a document nobody had touched.
    resetIds();
    const stored = {
      v: 2,
      settings: { style: "plain" },
      sections: [{
        id: "s-fixed", label: "Terms", layout: 1, width: "contained", padding: 24,
        theme: "light", visibility: "customer",
        columns: [{ id: "c-fixed", widgets: [{ kind: "paragraph", props: { text: "Net 30." } }] }],
      }],
    };
    const { deserialise } = deserialiseModule;
    const first = deserialise(JSON.parse(JSON.stringify(stored)));
    const second = deserialise(JSON.parse(JSON.stringify(stored)));
    assert.notEqual(
      first.sections[0].columns[0].widgets[0].id,
      second.sections[0].columns[0].widgets[0].id,
      "the fixture only bites when the two reads really do mint different ids",
    );
    const d = diffDocuments(first, second);
    assert.deepEqual(d.sections, {});
    assert.equal(d.identical, true, "an id the reader invented is not something the author changed");
  });

  test("a styling change is reported without badging a section", () => {
    const { doc } = baseDoc();
    const next = { ...doc, settings: { ...doc.settings, accent: "#B45309" } };
    const d = diffDocuments(doc, next);
    assert.equal(d.settingsChanged, true);
    assert.deepEqual(d.sections, {});
    assert.equal(d.identical, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   B. The badge is drawn by the ONE renderer
   ══════════════════════════════════════════════════════════════════════════ */

describe("the badge comes off the same renderer both surfaces use", () => {
  test("renderSection draws Changed and New, and nothing when there is no diff", () => {
    // MUTATION: delete changeBadge from renderSection and this goes red — which
    // is the point: if the badge lived in the page instead, the author's canvas
    // and the customer's copy could badge different things.
    const { doc, pricingId, introId } = baseDoc();
    const plain = makeContext(doc, {});
    assert.equal(renderSection(doc.sections[1], plain).includes("bx-chg"), false,
      "a document that is not a revision carries no badges at all");

    const withDiff = makeContext(doc, { changed: { [pricingId]: "changed", [introId]: "added" } });
    const priced = renderSection(doc.sections[1], withDiff);
    assert.match(priced, /bx-chg bx-chg-changed/);
    assert.match(priced, />Changed</);
    assert.match(priced, /class="bx-sec[^"]*bx-changed"/);

    const intro = renderSection(doc.sections[0], withDiff);
    assert.match(intro, /bx-chg-added/);
    assert.match(intro, />New</);
  });

  test("the whole document carries exactly the badges the diff names", () => {
    const { doc, pricingId } = baseDoc();
    const next = patchWidget(doc, { sectionId: pricingId, columnIndex: 0, widgetIndex: 0 }, { amount: 5200 });
    const d = diffDocuments(doc, next);
    const html = renderDocument(next, makeContext(next, { changed: d.sections }));
    assert.equal((html.match(/bx-chg /g) || []).length, 1);
    assert.match(html, /data-change="changed"/);
  });

  test("the stylesheet that travels with the renderer can draw the badge", () => {
    const css = read("src/builder/render.ts");
    assert.match(css, /\.bx-chg \{/, "DOCUMENT_CSS must style .bx-chg or the badge is invisible");
    assert.match(css, /\.bx-chg-added \{/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   C. Both surfaces are wired to it — and the second signature is required
   ══════════════════════════════════════════════════════════════════════════ */

describe("the revision opens in the SAME builder, and is signed again", () => {
  const builder = read("src/builder/proposal/ProposalBuilder.tsx");
  const page = read("src/pages/public/PublicRevisionPage.tsx");
  const proposals = read("src/pages/oliver/OliverProposalsPage.tsx");

  test("the author's canvas is handed the diff", () => {
    assert.match(builder, /\.\.\.\(revision \? \{ changed: diff\.sections \} : \{\}\)/);
    assert.match(builder, /diffDocuments\(baseDoc, revision \? doc : null\)/);
  });

  test("the customer's page is handed the SAME diff, from the same module", () => {
    assert.match(page, /from "\.\.\/\.\.\/builder\/diff"/);
    assert.match(page, /changed: diff\.sections/);
  });

  test("the customer's page renders through THE renderer, not a copy", () => {
    assert.match(page, /renderDocument\(/);
    assert.match(page, /from "\.\.\/\.\.\/builder\/render"/);
    assert.equal(/dangerouslySetInnerHTML=\{\{ __html: html \}\}/.test(page), true);
  });

  test("the customer must sign the revision — the page asks for a name and consent", () => {
    // MUTATION: delete the sign-again block from PublicRevisionPage and this
    // goes red. The GUARD is oliver-api's signatureRefusal(); this pins that
    // the page actually offers the signature rather than accepting silently.
    assert.match(page, /Sign to accept this version/);
    assert.match(page, /it needs your signature again/);
    assert.match(page, /signature: signature\.trim\(\), consent/);
    assert.match(page, /disabled=\{busy \|\| signature\.trim\(\)\.length < 2 \|\| !agreed\}/);
  });

  test("a customer's own words are printed ONCE, and labelled as theirs", () => {
    // FOUND BY WALKING IT: a customer-requested revision copies their message
    // into scope_change_notes as well, so the "what has changed" panel showed
    // the same paragraph twice.
    //
    // MUTATION: print both again → red.
    assert.match(page, /\{data\.requested_by === "customer" && data\.request_note \? \(/,
      "their words must be the FIRST branch, not one arm of something else");
    assert.match(page, /You asked for:/);
    // The author's note is the ELSE branch, never a second paragraph beside it.
    assert.match(page, /\) : data\.scope_change_notes \? \(/);
  });

  test("a version already signed cannot be signed twice from the page", () => {
    assert.match(page, /const alreadySigned = !!data\?\.signatures\?\.find\(\(s\) => s\.party === "customer"\)/);
    assert.match(page, /!alreadySigned/);
  });

  test("the pre-builder revision editor is GONE — replace means delete", () => {
    // The NAME may survive in the note that records what was deleted; the
    // component and every use of it may not.
    assert.equal(/function AddRevisionModal/.test(proposals), false,
      "AddRevisionModal must be deleted, not left beside the builder");
    assert.equal(/<AddRevisionModal/.test(proposals), false);
    assert.equal(proposals.includes("showAddRevision"), false);
    assert.equal(proposals.includes("Create draft revision"), false);
    assert.equal(proposals.includes("freeRevisionsUsed"), false);
    // And what stands in its place is THE builder.
    assert.match(proposals, /<ProposalBuilder[\s\S]{0,400}revision=\{builderRevision\}/);
  });

  test("the revision list opens the builder rather than sending blind", () => {
    assert.match(proposals, /Open in builder/);
    // Sending from the list would send the unedited copy the revision was
    // created from, which is the defect the button's removal prevents.
    assert.equal(/revisions\/\$\{rev\.revision_id\}\/send/.test(proposals), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D. The month-end screen
   ══════════════════════════════════════════════════════════════════════════ */

/** Hope Ministries: two sites the company pays for. */
const COMPANY_GROUP = {
  bill_to_key: "profile:pc-1",
  bill_to_name: "Hope Ministries",
  bill_to_profile_id: "pc-1",
  bill_to: {
    name: "Ada Reyes", company: "Hope Ministries", email: "accounting@hope.example",
    address: { address_line_1: "1200 SW Oralabor Rd", city: "Ankeny", state: "IA", postal_code: "50023" },
    payment_terms_days: 30, po_number: "2026-SNOW-014", billing_profile_id: "pc-1",
  },
  contact_id: "c-1",
  jobs: [
    { job_id: "j1", job_number: "JOB-1", title: "Parking lot wash", service_location_id: "LOC-A", total: 620, line_count: 2, completed_at: "2026-09-12" },
    { job_id: "j2", job_number: "JOB-2", title: "Sidewalk wash", service_location_id: "loc-b", total: 340, line_count: 1, completed_at: "2026-09-11" },
    { job_id: "j3", job_number: "JOB-3", title: "Callout, unpriced", service_location_id: "LOC-A", total: 0, line_count: 0, completed_at: "2026-09-13" },
  ],
  job_count: 3,
  location_ids: ["loc-a", "loc-b"],
  locations: [
    { location_id: "loc-a", name: "Des Moines campus", address_line_1: "1200 SW Oralabor Rd", city: "Ankeny", state: "IA", postal_code: "50023", billing_profile_id: null },
    { location_id: "loc-b", name: "Ankeny outreach center", address_line_1: "318 SW 3rd St", city: "Ankeny", state: "IA", postal_code: "50023", billing_profile_id: null, po_number: "OUT-9" },
  ],
  total: 960,
  jobs_with_no_lines: 1,
};

/** The Waukee campus, which has its own billing profile and so its own invoice. */
const SELF_PAYING_GROUP = {
  bill_to_key: "profile:pl-9",
  bill_to_name: "Hope Ministries — Waukee campus",
  bill_to_profile_id: "pl-9",
  bill_to: { name: "Ken Doyle", company: "Hope Ministries", payment_terms_days: 15, billing_profile_id: "pl-9" },
  contact_id: "c-1",
  jobs: [{ job_id: "j4", job_number: "JOB-4", title: "Lot wash", service_location_id: "loc-c", total: 410, line_count: 1, completed_at: "2026-09-10" }],
  job_count: 1,
  location_ids: ["loc-c"],
  locations: [{ location_id: "loc-c", name: "Waukee campus", address_line_1: "410 Alice's Rd", city: "Waukee", state: "IA", postal_code: "50263", billing_profile_id: "pl-9" }],
  total: 410,
  jobs_with_no_lines: 0,
};

/** Dale Hargrove, one address, no profile of his own. */
const HOMEOWNER_GROUP = {
  bill_to_key: "contact:c-9",
  bill_to_name: "Dale Hargrove",
  bill_to_profile_id: null,
  bill_to: { name: "Dale Hargrove", payment_terms_days: null },
  contact_id: "c-9",
  jobs: [{ job_id: "j5", title: "Driveway", service_location_id: "loc-d", total: 90, line_count: 1 }],
  job_count: 1,
  location_ids: ["loc-d"],
  locations: [{ location_id: "loc-d", name: "Home", billing_profile_id: null }],
  total: 90,
  jobs_with_no_lines: 0,
};


/** A payer whose every job is unpriced — real, and unbillable. */
const UNBILLABLE_GROUP = {
  bill_to_key: "contact:c-none",
  bill_to_name: "Aardvark Holdings",
  bill_to_profile_id: null,
  bill_to: { name: "Aardvark Holdings" },
  contact_id: "c-none",
  jobs: [{ job_id: "j0", title: "Callout", service_location_id: null, total: 0, line_count: 0 }],
  job_count: 1,
  location_ids: [],
  locations: [],
  total: 0,
  jobs_with_no_lines: 1,
};

describe("ready to invoice: one card per payer, sites inside it", () => {
  test("a company's work groups by site, in the location list's own order", () => {
    const groups = groupJobsByLocation(COMPANY_GROUP);
    assert.equal(groups.length, 2, "two sites, two groups");
    assert.equal(groups[0].name, "Des Moines campus");
    assert.equal(groups[1].name, "Ankeny outreach center");
    // Case-insensitive matching: the API returns ids in both cases, and a
    // case-sensitive key is how a site silently loses its jobs.
    assert.equal(groups[0].jobs.length, 2);
    assert.equal(groups[0].subtotal, 620);
    assert.equal(groups[1].subtotal, 340);
    assert.equal(groups[0].unpriced, 1);
    assert.equal(groups[1].po_number, "OUT-9");
    assert.equal(groups[0].addressLine, "1200 SW Oralabor Rd, Ankeny, IA, 50023");
  });

  test("a job with no site is NOT attributed to one", () => {
    // MUTATION: put the no-site jobs into the first site's bucket and this goes
    // red. Guessing which building a line belongs to is how a site-level
    // dispute starts (§9.10 item 7).
    const g = groupJobsByLocation({
      ...COMPANY_GROUP,
      jobs: [...COMPANY_GROUP.jobs, { job_id: "j9", title: "Account credit", service_location_id: null, total: -50, line_count: 1 }],
    });
    assert.equal(g.length, 3);
    assert.equal(g[2].location_id, null);
    assert.equal(g[2].name, "No service location");
    assert.equal(g[0].jobs.length, 2, "the first site keeps its own two jobs and gains nothing");
  });

  test("a location that pays for itself is its OWN card", () => {
    // MUTATION: `paysForItself` returns `locations.length === 1` and this goes
    // red on the homeowner — a person with one address is not a self-paying
    // site, and calling them one puts a badge on every residential customer.
    assert.equal(paysForItself(SELF_PAYING_GROUP), true);
    assert.equal(paysForItself(COMPANY_GROUP), false);
    assert.equal(paysForItself(HOMEOWNER_GROUP), false, "a homeowner is not a self-paying site");
  });

  test("Create N invoices counts the payers that actually have priced work", () => {
    const all = [COMPANY_GROUP, SELF_PAYING_GROUP, HOMEOWNER_GROUP];
    const picked = new Set(["profile:pc-1", "profile:pl-9"]);
    assert.equal(invoiceCount(all, picked), 2);

    const nothingPriced = { ...HOMEOWNER_GROUP, bill_to_key: "contact:c-x", jobs: [{ job_id: "z", total: 0, line_count: 0 }] };
    assert.equal(invoiceCount([nothingPriced], new Set(["contact:c-x"])), 0,
      "a payer whose every job is unpriced creates no invoice");
  });

  test("the summary names the jobs that will be LEFT BEHIND", () => {
    const s = batchSummary([COMPANY_GROUP, SELF_PAYING_GROUP], new Set(["profile:pc-1", "profile:pl-9"]));
    assert.match(s, /2 invoices/);
    assert.match(s, /3 jobs/);
    assert.match(s, /1 job has no priced lines/);
  });


  test("payers you can actually bill are read FIRST", () => {
    // FOUND BY WALKING IT: the API sorts payers by name, and the dev database's
    // seven payers with no priced lines all sorted above the two with money in
    // them. Nothing is hidden — a completed job that cannot be billed is exactly
    // what this screen exists to show — but it is read last.
    //
    // MUTATION: `orderForScreen` returns `groups` unchanged → red.
    const ordered = orderForScreen([HOMEOWNER_GROUP, UNBILLABLE_GROUP, SELF_PAYING_GROUP, COMPANY_GROUP]);
    assert.deepEqual(ordered.map((g) => g.bill_to_key), [
      "profile:pc-1",     // $960, billable
      "profile:pl-9",     // $410, billable
      "contact:c-9",      // $90, billable
      "contact:c-none",   // nothing to bill, last
    ]);
    assert.equal(ordered.length, 4, "nothing is dropped, only reordered");
  });
  test("the bill-to block reads its address from the snapshot, not the contact", () => {
    assert.equal(billToAddressLine(COMPANY_GROUP.bill_to), "1200 SW Oralabor Rd, Ankeny, IA, 50023");
    assert.equal(billToAddressLine(SELF_PAYING_GROUP.bill_to), "");
    assert.equal(addressLineOf(null), "");
  });
});

describe("the screen itself", () => {
  const panel = read("src/pages/oliver/ReadyToInvoicePanel.tsx");
  const page = read("src/pages/oliver/OliverInvoicesPage.tsx");

  test("Back is TOP-LEFT and is the first thing in the view", () => {
    const backAt = panel.indexOf("Back to invoices");
    const headingAt = panel.indexOf("Ready to invoice</h2>");
    assert.ok(backAt > 0 && backAt < headingAt, "Back must come before the heading");
    assert.match(panel, /<ArrowLeft className="h-3\.5 w-3\.5" \/> Back to invoices/);
  });

  test("the view lives in the URL, so browser Back and the nav link work", () => {
    assert.match(page, /searchParams\.get\("view"\)/);
    assert.match(page, /next\.set\("view", "ready"\)/);
    assert.match(page, /next\.delete\("view"\)/);
  });

  test("every button carries a tooltip", () => {
    // A control the author has to guess at is a control they do not press.
    // Every <Button …> and <button …> opening tag in the panel is checked; the
    // scan tracks brace depth because JSX attributes contain arrow functions,
    // and a `>` inside one is not the end of the tag.
    const controls = openingTags(panel, ["Button", "button"]);
    // Back, Refresh, Clear, Create, plus the per-payer checkbox's own tooltip.
    assert.ok(controls.length >= 4, `expected several buttons, found ${controls.length}`);
    for (const c of controls) {
      assert.ok(/\btitle=/.test(c), `button without a tooltip: ${c.slice(0, 160)}`);
    }
    // The tick box IS a control, and it is the one that decides what gets
    // billed, so it carries one too.
    for (const input of openingTags(panel, ["input"])) {
      assert.ok(/\btitle=/.test(input), `input without a tooltip: ${input.slice(0, 160)}`);
    }
    // And the button that reaches this screen from the invoice list.
    const entry = openingTags(page, ["Button"]).find((b) => /openReady/.test(b));
    assert.ok(entry, "the invoice list must offer a way into the month-end screen");
    assert.match(entry, /title="Bill a month's finished work in one go/);
  });

  test("the created invoices open, rather than only changing a count", () => {
    assert.match(page, /if \(result\?\.created\?\.\[0\]\?\.invoiceId\) setDetailId\(result\.created\[0\]\.invoiceId\)/);
  });

  test("the invoice screen prints BILL TO and the service locations", () => {
    assert.match(page, /data-testid="bill-to-block"/);
    assert.match(page, /data-testid="service-location-block"/);
    assert.match(page, /Service locations \(\{sited\.length\}\)/);
  });

  test("group headings appear only when there is MORE THAN ONE sited group", () => {
    // §9.6: "a single-site invoice must look exactly as it does today".
    assert.match(page, /\(inv\.line_groups \|\| \[\]\)\.filter\(\(g\) => g\.location_id\)\.length > 1/);
    assert.match(page, /data-testid="line-group"/);
    assert.match(page, /Total across all locations/);
  });
});
