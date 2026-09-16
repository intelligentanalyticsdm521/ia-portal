/**
 * SparkTemplateBuilderModal — the TEMPLATE door onto the one email builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §13.5 lists four surfaces and one builder
 * behind them. §13.8 recorded the one still outstanding: "The template editor
 * (SparkTemplateEditorModal) still uses the form-and-TipTap shape. It is the
 * third door in §13.5's table and the only one not yet moved". This is that
 * door, and the raw form it replaces is gone rather than kept beside it.
 *
 * ── WHAT THIS FILE IS, AND IS NOT ─────────────────────────────────────────
 * It is the two things a TEMPLATE has that a newsletter and a campaign do not:
 * where its row is read from and written to, and the handful of settings that
 * belong to a template rather than to an email (its category, who it comes
 * from, whether it is active). Everything else — the canvas, the widget pane,
 * the sections, the starter gallery, the merge tags, the locked footer, the
 * test send — is `EmailBuilder`, unchanged and unforked.
 *
 * The mapping it uses is `builder/adapters/email/templateDoc.ts`, which is pure
 * and driven by `node --test`. Nothing here decides what a payload looks like.
 */
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { EmailBuilder, type EmailSaveResult } from "../../builder/adapters/email/EmailBuilder";
import type { EmailWire } from "../../builder/adapters/email/emailDoc";
import {
  templateRowForBuilder, templateCreateBody, templatePatchBody, templateBlockers,
  settingsFromRow, DEFAULT_TEMPLATE_SETTINGS,
  type EmailTemplateRow, type TemplateSettings, type TemplateCategory,
} from "../../builder/adapters/email/templateDoc";
import { apiErrorMessage } from "../../lib/apiErrorMessage";

interface Sender {
  id: number;
  display_name: string | null;
  effective_display_name?: string | null;
  email_address: string;
  is_default: boolean;
}

export interface SparkTemplateBuilderModalProps {
  open: boolean;
  /** The row to design, or null to start a new one. */
  templateId: number | null;
  onClose: () => void;
  /** Called after a save so the library refreshes. */
  onChanged?: () => void;
}

