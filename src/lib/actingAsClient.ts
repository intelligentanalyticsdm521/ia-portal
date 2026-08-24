/**
 * actingAsClient — one answer to "is this founder currently operating inside a
 * client's tenant?", shared by AppShell (which nav to show) and AppLayout
 * (which tenant to scope API calls to).
 *
 * These two used to decide independently, and both keyed only on the
 * consultant-workspace sessionStorage flag that `/c/:tid` sets. A founder who
 * reached a client tenant any other legitimate way — notably the "Switch
 * Tenant" control on the access-error screen — carried no flag and landed in a
 * hybrid state: FORGE read `activeTenantId` directly and showed the client's
 * data, while Consulting routed to the founder Clients board and the
 * OLIVER-family clients fell back to the founder's own tenant. The client's
 * projects, deliverables and work tasks were nowhere to be found even though
 * the rest of the portal was clearly inside their tenant.
 *
 * Keeping the rule in one place is the point: if nav and API scoping can
 * disagree, eventually they will, and the symptom is a page that looks like
 * the client's while the data underneath is someone else's.
 */

const WORKSPACE_FLAG_KEY = 'iadm.portal.consultantWorkspace.v1';

/** True when the founder explicitly opened a client workspace via /c/:tid. */
export function hasConsultantWorkspaceFlag(): boolean {
  try {
    return sessionStorage.getItem(WORKSPACE_FLAG_KEY) === 'true';
  } catch {
    return false; // private mode — fall back to the tenant comparison
  }
}

/**
 * @param isFounder       from /session/verify — user.isFounder
 * @param activeTenantId  the tenant the portal is currently pointed at
 * @param homeTenantId    from /session/verify — for IA team this is always the
 *                        founder tenant, so in Brandon's own portal the two ids
 *                        are equal and nothing changes. This comparison is what
 *                        the 2026-06-28 regression was missing: a bare
 *                        "activeTenantId looks different" check had nothing
 *                        trustworthy to compare against and wrongly stripped
 *                        founder nav inside the IA tenant.
 */
export function isActingAsClient(
  isFounder: boolean,
  activeTenantId: string | null | undefined,
  homeTenantId: string | null | undefined
): boolean {
  if (hasConsultantWorkspaceFlag()) return true;
  // Both ids must be settled, so this cannot fire while bootstrap is resolving.
  if (!isFounder || !activeTenantId || !homeTenantId) return false;
  return activeTenantId.toLowerCase() !== homeTenantId.toLowerCase();
}
