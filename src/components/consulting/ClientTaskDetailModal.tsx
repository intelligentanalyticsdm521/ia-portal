// ClientTaskDetailModal — the CLIENT's view of one task / service request.
//
// ONE component, TWO hosts (2026-07-24): the Service Requests page and the
// milestone drill-in inside ClientConsultingProjectModal. Deliberately shared
// rather than copied — two divergent client review dialogs is the same fork
// disease that produced the lumen/consulting split.
//
// Shows description, the documents attached to the task (private container,
// so downloads stream through the API), and the ONLY two client actions —
// Approve / Request revision — and only while it is actually their turn.
import { useCallback, useEffect, useRef, useState } from "react";
import { IadmModal } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";

/** A client-visible message on a request (is_internal = 0 only). */
interface ClientMessage {
  comment_id: number;
  body: string;
  created_at: string;
  author_name?: string | null;
  author_kind?: string | null;
}

export interface ClientTaskLike {
  id: string;
  title: string;
  description?: string | null;
  stage: string;
  status: string;
  project_name?: string | null;
  milestone_name?: string | null;
  created_at?: string | null;
}

export interface ClientTaskDoc {
  deliverable_id: string;
  title?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  status: string;
  /** 1 when the CLIENT sent this back as markup (not our authored version). */
  is_client_supplied?: boolean | number | null;
}

// Client-facing stage wording + colors. Kept here so both hosts agree.
export const CLIENT_STAGE_LABEL: Record<string, string> = {
  new: "Submitted — awaiting review",
  in_progress: "In progress",
  client_review: "Awaiting your review",
  revision: "In revision",
  client_revision_review: "Awaiting your review",
  approved: "Approved — deploying soon",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CLIENT_STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  new: { bg: "#e2e8f0", fg: "#475569" },
  in_progress: { bg: "#fef9c3", fg: "#854d0e" },
  client_review: { bg: "#dbeafe", fg: "#1d4ed8" },
  revision: { bg: "#fef3c7", fg: "#a16207" },
  client_revision_review: { bg: "#dbeafe", fg: "#1d4ed8" },
  approved: { bg: "#d1fae5", fg: "#047857" },
  completed: { bg: "#e2e8f0", fg: "#334155" },
  cancelled: { bg: "#fee2e2", fg: "#b91c1c" },
};

export const CLIENT_NEEDS_REVIEW = new Set(["client_review", "client_revision_review"]);

