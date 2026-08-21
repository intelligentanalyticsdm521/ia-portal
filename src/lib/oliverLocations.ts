// oliverLocations.ts — OLIVER multi-location: the ONE place the client knows
// the shape of the oliver-api /locations contract, plus the pure helpers every
// location-aware page shares. No React in here on purpose — the helpers are
// exercised by scripts/test-oliver-locations.mjs without a DOM.
//
// Contract (oliver-api, feat/oliver-multi-location, 2026-08-21):
//   GET    /locations?include_inactive=1   → { data: OliverLocation[] } (counts: open_jobs / total_jobs / workers)
//   POST   /locations                      → 402 tier_upgrade_required below Business once one exists
//   PATCH  /locations/:id                  is_active:true re-activates (same gate)
//   POST   /locations/:id/default
//   DELETE /locations/:id?reassign_to=<guid>  → 409 location_in_use while open jobs reference it and no reassign_to
//   GET/PUT /locations/:id/members         → { location_id, tenant_user_ids } — core.tenant_users.tenant_user_id,
//                                            NOT core.users.user_id (GET /tenant-users `userId`); see MemberIdentity
//   GET/PATCH /workers/:id                 carry location_ids
//   jobs / workers / invoices / schedule / dashboard / reports  accept ?location_id=<guid>
//   reports revenue / jobs / completion / profit-distribution / crew   accept ?group_by=location (→ by_location[])
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
  /** Jobs in an open status (inquiry → completed) on this location. DELETE refuses while > 0 unless reassign_to is given. */
  open_jobs: number;
  total_jobs: number;
  /** ACTIVE workers assigned here (oliver.worker_location). */
  workers: number;
}

/** Deactivating needs a "move to" target while open jobs or active workers still reference the location. */
export function locationNeedsReassign(l: Pick<OliverLocation, "open_jobs" | "workers">): boolean {
  return (Number(l.open_jobs) || 0) > 0 || (Number(l.workers) || 0) > 0;
}

