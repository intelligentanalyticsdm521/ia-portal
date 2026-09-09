// CustomerListActions — what an owner can DO to a selection of customers, and
// the two panels that tell them what happened.
//
// OLIVER pack 2. Until this pack the customer list could be read and nothing
// else: no tags, no way to act on more than one person, and no way to hand
// somebody the address of their own portal. The page told the owner customers
// "appear here as soon as you create a job" — which is true and is not a
// customer list you can set up.
//
// THE ONE RULE THESE COMPONENTS FOLLOW: every result says what actually
// happened, per person. An invite that the notification gate suppressed because
// that customer switched updates off is NOT an invite; showing "Invited ✓" over
// it is the failure this platform keeps rediscovering. So the invite panel
// lists the people who were not emailed and why, in words.

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui";

export interface CustomerFilters {
  search?: string;
  financial?: string;
  portal_status?: string;
  tags_any?: string[];
  has_email?: boolean;
  has_phone?: boolean;
}

export interface TagRow {
  id: number;
  name: string;
  color?: string | null;
  category?: string | null;
  is_system?: boolean | number;
  contact_count?: number;
}

export interface SavedView {
  customer_view_id: string;
  name: string;
  filters: CustomerFilters;
}

export interface InviteResult {
  contact_id: string;
  name: string;
  ok: boolean;
  status: string;
  reason: string | null;
  email: string | null;
  portalUrl: string | null;
}

type Api = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
};

const CARD: React.CSSProperties = {
  padding: 12, margin: "8px 0", borderRadius: 8, fontSize: 13,
  border: "1px solid rgba(45,156,219,0.22)", background: "#F8FAFC",
};

