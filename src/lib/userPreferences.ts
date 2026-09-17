/**
 * lib/userPreferences.ts — the person's own switches, and where they live.
 *
 * D-154 (Brandon, 2026-09-17): "lets keep it unless they mark don't show me
 * this again. Like add a little checkbox with that. Then we'll probably need a
 * like tutorials setting somewhere in the global settings that they can turn
 * on/off tutorials like our initial walkthrough, onboarding if they want to go
 * through onboarding again, or these builder tutorials."
 *
 * ── THE SERVER IS THE ANSWER; localStorage IS A CACHE ─────────────────────
 * Every personal switch on this platform used to BE a localStorage key — the
 * builder's welcome box, the completed walkthroughs, the guided-tour flags.
 * That is not a preference, it is a note in one browser: a second computer, a
 * second browser or a cleared cache and the person is asked again.
 *
 * So: core.user_preference through platform-api is the truth, and the cache
 * exists for exactly one reason — the first paint. A builder opens the instant
 * a button is pressed; a box that waits for a round trip to decide whether to
 * appear is a box that appears late, on top of work already in progress. The
 * cache lets the last known answer paint immediately and the server correct it
 * a moment later. `resolvePreference` is that rule, written once:
 *
 *   server value  →  cached value  →  built-in default
 *
 * `localStorage` throws in a private window and comes back empty after a clear,
 * so every read and write is wrapped and the app is correct either way — worst
 * case somebody is shown three sentences one more time.
 *
 * ── ONE LIST, TWO REPOS ───────────────────────────────────────────────────
 * platform-api/lib/userPreferences.js holds the same two keys and the same two
 * defaults, and a test in each repo asserts the lists match. A key added on one
 * side only would save nothing, quietly, forever.
 */

import { emergencyActAsHeaders } from "./emergencyActAs";

/** Every switch a person owns, with the value to use when they have never said. */
export const PREFERENCE_DEFAULTS = {
  /** The guided welcome walk-through, on first sign-in. */
  "tutorials.welcomeWalkthrough": true,
  /** The builder's welcome box, on every builder open. */
  "tutorials.builderTips": true,
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_DEFAULTS;
export type PreferenceValue = boolean;
export type PreferenceMap = Partial<Record<PreferenceKey, PreferenceValue>>;

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_DEFAULTS) as PreferenceKey[];

export function isPreferenceKey(key: string): key is PreferenceKey {
  return Object.prototype.hasOwnProperty.call(PREFERENCE_DEFAULTS, key);
}

/**
 * THE resolution rule. Server wins; the cache stands in until the server has
 * answered; the built-in default stands in for both.
 */
export function resolvePreference(
  key: PreferenceKey,
  server: PreferenceMap | null | undefined,
  cache: PreferenceMap | null | undefined,
): PreferenceValue {
  const fromServer = server?.[key];
  if (typeof fromServer === "boolean") return fromServer;
  const fromCache = cache?.[key];
  if (typeof fromCache === "boolean") return fromCache;
  return PREFERENCE_DEFAULTS[key];
}

/** Keep only keys we know and values we can use. A stale cache cannot poison the app. */
export function sanitisePreferences(raw: unknown): PreferenceMap {
  const out: PreferenceMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isPreferenceKey(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

/* ── The cache ─────────────────────────────────────────────────────────── */

/** One key for the whole bag. Versioned, so a changed shape starts clean. */
export const PREFERENCE_CACHE_KEY = "iadm.user_preferences.v1";

export function readPreferenceCache(store?: Pick<Storage, "getItem">): PreferenceMap {
  try {
    const s = store ?? (typeof localStorage === "undefined" ? null : localStorage);
    const raw = s?.getItem(PREFERENCE_CACHE_KEY);
    return raw ? sanitisePreferences(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writePreferenceCache(prefs: PreferenceMap, store?: Pick<Storage, "setItem">): void {
  try {
    const s = store ?? (typeof localStorage === "undefined" ? null : localStorage);
    s?.setItem(PREFERENCE_CACHE_KEY, JSON.stringify(sanitisePreferences(prefs)));
  } catch {
    /* a private window is not a reason to fail a save */
  }
}

/* ── platform-api ──────────────────────────────────────────────────────── */

export interface PreferencesResponse {
  preferences: PreferenceMap;
  /** false when the store is not there yet — saving will be refused, honestly. */
  available: boolean;
}

function normaliseBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function headers(bearerToken: string, tenantId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "x-tenant-key": tenantId,
    ...emergencyActAsHeaders(),
  };
}

export async function getPreferences(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<PreferencesResponse> {
  const res = await fetch(`${normaliseBaseUrl(params.baseUrl)}/me/preferences`, {
    method: "GET",
    headers: headers(params.bearerToken, params.tenantId),
  });
  if (!res.ok) throw new Error(`Could not read your preferences (${res.status})`);
  const body = (await res.json()) as { preferences?: unknown; available?: unknown };
  return {
    preferences: sanitisePreferences(body?.preferences),
    available: body?.available !== false,
  };
}

/**
 * Save ONE switch. Throws on refusal so the caller can say so — a save that
 * swallows its own failure is how a switch springs back with no explanation.
 */
export async function putPreference(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  key: PreferenceKey;
  value: PreferenceValue;
}): Promise<PreferenceValue> {
  const url = `${normaliseBaseUrl(params.baseUrl)}/me/preferences/${encodeURIComponent(params.key)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(params.bearerToken, params.tenantId),
    body: JSON.stringify({ value: params.value }),
  });
  if (!res.ok) {
    let message = `Could not save that setting (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* the status is enough */
    }
    throw new Error(message);
  }
  const body = (await res.json()) as { value?: unknown };
  return typeof body?.value === "boolean" ? body.value : params.value;
}
