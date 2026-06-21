import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { AlertTriangle, X } from "lucide-react";
import { useAccessToken } from "../auth/useAccessToken";
import { useAppState } from "../app/AppState";
import {
  getEmergencyActAsState,
  setEmergencyActAsState,
  subscribeEmergencyActAs,
  type EmergencyActAsState,
} from "../lib/emergencyActAs";
import { endActAsSession } from "../lib/founderApi";

/**
 * EmergencyActAsBanner — sticky red header banner shown while the founder
 * has an active 30-minute READ-ONLY emergency act-as session open.
 *
 * Displays:
 *   - Tenant name being acted upon
 *   - "Expires in Xm:Ys" countdown that ticks every second
 *   - "Exit emergency mode" button that POSTs /super/end-session
 *
 * Hidden when no emergency session is active. Survives page reload via the
 * sessionStorage mirror in lib/emergencyActAs.ts.
 */
function formatRemaining(expiresAt: string): { mm: string; ss: string; expired: boolean } {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return { mm: "00", ss: "00", expired: true };
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    mm: String(m).padStart(2, "0"),
    ss: String(s).padStart(2, "0"),
    expired: false,
  };
}

export function EmergencyActAsBanner() {
  const { instance: msal } = useMsal();
  const { activeAccount } = useAccessToken();
  const appState = useAppState();
  const [state, setState] = useState<EmergencyActAsState | null>(() => getEmergencyActAsState());
  const [, setTick] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to global state changes (e.g. when the picker triggers a new
  // emergency session or another tab ends it via storage event).
  useEffect(() => {
    const unsub = subscribeEmergencyActAs((next) => setState(next));
    return unsub;
  }, []);

  // 1-second tick for the countdown. Only runs while a session is active.
  useEffect(() => {
    if (!state) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      // Self-evict once we cross the deadline so the banner disappears even
      // if the user never clicks "exit". The getEmergencyActAsState read
      // also clears stale state on first access.
      if (Date.parse(state.expiresAt) <= Date.now()) {
        setEmergencyActAsState(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  async function handleExit() {
    if (!activeAccount) return;
    setExiting(true);
    setError(null);
    try {
      await endActAsSession(msal, activeAccount, appState.activeTenantId);
      setEmergencyActAsState(null);
      // Hard navigate so any in-flight read-only state is replaced cleanly.
      window.location.assign("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExiting(false);
    }
  }

  if (!state) return null;

  const remaining = formatRemaining(state.expiresAt);

  return (
    <div
      role="alert"
      className="w-full bg-red-600 text-white shadow-md border-b border-red-800"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-200" aria-hidden="true" />
          <div className="min-w-0 text-sm leading-tight">
            <div className="font-semibold">
              EMERGENCY MODE — read-only
            </div>
            <div className="truncate text-xs text-red-100">
              Acting on{" "}
              <span className="font-semibold">
                {state.tenantName || state.tenantId}
              </span>
              {" · expires in "}
              <span className="font-mono font-semibold tabular-nums">
                {remaining.mm}m:{remaining.ss}s
              </span>
              {state.reason ? (
                <span className="hidden md:inline">
                  {" · reason: "}
                  <span className="italic">{state.reason.slice(0, 80)}{state.reason.length > 80 ? "…" : ""}</span>
                </span>
              ) : null}
            </div>
            {error ? (
              <div className="mt-1 text-xs text-yellow-200">{error}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleExit}
          disabled={exiting}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          {exiting ? "Exiting…" : "Exit emergency mode"}
        </button>
      </div>
    </div>
  );
}
