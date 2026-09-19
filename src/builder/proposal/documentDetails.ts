/**
 * builder/proposal/documentDetails.ts — THE ONE BLANK RULE, AND THE ONE STORE.
 *
 * ── WHAT WAS HERE, AND WHY IT IS GONE (scope 11.13, 2026-09-19) ───────────
 * This file used to own the **Details group**: a reconciled list of rows, a
 * plain-word label per row, a "still to fill in" counter and a side panel of
 * boxes. Brandon, on the fifth telling:
 *
 *   "You have all this random details on the side. I never asked for any of
 *    that. The fields should be dynamic. Load a customer and it auto loads
 *    customer information."
 *
 * The Details group was invented on 2026-09-16 to give the blanks one home. It
 * was never in scope, and 11.13 deletes it rather than hiding it. Gone with
 * it: `DetailRow`, `readDetails`, `writeDetails`, `reconcileDetails`,
 * `detailsStartOpen`, `detailsMerge`, `readLegacyDetails`, `LEGACY_DETAILS_KEY`
 * and `PACK_LABELS` as a UI list — and the group component in
 * `ProposalBuilder.tsx`, and the counter beside it.
 *
 * ── WHAT REPLACES IT ──────────────────────────────────────────────────────
 *   · a fact that lives in a RECORD  → `proposal/recordWidgets.ts`. The
 *     Customer, Service Location and Business Info widgets fill themselves the
 *     moment the customer is picked, and the author edits them on the page.
 *   · a fact that lives in NO record → a merge token, edited where it appears
 *     on the page. The chip the renderer already draws in edit mode is the
 *     control; clicking it is how a value is typed. No side list.
 *
 * ── WHAT STAYS, AND WHY EACH ONE ──────────────────────────────────────────
 *   · `settings.merge` — still the ONE store of typed merge values. 11.13.2
 *     says so in as many words, so stored documents keep working. What changed
 *     is only WHERE it is written from: the page, not a panel.
 *   · `blankTokens` — still the ONE blank rule. Send walks the page and
 *     refuses over any merge tag that is on a customer-facing widget and
 *     resolves to nothing, at any depth (the D-164 rule, kept whole).
 *   · `widgetForToken` — where the blank lives, so the refusal can JUMP to it
 *     on the page instead of to a box that no longer exists.
 *   · `plainLabel` — plain words for a token in the refusal sentence and on
 *     the on-page editor. Never the raw token, on any screen.
 *   · `bindPlansToLocation`, `documentLogo`, `parseMoney` — three small facts
 *     the document itself carries, unrelated to the group.
 *
 * Pure. No React, no fetch — so all of it is `node --test`.
 */
import { walkWidgets, type BuilderDocument, type Section } from "../model";
import { patchNode } from "../treeOps";
import { tokensIn, tagLabel, lookup, BUILTIN_TAGS, type MergeContext } from "../merge";

/* ══════════════════════════════════════════════════════════════════════════
   Plain words for a token
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Words for the tokens the SHIPPED clause packs and templates write.
 *
 * `{{snow_trigger}}` and `{{severe_event_threshold}}` are not the platform's
 * merge tags — they come out of `oliver-api lib/clausePacks.js` — and a
 * refusal that named them raw was two of the four names a first-time user was
 * shown and told to go and find. These are the words a snow contractor uses.
 *
 * It is a LABEL TABLE, not a UI list: 11.13 deletes the side panel that drew a
 * row per entry, and nothing iterates this any more. It is read one token at a
 * time, by `plainLabel`, for the refusal sentence and the on-page editor's
 * caption.
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
 * In order: a label the template declared, then the shipped clause packs' own
 * vocabulary, then the platform's merge-tag catalogue, then a prettifier that
 * turns `gate_access_window` into "Gate access window". There is no branch
 * that returns the raw token to a screen.
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

/** The one line that says what goes in the box, where a token has one. */
export function tokenHelp(token: string): string {
  return PACK_LABELS[String(token ?? "").trim()]?.help || "";
}

/* ══════════════════════════════════════════════════════════════════════════
   `settings.merge` — the ONE store, written FROM THE PAGE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every typed merge value the document is carrying.
 *
 * Tolerant, as it always was: a document written before 11.13 carries exactly
 * the same map in exactly the same place, because the store never moved. Only
 * the control that writes it did.
 */
export function mergeValues(doc: BuilderDocument): Record<string, string> {
  const raw = (doc as any)?.settings?.merge;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const token = String(k ?? "").trim();
    if (!token || v == null || typeof v === "object") continue;
    out[token] = String(v);
  }
  return out;
}

/**
 * The document with ONE merge value set, from the page.
 *
 * A BLANK value REMOVES the key rather than storing `""`: the blank rule counts
 * an absent token as unfilled, and a stored empty string would be a second way
 * of saying the same thing — two answers to "is this filled in", which is the
 * shape of every defect this file has ever carried.
 *
 * Returns THE SAME DOCUMENT by identity when nothing changes, so opening a
 * draft and clicking about leaves it byte-identical on save.
 */
export function setMergeValue(doc: BuilderDocument, token: string, value: string): BuilderDocument {
  const key = String(token ?? "").trim();
  if (!key) return doc;
  const current = mergeValues(doc);
  const next = String(value ?? "");
  const wanted = next.trim() ? next : undefined;
  if ((current[key] ?? undefined) === wanted) return doc;

  const merge: Record<string, string> = { ...current };
  if (wanted == null) delete merge[key]; else merge[key] = wanted;

  const settings: BuilderDocument["settings"] = { ...doc.settings };
  delete (settings as any).merge;
  if (Object.keys(merge).length) (settings as any).merge = merge;
  return { ...doc, settings };
}

