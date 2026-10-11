// useOliverLocations — OLIVER multi-location state for the Portal.
//
// ONE fetch of GET /locations per business per session (module-level store
// keyed by the effective tenant id, view-as aware), shared by the header
// picker and every location-aware page, so a page with three consumers does
// not issue three calls (portal data-fetching convention). The selected
// location ("all" | location_id) lives in the same store — the picker in the
// HeaderBar and the page under it are separate React trees, so plain hook
// state could never keep them in step — and is persisted per business in
// sessionStorage. Switching business (or entering view-as) switches scope,
// which is the reset.
//
// Single-location businesses: `multi` is false, the picker never renders,
// `withLocation()` leaves every path untouched. A missing /locations route
// (backend not deployed yet) or any load error resolves to an empty list —
// same outcome. Nothing changes for them.
//
// Plan: the second location is the catalog row oliver_multi_location
// (2026-10-11: the one feature list; the tier is the catalog's, never written
// here). `canAddLocation` is true for the first location on every plan, true
// when the answer allows the row, and TRUE while it is undecided (adding a
// location is a write: fail open, standing rule since 2026-08-17 — the API
// still refuses underneath). `tierResolved` lets the picker avoid appearing
// for a single-location business whose answer is merely unknown.
// `multiLocationNeeds` is what to buy, in the catalog's words.
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useOliverApi } from "./useOliverApi";
import { useFeatureGate } from "./useFeatureGate";
import { useEffectiveTenantId } from "../lib/tenantContext";
import {
  ALL_LOCATIONS,
  activeLocations,
  defaultLocationOf,
  isMultiLocation,
  locationById,
  normalizeSelection,
  readSelection,
  writeSelection,
  type LocationSelection,
  type OliverLocation,
} from "../lib/oliverLocations";

interface ScopeState {
  locations: OliverLocation[];
  loaded: boolean;
  loading: boolean;
  error: unknown;
  selected: LocationSelection;
}

const EMPTY: ScopeState = { locations: [], loaded: false, loading: false, error: null, selected: ALL_LOCATIONS };
const states = new Map<string, ScopeState>();
const listeners = new Set<() => void>();

function sessionStore(): Storage | null {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; }
}
function stateOf(scope: string): ScopeState {
  return states.get(scope) ?? EMPTY;
}
function setState(scope: string, next: Partial<ScopeState>) {
  states.set(scope, { ...stateOf(scope), ...next });
  for (const fn of listeners) { try { fn(); } catch { /* one bad subscriber must not break the rest */ } }
}

type Getter = <T>(path: string) => Promise<T>;

async function loadScope(scope: string, get: Getter) {
  setState(scope, { loading: true, error: null });
  let list: OliverLocation[] = [];
  let error: unknown = null;
  try {
    // include_inactive: the Locations page shows deactivated rows (INACTIVE
    // badge + Reactivate); every other consumer reads activeLocations.
    const r = await get<OliverLocation[] | { data?: OliverLocation[] }>("/locations?include_inactive=1");
    list = Array.isArray(r) ? r : Array.isArray((r as { data?: OliverLocation[] })?.data) ? (r as { data: OliverLocation[] }).data : [];
  } catch (e) {
    // 404 (route not deployed), 403 (tier/role), network — all mean "no
    // locations to offer"; the page keeps working business-wide.
    error = e;
    list = [];
  }
  setState(scope, {
    locations: list,
    loaded: true,
    loading: false,
    error,
    selected: readSelection(sessionStore(), scope, list),
  });
}

export interface UseOliverLocationsOptions {
  /** Skip the fetch entirely (e.g. the header picker outside OLIVER). Default true. */
  enabled?: boolean;
}

export function useOliverLocations(opts: UseOliverLocationsOptions = {}) {
  const enabled = opts.enabled !== false;
  const { get, ready } = useOliverApi();
  const scope = (useEffectiveTenantId() || "").toLowerCase();
  const featureGate = useFeatureGate();
  const multiEntry = featureGate.entry("oliver_multi_location");
  const tierReady = featureGate.ready;
  const multiAllowed = featureGate.allows("oliver_multi_location", "write");
  const multiLocationNeeds = featureGate.needs("oliver_multi_location");
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);

  useEffect(() => {
    if (!enabled || !ready || !scope) return;
    const st = stateOf(scope);
    if (st.loaded || st.loading) return;
    void loadScope(scope, get);
  }, [enabled, ready, scope, get]);

  const st = stateOf(scope);
  const { locations, loaded, loading, error, selected } = st;

  const setSelected = useCallback((next: LocationSelection) => {
    if (!scope) return;
    const cur = stateOf(scope);
    const norm = normalizeSelection(next, cur.locations);
    writeSelection(sessionStore(), scope, norm);
    if (norm !== cur.selected) setState(scope, { selected: norm });
  }, [scope]);

  const reload = useCallback(async () => {
    if (!scope || !ready) return;
    await loadScope(scope, get);
  }, [scope, ready, get]);

  // Derived arrays keyed on `locations` ONLY — consumers list them in effect
  // deps (Team Access fetches members per active location), so a tier or
  // selection change must not hand them a new identity and refetch.
  const active = useMemo(() => activeLocations(locations), [locations]);
  const defaultLocation = useMemo(() => defaultLocationOf(locations), [locations]);

  return useMemo(() => {
    const multi = isMultiLocation(locations);
    const tierResolved = tierReady && !!multiEntry && multiEntry.allowed !== null;
    const meetsBusiness = multiAllowed; // undecided → fail open (a write)
    // `locations` includes inactive rows — the same count the API's POST gate uses.
    const canAddLocation = locations.length === 0 || meetsBusiness;
    // normalizeSelection already guarantees "all" for a single-location business.
    const selectedLocationId: LocationSelection = multi ? selected : ALL_LOCATIONS;
    return {
      /** Every location the API returned, active or not. */
      locations,
      activeLocations: active,
      defaultLocation,
      /** "all" | location_id. Always "all" until the business has 2+ active locations. */
      selectedLocationId,
      selectedLocation: selectedLocationId === ALL_LOCATIONS ? null : locationById(selectedLocationId, locations),
      setSelected,
      multi,
      canAddLocation,
      tierResolved,
      multiLocationNeeds,
      /** GET /locations has answered (success or failure). */
      ready: loaded,
      loading,
      error,
      reload,
    };
  }, [locations, active, defaultLocation, selected, setSelected, reload, loaded, loading, error, multiEntry, multiAllowed, multiLocationNeeds, tierReady]);
}

export type OliverLocationsState = ReturnType<typeof useOliverLocations>;
