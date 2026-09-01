// TaskModal — the agency task view (2026-08-08).
//
// Brandon: "designed like a mini project modal... I should just be able to open
// it, have a description of what this is, the details, and it's current status.
// I don't really like the word plan... think JIRA style."
//
// One modal, two tabs:
//   Overview — what it is and where it is: title, description, STATUS, owner, dates
//   Details  — planning fields, track record, and internal notes
// "Plan" is gone as a word and as a separate button.
//
// Deliberately NOT an extension of TaskDetailModal: that component is shared with
// the CLIENT modal, and agency planning must never surface on a client screen.
import { useEffect, useRef, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import {
  TASK_STAGE_LABELS, TASK_STATUS_LABELS, taskActionsFor, allTaskMoves } from "../../components/consulting/ConsultingProjectModal";
import type { WorkRow, ReleaseRow, WorkerRow, WorkMeta } from "./workTypes";
import { PLATFORM_LABEL } from "./workTypes";

/** One stage change from consulting.request_status_event. */
interface StatusEvent {
  event_id: string;
  from_stage?: string | null; from_status?: string | null;
  to_stage: string; to_status: string;
  changed_at: string;
  actor_name?: string | null;
}

interface CommentRow {
  comment_id: number; author_name?: string | null; body: string; created_at: string;
  /** true = agency-only note; false = message the client can read. */
  is_internal?: boolean | number;
  /** 'provider' (agency) or 'client'. */
  author_kind?: string | null;
}

export function TaskModal({ row, releases, workers, meta, projects, onClose, onSaved }: {
  row: WorkRow; releases: ReleaseRow[]; workers: WorkerRow[]; meta: WorkMeta | null;
  projects: Array<{ project_id: string; name: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const { getFounder, patchFounder, postFounder, uploadFounder } = useOliverApi();
  const unit = meta?.estimate_unit || "hours";
  const [tab, setTab] = useState<"overview" | "details" | "activity">("overview");

  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description || "");
  const [workerId, setWorkerId] = useState(row.assigned_to_worker_id || "");
  const [startAt, setStartAt] = useState(row.start_at ? String(row.start_at).slice(0, 10) : "");
  const [dueAt, setDueAt] = useState(row.due_at ? String(row.due_at).slice(0, 10) : "");
  const [platform, setPlatform] = useState(row.platform || "");
  const [priority, setPriority] = useState(row.priority || "");
  const [hours, setHours] = useState(row.estimate_hours != null ? String(row.estimate_hours) : "");
  const [size, setSize] = useState(row.estimate_size || "");
  const [releaseId, setReleaseId] = useState(row.release_id || "");
  const [projectId, setProjectId] = useState(row.project_id || "");
  const [newTag, setNewTag] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [events, setEvents] = useState<StatusEvent[]>([]);

  useEffect(() => {
    getFounder<CommentRow[]>(`/consulting/requests/${row.id}/comments`)
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => { /* notes are additive; absence is not an error */ });
    // Stage history — recorded since migration 151, surfaced here for the
    // first time. This is the approval proof: a client moving something to
    // approved leaves a row with their user on it.
    getFounder<StatusEvent[]>(`/consulting/requests/${row.id}/events`)
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => { /* same — an empty history must not break the modal */ });
  }, [getFounder, row.id]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await patchFounder(`/consulting/requests/${row.id}`, {
        title: title.trim() || row.title,
        description: description.trim() || null,
        assigned_to_worker_id: workerId || null,
        start_at: startAt || null,
        due_at: dueAt || null,
        platform: platform || null,
        priority: priority || null,
        estimate_hours: hours === "" ? null : Number(hours),   // blank stays NULL = not sized
        estimate_size: size || null,
        release_id: releaseId || null,
        project_id: projectId || null,
      });
      if (newTag.trim()) await postFounder(`/consulting/requests/${row.id}/tags`, { tag: newTag.trim() });
      onSaved();
    } catch (e) { setErr((e as Error).message || "Save failed."); }
    finally { setBusy(false); }
  };

  // One thread, two send actions. is_internal=true stays with the agency;
  // is_internal=false is a message the client reads in their portal, and it
  // emails them. The API treats an omitted flag as internal, so this must
  // always send it explicitly.
  const [sending, setSending] = useState<"internal" | "external" | null>(null);
  const addComment = async (isInternal: boolean) => {
    const b = newComment.trim();
    if (!b || sending) return;
    setSending(isInternal ? "internal" : "external");
    setErr(null);
    try {
      await postFounder(`/consulting/requests/${row.id}/comments`, { body: b, is_internal: isInternal });
      setNewComment("");
      const d = await getFounder<CommentRow[]>(`/consulting/requests/${row.id}/comments`);
      setComments(Array.isArray(d) ? d : []);
    } catch (e) { setErr((e as Error).message || "Could not add note."); }
    finally { setSending(null); }
  };

  // Attach a deliverable straight to the ticket. Same endpoint the project
  // modal already used (ConsultingProjectModal), which the work board's modal
  // never got — so a task created off a client request had no way to receive a
  // document at all. The backend stamps service_request_id, the request's
  // project_id, and the CLIENT's tenant_id, so one upload lands on the ticket,
  // the linked project, and the client's Deliverables library at once.
  const [file, setFile] = useState<File | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attach = async () => {
    if (!file || attaching) return;
    setAttaching(true); setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      await uploadFounder(`/consulting/requests/${row.id}/deliverables`, form);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onSaved();   // refresh so the new deliverable shows on the card + modal
    } catch (e) {
      setErr((e as Error).message || "Could not attach the document.");
    } finally { setAttaching(false); }
  };

  const changeStatus = async (value: string) => {
    const [stage, status] = value.split("|");
    if (!stage || !status) return;
    setBusy(true); setErr(null);
    try { await patchFounder(`/consulting/requests/${row.id}`, { stage, status }); onSaved(); }
    catch (e) { setErr((e as Error).message || "Transition failed."); setBusy(false); }
  };

  const f = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const l = "mb-1 block text-xs font-medium text-slate-600";
  const tabCls = (t: string) =>
    `px-3 py-1.5 text-xs font-semibold border-b-2 ${tab === t
      ? "border-[#EF6C33] text-slate-900"
      : "border-transparent text-slate-500 hover:text-slate-700"}`;

  return (
    <IadmModal open onClose={onClose} product="oliver" title="Task"
      subtitle={row.client_label
        ? (row.project_name ? `${row.client_label} · ${row.project_name}` : row.client_label)
        : (row.project_name || "Internal")} size="lg">
      <div className="p-1">
        <div className="mb-3 flex gap-1 border-b border-slate-200">
          <button type="button" className={tabCls("overview")} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" className={tabCls("details")} onClick={() => setTab("details")}>Details</button>
          <button type="button" className={tabCls("activity")} onClick={() => setTab("activity")}>
            Activity{events.length > 0 && <span className="ml-1 text-slate-400">({events.length})</span>}
          </button>
        </div>

        {tab === "overview" ? (
          <div className="space-y-3">
            {/* WHO this is for, and when it came in. Neither was shown before:
                a request filed by a client had no project and no linked
                contact, so the modal fell through to the "Internal" default and
                a genuine client ticket read as internal work. client_label is
                resolved server-side (agency's own tenant => "Internal",
                otherwise the client's business name). */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={l}>Client</label>
                <div className={`${f} bg-slate-50 ${row.is_internal ? "text-slate-500" : "font-medium text-slate-800"}`}>
                  {row.client_label || "—"}
                  {row.origin === "client" && (
                    <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      they filed this
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className={l}>Filed</label>
                <div className={`${f} bg-slate-50 text-slate-700`}>
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                </div>
              </div>
            </div>

            <div>
              <label className={l}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={f} />
            </div>
            <div>
              <label className={l}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                placeholder="What is this, and what does done look like?" className={f} />
            </div>

            {/* Status sits in Overview because moving the work is the most common
                reason to open a task at all. */}
            <div>
              <label className={l}>Status</label>
              <select value={`${row.stage}|${row.status}`} disabled={busy}
                onChange={(e) => changeStatus(e.target.value)} className={f}>
                <option value={`${row.stage}|${row.status}`}>
                  {TASK_STAGE_LABELS[row.stage] || row.stage} — {TASK_STATUS_LABELS[row.status] || row.status}
                </option>
                {allTaskMoves().map((g) => (
                  <optgroup key={g.stage} label={g.label}>
                    {g.options
                      .filter((o) => o.value !== `${row.stage}|${row.status}`)
                      .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
              {(row.days_in_stage ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">{row.days_in_stage} days in this stage</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={l}>Owner</label>
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={f}>
                  <option value="">Unassigned</option>
                  {workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className={l}>Start</label>
                <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={f} />
              </div>
              <div>
                <label className={l}>Due</label>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={f} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Start and due together let capacity spread across days rather than spiking on one.
            </p>

            <div>
              <label className={l}>
                Deliverables{" "}
                <span className="font-normal text-slate-400">
                  (also files to the linked project and the client&apos;s library)
                </span>
              </label>
              {(row.deliverables || []).length > 0 && (
                <ul className="mb-2 space-y-1">
                  {(row.deliverables || []).map((d) => (
                    <li key={d.deliverable_id}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
                      {d.title || d.file_name}
                      {d.is_client_supplied ? (
                        <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          from client
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
                />
                <button
                  type="button"
                  onClick={attach}
                  disabled={!file || attaching}
                  className="flex-shrink-0 rounded-md bg-[#EF6C33] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {attaching ? "Uploading…" : "Attach"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Uploads land as <strong>pending</strong> — send it for client review to share it.
              </p>
            </div>
          </div>
        ) : tab === "details" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={l}>Estimate {unit === "hours" ? "(hours)" : "(size)"}</label>
                {unit === "hours" ? (
                  <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
                    placeholder="blank = not sized" className={f} />
                ) : (
                  <select value={size} onChange={(e) => setSize(e.target.value)} className={f}>
                    <option value="">not sized</option>
                    {(meta?.estimate_sizes || []).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Blank means <strong>not sized</strong> — never counted as zero.
                </p>
              </div>
              <div>
                <label className={l}>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={f}>
                  <option value="">—</option>
                  {(meta?.priorities || []).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={l}>Release</label>
                <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className={f}>
                  <option value="">No release</option>
                  {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
                </select>
              </div>
              <div>
                <label className={l}>Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={f}>
                  <option value="">—</option>
                  {(meta?.platforms || []).map((x) => <option key={x} value={x}>{PLATFORM_LABEL[x] || x}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={l}>Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={f}>
                <option value="">No project</option>
                {projects.map((x) => <option key={x.project_id} value={x.project_id}>{x.name}</option>)}
              </select>
            </div>

            {/* The raw material for the reporting Brandon described: "client xyz
                is always delivered late", "Billy's tasks always get 2-3 more
                review revisions". Revision rounds come from the 151 event trail;
                lateness needs completed_at, which is why 152 added it. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="mb-1 font-semibold text-slate-700">Track record</div>
              <div>Revision rounds: <strong>{row.revision_count ?? 0}</strong></div>
              {row.completed_at ? (
                <div>
                  Finished {new Date(row.completed_at).toLocaleDateString()}
                  {row.days_late != null && (
                    <strong className={row.days_late > 0 ? "text-red-600" : "text-emerald-700"}>
                      {" · "}{row.days_late > 0 ? `${row.days_late}d late` : `${Math.abs(row.days_late)}d early`}
                    </strong>
                  )}
                </div>
              ) : (
                <div className="text-slate-400">Not finished yet</div>
              )}
            </div>

            <div>
              <label className={l}>Add tag</label>
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
                placeholder="gate, blocked-on-data…" className={f} />
              {(row.tags || []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(row.tags || []).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{t}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={l}>
                Notes{" "}
                <span className="font-normal text-slate-400">
                  (one thread — each note is flagged internal or external)
                </span>
              </label>
              <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)}
                rows={2} placeholder="Write a note…" className={f} />
              <div className="mt-1.5 flex items-center gap-2">
                <button type="button" onClick={() => addComment(true)}
                  disabled={!newComment.trim() || !!sending}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40">
                  {sending === "internal" ? "Adding…" : "Add internal"}
                </button>
                <button type="button" onClick={() => addComment(false)}
                  disabled={!newComment.trim() || !!sending}
                  className="rounded-md bg-[#EF6C33] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">
                  {sending === "external" ? "Sending…" : "Send external"}
                </button>
                <span className="text-[10px] text-slate-400">
                  External is visible to the client and emails them.
                </span>
              </div>
              {comments.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {comments.map((c) => {
                    const internal = c.is_internal !== false && c.is_internal !== 0;
                    const fromClient = c.author_kind === "client";
                    return (
                      <li key={c.comment_id}
                        className={`rounded border px-2 py-1 text-xs ${
                          internal
                            ? "border-slate-200 bg-white text-slate-700"
                            : "border-[#EF6C33]/40 bg-orange-50/60 text-slate-800"
                        }`}>
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            internal ? "bg-slate-100 text-slate-600" : "bg-[#EF6C33] text-white"
                          }`}>
                            {internal ? "INTERNAL" : "EXTERNAL"}
                          </span>
                          {fromClient && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              from client
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap">{c.body}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {c.author_name || (fromClient ? "Client" : "Agency")} · {new Date(c.created_at).toLocaleString()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          /* Activity — the stage-change audit trail. This is where a client
             approval shows up with their name and timestamp, which previously
             existed only as a row nobody read. */
          <div>
            {events.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                No stage changes recorded yet.
              </p>
            ) : (
              <ol className="max-h-80 space-y-1.5 overflow-y-auto">
                {events.map((e) => {
                  const byClient = /@/.test(e.actor_name || "") || e.to_stage === "approved";
                  return (
                    <li key={e.event_id}
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.from_stage && (
                          <>
                            <span className="text-slate-500">
                              {TASK_STAGE_LABELS[e.from_stage] || e.from_stage}
                            </span>
                            <span className="text-slate-300">→</span>
                          </>
                        )}
                        <span className="font-semibold text-slate-800">
                          {TASK_STAGE_LABELS[e.to_stage] || e.to_stage}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({TASK_STATUS_LABELS[e.to_status] || e.to_status})
                        </span>
                        {e.to_stage === "approved" && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            APPROVED
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {e.actor_name || "system"}
                        {byClient && e.to_stage === "approved" ? " (client)" : ""} ·{" "}
                        {new Date(e.changed_at).toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {err && <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Close</button>
          <button type="button" onClick={save} disabled={busy}
            className="rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

export default TaskModal;
