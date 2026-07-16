// SparkCampaignComposerModal — F-90.
//
// Replaces the dead "Create Campaign" button on SparkCampaignsPage. Two-step
// modal: pick channel (Email / SMS), then compose. Saves as draft via
// POST /api/v1/campaigns so the user can refine + send later from the
// campaigns list. Matches the modal-driven creation pattern: one entry
// point, no navigation between pages to start a new campaign.
import { useEffect, useRef, useState, useCallback } from "react";
import { Mail, MessageSquare, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAppState } from "../../app/AppState";
import { isPlatformOwner } from "../../lib/currentPlan";
import { IadmModal, IadmButton } from "../IadmModal";
import { MergeTagPicker, useMergeTagAutoComplete } from "./MergeTagPicker";
import { SparkSuggestionsPanel } from "./SparkSuggestionsPanel";
import { SparkBodyEditor } from "./SparkBodyEditor";
import { CTAEditorBlock, ctaToBlock, autoContrastColor, type CTAValue } from "./CTAEditorBlock";

// Render a CTAValue into the inline HTML that gets appended to the email
// body. Mirrors the LUMEN-API emailBuilder button block output so the
// editor preview + the inbox preview stay visually consistent.
function ctaValueToHtml(v: CTAValue): string {
  const block = ctaToBlock(v) as Record<string, unknown>;
  if (block.type === "paragraph") {
    const align = (v.align || "center") as string;
    return `<p style="text-align:${align};">${block.html as string}</p>`;
  }
  const align = (v.align || "center") as string;
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const radius = v.borderRadius ?? 6;
  const width = v.width || "fit";
  const bg = v.buttonColor || "#1A3A4A";
  const color = v.textColor || autoContrastColor(bg);
  const label = (v.label || "Click here")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const url = (v.url || "#").replace(/"/g, "&quot;");
  return (
    `<p style="display:flex;justify-content:${justify};">`
    + `<a href="${url}" style="display:inline-block;`
    + `background:${bg};color:${color};padding:12px 24px;`
    + `border-radius:${radius}px;font-weight:600;font-size:16px;`
    + `text-decoration:none;text-align:center;`
    + (width === "full" ? "width:100%;" : "")
    + `">${label}</a></p>`
  );
}

interface Sender {
  id: number;
  display_name: string | null;
  effective_display_name?: string | null;
  email_address: string;
  reply_to_override: string | null;
  is_default: boolean;
  // 2026-06-24 — true for the IA shared defaults (noreply/welcome/support/
  // hello/notifications @ ia-dm.com) that the backend UNIONs into every
  // tenant's GET /senders response. Used here to label the option as
  // "(IA shared)" so the user understands they're sending from the
  // platform domain, not their own branded one.
  is_system?: boolean;
  // local_part is returned by GET /senders — needed so we can find the
  // canonical IA `noreply` fallback when no tenant-owned default exists.
  local_part?: string;
}

interface Signature {
  id: number;
  name: string;
  body_html: string | null;
  body_text: string | null;
  is_default: boolean;
}

type Channel = "email" | "sms";
type Step = "channel" | "compose";
// Inner tab inside the "compose" step. "Compose" is the existing form;
// "suggestions" is the F-CS.2 IL panel.
type ComposeTab = "compose" | "suggestions";

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
  /**
   * Optional contact context. When set, the IL Suggestions tab filters to
   * suggestions for this specific contact (e.g. opened from a contact card).
   * Otherwise the tab lists all open tenant-level suggestions.
   */
  contactId?: number | null;
  /**
   * SP-5 — when opened fresh (not edit mode) with a preset list, seed the
   * recipient list so a "Send" click from the Lists page lands in the
   * composer already targeting that list. Ignored in edit mode (the loaded
   * campaign's own recipient_list_id wins).
   */
  presetListId?: number | null;
}

