// onsiteJob — the office's three views of the on-site JOB flow (on-site flow
// v1, Phase C, 1 Oct 2026). Pure, so test/onsite-job.test.mjs runs the real
// thing. Contract: overnight-report/ONSITE_FLOW_SCOPE_PLAN_2026-10-01.md,
// "Phase C".
//
//   1. Change orders on the job modal (Line items tab): GET /jobs/:id/
//      change-orders lists them (reason, lines added / removed, the change in
//      price, status, who signed and when); "New change order" posts the same
//      shape the crew app sends to POST /jobs/:id/change-orders.
//   2. "Ask the customer to sign when a job is finished" on the portal
//      settings window's Workflow tab: oliver.tenant_settings.
//      require_completion_signature, read from GET /workflow-settings and sent
//      on the same save as the other workflow rules. ON by default.
//   3. Four switches on a worker's card: can_quote, can_send_quotes,
//      can_quote_custom, can_charge, through PATCH /workers/:id.
//
// The API's field names are canonical (decided 1 Oct): the Portal reads what
// the API sends and pins the names in the test. Readers are tolerant (snake
// or camel case, the { data } envelope or not) and say "unknown" rather than
// guessing a value the server did not send.

import { apiErrorMessage } from "./apiErrorMessage";

// ── shared ────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "$1,234.50". */
export function money(n: number): string {
  const v = cents(Math.abs(n));
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Money on the office job window, always with cents: "$643.50", "−$12.00".
 * The job panel printed "$643.5" (pane walk 1 Oct, 6.1): it formatted with no
 * minimum decimals. The figure itself is the server's — this only prints it.
 */
export function jobMoney(n: number | null | undefined): string {
  const v = cents(Number(n ?? 0));
  return v < 0 ? `−${money(v)}` : money(v);
}

/** The change in price, signed: "+$120.00", "−$40.00", "$0.00". */
export function deltaLabel(n: number): string {
  const v = cents(n);
  if (v > 0) return `+${money(v)}`;
  if (v < 0) return `−${money(v)}`;
  return money(0);
}

// ── 1. change orders ──────────────────────────────────────────────────────

/** The office route — the same body the crew app posts (contract Phase C, G5). */
export const changeOrdersPath = (jobId: string) => `/jobs/${encodeURIComponent(jobId)}/change-orders`;

export type ChangeOrderStatus = "draft" | "presented" | "accepted" | "declined" | "void";

export interface ChangeOrderLine {
  kind: "add" | "remove";
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface ChangeOrderRow {
  id: string;
  status: string;
  reason: string;
  lines: ChangeOrderLine[];
  /** The change in price (the change order's total is a delta; may be negative). */
  delta: number | null;
  signedBy: string | null;
  signedAt: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  customerLink: string | null;
  /** What the customer typed when they declined (oliver.change_order.decline_reason, migration 228), or null. */
  declineReason: string | null;
}

function readLine(raw: unknown): ChangeOrderLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = str(o.kind).toLowerCase() === "remove" ? "remove" : "add";
  const quantity = num(pick(o, "quantity", "qty"));
  const unitPrice = num(pick(o, "unit_price", "unitPrice"));
  let lineTotal = num(pick(o, "line_total", "lineTotal"));
  if (lineTotal === null && quantity !== null && unitPrice !== null) lineTotal = cents(quantity * unitPrice);
  return { kind, description: str(o.description) || "(no description)", quantity, unitPrice, lineTotal };
}

/** One change order as GET /jobs/:id/change-orders sends it (snake or camel case). */
export function readChangeOrder(raw: unknown): ChangeOrderRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(pick(o, "change_order_id", "changeOrderId", "id"));
  if (!id) return null;
  const rawLines = pick(o, "lines", "line_items", "lineItems");
  const lines = Array.isArray(rawLines) ? rawLines.map(readLine).filter((l): l is ChangeOrderLine => !!l) : [];
  const sig = pick(o, "signature") as Record<string, unknown> | undefined;
  const signedBy = str(sig && typeof sig === "object" ? pick(sig, "signer_name", "signerName") : pick(o, "signer_name", "signerName", "signed_by")) || null;
  const signedAt = str(sig && typeof sig === "object" ? pick(sig, "signed_at", "signedAt") : pick(o, "signed_at", "signedAt")) || null;
  let delta = num(pick(o, "total", "delta", "total_delta"));
  if (delta === null && lines.length && lines.every((l) => l.lineTotal !== null)) {
    delta = cents(lines.reduce((s, l) => s + (l.kind === "remove" ? -Math.abs(l.lineTotal as number) : (l.lineTotal as number)), 0));
  }
  return {
    id,
    status: str(o.status).toLowerCase() || "draft",
    reason: str(o.reason),
    lines,
    delta,
    signedBy,
    signedAt: signedAt || (signedBy ? str(pick(o, "accepted_at", "acceptedAt")) || null : null),
    createdAt: str(pick(o, "created_at", "createdAt")) || null,
    decidedAt: str(pick(o, "accepted_at", "acceptedAt", "declined_at", "declinedAt")) || null,
    customerLink: str(pick(o, "customer_link", "customerLink")) || null,
    declineReason: str(pick(o, "decline_reason", "declineReason")) || null,
  };
}

