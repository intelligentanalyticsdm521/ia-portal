// test/csvPresets.test.mjs — vendor CSV presets (ops scope I1, §5.5 row I1/I2).
//
// Every fixture below is SYNTHETIC. There is no real client data in this repo
// and none may ever be pasted in (feedback_no_real_client_data_in_dev): the
// names are obviously invented, the emails are example.com, the phone numbers
// are 555-01xx (the reserved fictional range).
//
// What these tests are actually protecting:
//   1. A header we guessed wrong must land UNMAPPED, never in the wrong field.
//      "Fail if a phone column lands in email" is the scope's own wording.
//   2. Every preset must still declare confirmed_against_real_export: false
//      until a real export has been diffed against it — the warning the UI
//      shows depends on that flag, and quietly flipping it would remove the
//      one thing telling the owner to check the preview.
//   3. Money and dates must come back null when unreadable, never 0 and never
//      "today". A silently-stamped date on two-year-old invoice history is the
//      corruption the whole importer exists to avoid.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CSV_PRESETS, TARGET_FIELDS, REQUIRED_FIELDS,
  applyPreset, buildMapping, detectPreset, genericMapping, getPreset,
  mapStatus, missingRequired, normalizeHeader, parseDate, parseList, parseMoney,
  presetWarning, presetsFor, projectRow, splitFullName, splitOneLineAddress,
} from "../src/components/shared/csvPresets";

// ── tiny CSV reader, so the fixtures below read like real files ────────────
function readCsv(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const f = split(l); const r = {};
    headers.forEach((h, i) => { r[h] = f[i] ?? ""; });
    return r;
  });
  return { headers, rows };
}

// ── SYNTHETIC fixtures, one per vendor x entity we ship a real map for ─────

const FIXTURES = {
  "quickbooks_online.contacts": `Customer,Full Name,Phone Numbers,Email,Billing Address,Company
Northside Bakery,Dana Whitfield,555-0142,dana@example.com,"88 Kiln Road, Riverton, IL 62704",Northside Bakery LLC
Marcus Ordonez,Marcus Ordonez,555-0177,marcus@example.com,"5 Elm Court, Riverton, IL 62705",`,

  "quickbooks_online.invoices": `Date,Transaction Type,Num,Customer,Memo/Description,Due Date,Amount,Open Balance,Status
03/14/2026,Invoice,1041,Northside Bakery,Quarterly oven service,04/13/2026,"$1,240.00",$0.00,Paid
04/02/2026,Invoice,1042,Marcus Ordonez,Callout + parts,05/02/2026,$318.50,$318.50,Open`,

  "wave.contacts": `customer_name,first_name,last_name,email,phone,address_line_1,city,province/state,postal_code/zip_code,country
Harbour Glass,Priya,Raman,priya@example.com,555-0110,17 Dock Street,Riverton,IL,62704,USA
Tom Alderidge,Tom,Alderidge,tom@example.com,555-0128,44 Lark Lane,Riverton,IL,62706,USA`,

  "wave.invoices": `Invoice Number,Customer,Invoice Date,Due Date,Status,Total,Amount Due
INV-2201,Harbour Glass,01/09/2026,02/08/2026,Paid,880.00,0.00
INV-2202,Tom Alderidge,02/11/2026,03/13/2026,Unpaid,145.75,145.75`,

  "jobber.contacts": `First name,Last name,Company name,Email,Phone,Street 1,Street 2,City,Province/State,Postal/Zip code,Country,Lead source,Tags
Nia,Okonkwo,Okonkwo Landscaping,nia@example.com,555-0163,9 Fernway,Unit 2,Riverton,IL,62704,USA,Referral,"VIP; Commercial"
Bram,Vesely,,bram@example.com,555-0195,220 Hollow Road,,Riverton,IL,62707,USA,Google,Residential`,

  "jobber.jobs": `Job #,Client,Title,Job type,Status,Start date,End date,Address,Total,Instructions
1042,Nia Okonkwo,Spring cleanup,One-off,Complete,14/03/2026,14/03/2026,"9 Fernway, Riverton, IL 62704",480.00,Gate code 4417
1043,Bram Vesely,Hedge trim,Recurring,Active,02/04/2026,,"220 Hollow Road, Riverton, IL 62707",125.00,`,

  "jobber.invoices": `Invoice #,Client,Subject,Issued date,Due date,Status,Subtotal,Tax,Total,Balance
3301,Nia Okonkwo,Spring cleanup,14/03/2026,13/04/2026,Paid,480.00,38.40,518.40,0.00
3302,Bram Vesely,Hedge trim,02/04/2026,02/05/2026,Awaiting payment,125.00,10.00,135.00,135.00`,

  "housecall_pro.contacts": `First Name,Last Name,Display Name,Company,Email,Mobile Number,Home Number,Work Number,Street,Unit,City,State,Zip,Tags,Lead Source,Notes
Rosalind,Kaur,Rosalind Kaur,,ros@example.com,555-0134,,555-0180,71 Pinecrest Ave,Apt 3,Riverton,IL,62704,"Maintenance plan",Yard sign,Prefers morning visits
Devon,Achebe,Achebe HVAC,Achebe HVAC,devon@example.com,,555-0151,,12 Boiler Way,,Riverton,IL,62709,,Website,`,

  "housecall_pro.jobs": `Job #,Customer,Address,Scheduled Start,Scheduled End,Job Status,Employee,Total Amount,Job Type,Job Description
J-5001,Rosalind Kaur,"71 Pinecrest Ave, Riverton, IL 62704",03/12/2026 09:00,03/12/2026 11:00,Completed,Sam,340.00,Repair,Furnace repair
J-5002,Devon Achebe,"12 Boiler Way, Riverton, IL 62709",04/01/2026 13:00,,Scheduled,Alex,0.00,Maintenance,Annual service`,

  "housecall_pro.invoices": `Invoice #,Customer,Job #,Invoice Date,Due Date,Status,Total,Balance,Amount Paid,Paid Date
9001,Rosalind Kaur,J-5001,03/12/2026,04/11/2026,Paid,340.00,0.00,340.00,03/14/2026
9002,Devon Achebe,J-5002,04/01/2026,05/01/2026,Sent,210.00,210.00,0.00,`,
};

