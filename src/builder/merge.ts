/**
 * builder/merge.ts — merge fields: one catalogue, one filler, one gap rule.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §8 item 7: "merge fields (customer,
 * property, dates, rates) filled from the customer picked once".
 *
 * ── THE ONE RULE THAT MATTERS ─────────────────────────────────────────────
 * A token we cannot fill NEVER reaches the customer as `{{plow_rate}}`. It
 * renders as a blank line, and `unfilledTokens()` is what the Send button
 * reads to say "three details are still blank" BEFORE it goes. The Rolling In
 * It draft that sat in the template table as a printable copy of a Word file
 * was full of [BRACKET] placeholders precisely because nothing counted them.
 *
 * Pure: the context is assembled by the adapter (proposal/ProposalBuilder) from
 * the customer and location it fetched, and handed in. Nothing here fetches.
 */

/** Token → value. Values are already strings a customer can read. */
export type MergeContext = Record<string, string>;

/** One offerable token in the picker. */
export interface MergeTagDef {
  token: string;
  label: string;
  group: "Customer" | "Property" | "Agreement" | "Your business";
}

/**
 * The built-in tags, before the tenant's own custom fields are added.
 *
 * Deliberately short. Every extra token is one more thing that can be blank on
 * a signed document, and the platform already has one merge-tag catalogue
 * (LUMEN `GET /merge-tags`) which is where a business's own fields come from.
 */
export const BUILTIN_TAGS: MergeTagDef[] = [
  { token: "customer.name", label: "Customer name", group: "Customer" },
  { token: "customer.legal_name", label: "Legal entity name", group: "Customer" },
  { token: "customer.contact_name", label: "Contact person", group: "Customer" },
  { token: "customer.email", label: "Customer email", group: "Customer" },
  { token: "customer.phone", label: "Customer phone", group: "Customer" },
  { token: "property.name", label: "Property name", group: "Property" },
  { token: "property.address", label: "Service address", group: "Property" },
  { token: "property.access_notes", label: "Access notes", group: "Property" },
  { token: "property.gate_code", label: "Gate code", group: "Property" },
  { token: "contract.start_date", label: "Service term starts", group: "Agreement" },
  { token: "contract.end_date", label: "Service term ends", group: "Agreement" },
  { token: "contract.valid_until", label: "Valid until", group: "Agreement" },
  { token: "signature_date", label: "Date signed", group: "Agreement" },
  { token: "business.name", label: "Your business name", group: "Your business" },
  { token: "business.email", label: "Your email", group: "Your business" },
  { token: "business.phone", label: "Your phone", group: "Your business" },
];

/**
 * What a merge tag looks like.
 *
 * SPACES ARE PART OF THE VOCABULARY. `convention_merge_tags_user_friendly` is
 * locked: a customer-facing template says `{{first name}}`, never
 * `{{contact.first_name}}`, and the MergeTagPicker inserts exactly that. This
 * pattern used to be `[a-zA-Z0-9_.]+`, which is the same bug LUMEN's own
 * emailSender carried until 2026-09-07 — a space made the tag unmatchable, so
 * `{{business name}}` went out LITERALLY in a sent email. The shared renderer
 * (renderTemplate.js, three byte-identical copies) has taken spaces since; this
 * is the builder agreeing with it.
 */
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_. ]+?)\s*\}\}/g;

/**
 * Look one token up, in the SAME ORDER the shared renderer uses.
 *
 *   1. the key exactly as written        {{first name}} → ctx["first name"]
 *   2. spaces turned to underscores      → ctx["first_name"]
 *   3. lower-cased, both spellings       → ctx["first name"] / ctx["first_name"]
 *
 * Kept deliberately short of renderTemplate's catalog step: the catalogue is a
 * server concern and the builder is handed values, not a schema.
 */
export function lookup(ctx: MergeContext, rawToken: string): string | undefined {
  const key = String(rawToken ?? "").trim();
  if (!key) return undefined;
  const candidates = [key, key.replace(/ +/g, "_"), key.toLowerCase(), key.toLowerCase().replace(/ +/g, "_")];
  for (const k of candidates) {
    const v = ctx[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

/** Every token that appears in a string, in order, de-duplicated. */
export function tokensIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(TOKEN_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** How much of a merge token survives this render. */
export type FillMode = "view" | "edit" | "send";

/**
 * Fill a string from the context.
 *
 * @param mode "view"  — a token with no value becomes a blank line the
 *                       customer can read as "to be completed". This is a
 *                       PREVIEW and a finished document.
 *             "edit"  — it stays visible as {{token}} so the author can SEE
 *                       what is unfilled and fix it. Same function, so the two
 *                       cannot disagree about which tokens exist.
 *             "send"  — EVERY token is left exactly as written, filled or not.
 *
 * ── WHY "send" EXISTS ─────────────────────────────────────────────────────
 * An email body is STORED and then mailed to many people, and the server
 * resolves the tokens per recipient at send time (renderTemplate.js, the one
 * shared renderer). A body stored in "view" mode has the PREVIEW contact's name
 * baked into it — so a newsletter previewed as Dale would greet four hundred
 * subscribers as Dale. Found on the 2026-09-16 walk, in the received mail.
 *
 * A document that is finished when it is written — a proposal — has no send
 * mode and does not want one; it keeps using "view".
 */
export function fill(text: string, ctx: MergeContext, mode: FillMode = "view"): string {
  if (mode === "send") return String(text ?? "");
  return String(text ?? "").replace(TOKEN_RE, (whole, token: string) => {
    const value = lookup(ctx, token);
    if (value != null) return value;
    return mode === "edit" ? whole : "__________";
  });
}

/** Tokens used somewhere in `texts` that the context cannot fill. */
export function unfilledTokens(texts: string[], ctx: MergeContext): string[] {
  const out: string[] = [];
  for (const t of texts) {
    for (const token of tokensIn(t)) {
      if (lookup(ctx, token) == null && !out.includes(token)) out.push(token);
    }
  }
  return out;
}

/** A human label for a token, for the "still blank" warning. */
export function tagLabel(token: string, extra: MergeTagDef[] = []): string {
  return [...BUILTIN_TAGS, ...extra].find((t) => t.token === token)?.label || token;
}
