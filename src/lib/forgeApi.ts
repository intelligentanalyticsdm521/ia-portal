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
  | 'funders' | 'applications' | 'volunteers' | 'relationships';

export interface ListResult<T = Record<string, unknown>> {
  entity: string;
  page: number;
  pageSize: number;
  total: number;
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

export interface DashboardResponse {
  stats: DashboardStats;
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

export const globalSearch = (p: ForgeParams, q: string) =>
  request<{ data: Array<{ entity: EntityKey; id: number; label: string; detail: string }> }>(
    p, `/forge/search${qs({ q })}`
  ).then((r) => r.data);