// ── 1. every preset is honestly labelled ───────────────────────────────────

test("every preset says it has NOT been confirmed against a real export, and lists what it assumed", () => {
  assert.equal(CSV_PRESETS.length, 12, "4 vendors x 3 entities");
  for (const p of CSV_PRESETS) {
    assert.equal(p.confirmed_against_real_export, false,
      `${p.preset_key}: must stay false until a real ${p.vendor_label} export has been diffed against it`);
    assert.ok(["likely", "unconfirmed"].includes(p.confidence), `${p.preset_key}: confidence`);
    if (!p.vendor_has_no_native_export) {
      assert.ok(p.assumed_headers.length >= 5,
        `${p.preset_key}: list the headers assumed so Brandon can diff a real file`);
    }
    assert.ok(presetWarning(p), `${p.preset_key}: the UI must have a warning to show`);
    assert.match(presetWarning(p), /confirmed|does not export/i);
  }
});

test("preset keys are unique and cover every vendor/entity pair", () => {
  const keys = CSV_PRESETS.map((p) => p.preset_key);
  assert.equal(new Set(keys).size, keys.length, "no duplicate preset_key");
  for (const entity of ["contacts", "jobs", "invoices"]) {
    assert.equal(presetsFor(entity).length, 4, `${entity}: one preset per vendor`);
  }
});

test("every alias points at a field that exists for that preset's entity", () => {
  for (const p of CSV_PRESETS) {
    const known = new Set(TARGET_FIELDS[p.entity].map((f) => f.key));
    for (const field of Object.keys(p.aliases)) {
      assert.ok(known.has(field), `${p.preset_key}: "${field}" is not a ${p.entity} field`);
      assert.ok(Array.isArray(p.aliases[field]) && p.aliases[field].length,
        `${p.preset_key}.${field}: alias list must not be empty`);
    }
  }
});

