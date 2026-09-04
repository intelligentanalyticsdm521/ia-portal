// SparkLeadModal — the lead, opened from the Lead Inbox row.
//
// LOCKED 2026-09-04 (LEADGEN_POST_CAPTURE_SCOPE §1): the inbox row is the
// BUSINESS, and opening it shows the business card with its people underneath.
// That is how the data is shaped (lumen.lead + lumen.lead_contact) and how a
// salesperson thinks: "Waddle Exteriors — who do I call?"
//
// Built on the SparkContactModal pattern, not the component itself — a contact
// is one person, a lead is a business with several. Tabs:
//   Overview  — name, domain, phone, address, score + the four sub-scores,
//               lifecycle, Source · via Channel, found date, run #
//   Contacts  — every lead_contact: name, title, email + verification badge,
//               phone, LinkedIn; per-person Promote; the primary marked
//   Notes     — free text; "follow up in 7 days" also raises the task
//   Activity  — the system timeline (notes, promotions, lifecycle, emails)
//   Actions   — Promote business, Change lifecycle, Suppress domain, Dismiss
//
// Tier gate (T1/T2): Standard sees the capture facts; Pro and above see points,
// reasons and Hot / Warm / Cold. The server strips the numbers; this hides the
// places they would have gone so the page doesn't render a row of dashes.
//
// Contact quota is spent by PROMOTED contacts only. The modal says so where the
// client decides, because that is the moment the question comes up.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Phone, MapPin, Mail, ExternalLink, FileText, Activity as ActivityIcon,
  Zap, Users, ShieldCheck, ShieldX, ShieldAlert, Plus, Star, Lock, CheckCircle2, Sparkles,
  MessageSquare,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal } from "../IadmModal";
import { rowSourceAndChannel } from "../../lib/leadSource";
import { friendlyApiError } from "../../lib/leadgenBilling";
// The ARGUS Responder's panel — one tab, its own component, so this modal
// stays a modal and the agent surface can grow without it.
import { LeadResponderPanel } from "./LeadResponderPanel";
// Conversations 4 — the website chat behind this lead. One tab, its own
// component, for the same reason the Responder panel is one.
import { LeadChatPanel } from "./LeadChatPanel";
// Conversations 2 + 3 — the texts and the calls behind this lead. One tab, its
// own component, for the same reason the chat has one: the modal stays a modal
// and the channel grows in its own file.
import { LeadTextsCallsPanel } from "./LeadTextsCallsPanel";
// IL-2 — the owner's two-button correction. Its own component so this modal
// stays a modal (see the file header there).
import { LeadCorrectionButtons } from "./LeadCorrectionButtons";
import { LeadRuleChip } from "./LeadRuleChip";

export interface LeadContactRow {
  id: number;
  email: string | null;
  email_confidence: number | null;
  verification_status: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  phone: string | null;
  linkedin_url: string | null;
  is_primary: boolean | number | null;
  promoted?: boolean;
  contact_masked?: boolean;
}

interface LeadNote { id: number; content: string; author: string | null; created_at: string; created_by_organization?: string | null }
interface LeadActivityRow {
  id: number; activity_type: string; summary: string; occurred_at: string;
  actor_user_id?: string | null; actor_organization?: string | null;
}
interface LeadTask { task_id: number; title: string; status: string; due_at: string | null }

export interface LeadDetail {
  id: number;
  domain: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  full_address: string | null;
  composite_score: number | null;
  hot_warm_cold: "hot" | "warm" | "cold" | null;
  score_contact_accessibility: number | null;
  score_business_health: number | null;
  score_findability: number | null;
  score_enrichment_depth: number | null;
  lifecycle_stage: string | null;
  status: string | null;
  source: string | null;
  sources_found: string | null;
  // G-1 (migration 146): what the client named the source and where the person
  // came from, written by the Intake framework. `domain` is now nullable — a
  // person who filled in a lead form has no website.
  source_label?: string | null;
  channel?: string | null;
  kind?: "business" | "person" | null;
  intake_message?: string | null;
  verification_status: string | null;
  created_at: string;
  search_job_id: number | null;
  contact_id: number | null;
  account_id: number | null;
  locked?: boolean | number | null;
  contacts: LeadContactRow[];
  notes: LeadNote[];
  activity: LeadActivityRow[];
  tasks: LeadTask[];
  account: { id: number; name: string; domain: string | null } | null;
}

