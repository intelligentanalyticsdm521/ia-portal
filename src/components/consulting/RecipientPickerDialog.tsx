// RecipientPickerDialog — "Who gets this?"
//
// Scope 2026-10-01 §5: every send picks its own recipients. The project's
// people are the list and the default; the sender ticks who actually gets the
// document. Used by the proposal builder's Send (when the proposal belongs to
// a project) and by the project's Deliverables tab "Send to client".
//
//   · the project's people as checkboxes, pre-ticked by
//     GET /consulting/projects/:id/people/recipients?kind= (proposal →
//     contractual: the approver, else billing, else the primary — never the
//     whole team; deliverable → everyone who receives documents)
//   · "Not on the project yet" from /people/available — ticking one adds them
//     to the project on send (the API does that), so the two lists never drift
//   · the host does the POST: this dialog only answers WHO.
//
// `initial` exists so the node test can draw the dialog with a fixture; in the
// app the lists come from the API on open.
import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { IadmModal, CORE_BLUE } from "../IadmModal";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import {
  contactKey, defaultTicked, personLabel, recipientsFrom, userKey,
  type AvailablePeople, type RecipientInput, type RecipientKind, type RecipientPerson,
} from "../../lib/projectPeople";

export interface RecipientPickerDialogProps {
  api: { get: <T>(path: string) => Promise<T> };
  projectId: string;
  kind: RecipientKind;
  /** The document's own name, for the line under the title. */
  documentLabel?: string | null;
  /**
   * Where it goes when the project has nobody on it and nobody is ticked —
   * e.g. the customer already picked on the proposal. Null = nobody, so Send
   * waits for a tick.
   */
  fallback?: string | null;
  /** Send to these people. An empty list means "the fallback". Throw to keep
   *  the dialog open with the sentence shown. */
  onSend: (recipients: RecipientInput[]) => Promise<void>;
  onCancel: () => void;
  initial?: { people: RecipientPerson[]; available: AvailablePeople };
}

const EMPTY_AVAILABLE: AvailablePeople = { contacts: [], users: [] };

export function RecipientPickerDialog({
  api, projectId, kind, documentLabel, fallback = null, onSend, onCancel, initial,
}: RecipientPickerDialogProps) {
  const [people, setPeople] = useState<RecipientPerson[]>(initial?.people ?? []);
  const [available, setAvailable] = useState<AvailablePeople>(initial?.available ?? EMPTY_AVAILABLE);
  const [ticked, setTicked] = useState<Set<string>>(() => defaultTicked(initial?.people ?? []));
  const [loading, setLoading] = useState(!initial);
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed read is said once, in the error line; the lists then stay quiet
  // rather than claiming there is nobody.
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [availableFailed, setAvailableFailed] = useState(false);

  // The project's people, pre-ticked by the document kind's rule.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    api.get<{ people: RecipientPerson[] }>(
      `/consulting/projects/${projectId}/people/recipients?kind=${kind}`,
    )
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r?.people) ? r.people : [];
        setPeople(list);
        setTicked(defaultTicked(list));
      })
      .catch((e) => { if (!cancelled) { setPeopleFailed(true); setError(`Could not load the project's people: ${apiErrorMessage(e)}`); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kind]);

  // Everyone else who could get it — searched on the server (top 25).
  useEffect(() => {
    if (initial && !q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      api.get<AvailablePeople>(`/consulting/projects/${projectId}/people/available${qs}`)
        .then((r) => {
          if (cancelled) return;
          setAvailableFailed(false);
          setAvailable({
            contacts: Array.isArray(r?.contacts) ? r.contacts : [],
            users: Array.isArray(r?.users) ? r.users : [],
          });
        })
        .catch(() => { if (!cancelled) setAvailableFailed(true); /* the project's own people still work without this list */ });
    }, q.trim() ? 220 : 0);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, q]);

  const recipients = useMemo(() => recipientsFrom(ticked, people, available), [ticked, people, available]);
  const nobodyOnProject = !loading && !peopleFailed && people.length === 0;
  const canSend = !sending && !loading && (recipients.length > 0 || (nobodyOnProject && !!fallback));

  function toggle(key: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(recipients);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const otherCount = available.contacts.length + available.users.length;

  return (
    <IadmModal
      open
      onClose={onCancel}
      product="oliver"
      eyebrow={kind === "contractual" ? "SEND PROPOSAL" : "SEND TO CLIENT"}
      title="Who gets this?"
      subtitle={documentLabel ? <span className="text-xs">{documentLabel}</span> : undefined}
      size="confirm"
      // Above the builder's own overlays (BuilderFrame 9550-9660).
      z={9700}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-recipient-send="1"
            onClick={handleSend}
            disabled={!canSend}
            title={canSend ? "Email the people ticked a link to this document" : "Tick at least one person first"}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: CORE_BLUE }}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            title="Close without sending"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        <section>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">On this project</div>
          {loading ? (
            <div className="text-xs text-slate-500">Loading…</div>
          ) : peopleFailed ? null : people.length === 0 ? (
            <div className="text-xs text-slate-500">
              No one is on this project yet.
              {fallback ? ` Leave everyone unticked and it goes to ${fallback}.` : " Tick someone below and they are added to the project."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {people.map((p) => {
                const canEmail = p.can_email !== false && !!p.email;
                return (
                  <li key={p.project_person_id}>
                    <label className={`flex items-start gap-2 px-3 py-2 ${canEmail ? "cursor-pointer" : "opacity-60"}`}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        data-recipient={p.project_person_id}
                        checked={ticked.has(p.project_person_id)}
                        disabled={!canEmail}
                        onChange={() => toggle(p.project_person_id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">{personLabel(p)}</span>
                        <span className="block truncate text-[11px] text-slate-500">{p.email || "No email address"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Not on the project yet</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label="Search people not on the project"
              className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          {otherCount === 0 ? (
            <div className="text-xs text-slate-500">{availableFailed ? "Could not load the other people." : q.trim() ? "Nobody matches." : "Nobody else to add."}</div>
          ) : (
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {available.contacts.map((c) => {
                const key = contactKey(c.lumen_contact_id);
                return (
                  <li key={key}>
                    <label className={`flex items-start gap-2 px-3 py-2 ${c.email ? "cursor-pointer" : "opacity-60"}`}>
                      <input type="checkbox" className="mt-0.5" data-recipient={key} checked={ticked.has(key)} disabled={!c.email} onChange={() => toggle(key)} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">
                          {personLabel(c)}
                          {c.company && <span className="ml-1 font-normal text-slate-500">· {c.company}</span>}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{c.email || "No email address"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {available.users.map((u) => {
                const key = userKey(u.user_id);
                return (
                  <li key={key}>
                    <label className={`flex items-start gap-2 px-3 py-2 ${u.email ? "cursor-pointer" : "opacity-60"}`}>
                      <input type="checkbox" className="mt-0.5" data-recipient={key} checked={ticked.has(key)} disabled={!u.email} onChange={() => toggle(key)} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">
                          {personLabel(u)}
                          <span className="ml-1 font-normal text-slate-500">· Portal user</span>
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{u.email || "No email address"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-slate-500">Ticking someone here adds them to the project when you press Send.</p>
        </section>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Only the people ticked are emailed. The document is one link.
        </p>
      </div>
    </IadmModal>
  );
}

export default RecipientPickerDialog;