/* ══════════════════════════════════════════════════════════════════════════
   What the document is ASKING for
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every token used on a customer-facing page, in reading order.
 *
 * IT WALKS THE TREE (D-164 follow-up): a merge tag inside a BOX is a tag on
 * the page. `walkWidgets` is the engine's own walk (§11.12) and finds a widget
 * at any depth; a flat pass over the top of each column is what let a snow
 * agreement go out with both service-term dates empty.
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
 * THE ONE BLANK RULE — what Send refuses over.
 *
 * **Any merge tag that is ON the document and resolves to nothing is a blank.**
 * One rule, one list, whether the tag is a clause pack's own (`snow_trigger`)
 * or one of the platform's built-ins (`contract.start_date`).
 *
 * A tag that is NOT on the document is never asked for: the list starts from
 * what the page uses, so taking a paragraph off the page takes its blank with
 * it — which is what the refusal's own words offer as the second way out.
 */
export function blankTokens(doc: BuilderDocument, merge: MergeContext): string[] {
  return tokensUsedBy(doc).filter((token) => lookup(merge, token) == null);
}

/**
 * The words Send refuses in — ONE sentence, and both buttons say it.
 *
 * 11.13.2: the refusal "jumps to the first blank ON THE PAGE". So the sentence
 * says where the value is typed — on the page, where it appears — and no
 * longer points at Details boxes that do not exist.
 *
 * Four names at most, so a document with eleven blanks refuses in a sentence a
 * person reads rather than a list they scroll. PLAIN WORDS every time —
 * "Service term starts", never `contract.start_date`.
 */
export function blanksRefusal(blanks: string[], labels: Record<string, string> = {}): string {
  const list = blanks.slice(0, 4).map((t) => plainLabel(t, labels)).join(", ");
  return `${blanks.length} detail${blanks.length === 1 ? " is" : "s are"} still blank (${list}).`
    + " Click the highlighted words on the page and type what goes there, or take them off the page, before sending.";
}

/**
 * WHERE a blank lives on the page, so a problem can jump to it.
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
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    if (tokensIn(JSON.stringify(widget.props ?? {})).includes(needle)) {
      return { sectionId: section.id, widgetId: widget.id };
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Three small facts the DOCUMENT itself carries
   ══════════════════════════════════════════════════════════════════════════ */

/** Every widget on the page that is ABOUT A SITE. One list, one rule. */
const SITE_KINDS = new Set(["property_plan", "service_location"]);

/**
 * A SITE WIDGET POINTS AT A SITE THIS CUSTOMER HAS (D-164, and 2026-09-19).
 *
 * Two cases, one rule, because they are the same fact:
 *
 *   · a widget with NO location takes the document's own (D-164). A plan
 *     shipped with `locationId: ""` asked the author, on one widget, a
 *     question the top bar had already answered.
 *   · a widget pointing at a site that is NOT one of this customer's is
 *     RE-POINTED at the document's own. FOUND BY DRIVING IT: a Service
 *     Location bound to Harborview's yard, on a document whose customer was
 *     then changed to Hope Ministries, printed **Harborview's address on Hope
 *     Ministries' agreement**. The canvas could not even show it — it only
 *     holds the picked customer's locations — while the server loads every id
 *     the document names and found it. One customer's address on another
 *     customer's paper is the worst thing this widget can do, and "the two
 *     surfaces disagreed" is how it stayed invisible.
 *
 * `known` is the ids this customer really has. Pass an EMPTY set and nothing
 * is re-pointed: "we have not loaded the locations yet" must never read as
 * "this customer has none", which would blank every bound block on open.
 *
 * A widget the author pointed at another of THIS customer's sites is left
 * exactly where they pointed it. Returns the SAME DOCUMENT by identity when
 * there is nothing to do, so a draft that is merely opened is byte-identical
 * on save.
 */
export function bindPlansToLocation(
  doc: BuilderDocument,
  locationId: string,
  known?: Iterable<string>,
): BuilderDocument {
  const id = String(locationId ?? "").trim().toLowerCase();
  if (!id) return doc;
  const valid = new Set([...(known ?? [])].map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  const move = walkWidgets(doc)
    .filter(({ widget }) => {
      if (!SITE_KINDS.has(widget.kind)) return false;
      const on = String((widget.props as any)?.locationId ?? "").trim().toLowerCase();
      if (!on) return true;
      // PRESENCE, not absence: only re-point when we actually know the list.
      return valid.size > 0 && !valid.has(on);
    })
    .map(({ widget }) => widget.id);
  if (!move.length) return doc;
  return move.reduce((d, widgetId) => patchNode(d, widgetId, { locationId: id }), doc);
}

/**
 * The logo the TITLE BAND wears (D-39).
 *
 * `""` / absent  → the business's brand logo
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

/** Re-exported so nothing else has to know `Section` is a model type. */
export type { Section };

export default {
  plainLabel, packDetail, tokenHelp, mergeValues, setMergeValue,
  tokensUsedBy, blankTokens, blanksRefusal, widgetForToken,
  bindPlansToLocation, documentLogo, parseMoney,
};