test("every status_map value is a status OLIVER actually accepts", () => {
  const JOB_OK = new Set(["draft", "inquiry", "quoted", "scheduled", "dispatched", "assigned",
    "in_progress", "completed", "invoiced", "paid", "cancelled"]);
  const INV_OK = new Set(["draft", "sent", "paid", "void", "cancelled", "uncollectible",
    "past_due", "partially_paid", "partially_refunded", "refunded"]);
  for (const p of CSV_PRESETS) {
    if (!p.status_map) continue;
    const ok = p.entity === "invoices" ? INV_OK : JOB_OK;
    for (const [from, to] of Object.entries(p.status_map)) {
      assert.ok(ok.has(to), `${p.preset_key}: "${from}" maps to "${to}", which is not a valid ${p.entity} status`);
    }
  }
});

// ── 2. per-vendor mapping against the synthetic fixtures ───────────────────

const EXPECT = {
  "quickbooks_online.contacts": { display_name: "Customer", email: "Email", phone: "Phone Numbers", company: "Company", address_line1: "Billing Address" },
  "quickbooks_online.invoices": { invoice_number: "Num", customer_name: "Customer", issued_date: "Date", due_date: "Due Date", total: "Amount", balance_due: "Open Balance", status: "Status", description: "Memo/Description" },
  "wave.contacts": { display_name: "customer_name", first_name: "first_name", last_name: "last_name", email: "email", phone: "phone", address_line1: "address_line_1", city: "city", state: "province/state", postal_code: "postal_code/zip_code", country: "country" },
  "wave.invoices": { invoice_number: "Invoice Number", customer_name: "Customer", issued_date: "Invoice Date", due_date: "Due Date", status: "Status", total: "Total", balance_due: "Amount Due" },
  "jobber.contacts": { first_name: "First name", last_name: "Last name", company: "Company name", email: "Email", phone: "Phone", address_line1: "Street 1", address_line2: "Street 2", city: "City", state: "Province/State", postal_code: "Postal/Zip code", country: "Country", source: "Lead source", tag_names: "Tags" },
  "jobber.jobs": { job_number: "Job #", customer_name: "Client", title: "Title", job_type: "Job type", status: "Status", scheduled_start: "Start date", scheduled_end: "End date", address_line1: "Address", total: "Total", team_notes: "Instructions" },
  "jobber.invoices": { invoice_number: "Invoice #", customer_name: "Client", issued_date: "Issued date", due_date: "Due date", status: "Status", subtotal: "Subtotal", tax_amount: "Tax", total: "Total", balance_due: "Balance", description: "Subject" },
  "housecall_pro.contacts": { first_name: "First Name", last_name: "Last Name", display_name: "Display Name", company: "Company", email: "Email", phone: "Mobile Number", address_line1: "Street", address_line2: "Unit", city: "City", state: "State", postal_code: "Zip", tag_names: "Tags", source: "Lead Source", notes: "Notes" },
  "housecall_pro.jobs": { job_number: "Job #", customer_name: "Customer", address_line1: "Address", scheduled_start: "Scheduled Start", scheduled_end: "Scheduled End", status: "Job Status", total: "Total Amount", job_type: "Job Type", title: "Job Description" },
  "housecall_pro.invoices": { invoice_number: "Invoice #", customer_name: "Customer", job_external_id: "Job #", issued_date: "Invoice Date", due_date: "Due Date", status: "Status", total: "Total", balance_due: "Balance", amount_paid: "Amount Paid", paid_date: "Paid Date" },
};

for (const [key, csv] of Object.entries(FIXTURES)) {
  test(`${key}: the preset maps the fixture's columns to the right fields`, () => {
    const preset = getPreset(key);
    assert.ok(preset, `${key} exists`);
    const { headers } = readCsv(csv);
    const mapping = applyPreset(headers, preset);
    for (const [field, column] of Object.entries(EXPECT[key])) {
      assert.equal(mapping[field], column, `${key}: ${field} should read column "${column}"`);
    }
    // No field may claim a column another field already took.
    const used = Object.values(mapping);
    assert.equal(new Set(used).size, used.length, `${key}: a column is mapped to two fields`);
    // Required fields are satisfied by the fixture.
    assert.deepEqual(missingRequired(mapping, preset.entity), [], `${key}: nothing required is missing`);
  });
}