type Tab = "overview" | "contacts" | "notes" | "conversation" | "textscalls" | "responder" | "activity" | "actions";

// The lead's own ladder. The contact it becomes moves through the SPARK
// workflow separately.
const LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "customer", label: "Customer" },
  { key: "lost", label: "Lost" },
];

const TIER_BADGE: Record<string, string> = {
  hot: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  warm: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  cold: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
};

interface Props {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  /** Called after any change so the inbox list + capacity banner refresh. */
  onChanged?: () => void;
  /** Called when the lead leaves the inbox (suppressed / dismissed). */
  onRemoved?: (leadId: number) => void;
}

export function SparkLeadModal({ leadId, open, onClose, onChanged, onRemoved }: Props) {
  const { get, post, put, ready } = useSparkApi();
  const [tab, setTab] = useState<Tab>("overview");
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [showIntel, setShowIntel] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [followUpDays, setFollowUpDays] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!ready || !leadId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: LeadDetail; meta?: { lead_intelligence?: boolean } }>(`/api/v1/leads/${leadId}`);
      setLead(r.data);
      setShowIntel(r.meta?.lead_intelligence !== false);
      // Default selection = the primary person, matching what Promote does.
      const primary = (r.data.contacts || []).find((c) => !!c.is_primary);
      setSelected(new Set(primary ? [primary.id] : []));
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, leadId]);

  useEffect(() => {
    if (open && leadId) { setTab("overview"); load(); }
    if (!open) { setLead(null); setNewNote(""); setFollowUpDays(""); }
  }, [open, leadId, load]);

  const name = lead?.business_name || lead?.domain || "Lead";
  const locked = !!lead?.locked;

  const subScores = useMemo(() => ([
    { label: "Contact", value: lead?.score_contact_accessibility },
    { label: "Health", value: lead?.score_business_health },
    { label: "Findability", value: lead?.score_findability },
    { label: "Enrichment", value: lead?.score_enrichment_depth },
  ]), [lead]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(null);
    }
  }

  const promote = (ids: number[] | null, createAccount: boolean) => run(
    ids && ids.length === 1 ? `promote-${ids[0]}` : "promote",
    async () => {
      await post(`/api/v1/leads/${leadId}/promote`, {
        ...(ids && ids.length ? { lead_contact_ids: ids } : {}),
        create_account: createAccount,
      });
      await load();
    },
  );

  const changeLifecycle = (stage: string) => run("lifecycle", async () => {
    await put(`/api/v1/leads/${leadId}/lifecycle`, { lifecycle_stage: stage });
    await load();
  });

  const addNote = () => run("note", async () => {
    const days = parseInt(followUpDays, 10);
    await post(`/api/v1/leads/${leadId}/notes`, {
      content: newNote.trim(),
      ...(Number.isFinite(days) && days > 0 ? { follow_up_days: days } : {}),
    });
    setNewNote("");
    setFollowUpDays("");
    await load();
  });

  const suppress = () => {
    if (!lead) return;
    if (!confirm(`Suppress ${lead.domain}? Future searches will skip this business.`)) return;
    void run("suppress", async () => {
      await post(`/api/v1/leads/${leadId}/suppress`, { scope: "domain", reason: "Suppressed from the lead card" });
      onRemoved?.(lead.id);
      onClose();
    });
  };

  const dismiss = () => {
    if (!lead) return;
    void run("dismiss", async () => {
      await post(`/api/v1/leads/${leadId}/dismiss`, {});
      onRemoved?.(lead.id);
      onClose();
    });
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const scoreBadge = showIntel && lead?.composite_score != null ? (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${lead.hot_warm_cold ? TIER_BADGE[lead.hot_warm_cold] : "bg-slate-100 text-slate-600"}`}>
      {lead.composite_score}
      {lead.hot_warm_cold && <span className="ml-1 uppercase opacity-80">{lead.hot_warm_cold}</span>}
    </span>
  ) : null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · LEAD"
      title={loading && !lead ? "Loading…" : name}
      subtitle={lead ? (
        <>
          {/* A person lead has no domain (G-1) — show what we DO know rather
              than a stray separator. */}
          {lead.domain ? `${lead.domain} · ` : lead.email ? `${lead.email} · ` : ""}
          {rowSourceAndChannel(lead)}
        </>
      ) : undefined}
      headerActions={scoreBadge}
      size="info"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 flex-shrink-0">
          {([
            { key: "overview", label: "Overview", icon: Building2 },
            { key: "contacts", label: lead?.contacts?.length ? `Contacts (${lead.contacts.length})` : "Contacts", icon: Users },
            { key: "notes", label: lead?.notes?.length ? `Notes (${lead.notes.length})` : "Notes", icon: FileText },
            { key: "conversation", label: "Conversation", icon: MessageSquare },
            { key: "textscalls", label: "Texts & calls", icon: Phone },
            { key: "responder", label: "Responder", icon: Sparkles },
            { key: "activity", label: "Activity", icon: ActivityIcon },
            { key: "actions", label: "Actions", icon: Zap },
          ] as Array<{ key: Tab; label: string; icon: typeof Building2 }>).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
          )}
          {locked && (
            <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <Lock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                The invoice for this lead's search run is unpaid, so the email and phone are hidden and the
                lead can't be promoted yet. Pay it under Lead Inbox → Billing.
              </span>
            </div>
          )}
          {loading && !lead && <div className="text-sm text-slate-500">Loading…</div>}

          {/* ── Overview ─────────────────────────────────────────────── */}
          {tab === "overview" && lead && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Building2} label="Business">{lead.business_name || "—"}</Field>
                <Field icon={Mail} label="Domain">{lead.domain}</Field>
                <Field icon={Phone} label="Phone">{lead.phone || "—"}</Field>
                <Field icon={MapPin} label="Address">{lead.full_address || "—"}</Field>
              </div>

              {showIntel ? (
                <div>
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Score</h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900">{lead.composite_score ?? "—"}</span>
                      {lead.hot_warm_cold && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TIER_BADGE[lead.hot_warm_cold]}`}>
                          {lead.hot_warm_cold}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {subScores.map((s) => (
                        <div key={s.label} className="rounded bg-slate-50 px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{s.label}</div>
                          <div className="text-sm font-semibold text-slate-800 tabular-nums">{s.value ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // T1: Standard gets the inbox and the capture facts, not the scoring.
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Lead scoring — points, the reasons behind them, and Hot / Warm / Cold — comes with{" "}
                  <strong className="text-slate-800">SPARK Pro</strong>.
                </div>
              )}

              {/* IL-2 — the owner can overrule the score, right where it is shown. */}
              {showIntel && (
                <LeadCorrectionButtons leadId={lead.id} onChanged={() => { void load(); onChanged?.(); }} />
              )}

              {/* IL-3 — what the owner's OWN rules did to this inquiry, and the
                  two buttons when one of them is holding it. Renders nothing at
                  all when the rules had nothing to say. */}
              {showIntel && (
                <LeadRuleChip leadId={lead.id} onChanged={() => { void load(); onChanged?.(); }} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Lifecycle">{titleCase(lead.lifecycle_stage || "lead")}</Field>
                <Field label="Source">{rowSourceAndChannel(lead)}</Field>
                <Field label="Found">{new Date(lead.created_at).toLocaleDateString()}</Field>
                <Field label="Run">{lead.search_job_id ? `#${lead.search_job_id}` : "—"}</Field>
              </div>

              {/* What the person actually said. Only an Intake / Inbound lead
                  has this (a B2B search lead was never asked a question), so
                  the block is absent rather than empty for everything else. */}
              {lead.intake_message && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                    What they told you
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-slate-800">{lead.intake_message}</div>
                </div>
              )}

              {lead.account && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  In your CRM as the business <strong>{lead.account.name}</strong>.
                </div>
              )}

              {lead.tasks?.length > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Follow-ups</h3>
                  <ul className="space-y-1">
                    {lead.tasks.map((t) => (
                      <li key={t.task_id} className="flex items-baseline justify-between gap-3 rounded bg-slate-50 px-2.5 py-1.5 text-xs">
                        <span className="text-slate-800">{t.title}</span>
                        <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
                          {t.status === "open" ? "due " : ""}{t.due_at ? new Date(t.due_at).toLocaleDateString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Contacts ─────────────────────────────────────────────── */}
          {tab === "contacts" && lead && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Everyone we found at this business. Promoting a person is what adds them to your Contacts —
                the rest sit here and cost you nothing.
              </p>
              {(lead.contacts || []).length === 0 && (
                <div className="text-sm text-slate-500 italic">No named people on this business yet.</div>
              )}
              <ul className="space-y-2">
                {(lead.contacts || []).map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed"}
                          </span>
                          {!!c.is_primary && (
                            <span title="Primary contact — promoted by default" className="inline-flex items-center gap-1 rounded-full bg-[#EF6C33]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#B84817]">
                              <Star className="h-2.5 w-2.5" /> Primary
                            </span>
                          )}
                          <VerifyBadge status={c.verification_status} />
                          {c.promoted && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                              In Contacts
                            </span>
                          )}
                        </div>
                        {c.position && <div className="text-[11px] text-slate-500">{c.position}</div>}
                        <div className="mt-1 space-y-0.5 text-xs text-slate-700">
                          {c.email && <div className="truncate"><Mail className="inline h-3 w-3 mr-1 text-slate-400" />{c.email}</div>}
                          {c.phone && <div><Phone className="inline h-3 w-3 mr-1 text-slate-400" />{c.phone}</div>}
                          {c.linkedin_url && (
                            <div className="truncate">
                              <ExternalLink className="inline h-3 w-3 mr-1 text-slate-400" />
                              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-[#EF6C33] hover:underline">LinkedIn</a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            className="rounded border-slate-300"
                          />
                          Include
                        </label>
                        <button
                          type="button"
                          disabled={!!busy || c.promoted || locked}
                          onClick={() => promote([c.id], false)}
                          title={locked ? "Locked until the invoice for this run is paid." : "Add just this person to Contacts"}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {c.promoted ? "Promoted" : busy === `promote-${c.id}` ? "Promoting…" : "Promote"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {(lead.contacts || []).length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    {selected.size} selected — {selected.size === 1 ? "1 contact" : `${selected.size} contacts`} of your quota.
                  </span>
                  <button
                    type="button"
                    disabled={!!busy || selected.size === 0 || locked}
                    onClick={() => promote([...selected], true)}
                    className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-50"
                  >
                    {busy === "promote" ? "Promoting…" : "Promote business + selected"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Notes ────────────────────────────────────────────────── */}
          {tab === "notes" && lead && (
            <div className="space-y-3">
              <div>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Called, talked to the owner, follow up in 7 days…"
                  rows={3}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    Follow up in
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={followUpDays}
                      onChange={(e) => setFollowUpDays(e.target.value)}
                      placeholder="—"
                      className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                    days
                    <span className="text-slate-400">(or just say so in the note)</span>
                  </label>
                  <button
                    onClick={addNote}
                    disabled={!!busy || !newNote.trim()}
                    className="text-xs px-3 py-1 rounded bg-[#EF6C33] text-white disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> {busy === "note" ? "Adding…" : "Add note"}
                  </button>
                </div>
              </div>
              {(lead.notes || []).length > 0 ? (
                <ul className="space-y-2">
                  {lead.notes.map((n) => (
                    <li key={n.id} className="rounded bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-700 whitespace-pre-wrap">{n.content}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {actorLabel(n.created_by_organization, n.author)} · {new Date(n.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-500 italic">No notes yet.</div>
              )}
            </div>
          )}

          {/* ── Activity ─────────────────────────────────────────────── */}
          {tab === "activity" && lead && (
            <div>
              {(lead.activity || []).length === 0 ? (
                <div className="text-sm text-slate-500 italic">
                  Nothing yet. Notes, promotions, lifecycle changes and emails to this business land here.
                </div>
              ) : (
                <ul className="space-y-2">
                  {lead.activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900">{activityLabel(a.activity_type)}</div>
                        <div className="text-[11px] text-slate-600">{a.summary}</div>
                        <div className="text-[10px] text-slate-400">{actorLabel(a.actor_organization, a.actor_user_id)}</div>
                      </div>
                      <div className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                        {new Date(a.occurred_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Conversation ─────────────────────────────────────────── */}
          {tab === "conversation" && lead && (
            <LeadChatPanel leadId={lead.id} onChanged={onChanged} />
          )}

          {/* ── Responder ────────────────────────────────────────────── */}
          {tab === "textscalls" && lead && (
            <LeadTextsCallsPanel leadId={lead.id} onChanged={onChanged} />
          )}

          {tab === "responder" && lead && (
            <LeadResponderPanel leadId={lead.id} onChanged={onChanged} />
          )}

          {/* ── Actions ──────────────────────────────────────────────── */}
          {tab === "actions" && lead && (
            <div className="space-y-4">
              <ActionRow
                title="Promote business"
                body="Creates the business in your CRM and adds the people you picked on the Contacts tab. Only promoted people count against your contact plan."
              >
                <button
                  type="button"
                  disabled={!!busy || locked}
                  onClick={() => promote(selected.size ? [...selected] : null, true)}
                  className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-50"
                >
                  {busy === "promote" ? "Promoting…" : lead.account ? "Promote more people" : "Promote business"}
                </button>
              </ActionRow>

              <ActionRow title="Change lifecycle" body="Where this business is in your sales conversation.">
                <div className="flex flex-wrap gap-1.5">
                  {LIFECYCLE.map((s) => {
                    const current = String(lead.lifecycle_stage || "lead").toLowerCase() === s.key
                      || (s.key === "new" && String(lead.lifecycle_stage || "lead").toLowerCase() === "lead");
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={!!busy || current}
                        onClick={() => changeLifecycle(s.key)}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-100 ${
                          current ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </ActionRow>

              <ActionRow
                title="Suppress domain"
                body="Blocks this business from every future search and every outbound send. Use it for competitors and for anyone who asks not to be contacted."
              >
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={suppress}
                  className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy === "suppress" ? "Suppressing…" : "Suppress domain"}
                </button>
              </ActionRow>

              <ActionRow
                title="Dismiss"
                body="Takes it out of your inbox without blocking the business. Frees up inbox space."
              >
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={dismiss}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
                </button>
              </ActionRow>
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

function Field({ icon: Icon, label, children }: { icon?: typeof Building2; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm text-slate-800 break-words">
        {Icon && <Icon className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5 text-slate-400" />}
        {children}
      </div>
    </div>
  );
}

function ActionRow({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-md">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{body}</div>
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    </div>
  );
}

function VerifyBadge({ status }: { status: string | null }) {
  if (status === "promoted" || status === "valid") {
    return (
      <span title="Verified — passed the SMTP probe and domain freshness check." className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
        <ShieldCheck className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }
  if (status === "suppressed" || status === "invalid") {
    return (
      <span title="Failed verification." className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold uppercase text-rose-700">
        <ShieldX className="h-2.5 w-2.5" /> Failed
      </span>
    );
  }
  if (!status) return null;
  return (
    <span title="Not confirmed either way." className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">
      <ShieldAlert className="h-2.5 w-2.5" /> Unverified
    </span>
  );
}

/** Audit attribution: an IA consultant reads with the agency name; your own
 *  people read as themselves. */
function actorLabel(organization: string | null | undefined, who: string | null | undefined): string {
  const person = who || "—";
  return organization ? `${organization} — ${person}` : person;
}

const ACTIVITY_LABELS: Record<string, string> = {
  note_added: "Note added",
  follow_up_scheduled: "Follow-up scheduled",
  lifecycle_changed: "Lifecycle changed",
  promoted: "Promoted to Contacts",
  contact_promoted: "Contact promoted",
  suppressed: "Domain suppressed",
  dismissed: "Dismissed",
  moved_to_contacts: "Moved to Contacts",
  removed_from_inbox: "Removed from the inbox",
  email_sent: "Email sent",
};
function activityLabel(key: string): string {
  return ACTIVITY_LABELS[key] || titleCase(key.replace(/_/g, " "));
}
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default SparkLeadModal;
