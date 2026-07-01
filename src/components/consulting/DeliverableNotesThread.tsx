// DeliverableNotesThread — F-Shared.1 sibling, ports the OLIVER F-62 unified
// messaging pattern (oliver-api/routes/messages.js, founder lock 2026-05-26)
// onto consulting deliverables.
//
// Endpoint contract (oliver-api — server-side enforcement mirrors F-62):
//
//   GET  /consulting/deliverables/:id/notes
//        → { notes: [{ note_id, author_kind, author_display_name, body,
//                       visibility, created_at }] }
//        Server filters internal notes out for client surfaces (visibility
//        IN ('client_visible') for the client lens; founder sees all).
//
//   POST /consulting/deliverables/:id/notes
//        body { body, visibility? }
//        visibility ∈ { 'internal', 'client_visible' }; defaults to
//        'client_visible'. Client surface is locked server-side to
//        'client_visible' regardless of what the client sends.
//
// If the GET 404s (endpoint not yet deployed) the thread degrades to an
// empty state with no error, so this component can ship ahead of the
// backend slice without breaking any host that mounts it.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

// ─── Shape ───────────────────────────────────────────────────────────────

export type NoteVisibility = "internal" | "client_visible";

export interface DeliverableNote {
  note_id: string;
  author_kind: "founder" | "client" | "system" | string;
  author_display_name?: string | null;
  body: string;
  visibility: NoteVisibility;
  created_at: string | null;
}

interface NotesResponse {
  notes: DeliverableNote[];
}

// ─── Props ───────────────────────────────────────────────────────────────

export interface DeliverableNotesThreadProps {
  deliverableId: string;
  viewerRole: "founder" | "client";
}

// ─── Component ───────────────────────────────────────────────────────────

export function DeliverableNotesThread({
  deliverableId,
  viewerRole,
}: DeliverableNotesThreadProps) {
  const { get, post } = useOliverApi();
  const [notes, setNotes] = useState<DeliverableNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose box state
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("client_visible");
  const [busy, setBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // useOliverApi unwraps the {data:...} envelope (lib/oliverApi.ts:74)
      // so we type the inner shape directly.
      const r = await get<NotesResponse>(`/consulting/deliverables/${deliverableId}/notes`);
      setNotes(Array.isArray(r?.notes) ? r.notes : []);
    } catch (e) {
      // 404 = endpoint not deployed yet → empty state, NOT error. Surface
      // anything else.
      const msg = (e as Error).message || "";
      if (msg.includes("404") || /not[_\s-]?found/i.test(msg)) {
        setNotes([]);
      } else {
        setError(msg || "Could not load notes.");
      }
    } finally {
      setLoading(false);
    }
  }, [get, deliverableId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) {
      setComposeError("Type a note first.");
      return;
    }
    setBusy(true);
    setComposeError(null);
    try {
      // Client lens: server forces visibility to 'client_visible' so we
      // don't ship the dropdown picker. Founder lens passes whatever they
      // picked. The post auto-unwraps {data:...}.
      const payload: { body: string; visibility?: NoteVisibility } = { body: trimmed };
      if (viewerRole === "founder") payload.visibility = visibility;
      await post(`/consulting/deliverables/${deliverableId}/notes`, payload);
      setBody("");
      // Founder keeps their last-picked visibility (sticky) so consecutive
      // internal notes don't require re-toggling.
      await load();
    } catch (e) {
      setComposeError((e as Error).message || "Could not post note.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Thread header (subtle — the host already labels the section). */}
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Notes & activity
      </div>

      {/* Thread body */}
      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] italic text-slate-400">
          Loading notes…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] italic text-slate-400">
          No notes yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <NoteRow key={n.note_id} note={n} viewerRole={viewerRole} />
          ))}
        </ul>
      )}

      {/* Compose box. Founder-only visibility hint above the box keeps it
          impossible for Brandon to accidentally leak an internal note. */}
      <div className="rounded-lg border border-slate-200 bg-white p-2">
        {viewerRole === "founder" && (
          <div className="mb-1 text-[10px] italic text-slate-500">
            Internal notes are NOT visible to your client.
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            viewerRole === "founder"
              ? "Add a note for your team or your client…"
              : "Add a note for the IA team…"
          }
          rows={2}
          disabled={busy}
          className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="mt-1.5 flex items-center gap-2">
          {viewerRole === "founder" && (
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
              disabled={busy}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
              aria-label="Note visibility"
            >
              <option value="client_visible">Visible to client</option>
              <option value="internal">Internal (team only)</option>
            </select>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !body.trim()}
            className="ml-auto rounded bg-sky-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post note"}
          </button>
        </div>
        {composeError && (
          <div className="mt-1 text-[11px] text-red-700">{composeError}</div>
        )}
      </div>
    </div>
  );
}

// ─── Note row ────────────────────────────────────────────────────────────

function NoteRow({
  note,
  viewerRole,
}: {
  note: DeliverableNote;
  viewerRole: "founder" | "client";
}) {
  const isInternal = note.visibility === "internal";
  // Defense-in-depth: server SHOULD filter internal notes out for the client
  // surface (per F-62 visibilityFilterForSurface). If one ever slips through
  // we still hide it here.
  if (isInternal && viewerRole === "client") return null;
  return (
    <li
      className={`rounded-lg border px-2.5 py-1.5 ${
        isInternal
          ? "border-slate-300 bg-slate-100"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-800">
          {note.author_display_name || note.author_kind || "—"}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatDateTime(note.created_at)}
        </span>
        {isInternal && (
          <span className="ml-auto rounded-full bg-slate-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">
            Internal
          </span>
        )}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">
        {note.body}
      </div>
    </li>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default DeliverableNotesThread;
