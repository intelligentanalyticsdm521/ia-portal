/**
 * b2cSearch — the pure half of the household (B2C) search form. Growth B19.
 *
 * Everything here is a decision about what a client is TOLD or ALLOWED, which
 * is the half worth pinning with tests; the component is layout.
 *
 * THE ONE RULE THIS FORM EXISTS TO KEEP TRUE. A household record is DIRECT MAIL
 * ONLY. The system cannot store an email address or a phone number for one —
 * not "will not", cannot: LUMEN migration 164 puts CHECK constraints on the
 * columns. So the form says it in the client's words, before they fill anything
 * in, and again on the result. A client who is surprised by that after paying
 * per record has been badly served.
 *
 * THE CHOOSER IS SERVER-DRIVEN. Whether B2C is available, and the sentence
 * shown when it is not, come from `GET /api/v1/leadgen/models`. Hardcoding
 * "Coming in October" in a component is how a page still says October in
 * December — and, worse, how a locked card and a switched-on backend disagree.
 */

export type SearchModelKey = "b2b" | "b2c_mail" | "blended";

export interface SearchModelRow {
  key: SearchModelKey;
  label: string;
  available: boolean;
  /** The small pill: "Coming in October", "Sample data", or nothing. */
  note: string | null;
  /** The sentence under the label. Always present, never a code. */
  message: string;
  /** True when the households returned are synthetic (dev only). */
  mocked?: boolean;
}

export interface TriggerRow {
  key: string;
  label: string;
  help: string;
  vertical: string;
  input: "none" | "years" | "days" | "range";
  inputLabel?: string;
  inputDefault?: number;
  inputUnit?: string;
  available: boolean;
}

export interface TriggerSelection {
  key: string;
  value: number | true;
}

/** What the chooser shows before the server has answered. B2C locked, because
 *  the safe default for a switch is off — a card that flashes unlocked and then
 *  locks is a card that got somebody's hopes up. */
export const FALLBACK_MODELS: SearchModelRow[] = [
  { key: "b2b", label: "B2B (businesses)", available: true, note: null, message: "Businesses with a verified work email. Reach them by email, phone or post." },
  { key: "b2c_mail", label: "B2C direct mail only", available: false, note: "Coming in October", message: "Households from a licensed list. We find households, you reach them by mail — no email or text, ever; the system cannot store them." },
  { key: "blended", label: "Blended", available: false, note: "Coming", message: "Businesses and households in one run." },
];

/** The sentence at the top of the household form. The rule, in their words. */
export const B2C_RULE =
  "Households are direct mail only. We never store an email address or a phone number for them, and no campaign, text or automatic reply can reach them.";

/** What a client is told about sample data, when the vendor is not connected. */
export const B2C_MOCK_NOTICE =
  "This is sample data for testing. No real household information is being used, and nothing is being bought.";

export function modelByKey(models: SearchModelRow[], key: SearchModelKey): SearchModelRow | null {
  return models.find((m) => m.key === key) ?? null;
}

export function isModelAvailable(models: SearchModelRow[], key: SearchModelKey): boolean {
  return modelByKey(models, key)?.available === true;
}

/**
 * The model the page should be on, given what the server allows.
 *
 * A model that stops being available while somebody is on it falls back to
 * B2B rather than leaving them filling in a form that cannot be submitted.
 */
export function resolveModel(models: SearchModelRow[], wanted: SearchModelKey): SearchModelKey {
  return isModelAvailable(models, wanted) ? wanted : "b2b";
}

/** A trigger's default selection when the client ticks it. */
export function defaultSelection(t: TriggerRow): TriggerSelection {
  return t.input === "none" ? { key: t.key, value: true } : { key: t.key, value: t.inputDefault ?? 1 };
}

/**
 * The same validation the server does, so the client is told before they
 * submit — and NOT instead of the server doing it. The server refuses an
 * unrecognised trigger outright; a form that quietly drops half of what was
 * asked for and then charges per record is the worst kind of wrong.
 */
export function validateB2cForm(input: {
  state: string;
  cities: string[];
  zips: string[];
  selections: TriggerSelection[];
  target: number;
}): string[] {
  const errors: string[] = [];
  if (!input.state) errors.push("Pick a state.");
  if (!input.cities.length && !input.zips.length) errors.push("Add at least one city or ZIP code.");
  if (!input.selections.length) errors.push("Pick at least one thing about the households you want.");
  for (const s of input.selections) {
    if (s.value !== true && (!Number.isFinite(Number(s.value)) || Number(s.value) <= 0)) {
      errors.push("Every filter with a number needs a number greater than zero.");
      break;
    }
  }
  if (!Number.isFinite(input.target) || input.target < 1) errors.push("Say how many households you want.");
  if (input.target > 500) errors.push("500 households is the most one search can return.");
  return errors;
}

/** "Moved in within 90 days · Home at least 15 years old" — what was asked. */
export function describeSelections(triggers: TriggerRow[], selections: TriggerSelection[]): string {
  const parts: string[] = [];
  for (const s of selections) {
    const t = triggers.find((x) => x.key === s.key);
    if (!t) continue;
    parts.push(t.input === "none" ? t.label : `${t.inputLabel ?? t.label} ${s.value} ${t.inputUnit ?? ""}`.trim());
  }
  return parts.join(" · ");
}

/** The result sentence. Plural-aware, because "1 households" reads like nobody
 *  looked at this screen. */
export function resultSentence(written: number, skipped: number): string {
  const found = written === 1 ? "1 household" : `${written} households`;
  if (!skipped) return `${found} added to your Lead Inbox.`;
  const dup = skipped === 1 ? "1 was" : `${skipped} were`;
  return `${found} added to your Lead Inbox. ${dup} already on your list and ${skipped === 1 ? "was" : "were"} left out.`;
}