export function SparkTemplateBuilderModal({
  open, templateId, onClose, onChanged,
}: SparkTemplateBuilderModalProps) {
  const spark = useSparkApi();
  const oliver = useOliverApi();
  const { get, post, patch, ready } = spark;

  const [row, setRow] = useState<EmailTemplateRow | null>(null);
  const [settings, setSettings] = useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * The id a save writes to.
   *
   * It is NOT `templateId`. A system-seeded row (tenant `iadm-platform`) is
   * readable by every business and writable by none: the route answers a PATCH
   * on one by CLONING it into the tenant and returning the clone. Without
   * carrying that new id, a second Save would clone the system row again and
   * the business would collect a fresh copy per press.
   */
  const [savingToId, setSavingToId] = useState<number | null>(templateId);

  /* ── Open the row ────────────────────────────────────────────────────────
     A new template loads nothing and lands on the builder's own starter
     gallery, which is the one place a shape is chosen. */
  useEffect(() => {
    if (!open || !ready) return;
    setLoadError(null);
    setSavingToId(templateId);

    get<{ data?: Sender[] } | Sender[]>("/api/v1/senders")
      .then((r) => setSenders((r as { data?: Sender[] })?.data || (Array.isArray(r) ? r : [])))
      .catch(() => setSenders([]));

    if (templateId == null) {
      setRow(null);
      setSettings({ ...DEFAULT_TEMPLATE_SETTINGS });
      return;
    }
    setLoading(true);
    get<EmailTemplateRow>(`/api/v1/email-templates/${templateId}`)
      .then((t) => { setRow(t); setSettings(settingsFromRow(t)); })
      .catch((e) => setLoadError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, ready, templateId, get]);

  /* ── Saving ────────────────────────────────────────────────────────────── */
  const save = useCallback(async (wire: EmailWire, meta: EmailSaveResult) => {
    const missing = templateBlockers(meta);
    if (missing.length) {
      // Thrown, not swallowed — EmailBuilder shows what comes back out of
      // onSave and a save that quietly did nothing is the recurring defect.
      throw new Error(`This template still needs ${missing.join(" and ")}.`);
    }
    if (savingToId == null) {
      const created = await post<EmailTemplateRow>("/api/v1/email-templates", templateCreateBody(wire, meta, settings));
      const saved = (created as { data?: EmailTemplateRow })?.data ?? created;
      // Keep the builder on the row that now exists, so a second Save updates
      // it instead of creating template after template — the same defect the
      // Newsletter Studio's saveIssue carries a comment about.
      if (saved?.id) { setSavingToId(saved.id); setRow(saved); }
      onChanged?.();
      return saved;
    }
    const updated = await patch<EmailTemplateRow>(`/api/v1/email-templates/${savingToId}`, templatePatchBody(wire, meta, settings));
    const saved = (updated as { data?: EmailTemplateRow })?.data ?? updated;
    // A system row was cloned into this business; follow the clone.
    if (saved?.id && saved.id !== savingToId) { setSavingToId(saved.id); setRow(saved); }
    onChanged?.();
    return saved;
  }, [onChanged, patch, post, savingToId, settings]);

  if (!open) return null;

  if (loading || loadError) {
    return (
      <IadmModal
        open
        onClose={onClose}
        product="spark"
        eyebrow="SPARK · Email template"
        title={loadError ? "That template could not be opened" : "Opening…"}
        size="info"
        footer={<IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>}
      >
        <div style={{ padding: 20, fontSize: 13, color: loadError ? "#B91C1C" : "#5A7A8A" }}>
          {loadError || "Reading the template."}
        </div>
      </IadmModal>
    );
  }

  const isSystem = !!row?.is_system && savingToId === templateId;

  return (
    <EmailBuilder
      open
      onClose={onClose}
      api={{ get, post }}
      catalogApi={oliver}
      eyebrow="SPARK · Email template"
      row={templateRowForBuilder(row)}
      title={row?.name || ""}
      titlePlaceholder="Name this template — only your team sees this"
      initialSubject={row?.subject || ""}
      initialPreheader={row?.preheader || ""}
      saveLabel={savingToId == null ? "Create template" : "Save template"}
      onSave={save}
      documentExtras={
        <TemplateSettingsPanel
          settings={settings}
          onChange={setSettings}
          senders={senders}
          templateKey={row?.template_key || null}
          isSystem={isSystem}
          isNew={savingToId == null}
        />
      }
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The settings a TEMPLATE has and an email does not
   ══════════════════════════════════════════════════════════════════════════ */

function TemplateSettingsPanel({
  settings, onChange, senders, templateKey, isSystem, isNew,
}: {
  settings: TemplateSettings;
  onChange: (next: TemplateSettings) => void;
  senders: Sender[];
  templateKey: string | null;
  isSystem: boolean;
  isNew: boolean;
}) {
  const set = <K extends keyof TemplateSettings>(k: K, v: TemplateSettings[K]) =>
    onChange({ ...settings, [k]: v });

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={LABEL}>This template</div>

      {isSystem && (
        <div style={{ fontSize: 10, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 4, padding: "6px 8px", lineHeight: 1.45 }}>
          This is one of the templates that ship with the platform. Saving makes
          your business its own copy to change — the original stays as it was.
        </div>
      )}

      <Field label="Category" help="Marketing sends carry the unsubscribe footer and obey the suppression list.">
        <select
          style={INPUT}
          value={settings.category}
          onChange={(e) => set("category", e.target.value as TemplateCategory)}
        >
          <option value="marketing">Marketing</option>
          <option value="transactional">Transactional</option>
          <option value="system">System</option>
        </select>
      </Field>

      <Field label="What it is for" help="A note for your team. Nobody receiving the email sees it.">
        <input
          style={INPUT}
          value={settings.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="e.g. Sent the day after a first visit"
        />
      </Field>

      <Field label="Comes from" help="Leave it on the business default unless this one template needs its own address.">
        <select
          style={INPUT}
          value={settings.from_email}
          onChange={(e) => {
            const v = e.target.value;
            const picked = senders.find((s) => s.email_address === v);
            onChange({
              ...settings,
              from_email: v,
              from_name: settings.from_name || (picked ? (picked.effective_display_name || picked.display_name || "") : ""),
            });
          }}
        >
          <option value="">Your business default</option>
          {senders.map((s) => (
            <option key={s.id} value={s.email_address}>
              {s.email_address}{s.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Name on the envelope">
        <input
          style={INPUT}
          value={settings.from_name}
          onChange={(e) => set("from_name", e.target.value)}
          placeholder="Your business name"
        />
      </Field>

      <Field label="Replies go to" help="Blank sends replies back to the address above.">
        <input
          style={INPUT}
          value={settings.reply_to}
          onChange={(e) => set("reply_to", e.target.value)}
          placeholder="you@yourbusiness.com"
        />
      </Field>

      {!isNew && (
        <>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
            title="An inactive template stays in the library but nothing can send it.">
            <input type="checkbox" checked={settings.is_active}
              onChange={(e) => set("is_active", e.target.checked)} />
            Ready to use
          </label>
          {templateKey && (
            <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.45 }}>
              Referred to in your automations as{" "}
              <span style={{ fontFamily: "ui-monospace, monospace", color: "#5A7A8A" }}>{templateKey}</span>.
              Renaming the template here does not change that, on purpose.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ ...LABEL, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{label}</span>
      {children}
      {help && <span style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.4 }}>{help}</span>}
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};

const INPUT: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 4, padding: "5px 7px", fontSize: 12,
  background: "#fff", color: "#0B1C24", width: "100%",
};

export default SparkTemplateBuilderModal;
