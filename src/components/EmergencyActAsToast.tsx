import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * EmergencyActAsToast — Phase 2 followup #4.
 *
 * One-shot success toast shown after the founder enters emergency mode.
 * The FounderTenantPicker writes a sessionStorage entry then hard-navigates
 * to /app/overview, so the regular "set local state, show toast" pattern
 * other forms use (PersonalSettings, etc.) would never get to render.
 *
 * On mount we read the stash, render the toast for 4s, then clear it. If
 * no stash is present the component returns null (zero DOM cost on every
 * page that isn't the one immediately after entry).
 *
 * Pairs with the persistent EmergencyActAsBanner — banner is the always-on
 * state indicator, this toast is the transient confirmation that the action
 * succeeded. Brandon called out the missing parity vs other "saved
 * successfully" flows.
 */

const STORAGE_KEY = "iadm.portal.emergencyActAs.toast";
const VISIBLE_MS = 4_000;
const STALE_MS = 30_000; // ignore stashes older than this (defensive — fresh nav only)

interface ToastData {
  kind: "entered";
  tenantLabel: string;
  at: number;
}

function readAndClearStash(): ToastData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as ToastData;
    if (!parsed || !parsed.at) return null;
    if (Date.now() - parsed.at > STALE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function EmergencyActAsToast() {
  const [data, setData] = useState<ToastData | null>(() => readAndClearStash());

  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => setData(null), VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [data]);

  if (!data) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[80] flex max-w-sm items-start gap-3 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm shadow-2xl"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-gray-900">Emergency mode active</div>
        <div className="mt-0.5 text-xs text-gray-600">
          30-min READ-ONLY session opened against{" "}
          <span className="font-semibold text-gray-900">{data.tenantLabel}</span>.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setData(null)}
        className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
