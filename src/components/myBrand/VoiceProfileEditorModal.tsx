// VoiceProfileEditorModal — My Brand · Brand Voice profile editor.
//
// Extracted from VoicePage per the canonical modal pattern (F-107): all
// create/edit flows live in a centered IadmModal, never inline on the page.
// This is the singleton-profile variant of the CRUD editor contract — one
// voice profile per tenant, so there is no `<entity>Id` prop:
//   props { open, onClose, onChanged? }
//   GET /api/v1/my-brand/voice/profile   on open (gated on `ready`)
//   PUT /api/v1/my-brand/voice/profile   on save → onChanged?.(); onClose();
//
// Schema gap surfaced for wave-3:
//   The PUT profile body in routes/myBrand/voiceMonitor.js only accepts
//   `tone_attributes` (free-form JSON object) and `voice_examples` (string[]).
//   It does NOT yet have first-class fields for `keywords` or `avoid_list`.
//   Until backend gets them, the UI persists both inside the tone_attributes
//   JSON envelope as `{ attributes, keywords, avoid_list }` so the data round-
//   trips cleanly. The Haiku prompt builder JSON.stringify()s the whole
//   tone_attributes object so the model can still reason about keywords +
//   avoid words. When backend adds first-class columns, the UI will switch
//   to those without losing existing tenant data — `migrateLegacyShape()`
//   below covers the read-side.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Plus, Save, Tag, Trash2 } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { IadmModal, IadmButton } from "../IadmModal";

// ── Shared constants (VoicePage imports these for its read-only summary) ─────

export const TONE_OPTIONS = [
  "Professional",
  "Friendly",
  "Playful",
  "Bold",
  "Formal",
  "Casual",
  "Authoritative",
  "Approachable",
  "Witty",
  "Empathetic",
  "Confident",
  "Educational",
];
export const MAX_TONE = 5;

export const MIN_EXAMPLES = 3;
export const MAX_EXAMPLES = 6;
export const MIN_EXAMPLE_CHARS = 50;
export const MAX_EXAMPLE_CHARS = 2000;

// ── Types ────────────────────────────────────────────────────────────────────

// Free-form tone_attributes envelope — we own this shape on the client until
// the backend grows first-class keywords / avoid-list columns.
export interface ToneEnvelope {
  attributes?: string[];
  keywords?: string[];
  avoid_list?: string[];
  // Anything else the backend (or a future schema migration) hands us is
  // preserved verbatim on save — see save() pass-through.
  [key: string]: unknown;
}