export function ClientTaskDetailModal({
  task,
  deliverables,
  acting,
  onAct,
  onDownload,
  onAttach,
  onClose,
}: {
  task: ClientTaskLike;
  deliverables: ClientTaskDoc[];
  acting: boolean;
  onAct: (task: ClientTaskLike, action: "approve" | "request_revision", note?: string) => void;
  onDownload: (path: string, filename: string) => Promise<void> | void;
  /** Attach the client's marked-up file to this task. Omit to hide the control. */
  onAttach?: (task: ClientTaskLike, file: File) => Promise<void>;
  onClose: () => void;
}) {
  // Revision mode: the note is REQUIRED — a revision with no explanation
  // leaves the founder guessing, which is the whole point of this loop.
  const [mode, setMode] = useState<"idle" | "revision">("idle");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);

  // Client-visible message thread. GET returns only is_internal=0 rows for a
  // client (enforced server-side in SQL), and a client POST is always external.
  const { get: apiGet, post: apiPost } = useOliverApi();
  const [msgs, setMsgs] = useState<ClientMessage[]>([]);
  const [msgDraft, setMsgDraft] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgErr, setMsgErr] = useState<string | null>(null);

  const loadMsgs = useCallback(async () => {
    if (!task?.id) return;
    try {
      const d = await apiGet<ClientMessage[]>(`/consulting/requests/${task.id}/comments`);
      setMsgs(Array.isArray(d) ? [...d].reverse() : []); // API is newest-first; read oldest-first
    } catch { /* an empty thread must not break the modal */ }
  }, [apiGet, task?.id]);
  useEffect(() => { loadMsgs(); }, [loadMsgs]);

  const sendMessage = async () => {
    const b = msgDraft.trim();
    if (!b || msgSending) return;
    setMsgSending(true); setMsgErr(null);
    try {
      await apiPost(`/consulting/requests/${task.id}/comments`, { body: b });
      setMsgDraft("");
      await loadMsgs();
    } catch (e) {
      setMsgErr((e as Error).message || "Could not send your message.");
    } finally { setMsgSending(false); }
  };
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleAttach() {
    if (!file || !onAttach) return;
    setAttaching(true);
    setAttachErr(null);
    try {
      await onAttach(task, file);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setAttachErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setAttaching(false);
    }
  }
  const sc = CLIENT_STAGE_COLOR[task.stage] || { bg: "#e2e8f0", fg: "#334155" };
  const yourTurn = CLIENT_NEEDS_REVIEW.has(task.stage);
  const context = [task.project_name, task.milestone_name].filter(Boolean).join(" · ");

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="SERVICE REQUEST"
      title={task.title}
      subtitle={context ? <span className="text-xs">{context}</span> : undefined}
      size="info"
    >
      <div className="space-y-4 p-4">
        <span
          className="inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase"
          style={{ background: sc.bg, color: sc.fg }}
        >
          {CLIENT_STAGE_LABEL[task.stage] || task.stage}
        </span>

        {task.description?.trim() ? (
          <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {task.description}
          </div>
        ) : (
          <div className="text-xs italic text-slate-400">No description provided.</div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Documents
          </div>
          {deliverables.length === 0 ? (
            <div className="text-xs italic text-slate-400">No documents attached.</div>
          ) : (
            <ul className="space-y-1">
              {deliverables.map((d) => (
                <li
                  key={d.deliverable_id}
                  className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    📄 {d.title || d.file_name}
                    {d.is_client_supplied ? (
                      <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-700">
                        your markup
                      </span>
                    ) : null}
                  </span>
                  {d.file_url && (
                    <button
                      type="button"
                      onClick={() =>
                        onDownload(
                          `/consulting/deliverables/${d.deliverable_id}/download`,
                          d.file_name || d.title || "document",
                        )
                      }
                      className="flex-shrink-0 font-semibold text-sky-700 hover:underline"
                    >
                      Download
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {yourTurn ? (
          <div className="border-t border-slate-200 pt-3">
            {mode === "idle" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => onAct(task, "approve")}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {acting ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setMode("revision")}
                  className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  Request revision
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    What needs to change? <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="Tell us exactly what to revise — sections, wording, numbers, anything."
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>

                {onAttach && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-2.5">
                    <div className="text-[11px] font-semibold text-slate-700">
                      Marked up the document yourself? (optional)
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      Attach your version and we&apos;ll work from it. It&apos;s added alongside
                      ours — your original copy is never replaced.
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="min-w-0 flex-1 text-[11px] text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAttach}
                        disabled={!file || attaching}
                        className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:bg-slate-300"
                      >
                        {attaching ? "Attaching…" : "Attach"}
                      </button>
                    </div>
                    {attachErr && (
                      <div className="mt-1.5 rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">{attachErr}</div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={acting || !note.trim()}
                    onClick={() => onAct(task, "request_revision", note.trim())}
                    className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-slate-300"
                  >
                    {acting ? "Sending…" : "Send revision request"}
                  </button>
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => { setMode("idle"); setNote(""); }}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
            No action needed from you right now — we&apos;ll notify you when something is ready for
            review.
          </div>
        )}

        {/* Two-way thread. The API returns ONLY external notes to a client, so
            nothing internal can appear here even by accident, and anything the
            client posts is external by definition. */}
        <div className="border-t border-slate-200 pt-3">
          <div className="mb-1.5 text-xs font-semibold text-slate-700">Messages</div>
          {msgErr && (
            <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
              {msgErr}
            </div>
          )}
          {msgs.length === 0 ? (
            <p className="text-[11px] text-slate-400">No messages yet.</p>
          ) : (
            <ul className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
              {msgs.map((m) => {
                const mine = m.author_kind === "client";
                return (
                  <li key={m.comment_id}
                    className={`rounded border px-2 py-1.5 text-xs ${
                      mine ? "border-slate-200 bg-slate-50 text-slate-700"
                           : "border-[#EF6C33]/40 bg-orange-50/60 text-slate-800"
                    }`}>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {mine ? "You" : (m.author_name || "Intelligent Analytics")} ·{" "}
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <textarea
            value={msgDraft}
            onChange={(e) => setMsgDraft(e.target.value)}
            rows={2}
            placeholder="Reply to us — tell us if this still isn't resolved."
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              disabled={!msgDraft.trim() || msgSending}
              onClick={sendMessage}
              className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {msgSending ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

export default ClientTaskDetailModal;
