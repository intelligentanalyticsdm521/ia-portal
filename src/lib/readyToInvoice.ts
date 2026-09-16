/**
 * lib/readyToInvoice.ts — the month-end screen's two decisions, in one module.
 *
 * CUSTOMER_MODEL_MULTISITE_2026-09-15 §9.6 and §9.12 (the last remaining item:
 * "the month-end screen has an API and no UI").
 *
 * The API answers WHO PAYS — one group per bill-to, and a location with its own
 * billing profile lands in its own group without anybody choosing that (§7
 * point 5 item 8). The screen adds exactly two things on top, and they live
 * here rather than inside the page so `node --test` can drive them and so a
 * second screen cannot answer them differently:
 *
 *   1. WITHIN a payer, which site did each job happen at — the line groups the
 *      invoice will be printed with, shown BEFORE the invoice exists so the
 *      person ticking the box can see what they are about to create.
 *   2. What a payer's card says: the number of invoices about to be created,
 *      and how many jobs are going to be left behind because they carry no
 *      priced lines.
 *
 * Pure: shapes in, shapes out.
 */

/** One job waiting to be invoiced, as `GET /invoices/ready-to-invoice` returns it. */
export interface ReadyJob {
  job_id: string;
  job_number?: string | null;
  title?: string | null;
  service_location_id?: string | null;
  completed_at?: string | null;
  total: number;
  line_count: number;
}

export interface ReadyLocation {
  location_id: string;
  name?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  po_number?: string | null;
  tax_rate?: number | null;
  billing_profile_id?: string | null;
}

export interface BillToSnapshot {
  source?: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  address?: {
    address_line_1?: string | null; address_line_2?: string | null;
    city?: string | null; state?: string | null; postal_code?: string | null;
  } | null;
  payment_terms_days?: number | null;
  po_number?: string | null;
  tax_exempt?: boolean;
  billing_profile_id?: string | null;
  service_location_id?: string | null;
}

export interface ReadyGroup {
  bill_to_key: string;
  bill_to_name?: string | null;
  bill_to_profile_id?: string | null;
  bill_to_contact_id?: string | null;
  bill_to?: BillToSnapshot | null;
  contact_id?: string | null;
  jobs: ReadyJob[];
  job_count: number;
  location_ids: string[];
  locations?: ReadyLocation[];
  total: number;
  jobs_with_no_lines: number;
}

/** A payer's jobs, gathered under the site each one happened at. */
export interface LocationGroup {
  location_id: string | null;
  name: string;
  addressLine: string;
  po_number: string | null;
  jobs: ReadyJob[];
  subtotal: number;
  /** Jobs here that carry no priced lines and so cannot be invoiced. */
  unpriced: number;
}

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function addressLineOf(l: ReadyLocation | null | undefined): string {
  if (!l) return "";
  return [l.address_line_1, l.address_line_2, [l.city, l.state].filter(Boolean).join(", "), l.postal_code]
    .filter((x) => String(x ?? "").trim())
    .join(", ");
}

export function billToAddressLine(b: BillToSnapshot | null | undefined): string {
  const a = b?.address;
  if (!a) return "";
  return [a.address_line_1, a.address_line_2, [a.city, a.state].filter(Boolean).join(", "), a.postal_code]
    .filter((x) => String(x ?? "").trim())
    .join(", ");
}

/**
 * A payer's jobs grouped by the site they happened at.
 *
 * The order is the location list's own — which is the order the invoice's line
 * groups will print in — so what the screen shows and what the document shows
 * are the same sequence. Jobs with no site at all fall into one trailing group
 * rather than being attributed to whichever site came first: guessing which
 * building a line belongs to is how a site-level dispute starts (§9.10 item 7).
 */