test("an unknown header is left unmapped — never dropped into a field it does not belong in", () => {
  const preset = getPreset("housecall_pro.contacts");
  const headers = ["First Name", "Last Name", "Email", "Sprocket Grade", "Widget Colour"];
  const mapping = applyPreset(headers, preset);
  assert.equal(mapping.first_name, "First Name");
  assert.equal(mapping.email, "Email");
  const claimed = new Set(Object.values(mapping));
  assert.ok(!claimed.has("Sprocket Grade"), "an unrecognised column stays unmapped");
  assert.ok(!claimed.has("Widget Colour"), "an unrecognised column stays unmapped");
});

test("MUTATION: swapped column CONTENT is visible in the preview, and a phone header never lands in email", () => {
  // The vendor's file has the values in the wrong columns (a real support case:
  // someone re-orders columns in Excel before exporting). The MAPPING is by
  // header, so it stays honest — and the preview therefore SHOWS the swap
  // rather than importing it as if it were correct.
  const preset = getPreset("jobber.contacts");
  const swapped = readCsv(`First name,Last name,Email,Phone
Nia,Okonkwo,555-0163,nia@example.com`);
  const mapping = applyPreset(swapped.headers, preset);
  const projected = projectRow(swapped.rows[0], mapping, "contacts", preset);
  assert.equal(projected.email, "555-0163", "the preview shows what is actually in the Email column");
  assert.equal(projected.phone, "nia@example.com", "…and what is in the Phone column");
  // The point of the guard: the MAPPING never put a phone HEADER into email.
  assert.equal(mapping.email, "Email");
  assert.equal(mapping.phone, "Phone");

  // And a file whose only phone-ish column is called "Phone" must never be
  // read as the email address, even when there is no email column at all.
  const noEmail = applyPreset(["First name", "Last name", "Phone"], preset);
  assert.equal(noEmail.email, undefined, "no email column ⇒ email stays unmapped");
  assert.equal(noEmail.phone, "Phone");
  assert.deepEqual(missingRequired(noEmail, "contacts"), [], "phone alone satisfies the requirement");
});

test("matching is exact, not substring: 'Email Opt-Out' is not an email column", () => {
  const preset = getPreset("jobber.contacts");
  const mapping = applyPreset(["First name", "Last name", "Email Opt-Out", "Phone"], preset);
  assert.equal(mapping.email, undefined, "a lookalike header must not be claimed");
});

// ── 3. vendor detection ────────────────────────────────────────────────────

test("detectPreset names the vendor when the header row is distinctive", () => {
  const hcp = readCsv(FIXTURES["housecall_pro.contacts"]);
  assert.equal(detectPreset(hcp.headers, "contacts")?.vendor, "housecall_pro");

  const jobber = readCsv(FIXTURES["jobber.invoices"]);
  assert.equal(detectPreset(jobber.headers, "invoices")?.vendor, "jobber");

  const qbo = readCsv(FIXTURES["quickbooks_online.invoices"]);
  assert.equal(detectPreset(qbo.headers, "invoices")?.vendor, "quickbooks_online");
});

test("detectPreset returns null rather than guessing on a generic header row", () => {
  assert.equal(detectPreset(["Name", "Email", "Phone"], "contacts"), null);
  assert.equal(detectPreset(["Customer", "Total", "Date", "Due Date", "Status"], "invoices"), null);
  assert.equal(detectPreset([], "jobs"), null);
});

test("presets with no native vendor export are never auto-detected", () => {
  for (const p of CSV_PRESETS.filter((x) => x.vendor_has_no_native_export)) {
    assert.equal(p.assumed_headers.every((h) => h), true);
    assert.match(presetWarning(p), /does not export/i);
  }
  // Wave has no jobs file at all; QBO's is Projects and is flagged too.
  assert.ok(getPreset("wave.jobs").vendor_has_no_native_export);
  assert.ok(getPreset("quickbooks_online.jobs").vendor_has_no_native_export);
});

// ── 4. value parsers ───────────────────────────────────────────────────────