export function SparkCampaignComposerModal({ open, onClose, onCreated, editCampaignId = null, contactId = null, presetListId = null }: Props) {
  const { get, post, put, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    put: <T>(p: string, body: unknown) => Promise<T>;
    ready: boolean;
  };
  const oliverApi = useOliverApi() as { get: <T>(p: string) => Promise<T> };

  // F-CS.2 — IL Suggestions tab is Pro/Business only. Platform owner always
  // qualifies (see lib/currentPlan.ts). We fetch /api/v1/usage when the modal
  // opens to learn the tenant's current feature tier; while we don't have a
  // value yet, the tab stays hidden so we don't flash it for Standard users.
  const { activeTenantId } = useAppState();
  const [tenantTier, setTenantTier] = useState<string | null>(null);
  const suggestionsAllowed = isPlatformOwner(activeTenantId)
    || tenantTier === "pro"
    || tenantTier === "business";

  const [step, setStep] = useState<Step>("channel");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [composeTab, setComposeTab] = useState<ComposeTab>("compose");
  const [hasSuggestions, setHasSuggestions] = useState(false);
  // Show the tab if (a) tier qualifies AND (b) there are open suggestions
  // OR a contact context was passed in (so the user can ALWAYS see the empty
  // state when they explicitly opened the composer in a contact's context).
  const showSuggestionsTab = suggestionsAllowed && (hasSuggestions || !!contactId);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [contentText, setContentText] = useState("");
  const [contentSms, setContentSms] = useState("");
  const [listId, setListId] = useState<number | "">("");
  // Campaign Composer v1.1 picker fields (locked 2026-06-24). When the user
  // selects a sender, fromName + fromEmail mirror that row (read-only for
  // backward compat with the legacy free-text columns).
  const [senderId, setSenderId] = useState<number | "">("");
  const [signatureId, setSignatureId] = useState<number | "">("");

  // Lookups
  const [lists, setLists] = useState<List[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);

  // CTA editor — opened from the SparkBodyEditor toolbar. On save, the
  // rendered CTA HTML is appended to contentHtml; SparkBodyEditor's
  // setContent useEffect picks up the change and re-renders the editor.
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaValue, setCtaValue] = useState<CTAValue>({
    type: "button",
    label: "",
    url: "",
    align: "center",
    width: "fit",
    borderRadius: 6,
  });
  const [brandColors, setBrandColors] = useState<{ primary?: string; secondary?: string; accent?: string }>({});

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Edit mode: the existing campaign row. Status drives what actions are
  // allowed (only 'draft' can be edited or sent; sent/sending/failed render
  // a read-only summary so the user can see what was queued without
  // clobbering it).
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const isEditMode = !!editCampaignId;

  // Refs for MergeTagPicker — used to insert tokens at the cursor position
  // of the input/textarea fields (subject + SMS body). The email body is
  // owned by SparkBodyEditor (TipTap), which has its own merge-tag inserter.
  const subjectRef = useRef<HTMLInputElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const replyToRef = useRef<HTMLInputElement>(null);

  // "{{" keystroke triggers — opens a small floating picker under each
  // input. The toolbar Insert button still works as a fallback. See
  // useMergeTagAutoComplete in MergeTagPicker.tsx. (The "From" field is a
  // sender picker, not a free-text input, so no autocomplete needed there.)
  const subjectAutoTag = useMergeTagAutoComplete({
    targetRef: subjectRef, value: subject, onChange: setSubject,
  });
  const smsAutoTag = useMergeTagAutoComplete({
    targetRef: smsRef, value: contentSms, onChange: setContentSms,
  });
  const replyToAutoTag = useMergeTagAutoComplete({
    targetRef: replyToRef, value: replyTo, onChange: setReplyTo,
  });

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return;
    // Reset baseline. Edit-mode load below will overwrite as needed.
    setStep("channel");
    setChannel(null);
    setComposeTab("compose");
    setHasSuggestions(false);
    setName(""); setSubject(""); setFromName(""); setFromEmail(""); setReplyTo("");
    setContentHtml(""); setContentText(""); setContentSms(""); setListId("");
    setSenderId(""); setSignatureId("");
    setEditStatus(null);
    setError(null);
    if (!ready) return;
    get<{ data: List[] }>("/api/v1/lists").then((r) => setLists(r?.data || [])).catch(() => setLists([]));
    // v1.1 picker lookups. Both endpoints return { data: [...] }. If a
    // tenant hasn't set up senders yet the dropdown shows a "no senders"
    // hint pointing to Settings — but we still allow drafts so the user
    // isn't blocked while waiting on domain verification.
    oliverApi
      .get<{ brandColor?: string | null; brandColorSecondary?: string | null; brandColorAccent?: string | null }>("/settings")
      .then((r) => setBrandColors({
        primary: r?.brandColor || undefined,
        secondary: r?.brandColorSecondary || undefined,
        accent: r?.brandColorAccent || undefined,
      }))
      .catch(() => setBrandColors({}));
    get<{ data: Sender[] }>("/api/v1/senders").then((r) => {
      const list = r?.data || [];
      setSenders(list);
      // 2026-06-24 — prefill with a default. For NEW drafts, prefer the
      // tenant's own default; fall back to the IA shared `noreply`. For
      // EDIT mode, only prefill when the loaded draft has no senderId
      // (the migration-065 backfill scenario — legacy drafts saved before
      // the picker existed). We use a microtask check below in a second
      // useEffect, but for the no-prior-sender new-draft path this inline
      // pick is enough.
      if (!editCampaignId && list.length > 0) {
        const def =
          list.find((s) => !s.is_system && s.is_default) ||  // tenant-owned default
          list.find((s) => s.is_system && s.local_part === "noreply") || // IA noreply
          list.find((s) => s.is_default) ||                  // any default
          list[0];                                            // first row
        if (def) {
          setSenderId(def.id);
          setFromName(def.effective_display_name || def.display_name || "");
          setFromEmail(def.email_address || "");
          if (def.reply_to_override) setReplyTo(def.reply_to_override);
        }
      }
    }).catch(() => setSenders([]));
    get<{ data: Signature[] }>("/api/v1/signatures").then((r) => {
      const list = r?.data || [];
      setSignatures(list);
      if (!editCampaignId) {
        const def = list.find((s) => s.is_default);
        if (def) setSignatureId(def.id);
      }
    }).catch(() => setSignatures([]));

    // F-CS.2 — tier probe + suggestion-count probe.
    // /api/v1/usage returns { data: { tier: 'standard'|'pro'|'business', ... } }.
    // We fetch in parallel with the lists so opening the modal stays snappy;
    // if either fails, the tab silently stays hidden.
    get<{ data: { tier?: string } }>("/api/v1/usage")
      .then((r) => setTenantTier(r?.data?.tier || null))
      .catch(() => setTenantTier(null));
    const suggestionsPath = contactId
      ? `/api/v1/il/suggestions?contact_id=${contactId}&limit=1`
      : "/api/v1/il/suggestions?limit=1";
    get<{ data: Array<{ suggestion_id: number }> }>(suggestionsPath)
      .then((r) => setHasSuggestions((r?.data?.length || 0) > 0))
      .catch(() => setHasSuggestions(false));

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
          setContentText(c.content_text || "");
          setContentSms(c.content_sms || "");
          setListId(c.recipient_list_id ?? "");
          setSenderId(c.sender_address_id ?? "");
          setSignatureId(c.signature_id ?? "");
          setEditStatus(c.status || null);
        })
        .catch((err) => setError(String((err as Error)?.message || err)));
    } else if (presetListId != null) {
      // SP-5 — opened from the Lists page "Send" action → preselect that list
      // as the campaign's recipient target. The user still picks the channel.
      setListId(presetListId);
    }
  }, [open, ready, get, editCampaignId, contactId, presetListId]);

  // Edit-mode back-fill: if the loaded draft was saved before the picker
  // had any senders to choose from (the migration-065 root-cause case), it
  // has senderId="" and from_email=NULL. As soon as the senders list
  // arrives, auto-pick a default so the user can save+send the existing
  // draft without re-opening it. Runs only in edit mode; the new-draft
  // path handles this inline in the senders fetch above.
  useEffect(() => {
    if (!open || !isEditMode) return;
    if (senders.length === 0) return;
    if (senderId !== "" && senderId != null) return;
    const def =
      senders.find((s) => !s.is_system && s.is_default) ||
      senders.find((s) => s.is_system && s.local_part === "noreply") ||
      senders.find((s) => s.is_default) ||
      senders[0];
    if (def) {
      setSenderId(def.id);
      if (!fromName) setFromName(def.effective_display_name || def.display_name || "");
      if (!fromEmail) setFromEmail(def.email_address || "");
      if (!replyTo && def.reply_to_override) setReplyTo(def.reply_to_override);
    }
  }, [open, isEditMode, senders, senderId, fromName, fromEmail, replyTo]);

  // Esc + click-outside close handled by IadmModal.

  const canSave = useCallback(() => {
    if (!name.trim() || !channel) return false;
    if (channel === "email" && !subject.trim() && !contentHtml.trim()) return false;
    if (channel === "sms" && !contentSms.trim()) return false;
    // 2026-06-24 — block save on email campaigns that have NO sender wired.
    // Previously the modal happily saved drafts with sender_address_id=null
    // (the "save fails" / "draft can't send" bug Brandon hit). The IA
    // shared defaults seeded by migration 065 mean senders[] is never
    // empty in practice; this guard catches the edge case where the
    // /senders fetch failed and the user is about to make an unsendable
    // draft. SMS doesn't have a From-address concept here — skip the
    // check on that channel.
    if (channel === "email" && senders.length > 0 && (senderId === "" || senderId == null)) {
      return false;
    }
    return true;
  }, [name, channel, subject, contentHtml, contentSms, senders.length, senderId]);

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type: channel,
      recipient_list_id: listId === "" ? null : listId,
    };
    if (channel === "email") {
      payload.subject = subject.trim() || null;
      // Send BOTH the picker IDs (v1.1) and the legacy free-text columns
      // (v1.0). When senderId is set, fromName/fromEmail mirror the picker
      // row — this gives backwards-compat for any downstream consumer that
      // still reads the flat columns (welcome-email worker, older drafts).
      payload.from_name = fromName.trim() || null;
      payload.from_email = fromEmail.trim() || null;
      payload.reply_to = replyTo.trim() || null;
      payload.sender_address_id = senderId === "" ? null : senderId;
      payload.signature_id = signatureId === "" ? null : signatureId;
      payload.content_html = contentHtml || null;
      payload.content_text = contentText || null;
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
      // empty body and returns
      //   { data: { succeeded, suppressed, failed, recipients_count, status } }
      //
      // This used to read `data.sent`, which the API has never returned, so it
      // always fell back to 0 — a fully successful send reported
      // "Campaign sent — 0 delivered". The `as any` casts hid the mismatch from
      // the compiler; the response is typed properly now so the contract is
      // checked at build time.
      if (canSave()) {
        await put<{ data: unknown }>(`/api/v1/campaigns/${editCampaignId}`, buildPayload());
      }
      const r = await post<{
        data: {
          campaign_id: number;
          recipients_count: number;
          succeeded: number;
          suppressed: number;
          failed: number;
          status: string;
        };
      }>(`/api/v1/campaigns/${editCampaignId}/send`, {});
      onCreated?.(editCampaignId);
      onClose();

      const succeeded = r?.data?.succeeded ?? 0;
      const failed = r?.data?.failed ?? 0;
      const suppressed = r?.data?.suppressed ?? 0;

      // Suppressed recipients were deliberately skipped (unsubscribed or
      // previously hard-bounced). Surfacing them separately keeps the numbers
      // honest — they are neither delivered nor failed.
      const parts = [`${succeeded} delivered`];
      if (failed) parts.push(`${failed} failed`);
      if (suppressed) parts.push(`${suppressed} skipped (unsubscribed or bounced)`);
      alert(`Campaign sent — ${parts.join(", ")}.`);
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
          {step === "compose" && composeTab === "compose" && !isEditMode && (
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
          {step === "compose" && composeTab === "compose" && (!isEditMode || editStatus === "draft") && (
            <IadmButton
              variant="accent"
              product="spark"
              data-tour="save-campaign"
              onClick={saveDraft}
              disabled={saving || sending || !canSave()}
              icon={<ArrowRight className="h-3 w-3" />}
            >
              {saving ? "Saving…" : isEditMode ? "Save changes" : "Save draft"}
            </IadmButton>
          )}
          {step === "compose" && composeTab === "compose" && isEditMode && editStatus === "draft" && (
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
                    data-tour={`campaign-channel-${c.key}`}
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

          {step === "compose" && channel && showSuggestionsTab && (
            <div className="mb-3 flex items-center gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setComposeTab("compose")}
                className={`-mb-px px-3 py-2 text-xs font-semibold border-b-2 ${
                  composeTab === "compose"
                    ? "border-[#EF6C33] text-[#EF6C33]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Compose
              </button>
              <button
                type="button"
                onClick={() => setComposeTab("suggestions")}
                className={`-mb-px inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold border-b-2 ${
                  composeTab === "suggestions"
                    ? "border-[#EF6C33] text-[#EF6C33]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Sparkles className="h-3 w-3" /> Suggestions
              </button>
            </div>
          )}

          {step === "compose" && composeTab === "suggestions" && (
            <SparkSuggestionsPanel
              contactId={contactId}
              onAccepted={() => {
                // Accepting creates an automation + enrollment, not a campaign.
                // Just close the modal — the parent campaigns list doesn't
                // change. F-CS.3 will add a richer post-accept callback so we
                // can deep-link the user to the new automation.
                onClose();
              }}
            />
          )}

          {step === "compose" && composeTab === "compose" && channel && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Campaign name</label>
                <input
                  data-tour="campaign-name"
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
                    <div className="relative">
                      <input
                        data-tour="campaign-subject"
                        ref={subjectRef}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        onKeyDown={subjectAutoTag.onKeyDown}
                        placeholder="Subject line"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      />
                      {subjectAutoTag.menu}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Type <span className="font-mono">{"{{"}</span> to insert a merge tag, or click Insert.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">From</label>
                      <select
                        data-tour="campaign-sender"
                        value={senderId}
                        onChange={(e) => {
                          const next = e.target.value === "" ? "" : Number(e.target.value);
                          setSenderId(next);
                          const picked = senders.find((s) => s.id === next);
                          if (picked) {
                            setFromName(picked.effective_display_name || picked.display_name || "");
                            setFromEmail(picked.email_address || "");
                            // Replace reply-to with the sender's override
                            // ONLY when the user hasn't customised it yet —
                            // never clobber a manual entry on every change.
                            if (!replyTo && picked.reply_to_override) {
                              setReplyTo(picked.reply_to_override);
                            }
                          } else {
                            setFromName("");
                            setFromEmail("");
                          }
                        }}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      >
                        <option value="">— Pick a sender —</option>
                        {senders.map((s) => {
                          const dn = s.effective_display_name || s.display_name || s.email_address;
                          // Tag the IA shared defaults so users know
                          // they're sending from the platform's domain.
                          const tag = s.is_system ? " (IA shared)" : s.is_default ? " (default)" : "";
                          return (
                            <option key={s.id} value={s.id}>
                              {dn} &lt;{s.email_address}&gt;{tag}
                            </option>
                          );
                        })}
                      </select>
                      {senders.length === 0 && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          No senders yet. <a href="/app/services/spark_settings" className="text-[#EF6C33] hover:underline">Add one in Settings →</a>
                        </p>
                      )}
                      {fromEmail && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={fromEmail}>
                          {fromName ? `${fromName} <${fromEmail}>` : fromEmail}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Signature</label>
                      <select
                        value={signatureId}
                        onChange={(e) => setSignatureId(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                      >
                        <option value="">— None —</option>
                        {signatures.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.is_default ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">
                        Reply-to <span className="text-slate-400 normal-case font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <input
                          ref={replyToRef}
                          value={replyTo}
                          onChange={(e) => setReplyTo(e.target.value)}
                          onKeyDown={replyToAutoTag.onKeyDown}
                          placeholder="Defaults to the From address"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                        />
                        {replyToAutoTag.menu}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Body</label>
                    <SparkBodyEditor
                      value={contentHtml}
                      onChange={(html, text) => {
                        setContentHtml(html);
                        setContentText(text);
                      }}
                      placeholder={"Hi {{first name}}, ..."}
                      onInsertCTA={() => {
                        setCtaValue({
                          type: "button",
                          label: "",
                          url: "",
                          align: "center",
                          width: "fit",
                          borderRadius: 6,
                        });
                        setCtaOpen(true);
                      }}
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Type <span className="font-mono">{"{{"}</span> or click <span className="font-semibold">Merge tag</span> to drop in personalization that fills automatically per recipient, or <span className="font-semibold">CTA</span> to add a call-to-action button.
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
                  <div className="relative">
                    <textarea
                      ref={smsRef}
                      value={contentSms}
                      onChange={(e) => setContentSms(e.target.value)}
                      onKeyDown={smsAutoTag.onKeyDown}
                      rows={4}
                      maxLength={480}
                      placeholder="Keep it short. Up to ~3 segments (480 chars)."
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                    />
                    {smsAutoTag.menu}
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                    <span>{contentSms.length}/480</span>
                    <span>~{Math.ceil(contentSms.length / 160) || 0} segment(s)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Type <span className="font-mono">{"{{"}</span> to insert a merge tag, or click Insert.
                  </p>
                </div>
              )}
            </div>
          )}
      </div>
      {/* CTA Editor sub-modal — opened from the SparkBodyEditor CTA toolbar
          button. Save appends the rendered HTML to contentHtml; the editor's
          setContent useEffect picks up the new value and re-renders. */}
      {ctaOpen && (
        <IadmModal
          open={ctaOpen}
          onClose={() => setCtaOpen(false)}
          product="spark"
          eyebrow="SPARK · INSERT CTA"
          title="Add a call-to-action"
          size="info"
          footer={
            <>
              <IadmButton variant="ghost" onClick={() => setCtaOpen(false)}>Cancel</IadmButton>
              <IadmButton
                variant="accent"
                product="spark"
                onClick={() => {
                  const html = ctaValueToHtml(ctaValue);
                  const next = contentHtml ? `${contentHtml}\n${html}` : html;
                  setContentHtml(next);
                  setCtaOpen(false);
                }}
                disabled={!ctaValue.url.trim() || !ctaValue.label.trim()}
              >
                Insert
              </IadmButton>
            </>
          }
        >
          <div className="p-5">
            <CTAEditorBlock
              value={ctaValue}
              onChange={setCtaValue}
              brandPrimaryColor={brandColors.primary}
              brandSecondaryColor={brandColors.secondary}
              brandAccentColor={brandColors.accent}
            />
          </div>
        </IadmModal>
      )}
    </IadmModal>
  );
}

export default SparkCampaignComposerModal;
