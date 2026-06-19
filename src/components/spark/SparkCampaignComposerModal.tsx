// SparkCampaignComposerModal — F-90.
//
// Replaces the dead "Create Campaign" button on SparkCampaignsPage. Two-step
// modal: pick channel (Email / SMS), then compose. Saves as draft via
// POST /api/v1/campaigns so the user can refine + send later from the
// campaigns list. Matches the modal-driven creation pattern: one entry
// point, no navigation between pages to start a new campaign.
import { useEffect, useRef, useState, useCallback } from "react";
import { Mail, MessageSquare, ArrowRight, ArrowLeft, Eye } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { MergeTagPicker, renderMergeTagPreview } from "./MergeTagPicker";

type Channel = "email" | "sms";
type Step = "channel" | "compose";

interface List { id: number; name: string; contact_count?: number }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh + (optionally) open the draft. */
  onCreated?: (campaignId: number) => void;
  /**
   * When set, the modal opens in EDIT mode: skips the channel picker, fetches
   * GET /campaigns/:id, prefills the form, and saves with PUT instead of
   * POST. Sending a draft is allowed via the Send button. Backend already
   * supports GET/PUT/POST-send (campaigns.js routes 249/284/372); the modal
   * just wasn't wired for re-open until now (Brandon flagged 2026-06-20:
   * "I can see my test campaign in draft… but I can't open it to edit it
   * and make it active or see the suggestions").
   */
  editCampaignId?: number | null;
}

