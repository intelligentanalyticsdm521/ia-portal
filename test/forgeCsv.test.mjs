// The CSV writer is the one piece of the export feature with rules that are
// easy to get subtly wrong and impossible to see wrong: a missing BOM only
// shows up as a mangled accent in Excel, and a missed formula guard only shows
// up on the machine of whoever the file was sent to. Both are pinned here.
//
// The rest of the feature is React and is covered by tsc and the click-through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvBlankIfDash, csvFilename, toCsvText } from "../src/pages/forge/forgeCsv.ts";

const COLUMNS = [{ label: "Name" }, { label: "Phone" }];
const write = (rows) => toCsvText(COLUMNS, rows, (row, col) => row[col.label]);

test("writes a BOM, CRLF line breaks and the header first", () => {
  const csv = write([{ Name: "Renée Dubois", Phone: "515-555-0131" }]);
  assert.equal(csv, "\uFEFFName,Phone\r\nRenée Dubois,515-555-0131\r\n");
});

test("quotes commas, quotes and line breaks per RFC 4180", () => {
  const csv = write([{ Name: 'Smith, "Bo" Jr', Phone: "a\nb" }]);
  assert.equal(csv, '\uFEFFName,Phone\r\n"Smith, ""Bo"" Jr","a\nb"\r\n');
});

test("defuses a formula but leaves a phone number and a negative amount alone", () => {
  const csv = write([
    { Name: "=HYPERLINK(\"http://evil\")", Phone: "+1 515 555 0131" },
    { Name: "@SUM(A1)", Phone: "-250" },
    // The canonical DDE payload. It begins with a DIGIT after the sign, which
    // is why "is the next character a digit?" is not the test — this line is
    // the reason the guard looks at the shape of the whole value instead.
    { Name: "-2+3+cmd|' /C calc'!A0", Phone: "-$1,234" },
  ]);
  const rows = csv.replace("\uFEFF", "").trim().split("\r\n").slice(1);
  // Quoted because the defused value now holds a comma or a quote; the
  // apostrophe is what stops the spreadsheet evaluating it.
  assert.equal(rows[0], `"'=HYPERLINK(""http://evil"")",+1 515 555 0131`);
  assert.equal(rows[1], "'@SUM(A1),-250");
  // Defused but not quoted: an apostrophe is not one of the four characters
  // RFC 4180 quotes for, and the money beside it is quoted only for its comma.
  assert.equal(rows[2], `'-2+3+cmd|' /C calc'!A0,"-$1,234"`);
});

test("a phone number, a negative amount and formatted money are never rewritten", () => {
  for (const untouched of [
    "+1 515 555 0131", "+44 (0) 20 7946 0958", "-250", "-1,234.56", "-$1,234",
    // Phone numbers carry words. An earlier version of the guard defused any
    // signed value containing a letter, which put an apostrophe in front of
    // every extension in the volunteer list.
    "+1 515 555 0131 ext. 4", "+1 515 555 0131 x4", "+1 515 555 0131 (mobile)",
  ]) {
    const csv = toCsvText([{ label: "V" }], [{ V: untouched }], (r) => r.V);
    assert.ok(!csv.includes("'"), `${untouched} should not have been defused`);
  }
});

test("an empty list still writes its header, so the file is never a mystery", () => {
  assert.equal(write([]), "\uFEFFName,Phone\r\n");
});

test("the em dash the table draws becomes an empty cell", () => {
  assert.equal(csvBlankIfDash("—"), "");
  assert.equal(csvBlankIfDash("Sep 8, 2025"), "Sep 8, 2025");
});

test("names the file after the screen, dated today in the local zone", () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(csvFilename("Grant Applications"), `grant-applications-${stamp}.csv`);
  assert.equal(csvFilename("Recurring Gifts"), `recurring-gifts-${stamp}.csv`);
});