export interface VoiceProfile {
  tenant_id: string;
  tone_attributes: ToneEnvelope | null;
  voice_examples: string[];
  embedding_model_id: string | null;
  embedding_version: number | null;
  embeddings_computed_at: string | null;
  has_embeddings: boolean;
  created_at: string | null;
  updated_at: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function migrateLegacyShape(raw: ToneEnvelope | null | undefined): ToneEnvelope {
  if (!raw) return { attributes: [], keywords: [], avoid_list: [] };
  // If the tenant's profile pre-dates wave-2 it may have used a different
  // shape (e.g. `tone: "Professional, Friendly"` from an early draft). Read
  // tolerantly so existing tenants don't see an empty editor on first load.
  const attributes = Array.isArray(raw.attributes)
    ? (raw.attributes as string[]).filter((s) => typeof s === "string")
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? (raw.keywords as string[]).filter((s) => typeof s === "string")
    : [];
  const avoid_list = Array.isArray(raw.avoid_list)
    ? (raw.avoid_list as string[]).filter((s) => typeof s === "string")
    : Array.isArray((raw as { avoidList?: unknown }).avoidList)
      ? ((raw as { avoidList: string[] }).avoidList).filter((s) => typeof s === "string")
      : [];
  return { ...raw, attributes, keywords, avoid_list };
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save so the parent page refreshes. */
  onChanged?: () => void;
}

export function VoiceProfileEditorModal({ open, onClose, onChanged }: Props) {
  const { get, put, ready } = useLumenApi();

  const [envelope, setEnvelope] = useState<ToneEnvelope>({ attributes: [], keywords: [], avoid_list: [] });
  const [examples, setExamples] = useState<string[]>(["", "", ""]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [avoidDraft, setAvoidDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the profile fresh on every open (canon CRUD contract: load the
  // record in a useEffect gated on open && ready). A missing row means a
  // first-time tenant — reset to empty defaults.
  useEffect(() => {
    if (!open || !ready) return;
    setError(null);
    setKeywordDraft("");
    setAvoidDraft("");
    setLoading(true);
    (async () => {
      try {
        const p = await get<VoiceProfile | null>("/api/v1/my-brand/voice/profile");
        if (p) {
          setEnvelope(migrateLegacyShape(p.tone_attributes));
          // Pad voice_examples to at least MIN_EXAMPLES so the editor renders 3 boxes on first paint.
          const ex = Array.isArray(p.voice_examples) ? [...p.voice_examples] : [];
          while (ex.length < MIN_EXAMPLES) ex.push("");
          setExamples(ex.slice(0, MAX_EXAMPLES));
        } else {
          setEnvelope({ attributes: [], keywords: [], avoid_list: [] });
          setExamples(["", "", ""]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ready, get]);

  // ── Editor actions ────────────────────────────────────────────────────────

  const toggleTone = useCallback((tone: string) => {
    setEnvelope((prev) => {
      const cur = prev.attributes || [];
      if (cur.includes(tone)) {
        return { ...prev, attributes: cur.filter((t) => t !== tone) };
      }
      if (cur.length >= MAX_TONE) return prev; // capped
      return { ...prev, attributes: [...cur, tone] };
    });
  }, []);

  const updateExample = useCallback((idx: number, val: string) => {
    setExamples((prev) => prev.map((e, i) => (i === idx ? val.slice(0, MAX_EXAMPLE_CHARS) : e)));
  }, []);

  const addExample = useCallback(() => {
    setExamples((prev) => (prev.length < MAX_EXAMPLES ? [...prev, ""] : prev));
  }, []);

  const removeExample = useCallback((idx: number) => {
    setExamples((prev) => {
      if (prev.length <= MIN_EXAMPLES) return prev.map((e, i) => (i === idx ? "" : e));
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const addKeyword = useCallback(() => {
    const v = keywordDraft.trim();
    if (!v) return;
    setEnvelope((prev) => {
      const cur = prev.keywords || [];
      if (cur.includes(v)) return prev;
      return { ...prev, keywords: [...cur, v] };
    });
    setKeywordDraft("");
  }, [keywordDraft]);

  const removeKeyword = useCallback((kw: string) => {
    setEnvelope((prev) => ({ ...prev, keywords: (prev.keywords || []).filter((k) => k !== kw) }));
  }, []);

  const addAvoid = useCallback(() => {
    const v = avoidDraft.trim();
    if (!v) return;
    setEnvelope((prev) => {
      const cur = prev.avoid_list || [];
      if (cur.includes(v)) return prev;
      return { ...prev, avoid_list: [...cur, v] };
    });
    setAvoidDraft("");
  }, [avoidDraft]);

  const removeAvoid = useCallback((w: string) => {
    setEnvelope((prev) => ({ ...prev, avoid_list: (prev.avoid_list || []).filter((k) => k !== w) }));
  }, []);

  // Save validation — match backend rules (3-6 examples, each min 50 chars).
  // We allow the user to type fewer; we just gate the Save button.
  const validExamples = examples.filter((e) => e.trim().length >= MIN_EXAMPLE_CHARS);
  const canSave =
    (envelope.attributes?.length || 0) > 0 &&
    validExamples.length >= MIN_EXAMPLES;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // Trim each example, drop empties, cap at MAX_EXAMPLES — same shape the
      // backend enforces, but matching it here keeps the response in sync.
      const cleanedExamples = examples
        .map((e) => e.trim())
        .filter((e) => e.length >= MIN_EXAMPLE_CHARS)
        .slice(0, MAX_EXAMPLES);

      // tone_attributes envelope passthrough — preserve any keys the
      // backend might have set (e.g. version metadata) by spreading
      // the loaded shape first.
      const body = {
        tone_attributes: { ...envelope },
        voice_examples: cleanedExamples,
      };

      await put<VoiceProfile>("/api/v1/my-brand/voice/profile", body);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const selectedTones = envelope.attributes || [];
  const keywords = envelope.keywords || [];
  const avoidList = envelope.avoid_list || [];

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · VOICE PROFILE"
      title="Edit voice profile"
      subtitle="Tone, sample writing, and the keyword rules the Intelligence Layer scores against."
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={save}
            disabled={!canSave || saving || loading}
            icon={<Save className="h-3 w-3" />}
          >
            {saving ? "Saving…" : "Save profile"}
          </IadmButton>
        </>
      }
    >
      <div className="p-5">
        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-6">
            {/* Tone attributes */}
            <Section
              title="Tone Attributes"
              hint={`Pick up to ${MAX_TONE} attributes that describe how your brand should sound. ${selectedTones.length}/${MAX_TONE} selected.`}
            >
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((tone) => {
                  const selected = selectedTones.includes(tone);
                  const disabled = !selected && selectedTones.length >= MAX_TONE;
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => toggleTone(tone)}
                      disabled={disabled}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        selected
                          ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
                          : disabled
                            ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Voice examples */}
            <Section
              title="Voice Examples"
              hint={`Paste ${MIN_EXAMPLES}-${MAX_EXAMPLES} short passages of writing that sound like your brand. Each example must be at least ${MIN_EXAMPLE_CHARS} characters. The Intelligence Layer embeds these and compares new copy against them. ${validExamples.length} of ${MIN_EXAMPLES} required.`}
            >
              <div className="space-y-3">
                {examples.map((text, idx) => {
                  const chars = text.trim().length;
                  const tooShort = chars > 0 && chars < MIN_EXAMPLE_CHARS;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-700">Example {idx + 1}</label>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] ${tooShort ? "text-rose-600" : chars >= MIN_EXAMPLE_CHARS ? "text-emerald-600" : "text-slate-500"}`}>
                            {chars}/{MAX_EXAMPLE_CHARS} chars
                          </span>
                          {examples.length > MIN_EXAMPLES && (
                            <button
                              type="button"
                              onClick={() => removeExample(idx)}
                              className="text-[11px] text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"
                            >
                              <Trash2 className="h-3 w-3" /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={text}
                        onChange={(e) => updateExample(idx, e.target.value)}
                        rows={4}
                        placeholder={`At least ${MIN_EXAMPLE_CHARS} characters — write the way your brand actually writes.`}
                        className={`w-full rounded border px-3 py-2 text-sm font-mono leading-snug ${
                          tooShort ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white"
                        }`}
                      />
                    </div>
                  );
                })}
                {examples.length < MAX_EXAMPLES && (
                  <button
                    type="button"
                    onClick={addExample}
                    className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 border border-dashed border-slate-300 rounded px-3 py-1.5"
                  >
                    <Plus className="h-3 w-3" /> Add example ({examples.length}/{MAX_EXAMPLES})
                  </button>
                )}
              </div>
            </Section>

            {/* Brand keywords */}
            <Section
              title="Brand Keywords"
              hint="Words and phrases that SHOULD appear in your copy — brand name variants, taglines, product names. Stored inside tone_attributes JSON for now (backend pending first-class columns)."
            >
              <ChipInput
                icon={<Tag className="h-3.5 w-3.5 text-emerald-600" />}
                chips={keywords}
                draft={keywordDraft}
                setDraft={setKeywordDraft}
                onAdd={addKeyword}
                onRemove={removeKeyword}
                placeholder="e.g. Acme Corp, AcmeFlow, “Built for trades”"
                accent="#10b981"
              />
            </Section>

            {/* Avoid list */}
            <Section
              title="Avoid List"
              hint="Words and phrases to NEVER use — competitor names, off-tone phrases, banned jargon."
            >
              <ChipInput
                icon={<Ban className="h-3.5 w-3.5 text-rose-600" />}
                chips={avoidList}
                draft={avoidDraft}
                setDraft={setAvoidDraft}
                onAdd={addAvoid}
                onRemove={removeAvoid}
                placeholder="e.g. cheap, basic, competitor names"
                accent="#dc2626"
              />
            </Section>
          </div>
        )}
      </div>
    </IadmModal>
  );
}

// ── Local pieces ─────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ChipInput({
  icon,
  chips,
  draft,
  setDraft,
  onAdd,
  onRemove,
  placeholder,
  accent,
}: {
  icon: React.ReactNode;
  chips: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (chip: string) => void;
  placeholder: string;
  accent: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm bg-white"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
              style={{ background: `${accent}1a`, color: accent }}
            >
              {icon}
              <span>{chip}</span>
              <button
                type="button"
                onClick={() => onRemove(chip)}
                className="ml-1 text-current opacity-60 hover:opacity-100"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">No entries yet — press Enter or comma to add.</div>
      )}
    </div>
  );
}

export default VoiceProfileEditorModal;
