// SparkCampaignComposerModal — F-90.
//
// Replaces the dead "Create Campaign" button on SparkCampaignsPage. Two-step
// modal: pick channel (Email / SMS), then compose. Saves as draft via
// POST /api/v1/campaigns so the user can refine + send later from the
// campaigns list. Matches the modal-driven creation pattern: one entry
// point, no navigation between pages to start a new campaign.
import { useEffect, useState, useCallback } from "react";
import { X, Mail, MessageSquare, ArrowRight, ArrowLeft } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

type Channel = "email" | "sms";
type Step = "channel" | "compose";

interface List { id: number; name: string; contact_count?: number }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh + (optionally) open the draft. */
  onCreated?: (campaignId: number) => void;
}

export function SparkCampaignComposerModal({ open, onClose, onCreated }: Props) {
  const { get, post, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
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
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("channel");
    setChannel(null);
    setName(""); setSubject(""); setFromName(""); setFromEmail(""); setReplyTo("");
    setContentHtml(""); setContentSms(""); setListId("");
    setError(null);
    if (ready) {
      get<{ data: List[] }>("/api/v1/lists").then((r) => setLists(r?.data || [])).catch(() => setLists([]));
    }
  }, [open, ready, get]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSave = useCallback(() => {
    if (!name.trim() || !channel) return false;
    if (channel === "email" && !subject.trim() && !contentHtml.trim()) return false;
    if (channel === "sms" && !contentSms.trim()) return false;
    return true;
  }, [name, channel, subject, contentHtml, contentSms]);

  async function saveDraft() {
    if (!channel || !canSave()) return;
    setSaving(true);
    setError(null);
    try {
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
      const r = await post<{ data: { id: number } }>("/api/v1/campaigns", payload);
      onCreated?.(r?.data?.id);
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spark-campaign-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-gradient-to-r from-[#0B1C24] to-[#1a3540] text-white">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">New campaign</div>
            <h2 id="spark-campaign-modal-title" className="text-base font-semibold">
              {step === "channel" ? "Pick a channel" : `Compose · ${channel?.toUpperCase()}`}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
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
                    <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Subject</label>
                    <input
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
                    <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Body (HTML)</label>
                    <textarea
                      value={contentHtml}
                      onChange={(e) => setContentHtml(e.target.value)}
                      rows={6}
                      placeholder={'<p>Hi {{contact.first_name}},</p>'}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">A richer block editor is available after saving the draft — this field is fine for a stub.</p>
                  </div>
                </>
              )}

              {channel === "sms" && (
                <div>
                  <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">SMS body</label>
                  <textarea
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            {step === "compose" && (
              <button
                onClick={() => setStep("channel")}
                className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            {step === "compose" && (
              <button
                onClick={saveDraft}
                disabled={saving || !canSave()}
                className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1"
              >
                {saving ? "Saving…" : "Save draft"} <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SparkCampaignComposerModal;
