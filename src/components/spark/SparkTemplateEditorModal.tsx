// SparkTemplateEditorModal — the SMS template editor. F-91.
//
// ── WHAT THIS FILE USED TO BE, AND WHY HALF OF IT IS GONE ─────────────────
// It was the unified Email + SMS editor: a column of form fields (name,
// subject, preheader, from, reply-to) with a TipTap box for the HTML body and
// a CTA sub-modal that pasted a styled button onto the end of it.
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §13.5 puts every email surface on ONE
// builder, and §13.8 named this file as the last door not yet moved. It has
// been moved: an email template now opens `SparkTemplateBuilderModal` →
// `EmailBuilder`, the same canvas the Newsletter Studio and the campaign
// composer open. The email branch here is DELETED rather than left beside it —
// `feedback_replace_means_delete`, and the concrete reason behind that rule is
// that two editors over one `body_html` column drift, and the one nobody walks
// is the one that silently writes the worse body.
//
// What is left is SMS, which never had a visual builder and does not want one:
// a template is 160 characters of plain text with merge tags in it, and the
// thing a writer needs to see is the segment count, not a canvas.
//
// CRUD endpoints:
//   - POST/PATCH/DELETE /api/v1/sms-templates(/:id)
import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { slugifyTemplateKey } from "../../builder/adapters/email/templateDoc";

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
  /** Existing template ID to edit, or null for create-new. */
  templateId: number | null;
  /** Called after save/delete so the parent library refreshes. */
  onChanged?: () => void;
}

const DEFAULT_SMS: SmsTemplate = {
  name: "", category: "marketing", body: "", is_active: true,
};

export function SparkTemplateEditorModal({ open, onClose, templateId, onChanged }: Props) {
  const { get, post, patch, del, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    patch: <T>(p: string, body?: unknown) => Promise<T>;
    del: <T>(p: string) => Promise<T>;
    ready: boolean;
  };

  const [sms, setSms] = useState<SmsTemplate>(DEFAULT_SMS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derived template_key when creating from scratch. The user can't
  // edit the key once saved (the backend uses it as a stable handle). The
  // slug function is THE one the email templates use — one spelling of a key.
  const isEdit = templateId != null;
  const derivedKey = useMemo(() => slugifyTemplateKey(sms.name), [sms.name]);

  useEffect(() => {
    if (!open || !ready) return;
    setError(null);
    if (templateId == null) {
      setSms(DEFAULT_SMS);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const t = await get<SmsTemplate>(`/api/v1/sms-templates/${templateId}`);
        setSms({ ...DEFAULT_SMS, ...t });
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ready, templateId, get]);

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
      await del(`/api/v1/sms-templates/${templateId}`);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · SMS TEMPLATE"
      title={isEdit ? `Edit · ${sms.name || "template"}` : "New SMS template"}
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

          {!loading && (
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
