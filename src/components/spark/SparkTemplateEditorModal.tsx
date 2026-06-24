// SparkTemplateEditorModal — F-91.
//
// Unified modal editor for Email + SMS templates. Replaces the two
// separate master/detail editor pages (Email + SMS Templates) with a
// single modal you can open from anywhere. For richer block-based email
// editing, a "Open advanced editor" link routes to the legacy
// SparkEmailTemplatesPage (kept for the visual builder).
//
// Channel-aware:
//   - Email   → name, subject, preheader, body_html, body_text, from/reply, category
//   - SMS     → name, body (160-char counter), category
//
// CRUD endpoints:
//   - POST/PUT/DELETE /api/v1/email-templates(/:id)
//   - POST/PATCH/DELETE /api/v1/sms-templates(/:id)
import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { SparkBodyEditor } from "./SparkBodyEditor";
import { CTAEditorBlock, ctaToBlock, autoContrastColor, type CTAValue } from "./CTAEditorBlock";

// Render a CTAValue into the inline HTML that gets appended to the
// template body. Mirrors LUMEN-API emailBuilder button block output so
// what the writer previews matches what recipients see in their inbox.
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
  is_default: boolean;
}

/**
 * Slugify a template name into a stable template_key (lowercase snake_case,
 * ASCII only). Used for the auto-generated key on create — the backend
 * accepts `template_key: null` and falls back to the row id, but a stable
 * key makes the template addressable from code (transactional sends) and
 * survives a rename.
 */
function slugifyTemplateKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

export type TemplateChannel = "email" | "sms";

interface EmailTemplate {
  id?: number;
  template_key?: string | null;
  name: string;
  description?: string | null;
  category: "transactional" | "marketing" | "system";
  subject: string;
  preheader?: string | null;
  body_html: string;
  body_text?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  is_active: boolean;
}

interface SmsTemplate {
  id?: number;
  template_key?: string | null;
  name: string;
  description?: string | null;
  category: "transactional" | "marketing" | "system";
  body: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  channel: TemplateChannel;
  /** Existing template ID to edit, or null for create-new. */
  templateId: number | null;
  /** Called after save/delete so the parent library refreshes. */
  onChanged?: () => void;
}

const DEFAULT_EMAIL: EmailTemplate = {
  name: "", category: "marketing", subject: "",
  preheader: "", body_html: "<p>Hi {{first name}},</p>",
  body_text: "Hi {{first name}},", from_name: "", from_email: "", reply_to: "",
  is_active: true,
};

const DEFAULT_SMS: SmsTemplate = {
  name: "", category: "marketing", body: "", is_active: true,
};