export function SparkCampaignComposerModal({ open, onClose, onCreated, editCampaignId = null }: Props) {
  const { get, post, put, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    put: <T>(p: string, body: unknown) => Promise<T>;
    ready: boolean;
  };

  const [step, setStep] = useState<Step>("channel");
  const [channel, setChannel] = useState<Channel | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [contentSms, setContentSms] = useState("");
  const [listId, setListId] = useState<number | "">("");

  // Lookups
  const [lists, setLists] = useState<List[]>([]);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Edit mode: the existing campaign row. Status drives what actions are
  // allowed (only 'draft' can be edited or sent; sent/sending/failed render
  // a read-only summary so the user can see what was queued without
  // clobbering it).
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const isEditMode = !!editCampaignId;

  // Refs for MergeTagPicker — used to insert tokens at the cursor position.
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return;
    // Reset baseline. Edit-mode load below will overwrite as needed.
    setStep("channel");
    setChannel(null);
    setName(""); setSubject(""); setFromName(""); setFromEmail(""); setReplyTo("");
    setContentHtml(""); setContentSms(""); setListId("");
    setEditStatus(null);
    setError(null);
    if (!ready) return;
    get<{ data: List[] }>("/api/v1/lists").then((r) => setLists(r?.data || [])).catch(() => setLists([]));

    // Edit mode: GET /campaigns/:id, prefill, skip the channel picker.
    if (editCampaignId) {
      get<{ data: any }>(`/api/v1/campaigns/${editCampaignId}`)
        .then((r) => {
          const c = r?.data;
          if (!c) {
            setError("Couldn't load this campaign.");
            return;
          }
          const t = c.type as Channel;
          setChannel(t);
          setStep("compose");
          setName(c.name || "");
          setSubject(c.subject || "");
          setFromName(c.from_name || "");
          setFromEmail(c.from_email || "");
          setReplyTo(c.reply_to || "");
          setContentHtml(c.content_html || "");
          setContentSms(c.content_sms || "");
          setListId(c.recipient_list_id ?? "");
          setEditStatus(c.status || null);
        })
        .catch((err) => setError(String((err as Error)?.message || err)));
    }
  }, [open, ready, get, editCampaignId]);

  // Esc + click-outside close handled by IadmModal.

  const canSave = useCallback(() => {
    if (!name.trim() || !channel) return false;
    if (channel === "email" && !subject.trim() && !contentHtml.trim()) return false;
    if (channel === "sms" && !contentSms.trim()) return false;
    return true;
  }, [name, channel, subject, contentHtml, contentSms]);

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type: channel,
      recipient_list_id: listId === "" ? null : listId,
    };
    if (channel === "email") {
      payload.subject = subject.trim() || null;
      payload.from_name = fromName.trim() || null;
      payload.from_email = fromEmail.trim() || null;
      payload.reply_to = replyTo.trim() || null;
      payload.content_html = contentHtml || null;
    } else {
      payload.content_sms = contentSms || null;
    }
    return payload;
  }

  async function saveDraft() {
    if (!channel || !canSave()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (isEditMode && editCampaignId) {
        // PUT /campaigns/:id only accepts edits on status='draft' rows; the
        // row-click handler on the list page guards against non-draft, but
        // the backend rejects too if it slips through.
        await put<{ data: { id: number } }>(`/api/v1/campaigns/${editCampaignId}`, payload);
        onCreated?.(editCampaignId);
      } else {
        const r = await post<{ data: { id: number } }>("/api/v1/campaigns", payload);
        onCreated?.(r?.data?.id);
      }
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  // Send a draft NOW — saves any pending edits first, then fires POST
  // /campaigns/:id/send. Only meaningful in edit mode for status='draft'.
  // The button is hidden otherwise.
  async function sendNow() {
    if (!isEditMode || !editCampaignId) return;
    if (!confirm("Send this campaign now? This will go to every recipient on the list.")) return;
    setSending(true);
    setError(null);
    try {
      // Save any pending edits first so the send uses the latest content,
      // then fire the send. Backend's POST /campaigns/:id/send accepts an
      // empty body and returns { sent, failed } stats.
      if (canSave()) {
        await put<{ data: unknown }>(`/api/v1/campaigns/${editCampaignId}`, buildPayload());
      }
      const r = await post<{ data: { sent: number; failed: number } }>(
        `/api/v1/campaigns/${editCampaignId}/send`,
        {},
      );
      onCreated?.(editCampaignId);
      onClose();
      const sent = (r as any)?.data?.sent ?? 0;
      const failed = (r as any)?.data?.failed ?? 0;
      alert(`Campaign sent — ${sent} delivered${failed ? `, ${failed} failed` : ""}.`);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow={
        isEditMode
          ? `SPARK · ${editStatus === "draft" ? "EDIT DRAFT" : `CAMPAIGN · ${(editStatus || "VIEW").toUpperCase()}`}`
          : "SPARK · NEW CAMPAIGN"
      }
      title={
        step === "channel"
          ? "Pick a channel"
          : isEditMode
            ? `${name || "Untitled"} · ${channel?.toUpperCase()}`
            : `Compose · ${channel?.toUpperCase()}`
      }
      subtitle={
        step === "channel"
          ? "Email or SMS — saved as a draft you can refine"
          : isEditMode && editStatus && editStatus !== "draft"
            ? `Read-only — campaigns can only be edited while in draft. Current status: ${editStatus}.`
            : undefined
      }
      // F-107 — dynamic size: nav-sized picker on step 1, info-sized form on
      // step 2. The picker is a 2-card grid; the compose form needs the full
      // standard canvas to match every other SPARK form modal.
      size={step === "channel" ? "nav" : "info"}
      footer={
        <>
          {step === "compose" && !isEditMode && (
            <button
              onClick={() => setStep("channel")}
              className="mr-auto text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
          <IadmButton variant="ghost" onClick={onClose}>
            {isEditMode && editStatus !== "draft" ? "Close" : "Cancel"}
          </IadmButton>
          {step === "compose" && (!isEditMode || editStatus === "draft") && (
            <IadmButton
              variant="accent"
              product="spark"
              onClick={saveDraft}
              disabled={saving || sending || !canSave()}
              icon={<ArrowRight className="h-3 w-3" />}
            >
              {saving ? "Saving…" : isEditMode ? "Save changes" : "Save draft"}
            </IadmButton>
          )}
          {step === "compose" && isEditMode && editStatus === "draft" && (
            <IadmButton
              variant="accent"
              product="spark"
              onClick={sendNow}
              disabled={sending || saving || !canSave()}
            >
              {sending ? "Sending…" : "Send now"}
            </IadmButton>
          )}
        </>
      }
    >
      <div className="p-5">
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
          )}

          {step === "channel" && (
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "email", label: "Email", icon: Mail, blurb: "Open + click tracking, attachments, HTML." },
                { key: "sms",   label: "SMS",   icon: MessageSquare, blurb: "Short, fast, ~160 char per part." },
              ] as Array<{ key: Channel; label: string; icon: typeof Mail; blurb: string }>).map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    onClick={() => { setChannel(c.key); setStep("compose"); }}
                    className="group flex flex-col items-start gap-2 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33] group-hover:bg-[#EF6C33] group-hover:text-white transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="font-semibold text-slate-900">{c.label}</div>
                    <div className="text-xs text-slate-500 leading-snug">{c.blurb}</div>
                  </button>
                );
              })}
            </div>
          )}

          {step === "compose" && channel && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Campaign name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder={channel === "email" ? "Q3 product launch" : "Friday flash sale"}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Recipients (list)</label>
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                >
                  <option value="">— Pick a list (or leave blank for now) —</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.contact_count != null ? ` (${l.contact_count})` : ""}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-0.5">You can change recipients before sending.</p>
              </div>

              {channel === "email" && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-semibold text-slate-500">Subject</label>
                      <MergeTagPicker targetRef={subjectRef} value={subject} onChange={setSubject} compact />
                    </div>
                    <input
                      ref={subjectRef}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject line"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">From name</label>
                      <input
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        placeholder="Your business name"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Reply-to</label>
                      <input
                        value={replyTo}
                        onChange={(e) => setReplyTo(e.target.value)}
                        placeholder="hello@your-domain.com"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-semibold text-slate-500">Body</label>
                      <div className="flex items-center gap-1.5">
                        <button type="button"
                          onClick={() => setShowPreview((v) => !v)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          <Eye className="h-2.5 w-2.5" /> {showPreview ? "Edit" : "Preview"}
                        </button>
                        <MergeTagPicker targetRef={bodyRef} value={contentHtml} onChange={setContentHtml} compact />
                      </div>
                    </div>
                    {showPreview ? (
                      <div
                        className="w-full min-h-[10rem] rounded border border-slate-300 px-3 py-2 text-sm bg-slate-50 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMergeTagPreview(contentHtml) }}
                      />
                    ) : (
                      <textarea
                        ref={bodyRef}
                        value={contentHtml}
                        onChange={(e) => setContentHtml(e.target.value)}
                        rows={6}
                        placeholder={'<p>Hi {{contact.first_name}},</p>'}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      />
                    )}
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Click <span className="font-semibold">Insert</span> to add personalization that fills automatically per recipient.
                    </p>
                  </div>
                </>
              )}

              {channel === "sms" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-semibold text-slate-500">SMS body</label>
                    <MergeTagPicker targetRef={smsRef} value={contentSms} onChange={setContentSms} compact />
                  </div>
                  <textarea
                    ref={smsRef}
                    value={contentSms}
                    onChange={(e) => setContentSms(e.target.value)}
                    rows={4}
                    maxLength={480}
                    placeholder="Keep it short. Up to ~3 segments (480 chars)."
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                    <span>{contentSms.length}/480</span>
                    <span>~{Math.ceil(contentSms.length / 160) || 0} segment(s)</span>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </IadmModal>
  );
}

export default SparkCampaignComposerModal;
