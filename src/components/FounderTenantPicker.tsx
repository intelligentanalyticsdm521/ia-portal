import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, AlertTriangle, Loader2, Siren } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useAppState } from "../app/AppState";
import { useAccessToken } from "../auth/useAccessToken";
import {
  listFounderTenants,
  actAsTenant,
  emergencyActAs,
  type FounderTenant,
} from "../lib/founderApi";
import { selectTenant } from "../lib/platformApi";
import {
  getEmergencyActAsState,
  setEmergencyActAsState,
  subscribeEmergencyActAs,
  type EmergencyActAsState,
} from "../lib/emergencyActAs";

const REASON_MIN_LENGTH = 10;

/**
 * FounderTenantPicker — Design Option C scaffold.
 *
 * Header dropdown rendered ONLY when bootstrap.user.isSuperUser is true.
 * Shows "Acting as: <tenant name> ▾" with a click-to-open list of every
 * tenant in core.tenants. Selecting a tenant:
 *   1. POST /super/tenants/:id/act-as     (audit row + tenant existence check)
 *   2. POST /session/select-tenant        (load services + features for new ctx)
 *   3. setActiveTenantId + setActive in   (every API call now sends new x-tenant-key)
 *      AppState
 *
 * Founder identity is preserved server-side: the JWT still belongs to Brandon.
 * Audit columns + core.tenant_actas_log stamp the founder's user_id alongside
 * the target tenant_id. See routes/admin/superUser.js + migration 092.
 *
 * NON-super-users never see this component — gating is in HeaderBar.tsx.
 */
