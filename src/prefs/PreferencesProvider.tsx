/**
 * prefs/PreferencesProvider.tsx — the one fetch behind `usePreference()`.
 *
 * D-154. Modelled on BrandKitProvider and for the same two reasons:
 *
 * 1. ONE FETCH. convention_data_fetching. The Tutorials page reads two
 *    switches, the builder reads one, and a builder can be opened from six
 *    places; a hook that fetched per caller would be a request per component on
 *    every open.
 *
 * 2. THE ROUND TRIP IS LIVE. The walk row is "turn Builder tips back on in
 *    Settings, open a builder, the box is back" — WITHOUT a reload. That only
 *    works if the switch and its readers share one piece of state, which is
 *    what `set()` writing through and then setting the map does.
 *
 * The context object and the hook are `preferencesContext.ts`, not this file:
 * this one imports `useAccessToken` and therefore MSAL, and the builder engine
 * is under `node --test`. See that file's header.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
// getToken(), NOT instance.acquireTokenSilent(): under VITE_DEV_AUTH=1 there is
// no MSAL session and a raw acquireTokenSilent throws authority_mismatch, so
// nothing would ever load in local dev. The same trap BrandKitProvider names.
import { useAccessToken } from "../auth/useAccessToken";
import { useAppState } from "../app/AppState";
import { PreferencesContext, type PreferencesContextValue } from "./preferencesContext";
import {
  getPreferences,
  putPreference,
  readPreferenceCache,
  writePreferenceCache,
  type PreferenceKey,
  type PreferenceMap,
  type PreferenceValue,
} from "../lib/userPreferences";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { getToken, activeAccount } = useAccessToken();
  const { active } = useAppState();
  const tenantId = active?.tenant?.tenantId ?? null;

  // Read once, synchronously, BEFORE the first paint. This is the whole reason
  // the cache exists: a builder opened on the next click must already know
  // whether this person turned the tips off.
  const [cache, setCache] = useState<PreferenceMap>(() => readPreferenceCache());
  const [server, setServer] = useState<PreferenceMap>({});
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const callParams = useCallback(async () => {
    if (!activeAccount || !tenantId) return null;
    const res = await getToken();
    return {
      baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
      bearerToken: res.accessToken,
      tenantId,
    };
  }, [getToken, activeAccount, tenantId]);

  const reload = useCallback(async () => {
    const params = await callParams();
    if (!params) return;
    try {
      const r = await getPreferences(params);
      setServer(r.preferences);
      setAvailable(r.available);
      setError(null);
      // The cache is only ever written from a server answer, so it can never
      // hold a value the server has not agreed to.
      setCache(r.preferences);
      writePreferenceCache(r.preferences);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message || "Could not read your settings.");
    }
  }, [callParams]);

  useEffect(() => { void reload(); }, [reload]);

  const set = useCallback(async (key: PreferenceKey, value: PreferenceValue) => {
    const params = await callParams();
    if (!params) throw new Error("Not signed in — cannot save that setting.");
    // Throws on a refusal, and the caller shows it. A save that swallows its
    // own failure is how a switch springs back with no explanation.
    const saved = await putPreference({ ...params, key, value });
    // One setState and every reader repaints in the same commit — the builder
    // that opens next already knows.
    setServer((prev) => {
      const next = { ...prev, [key]: saved };
      setCache(next);
      writePreferenceCache(next);
      return next;
    });
    setError(null);
  }, [callParams]);

  const value = useMemo<PreferencesContextValue>(
    () => ({ server, cache, loaded, available, error, set, reload }),
    [server, cache, loaded, available, error, set, reload],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export { usePreference } from "./preferencesContext";
export default PreferencesProvider;
