// lib/consultingSession.ts — IA operator "acting tenant" session.
//
// When an IA platform admin / consultant picks a client in the switcher, we
// store the client's tenant id here. Every product API request then sends it
// as the `x-acting-tenant` header; the server re-validates the operator's
// authorization on EVERY request (the header is never trusted alone) and,
// when valid, rewrites the request's tenant to the client + audits it.
const KEY = "ia_acting_tenant";
const NAME_KEY = "ia_acting_tenant_name";
const ENG_KEY = "ia_acting_engagement";

export function getActingTenant(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function getActingTenantName(): string | null {
  try { return localStorage.getItem(NAME_KEY); } catch { return null; }
}
export function getActingEngagement(): string | null {
  try { return localStorage.getItem(ENG_KEY); } catch { return null; }
}
export function setActingTenant(tenantId: string, name?: string, engagementId?: string) {
  try {
    localStorage.setItem(KEY, tenantId);
    if (name) localStorage.setItem(NAME_KEY, name);
    if (engagementId) localStorage.setItem(ENG_KEY, engagementId);
    else localStorage.removeItem(ENG_KEY);
  } catch { /* ignore */ }
}
export function clearActingTenant() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ENG_KEY);
  } catch { /* ignore */ }
}

/** Headers to merge into every product API request. */
export function consultingHeaders(): Record<string, string> {
  const t = getActingTenant();
  if (!t) return {};
  const h: Record<string, string> = { "x-acting-tenant": t };
  const e = getActingEngagement();
  if (e) h["x-engagement-id"] = e;
  return h;
}
