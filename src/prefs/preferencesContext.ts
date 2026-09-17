/**
 * prefs/preferencesContext.ts — the context and `usePreference()`, with no auth
 * in them.
 *
 * D-154. This is split from `PreferencesProvider.tsx` for one reason and it is
 * not taste: the PROVIDER has to import `useAccessToken`, which reaches
 * `msalConfig` and `import.meta.env`, and `node --test` has neither. The
 * builder engine is under test (`repeatKeyFor` is imported straight out of
 * `BuilderShell.tsx`), so anything the engine imports has to stay clear of
 * MSAL — the rule scripts/test-ts-loader.mjs states in its header.
 *
 * So READERS import this file and the app root imports the provider. One
 * mechanism still, in two files: there is exactly one context object, created
 * here, and the provider fills it.
 */
import { createContext, useCallback, useContext } from "react";
import {
  PREFERENCE_DEFAULTS,
  resolvePreference,
  type PreferenceKey,
  type PreferenceMap,
  type PreferenceValue,
} from "../lib/userPreferences";

export interface PreferencesContextValue {
  /** What the server said. Empty until the first load returns. */
  server: PreferenceMap;
  /** The last known answers, read synchronously at mount so the first paint is right. */
  cache: PreferenceMap;
  /** false while the first load is still out. */
  loaded: boolean;
  /** false when the store is not there yet — saving will be refused, honestly. */
  available: boolean;
  /** The failure, NAMED. Never a silently-defaulted switch. */
  error: string | null;
  set: (key: PreferenceKey, value: PreferenceValue) => Promise<void>;
  reload: () => Promise<void>;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export interface UsePreferenceResult {
  value: PreferenceValue;
  set: (next: PreferenceValue) => Promise<void>;
  loaded: boolean;
  available: boolean;
  error: string | null;
}

/**
 * ONE switch, for any component inside the app shell.
 *
 * Outside the provider — a public page, a test render — it returns the built-in
 * default and a `set` that refuses, rather than throwing: a component must
 * never need to know whether it was mounted inside the shell.
 *
 * `fallback` overrides the built-in default at this call site, for a caller
 * that wants to be explicit about what "never said" means to it.
 */
export function usePreference(key: PreferenceKey, fallback?: PreferenceValue): UsePreferenceResult {
  const ctx = useContext(PreferencesContext);
  const setter = ctx?.set;
  const set = useCallback(
    async (next: PreferenceValue) => {
      if (!setter) throw new Error("Settings are not available on this page.");
      await setter(key, next);
    },
    [setter, key],
  );

  if (!ctx) {
    return {
      value: fallback ?? PREFERENCE_DEFAULTS[key],
      set,
      loaded: false,
      available: false,
      error: null,
    };
  }

  const neverSaid =
    typeof ctx.server[key] !== "boolean" && typeof ctx.cache[key] !== "boolean";

  return {
    value: neverSaid && fallback !== undefined
      ? fallback
      : resolvePreference(key, ctx.server, ctx.cache),
    set,
    loaded: ctx.loaded,
    available: ctx.available,
    error: ctx.error,
  };
}
