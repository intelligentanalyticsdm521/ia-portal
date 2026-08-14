// sheetImport.ts — read a contact list out of a CSV, TSV or XLSX file.
//
// WHY NOT A LIBRARY
// -----------------
// The obvious pick is SheetJS, but its last npm release (xlsx@0.18.5) carries
// a known prototype-pollution CVE that's only fixed in versions published
// outside npm. Shipping a known-vulnerable parser to run on files our clients
// upload isn't worth saving a day. ExcelJS is maintained but heavy for what we
// need, and this import wants exactly one thing: the cell values of the first
// sheet. No formulas, no styles, no number formats.
//
// An .xlsx is a ZIP of XML, and browsers now inflate natively via
// DecompressionStream("deflate-raw"), so the whole reader is a few hundred
// lines with zero dependencies, zero bundle cost, and no third-party CVE
// surface. Requires Chrome 80+ / Edge / Firefox 113+ / Safari 16.4+; older
// browsers get a clear "save it as CSV" message rather than a broken import.
//
// The CSV path also replaces the old `line.split(",")` in SparkContactsPage,
// which corrupted any file containing a quoted comma — "Smith, John" became
// two columns and shifted every field after it.

/** A parsed sheet: array of rows, each an array of cell strings. */
export type Grid = string[][];

export class SheetImportError extends Error {}

// ── Delimited text (CSV / TSV) ───────────────────────────────────────────────

/**
 * RFC4180-ish parser: honours quoted fields, escaped quotes (""), embedded
 * commas and embedded newlines. Auto-detects tab vs comma from the header row.
 */
export function parseDelimited(text: string): Grid {
  const clean = text.replace(/^﻿/, ""); // strip BOM from Excel exports
  const firstLine = clean.slice(0, clean.indexOf("\n") + 1 || undefined);
  const delim = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";

  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

interface ZipEntry { name: string; data: Uint8Array }

/** Read the ZIP central directory and inflate every entry we care about. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<ZipEntry[]> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // End of central directory: scan back for signature 0x06054b50.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new SheetImportError("That doesn't look like a valid .xlsx file.");

  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true); // central directory offset
  const out: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!wanted(name)) continue;

    // Local header: its own name/extra lengths tell us where the data starts.
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);

    if (method === 0) { out.push({ name, data: raw }); continue; }
    if (method !== 8) throw new SheetImportError("This .xlsx uses an unsupported compression method.");
    out.push({ name, data: await inflateRaw(raw) });
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new SheetImportError(
      "This browser can't read .xlsx files. Save the sheet as CSV and import that instead.",
    );
  }
  // Copy into a fresh ArrayBuffer-backed view: `data` is a subarray of the
  // file's buffer, and TS types that as ArrayBufferLike (possibly Shared),
  // which BlobPart won't accept.
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const decode = (u: Uint8Array) => new TextDecoder().decode(u);

/** "A"→0, "Z"→25, "AA"→26 … */
function colToIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function parseXlsx(file: File): Promise<Grid> {
  const buf = await file.arrayBuffer();
  const entries = await unzip(
    buf,
    (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || n.startsWith("xl/worksheets/"),
  );
  const byName = new Map(entries.map((e) => [e.name, e.data]));

  // Shared strings — most text cells are indexes into this table.
  const shared: string[] = [];
  const ss = byName.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = new DOMParser().parseFromString(decode(ss), "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      // Runs (<r><t>) must be concatenated — rich text splits a single string.
      const ts = Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "");
      shared.push(ts.join(""));
    }
  }

  // First worksheet. sheet1.xml is the convention; fall back to whichever
  // worksheet sorts first so oddly-named workbooks still import.
  const sheetNames = entries
    .map((e) => e.name)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10)));
  const sheetData = sheetNames.length ? byName.get(sheetNames[0]) : undefined;
  if (!sheetData) throw new SheetImportError("Couldn't find a worksheet in that file.");

  const doc = new DOMParser().parseFromString(decode(sheetData), "application/xml");
  const grid: Grid = [];
  for (const rowEl of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(rowEl.getElementsByTagName("c"))) {
      const idx = colToIndex(c.getAttribute("r") || "");
      const type = c.getAttribute("t");
      let value = "";
      if (type === "s") {
        const v = c.getElementsByTagName("v")[0]?.textContent;
        value = v != null ? (shared[Number(v)] ?? "") : "";
      } else if (type === "inlineStr") {
        value = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent || "").join("");
      } else {
        value = c.getElementsByTagName("v")[0]?.textContent || "";
      }
      if (idx >= 0) { while (cells.length < idx) cells.push(""); cells[idx] = value.trim(); }
    }
    if (cells.some((x) => x !== "")) grid.push(cells);
  }
  return grid;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** Read any supported file into a grid. Throws SheetImportError with copy fit to show a user. */
export async function readSpreadsheet(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return parseXlsx(file);
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseDelimited(await file.text());
  }
  if (name.endsWith(".xls")) {
    throw new SheetImportError(
      "That's the older .xls format. Open it in Excel and 'Save As' .xlsx or .csv, then try again.",
    );
  }
  throw new SheetImportError("Unsupported file type. Use .csv or .xlsx.");
}

/** Header row → objects, with headers lowercased and space/underscore-normalised. */
export function gridToRows(grid: Grid): Array<Record<string, string>> {
  if (!grid.length) return [];
  // Hyphens matter: real exports ship "E-mail" and "First-Name". Folding
  // -, _ and whitespace to a single space is what lets one alias list cover
  // "First Name", "first_name" and "First-Name".
  const headers = grid[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, " "));
  return grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) obj[h] = (cells[i] ?? "").trim(); });
    return obj;
  });
}

/**
 * Pull our contact fields out of a row whatever the sheet calls them.
 * Real exports say "First Name" / "first_name" / "Given Name" / "E-mail".
 */
export function toContact(row: Record<string, string>) {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (row[k]) return row[k];
    return "";
  };
  return {
    first_name: pick("first name", "firstname", "given name", "first"),
    last_name: pick("last name", "lastname", "surname", "family name", "last"),
    email: pick("email", "e mail", "email address", "mail"),
    phone: pick("phone", "phone number", "mobile", "telephone", "tel"),
    company: pick("company", "company name", "organisation", "organization", "account"),
    title: pick("title", "job title", "role", "position"),
  };
}