/**
 * The declined row's line: "Declined — Not this season, maybe next spring", or
 * "Declined" when the customer gave no reason. Null for any other status.
 * (Pane walk 1 Oct, B4: the reason the customer typed was lost and the row
 * said only "Declined".)
 */
export function changeOrderDeclinedLine(row: Pick<ChangeOrderRow, "status" | "declineReason">): string | null {
  if (row.status !== "declined") return null;
  return row.declineReason ? `Declined — ${row.declineReason}` : "Declined";
}

// ── what the job window offers, by where the job is ───────────────────────

/** The job statuses a change order may be written on — oliver-api lib/changeOrder.js CHANGEABLE_JOB_STATUSES. */
export const CHANGEABLE_JOB_STATUSES = ["scheduled", "dispatched", "assigned", "in_progress"] as const;

type JobForActions = {
  status?: string | null;
  invoices?: Array<{ status?: string | null }> | null;
};

/** An invoice that still counts: anything but void or cancelled (the API's jobHasLiveInvoice). */
export function jobHasLiveInvoice(job: JobForActions): boolean {
  return (job.invoices ?? []).some((i) => !["void", "cancelled"].includes(String(i?.status ?? "").toLowerCase()));
}

/**
 * "New change order" is offered only where the API would take one: a job that
 * is scheduled, dispatched, assigned or in progress and has no live invoice
 * (lib/changeOrder.js changeableJobRefusal). Pane walk 1 Oct, M8: it was
 * offered on a completed, invoiced job and the API refused it.
 */
export function jobTakesChangeOrders(job: JobForActions): boolean {
  return (CHANGEABLE_JOB_STATUSES as readonly string[]).includes(String(job.status ?? "")) && !jobHasLiveInvoice(job);
}

/**
 * "+ Create invoice" is not offered once the job is finished AND invoiced —
 * completed with a live invoice, or already invoiced / paid. (M8.)
 */
export function jobOffersCreateInvoice(job: JobForActions): boolean {
  const status = String(job.status ?? "");
  if (status === "invoiced" || status === "paid") return false;
  return !(status === "completed" && jobHasLiveInvoice(job));
}

