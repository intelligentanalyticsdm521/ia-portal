// "Files and measurements" — the card's own decisions, and the wiring that
// cannot be seen from a unit test.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §12, D-136.
// oliver-api's lib/customerFiles.js is the boundary and refuses anything these
// would let through; these exist so the person finds out BEFORE a 20 MB upload
// rather than after, and so the two screens that render this card cannot start
// disagreeing about what a file is.
//
// WHAT THESE PIN
//
//   the allow list          images and PDF and nothing else, on BOTH sides. A
//                           deny list fails open the first time somebody
//                           invents an extension, and the browser is about to
//                           be asked to render whatever comes back.
//   the cap is 20 MB        the same number a job photo has, in one constant.
//   a thumbnail is TYPED    never guessed from a filename, so "map.png" that
//                           is really a PDF is not a broken image forever.
//   null size ≠ 0 bytes     "we do not know" and "empty" are different facts.
//   the account card is     `service_location_id IS NULL` on the server; on
//   the NO-LOCATION list    this side, a different path, never a filter here.
//   no portal surface       D-136 leaves "may a site contact see the site map"
//                           open, and an absent rule is not permission.
//
// MUTATION-TESTED (each broken on purpose and restored):
//   · fileProblem accepting every type   caught by "only images and PDF"
//   · showsThumbnail falling back to the caught by "a thumbnail is decided by
//     filename                                the content type, never the name"
//
// Pure: no DOM, no network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cf from "../src/lib/customerFiles.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const file = (over = {}) => ({
  customer_file_id: "11111111-1111-4111-8111-111111111111",
  kind: "site_map", kind_label: "Site map", title: "Ankeny site map",
  content_type: "application/pdf", size_bytes: 120_000, notes: null,
  is_image: false, service_location_id: "33333333-3333-4333-8333-333333333333",
  customer_account_id: null, customer_contact_id: null,
  uploaded_by: null, uploaded_by_name: "Brandon Dean",
  created_at: "2026-09-16T14:00:00.000Z",
  content_path: "/customers/files/11111111-1111-4111-8111-111111111111/content",
  ...over,
});

// ── what may be uploaded ───────────────────────────────────────────────────

test("only images and PDF are offered, and everything else is refused", () => {
  for (const type of cf.ACCEPTED_TYPES) {
    assert.equal(cf.fileProblem({ type, name: "x", size: 1000 }), null, `${type} should pass`);
  }
  for (const type of ["text/html", "image/svg+xml", "application/zip", "text/csv", ""]) {
    const problem = cf.fileProblem({ type, name: "x", size: 1000 });
    assert.ok(problem, `${type || "(no type)"} must be refused`);
    assert.match(problem, /PNG, JPG, WEBP, GIF or PDF/);
  }
});

test("the accept attribute comes from the SAME list the check uses", () => {
  // Two lists is a picker that offers what the check then rejects.
  assert.equal(cf.ACCEPT_ATTR, cf.ACCEPTED_TYPES.join(","));
  assert.ok(!cf.ACCEPT_ATTR.includes("svg"));
});

test("the cap is 20 MB and the message says so in MB", () => {
  assert.equal(cf.MAX_FILE_BYTES, 20 * 1024 * 1024);
  assert.equal(cf.fileProblem({ type: "image/png", name: "a.png", size: cf.MAX_FILE_BYTES }), null);
  const over = cf.fileProblem({ type: "image/png", name: "a.png", size: cf.MAX_FILE_BYTES + 1 });
  assert.match(over, /limit is 20 MB/);
  assert.match(over, /MB\./);
});

test("an empty file and no file at all each say which they are", () => {
  assert.match(cf.fileProblem({ type: "image/png", name: "a.png", size: 0 }), /empty/);
  assert.match(cf.fileProblem(null), /Choose a file/);
});

// ── the five kinds ─────────────────────────────────────────────────────────

