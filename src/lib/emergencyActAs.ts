/**
 * emergencyActAs.ts — Founder super-user "Emergency act-as" client state.
 *
 * The Portal needs to attach `x-actas-mode: emergency` to every oliver-api
 * request while a 30-min read-only emergency session is open. We can't do
 * that from React context alone because the non-hook API clients
 * (oliverApi.ts, arionApi.ts, etc.) need to read it on every fetch. So this
 * module is a tiny global store + subscription bus, persisted to
 * sessionStorage so a page reload doesn't drop the session before the
 * expires_at.
 *
 * Sources of truth:
 *   1. Backend (core.tenant_actas_log) — authoritative.
 *   2. This module — UI mirror. Hydrated on Portal bootstrap by calling
 *      getCurrentActAsSession(); evicted when expires_at passes; cleared by
 *      endActAsSession().
 */

const STORAGE_KEY = "iadm.portal.emergencyActAs.v1";

export interface EmergencyActAsState {
  /** core.tenant_actas_log.actas_log_id */
  sessionId: number;
  /** Tenant being acted upon. */
  tenantId: string;
  tenantName?: string | null;
  /** ISO timestamp (UTC). Stops applying when now > expiresAt. */
  expiresAt: string;
  /** ISO timestamp (UTC). */
  startedAt: string;
  /** Brandon's typed reason for opening the emergency session. */
  reason: string | null;
}

type Listener = (state: EmergencyActAsState | null) => void;

let currentState: EmergencyActAsState | null = loadFromStorage();
const listeners = new Set<Listener>();

function loadFromStorage(): EmergencyActAsState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmergencyActAsState;
    if (!parsed.expiresAt) return null;
    // Drop if already expired — don't keep sending the header.
    if (Date.parse(parsed.expiresAt) < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: EmergencyActAsState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage denied (e.g. private mode) — in-memory only is OK; banner still
    // works during this page lifetime.
  }
}

function notify() {
  for (const l of listeners) {
    try {
      l(currentState);
    } catch (err) {
      console.warn("[emergencyActAs] listener threw:", err);
    }
  }
}

/**
 * Read the current emergency session. Returns null when not in emergency
 * mode OR when the session has expired (auto-clears on read in that case).
 *
 * This is the function the non-hook API clients call to decide whether to
 * attach the x-actas-mode header.
 */
export function getEmergencyActAsState(): EmergencyActAsState | null {
  if (!currentState) return null;
  if (Date.parse(currentState.expiresAt) < Date.now()) {
    // Self-clear once the deadline passes so callers stop sending the
    // header. The Portal banner's countdown effect will also fire
    // setEmergencyActAsState(null), but this read-side guard prevents stale
    // header injections in the window between expiry and effect re-render.
    currentState = null;
    persist(null);
    notify();
    return null;
  }
  return currentState;
}

/** True if we should attach x-actas-mode: emergency to oliver-api requests. */
export function isInEmergencyMode(): boolean {
  return getEmergencyActAsState() !== null;
}

/**
 * Replace (or clear) the active emergency session. Pass null to end the
 * session — callers should also POST /super/end-session so the backend row
 * is closed.
 */
export function setEmergencyActAsState(state: EmergencyActAsState | null): void {
  currentState = state;
  persist(state);
  notify();
}

/** Subscribe to state changes. Returns the unsubscribe function. */
export function subscribeEmergencyActAs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Convenience header builder. Returns { 'x-actas-mode': 'emergency' } when
 * in emergency mode, empty object otherwise. Spread into fetch headers.
 */
export function emergencyActAsHeaders(): Record<string, string> {
  return isInEmergencyMode() ? { "x-actas-mode": "emergency" } : {};
}
