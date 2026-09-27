/**
 * forge-api client — FORGE / HESTIA non-profit case management.
 *
 * Mirrors the arionApi/platformApi shape: caller supplies baseUrl, bearer token
 * and tenantId; nothing here reads app state directly.
 */

export class ForgeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ForgeApiError';
    this.status = status;
  }
}

export interface ForgeParams {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}

export type EntityKey =
  | 'clients' | 'providers' | 'assistance' | 'services'
  | 'funders' | 'applications' | 'volunteers' | 'relationships'
  // Phase 2 — the constituent record and the fundraising ledger.
  | 'people' | 'funds' | 'campaigns' | 'donations' | 'pledges' | 'recurring';

/** The headline a list screen leads with — what this screen IS, in numbers. */
export interface ListSummary {
  tiles: Array<{ key: string; label: string; hint?: string; money?: boolean; warnIfAny?: boolean }>;
  values: Record<string, number | null>;
}

export interface ListResult<T = Record<string, unknown>> {
  entity: string;
  page: number;
  pageSize: number;
  total: number;
  summary?: ListSummary | null;
  data: T[];
}

/**
 * The same rows the list route returns, with no page in them. A separate route
 * rather than `pageSize=25000` on the list: the list is what a screen renders
 * and is capped for that reason, and an export that worked only because the cap
 * happened to be loose would break the day the cap moved.
 */
export interface ExportResult<T = Record<string, unknown>> {
  entity: string;
  total: number;
  /** The row ceiling was hit — the file is a subset and must say so. */
  truncated: boolean;
  data: T[];
}

export interface DashboardStats {
  clients: number;
  active_assistance: number;
  active_services: number;
  providers: number;
  funders: number;
  volunteers: number;
  needs_review: number;
  total_assistance_value: number | null;
  active_monthly_cost: number | null;
}

/** The fundraising half of the dashboard, added in Phase 2. */
export interface FundraisingSnapshot {
  fiscal_year: number | null;
  raised_this_fy: number;
  donors_this_fy: number;
  raised_last_fy: number;
  /** The prior year cut at the same point in its fiscal calendar as today. */
  raised_last_fy_to_date: number;
  days_into_fiscal_year: number;
  /** Measured against raised_last_fy_to_date, not the prior year's total. */
  year_over_year_percent: number | null;
  acknowledgements_outstanding: number;
  pledges_outstanding: number;
  active_recurring: number;
  failed_recurring: number;
  lapsed_donors: number;
  grant_reports_due: number;
  grants_pending: number;
  people_served_all_time: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  fundraising?: FundraisingSnapshot;
  servicesByType: Array<{ provider_type: string; n: number }>;
  recentApplications: Array<{
    application_id: string | number;
    funder_name: string | null;
    applied_date: string | null;
    decision_type: string | null;
    amount_applied_for: number | null;
    amount_awarded: number | null;
    reporting_due_date: string | null;
  }>;
}