test("the five kinds match the ones migration 216's CHECK allows", () => {
  assert.deepEqual([...cf.FILE_KINDS].sort(), ["document", "measurement", "photo", "plan", "site_map"]);
  for (const k of cf.FILE_KINDS) {
    assert.ok(cf.KIND_LABEL[k], `${k} has no label`);
    assert.ok(cf.KIND_HELP[k], `${k} has no help text — the picker would be five bare words`);
  }
});

test("a kind the server later adds reads as Document, not as blank", () => {
  assert.equal(cf.kindLabel("site_map"), "Site map");
  assert.equal(cf.kindLabel("permit"), "Document");
});

// ── how a row reads ────────────────────────────────────────────────────────

test("a size a person can read — and null is NOT zero bytes", () => {
  assert.equal(cf.formatBytes(512), "512 B");
  assert.equal(cf.formatBytes(2048), "2 KB");
  assert.equal(cf.formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.equal(cf.formatBytes(12 * 1024 * 1024), "12 MB");
  assert.equal(cf.formatBytes(null), "—", "'we do not know' must not print as an empty file");
  assert.equal(cf.formatBytes(undefined), "—");
});

test("a date that cannot be parsed reads as a dash, never 'Invalid Date'", () => {
  assert.equal(cf.formatFileDate(null), "—");
  assert.equal(cf.formatFileDate("not a date"), "—");
  assert.ok(cf.formatFileDate("2026-09-16T14:00:00.000Z").length > 3);
});

test("the uploader line drops the name it does not have instead of printing a blank", () => {
  assert.match(cf.uploaderLine(file()), /^Brandon Dean · /);
  const anon = cf.uploaderLine(file({ uploaded_by_name: null }));
  assert.ok(!anon.includes("·"), anon);
  assert.ok(!anon.startsWith(" "), anon);
});

// THE THUMBNAIL DECISION. Mutation target: make this read the filename and the
// test below is the one that goes red.
test("a thumbnail is decided by the content type, never by the filename", () => {
  assert.equal(cf.showsThumbnail({ is_image: true, content_type: "image/png" }), true);
  assert.equal(cf.showsThumbnail({ is_image: false, content_type: "application/pdf" }), false);
  // The trap: a PDF named .png. Drawing it as an image is a broken thumbnail
  // on the crew's page forever.
  assert.equal(
    cf.showsThumbnail({ is_image: false, content_type: "application/pdf", title: "map.png" }),
    false,
  );
  // And when the server did not say, the TYPE decides — still not the name.
  assert.equal(cf.showsThumbnail({ content_type: "image/jpeg" }), true);
  assert.equal(cf.showsThumbnail({ content_type: null }), false);
});

test("a filename becomes a sensible default title", () => {
  assert.equal(cf.titleFromFileName("Ankeny site map.pdf"), "Ankeny site map");
  assert.equal(cf.titleFromFileName("C:\\\\Users\\\\b\\\\plan.png"), "plan");
  assert.equal(cf.titleFromFileName("noextension"), "noextension");
  assert.equal(cf.titleFromFileName(""), "", "empty in, empty out — Upload stays disabled");
});

// ── the order the card shows them in ───────────────────────────────────────

test("site maps and plans come first — the two a dispatcher opens at 4am", () => {
  const rows = [
    file({ customer_file_id: "d", kind: "document", created_at: "2026-09-16T10:00:00Z" }),
    file({ customer_file_id: "p", kind: "photo", created_at: "2026-09-16T11:00:00Z" }),
    file({ customer_file_id: "s", kind: "site_map", created_at: "2026-09-01T10:00:00Z" }),
    file({ customer_file_id: "n", kind: "plan", created_at: "2026-09-02T10:00:00Z" }),
  ];
  assert.deepEqual(cf.orderFiles(rows).map((f) => f.customer_file_id), ["s", "n", "p", "d"]);
});

test("inside a kind, the newest is first", () => {
  const rows = [
    file({ customer_file_id: "old", kind: "photo", created_at: "2026-01-01T00:00:00Z" }),
    file({ customer_file_id: "new", kind: "photo", created_at: "2026-09-16T00:00:00Z" }),
  ];
  assert.deepEqual(cf.orderFiles(rows).map((f) => f.customer_file_id), ["new", "old"]);
});

test("ordering does not mutate the array it was given", () => {
  const rows = [file({ customer_file_id: "a", kind: "document" }), file({ customer_file_id: "b", kind: "site_map" })];
  const before = rows.map((f) => f.customer_file_id);
  cf.orderFiles(rows);
  assert.deepEqual(rows.map((f) => f.customer_file_id), before);
});

// ── the wiring no unit test above can see ──────────────────────────────────

const cardSrc = read("components/customers/FilesCard.tsx");
const panelSrc = read("components/customers/LocationPanel.tsx");
const modalSrc = read("components/oliver/customer/CustomerModal.tsx");

test("the Location page renders the card against the LOCATION's path", () => {
  assert.match(panelSrc, /<FilesCard/);
  assert.match(panelSrc, /\/customers\/locations\/\$\{locationId\}\/files/);
});

test("the customer record renders it against the CUSTOMER's path, not a filter", () => {
  assert.match(modalSrc, /<FilesCard/);
  assert.match(modalSrc, /\/customers\/\$\{subject\.kind\}\/\$\{subject\.id\}\/files/);
  assert.match(modalSrc, /Files for the whole account/);
  // A location's files must not be fetched and then filtered in the browser:
  // that is a second definition of "belongs to the account".
  assert.ok(!/service_location_id\s*===?\s*null/.test(modalSrc));
});

test("ONE card component serves both, taking a path rather than a kind", () => {
  // Two copies would be two answers to "is 20 MB too big" the first time one
  // of them was fixed — the reason NotesCard takes a path too.
  assert.match(cardSrc, /path:\s*string/);
  assert.ok(!/customerKind/.test(cardSrc), "the card must not branch on who owns the file");
  const imports = (panelSrc + modalSrc).match(/from "\.\.?\/.*FilesCard"/g) || [];
  assert.equal(imports.length, 2, "both screens import the same component");
});

test("the card never points an <img> straight at storage", () => {
  // The container is private; the bytes come back through the tenant guard.
  assert.ok(!/blob\.core\.windows\.net/.test(cardSrc));
  assert.match(cardSrc, /fetchBlob/);
  assert.match(cardSrc, /createObjectURL/);
  assert.match(cardSrc, /revokeObjectURL/,
    "an object URL that is never revoked keeps its bytes for the life of the tab");
});

test("the file input offers only what the check accepts", () => {
  assert.match(cardSrc, /accept=\{ACCEPT_ATTR\}/);
  assert.ok(!/accept="[^"]*\*/.test(cardSrc), "accept=\"image/*\" would offer SVG, which the server refuses");
});

test("removing a file says it is not a deletion", () => {
  assert.match(cardSrc, /stays on the record/);
  assert.match(cardSrc, /del\(`\/customers\/files\/\$\{file\.customer_file_id\}`\)/);
});

// D-136 fails CLOSED on portal visibility. If a portal version of this card is
// ever added, this assertion has to be deleted on purpose rather than by
// accident.
test("there is NO customer-portal version of this card in this pass", () => {
  const portalDirs = ["pages/public", "components/portal"];
  for (const rel of portalDirs) {
    const dir = path.join(SRC, rel);
    if (!fs.existsSync(dir)) continue;
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = fs.readFileSync(full, "utf8");
        assert.ok(!/FilesCard|customers\/files|customer_file/.test(src),
          `${path.relative(SRC, full)} exposes customer files to the portal — D-136 leaves that open`);
      }
    };
    walk(dir);
  }
});
