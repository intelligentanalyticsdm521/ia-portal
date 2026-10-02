// ProjectPeopleSection — the people a consulting project is worked with.
//
// Brandon, 2026-10-01: "default projects to their main contact but also allow
// me to update it to work with multiple users, or even just deselect their
// main contact and add another user. Some business I'll work projects with the
// owner, some with their office manager, maybe some with a web designer."
//
// Lives on the project modal's Overview tab, under the description card.
//   · one row per person: name (email under it), company chip, role
//     (Main contact / Approver / Billing / Collaborator), Primary (one per
//     project — the project's main contact follows it), Receives documents,
//     remove (×)
//   · "No primary person — pick one" when the project has none (legitimate
//     while it is being re-pointed)
//   · Add person: one search box, two groups ("Contacts", "Portal users");
//     a pick adds the person at once as a Collaborator and the panel stays
//     open for the next one (fewer clicks)
//   · a portal user with no CRM contact gets "Invite as contact": two name
//     boxes, prefilled, then the user becomes a contact on the project
//   · the founder edits; the client sees the same list read-only
//
// Endpoints: oliver-api routes/consultingPeople.js — see lib/projectPeople.ts.
// `initial` lets the node test draw the section from a fixture.
import { useCallback, useEffect, useRef, useState } from "react";
import { Star, X, UserPlus } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import {
  ROLE_OPTIONS, personLabel, roleLabel, splitName, truthy,
  type AvailablePeople, type PeopleResponse, type ProjectPerson,
} from "../../lib/projectPeople";

export interface ProjectPeopleSectionProps {
  projectId: string;
  viewerRole: "founder" | "client";
  /** The project's main contact moved (primary changed / removed) — the modal
   *  reloads so its header and Client card follow. */
  onPrimaryChanged?: () => void;
  initial?: PeopleResponse;
}