export function FounderTenantPicker() {
  const { instance: msal } = useMsal();
  const { activeAccount, getToken } = useAccessToken();
  const appState = useAppState();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<FounderTenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Emergency-mode UI state — pill turns red while a session is active.
  const [emergency, setEmergency] = useState<EmergencyActAsState | null>(() =>
    getEmergencyActAsState()
  );
  useEffect(() => {
    return subscribeEmergencyActAs((next) => setEmergency(next));
  }, []);

  // Modal: "Emergency act-as" pre-flight requiring a reason ≥10 chars.
  const [emergencyTarget, setEmergencyTarget] = useState<FounderTenant | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  const activeTenantId = appState.activeTenantId;
  const activeTenantLabel =
    appState.active?.tenant?.tenantFullName ||
    appState.active?.tenant?.tenantName ||
    "(no tenant)";

  // Lazy-load the tenant list the first time the picker opens. Re-load on
  // every open is overkill — refresh button below covers manual refresh.
  useEffect(() => {
    if (!open) return;
    if (tenants.length > 0) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!activeAccount) throw new Error("No active account");
        const res = await listFounderTenants(msal, activeAccount, activeTenantId);
        if (!cancelled) setTenants(res.tenants);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click + Esc close, matching AccountMenu's pattern.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => {
      const a = (t.name || "").toLowerCase();
      const b = (t.full_name || "").toLowerCase();
      const c = (t.primary_contact_email || "").toLowerCase();
      const d = (t.tenant_id || "").toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q);
    });
  }, [tenants, filter]);

  async function handleRefresh() {
    setTenants([]);
    setError(null);
    // Trigger the load effect by closing+reopening.
    if (open) {
      setOpen(false);
      setTimeout(() => setOpen(true), 0);
    }
  }

  async function handleSelect(targetTenantId: string) {
    if (!activeAccount) return;
    if (targetTenantId === activeTenantId) {
      setOpen(false);
      return;
    }
    setSwitchingTo(targetTenantId);
    setError(null);

    try {
      // 1. Audit + validate.
      await actAsTenant(msal, activeAccount, activeTenantId, targetTenantId);

      // 2. Re-fetch active-tenant context (services, features, roles) under
      // the new tenant. Mirrors AppGate's handleSelectTenant flow.
      const { accessToken } = await getToken();
      const selected = await selectTenant({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: accessToken,
        tenantId: targetTenantId,
      });

      appState.setActive(selected);
      appState.setActiveTenantId(targetTenantId);
      setOpen(false);

      // Hard navigate to the overview so per-page caches/data fetched under
      // the old tenant aren't surfaced under the new one. Cheaper than
      // invalidating every useOliverApi/useSparkApi cache by hand.
      window.location.assign("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitchingTo(null);
    }
  }

  function openEmergencyModal(tenant: FounderTenant) {
    setEmergencyTarget(tenant);
    setEmergencyReason("");
    setEmergencyError(null);
    setOpen(false);
  }

  function closeEmergencyModal() {
    setEmergencyTarget(null);
    setEmergencyReason("");
    setEmergencyError(null);
    setEmergencySubmitting(false);
  }

  async function handleConfirmEmergency() {
    if (!activeAccount || !emergencyTarget) return;
    const reason = emergencyReason.trim();
    if (reason.length < REASON_MIN_LENGTH) {
      setEmergencyError(`Reason must be at least ${REASON_MIN_LENGTH} characters.`);
      return;
    }
    setEmergencySubmitting(true);
    setEmergencyError(null);
    try {
      const result = await emergencyActAs(
        msal,
        activeAccount,
        activeTenantId,
        emergencyTarget.tenant_id,
        reason
      );

      // Stash the emergency session so every oliver-api request sends the
      // x-actas-mode: emergency header until expires_at.
      setEmergencyActAsState({
        sessionId: result.session_id ?? 0,
        tenantId: result.tenant_id,
        tenantName: emergencyTarget.full_name || emergencyTarget.name,
        startedAt: result.acting_as.started_at,
        expiresAt: result.expires_at,
        reason,
      });

      // Phase 2 followup #4 — one-shot toast for parity with other flows.
      // The success path navigates immediately to /app/overview, so we stash
      // the message in sessionStorage and let the EmergencyActAsToast picker
      // (mounted in AppShell) render + auto-dismiss it after the navigation.
      try {
        sessionStorage.setItem(
          "iadm.portal.emergencyActAs.toast",
          JSON.stringify({
            kind: "entered",
            tenantLabel: emergencyTarget.full_name || emergencyTarget.name || emergencyTarget.tenant_id,
            at: Date.now(),
          })
        );
      } catch {
        // Storage denied — non-fatal, banner still signals the mode.
      }

      // Also switch active tenant context so the rest of the Portal renders
      // the target tenant's data (read-only) under emergency mode.
      const { accessToken } = await getToken();
      const selected = await selectTenant({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: accessToken,
        tenantId: emergencyTarget.tenant_id,
      });
      appState.setActive(selected);
      appState.setActiveTenantId(emergencyTarget.tenant_id);

      closeEmergencyModal();
      window.location.assign("/app/overview");
    } catch (e) {
      setEmergencyError(e instanceof Error ? e.message : String(e));
      setEmergencySubmitting(false);
    }
  }

  // While in emergency mode the pill flips from amber→red so it's obvious
  // at a glance that we're in the destructive-action-blocked context. The
  // EmergencyActAsBanner above also signals this, but Brandon's scope
  // explicitly calls for the pill to turn red too.
  const pillClass = emergency
    ? "inline-flex items-center gap-2 rounded-md border border-red-300/60 bg-red-500/30 px-3 py-1.5 text-xs font-medium text-red-50 hover:bg-red-500/40 transition-colors"
    : "inline-flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/20 transition-colors";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={pillClass}
        title={
          emergency
            ? "Founder super-user: EMERGENCY (read-only) mode"
            : "Founder super-user: switch active tenant"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {emergency ? (
          <Siren className="h-3.5 w-3.5 text-red-100" aria-hidden="true" />
        ) : null}
        <span className="hidden md:inline opacity-80">
          {emergency ? "Emergency:" : "Acting as:"}
        </span>
        <span className="max-w-[12rem] truncate font-semibold">{activeTenantLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[28rem] max-w-[90vw] rounded-md border border-gray-200 bg-white shadow-xl z-50"
          role="listbox"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Founder · Switch tenant
          </div>

          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name, email, or id…"
              className="w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={handleRefresh}
              className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-gray-700"
              title="Reload tenant list"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tenants…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-6 text-sm text-gray-500">
              No tenants match "{filter}".
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <ul className="max-h-96 overflow-y-auto py-1">
              {filtered.map((t) => {
                const isActive = t.tenant_id === activeTenantId;
                const isSwitching = t.tenant_id === switchingTo;
                return (
                  <li key={t.tenant_id} className="group flex items-stretch">
                    <button
                      type="button"
                      disabled={isSwitching}
                      onClick={() => handleSelect(t.tenant_id)}
                      className={`flex flex-1 items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 ${
                        isActive ? "bg-amber-50" : ""
                      }`}
                    >
                      <div className="mt-0.5 w-4 flex-shrink-0">
                        {isActive && <Check className="h-4 w-4 text-amber-600" />}
                        {isSwitching && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-900">
                            {t.full_name || t.name || "(unnamed)"}
                          </span>
                          {t.is_founder_tenant && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                              Founder
                            </span>
                          )}
                          {t.status && t.status !== "active" && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600">
                              {t.status}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {t.primary_contact_email || t.tenant_id}
                        </div>
                      </div>
                    </button>
                    {/* Emergency act-as — opens the reason modal. Per row so
                        the founder always has both options regardless of
                        which tenant they're currently scoped to. */}
                    <button
                      type="button"
                      onClick={() => openEmergencyModal(t)}
                      disabled={isSwitching}
                      title="Open 30-minute read-only emergency session"
                      className="flex items-center gap-1 border-l border-gray-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Siren className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden lg:inline">Emergency</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-500">
            Founder identity preserved in audit log (core.tenant_actas_log).
            <br />
            Emergency act-as opens a 30-minute READ-ONLY session.
          </div>
        </div>
      )}

      {emergencyTarget && (
        <EmergencyActAsModal
          tenant={emergencyTarget}
          reason={emergencyReason}
          onReasonChange={setEmergencyReason}
          submitting={emergencySubmitting}
          error={emergencyError}
          onCancel={closeEmergencyModal}
          onConfirm={handleConfirmEmergency}
        />
      )}
    </div>
  );
}

interface EmergencyActAsModalProps {
  tenant: FounderTenant;
  reason: string;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function EmergencyActAsModal({
  tenant,
  reason,
  onReasonChange,
  submitting,
  error,
  onCancel,
  onConfirm,
}: EmergencyActAsModalProps) {
  const tenantLabel = tenant.full_name || tenant.name || tenant.tenant_id;
  const trimmedLen = reason.trim().length;
  const tooShort = trimmedLen < REASON_MIN_LENGTH;

  // Esc closes (but not while submitting).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-actas-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-3">
          <Siren className="h-5 w-5 text-red-600" aria-hidden="true" />
          <h2 id="emergency-actas-title" className="text-sm font-semibold text-red-800">
            Emergency act-as · 30-minute READ-ONLY session
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-gray-800">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Target tenant</div>
            <div className="mt-0.5 font-medium">{tenantLabel}</div>
            <div className="text-xs text-gray-500">{tenant.tenant_id}</div>
          </div>
          <div>
            <label htmlFor="emergency-reason" className="text-xs uppercase tracking-wide text-gray-500">
              Reason (required — min {REASON_MIN_LENGTH} chars)
            </label>
            <textarea
              id="emergency-reason"
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Why do you need emergency access? This will be permanently written to the audit log."
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              disabled={submitting}
              maxLength={1000}
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className={tooShort ? "text-red-600" : "text-gray-500"}>
                {trimmedLen}/{REASON_MIN_LENGTH} chars minimum
              </span>
              <span className="text-gray-400">Max 1,000 chars</span>
            </div>
          </div>
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
            <strong>Read-only:</strong> All non-GET requests will be blocked while
            this session is active. To make changes, exit emergency mode first.
            Session auto-revokes after 30 minutes.
          </div>
          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || tooShort}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Siren className="h-3.5 w-3.5" />}
            {submitting ? "Opening…" : "Confirm emergency act-as"}
          </button>
        </div>
      </div>
    </div>
  );
}
