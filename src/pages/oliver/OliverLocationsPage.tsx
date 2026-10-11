// OliverLocationsPage — Settings → OLIVER → Locations.
//
// Every business has one default location (auto-created + backfilled
// server-side) which is viewable and editable on every plan; the SECOND
// location is the catalog row oliver_multi_location. The "Add location"
// button locks when the plan answer refuses that row and names the catalog's
// `needs` (useOliverLocations().multiLocationNeeds), the same words the nav
// wall uses — the API refuses underneath regardless.
//
// Hide-not-delete: "Deactivate" is the only removal. A location that still
// owns jobs or workers asks where they should move first (reassign_to).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Lock, MapPin, Plus, Star, Users } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { useOliverRole } from "../../hooks/useOliverRole";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, DataTable, EmptyState, Button, type Column } from "../../components/oliver/ui";
import { productColor } from "../../config/productTheme";
import {
  isLocationTierError,
  isMemberOf,
  locationAddressLine,
  locationNeedsReassign,
  locationUsageLabel,
  membersPutBody,
  parseMembers,
  type LocationMember,
  type OliverLocation,
  type OliverLocationInput,
  type OliverLocationMembers,
} from "../../lib/oliverLocations";

const OLIVER = productColor("oliver");

// Enough for a US field-service business; the input is free text for anything else.
const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
  "America/Vancouver", "Europe/London", "Australia/Sydney",
];