/** The words a person reads. Never a status key. */
export function inviteReasonText(r: InviteResult): string {
  switch (r.reason) {
    case "no_email_on_file": return "no email address on file";
    case "contact_deleted": return "this customer has been deleted";
    case "contact_not_found": return "we could not find this customer";
    case "worker_not_active": return "this crew member is not active";
    case "no_business_slug": return "this business has no web address yet";
    case "enqueue_failed": return "the message could not be queued — try again";
    default:
      if (r.status === "suppressed") return "they have asked not to receive updates";
      return r.reason || "not sent";
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  THE BULK BAR                                                              */
/*                                                                            */
/*  Appears only when something is selected, and says how many. "Apply to      */
/*  everything that matches this filter" is deliberately NOT offered from      */
/*  here: an action nobody can undo should name a number the person can see.   */
/* ────────────────────────────────────────────────────────────────────────── */
export function BulkActionBar({
  count, onTag, onInvite, onExport, onClear, busy,
}: {
  count: number;
  onTag: () => void;
  onInvite: () => void;
  onExport: () => void;
  onClear: () => void;
  busy?: string | null;
}) {
  if (!count) return null;
  return (
    <div
      data-testid="bulk-action-bar"
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 12px", marginBottom: 12, borderRadius: 8,
        background: "#EFF6FF", border: "1px solid #BFDBFE",
      }}
    >
      <strong style={{ fontSize: 13, color: "#1E3A8A" }}>
        {count} customer{count === 1 ? "" : "s"} selected
      </strong>
      <Button variant="secondary" onClick={onTag} disabled={!!busy}>
        {busy === "tag" ? "Tagging…" : "Tag"}
      </Button>
      <Button variant="secondary" onClick={onInvite} disabled={!!busy}>
        {busy === "invite" ? "Inviting…" : "Invite to portal"}
      </Button>
      <Button variant="secondary" onClick={onExport} disabled={!!busy}>Export CSV</Button>
      <button
        onClick={onClear}
        style={{ marginLeft: "auto", background: "none", border: "none", color: "#1D4ED8", fontSize: 12, cursor: "pointer" }}
      >
        Clear selection
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  TAGGING                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */
export function TagModal({
  count, tags, onClose, onApply,
}: {
  count: number;
  tags: TagRow[];
  onClose: () => void;
  onApply: (add: string[], remove: string[]) => Promise<void>;
}) {
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The owner's own words first: a system tag is applied by the platform and is
  // rarely what somebody is reaching for here.
  const ordered = useMemo(
    () => [...tags].sort((a, b) => Number(!!a.is_system) - Number(!!b.is_system) || a.name.localeCompare(b.name)),
    [tags],
  );

  function toggle(list: string[], set: (v: string[]) => void, name: string) {
    set(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
  }

  async function apply() {
    setBusy(true); setErr(null);
    try {
      const typedNames = typed.split(",").map((t) => t.trim()).filter(Boolean);
      await onApply([...new Set([...add, ...typedNames])], remove);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not apply the tags");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Tag ${count} customer${count === 1 ? "" : "s"}`} onClose={onClose}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        New tag (or several, separated by commas)
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="e.g. Snow route, Commercial"
        style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontSize: 13 }}
      />
      <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 14px" }}>
        A tag you type here is created for your business the first time you use it.
      </p>

      {ordered.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Add an existing tag</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {ordered.map((t) => (
              <TagChip
                key={`add-${t.id}`}
                name={t.name}
                color={t.color}
                active={add.includes(t.name)}
                onClick={() => toggle(add, setAdd, t.name)}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Take a tag off</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {ordered.map((t) => (
              <TagChip
                key={`rm-${t.id}`}
                name={t.name}
                color="#DC2626"
                active={remove.includes(t.name)}
                onClick={() => toggle(remove, setRemove, t.name)}
              />
            ))}
          </div>
        </>
      )}

      {err && <div style={{ ...CARD, background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply} disabled={busy || (!add.length && !remove.length && !typed.trim())}>
          {busy ? "Applying…" : "Apply"}
        </Button>
      </div>
    </ModalShell>
  );
}

export function TagChip({ name, color, active, onClick }: { name: string; color?: string | null; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, cursor: onClick ? "pointer" : "default",
        border: `1px solid ${active ? (color || "#2D9CDB") : "rgba(45,156,219,0.28)"}`,
        background: active ? (color || "#2D9CDB") : "#FFFFFF",
        color: active ? "#FFFFFF" : "#334155",
      }}
    >
      {name}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  THE INVITE RESULT — per person, in words                                  */
/* ────────────────────────────────────────────────────────────────────────── */
export function InviteResultPanel({ results, portalUrl, onClose }: { results: InviteResult[]; portalUrl: string | null; onClose: () => void }) {
  const sent = results.filter((r) => r.ok);
  const not = results.filter((r) => !r.ok);
  return (
    <div style={{ ...CARD, background: not.length ? "#FFFBEB" : "#F0FDF4", borderColor: not.length ? "#FDE68A" : "#BBF7D0" }} data-testid="invite-result">
      <div style={{ display: "flex", alignItems: "start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong>
            {sent.length} invitation{sent.length === 1 ? "" : "s"} on the way
            {not.length ? `, ${not.length} not sent` : ""}.
          </strong>
          {portalUrl && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
              They are being sent to <code>{portalUrl}</code> — the same address every time, and it does not expire.
            </div>
          )}
          {not.length > 0 && (
            <ul style={{ margin: "8px 0 0 18px", padding: 0, fontSize: 12, color: "#92400E" }}>
              {not.map((r) => (
                <li key={r.contact_id}>
                  <strong>{r.name}</strong> — {inviteReasonText(r)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#64748B" }}>×</button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  SAVED VIEWS                                                               */
/* ────────────────────────────────────────────────────────────────────────── */
export function SavedViews({
  api, current, onApply,
}: {
  api: Api;
  current: CustomerFilters;
  onApply: (f: CustomerFilters) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useMemo(() => async () => {
    try { setViews(await api.get<SavedView[]>("/contacts/views")); }
    catch { /* a list that will not load must not take the page with it */ }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const hasFilter = Object.values(current).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""));

  async function save() {
    setErr(null);
    try {
      await api.post("/contacts/views", { name: name.trim(), filters: current });
      setName(""); setNaming(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save this view");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }} data-testid="saved-views">
      {views.map((v) => (
        <span key={v.customer_view_id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => onApply(v.filters)}
            style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
              border: "1px solid rgba(45,156,219,0.28)", background: "#FFFFFF", color: "#334155",
            }}
          >
            {v.name}
          </button>
          <button
            title={`Delete "${v.name}"`}
            onClick={async () => { await api.del(`/contacts/views/${v.customer_view_id}`); await load(); }}
            style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 13 }}
          >
            ×
          </button>
        </span>
      ))}
      {naming ? (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this view"
            style={{ padding: "4px 8px", border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontSize: 12 }}
          />
          <Button variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
          <Button variant="secondary" onClick={() => { setNaming(false); setErr(null); }}>Cancel</Button>
        </span>
      ) : (
        <button
          onClick={() => setNaming(true)}
          disabled={!hasFilter}
          title={hasFilter ? "Save these filters as a view you can come back to" : "Filter the list first"}
          style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 999,
            border: "1px dashed rgba(45,156,219,0.4)", background: "none",
            color: hasFilter ? "#1D4ED8" : "#94A3B8", cursor: hasFilter ? "pointer" : "not-allowed",
          }}
        >
          + Save this view
        </button>
      )}
      {err && <span style={{ fontSize: 12, color: "#991B1B" }}>{err}</span>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  DUPLICATES + MERGE                                                        */
/*                                                                            */
/*  A merge is not undoable by the person clicking it, so the modal names both */
/*  people, says which one is being kept, and reports what moved.              */
/* ────────────────────────────────────────────────────────────────────────── */
interface DupContact {
  contact_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  created_at?: string | null;
}
interface DupGroup { key: string; kind: string; count: number; contacts: DupContact[] }

export function DuplicatesModal({ api, onClose, onMerged }: { api: Api; onClose: () => void; onMerged: () => void }) {
  const [kind, setKind] = useState<"email" | "phone">("email");
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setGroups(null); setErr(null);
    api.get<DupGroup[]>(`/contacts/duplicates?kind=${kind}`)
      .then((g) => { if (live) setGroups(g || []); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : "Could not look for duplicates"); });
    return () => { live = false; };
  }, [api, kind]);

  async function merge(keep: DupContact, loser: DupContact) {
    setBusy(true); setNote(null); setErr(null);
    try {
      const r = await api.post<{
        complete: boolean;
        oliver_rows_moved: Record<string, number>;
        held_back: Record<string, string>;
      }>(`/contacts/${keep.contact_id}/merge`, { merge_id: loser.contact_id });
      const moved = Object.values(r.oliver_rows_moved || {}).reduce((a, b) => a + Number(b || 0), 0);
      const held = Object.values(r.held_back || {});
      setNote(
        `Merged. ${moved} record${moved === 1 ? "" : "s"} of history moved onto ${nameOf(keep)}.` +
        (held.length ? ` One thing needs you: ${held.join("; ")}.` : "") +
        (r.complete ? "" : " Some history could not be moved — see the details in the response."),
      );
      onMerged();
      const g = await api.get<DupGroup[]>(`/contacts/duplicates?kind=${kind}`);
      setGroups(g || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The merge did not happen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Customers that look like the same person" onClose={onClose} wide>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button variant={kind === "email" ? "primary" : "secondary"} onClick={() => setKind("email")}>Same email</Button>
        <Button variant={kind === "phone" ? "primary" : "secondary"} onClick={() => setKind("phone")}>Same phone</Button>
      </div>
      <p style={{ fontSize: 12, color: "#64748B", marginTop: 0 }}>
        Matched on the email address or the phone number, never on the name — two people
        called Dave Smith are two people.
      </p>

      {note && <div style={{ ...CARD, background: "#F0FDF4", borderColor: "#BBF7D0" }}>{note}</div>}
      {err && <div style={{ ...CARD, background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}>{err}</div>}

      {groups === null && <p style={{ fontSize: 13 }}>Looking…</p>}
      {groups?.length === 0 && <p style={{ fontSize: 13 }}>No duplicates found on the {kind === "email" ? "email address" : "phone number"}.</p>}

      {groups?.map((g) => (
        <div key={g.key} style={{ ...CARD, background: "#FFFFFF" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{g.key} — {g.count} records</div>
          {g.contacts.map((c, i) => (
            <div key={c.contact_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <strong>{nameOf(c)}</strong>
                <span style={{ color: "#64748B" }}>
                  {c.email ? ` · ${c.email}` : ""}{c.phone ? ` · ${c.phone}` : ""}
                  {c.created_at ? ` · added ${new Date(c.created_at).toLocaleDateString()}` : ""}
                </span>
              </div>
              {i === 0 ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>Keep this one</span>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => merge(g.contacts[0], c)}>
                  Merge into the first
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </ModalShell>
  );
}

function nameOf(c: DupContact) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

/* ────────────────────────────────────────────────────────────────────────── */
export function ModalShell({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(11,28,36,0.45)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%",
          maxWidth: wide ? 760 : 480, boxShadow: "0 18px 48px rgba(11,28,36,0.28)",
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#0B1C24" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
