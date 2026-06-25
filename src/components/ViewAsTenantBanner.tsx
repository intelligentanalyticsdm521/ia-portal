import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import {
  getViewAsTenantState,
  exitViewAsTenant,
  subscribeViewAsTenant,
  type ViewAsTenantState,
} from "../lib/viewAsTenant";

/**
 * ViewAsTenantBanner — slim slate banner rendered above the AppShell while
 * the founder is viewing a client's portal read-only.
 *
 * Differs from EmergencyActAsBanner intentionally:
 *   - Color: slate, NOT red. This is a routine walk-through tool, not a
 *     break-glass surface.
 *   - No countdown. There is no expiry; only the Exit button drops the
 *     session.
 *   - No reason field on entry, no audit row per request.
 *
 * Returns null when not in view-as mode. Survives reload via the localStorage
 * mirror in lib/viewAsTenant.ts.
 */
export function ViewAsTenantBanner() {
  const [state, setState] = useState<ViewAsTenantState | null>(() => getViewAsTenantState());

  useEffect(() => {
    const unsub = subscribeViewAsTenant((next) => setState(next));
    return unsub;
  }, []);

  function handleExit() {
    exitViewAsTenant();
    // Hard reload so any client-tenant-scoped data in memory is replaced by
    // the founder's own iadm tenant state. Lighter than the emergency banner's
    // full /app/overview navigation — but still a reload so all the per-page
    // useEffect data-fetches re-run cleanly.
    window.location.reload();
  }

  if (!state) return null;

  return (
    <div
      role="status"
      aria-label="Viewing tenant in read-only mode"
      className="w-full border-b border-slate-700 bg-slate-800 text-slate-100 shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Eye className="h-4 w-4 flex-shrink-0 text-slate-300" aria-hidden="true" />
          <div className="min-w-0 text-sm leading-tight">
            Viewing as{" "}
            <span className="font-semibold text-white">{state.tenantName}</span>
            <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
              read-only
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-slate-500/50 bg-slate-700/50 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-600/60"
        >
          <X className="h-3.5 w-3.5" />
          Exit
        </button>
      </div>
    </div>
  );
}