/** GET /tenant-users row. `tenantUserId` (core.tenant_users) is what /members stores — see MemberIdentity. */
interface TenantUser {
  userId: string;
  tenantUserId?: string | null;
  email: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export function OliverLocationsPage() {
  const { get, post, patch, put, del, ready } = useOliverApi();
  const loc = useOliverLocations();
  const { roleInfo } = useOliverRole();
  const isAdmin = roleInfo.role === "admin";

  const [editing, setEditing] = useState<OliverLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<OliverLocation | null>(null);
  const [reassign, setReassign] = useState<OliverLocation | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function toast(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  function fail(e: unknown, fallback: string) {
    if (isLocationTierError(e)) { setShowUpgrade(true); return; }
    setActionError(e instanceof Error ? e.message : fallback);
  }

  const rows = useMemo(
    () => [...loc.locations].sort((a, b) => Number(b.is_default) - Number(a.is_default) || Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)),
    [loc.locations],
  );
  const activeCount = loc.activeLocations.length;

  function onAddClick() {
    if (!loc.canAddLocation) { setShowUpgrade(true); return; }
    setCreating(true);
  }

  async function setDefault(l: OliverLocation) {
    setBusyId(l.location_id); setActionError(null);
    try {
      await post(`/locations/${l.location_id}/default`);
      await loc.reload();
      toast(`"${l.name}" is now the default location.`);
    } catch (e) { fail(e, "Could not set the default location."); }
    finally { setBusyId(null); }
  }

  async function reactivate(l: OliverLocation) {
    setBusyId(l.location_id); setActionError(null);
    try {
      await patch(`/locations/${l.location_id}`, { is_active: true } satisfies OliverLocationInput);
      await loc.reload();
      toast(`"${l.name}" reactivated.`);
    } catch (e) { fail(e, "Could not reactivate the location."); }
    finally { setBusyId(null); }
  }

  function startDeactivate(l: OliverLocation) {
    setActionError(null);
    if (l.is_default) {
      setActionError("This is the default location. Make another location the default before deactivating it.");
      return;
    }
    if (locationNeedsReassign(l)) { setReassign(l); return; }
    if (!confirm(`Deactivate "${l.name}"? It stays in your records and can be reactivated later.`)) return;
    void deactivate(l, null);
  }

  async function deactivate(l: OliverLocation, reassignTo: string | null) {
    setBusyId(l.location_id); setActionError(null);
    try {
      const qs = reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : "";
      await del(`/locations/${l.location_id}${qs}`);
      await loc.reload();
      setReassign(null);
      toast(`"${l.name}" deactivated.`);
    } catch (e) { fail(e, "Could not deactivate the location."); }
    finally { setBusyId(null); }
  }

  const columns: Column<OliverLocation>[] = [
    {
      key: "name", header: "Location", sortable: true, sortAccessor: (l) => l.name,
      render: (l) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <MapPin size={13} color="#5A7A8A" />
            {l.name}
            {l.is_default && <Pill bg="#FFF8E1" fg="#8A5A00">Default</Pill>}
            {!l.is_active && <Pill bg="#F1F5F9" fg="#475569">Inactive</Pill>}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{locationAddressLine(l) || "No address"}</div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (l) => <span style={{ fontSize: 12, color: "#0B1C24" }}>{l.phone || "—"}</span> },
    { key: "timezone", header: "Timezone", render: (l) => <span style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{l.timezone || "—"}</span> },
    {
      key: "jobs", header: "Jobs (open / total)", align: "right", sortable: true, sortAccessor: (l) => l.open_jobs || 0,
      render: (l) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {l.open_jobs ?? 0}<span style={{ color: "#5A7A8A" }}> / {l.total_jobs ?? 0}</span>
        </span>
      ),
    },
    { key: "workers", header: "Workers", align: "right", sortable: true, sortAccessor: (l) => l.workers || 0, render: (l) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{l.workers ?? 0}</span> },
    {
      key: "actions", header: "", align: "right",
      render: (l) => {
        const busy = busyId === l.location_id;
        return (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(l)} disabled={busy} title="Edit"><Edit3 size={11} /></Button>
            {isAdmin && l.is_active && (
              <Button variant="ghost" size="sm" onClick={() => setMembers(l)} disabled={busy} title="Who can see this location"><Users size={11} /></Button>
            )}
            {l.is_active && !l.is_default && (
              <Button variant="ghost" size="sm" onClick={() => setDefault(l)} disabled={busy} title="Make default"><Star size={11} /></Button>
            )}
            {l.is_active ? (
              <Button variant="ghost" size="sm" onClick={() => startDeactivate(l)} disabled={busy || l.is_default}>
                <span style={{ color: l.is_default ? "#94A3B8" : "#dc2626", fontSize: 11 }}>Deactivate</span>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => reactivate(l)} disabled={busy}><span style={{ fontSize: 11 }}>Reactivate</span></Button>
            )}
          </div>
        );
      },
    },
  ];

  const addButton = loc.canAddLocation ? (
    <Button variant="primary" onClick={onAddClick}><Plus size={12} /> Add location</Button>
  ) : (
    <Button variant="secondary" onClick={onAddClick} title={`Requires ${loc.multiLocationNeeds}`}>
      <Lock size={12} /> Add location
      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, padding: "1px 6px", borderRadius: 999, background: `${OLIVER}22`, color: "#8A5A00" }}>UPGRADE</span>
    </Button>
  );

  return (
    <OliverPageWrapper
      title="Locations"
      subtitle="Run more than one branch from a single OLIVER account"
      error={null}
      loading={!loc.ready && !loc.locations.length}
    >
      <PageHeader
        title="Locations"
        subtitle="Each location scopes jobs, team, invoices and reports. The header picker switches between them."
        actions={addButton}
      />

      {flash && <Banner tone="ok">{flash}</Banner>}
      {actionError && (
        <Banner tone="err">
          <span>{actionError}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>Dismiss</Button>
        </Banner>
      )}

      {showUpgrade && <UpgradeCard needs={loc.multiLocationNeeds} onClose={() => setShowUpgrade(false)} />}

      {!loc.locations.length ? (
        <EmptyState
          title="No locations yet"
          description={loc.error
            ? "Locations aren't available for this business yet. Every job, worker and invoice stays business-wide until then."
            : "Add your first location — it becomes the default for every job, worker and invoice."}
          action={!loc.error ? <Button variant="primary" onClick={onAddClick}>+ Add first location</Button> : undefined}
        />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(l) => l.location_id} emptyMessage="No locations." />
      )}

      {loc.locations.length > 0 && (
        <div style={{ marginTop: 16, padding: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: "#1A3A4A", marginBottom: 4 }}>How locations work</div>
          <div>New jobs, workers and invoices land on the location picked in the header (or the default). Workers can belong to several locations.</div>
          <div>Admins can limit a user to specific locations from <strong>Members</strong> here or from <strong>Team Access</strong>; users with no limit see everything.</div>
          {activeCount < 2 && !loc.canAddLocation && (
            <div style={{ marginTop: 4 }}>A second location needs <strong>{loc.multiLocationNeeds}</strong>.</div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <LocationDrawer
          location={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async (msg) => { setCreating(false); setEditing(null); await loc.reload(); toast(msg); }}
          onTierBlocked={() => { setCreating(false); setShowUpgrade(true); }}
          api={{ post, patch }}
        />
      )}

      {members && (
        <MembersDrawer
          location={members}
          onClose={() => setMembers(null)}
          onSaved={(msg) => { setMembers(null); toast(msg); }}
          api={{ get, put }}
          ready={ready}
        />
      )}

      {reassign && (
        <ReassignModal
          location={reassign}
          targets={loc.activeLocations.filter((l) => l.location_id !== reassign.location_id)}
          busy={busyId === reassign.location_id}
          onCancel={() => setReassign(null)}
          onConfirm={(target) => deactivate(reassign, target)}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "1px 6px", borderRadius: 999, background: bg, color: fg }}>{children}</span>;
}

function Banner({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  const ok = tone === "ok";
  return (
    <div style={{
      padding: 10, marginBottom: 12, fontSize: 12, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
      background: ok ? "#F0FDF4" : "#FEF2F2", color: ok ? "#15803D" : "#991B1B", border: `1px solid ${ok ? "#BBF7D0" : "#FECACA"}`,
    }}>{children}</div>
  );
}

/** Same copy as FeatureLocked / the nav wall, inline so the rest of the page stays usable. */
function UpgradeCard({ needs, onClose }: { needs: string; onClose: () => void }) {
  return (
    <div role="status" style={{ marginBottom: 14, padding: 16, background: "#fff", borderRadius: 12, border: `1px solid ${OLIVER}55`, boxShadow: "0 4px 16px rgba(11,28,36,0.06)", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 40, height: 40, borderRadius: 999, background: `${OLIVER}1A`, color: OLIVER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Lock size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15, color: "#0B1C24" }}>Additional locations</strong>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px", borderRadius: 999, background: `${OLIVER}1A`, color: OLIVER }}>{needs.toUpperCase()}</span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569" }}>
          Run several branches from one account — each with its own jobs, team, invoices and reports.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#334155" }}>
          This isn&apos;t included in your current plan. Upgrade to <strong>{needs}</strong> to turn it on.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/app/settings/plan-pricing" style={{ padding: "7px 14px", borderRadius: 8, background: OLIVER, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>View plans</a>
          <button type="button" onClick={onClose} style={{ background: "none", border: 0, color: "#475569", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function LocationDrawer({ location, onClose, onSaved, onTierBlocked, api }: {
  location: OliverLocation | null;
  onClose: () => void;
  onSaved: (msg: string) => void | Promise<void>;
  onTierBlocked: () => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [address1, setAddress1] = useState(location?.address_line1 ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [region, setRegion] = useState(location?.region ?? "");
  const [postal, setPostal] = useState(location?.postal_code ?? "");
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [timezone, setTimezone] = useState(location?.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(null); setSaving(true);
    const body: OliverLocationInput = {
      name: name.trim(),
      address_line1: address1.trim() || null,
      city: city.trim() || null,
      region: region.trim() || null,
      postal_code: postal.trim() || null,
      phone: phone.trim() || null,
      timezone: timezone.trim() || null,
    };
    try {
      if (location) {
        await api.patch(`/locations/${location.location_id}`, body);
        await onSaved(`Updated "${body.name}".`);
      } else {
        await api.post("/locations", body);
        await onSaved(`Added "${body.name}".`);
      }
    } catch (e) {
      if (isLocationTierError(e)) { onTierBlocked(); return; }
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, maxWidth: "100%", height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>{location ? "Edit location" : "New location"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label><span style={pLabel}>Name *</span><input style={pInput} placeholder="Downtown, North Side, Austin…" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Street address</span><input style={pInput} value={address1} onChange={(e) => setAddress1(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <label><span style={pLabel}>City</span><input style={pInput} value={city} onChange={(e) => setCity(e.target.value)} /></label>
            <label><span style={pLabel}>State / region</span><input style={pInput} value={region} onChange={(e) => setRegion(e.target.value)} /></label>
            <label><span style={pLabel}>ZIP</span><input style={pInput} value={postal} onChange={(e) => setPostal(e.target.value)} /></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span style={pLabel}>Phone</span><input style={pInput} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label><span style={pLabel}>Timezone</span>
              <input style={pInput} list="oliver-location-timezones" placeholder="America/Chicago" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              <datalist id="oliver-location-timezones">{COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}</datalist>
            </label>
          </div>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>{saving ? "Saving…" : (location ? "Save" : "Add location")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MembersDrawer({ location, onClose, onSaved, api, ready }: {
  location: OliverLocation;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: { get: <T>(p: string) => Promise<T>; put: <T>(p: string, b: unknown) => Promise<T> };
  ready: boolean;
}) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  // Current /members entries (tenant_user_id + joined user_id when the API
  // sends it). Checkboxes are keyed by userId; membersPutBody maps each
  // checked user back to the id the API stores.
  const [members, setMembers] = useState<LocationMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [u, m] = await Promise.all([
        api.get<{ users: TenantUser[] }>("/tenant-users"),
        api.get<OliverLocationMembers>(`/locations/${location.location_id}/members`),
      ]);
      const list = u?.users || [];
      const current = parseMembers(m);
      setUsers(list);
      setMembers(current);
      setSelected(new Set(list.filter((x) => isMemberOf(current, x)).map((x) => x.userId)));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load members"); }
    finally { setLoading(false); }
  }, [api, location.location_id]);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  function toggle(id: string) {
    setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      await api.put(`/locations/${location.location_id}/members`, membersPutBody(users, selected, members));
      onSaved(`Members of "${location.name}" saved.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, maxWidth: "100%", height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>Members — {location.name}</h2>
            <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4 }}>Users limited to this location. Users with no location limit see every location.</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          {loading ? <div style={{ fontSize: 12, color: "#5A7A8A" }}>Loading…</div> : users.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5A7A8A" }}>No users yet. Invite teammates under Team Members first.</div>
          ) : (
            <div style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 8, maxHeight: 360, overflowY: "auto" }}>
              {users.map((u) => (
                <label key={u.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 12 }}>
                  <input type="checkbox" checked={selected.has(u.userId)} onChange={() => toggle(u.userId)} />
                  <span style={{ fontWeight: 600, color: "#1A3A4A" }}>{u.fullName || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}</span>
                  <span style={{ color: "#5A7A8A" }}>{u.email}</span>
                </label>
              ))}
            </div>
          )}
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save members"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReassignModal({ location, targets, busy, onCancel, onConfirm }: {
  location: OliverLocation;
  targets: OliverLocation[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (targetId: string) => void;
}) {
  const [target, setTarget] = useState(targets.find((t) => t.is_default)?.location_id ?? targets[0]?.location_id ?? "");
  const counts = locationUsageLabel(location);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, maxWidth: "94vw", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Deactivate "{location.name}"</h2>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12, fontSize: 13, color: "#334155" }}>
          <p style={{ margin: 0 }}>This location still has {counts}. Pick where they should move.</p>
          {targets.length === 0 ? (
            <div style={errBox}>No other active location to move them to. Add or reactivate one first.</div>
          ) : (
            <label><span style={pLabel}>Move to</span>
              <select style={pInput} value={target} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((t) => <option key={t.location_id} value={t.location_id}>{t.name}{t.is_default ? " (default)" : ""}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={() => onConfirm(target)} disabled={busy || !target}>{busy ? "Moving…" : "Move and deactivate"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
