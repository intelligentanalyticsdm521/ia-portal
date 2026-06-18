// ClientTenantModal — single modal for working in a client tenant.
//
// Two modes:
//   onboarding  → wizard: profile/owner/products/finish for a tenant the
//                 founder is setting up. Welcome email fires at the end.
//   consulting  → skinnied portal: Insights / Campaigns / Segments /
//                 Automations / Templates etc. for ongoing client work.
//
// Architecture:
//   - The modal wraps its children in <ClientTenantProvider value={...}>
//   - useOliverApi / useSparkApi / useArionApi read that context
//   - Every API call from within the modal goes to the CLIENT tenant
//   - Closing the modal drops the context → API calls revert to your iadm
//   - Server enforces founder authorization (membership in iadm tenant
//     bypasses the client-tenant membership check)
//
// No localStorage, no banner, no acting-tenant session.
import { useEffect, useState } from "react";
import { IadmModal } from "../IadmModal";
import { ClientTenantProvider, type ClientTenantValue } from "../../lib/clientTenantContext";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Building2 } from "lucide-react";

export interface ClientTenantModalProps {
  open: boolean;
  tenantId: string | null;
  tenantName?: string;
  mode: "onboarding" | "consulting";
  onClose: () => void;
}

interface TenantSummary {
  tenant_id: string;
  business_name?: string;
  primary_contact_email?: string;
  signup_product?: string | null;
  billing_cycle?: string | null;
  onboarding_step?: number | null;
  onboarding_completed_at?: string | null;
}

export function ClientTenantModal({ open, tenantId, tenantName, mode, onClose }: ClientTenantModalProps) {
  if (!open || !tenantId) return null;

  const ctx: ClientTenantValue = {
    tenantId,
    tenantName,
    mode,
  };

  return (
    <ClientTenantProvider value={ctx}>
      <IadmModal
        open={open}
        onClose={onClose}
        product="oliver"
        eyebrow={mode === "onboarding" ? "Client Onboarding" : "Client Workspace"}
        title={tenantName || "Client tenant"}
        subtitle={mode === "onboarding"
          ? "Set up this client's profile + products. Welcome email goes out at Save & Finish."
          : "Create campaigns, segments, automations, templates. All work attributed to you in audit logs."}
        size="info"
        footer={
          <div className="flex justify-end w-full">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm">
              Close
            </button>
          </div>
        }
      >
        <div className="px-6 py-5">
          {mode === "onboarding" ? <OnboardingModeBody tenantId={tenantId} /> : <ConsultingModeBody tenantId={tenantId} />}
        </div>
      </IadmModal>
    </ClientTenantProvider>
  );
}

// ─── Onboarding mode ──────────────────────────────────────────────────────

function OnboardingModeBody({ tenantId }: { tenantId: string }) {
  // Operating AS the client tenant: every API call hits oliver-api with
  // x-tenant-key set to this tenant_id (via ClientTenantContext).
  const { get } = useOliverApi();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch the tenant's own settings — confirms the API auth works against the client.
    get<TenantSummary>("/settings/business-profile")
      .then((r) => { if (!cancelled) setTenant(r as TenantSummary); })
      .catch((e) => { if (!cancelled) setErr((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, get]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <div className="font-bold text-emerald-900 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Working in client tenant
        </div>
        <div className="text-xs text-emerald-800 mt-1">
          Tenant ID <code className="text-[10px]">{tenantId}</code>. Every save below writes to THIS tenant, not yours.
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading client profile…</div>}
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      {tenant && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Client profile</div>
          <div className="text-sm"><strong>Business:</strong> {tenant.business_name || "—"}</div>
          <div className="text-sm"><strong>Contact:</strong> {tenant.primary_contact_email || "—"}</div>
          <div className="text-sm"><strong>Product purchased:</strong> {tenant.signup_product || "—"} ({tenant.billing_cycle || "—"})</div>
          <div className="text-sm"><strong>Onboarding step:</strong> {tenant.onboarding_step ?? "not started"}</div>
          <div className="text-sm"><strong>Completed at:</strong> {tenant.onboarding_completed_at ? new Date(tenant.onboarding_completed_at).toLocaleString() : "—"}</div>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Next build phase:</strong> the onboarding step components (business profile editor,
        owner identity, per-product setup forms — ARION/SPARK/OLIVER) get rendered here. Each writes
        to the client tenant via the same API hooks. For tonight, this confirms the founder→client
        passthrough works end-to-end.
      </div>
    </div>
  );
}

// ─── Consulting mode ──────────────────────────────────────────────────────

function ConsultingModeBody({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm">
        <div className="font-bold text-sky-900">Client workspace</div>
        <div className="text-xs text-sky-800 mt-1">
          You're operating inside <code className="text-[10px]">{tenantId}</code>. Coming in this view:
          sidebar with SPARK Campaigns / Segments / Automations / Templates / Newsletter / Forms / Leads + AI Writer,
          and OLIVER Automations / Templates. Audit columns stamp your identity.
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
        Next build phase: each section's existing Portal page renders here. Same components,
        scoped to this client via the tenant override on every API hook.
      </div>
    </div>
  );
}

export default ClientTenantModal;