export function ProjectPeopleSection({ projectId, viewerRole, onPrimaryChanged, initial }: ProjectPeopleSectionProps) {
  const { get, post, patch, del } = useOliverApi();
  const canEdit = viewerRole === "founder";

  const [data, setData] = useState<PeopleResponse | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Add person
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [available, setAvailable] = useState<AvailablePeople>({ contacts: [], users: [] });
  const [availableLoading, setAvailableLoading] = useState(false);
  // A failed search says so once (the error line); the groups then stay
  // quiet rather than claiming there is nobody.
  const [searchFailed, setSearchFailed] = useState(false);
  // Remove — two clicks, the first arms the × for four seconds.
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Invite as contact — the row whose name form is open.
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await get<PeopleResponse>(`/consulting/projects/${projectId}/people`);
      setData({ people: Array.isArray(r?.people) ? r.people : [], primary_missing: !!r?.primary_missing });
      setError(null);
    } catch (e) {
      setError(`Could not load the people on this project: ${apiErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  // The picker's two lists, searched on the server.
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    setAvailableLoading(true);
    const t = setTimeout(() => {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      get<AvailablePeople>(`/consulting/projects/${projectId}/people/available${qs}`)
        .then((r) => {
          if (cancelled) return;
          setSearchFailed(false);
          setAvailable({
            contacts: Array.isArray(r?.contacts) ? r.contacts : [],
            users: Array.isArray(r?.users) ? r.users : [],
          });
        })
        .catch((e) => { if (!cancelled) { setSearchFailed(true); setError(`Could not search: ${apiErrorMessage(e)}`); } })
        .finally(() => { if (!cancelled) setAvailableLoading(false); });
    }, q.trim() ? 220 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [adding, q, get, projectId]);

  /** Run one write, then re-read the list (and the modal when the primary moved). */
  async function run(id: string, fn: () => Promise<unknown>, primaryMoves = false): Promise<boolean> {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
      if (primaryMoves) onPrimaryChanged?.();
      return true;
    } catch (e) {
      setError(apiErrorMessage(e));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function addContact(lumenContactId: number) {
    const ok = await run(`c:${lumenContactId}`, () => post(`/consulting/projects/${projectId}/people`, {
      person_kind: "contact", lumen_contact_id: lumenContactId, role: "collaborator",
    }));
    if (ok) setAvailable((a) => ({ ...a, contacts: a.contacts.filter((c) => c.lumen_contact_id !== lumenContactId) }));
  }

  async function addUser(userId: string) {
    const ok = await run(`u:${userId}`, () => post(`/consulting/projects/${projectId}/people`, {
      person_kind: "user", user_id: userId, role: "collaborator",
    }));
    if (ok) setAvailable((a) => ({ ...a, users: a.users.filter((u) => u.user_id !== userId) }));
  }

  function pathOf(p: ProjectPerson) {
    return `/consulting/projects/${projectId}/people/${p.project_person_id}`;
  }

  function handleRemove(p: ProjectPerson) {
    if (armedId !== p.project_person_id) {
      setArmedId(p.project_person_id);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmedId(null), 4000);
      return;
    }
    setArmedId(null);
    void run(p.project_person_id, () => del(pathOf(p)), truthy(p.is_primary));
  }

  function openInvite(p: ProjectPerson) {
    const n = splitName(p);
    setInviteFirst(n.first_name);
    setInviteLast(n.last_name);
    setInviteId(p.project_person_id);
  }

  async function submitInvite(p: ProjectPerson) {
    const ok = await run(p.project_person_id, () => post(`${pathOf(p)}/invite-as-contact`, {
      first_name: inviteFirst.trim() || null,
      last_name: inviteLast.trim() || null,
    }), truthy(p.is_primary));
    if (ok) setInviteId(null);
  }

  const people = data?.people ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-project-people="1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">People</div>
        {canEdit && (
          <button
            type="button"
            onClick={() => { setAdding((v) => !v); setQ(""); }}
            title="Add a contact or one of the client's portal users to this project"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {adding ? "Done adding" : "Add person"}
          </button>
        )}
      </div>

      {error && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {/* Only when there is someone to pick — on an empty project the line
          below (Add person) is the one thing to do. */}
      {data?.primary_missing && (data.people?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          No primary person — pick one
        </div>
      )}

      {canEdit && adding && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, company or email"
            aria-label="Search people to add"
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          />
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <PickGroup
              title="Contacts"
              loading={availableLoading}
              empty={searchFailed ? "" : q.trim() ? "No contacts match." : "No other contacts."}
              items={available.contacts.map((c) => ({
                key: `c:${c.lumen_contact_id}`,
                name: personLabel(c),
                sub: [c.email, c.company].filter(Boolean).join(" · "),
                onPick: () => void addContact(c.lumen_contact_id),
              }))}
              busyKey={busyId}
            />
            <PickGroup
              title="Portal users"
              loading={availableLoading}
              empty={searchFailed ? "" : "No portal users to add. They come from the client's business once it is set on the Details tab."}
              items={available.users.map((u) => ({
                key: `u:${u.user_id}`,
                name: personLabel(u),
                sub: u.email || "",
                onPick: () => void addUser(u.user_id),
              }))}
              busyKey={busyId}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-xs text-slate-500">Loading people…</div>
      ) : !data ? null /* the read failed — the error above says so; "no one" would be a guess */ : people.length === 0 ? (
        <div className="mt-3 text-xs text-slate-500">
          No one on this project yet.{canEdit ? " Press Add person to add the people you work it with." : ""}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {people.map((p) => {
            const primary = truthy(p.is_primary);
            const receives = truthy(p.receives_documents);
            const busy = busyId === p.project_person_id;
            const isUser = p.person_kind === "user";
            const chip = p.company || (isUser ? "Portal user" : null);
            return (
              <li key={p.project_person_id} data-person={p.project_person_id} className={`px-3 py-2 ${busy ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{personLabel(p)}</span>
                      {chip && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{chip}</span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">{p.email || "No email address"}</div>
                  </div>

                  {canEdit ? (
                    <>
                      <select
                        value={ROLE_OPTIONS.some((r) => r.value === p.role) ? p.role : "collaborator"}
                        disabled={busy}
                        aria-label={`Role for ${personLabel(p)}`}
                        title="What this person does on the project"
                        onChange={(e) => void run(p.project_person_id, () => patch(pathOf(p), { role: e.target.value }))}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={primary}
                        data-primary={primary ? "1" : "0"}
                        disabled={busy}
                        onClick={() => void run(p.project_person_id, () => patch(pathOf(p), { is_primary: !primary }), true)}
                        title={primary
                          ? "The project's main contact. Click to un-mark (the project then has no primary)."
                          : "Make this person the project's main contact"}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${primary ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"}`}
                      >
                        <Star className="h-3.5 w-3.5" fill={primary ? "currentColor" : "none"} />
                        {primary ? "Primary" : "Make primary"}
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600" title="Ticked people are pre-ticked when a report or status update is sent">
                        <input
                          type="checkbox"
                          checked={receives}
                          disabled={busy}
                          onChange={() => void run(p.project_person_id, () => patch(pathOf(p), { receives_documents: !receives }))}
                        />
                        Receives documents
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemove(p)}
                        disabled={busy}
                        aria-label={`Remove ${personLabel(p)} from this project`}
                        title={armedId === p.project_person_id ? "Click again to remove" : "Remove from this project"}
                        className={`inline-flex items-center rounded-md px-1.5 py-1 text-xs font-semibold ${armedId === p.project_person_id ? "bg-rose-500 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                      >
                        {armedId === p.project_person_id ? "Remove?" : <X className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                      <span>{roleLabel(p.role)}</span>
                      {primary && (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <Star className="h-3 w-3" fill="currentColor" /> Primary
                        </span>
                      )}
                      {receives && <span>Receives documents</span>}
                    </div>
                  )}
                </div>

                {canEdit && isUser && inviteId !== p.project_person_id && (
                  <button
                    type="button"
                    onClick={() => openInvite(p)}
                    disabled={busy}
                    title="Add this portal user to your contacts, so proposals can be addressed to them"
                    className="mt-1 text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    Invite as contact
                  </button>
                )}
                {canEdit && isUser && inviteId === p.project_person_id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
                    <label className="text-[11px] text-slate-600">
                      First name
                      <input value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)}
                        className="mt-0.5 block w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      Last name
                      <input value={inviteLast} onChange={(e) => setInviteLast(e.target.value)}
                        className="mt-0.5 block w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
                    </label>
                    <button
                      type="button"
                      onClick={() => void submitInvite(p)}
                      disabled={busy}
                      title="Create the contact (or use the one with this email) and put it on the project"
                      className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Adding…" : "Add as contact"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteId(null)}
                      title="Close without adding"
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PickGroup({ title, items, loading, empty, busyKey }: {
  title: string;
  items: Array<{ key: string; name: string; sub: string; onPick: () => void }>;
  loading: boolean;
  empty: string;
  busyKey: string | null;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {loading && items.length === 0 ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : items.length === 0 ? (
        empty ? <div className="text-xs text-slate-500">{empty}</div> : null
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 bg-white">
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={it.onPick}
                disabled={busyKey === it.key}
                title={`Add ${it.name} to this project`}
                className="block w-full px-2.5 py-1.5 text-left hover:bg-sky-50 disabled:opacity-50"
              >
                <span className="block truncate text-xs font-semibold text-slate-800">{it.name}</span>
                {it.sub && <span className="block truncate text-[11px] text-slate-500">{it.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProjectPeopleSection;
