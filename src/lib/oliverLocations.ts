// oliverLocations.ts — OLIVER multi-location: the ONE place the client knows
// the shape of the oliver-api /locations contract, plus the pure helpers every
// location-aware page shares. No React in here on purpose — the helpers are
// exercised by scripts/test-oliver-locations.mjs without a DOM.
//
// Contract (oliver-api, feat/oliver-multi-location, 2026-08-21):
//   GET    /locations                      → { data: OliverLocation[] }
//   POST   /locations                      → 402 tier_upgrade_required below Business once one exists
//   PATCH  /locations/:id
//   POST   /locations/:id/default
//   DELETE /locations/:id?reassign_to=<guid>
//   GET/PUT /locations/:id/members         → { tenant_user_ids }
//   GET/PATCH /workers/:id                 carry location_ids
//   every list/report endpoint             accepts ?location_id=<guid>
//   reports                                accept ?group_by=location
//
// If the backend shape drifts, fix it HERE — every consumer imports from this
// file, so a mismatch is a one-line change.

export interface OliverLocation {
  location_id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  phone: string | null;
  timezone: string | null;
  is_active: boolean;
  is_default: boolean;
  job_count: number;
  worker_count: number;
}

/** Body for POST /locations and PATCH /locations/:id. */
export type OliverLocationInput = Partial<
  Pick<OliverLocation, "name" | "address_line1" | "city" | "region" | "postal_code" | "phone" | "timezone" | "is_active">
>;

/** GET/PUT /locations/:id/members */
export interface OliverLocationMembers {
  tenant_user_ids: string[];
}

/** "all" = no scoping (business-wide); otherwise a location_id guid. */
export type LocationSelection = "all" | string;
export const ALL_LOCATIONS: LocationSelection = "all";

/** One row of a ?group_by=location report breakdown. Metric keys vary per report. */
export interface LocationBreakdownRow {
  location_id: string;
  location_name: string;
  [metric: string]: unknown;
}

/** Plan that unlocks a second location (decisions 2026-08-21: Business = $349.99). */
export const MULTI_LOCATION_PLAN_LABEL = "OLIVER Business";

// ─── Query helpers ──────────────────────────────────────────────────────────

/** Append query params to a path that may or may not already carry a `?`. Empty values are skipped. */
export function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  if (!parts.length) return path;
  const sep = path.includes("?") ? (path.endsWith("?") || path.endsWith("&") ? "" : "&") : "?";
  return `${path}${sep}${parts.join("&")}`;
}

/**
 * The one scoping helper. `withLocation("/jobs?per_page=200", "all")` returns
 * the path untouched — a single-location business never sends location_id,
 * so nothing changes for it server-side either.
 */
export function withLocation(path: string, selected: LocationSelection | null | undefined): string {
  if (!selected || selected === ALL_LOCATIONS) return path;
  return withQuery(path, { location_id: selected });
}

// ─── List helpers ───────────────────────────────────────────────────────────

export function activeLocations(list: OliverLocation[] | null | undefined): OliverLocation[] {
  return (list || []).filter((l) => l && l.is_active !== false);
}

/** Multi = more than one ACTIVE location. A deactivated second location does not count. */
export function isMultiLocation(list: OliverLocation[] | null | undefined): boolean {
  return activeLocations(list).length > 1;
}

export function defaultLocationOf(list: OliverLocation[] | null | undefined): OliverLocation | null {
  const active = activeLocations(list);
  return active.find((l) => l.is_default) ?? active[0] ?? null;
}

export function locationById(id: string | null | undefined, list: OliverLocation[] | null | undefined): OliverLocation | null {
  if (!id) return null;
  const want = String(id).toLowerCase();
  return (list || []).find((l) => String(l.location_id).toLowerCase() === want) ?? null;
}

/** Display name for a location id; falls back to a name the row may carry, then null. */
export function locationNameOf(
  id: string | null | undefined,
  list: OliverLocation[] | null | undefined,
  fallbackName?: string | null,
): string | null {
  return locationById(id, list)?.name ?? (fallbackName || null);
}

/** Read a location id off any API row — oliver-api mixes snake and camel case across endpoints. */
export function rowLocationId(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const v = r.location_id ?? r.locationId ?? null;
  return v ? String(v) : null;
}

/** Same for a row's own location name, when the endpoint joins it. */
export function rowLocationName(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const v = r.location_name ?? r.locationName ?? null;
  return v ? String(v) : null;
}

/** `location_ids` arrives as an array, a JSON string, or CSV depending on the SQL driver path. */
export function parseIdList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* not JSON — fall through to CSV */ }
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

// ─── Selection persistence ──────────────────────────────────────────────────

/** Per-business sessionStorage slot. Scope = effective tenant id (view-as aware). */
export function selectionStorageKey(scope: string): string {
  return `oliver.location.selected.${String(scope || "").toLowerCase()}`;
}

/**
 * A stored selection is only honoured while it names an ACTIVE location of
 * THIS business; anything else (deactivated, other business, garbage) falls
 * back to "all". Keeps a stale guid from silently hiding every job.
 */