/** The list, unwrapped or in { data } / { data: { change_orders } }; newest first. */
export function readChangeOrders(resp: unknown): ChangeOrderRow[] {
  let list: unknown = resp;
  if (list && typeof list === "object" && !Array.isArray(list)) {
    const o = list as Record<string, unknown>;
    list = o.data ?? o.change_orders ?? o.changeOrders ?? null;
    if (list && typeof list === "object" && !Array.isArray(list)) {
      const d = list as Record<string, unknown>;
      list = d.change_orders ?? d.changeOrders ?? null;
    }
  }
  if (!Array.isArray(list)) return [];
  const rows = list.map(readChangeOrder).filter((r): r is ChangeOrderRow => !!r);
  return rows.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

/**
 * The job's agreed lines from the same GET (`agreed_lines`, by line_item_id):
 * what a change order may take off. The API answers with these because a job
 * agreed by quote bills the quote's lines, not the job's own — so these, not
 * the job's line items, are what a removal names. Empty when not sent.
 */
export function readAgreedLines(resp: unknown): JobLine[] {
  let o: unknown = resp;
  if (o && typeof o === "object" && !Array.isArray(o) && (o as Record<string, unknown>).data && typeof (o as Record<string, unknown>).data === "object") {
    o = (o as Record<string, unknown>).data;
  }
  const raw = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>).agreed_lines : null;
  if (!Array.isArray(raw)) return [];
  const out: JobLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const l = r as Record<string, unknown>;
    const id = str(pick(l, "line_item_id", "lineItemId", "id"));
    if (!id) continue;
    // The $0 "Change order: {reason}" header an accepted change leaves on the
    // job is a section title on the invoice, not work to take off.
    if (isChangeOrderHeader(l)) continue;
    out.push({
      id,
      description: str(l.description) || "(no description)",
      quantity: num(l.quantity) ?? 0,
      unit_price: num(pick(l, "unit_price", "unitPrice")) ?? 0,
      ...(num(pick(l, "line_total", "lineTotal")) !== null ? { line_total: num(pick(l, "line_total", "lineTotal")) as number } : {}),
    });
  }
  return out;
}

/** The $0 "Change order: …" section header line an accepted change order adds to the job. */
export function isChangeOrderHeader(raw: object): boolean {
  const line = raw as Record<string, unknown>;
  const total = num(pick(line, "line_total", "lineTotal"));
  const price = num(pick(line, "unit_price", "unitPrice"));
  return /^Change order:/i.test(str(line.description)) && (total ?? price ?? 0) === 0;
}

/** Open a draft for the customer's signature (the office route). */
export const presentChangeOrderPath = (jobId: string, changeOrderId: string) =>
  `${changeOrdersPath(jobId)}/${encodeURIComponent(changeOrderId)}/present`;

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  presented: "Waiting for the customer",
  accepted: "Accepted",
  declined: "Declined",
  void: "Cancelled",
};

/** The status in plain words. */
export function changeOrderStatusLabel(status: string): string {
  return STATUS_WORDS[status] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : "Draft");
}

/** Colours for the status pill: ink on a pale tint, readable on the white card. */
export function changeOrderStatusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "accepted": return { bg: "#DCFCE7", fg: "#166534" };
    case "declined": return { bg: "#FEE2E2", fg: "#991B1B" };
    case "presented": return { bg: "#FEF3C7", fg: "#92400E" };
    case "void": return { bg: "#F1F5F9", fg: "#475569" };
    default: return { bg: "#E0F2FE", fg: "#075985" };
  }
}