test("parseDate reads ISO, US, European and written months — and returns null when it cannot", () => {
  assert.equal(parseDate("2026-03-14"), "2026-03-14");
  assert.equal(parseDate("03/14/2026", "mdy"), "2026-03-14");
  assert.equal(parseDate("14/03/2026", "dmy"), "2026-03-14");
  // A value over 12 can only be a day, whatever the configured order says.
  assert.equal(parseDate("14/03/2026", "mdy"), "2026-03-14");
  assert.equal(parseDate("Mar 14, 2026"), "2026-03-14");
  assert.equal(parseDate("14 March 2026"), "2026-03-14");
  assert.equal(parseDate("3/4/26", "mdy"), "2026-03-04");
  assert.equal(parseDate("3/4/26", "dmy"), "2026-04-03");
  assert.equal(parseDate(""), null);
  assert.equal(parseDate("not a date"), null);
  assert.equal(parseDate("13/13/2026"), null, "an impossible date is null, not a silent guess");
});

test("parseDate NEVER substitutes today's date for an unreadable one", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const junk of ["", "  ", "TBD", "n/a", "-", "unknown"]) {
    const got = parseDate(junk);
    assert.equal(got, null, `"${junk}" must be null`);
    assert.notEqual(got, today);
  }
});

test("parseMoney handles currency symbols, thousands separators, parentheses and decimal commas", () => {
  assert.equal(parseMoney("$1,240.00"), 1240);
  assert.equal(parseMoney("1240"), 1240);
  assert.equal(parseMoney("318.50"), 318.5);
  assert.equal(parseMoney("(45.00)"), -45);
  assert.equal(parseMoney("-45.00"), -45);
  assert.equal(parseMoney("45.00-"), -45);
  assert.equal(parseMoney("CAD 12.00"), 12);
  assert.equal(parseMoney("1.234,56"), 1234.56, "European decimal comma");
  assert.equal(parseMoney("12,50"), 12.5, "decimal comma with no thousands");
  assert.equal(parseMoney("1,234"), 1234, "thousands comma");
  assert.equal(parseMoney(0), 0);
  assert.equal(parseMoney("0.00"), 0);
});

test("parseMoney returns null (not 0) for something it cannot read", () => {
  for (const junk of ["", "  ", "n/a", "TBD", "--", "$"]) {
    assert.equal(parseMoney(junk), null, `"${junk}" must be null, because 0 is a different fact`);
  }
});

test("parseList splits tags on commas, semicolons and pipes and de-duplicates", () => {
  assert.deepEqual(parseList("VIP; Commercial"), ["VIP", "Commercial"]);
  assert.deepEqual(parseList("A,B|C"), ["A", "B", "C"]);
  assert.deepEqual(parseList("A, A ,B"), ["A", "B"]);
  assert.deepEqual(parseList(""), []);
  assert.deepEqual(parseList(null), []);
});

test("mapStatus uses the preset's own map and returns null for a word it does not know", () => {
  const jobber = getPreset("jobber.jobs");
  assert.equal(mapStatus("Complete", jobber), "completed");
  assert.equal(mapStatus("Active", jobber), "scheduled");
  assert.equal(mapStatus("Zorbled", jobber), null, "unknown status is null so the row gets flagged");
  assert.equal(mapStatus("Paid", getPreset("housecall_pro.invoices")), "paid");
  assert.equal(mapStatus("Sent", null), null, "no preset ⇒ no guess");
});

test("splitFullName: last token is the surname; a single token is a first name", () => {
  assert.deepEqual(splitFullName("Dana Whitfield"), { first_name: "Dana", last_name: "Whitfield" });
  assert.deepEqual(splitFullName("Maria de la Cruz"), { first_name: "Maria de la", last_name: "Cruz" });
  assert.deepEqual(splitFullName("Prince"), { first_name: "Prince", last_name: "" });
  assert.deepEqual(splitFullName(""), { first_name: "", last_name: "" });
});

test("splitOneLineAddress pulls city/state/ZIP out of a QuickBooks billing address", () => {
  assert.deepEqual(splitOneLineAddress("88 Kiln Road, Riverton, IL 62704"), {
    address_line1: "88 Kiln Road", city: "Riverton", state: "IL", postal_code: "62704", country: "",
  });
  assert.deepEqual(splitOneLineAddress("9 Fernway, Unit 2, Riverton, IL 62704"), {
    address_line1: "9 Fernway, Unit 2", city: "Riverton", state: "IL", postal_code: "62704", country: "",
  });
  assert.deepEqual(splitOneLineAddress("12 Dock St, Halifax, NS B3J 1S9, Canada"), {
    address_line1: "12 Dock St", city: "Halifax", state: "NS", postal_code: "B3J 1S9", country: "CA",
  });
  // Nothing is ever dropped: an address we cannot parse stays whole in line 1.
  assert.deepEqual(splitOneLineAddress("Behind the old mill"), {
    address_line1: "Behind the old mill", city: "", state: "", postal_code: "", country: "",
  });
});

