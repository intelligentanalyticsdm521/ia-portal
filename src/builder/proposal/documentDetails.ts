/**
 * builder/proposal/documentDetails.ts — the blanks a document carries, as FIELDS.
 *
 * ── THE DEFECT THIS EXISTS FOR (D-03 / D-35, 2026-09-16 user test) ────────
 * A first-time user built the whole snow & ice agreement, pressed **Send to
 * customer**, and was refused: *"5 details are still blank (Service term
 * starts, Service term ends, snow_trigger, severe_event_threshold)"*. Two of
 * those four names are raw developer tokens, and — this is the part that makes
 * the document unsendable rather than merely clunky — **there was no control
 * anywhere in the Portal to fill any of them**. The only way through was to
 * click the sentence on the page, select the whole paragraph and retype it
 * with the numbers in place of the braces, destroying the merge field. The
 * tester did that four times.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * **Every blank the document can carry is a field somewhere.** A token that
 * appears on a customer-facing page and that nothing else fills gets a row in
 * the Details group, with a plain-word label, and it is filled by typing in a
 * box. Never by editing the page over the top of the token.
 *
 * ── WHERE THE VALUES LIVE: ONE HOME, `settings.merge` (N-7) ──────────────
 * `doc.settings.merge` — a flat `token -> value` map on the document's own
 * settings, carried tolerantly and absent when empty by `model.ts`
 * `deserialise` (handoff A-3) and by oliver-api `lib/documentModel.js`, and
 * read by `lib/proposalContext.js` so a value typed here reaches the canvas,
 * the customer's page AND the PDF.
 *
 * It used to live on `sections[0].meta.detailValues`, because `model.ts` was
 * another stream's file and carried only three settings keys. Both halves have
 * landed, so the second home is gone: `readDetails` still READS the old place
 * (documents saved between 2026-09-16 and now carry it) and `writeDetails`
 * only ever writes the new one AND clears the old, so a document is migrated
 * the first time anybody touches it. Two carriers for one fact is how the
 * canvas and the PDF started disagreeing (D-03); there is one now.
 *
 * Two homes were tried before that and each is worse:
 *   · a hidden `visibility:"internal"` SECTION holding a key_value_table. It
 *     worked, and then broke the document: a widget added with nothing
 *     selected is appended to the LAST section (D-11), the store was the last
 *     section, and three priced property blocks landed inside it — internal,
 *     so excluded from the customer copy, the PDF and the total. Found by
 *     driving it, not by reading it. A store must not be somewhere a widget
 *     can land.
 *   · the same section placed FIRST dodges that and puts a dashed amber box
 *     above the title band on every document.
 *
 * `settings` is none of those things: it is not a section, not a widget, not a
 * render target, and it survives save → close → reopen in both repos.
 *
 * LABELS ARE NOT STORED. A row's plain words are derived every time from the
 * template's declaration, the shipped clause packs and the merge-tag catalogue
 * (`plainLabel`), so a label improved in one place improves on every document
 * that ever carried the token — and the store stays the flat map the server
 * already knows how to read.
 *
 * Pure. No React, no fetch — so all of it is `node --test`.
 */
import { walkWidgets, type BuilderDocument, type Section } from "../model";
import { patchNode } from "../treeOps";
import { tokensIn, tagLabel, lookup, BUILTIN_TAGS, type MergeContext } from "../merge";

/**
 * The key the values USED to live under, on `sections[0].meta`.
 *
 * Kept only so `readDetails` can still open a document written before N-7 and
 * so the test that proves the migration has a name for the old place. Nothing
 * writes it.
 */
export const LEGACY_DETAILS_KEY = "detailValues";