export function normalizeSelection(stored: string | null | undefined, list: OliverLocation[] | null | undefined): LocationSelection {
  if (!stored || stored === ALL_LOCATIONS) return ALL_LOCATIONS;
  if (!isMultiLocation(list)) return ALL_LOCATIONS;
  return activeLocations(list).some((l) => String(l.location_id).toLowerCase() === String(stored).toLowerCase())
    ? String(stored)
    : ALL_LOCATIONS;
}

// ─── Reports: ?group_by=location ────────────────────────────────────────────

/**
 * Pull the per-location rows out of a group_by=location response whatever
 * envelope the report used (bare array, or { by_location | locations |
 * breakdown | rows | data: [...] }). Rows without a location_id are dropped.
 */
export function extractLocationRows(resp: unknown): LocationBreakdownRow[] {
  let arr: unknown[] | null = null;
  if (Array.isArray(resp)) arr = resp;
  else if (resp && typeof resp === "object") {
    const r = resp as Record<string, unknown>;
    for (const k of ["by_location", "locations", "breakdown", "rows", "data"]) {
      if (Array.isArray(r[k])) { arr = r[k] as unknown[]; break; }
    }
  }
  if (!arr) return [];
  const out: LocationBreakdownRow[] = [];
  for (const row of arr) {
    const id = rowLocationId(row);
    if (!id) continue;
    out.push({
      ...(row as Record<string, unknown>),
      location_id: id,
      location_name: rowLocationName(row) || "",
    });
  }
  return out;
}

/** First numeric value among the candidate keys, else 0. Report metric names differ per endpoint. */
export function metricOf(row: Record<string, unknown> | null | undefined, keys: string[]): number {
  if (!row) return 0;
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

// ─── Team access: per-user scope ────────────────────────────────────────────

/**
 * membership: location_id → tenant_user_ids. A user in NO location is
 * unscoped ("all locations"); otherwise they see only the listed ones.
 */
export function userLocationIds(membership: Record<string, string[]>, userId: string): string[] {
  const want = String(userId).toLowerCase();
  return Object.entries(membership)
    .filter(([, ids]) => (ids || []).some((u) => String(u).toLowerCase() === want))
    .map(([locationId]) => locationId);
}

/** Which locations need a PUT to move `userId` from `current` to `desired` scope. */
export function membershipUpdates(
  membership: Record<string, string[]>,
  userId: string,
  desired: string[],
): Array<{ location_id: string; tenant_user_ids: string[] }> {
  const want = new Set(desired.map((d) => d.toLowerCase()));
  const uid = String(userId).toLowerCase();
  const out: Array<{ location_id: string; tenant_user_ids: string[] }> = [];
  for (const [locationId, ids] of Object.entries(membership)) {
    const has = (ids || []).some((u) => String(u).toLowerCase() === uid);
    const should = want.has(locationId.toLowerCase());
    if (has === should) continue;
    const next = should
      ? [...(ids || []), userId]
      : (ids || []).filter((u) => String(u).toLowerCase() !== uid);
    out.push({ location_id: locationId, tenant_user_ids: next });
  }
  return out;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * POST /locations answers 402 tier_upgrade_required below Business once a
 * location exists. lib/oliverApi only structures 403s, so a 402 arrives as
 * `Error("OLIVER API 402: {...}")` — recognise both forms.
 */
export function isLocationTierError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && (err as { type?: string }).type === "tier_gate") return true;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\b402\b/.test(msg) || msg.includes("tier_upgrade_required") || msg.includes("tier_required");
}

// ─── Surfaces + storage (pure; the hook/picker call these) ──────────────────

/** True for the routes where the header location picker belongs: /app/services/oliver_* and /app/oliver/*. */
export function isOliverSurface(pathname: string | null | undefined): boolean {
  return /^\/app\/(services\/oliver_|oliver(\/|$))/.test(String(pathname || ""));
}

/** Minimal Storage shape so the helpers run under node tests without a DOM. */
export interface SelectionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Stored selection for this business, already normalised against the current list. */
export function readSelection(store: SelectionStore | null | undefined, scope: string, list: OliverLocation[] | null | undefined): LocationSelection {
  if (!store || !scope) return ALL_LOCATIONS;
  try {
    return normalizeSelection(store.getItem(selectionStorageKey(scope)), list);
  } catch {
    return ALL_LOCATIONS;
  }
}

/** Persist a selection; "all" clears the slot so a fresh session starts business-wide. */
export function writeSelection(store: SelectionStore | null | undefined, scope: string, selected: LocationSelection): void {
  if (!store || !scope) return;
  try {
    const key = selectionStorageKey(scope);
    if (!selected || selected === ALL_LOCATIONS) store.removeItem(key);
    else store.setItem(key, String(selected));
  } catch {
    /* private mode / quota — in-memory selection still works for the tab */
  }
}

/** Display label for a picker option: "Downtown" / "Downtown (default)". */
export function locationOptionLabel(l: OliverLocation): string {
  return l.is_default ? `${l.name} (default)` : l.name;
}

/** One-line address for list rows; null when nothing is filled in. */
export function locationAddressLine(l: Pick<OliverLocation, "address_line1" | "city" | "region" | "postal_code">): string | null {
  const cityRegion = [l.city, l.region].filter(Boolean).join(", ");
  const parts = [l.address_line1, [cityRegion, l.postal_code].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