// ── 5. projectRow, end to end per vendor ───────────────────────────────────

test("QuickBooks Online contacts: Full Name and Billing Address are split", () => {
  const preset = getPreset("quickbooks_online.contacts");
  const { headers, rows } = readCsv(FIXTURES["quickbooks_online.contacts"]);
  const mapping = applyPreset(headers, preset);
  const r = projectRow(rows[0], mapping, "contacts", preset);
  assert.equal(r.display_name, "Northside Bakery");
  assert.equal(r.email, "dana@example.com");
  assert.equal(r.phone, "555-0142");
  assert.equal(r.address_line1, "88 Kiln Road");
  assert.equal(r.city, "Riverton");
  assert.equal(r.state, "IL");
  assert.equal(r.postal_code, "62704");
  // Full Name splits into first/last because the file has no first/last cols.
  assert.equal(r.first_name, "Northside");
  assert.equal(r.last_name, "Bakery");
});

test("QuickBooks Online invoices: amount, open balance and status come through exactly", () => {
  const preset = getPreset("quickbooks_online.invoices");
  const { headers, rows } = readCsv(FIXTURES["quickbooks_online.invoices"]);
  const mapping = applyPreset(headers, preset);
  const paid = projectRow(rows[0], mapping, "invoices", preset);
  assert.equal(paid.invoice_number, "1041");
  assert.equal(paid.total, 1240);
  assert.equal(paid.balance_due, 0);
  assert.equal(paid.status, "paid");
  assert.equal(paid.issued_date, "2026-03-14");
  assert.equal(paid.due_date, "2026-04-13");

  const open = projectRow(rows[1], mapping, "invoices", preset);
  assert.equal(open.total, 318.5);
  assert.equal(open.balance_due, 318.5);
  assert.equal(open.status, "sent", "QuickBooks 'Open' is our 'sent'");
});

test("Jobber jobs: day/month dates, status map and the one-cell address", () => {
  const preset = getPreset("jobber.jobs");
  const { headers, rows } = readCsv(FIXTURES["jobber.jobs"]);
  const mapping = applyPreset(headers, preset);
  const r = projectRow(rows[0], mapping, "jobs", preset);
  assert.equal(r.job_number, "1042");
  assert.equal(r.customer_name, "Nia Okonkwo");
  assert.equal(r.status, "completed");
  assert.equal(r.scheduled_start, "2026-03-14", "14/03 is 14 March, not an invalid month");
  assert.equal(r.address_line1, "9 Fernway");
  assert.equal(r.city, "Riverton");
  assert.equal(r.postal_code, "62704");
  assert.equal(r.total, 480);

  const active = projectRow(rows[1], mapping, "jobs", preset);
  assert.equal(active.status, "scheduled");
  assert.equal(active.scheduled_end, undefined, "an empty cell is absent, not null-as-a-date");
});

test("Housecall Pro contacts: first non-empty of mobile/home/work becomes the phone", () => {
  const preset = getPreset("housecall_pro.contacts");
  const { headers, rows } = readCsv(FIXTURES["housecall_pro.contacts"]);
  const mapping = applyPreset(headers, preset);
  assert.equal(mapping.phone, "Mobile Number", "the alias order is mobile, then home, then work");

  const withMobile = projectRow(rows[0], mapping, "contacts", preset);
  assert.equal(withMobile.phone, "555-0134");
  assert.deepEqual(withMobile.tag_names, ["Maintenance plan"]);
  assert.equal(withMobile.notes, "Prefers morning visits");
  assert.equal(withMobile.address_line2, "Apt 3");

  // Row 2 has no mobile. The mapping is per FILE, not per row, so the phone
  // cell is empty — which is exactly what the owner must see in the preview
  // rather than us silently reaching into a different column mid-file.
  const noMobile = projectRow(rows[1], mapping, "contacts", preset);
  assert.equal(noMobile.phone, undefined);
  assert.equal(noMobile.email, "devon@example.com", "still importable on email alone");
});