export interface NoteRow {
  note_id: number;
  body: string | null;
  note_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ActivityRow {
  activity_id: number;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  actor: string | null;
  occurred_at: string;
}

export interface ClientOverview {
  client: Record<string, unknown>;
  assistance: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  notes: NoteRow[];
  activity: ActivityRow[];
  totals: { total_assistance: number | null; assistance_count: number };
}

export type LookupSets = Record<string, { label: string; values: Array<{ id: number; value: string }> }>;

async function request<T>(
  params: ForgeParams,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${params.baseUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-id': params.tenantId,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j?.error || j?.details || detail;
    } catch { /* keep statusText */ }
    throw new ForgeApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function qs(query: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const getDashboard = (p: ForgeParams) =>
  request<{ data: DashboardResponse }>(p, '/forge/dashboard').then((r) => r.data);

export const listEntity = <T = Record<string, unknown>>(
  p: ForgeParams,
  entity: EntityKey,
  query: Record<string, string | number | boolean | undefined> = {}
) => request<ListResult<T>>(p, `/forge/${entity}${qs(query)}`);

/**
 * Every row a set of list parameters matches, for a file. Takes the SAME query
 * as listEntity — search, sort, filters, includeArchived — minus the paging, so
 * the file holds the list the person is looking at rather than a second,
 * differently-filtered list that happens to share a name.
 */
export const exportEntity = <T = Record<string, unknown>>(
  p: ForgeParams,
  entity: EntityKey,
  query: Record<string, string | number | boolean | undefined> = {}
) => request<ExportResult<T>>(p, `/forge/${entity}/export${qs(query)}`);

/** One row of a spreadsheet, keyed by field key (or the entity's id column). */
export type ImportRow = Record<string, string | number | null>;

export interface ImportPreview {
  counts: { create: number; update: number; error: number; warning: number };
  rows: Array<{
    index: number;
    action: 'create' | 'update' | 'error';
    matchedId: string | null;
    errors: string[];
    warnings: string[];
  }>;
  /** Columns the entity has no home for. Named, never silently dropped. */
  ignoredColumns: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ index: number; message: string }>;
  ignoredColumns: string[];
}

/** The API's own ceiling per request; the caller batches to it. */
export const IMPORT_BATCH = 500;

/** What WOULD happen. Writes nothing. */
export const previewImport = (p: ForgeParams, entity: EntityKey, rows: ImportRow[]) =>
  request<ImportPreview>(p, `/forge/${entity}/import/preview`, { method: 'POST', body: { rows } });

/** Do it. Same classification, performed. */
export const commitImport = (p: ForgeParams, entity: EntityKey, rows: ImportRow[]) =>
  request<ImportResult>(p, `/forge/${entity}/import`, { method: 'POST', body: { rows } });

export const getEntityRow = <T = Record<string, unknown>>(p: ForgeParams, entity: EntityKey, id: string | number) =>
  request<{ data: T }>(p, `/forge/${entity}/${id}`).then((r) => r.data);

export const createEntityRow = (p: ForgeParams, entity: EntityKey, body: Record<string, unknown>) =>
  request<{ data: Record<string, number> }>(p, `/forge/${entity}`, { method: 'POST', body });

export const updateEntityRow = (p: ForgeParams, entity: EntityKey, id: string | number, body: Record<string, unknown>) =>
  request<{ ok: boolean }>(p, `/forge/${entity}/${id}`, { method: 'PATCH', body });

export const archiveEntityRow = (p: ForgeParams, entity: EntityKey, id: string | number, restore = false) =>
  request<{ ok: boolean }>(p, `/forge/${entity}/${id}${restore ? '?restore=true' : ''}`, { method: 'DELETE' });

export const getClientOverview = (p: ForgeParams, id: string | number) =>
  request<{ data: ClientOverview }>(p, `/forge/clients/${id}/overview`).then((r) => r.data);

export const getLookups = (p: ForgeParams) =>
  request<{ data: LookupSets }>(p, '/forge/lookups').then((r) => r.data);

export const getNotes = (p: ForgeParams, entity: EntityKey, id: string | number) =>
  request<{ data: NoteRow[] }>(p, `/forge/${entity}/${id}/notes`).then((r) => r.data);

export const addNote = (p: ForgeParams, entity: EntityKey, id: string | number, body: string) =>
  request<{ data: { note_id: number } }>(p, `/forge/${entity}/${id}/notes`, { method: 'POST', body: { body } });

export const getActivity = (p: ForgeParams, entity: EntityKey, id: string | number) =>
  request<{ data: ActivityRow[] }>(p, `/forge/${entity}/${id}/activity`).then((r) => r.data);

/* ---------------- Phase 2: reports ---------------- */

export interface ReportSummary {
  key: string;
  title: string;
  group: string;
  description: string;
  filters: string[];
}

export interface ReportResult<T = Record<string, unknown>> {
  key: string;
  title: string;
  group: string;
  description: string;
  generatedAt: string;
  rowCount: number;
  /** True when the row limit was hit — the report is partial and says so. */
  truncated: boolean;
  columns: string[];
  data: T[];
}

export const listReports = (p: ForgeParams) =>
  request<{ data: ReportSummary[] }>(p, '/forge/reports').then((r) => r.data);

export const runReport = <T = Record<string, unknown>>(
  p: ForgeParams,
  key: string,
  filters: Record<string, string | number | undefined> = {}
) => request<ReportResult<T>>(p, `/forge/reports/${key}${qs(filters)}`);

/* ---------------- Phase 2: receipting ---------------- */

export interface ReceiptRow {
  receipt_id: number;
  receipt_no: string;
  receipt_kind: 'per_gift' | 'year_end';
  tax_year: number | null;
  total_amount: number;
  deductible_amount: number;
  issued_at: string | null;
  delivery: string | null;
  donation_id: number | null;
  donor_name: string;
  donor_email: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ReceiptGenerateResult {
  taxYear: number;
  kind: string;
  preview: boolean;
  generated: number;
  skipped: number;
  receipts: Array<{
    receipt_id?: number;
    receipt_no?: string;
    donor_name: string;
    gift_count?: number;
    total_amount?: number;
    deductible_amount?: number;
    body?: string;
    skipped?: boolean;
    reason?: string;
  }>;
}

export const listReceipts = (p: ForgeParams, query: { taxYear?: number; personId?: number } = {}) =>
  request<{ data: ReceiptRow[] }>(p, `/forge/receipts${qs(query)}`).then((r) => r.data);

export const getReceipt = (p: ForgeParams, id: number) =>
  request<{ data: ReceiptRow & { body_snapshot: string } }>(p, `/forge/receipts/${id}`).then((r) => r.data);

export const generateReceipts = (
  p: ForgeParams,
  body: { taxYear: number; kind: 'per_gift' | 'year_end'; personId?: number; donationId?: number; preview?: boolean }
) => request<ReceiptGenerateResult>(p, '/forge/receipts/generate', { method: 'POST', body });

/* ---------------- Phase 2: settings, payments, designations, roles ---------------- */

export interface OrgSettings {
  legal_name: string | null;
  ein: string | null;
  fiscal_year_start_month: number;
  street: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  receipt_signer_name: string | null;
  receipt_signer_title: string | null;
  receipt_statement: string | null;
  receipt_prefix: string;
}

export const getOrgSettings = (p: ForgeParams) =>
  request<{ configured: boolean; data: OrgSettings | null }>(p, '/forge/settings');

export const saveOrgSettings = (p: ForgeParams, body: Partial<OrgSettings>) =>
  request<{ data: OrgSettings }>(p, '/forge/settings', { method: 'PUT', body });

export interface PaymentAccount {
  processor: string;
  account_ref: string | null;
  account_status: string;
  charity_rate_status: 'not_applied' | 'applied' | 'approved' | 'declined';
  charity_rate_applied_on: string | null;
  charity_rate_approved_on: string | null;
  platform_fee_bps: number;
  platform_fee_note: string | null;
  is_live: boolean;
}

export interface PaymentAccountResponse {
  connected: boolean;
  data: PaymentAccount | null;
  rates: {
    standard: { percent: number; fixed: number };
    charity: { percent: number; fixed: number };
    how_to_apply: string;
    requirements: string;
    review_time: string;
    retroactive: boolean;
  };
  effective_rate: { percent: number; fixed: number };
  warning: string | null;
}

export const getPaymentAccount = (p: ForgeParams) =>
  request<PaymentAccountResponse>(p, '/forge/payment-account');

export const savePaymentAccount = (p: ForgeParams, body: Partial<PaymentAccount>) =>
  request<{ data: PaymentAccount }>(p, '/forge/payment-account', { method: 'PUT', body });

export interface Designation {
  designation_id?: number;
  fund_id: number;
  amount: number;
  fund_name?: string;
  restriction?: string;
}

export const getDesignations = (p: ForgeParams, donationId: number | string) =>
  request<{ data: Designation[] }>(p, `/forge/donations/${donationId}/designations`).then((r) => r.data);

export const saveDesignations = (p: ForgeParams, donationId: number | string, designations: Designation[]) =>
  request<{ data: Designation[] }>(p, `/forge/donations/${donationId}/designations`, {
    method: 'PUT', body: { designations },
  }).then((r) => r.data);

export interface PersonRole {
  person_role_id: number;
  role_key: string;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

export const getPersonRoles = (p: ForgeParams, personId: number | string) =>
  request<{ available: string[]; data: PersonRole[] }>(p, `/forge/people/${personId}/roles`);

export const addPersonRole = (p: ForgeParams, personId: number | string, roleKey: string) =>
  request<{ ok: boolean }>(p, `/forge/people/${personId}/roles`, { method: 'POST', body: { role_key: roleKey } });

export const endPersonRole = (p: ForgeParams, personId: number | string, roleKey: string) =>
  request<{ ended: number }>(p, `/forge/people/${personId}/roles/${roleKey}`, { method: 'DELETE' });

export interface FinancialImportRow {
  import_id: number;
  source: string;
  period_start: string;
  period_end: string;
  label: string | null;
  line_count: number;
  created_at: string;
  created_by: string | null;
}

export const listFinancialImports = (p: ForgeParams) =>
  request<{ data: FinancialImportRow[] }>(p, '/forge/financial-imports').then((r) => r.data);

export const createFinancialImport = (
  p: ForgeParams,
  body: {
    period_start: string; period_end: string; label?: string; source?: string; notes?: string;
    lines: Array<{
      line_kind: 'revenue' | 'expense';
      functional_category?: 'program' | 'management_general' | 'fundraising';
      restriction?: string; account_label: string; amount: number;
    }>;
  }
) => request<{ import_id: number; lines: number }>(p, '/forge/financial-imports', { method: 'POST', body });

export const globalSearch = (p: ForgeParams, q: string) =>
  request<{ data: Array<{ entity: EntityKey; id: number; label: string; detail: string }> }>(
    p, `/forge/search${qs({ q })}`
  ).then((r) => r.data);