/** "Signed by Dana Reyes on Thu, Oct 1, 2026, 3:12 PM" — or null with no signature. */
export function changeOrderSignedLine(row: Pick<ChangeOrderRow, "signedBy" | "signedAt">, locale?: string): string | null {
  if (!row.signedBy) return null;
  const d = row.signedAt ? new Date(row.signedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return `Signed by ${row.signedBy}`;
  const when = d.toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `Signed by ${row.signedBy} on ${when}`;
}

/** A line added in the editor (the same shape the job's line-items editor uses). */
export interface EditorLine {
  description: string;
  quantity: number;
  unit_price: number;
  service_offering_id?: string | null;
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
}

/** A line already on the job that the change order can take off. */
export interface JobLine {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  /** The server's own line total when it sent one (it wins over quantity × price). */
  line_total?: number;
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
}

function lineAmount(it: { quantity: number; unit_price: number; line_total?: number; discount_type?: string | null; discount_value?: number | null }): number {
  if (typeof it.line_total === "number" && Number.isFinite(it.line_total)) return cents(it.line_total);
  const gross = Number(it.quantity || 0) * Number(it.unit_price || 0);
  if (it.discount_type === "percent") return cents(gross - gross * (Math.min(100, Math.max(0, Number(it.discount_value) || 0)) / 100));
  if (it.discount_type === "fixed") return cents(gross - Math.min(gross, Math.max(0, Number(it.discount_value) || 0)));
  return cents(gross);
}

/** What the change does to the price: the added lines less the removed ones. */
export function changeOrderDelta(adds: readonly EditorLine[], removed: readonly JobLine[]): number {
  const plus = adds.reduce((s, l) => s + lineAmount(l), 0);
  const minus = removed.reduce((s, l) => s + lineAmount(l), 0);
  return cents(plus - minus);
}

/** Everything Save checks, as one sentence, or null when it can go. */
export function changeOrderProblem(reason: string, adds: readonly EditorLine[], removeIds: readonly string[]): string | null {
  const r = String(reason ?? "").trim();
  if (r.length < 3) return "Say why the job is changing, in a few words — the customer reads this.";
  if (r.length > 500) return "Keep the reason under 500 characters.";
  if (!adds.length && !removeIds.length) return "Add a line or tick a line to take off the job.";
  if (adds.length + removeIds.length > 12) return "A change order can carry at most 12 lines.";
  for (const l of adds) {
    const d = String(l.description ?? "").trim();
    if (d.length < 3 || d.length > 200) return "Each added line needs a description of 3 to 200 characters.";
    const q = Number(l.quantity);
    if (!Number.isFinite(q) || q < 0.25 || q > 999) return `"${d}": the quantity must be between 0.25 and 999.`;
    const p = Number(l.unit_price);
    if (!Number.isFinite(p) || p < 0 || p > 99999.99) return `"${d}": the unit price must be between $0 and $99,999.99.`;
    if (l.discount_type) return `"${d}": a change order line cannot carry a discount. Change the unit price instead.`;
  }
  return null;
}

/**
 * The POST /jobs/:id/change-orders body (contract Phase C, G5): a reason and
 * the lines — added lines as typed lines `{ kind: 'add', description,
 * unit_price, quantity }`, removed lines as `{ kind: 'remove',
 * job_line_item_id }`. The office sets its own prices, as it does on the
 * job's own line items, so a line picked from the catalogue is sent as the
 * typed line the office sees: sending its `offering_id` would make the API
 * re-price it from the catalogue (lib/changeOrder.js parseChangeOrderBody)
 * and the customer would be asked to sign a price the office never saw.
 */
export function changeOrderBody(reason: string, adds: readonly EditorLine[], removeIds: readonly string[]) {
  return {
    reason: String(reason ?? "").trim(),
    lines: [
      ...adds.map((l) => ({
        kind: "add" as const,
        description: String(l.description).trim(),
        quantity: Number(l.quantity),
        unit_price: cents(Number(l.unit_price)),
      })),
      ...removeIds.map((id) => ({ kind: "remove" as const, job_line_item_id: id })),
    ],
  };
}

/** After Save: what happens next, in a sentence. */
export function changeOrderSavedNote(_resp: unknown): string {
  return "Change order saved as a draft. Press \"Open for the customer to sign\" when it is ready; the job changes only once the customer signs.";
}

/** After "Open for the customer to sign". */
export const PRESENTED_NOTE =
  "Open for signing. Copy the customer's signing link and send it to them, or the crew can show it on the tablet.";

/** A failed load or save as a sentence. */
export function changeOrderError(what: "load" | "save" | "present", e: unknown): string {
  if (what === "load") return `Could not load the change orders: ${apiErrorMessage(e)}`;
  if (what === "present") return `The change order was not opened for signing: ${apiErrorMessage(e)}`;
  return `The change order was not saved: ${apiErrorMessage(e)}`;
}

// ── 2. completion signature setting ───────────────────────────────────────

/** The API's field name on GET / PATCH /workflow-settings. */
export const COMPLETION_SIGNATURE_FIELD = "require_completion_signature" as const;

/** The notice shown while the switch is off (one sentence, plain — Brandon's words). */
export const COMPLETION_OFF_NOTICE =
  "We don't recommend turning this off: a signed completion is what settles a dispute about the work.";

/**
 * What GET /workflow-settings says: true / false, or null when the server did
 * not send the field (then the switch is not offered — a guess would be a lie).
 */
export function completionSignatureFromSettings(settings: unknown): boolean | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>)[COMPLETION_SIGNATURE_FIELD];
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return null;
}

