/**
 * useWalkthrough — fires the first-login walkthrough once per (user, tenant).
 *
 * Brandon's 2026-06-17 rule: walkthrough triggers on first CIAM login after
 * onboarding finished; replayable from a help menu; dismissable.
 *
 * Server: oliver-api /onboarding/walkthrough-state + /walkthrough-mark
 * Schema: oliver.user_first_login (migration 076)
 *
 * Returns:
 *   shouldShow — true on first login OR after replay
 *   markCompleted() — user finished the joyride
 *   markDismissed() — user closed it without finishing
 *   replay() — user clicked "show me the tour again" in help menu
 *
 * Joyride/Shepherd was installed in task #152. This hook is the
 * decide-when-to-fire layer on top.
 */
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "./useOliverApi";

interface WalkthroughState {
  is_first_login?: boolean;
  completed_at?: string | null;
  dismissed_at?: string | null;
  last_replayed_at?: string | null;
}

export function useWalkthrough() {
  const { get, post, ready } = useOliverApi();
  const [state, setState] = useState<WalkthroughState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<{ data: WalkthroughState }>("/onboarding/walkthrough-state")
      .then((r) => { if (!cancelled) setState((r as { data: WalkthroughState })?.data || null); })
      .catch(() => { if (!cancelled) setState(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [ready, get]);

  const markSeen = useCallback(async () => {
    try { await post("/onboarding/walkthrough-mark", { action: "seen" }); }
    catch { /* best-effort */ }
  }, [post]);

  const markCompleted = useCallback(async () => {
    try { await post("/onboarding/walkthrough-mark", { action: "completed" }); }
    catch { /* best-effort */ }
    setState((s) => ({ ...(s || {}), completed_at: new Date().toISOString() }));
  }, [post]);

  const markDismissed = useCallback(async () => {
    try { await post("/onboarding/walkthrough-mark", { action: "dismissed" }); }
    catch { /* best-effort */ }
    setState((s) => ({ ...(s || {}), dismissed_at: new Date().toISOString() }));
  }, [post]);

  const replay = useCallback(async () => {
    try { await post("/onboarding/walkthrough-mark", { action: "replay" }); }
    catch { /* best-effort */ }
    setState((s) => ({ ...(s || {}), completed_at: null, dismissed_at: null, last_replayed_at: new Date().toISOString() }));
  }, [post]);

  // Show on first login OR when user explicitly replayed and hasn't yet finished.
  const shouldShow = loaded && state ? (
    state.is_first_login === true ||
    (state.last_replayed_at && !state.completed_at && !state.dismissed_at)
  ) : false;

  return { loaded, state, shouldShow, markSeen, markCompleted, markDismissed, replay };
}