export function groupJobsByLocation(group: ReadyGroup): LocationGroup[] {
  const byId = new Map<string, ReadyLocation>();
  for (const l of group.locations || []) byId.set(String(l.location_id).toLowerCase(), l);

  const buckets = new Map<string | null, ReadyJob[]>();
  for (const job of group.jobs || []) {
    const k = job.service_location_id ? String(job.service_location_id).toLowerCase() : null;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(job);
  }

  const order = (group.locations || []).map((l) => String(l.location_id).toLowerCase());
  const sited = [...buckets.keys()].filter((k): k is string => k !== null)
    .sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
    });
  const keys: Array<string | null> = buckets.has(null) ? [...sited, null] : sited;

  return keys.map((k) => {
    const jobs = buckets.get(k)!;
    const detail = k ? byId.get(k) || null : null;
    return {
      location_id: k,
      // A site whose detail this tenant can no longer read still gets a group:
      // the jobs are real money, and hiding them would change the total.
      name: detail?.name || (k ? "This site" : "No service location"),
      addressLine: addressLineOf(detail),
      po_number: detail?.po_number || null,
      jobs,
      subtotal: money(jobs.reduce((s, j) => s + Number(j.total || 0), 0)),
      unpriced: jobs.filter((j) => !Number(j.line_count)).length,
    };
  });
}

/**
 * Does this payer pay for exactly one site, which pays for itself?
 *
 * The answer comes from the payer's OWN bill-to profile being the LOCATION's
 * profile — never from "it has one site", which is also true of every
 * homeowner. §7 point 5 item 8: per-site invoices fall out where a location has
 * its own billing profile, and they must read as their own card rather than as
 * a fold-out of the parent's.
 */
export function paysForItself(group: ReadyGroup): boolean {
  const profile = group.bill_to_profile_id || group.bill_to?.billing_profile_id || null;
  if (!profile) return false;
  const own = (group.locations || []).find(
    (l) => l.billing_profile_id && String(l.billing_profile_id).toLowerCase() === String(profile).toLowerCase(),
  );
  return !!own;
}

/**
 * The order the cards are read in: work you can bill first.
 *
 * FOUND BY WALKING IT, 2026-09-16. The API sorts payers by name, which is the
 * right answer for a list and the wrong one for this screen: the dev database
 * had seven payers whose every job carries no priced lines, and all seven sorted
 * above the two with real money in them. The person opening the screen at month
 * end scrolls past seven cards they cannot tick before reaching the ones they
 * came for.
 *
 * Payers with priced work come first, biggest first — that is the order somebody
 * invoicing a month actually wants. The rest keep their alphabetical order
 * underneath, and are never HIDDEN: a completed job that cannot be billed is
 * exactly what this screen has to show (§9.6).
 */
export function orderForScreen(groups: ReadyGroup[]): ReadyGroup[] {
  const billable = (g: ReadyGroup) => g.jobs.some((j) => Number(j.line_count) > 0);
  return [...groups].sort((a, b) => {
    const ab = billable(a); const bb = billable(b);
    if (ab !== bb) return ab ? -1 : 1;
    if (ab && bb) return Number(b.total || 0) - Number(a.total || 0);
    return String(a.bill_to_name || "").localeCompare(String(b.bill_to_name || ""));
  });
}

/** How many invoices "Create N invoices" will actually create. */
export function invoiceCount(groups: ReadyGroup[], picked: ReadySelection): number {
  return groups.filter((g) => picked.has(g.bill_to_key) && g.jobs.some((j) => Number(j.line_count) > 0)).length;
}

export type ReadySelection = Set<string>;

/** The one-line summary under the Create button. */
export function batchSummary(groups: ReadyGroup[], picked: ReadySelection): string {
  const chosen = groups.filter((g) => picked.has(g.bill_to_key));
  if (!chosen.length) return "Tick the customers you want to invoice.";
  const n = invoiceCount(groups, picked);
  const jobs = chosen.reduce((s, g) => s + g.jobs.filter((j) => Number(j.line_count) > 0).length, 0);
  const total = money(chosen.reduce((s, g) => s + Number(g.total || 0), 0));
  const skipped = chosen.reduce((s, g) => s + Number(g.jobs_with_no_lines || 0), 0);
  const base = `${n} invoice${n === 1 ? "" : "s"} · ${jobs} job${jobs === 1 ? "" : "s"} · $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // "Why is that job not on my invoice?" has to have an answer on the screen
  // (§9.6), not in a log nobody reads.
  return skipped
    ? `${base}. ${skipped} job${skipped === 1 ? " has" : "s have"} no priced lines and will be left for next time.`
    : `${base}.`;
}

export default {
  groupJobsByLocation, paysForItself, invoiceCount, batchSummary, orderForScreen,
  addressLineOf, billToAddressLine,
};