/**
 * The completion part of the Workflow save body: the switch as set, only when
 * the server told us it knows the field.
 */
export function completionPatchPart(value: boolean | null): { require_completion_signature?: boolean } {
  return value === null ? {} : { [COMPLETION_SIGNATURE_FIELD]: value };
}

/**
 * After the save: null when the read-back carries what was sent (nothing more
 * to say), else the sentence saying the server did not keep it.
 */
export function completionSaveProblem(sent: boolean | null, readBack: unknown): string | null {
  if (sent === null) return null;
  return completionSignatureFromSettings(readBack) === sent
    ? null
    : "The completion signature setting was not kept by the server. Try again, or tell us if it keeps happening.";
}

// ── 3. crew permissions on a worker's card ────────────────────────────────

export type CrewPermissionKey = "can_quote" | "can_send_quotes" | "can_quote_custom" | "can_charge";

export const CREW_PERMISSIONS: ReadonlyArray<{ key: CrewPermissionKey; label: string; help: string }> = [
  { key: "can_quote", label: "Can quote on site", help: "Build a quote on the tablet from your price list. The crew app shows prices, never your costs." },
  { key: "can_send_quotes", label: "Can send quotes", help: "Send a quote so the customer can sign it." },
  { key: "can_quote_custom", label: "Can add custom lines", help: "Add a line that is not in the price list, at a price they type." },
  { key: "can_charge", label: "Can take payment", help: "Charge the customer's card for a deposit or the final bill." },
];

/** A worker row's switches: true / false each, or null when the server did not send it. */
export function readCrewPermissions(worker: unknown): Record<CrewPermissionKey, boolean | null> {
  const o = worker && typeof worker === "object"
    ? (((worker as Record<string, unknown>).data && typeof (worker as Record<string, unknown>).data === "object"
        ? (worker as Record<string, unknown>).data
        : worker) as Record<string, unknown>)
    : {};
  const out = {} as Record<CrewPermissionKey, boolean | null>;
  for (const { key } of CREW_PERMISSIONS) {
    const raw = o[key];
    out[key] = raw === true || raw === 1 || raw === "1" || raw === "true" ? true
      : raw === false || raw === 0 || raw === "0" || raw === "false" ? false
      : null;
  }
  return out;
}

/** The PATCH /workers/:id body for one switch. */
export function permissionPatchBody(key: CrewPermissionKey, value: boolean): Partial<Record<CrewPermissionKey, boolean>> {
  return { [key]: value };
}

/**
 * After one switch: "Saved" only when PATCH /workers/:id answers with the
 * worker row carrying the value we sent.
 */
export function permissionSaveNote(key: CrewPermissionKey, sent: boolean, resp: unknown, firstName: string): { ok: boolean; text: string } {
  const back = readCrewPermissions(resp)[key];
  const label = CREW_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
  if (back !== sent) {
    return { ok: false, text: `"${label}" was not kept by the server. Try again, or tell us if it keeps happening.` };
  }
  const who = firstName.trim() || "This worker";
  const what: Record<CrewPermissionKey, [string, string]> = {
    can_quote: ["can quote on site", "can no longer quote on site"],
    can_send_quotes: ["can send quotes", "can no longer send quotes"],
    can_quote_custom: ["can add custom lines", "can no longer add custom lines"],
    can_charge: ["can take payment", "can no longer take payment"],
  };
  return { ok: true, text: `Saved. ${who} ${what[key][sent ? 0 : 1]}.` };
}

/** A failed switch as a sentence. */
export function permissionSaveError(e: unknown): string {
  return `Not saved: ${apiErrorMessage(e)}`;
}

/** The sentence added to "Saved." for the completion switch. */
export function completionSavedSentence(value: boolean | null): string {
  if (value === null) return "";
  return value
    ? "Customers are asked to sign when a job is finished."
    : "Customers are not asked to sign when a job is finished.";
}

/** A failed read of the switches as a sentence. */
export function permissionLoadError(e: unknown): string {
  return `Could not read this worker's crew app permissions: ${apiErrorMessage(e)}`;
}
