// The bank statement import must ACCEPT the file the bank hands the client.
//
// PRE-WALK 1b, 2026-09-16, walk row S6: "The file your bank calls a Quicken or
// QuickBooks download imports beside CSV, and never twice."
//
// oliver-api does all of it already, verified against the running dev stack:
//   · /ledger/bank-import/presets advertises
//     { key: "ofx", file_kind: "ofx", extensions: ["ofx","qfx","qbo"] }
//   · a .qfx preview reads the file, masks the account to "••••6789" and shows
//     signed amounts before writing anything
//   · re-importing the same file: created 0, skipped 3
//
// And none of it was reachable, because this picker was
// `accept=".csv,text/csv,text/plain"` — the Choose button would not even let
// the file be SELECTED, and it was labelled "Choose a CSV".
//
// The accept list is built FROM the presets so there is one list, on the
// server, and nothing to keep in step by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptFromPresets, chooseFileLabel } from "../src/pages/stella/accounting/bankImportAccept.ts";

// The presets endpoint's real answer, trimmed to the shape this reads.
const PRESETS = [
  { key: "generic_signed", label: "Generic — Date, Description, Amount", convention: "amount_signed", day_first: false, file_kind: "csv" },
  { key: "generic_debit_credit", label: "Generic — separate Debit and Credit", convention: "debit_credit", day_first: false, file_kind: "csv" },
  {
    key: "ofx", label: "OFX / QFX / QBO (Quicken, QuickBooks Web Connect)",
    convention: "amount_signed", day_first: false, file_kind: "ofx",
    extensions: ["ofx", "qfx", "qbo"],
  },
];

test("a Quicken or QuickBooks download can be chosen", () => {
  const accept = acceptFromPresets(PRESETS);
  for (const ext of [".qfx", ".qbo", ".ofx"]) {
    assert.ok(accept.split(",").includes(ext), `the picker must offer ${ext} — got "${accept}"`);
  }
});

test("CSV is still first and still accepted", () => {
  const accept = acceptFromPresets(PRESETS);
  assert.ok(accept.startsWith(".csv"), `CSV stays the first thing offered — got "${accept}"`);
  assert.ok(accept.includes("text/csv"), "and the media type is still there for pickers that use it");
});

test("the list comes from the server, not from a second copy here", () => {
  // Drop the OFX preset — a server that stops offering it must stop the picker
  // offering it too. A hard-coded list would keep saying .qfx after the reader
  // was gone, which is how a client is invited to upload a file nothing reads.
  const csvOnly = acceptFromPresets(PRESETS.filter((p) => p.key !== "ofx"));
  assert.ok(!csvOnly.includes(".qfx"), `got "${csvOnly}"`);
  assert.equal(chooseFileLabel(PRESETS.filter((p) => p.key !== "ofx")), "Choose a CSV");
});

test("a dotted, upper-case or blank extension from the server is tolerated", () => {
  const messy = [{ key: "ofx", label: "x", convention: "c", day_first: false, extensions: [".QFX", "qbo", "", null] }];
  const accept = acceptFromPresets(messy);
  assert.ok(accept.split(",").includes(".qfx"), `got "${accept}"`);
  assert.ok(accept.split(",").includes(".qbo"), `got "${accept}"`);
  assert.ok(!/\.\.|,\.,|\.,/.test(accept), `no empty entries — got "${accept}"`);
});

test("the button says what it takes", () => {
  assert.equal(chooseFileLabel(PRESETS), "Choose a CSV or OFX/QFX/QBO file");
  assert.equal(chooseFileLabel([]), "Choose a CSV");
});
