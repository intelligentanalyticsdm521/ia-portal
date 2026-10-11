// lib/websiteInquiries.ts — the website's own inquiries, and the one switch
// that sends a form's inquiries on to the SPARK inbox.
//
// FEATURES AUDIT row 41 (2026-10-11). An ARION-only business had no screen
// anywhere that showed the inquiries its website took: arion-api stored them
// (arion.site_form_submission, GET /arion/sites/:siteId/forms) and the Portal
// client getForms had no caller. Website → Overview now lists them.
//
// THE CAPTURE SWITCH. Since iadm-webhooks ff70c79 (11 Oct 2026) an inquiry
// reaches SPARK only when BOTH hold:
//   1. SPARK is in the business's subscription (platform-api decided owned), and
//   2. an arion.site_form_config row for (site, form_id) has is_active = 1.
// That row's is_active IS "Send this form to my SPARK inbox". It is OFF until
// the business turns it on (no row = off). The switch writes is_active through
// POST /arion/sites/:siteId/forms/config, which is a MERGE that overwrites
// every column, so the other columns are read first and sent back as they
// were (configWithSwitch). A send to another product is a cross-product WRITE:
// undecided never lets it through, so the switch is shown only on a DECIDED
// "SPARK is owned" (captureSwitchState).
//
// Pure on purpose: no React, no fetch, so node --test reads every rule
// (test/website-inquiries.test.mjs).

import type { EntitlementPayload } from './entitlements';

export const SWITCH_LABEL = 'Send this form to my SPARK inbox';
export const NOT_IN_PLAN_SENTENCE = 'Inquiries stay here. Add SPARK to send them to a lead inbox.';
export const UNKNOWN_PLAN_SENTENCE =
  "We couldn't check whether SPARK is in your plan just now, so the SPARK inbox switches are hidden. Every inquiry still lands here.";
export const SECTION_TITLE = 'Website inquiries';
export const FORMS_TITLE = 'Forms';

/** One row of GET /arion/sites/:siteId/forms (arion.site_form_submission). */
export interface SubmissionRow {
  submission_id: string;
  site_id?: string;
  form_id?: string | null;
  form_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  raw_fields?: string | Record<string, unknown> | null;
  submitted_at?: string | null;
  created_at?: string | null;
}

/** One row of GET /arion/sites/:siteId/forms/config (arion.site_form_config). */
export interface FormConfigRow {
  config_id?: string;
  form_id: string;
  form_name?: string | null;
  form_type?: string | null;
  field_map?: string | Record<string, unknown> | null;
  is_active?: boolean | number | null;
  apply_tags?: string | string[] | null;
  add_to_list_id?: number | null;
  marketing_optin?: boolean | number | null;
}

export interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  form: string;
  receivedAt: string | null;
  message: string;
}

function parseJson<T>(v: unknown): T | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return v as T;
  try { return JSON.parse(v) as T; } catch { return null; }
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/** A field from raw_fields, by any of the usual names a WordPress form uses. */
function rawField(raw: Record<string, unknown> | null, names: string[]): string {
  if (!raw) return '';
  for (const n of names) {
    const hit = Object.keys(raw).find((k) => k.toLowerCase() === n);
    if (hit && str(raw[hit])) return str(raw[hit]);
  }
  return '';
}

/** What a form is called on screen: its name, else its type, else its id. */
export function formLabel(formName: unknown, formType: unknown, formId: unknown): string {
  const name = str(formName);
  if (name) return name;
  const type = str(formType);
  const id = str(formId);
  if (type && id) return `${type.charAt(0).toUpperCase()}${type.slice(1)} form (${id})`;
  if (id) return `Form ${id}`;
  if (type) return `${type.charAt(0).toUpperCase()}${type.slice(1)} form`;
  return 'Website form';
}

function timeOf(r: SubmissionRow): number {
  const t = Date.parse(String(r.submitted_at || r.created_at || ''));
  return Number.isNaN(t) ? 0 : t;
}

/** The GET /forms envelope ({ data, meta }) or a bare array, as rows. */
export function submissionsOf(resp: unknown): SubmissionRow[] {
  const data = Array.isArray(resp) ? resp : (resp as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as SubmissionRow[]).filter((r) => r && r.submission_id) : [];
}

export function configsOf(resp: unknown): FormConfigRow[] {
  const data = Array.isArray(resp) ? resp : (resp as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as FormConfigRow[]).filter((r) => r && str(r.form_id)) : [];
}

