/**
 * brand/BrandKitProvider.tsx — `useBrandKit()`, the one hook every builder reads.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0.
 *
 * ── WHY A CONTEXT AND NOT A PLAIN HOOK ────────────────────────────────────
 * Two reasons, and the second is the one that matters.
 *
 * 1. ONE FETCH. convention_data_fetching: fetch once per page. A builder, its
 *    inspector, a CTA editor and a document frame are four components on one
 *    screen that all want the brand; four copies of a hook would be four
 *    requests on every open.
 *
 * 2. THE ROUND TRIP IS LIVE. Brandon's walk row (GAP_SPRINT_WALK BK-3) is
 *    "change a colour in Brand Identity, a proposal's accent bar and a CTA
 *    button preview change WITHOUT A RELOAD". That only works if the save and
 *    the readers share one piece of state. `save()` writes through
 *    PUT /brand-kit and sets the kit from the response, so every subscriber
 *    repaints in the same React commit.
 *
 * ── WHAT A CONSUMER GETS ──────────────────────────────────────────────────
 *   kit       ALWAYS a complete BrandKit — the neutral one until the first
 *             load returns. No consumer needs a colour of its own, which is the
 *             whole point: the four fallbacks this replaces were all OUR brand.
 *   loaded    false while the neutral is standing in. A page that must not
 *             flash the wrong colour (a document preview) can wait on it; most
 *             do not care.
 *   error     the failure, NAMED. A brand we could not read is not a brand of
 *             slate — Brand Identity says so instead of showing a save that
 *             would overwrite the colours it never managed to read.
 *   save()    partial patch -> the saved kit. Throws so the caller can show the
 *             API's own refusal ("#zzz is not a #RRGGBB colour").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
// getToken(), NOT instance.acquireTokenSilent(). Under VITE_DEV_AUTH=1 there is
// no MSAL session, so a raw acquireTokenSilent throws authority_mismatch and
// the brand never loads in local dev — the exact trap useActiveAccount's own
// header describes for accounts[0]. useAccessToken hands back the dev
// stand-in and the fetch interceptor supplies x-dev-tenant.
import { useAccessToken } from "../auth/useAccessToken";
import { useAppState } from "../app/AppState";
import {
  NEUTRAL_BRAND_KIT,
  getBrandKit,
  saveBrandKit,
  type BrandKit,
  type BrandKitPatch,
} from "../lib/brandKit";

interface BrandKitContextValue {
  kit: BrandKit;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (patch: BrandKitPatch) => Promise<BrandKit>;
}

const BrandKitContext = createContext<BrandKitContextValue | null>(null);

export function BrandKitProvider({ children }: { children: ReactNode }) {
  // activeAccount is the dev stand-in under dev auth and the real account
  // otherwise, so the readiness guard below works in both.
  const { getToken, activeAccount } = useAccessToken();
  const { active } = useAppState();
  const tenantId = active?.tenant?.tenantId ?? null;

  const [kit, setKit] = useState<BrandKit>(NEUTRAL_BRAND_KIT);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setError(null);
    try {
      setKit(await getBrandKit(params));
      setLoaded(true);
    } catch (e) {
      // NAMED, not swallowed into a slate kit. platform-api answers 503 — never
      // a colour — when it cannot read core.tenants, precisely so this can tell
      // "no brand recorded" from "we could not look".
      setError((e as Error).message || "Could not load your brand.");
    } finally {
      setLoading(false);
    }
  }, [callParams]);

  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (patch: BrandKitPatch) => {
    const params = await callParams();
    if (!params) throw new Error("No active business — cannot save the brand kit.");
    const saved = await saveBrandKit({ ...params, patch });
    // One setState, every subscriber repaints: this line IS the no-reload
    // round trip in the walk row.
    setKit(saved);
    setLoaded(true);
    setError(null);
    return saved;
  }, [callParams]);

  const value = useMemo<BrandKitContextValue>(
    () => ({ kit, loaded, loading, error, reload, save }),
    [kit, loaded, loading, error, reload, save],
  );

  return <BrandKitContext.Provider value={value}>{children}</BrandKitContext.Provider>;
}

/**
 * THE brand, for any component inside the app shell.
 *
 * Outside the provider (a public page, a test render) it returns the neutral
 * kit and a save that refuses, rather than throwing: a customer-facing document
 * page must render whatever happens, and a component must never need to know
 * whether it was mounted inside the shell.
 */
export function useBrandKit(): BrandKitContextValue {
  const ctx = useContext(BrandKitContext);
  if (ctx) return ctx;
  return {
    kit: NEUTRAL_BRAND_KIT,
    loaded: false,
    loading: false,
    error: null,
    reload: async () => {},
    save: async () => { throw new Error("Brand kit is not available on this page."); },
  };
}
