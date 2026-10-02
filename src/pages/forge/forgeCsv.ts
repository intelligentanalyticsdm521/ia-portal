/**
 * forgeCsv.ts — the one CSV writer in FORGE.
 *
 * Every list screen can now hand its rows to a spreadsheet, so the handful of
 * rules a spreadsheet actually cares about are settled once, here, rather than
 * per screen. Reports carried its own eight-line copy and got three of them
 * wrong — no byte-order mark, LF line breaks, and nothing stopping a value that
 * starts with `=` from being run as a formula on the recipient's machine. That
 * copy is gone; this is what it calls.
 */

/** A column is whatever the screen already has, so long as it can name itself. */
export interface CsvColumnLike {
  label: string;
}

/**
 * Excel, Sheets and LibreOffice all treat a cell beginning `=`, `+`, `-` or `@`
 * as a formula, so a note or a name typed as `=HYPERLINK("http://…")` becomes
 * live the moment the file is opened — on the machine of whoever we sent it to.
 * A leading apostrophe is the standard defusal: the value still reads correctly
 * and simply cannot be evaluated.
 *
 * `=` and `@` are always suspect. `+` and `-` are not, because this data is full
 * of them: `+1 515 555 0131` is a volunteer's phone number, `-250` is a negative
 * amount and `-$1,234` is how our own money formatter writes one — quietly
 * rewriting any of those would be its own defect. So a leading sign is left
 * alone when the WHOLE value is shaped like a number or a phone number, and
 * defused otherwise.
 *
 * Testing the next character instead (is it a digit or a space?) is the obvious
 * version of this rule and it does not work: the canonical DDE payload is
 * `-2+3+cmd|' /C calc'!A0`, which begins with a digit and would sail through.
 * What separates a phone number from a formula is not its second character, it
 * is the letters, pipes and bangs further along.
 */
const SIGNED = /^[+-]/;
/* What makes a signed value dangerous is not that it contains letters — real
   phone numbers carry them ("+1 515 555 0131 ext. 4", "+44 20 7946 0958 x22")
   and defusing those puts a stray apostrophe in front of a number someone is
   about to dial. It is the machinery a formula needs: a call like `HYPERLINK(`
   or `cmd(`, or the DDE pipe and bang of `-2+3+cmd|' /C calc'!A0`. That payload
   starts with a digit, which is why "is the next character a digit?" is not the
   test. */
const FORMULA_MACHINERY = /[|!]|[A-Za-z]{2,}\s*\(/;
const needsDefusing = (s: string) => /^[=@]/.test(s) || (SIGNED.test(s) && FORMULA_MACHINERY.test(s));

/**
 * RFC 4180: quote a field that holds a quote, a comma or a line break, and
 * double any quote inside it. Leading and trailing spaces are quoted too — they
 * survive either way by the letter of the spec, but Excel eats them unquoted,
 * and a name that arrived with a trailing space is a data fact someone may want
 * to see rather than one we should hide.
 */
function field(value: string): string {
  const s = needsDefusing(value) ? `'${value}` : value;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The screen writes an em dash where a value is missing, which is right in a
 * table and wrong in a spreadsheet: a column of dashes cannot be sorted or
 * filtered, and "—" in an email column is a message addressed to nobody. Screens
 * pass their cell text through this so an empty cell is empty.
 */
export const csvBlankIfDash = (text: string) => (text === '—' ? '' : text);

/**
 * Columns name themselves, rows are whatever the screen holds, and `cell` is the
 * screen's own formatting — so the file reads like the table it came from
 * instead of like the database underneath it.
 */
export function toCsvText<C extends CsvColumnLike, R>(
  columns: readonly C[],
  rows: readonly R[],
  cell: (row: R, column: C) => string
): string {
  const lines = [columns.map((c) => field(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => field(cell(row, c))).join(','));
  /* CRLF because RFC 4180 says so and because the reader here is Excel on
     Windows. The BOM because without it Excel reads the file in the machine's
     legacy codepage: "Renée" opens as "RenÃ©e", which is how an export gets
     reported as a bug instead of being used. */
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Hand the text to the browser as a file the person chose to receive. */
export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  /* In the document, not detached: Firefox ignores a click on an anchor that is
     not in the tree. Taken out again straight away so a screen exported twice
     does not collect invisible anchors. */
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoked on a later task, not this one. Chromium starts reading the blob
     during click dispatch, so revoking immediately is harmless there; Firefox
     and Safari have historically dropped a download whose object URL was
     revoked in the same tick, and the bigger the file the wider that window. */
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** `Grant Applications` -> `grant-applications-2026-09-27.csv`. */
export function csvFilename(base: string): string {
  const kebab = base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* The LOCAL date, not toISOString(): a file exported at 7pm in Iowa would
     otherwise be stamped tomorrow, and the date on the file is there to match
     the day the person remembers doing it. */
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${kebab || 'export'}-${stamp}.csv`;
}