/** Rows for the Website inquiries list, newest first. */
export function inquiryRows(submissions: SubmissionRow[], configs: FormConfigRow[] = []): InquiryRow[] {
  const names = new Map(configs.map((c) => [str(c.form_id), c.form_name]));
  return [...submissions]
    .sort((a, b) => timeOf(b) - timeOf(a))
    .map((r) => {
      const raw = parseJson<Record<string, unknown>>(r.raw_fields);
      const name = [str(r.first_name), str(r.last_name)].filter(Boolean).join(' ')
        || rawField(raw, ['name', 'your-name', 'full_name', 'fullname']);
      return {
        id: String(r.submission_id),
        name,
        email: str(r.email) || rawField(raw, ['email', 'your-email', 'email_address']),
        phone: str(r.phone) || rawField(raw, ['phone', 'your-phone', 'tel', 'telephone']),
        form: formLabel(names.get(str(r.form_id)), r.form_type, r.form_id),
        receivedAt: r.submitted_at || r.created_at || null,
        message: str(r.message) || rawField(raw, ['message', 'your-message', 'comments']),
      };
    });
}

export function isActiveFlag(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

export interface SeenForm {
  formId: string;
  label: string;
  formType: string | null;
  /** How many of the loaded inquiries came from this form. */
  count: number;
  /** The saved config row, or null (never set up = off). */
  config: FormConfigRow | null;
  /** Is "Send this form to my SPARK inbox" on? Off when there is no row. */
  sendsToSpark: boolean;
}

/**
 * Every form the site has seen: the distinct form_ids among the inquiries,
 * plus any form that has a config row but no inquiry yet. A form whose
 * submissions carry no form_id cannot be matched by the inbox rule (it keys
 * on form_id), so it has no switch; unidentifiedCount says how many.
 */
export function formsSeen(submissions: SubmissionRow[], configs: FormConfigRow[]): SeenForm[] {
  const byId = new Map<string, SeenForm>();
  for (const c of configs) {
    const id = str(c.form_id);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      formId: id, label: formLabel(c.form_name, c.form_type, id), formType: c.form_type ?? null,
      count: 0, config: c, sendsToSpark: isActiveFlag(c.is_active),
    });
  }
  for (const s of submissions) {
    const id = str(s.form_id);
    if (!id) continue;
    const seen = byId.get(id);
    if (seen) { seen.count += 1; if (!seen.formType && s.form_type) seen.formType = s.form_type; continue; }
    byId.set(id, {
      formId: id, label: formLabel(null, s.form_type, id), formType: s.form_type ?? null,
      count: 1, config: null, sendsToSpark: false,
    });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function unidentifiedCount(submissions: SubmissionRow[]): number {
  return submissions.filter((s) => !str(s.form_id)).length;
}

/**
 * Is the switch offered?
 *   'offer'        platform-api DECIDED SPARK is owned  -> the switches
 *   'not_in_plan'  platform-api DECIDED SPARK is not    -> the one sentence + Add SPARK
 *   'unknown'      no answer, or an undecided one       -> no switches (a send to
 *                  another product never goes through on "we don't know")
 */
export type CaptureSwitchState = 'offer' | 'not_in_plan' | 'unknown';

export function captureSwitchState(payload: EntitlementPayload | null | undefined): CaptureSwitchState {
  if (!payload || payload.decided === false) return 'unknown';
  const node = payload.products?.spark;
  if (!node || node.decided !== true) return 'unknown';
  if (node.owned === true) return 'offer';
  if (node.owned === false) return 'not_in_plan';
  return 'unknown';
}

/** The POST /forms/config body for this form with the switch set to `on`. */
export interface FormConfigBody {
  form_id: string;
  form_name: string | null;
  form_type: string;
  field_map: Record<string, unknown> | null;
  is_active: boolean;
  apply_tags: string[] | null;
  add_to_list_id: number | null;
  marketing_optin: boolean;
}

/**
 * POST /forms/config MERGEs and overwrites EVERY column, and it stringifies
 * field_map and apply_tags itself. So the saved row's values go back exactly
 * as they are (parsed out of their stored JSON, so they are not stringified
 * twice), and only is_active changes. A form with no row yet gets the
 * defaults the route would give it, with is_active sent explicitly (the route
 * reads a missing is_active as ON).
 */
export function configWithSwitch(form: Pick<SeenForm, 'formId' | 'formType' | 'config'>, on: boolean): FormConfigBody {
  const c = form.config;
  const tags = parseJson<unknown>(c?.apply_tags ?? null);
  const listId = c?.add_to_list_id;
  return {
    form_id: form.formId,
    form_name: c?.form_name ?? null,
    form_type: str(c?.form_type) || str(form.formType) || 'contact',
    field_map: parseJson<Record<string, unknown>>(c?.field_map ?? null),
    is_active: on,
    apply_tags: Array.isArray(tags) ? tags.map(String) : null,
    add_to_list_id: listId != null && Number.isFinite(Number(listId)) ? Number(listId) : null,
    marketing_optin: isActiveFlag(c?.marketing_optin),
  };
}

/** "Oct 11, 2026, 9:42 AM" in the viewer's own zone; '' when unknown. */
export function receivedLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