test("Housecall Pro invoices: amount paid, balance and paid date survive the trip", () => {
  const preset = getPreset("housecall_pro.invoices");
  const { headers, rows } = readCsv(FIXTURES["housecall_pro.invoices"]);
  const mapping = applyPreset(headers, preset);
  const r = projectRow(rows[0], mapping, "invoices", preset);
  assert.equal(r.total, 340);
  assert.equal(r.amount_paid, 340);
  assert.equal(r.balance_due, 0);
  assert.equal(r.paid_date, "2026-03-14");
  assert.equal(r.job_external_id, "J-5001", "the job link is kept so the invoice attaches to the imported job");
});

test("Wave contacts: snake_case headers map, and the province/state slash header is handled", () => {
  const preset = getPreset("wave.contacts");
  const { headers, rows } = readCsv(FIXTURES["wave.contacts"]);
  const mapping = applyPreset(headers, preset);
  const r = projectRow(rows[0], mapping, "contacts", preset);
  assert.equal(r.first_name, "Priya");
  assert.equal(r.last_name, "Raman");
  assert.equal(r.state, "IL");
  assert.equal(r.postal_code, "62704");
  assert.equal(r.address_line1, "17 Dock Street");
  assert.equal(r.city, "Riverton");
});

// ── 6. an unreadable value is reported, not silently zeroed ────────────────

test("an unreadable money or date keeps the raw text alongside the null, so the preview can flag it", () => {
  const preset = getPreset("housecall_pro.invoices");
  const mapping = applyPreset(
    ["Invoice #", "Customer", "Invoice Date", "Total", "Balance"], preset);
  const r = projectRow(
    { "Invoice #": "77", Customer: "Someone", "Invoice Date": "whenever", Total: "lots", Balance: "0.00" },
    mapping, "invoices", preset);
  assert.equal(r.total, null);
  assert.equal(r.total_raw, "lots", "the raw value is kept so the row can say WHY it failed");
  assert.equal(r.issued_date, null);
  assert.equal(r.issued_date_raw, "whenever");
  assert.equal(r.balance_due, 0, "a real zero is still a real zero");
});

// ── 7. generic fallback + required-field checks ────────────────────────────

test("with no preset the generic matcher still finds the obvious columns", () => {
  const mapping = genericMapping(["Given Name", "Surname", "E-Mail", "Mobile", "Town"], "contacts");
  assert.equal(mapping.first_name, "Given Name");
  assert.equal(mapping.last_name, "Surname");
  assert.equal(mapping.email, "E-Mail");
  assert.equal(mapping.phone, "Mobile");
  assert.equal(mapping.city, "Town");
});

test("buildMapping fills the preset's gaps from the generic matcher without stealing its columns", () => {
  const preset = getPreset("jobber.contacts");
  const headers = ["First name", "Last name", "Email", "Job Title", "Business"];
  const mapping = buildMapping(headers, "contacts", preset);
  assert.equal(mapping.first_name, "First name");
  assert.equal(mapping.title, "Job Title", "generic picked up what the preset had no alias for");
  assert.equal(mapping.company, "Business");
  const used = Object.values(mapping);
  assert.equal(new Set(used).size, used.length);
});

test("missingRequired names what is still needed, in plain words", () => {
  assert.deepEqual(missingRequired({}, "contacts"), ["Email or Phone"]);
  assert.deepEqual(missingRequired({ phone: "Phone" }, "contacts"), []);
  assert.deepEqual(missingRequired({ total: "Total" }, "invoices"), ["Customer name or Customer email or Customer phone"]);
  assert.deepEqual(missingRequired({ customer_name: "Client", total: "Total" }, "invoices"), []);
  assert.equal(REQUIRED_FIELDS.jobs.length, 1);
});

test("normalizeHeader ignores case, spaces and punctuation", () => {
  assert.equal(normalizeHeader("Postal/Zip code"), "postalzipcode");
  assert.equal(normalizeHeader("  E-Mail  "), "email");
  assert.equal(normalizeHeader("Job #"), "job");
  assert.equal(normalizeHeader(""), "");
});