export function SparkTemplateEditorModal({ open, onClose, channel, templateId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    patch: <T>(p: string, body?: unknown) => Promise<T>;
    del: <T>(p: string) => Promise<T>;
    ready: boolean;
  };
  const oliverApi = useOliverApi() as {
    get: <T>(p: string) => Promise<T>;
  };

  const [email, setEmail] = useState<EmailTemplate>(DEFAULT_EMAIL);
  const [sms, setSms] = useState<SmsTemplate>(DEFAULT_SMS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // From-email picker (audit gap): /senders feeds the dropdown so the
  // template carries a verified sender by default. Free-text from_name +
  // reply_to remain so per-template overrides still work.
  const [senders, setSenders] = useState<Sender[]>([]);
  const [brandColors, setBrandColors] = useState<{ primary?: string; secondary?: string; accent?: string }>({});
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaValue, setCtaValue] = useState<CTAValue>({
    type: "button", label: "", url: "", align: "center", width: "fit", borderRadius: 6,
  });

  // Auto-derived template_key when creating from scratch. The user can't
  // edit the key once saved (the backend uses it as a stable handle).
  const isEdit = templateId != null;
  const derivedKey = useMemo(
    () => (channel === "email" ? slugifyTemplateKey(email.name) : slugifyTemplateKey(sms.name)),
    [channel, email.name, sms.name],
  );

  useEffect(() => {
    if (!open || !ready) return;
    setError(null);
    // Always refresh the sender list when the modal opens — the picker is
    // tenant-scoped and senders can be added/removed in Settings.
    get<{ data: Sender[] }>("/api/v1/senders")
      .then((r) => setSenders(r?.data || []))
      .catch(() => setSenders([]));
    // Brand colors → primary / secondary / accent chips on the CTA editor.
    oliverApi
      .get<{ brandColor?: string | null; brandColorSecondary?: string | null; brandColorAccent?: string | null }>("/settings")
      .then((r) => setBrandColors({
        primary: r?.brandColor || undefined,
        secondary: r?.brandColorSecondary || undefined,
        accent: r?.brandColorAccent || undefined,
      }))
      .catch(() => setBrandColors({}));
    if (templateId == null) {
      // Create-new
      setEmail(DEFAULT_EMAIL);
      setSms(DEFAULT_SMS);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        if (channel === "email") {
          const t = await get<EmailTemplate>(`/api/v1/email-templates/${templateId}`);
          setEmail({ ...DEFAULT_EMAIL, ...t });
        } else {
          const t = await get<SmsTemplate>(`/api/v1/sms-templates/${templateId}`);
          setSms({ ...DEFAULT_SMS, ...t });
        }
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ready, channel, templateId, get, oliverApi]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (channel === "email") {
        // POST requires name + subject + body_html; PATCH allows partial
        // updates including is_active. There is NO PUT — the LUMEN-API
        // mutation verb for email templates is PATCH.
        if (!email.name.trim()) { setError("Name is required."); setSaving(false); return; }
        if (templateId == null) {
          if (!email.subject.trim()) { setError("Subject is required for new email templates."); setSaving(false); return; }
          if (!email.body_html.trim()) { setError("Body HTML is required for new email templates."); setSaving(false); return; }
          // POST does NOT accept is_active — strip it on create (defaults to active=1 server-side).
          // Auto-generate the template_key from the name when the user
          // hasn't set one explicitly (the backend treats it as nullable
          // but a stable slug is much friendlier for code references).
          const { is_active: _ignore, ...createPayload } = email;
          if (!createPayload.template_key && derivedKey) {
            createPayload.template_key = derivedKey;
          }
          await post(`/api/v1/email-templates`, createPayload);
        } else {
          // PATCH accepts every editable field including is_active.
          await patch(`/api/v1/email-templates/${templateId}`, email);
        }
      } else {
        // SMS POST allow-list: template_key, name, description, category, body.
        //   (is_active NOT in POST allow-list — defaults to 1 server-side.)
        // SMS PATCH allow-list: name, description, category, body, template_key,
        //   is_active (separately handled in the PATCH route).
        if (!sms.name.trim()) { setError("Name is required."); setSaving(false); return; }
        if (!sms.body.trim()) { setError("Body is required."); setSaving(false); return; }
        if (templateId == null) {
          const { is_active: _ignore, ...createPayload } = sms;
          if (!createPayload.template_key && derivedKey) {
            createPayload.template_key = derivedKey;
          }
          await post(`/api/v1/sms-templates`, createPayload);
        } else {
          await patch(`/api/v1/sms-templates/${templateId}`, sms);
        }
      }
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (templateId == null) return;
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setSaving(true);
    try {
      if (channel === "email") await del(`/api/v1/email-templates/${templateId}`);
      else await del(`/api/v1/sms-templates/${templateId}`);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const channelLabel = channel === "email" ? "Email" : "SMS";

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow={`SPARK · ${channelLabel.toUpperCase()} TEMPLATE`}
      title={isEdit ? `Edit · ${channel === "email" ? email.name : sms.name || "template"}` : "New template"}
      size="info"
      footer={
        <>
          {isEdit && (
            <button onClick={remove} disabled={saving} className="mr-auto text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton variant="accent" product="spark" onClick={save} disabled={saving || loading} icon={<Save className="h-3 w-3" />}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && channel === "email" && (
            <div className="space-y-3">
              <Row label="Name">
                <input value={email.name} onChange={(e) => setEmail({ ...email, name: e.target.value })} className="spark-input" />
              </Row>
              {/* Template key — read-only. Auto-generated from the name on
                  create; shown on edit so users know what to reference in
                  transactional sends. */}
              <Row label={isEdit ? "Template key" : "Template key (auto)"}>
                <input
                  value={isEdit ? (email.template_key ?? "") : derivedKey}
                  readOnly
                  className="spark-input bg-slate-50 text-slate-500 font-mono text-xs"
                  placeholder="auto-generated from name"
                />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Category">
                  <select
                    value={email.category}
                    onChange={(e) => setEmail({ ...email, category: e.target.value as EmailTemplate["category"] })}
                    className="spark-input bg-white"
                  >
                    <option value="marketing">Marketing</option>
                    <option value="transactional">Transactional</option>
                    <option value="system">System</option>
                  </select>
                </Row>
                {isEdit ? (
                  <Row label="Active">
                    <label className="flex items-center gap-2 mt-1.5">
                      <input type="checkbox" checked={email.is_active} onChange={(e) => setEmail({ ...email, is_active: e.target.checked })} />
                      <span className="text-sm">Template is active</span>
                    </label>
                  </Row>
                ) : (
                  <div />
                )}
              </div>
              <Row label="Description">
                <input
                  value={email.description ?? ""}
                  onChange={(e) => setEmail({ ...email, description: e.target.value })}
                  className="spark-input"
                  placeholder="Short note about what this template is for"
                />
              </Row>
              <Row label="Subject">
                <input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} className="spark-input" placeholder="Welcome to {{business name}}" />
              </Row>
              <Row label="Preheader (preview text)">
                <input value={email.preheader ?? ""} onChange={(e) => setEmail({ ...email, preheader: e.target.value })} className="spark-input" />
              </Row>
              <div className="grid grid-cols-3 gap-3">
                <Row label="From name">
                  <input value={email.from_name ?? ""} onChange={(e) => setEmail({ ...email, from_name: e.target.value })} className="spark-input" />
                </Row>
                <Row label="From email">
                  <select
                    value={email.from_email ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const picked = senders.find((s) => s.email_address === v);
                      setEmail({
                        ...email,
                        from_email: v || null,
                        // If the user picks a sender that has a display name
                        // and the template's from_name is empty, mirror it
                        // so the saved template has both fields populated.
                        from_name:
                          email.from_name
                          || (picked ? (picked.effective_display_name || picked.display_name || "") : ""),
                      });
                    }}
                    className="spark-input bg-white"
                  >
                    <option value="">— Business default —</option>
                    {senders.map((s) => (
                      <option key={s.id} value={s.email_address}>
                        {s.email_address}{s.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Reply-to">
                  <input value={email.reply_to ?? ""} onChange={(e) => setEmail({ ...email, reply_to: e.target.value })} className="spark-input" />
                </Row>
              </div>
              <Row label="Body">
                <SparkBodyEditor
                  value={email.body_html}
                  onChange={(html, text) => setEmail({ ...email, body_html: html, body_text: text })}
                  placeholder={"Hi {{first name}}, ..."}
                  onInsertCTA={() => {
                    setCtaValue({
                      type: "button", label: "", url: "", align: "center", width: "fit", borderRadius: 6,
                    });
                    setCtaOpen(true);
                  }}
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Type <span className="font-mono">{"{{"}</span> to insert a merge tag, or click <span className="font-semibold">CTA</span> in the toolbar to add a styled button. For block-based editing, <a href={`/app/services/spark_email_templates`} className="text-[#EF6C33] hover:underline">open the advanced editor</a> from the Templates library page.
                </p>
              </Row>
            </div>
          )}

          {!loading && channel === "sms" && (
            <div className="space-y-3">
              <Row label="Name">
                <input value={sms.name} onChange={(e) => setSms({ ...sms, name: e.target.value })} className="spark-input" />
              </Row>
              <Row label={isEdit ? "Template key" : "Template key (auto)"}>
                <input
                  value={isEdit ? (sms.template_key ?? "") : derivedKey}
                  readOnly
                  className="spark-input bg-slate-50 text-slate-500 font-mono text-xs"
                  placeholder="auto-generated from name"
                />
              </Row>
              <Row label="Description">
                <input
                  value={sms.description ?? ""}
                  onChange={(e) => setSms({ ...sms, description: e.target.value })}
                  className="spark-input"
                  placeholder="Short note about what this template is for"
                />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Category">
                  <select
                    value={sms.category}
                    onChange={(e) => setSms({ ...sms, category: e.target.value as SmsTemplate["category"] })}
                    className="spark-input bg-white"
                  >
                    <option value="marketing">Marketing</option>
                    <option value="transactional">Transactional</option>
                    <option value="system">System</option>
                  </select>
                </Row>
                {isEdit ? (
                  <Row label="Active">
                    <label className="flex items-center gap-2 mt-1.5">
                      <input type="checkbox" checked={sms.is_active} onChange={(e) => setSms({ ...sms, is_active: e.target.checked })} />
                      <span className="text-sm">Template is active</span>
                    </label>
                  </Row>
                ) : (
                  <div />
                )}
              </div>
              <Row label="SMS body">
                <textarea
                  value={sms.body}
                  onChange={(e) => setSms({ ...sms, body: e.target.value })}
                  rows={5}
                  maxLength={480}
                  className="spark-input"
                  placeholder="Hi {{first name}}, your appointment is on {{date}}."
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                  <span>{sms.body.length}/480</span>
                  <span>~{Math.ceil(sms.body.length / 160) || 0} segment(s)</span>
                </div>
              </Row>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .spark-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 13px;
        }
        .spark-input:focus {
          outline: none;
          border-color: #EF6C33;
          box-shadow: 0 0 0 1px #EF6C33;
        }
      `}</style>
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
                  const nextBody = email.body_html ? `${email.body_html}\n${html}` : html;
                  setEmail({ ...email, body_html: nextBody });
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default SparkTemplateEditorModal;
