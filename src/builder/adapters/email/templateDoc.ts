/**
 * builder/adapters/email/templateDoc.ts — a SPARK email TEMPLATE, on the one
 * builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §13.5 lists four surfaces behind one email
 * builder and §13.8 records the one that had not been moved yet:
 *
 *   "The template editor (SparkTemplateEditorModal) still uses the
 *    form-and-TipTap shape. It is the third door in §13.5's table and the only
 *    one not yet moved; blocks_json already accepts the model."
 *
 * ── WHERE THE DESIGN LIVES, AND WHY THERE IS NO MIGRATION ─────────────────
 * `lumen.message_template.blocks_json` IS the design column. It has been in the
 * POST allow-list, the PATCH allow-list and `SELECT *` on GET since the table
 * existed, and since §13.6 the SERVER reads a v2 builder document out of it
 * (`lib/emailBuilder.js` asks one question — is this a v2 document? — and hands
 * it to `lib/builderEmailRender.js`). A new `design_json` column would be a
 * SECOND place a design could live, which is the thing §13.5 exists to prevent.
 * So: no migration. The column is the one that is already there.
 *
 * ── WHAT A SAVE WRITES, AND WHY BOTH ──────────────────────────────────────
 * `body_html` AND `blocks_json`, from ONE render, every time:
 *
 *   · `body_html` is what every existing sender mails. `emailSender.renderTemplate`
 *     reads `t.body_html` and nothing else, and the automations, the welcome
 *     workers and `POST /email-templates/send` all go through it. A template
 *     designed here is mailed by all of them without any of them changing.
 *   · `blocks_json` is what the builder opens next time.
 *
 * Written together, from one `toEmailWire` call, so a row can never hold a body
 * and a model that disagree — §11.1's "three pictures of one document" defect.
 *
 * PURE: no React, no fetch. Everything here is driven by `node --test`.
 */
import type { EmailRowLike, EmailWire } from "./emailDoc";
import { isBuilderDocument, isLegacyBlockTree } from "./emailDoc";
import type { EmailSaveResult } from "./EmailBuilder";

/* ══════════════════════════════════════════════════════════════════════════
   The row, as LUMEN returns it
   ══════════════════════════════════════════════════════════════════════════ */

export type TemplateCategory = "transactional" | "marketing" | "system";

/** `lumen.message_template` where `channel = 'email'`. */
export interface EmailTemplateRow {
  id?: number;
  template_key?: string | null;
  name?: string | null;
  description?: string | null;
  category?: TemplateCategory | null;
  subject?: string | null;
  preheader?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  /** THE design. A v2 builder document, or the old block tree, or null. */
  blocks_json?: unknown;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  is_active?: boolean;
  is_system?: boolean;
}

/**
 * The template-only settings — the ones an email has because it is a TEMPLATE,
 * not because it is an email. The subject, the preview line and the name live
 * in the builder's own header, where the newsletter and the campaign put them.
 */
export interface TemplateSettings {
  category: TemplateCategory;
  description: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  is_active: boolean;
}

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  category: "marketing",
  description: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  is_active: true,
};

export function settingsFromRow(row: EmailTemplateRow | null | undefined): TemplateSettings {
  if (!row) return { ...DEFAULT_TEMPLATE_SETTINGS };
  return {
    category: (row.category as TemplateCategory) || "marketing",
    description: row.description || "",
    from_name: row.from_name || "",
    from_email: row.from_email || "",
    reply_to: row.reply_to || "",
    is_active: row.is_active !== false,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Opening one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The row, in the shape `openEmailDocument` reads.
 *
 * It is a rename and nothing more, which is the point: the template door does
 * NOT get a legacy reader of its own. `openEmailDocument` already answers the
 * four cases in the honest order — a v2 document is read as itself, an old
 * block tree is migrated, a body that is only HTML is INTERPRETED and says so,
 * and an empty row opens on the starting screen. A second reader here would be
 * a second answer to "what was this email before", and the two would drift.
 */
export function templateRowForBuilder(row: EmailTemplateRow | null | undefined): EmailRowLike | null {
  if (!row) return null;
  return {
    // `message_template` has no `document_json` column — the design has always
    // lived in `blocks_json`, which openEmailDocument reads for BOTH shapes.
    blocks_json: row.blocks_json ?? null,
    content_html: row.body_html ?? null,
    subject: row.subject ?? null,
    title: row.name ?? null,
  };
}

/**
 * Was this row DESIGNED, or is it a body somebody typed?
 *
 * The library says which, per row, the way the Newsletter Studio's list does.
 * A legacy block tree counts: it opens in the builder and it was built in a
 * builder, just an older one.
 */
export function hasDesign(row: { blocks_json?: unknown } | null | undefined): boolean {
  const v = row?.blocks_json;
  if (v == null || v === "") return false;
  return isBuilderDocument(v) || isLegacyBlockTree(v);
}

/* ══════════════════════════════════════════════════════════════════════════
   Saving one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A stable handle for a template, from its name.
 *
 * The backend takes `template_key: null` and falls back to the row id, but a
 * slug is what transactional code references (`template_key: "welcome"`), and
 * it survives a rename because it is only ever derived ONCE, on create.
 */
export function slugifyTemplateKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/** The fields a design writes, shared by create and update. */
function designFields(wire: EmailWire, meta: EmailSaveResult) {
  return {
    name: meta.title,
    subject: meta.subject,
    preheader: meta.preheader || null,
    // Rendered from the design, so every existing sender keeps working.
    body_html: wire.content_html,
    body_text: wire.content_text,
    // THE design, in the column that has always held it.
    blocks_json: wire.document_json,
  };
}

/**
 * The body for `POST /api/v1/email-templates`.
 *
 * `is_active` is deliberately ABSENT: it is not in the route's create
 * allow-list and the column defaults to 1. Sending it would be sending a field
 * that is silently dropped, which reads as "I set this" and is not.
 */
export function templateCreateBody(
  wire: EmailWire,
  meta: EmailSaveResult,
  settings: TemplateSettings,
): Record<string, unknown> {
  const key = slugifyTemplateKey(meta.title);
  return {
    ...designFields(wire, meta),
    template_key: key || null,
    category: settings.category,
    description: settings.description || null,
    from_name: settings.from_name || null,
    from_email: settings.from_email || null,
    reply_to: settings.reply_to || null,
  };
}

/**
 * The body for `PATCH /api/v1/email-templates/:id`.
 *
 * `template_key` is NOT sent. The key is the handle other code holds; a rename
 * in the builder must not silently repoint a transactional send.
 */
export function templatePatchBody(
  wire: EmailWire,
  meta: EmailSaveResult,
  settings: TemplateSettings,
): Record<string, unknown> {
  return {
    ...designFields(wire, meta),
    category: settings.category,
    description: settings.description || null,
    from_name: settings.from_name || null,
    from_email: settings.from_email || null,
    reply_to: settings.reply_to || null,
    is_active: settings.is_active,
  };
}

/**
 * What a template needs before it can be saved, said in words.
 *
 * The route answers `400 name, subject, and body_html … are required`, which
 * is true and tells an author nothing about which box to go back to.
 */
export function templateBlockers(meta: EmailSaveResult): string[] {
  const out: string[] = [];
  if (!meta.title.trim()) out.push("a name at the top");
  if (!meta.subject.trim()) out.push("a subject line");
  return out;
}