/** "3 open jobs and 1 worker" for the reassign prompt; "" when nothing references the location. */
export function locationUsageLabel(l: Pick<OliverLocation, "open_jobs" | "workers">): string {
  const jobs = Number(l.open_jobs) || 0;
  const workers = Number(l.workers) || 0;
  return [
    jobs ? `${jobs} open job${jobs === 1 ? "" : "s"}` : null,
    workers ? `${workers} worker${workers === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" and ");
}

/** Body for POST /locations and PATCH /locations/:id. */
export type OliverLocationInput = Partial<
  Pick<OliverLocation, "name" | "address_line1" | "city" | "region" | "postal_code" | "phone" | "timezone" | "is_active">
>;

/**
 * GET/PUT /locations/:id/members. The API stores core.tenant_users.tenant_user_id
 * and validates a PUT against it. `user_ids` (core.users.user_id, parallel to
 * tenant_user_ids) is present once the API joins it; see MemberIdentity.
 */
export interface OliverLocationMembers {
  location_id?: string;
  tenant_user_ids: string[];
  user_ids?: string[];
}

/**
 * A tenant user as GET /tenant-users reports it, reduced to its two ids.
 * `userId` is core.users.user_id (always there); `tenantUserId` is
 * core.tenant_users.tenant_user_id — the id /members stores — once the API
 * sends it. The helpers below send tenantUserId when they have it and fall
 * back to userId (which the API resolves itself), so Team Access and the
 * Locations members drawer work against either shape.
 */
export interface MemberIdentity {
  userId: string;
  tenantUserId?: string | null;
}

/** One /members entry as the Portal keeps it: the stored id plus the joined user_id when known. */
export interface LocationMember {
  tenant_user_id: string;
  user_id: string | null;
}

/** location_id → members (Team Access loads one GET per active location). */
export type LocationMembership = Record<string, LocationMember[]>;

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
//
// Wire contract (oliver-api routes/locations.js + routes/tenantUsers.js):
//   GET /tenant-users            → users[].userId = core.users.user_id
//                                  (+ tenantUserId = core.tenant_users.tenant_user_id once the API sends it)
//   GET /locations/:id/members   → tenant_user_ids = core.tenant_users.tenant_user_id (+ user_ids when joined)
//   PUT /locations/:id/members   → validates tenant_user_ids against core.tenant_users → 400 unknown_tenant_user
// The two id spaces are different GUIDs. Every helper here takes the whole
// user row (MemberIdentity) and resolves the id the API stores itself.

const sameId = (a: unknown, b: unknown): boolean =>
  !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

/** Normalise a /members body ({ tenant_user_ids, user_ids? }) into member entries. Anything else → []. */
export function parseMembers(resp: unknown): LocationMember[] {
  if (!resp || typeof resp !== "object") return [];
  const r = resp as Record<string, unknown>;
  const tenantUserIds = parseIdList(r.tenant_user_ids);
  const userIds = parseIdList(r.user_ids);
  return tenantUserIds.map((tenant_user_id, i) => ({ tenant_user_id, user_id: userIds[i] ?? null }));
}

/** Does this /members entry refer to `user`? By tenant_user_id when the row carries one, else by the joined user_id. */
export function memberIs(m: LocationMember | null | undefined, user: MemberIdentity): boolean {
  if (!m) return false;
  return sameId(m.tenant_user_id, user.tenantUserId) || sameId(m.user_id, user.userId);
}

export function isMemberOf(members: LocationMember[] | null | undefined, user: MemberIdentity): boolean {
  return (members || []).some((m) => memberIs(m, user));
}

/**
 * The id a PUT /members body must carry for `user`: its tenantUserId when the
 * /tenant-users row has it; else the tenant_user_id an existing membership
 * (any location) maps to its user_id; else its userId, which the API resolves.
 */
export function memberSendId(user: MemberIdentity, membership: LocationMembership | LocationMember[] | null | undefined): string {
  if (user.tenantUserId) return String(user.tenantUserId);
  const all = Array.isArray(membership) ? membership : Object.values(membership || {}).flat();
  const hit = all.find((m) => sameId(m.user_id, user.userId));
  return hit ? hit.tenant_user_id : String(user.userId);
}

/** Locations `user` is limited to. Empty = unscoped ("all locations"). */
export function userLocationIds(membership: LocationMembership, user: MemberIdentity): string[] {
  return Object.entries(membership)
    .filter(([, members]) => isMemberOf(members, user))
    .map(([locationId]) => locationId);
}

export interface MembershipUpdate {
  location_id: string;
  /** PUT body for this location. */
  tenant_user_ids: string[];
  /** The same list as member entries — what local state should hold after the PUT. */
  members: LocationMember[];
}

/** Which locations need a PUT to move `user` from its current scope to `desired`. */
export function membershipUpdates(membership: LocationMembership, user: MemberIdentity, desired: string[]): MembershipUpdate[] {
  const want = new Set(desired.map((d) => String(d).toLowerCase()));
  const out: MembershipUpdate[] = [];
  for (const [locationId, members] of Object.entries(membership)) {
    const has = isMemberOf(members, user);
    const should = want.has(locationId.toLowerCase());
    if (has === should) continue;
    const next = should
      ? [...(members || []), { tenant_user_id: memberSendId(user, membership), user_id: user.userId }]
      : (members || []).filter((m) => !memberIs(m, user));
    out.push({ location_id: locationId, tenant_user_ids: next.map((m) => m.tenant_user_id), members: next });
  }
  return out;
}

/**
 * PUT body for the Locations members drawer: every checked user (by userId),
 * plus any current member the user list does not show (an inactive user),
 * so a save never silently drops them. De-duplicated, case-insensitive.
 */
export function membersPutBody(users: MemberIdentity[], checkedUserIds: Iterable<string>, members: LocationMember[]): OliverLocationMembers {
  const checked = new Set(Array.from(checkedUserIds, (s) => String(s).toLowerCase()));
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => { const k = id.toLowerCase(); if (!seen.has(k)) { seen.add(k); ids.push(id); } };
  for (const u of users) if (checked.has(String(u.userId).toLowerCase())) push(memberSendId(u, members));
  for (const m of members) if (!users.some((u) => memberIs(m, u))) push(m.tenant_user_id);
  return { tenant_user_ids: ids };
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