/** One blank the document carries. */
export interface DetailRow {
  /** The merge token exactly as it is written on the page, e.g. `snow_trigger`. */
  token: string;
  /** Plain words a home-services owner reads. NEVER the raw token. */
  label: string;
  /** What the author typed. Empty means still blank. */
  value: string;
  /** One line under the box saying what to put in it. Optional. */
  help?: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   Plain words for a token
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Words for the tokens the SHIPPED clause packs and templates write.
 *
 * `{{snow_trigger}}` and `{{severe_event_threshold}}` are not the platform's
 * merge tags — they come out of `oliver-api lib/clausePacks.js`, the snow & ice
 * starter clauses — and they were two of the four names a first-time user was
 * shown and told to go and find. The prettifier below would turn them into
 * "Snow trigger" and "Severe event threshold", which is already better than a
 * token, but these are the words a snow contractor actually uses, and the help
 * line says what number goes in the box.
 */
const PACK_LABELS: Record<string, { label: string; help: string }> = {
  snow_trigger: {
    label: "Trigger depth",
    help: "How much snow before you plow — e.g. 2 inches",
  },
  severe_event_threshold: {
    label: "Severe-event threshold",
    help: "Snowfall above this is billed separately — e.g. 8 inches",
  },
  plow_rate: { label: "Plowing rate", help: "What one push costs — e.g. $625" },
  salt_rate: { label: "Salting rate", help: "What one application costs" },
  response_time: { label: "Response time", help: "How long after the trigger you are on site — e.g. 4 hours" },
  season_start: { label: "Season starts", help: "The first date you are on call" },
  season_end: { label: "Season ends", help: "The last date you are on call" },
  /* The two the commercial snow & ice agreement writes (D-164). The CLAUSE
     around each of them ships as words in the template — "Invoices are due
     …", "The smallest amount any single visit is billed at is …" — so what
     the author types here is the short fact the sentence is missing, not a
     paragraph squeezed into a one-line box. */
  payment_terms: {
    label: "Payment terms",
    help: "When an invoice is due — e.g. 30 days from the invoice date",
  },
  minimum_charge: {
    label: "Minimum charge",
    help: "The smallest amount any one visit is billed at — e.g. $175",
  },
};

/** The plain-word label and the help line for a token the packs declare. */
export function packDetail(token: string): { label: string; help: string } | undefined {
  return PACK_LABELS[String(token ?? "").trim()];
}

/**
 * Plain words for a token, and NEVER the token itself.
 *
 * In order: a label the template declared, then the shipped clause packs'
 * own vocabulary, then the platform's merge-tag catalogue, then a prettifier
 * that turns `gate_access_window` into "Gate access window". There is no
 * branch that returns the raw token to a screen.
 */
export function plainLabel(token: string, declared: Record<string, string> = {}): string {
  const key = String(token ?? "").trim();
  if (!key) return "";
  if (declared[key]) return declared[key];
  const pack = PACK_LABELS[key];
  if (pack) return pack.label;
  const builtin = BUILTIN_TAGS.find((t) => t.token === key);
  if (builtin) return builtin.label;
  const fallback = tagLabel(key);
  if (fallback !== key) return fallback;
  const words = key.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/* ══════════════════════════════════════════════════════════════════════════
   Reading the store
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The rows the document is carrying, in the order they were written.
 *
 * ONE home — `settings.merge` — read TOLERANTLY: a document written before
 * N-7 carries them on `sections[0].meta.detailValues`, and refusing to read
 * that would blank every trigger depth a person typed last week. The old place
 * is read and never written; the first `writeDetails` moves the document over.
 */
export function readDetails(doc: BuilderDocument): DetailRow[] {
  const merge = (doc as any)?.settings?.merge;
  if (merge && typeof merge === "object" && !Array.isArray(merge)) {
    const out: DetailRow[] = [];
    for (const [k, v] of Object.entries(merge as Record<string, unknown>)) {
      const token = String(k ?? "").trim();
      if (!token || v == null || typeof v === "object") continue;
      out.push({ token, label: plainLabel(token), value: String(v) });
    }
    if (out.length) return out;
  }
  return readLegacyDetails(doc);
}

/** The pre-N-7 store, on the first section that carries one. Read only. */
export function readLegacyDetails(doc: BuilderDocument): DetailRow[] {
  for (const s of doc.sections) {
    const rows = (s as any)?.meta?.[LEGACY_DETAILS_KEY];
    if (!Array.isArray(rows)) continue;
    return rows
      .filter((r: any) => r && String(r.token ?? "").trim())
      .map((r: any) => ({
        token: String(r.token).trim(),
        label: String(r.label ?? "").trim() || plainLabel(String(r.token).trim()),
        value: String(r.value ?? ""),
        ...(r.help ? { help: String(r.help) } : {}),
      }));
  }
  return [];
}

/** Token → value, for the render context. Blank values are LEFT OUT, so the
 *  gap rule still counts them as unfilled rather than printing an empty run. */
export function detailsMerge(rows: DetailRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (String(r.value ?? "").trim()) out[r.token] = String(r.value);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Writing the store
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The document with exactly these Details rows, in the ONE home.
 *
 * Writes `settings.merge` and CLEARS the pre-N-7 `meta.detailValues` from every
 * section, so a document that has been touched carries the values in exactly
 * one place. A BLANK value is not stored — the gap rule counts an absent token
 * as unfilled, and storing `""` would be a second way of saying the same thing.
 *
 * An empty list removes the key entirely, so "fill nothing in" leaves the
 * document byte-identical to what it was — the same discipline `style` follows
 * in §11.8.
 */
export function writeDetails(doc: BuilderDocument, rows: DetailRow[]): BuilderDocument {
  const merge: Record<string, string> = {};
  for (const r of rows) {
    const token = String(r?.token ?? "").trim();
    const value = String(r?.value ?? "");
    if (token && value.trim()) merge[token] = value;
  }

  const settings: BuilderDocument["settings"] = { ...doc.settings };
  delete settings.merge;
  if (Object.keys(merge).length) settings.merge = merge;

  const sections = doc.sections.map((s) => {
    if (!(s as any).meta || !(LEGACY_DETAILS_KEY in ((s as any).meta as object))) return s;
    const meta: Record<string, unknown> = { ...((s as any).meta as object) };
    delete meta[LEGACY_DETAILS_KEY];
    const next: Section = { ...s };
    if (Object.keys(meta).length) (next as any).meta = meta;
    else delete (next as any).meta;
    return next;
  });

  return { ...doc, settings, sections };
}

/* ══════════════════════════════════════════════════════════════════════════
   What the document is ASKING for
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every token used on a customer-facing page, in reading order.
 *
 * ── IT WALKS THE TREE (D-164 follow-up) ───────────────────────────────────
 * This read `c.widgets` and stopped there, so a merge tag inside a BOX was
 * invisible to the Details group: the snow & ice agreement's cover puts its
 * four key facts in a row container, and the two service-term tokens only had
 * boxes at all because the title band happened to repeat them. Take the
 * repetition away — one fact, one place — and the service term had no field
 * anywhere, which is D-03 all over again. `walkWidgets` is the engine's own
 * walk (§11.12) and finds a widget at any depth.
 */
export function tokensUsedBy(doc: BuilderDocument): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") { for (const t of tokensIn(v)) if (!out.includes(t)) out.push(t); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    walk(widget.props);
  }
  return out;
}

/**
 * THE ONE BLANK RULE — what Send refuses over (2026-09-18).
 *
 * **Any merge tag that is ON the document and resolves to nothing is a blank.**
 * One rule, one list, whether the tag is a clause pack's own (`snow_trigger`)
 * or one of the platform's built-ins (`contract.start_date`).
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * A commercial snow & ice agreement was SENT with both service-term dates
 * empty, and the cover printed two blank rules where the dates belong. The
 * guard it walked past read the top of each column only — `for (section) for
 * (column) for (widget)` — and the cover's four key facts are a ROW, a
 * container. A container has children, not props, so the walk looked at its
 * (absent) props, found no text, and reported nothing missing. The two term
 * tags were the only tags that lived inside it.
 *
 * The Details group had already been moved onto `walkWidgets` for exactly this
 * reason, so the page offered boxes for two dates that Send never asked about:
 * two answers to "what is still blank". There is one now — `tokensUsedBy` is
 * the single walk, and the guard is a filter over it.
 *
 * A tag that is NOT on the document is never asked for: the list starts from
 * what the page uses, so taking a paragraph off the page takes its blank with
 * it, which is what the refusal's own words offer as the second way out.
 */
export function blankTokens(doc: BuilderDocument, merge: MergeContext): string[] {
  return tokensUsedBy(doc).filter((token) => lookup(merge, token) == null);
}

/**
 * The words Send refuses in — ONE sentence, and both buttons say it.
 *
 * A first draft and a revision each carried their own copy of this string, and
 * a copy is a place the two can drift: the sentence names the blanks, says
 * where the boxes are and offers the second way out, and a fix to one of those
 * three in the wrong copy is a refusal that lies on one of the two buttons.
 *
 * Four names at most, so a document with eleven blanks refuses in a sentence a
 * person reads rather than a list they scroll. PLAIN WORDS every time —
 * "Service term starts", never `contract.start_date`.
 */
export function blanksRefusal(blanks: string[], labels: Record<string, string> = {}): string {
  const list = blanks.slice(0, 4).map((t) => plainLabel(t, labels)).join(", ");
  return `${blanks.length} detail${blanks.length === 1 ? " is" : "s are"} still blank (${list}).`
    + " Type them into the Details boxes on the left, or take them off the page, before sending.";
}

/**
 * The Details group, reconciled against the document as it is NOW.
 *
 * · a token the page uses that nothing else fills gets a row (kept if it
 *   already had one, so a value is never lost by adding a section);
 * · a row whose token has left the page but still holds a value is KEPT and
 *   marked `stale` by the caller's own eye — we keep it rather than throw the
 *   author's typing away when they delete a paragraph and undo;
 * · a row whose token has left the page and is empty is dropped.
 *
 * @param autoFilled tokens the adapter fills from the customer/business pick —
 *                   those are NOT the author's to type and get no row.
 * @param declared   template-declared plain labels and help text.
 */
export function reconcileDetails(
  doc: BuilderDocument,
  autoFilled: Record<string, string>,
  declared: Record<string, { label: string; help?: string }> = {},
): DetailRow[] {
  const existing = new Map(readDetails(doc).map((r) => [r.token, r]));
  const used = tokensUsedBy(doc);
  const out: DetailRow[] = [];
  const seen = new Set<string>();

  for (const token of used) {
    if (seen.has(token)) continue;
    // Auto-filled means the customer pick answers it. A blank value in the
    // context is NOT auto-filled — that is exactly the blank we want a box for.
    if (String(autoFilled[token] ?? "").trim()) continue;
    seen.add(token);
    const prev = existing.get(token);
    const d = declared[token] || packDetail(token);
    out.push({
      token,
      label: d?.label || prev?.label || plainLabel(token),
      value: prev?.value ?? "",
      ...(d?.help ? { help: d.help } : prev?.help ? { help: prev.help } : {}),
    });
  }

  // Values the author typed for tokens no longer on the page. Kept, last.
  for (const [token, row] of existing) {
    if (seen.has(token)) continue;
    if (!String(row.value ?? "").trim()) continue;
    out.push(row);
  }
  return out;
}

/**
 * DOES THE DETAILS GROUP OPEN SHOWING THE FILLED ROWS? (D-164 follow-up)
 *
 * The group hides filled rows behind "N filled" so nine merge fields and two
 * blanks show the two. That is right for what the AUTHOR typed — and wrong for
 * what the TEMPLATE shipped: the commercial snow & ice agreement arrives with
 * the trigger depth already at "2 inches", and the group opened reading
 * "1 filled" with the box out of sight. A default nobody can see is a default
 * nobody checks, and the trigger depth is the number the cover, the scope, the
 * pricing page and the storm example all quote.
 *
 * So: when the document ARRIVES with something already in it, the group opens
 * with the filled rows showing. The author can still collapse them, and a
 * document that arrives with everything blank opens as it always did.
 *
 * Pure, and read once — when the rows first appear — so typing into the last
 * blank box does not fold the group up underneath the caret.
 */
export function detailsStartOpen(rows: DetailRow[]): boolean {
  return rows.some((r) => String(r?.value ?? "").trim());
}

/**
 * THE LOCATION A PROPERTY PLAN IS ABOUT, defaulted to the DOCUMENT's (D-164).
 *
 * Section 10 of the snow & ice agreement is the crew's own sheet, and it is the
 * only part of the document that writes back to the property record. It shipped
 * with `locationId: ""`, so a document whose customer and location chip were
 * already set still opened section 10 saying "Choose a location…" — the author
 * had to answer, on one widget, a question the document had already answered.
 *
 * When the document has a chosen location and a plan has none, the plan is
 * BOUND to it. A plan the author has pointed somewhere else is left exactly
 * where they pointed it, and the picker in the panel is how they change it.
 *
 * Returns the SAME DOCUMENT by identity when there is nothing to do, so a draft
 * that is merely opened is byte-identical on save.
 */
export function bindPlansToLocation(doc: BuilderDocument, locationId: string): BuilderDocument {
  const id = String(locationId ?? "").trim().toLowerCase();
  if (!id) return doc;
  // `walkWidgets` walks the TREE (D-156), so a plan the author dragged into a
  // box is found too; `patchNode` is the one writer of a node's props.
  const unbound = walkWidgets(doc)
    .filter(({ widget }) => widget.kind === "property_plan"
      && !String((widget.props as any)?.locationId ?? "").trim())
    .map(({ widget }) => widget.id);
  if (!unbound.length) return doc;
  return unbound.reduce((d, widgetId) => patchNode(d, widgetId, { locationId: id }), doc);
}

/**
 * WHERE a blank lives on the page, so a problem can jump to it (N-1).
 *
 * The first customer-facing widget whose props mention the token, addressed by
 * the two markers the canvas already edits through — the section's id and the
 * widget's id. No second addressing scheme.
 */
export function widgetForToken(
  doc: BuilderDocument,
  token: string,
): { sectionId: string; widgetId: string } | null {
  const needle = String(token ?? "").trim();
  if (!needle) return null;
  // The TREE, for the reason `tokensUsedBy` gives: a problem that cannot point
  // at a token inside a box is a "Take me to the first one" that goes nowhere.
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    if (tokensIn(JSON.stringify(widget.props ?? {})).includes(needle)) {
      return { sectionId: section.id, widgetId: widget.id };
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Two more small facts the DOCUMENT itself carries
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The logo the TITLE BAND wears (D-39).
 *
 * §8 requirement 1 says every part of the title page is editable, and the logo
 * was the one part that was not: the inspector offered "Dark band" or "Light
 * with accent rule" and nothing else, so a document could never carry a
 * different mark from the business's default — a co-branded proposal, a
 * division's own logo, a one-off.
 *
 * `""` / absent  → the business's brand logo (unchanged for every existing
 *                  document, which is why absence is the default)
 * `"none"`       → no logo, the business NAME in its place
 * a data: URL    → the picture the author chose
 *
 * The same prop is read by lib/proposalContext.js on the server, so there is
 * one answer for the canvas, the customer's page and the PDF.
 */
export function documentLogo(doc: BuilderDocument): string {
  for (const s of doc.sections) {
    for (const c of s.columns) {
      for (const w of c.widgets) {
        if (w.kind !== "doc_header") continue;
        const v = String((w.props as any)?.logoUrl ?? "").trim();
        if (v) return v;
      }
    }
  }
  return "";
}

/** "$1,200.00" → 1200. Anything unreadable is 0, never NaN on a document. */
export function parseMoney(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default {
  LEGACY_DETAILS_KEY, plainLabel, packDetail, readDetails, readLegacyDetails,
  detailsMerge, writeDetails, tokensUsedBy, blankTokens, blanksRefusal,
  reconcileDetails, widgetForToken,
  detailsStartOpen, bindPlansToLocation, documentLogo, parseMoney,
};
