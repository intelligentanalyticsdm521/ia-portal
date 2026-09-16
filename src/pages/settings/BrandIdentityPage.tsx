// BrandIdentityPage — cross-product brand center reachable from the
// hamburger ☰ menu. F-BI.IDENTITY (2026-06-24).
//
// Why this page exists separately from Business Profile:
//   Business Profile owns the *operational* shared identity (legal name,
//   address, phone, billing email, etc.) — the data on invoices/contracts.
//   Brand Identity owns the *expressive* shared identity (logo, colors,
//   typography, voice, tagline) — the data that gets rendered into emails,
//   AI-generated copy, customer-portal chrome, and social posts.
//
//   Both end up in the same DB rows (core.tenants + lumen.brand_voice_profile),
//   but separating the UI keeps Business Profile lean for the "I just need to
//   fix my address" use case and Brand Identity focused for the "I want my
//   AI-generated emails to sound right" use case.
//
// Data flow (per-section save — no giant Save All):
//   1. Logo       → POST /settings/logo (the upload) then the brand kit records
//                     the address → core.tenants.logo_url
//   2. Colors     → PUT /brand-kit      → core.tenants.brand_color/_secondary/_accent
//   3. Typography → PUT /brand-kit      → core.tenants.brand_heading_font/_body_font
//
//   2026-09-15 (BUILDER_PLATFORM_SCOPE §2, step 0): colours used to go to
//   oliver-api PATCH /settings and typography to LUMEN PUT
//   /api/v1/my-brand/voice/profile, TUNNELLED through a JSON envelope on a
//   SPARK table because lumen.brand_voice_profile had no font columns. A
//   business's brand is neither OLIVER's nor SPARK's. platform-api migration
//   038 gave core.tenants the font columns this header used to list as an
//   unshipped follow-up, and both sections now save through the one kit that
//   every builder reads — which is what makes the change appear on a
//   proposal and a CTA preview without a reload.
//   4. Voice      → PUT  /api/v1/my-brand/voice/profile (selected_voices +
//                     custom_voice tunneled through tone_attributes)
//   5. Tagline    → PUT  /api/v1/my-brand/voice/profile (tagline tunneled
//                     through tone_attributes)
//
//   On every PUT to voice/profile we MUST preserve any existing keys in the
//   envelope (VoicePage owns `attributes`/`keywords`/`avoid_list`/`voice_examples`)
//   — otherwise saving Typography here would wipe the user's keyword list.
//   See `mergeEnvelope()` below.
//
// Schema follow-ups still open (typography was promoted 2026-09-15 by
// platform-api migration 038; these were not):
//   - lumen.brand_voice_profile still needs columns for tagline NVARCHAR(280),
//     selected_voices NVARCHAR(MAX) (JSON array), custom_voice NVARCHAR(MAX).
//     Voice and tagline are SPARK facts and still ride the envelope.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Save, Palette, Type, Mic2, Image as ImageIcon, Quote } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useLumenApi } from "../../hooks/useLumenApi";
import { LogoPicker } from "../../components/oliver/LogoPicker";
import { BRAND_VOICE_CATALOG } from "../../components/consulting/OnboardingWizardModal";
// THE brand kit. This page is its ONE writer.
import { useBrandKit } from "../../brand/BrandKitProvider";
import { NEUTRAL_BRAND_KIT } from "../../lib/brandKit";

// ── Fonts ─────────────────────────────────────────────────────────────────
// The catalog comes from the brand kit (platform-api lib/brandKit.js
// FONT_CATALOG). It used to be a 12-entry list declared right here, and it was
// one of THREE disjoint lists: this one, the Template Studio's six bundled OFL
// faces (the only ones the server can rasterise) and ARION's industry
// suggestion. A client could pick Georgia here and get Poppins on the exported
// graphic with nothing said. One list now, and each entry carries whether an
// export can really render it.

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * The tone_attributes JSON envelope on lumen.brand_voice_profile. We OWN the
 * shape on the client until the columns are promoted to first-class — same
 * convention VoicePage.tsx already uses.
 *
 * Unknown keys are preserved on save (see mergeEnvelope) so a future schema
 * migration can read these fields out and a different page editing the
 * envelope (VoicePage) doesn't clobber our additions.
 */
interface ToneEnvelope {
  // Owned by VoicePage:
  attributes?: string[];
  keywords?: string[];
  avoid_list?: string[];
  // Owned by Brand Identity (this page):
  selected_voices?: string[];      // up to 3 from BRAND_VOICE_CATALOG
  custom_voice?: string;           // free-form notes
  tagline?: string;                // single-line tagline
  heading_font?: string;           // FONT_CATALOG.value
  body_font?: string;              // FONT_CATALOG.value
  // Forward-compat — preserve any other keys the backend (or another editor)
  // wrote so we don't accidentally wipe them.
  [key: string]: unknown;
}

interface VoiceProfileResponse {
  tenant_id: string;
  tone_attributes: ToneEnvelope | null;
  voice_examples: string[] | null;
  embedding_model_id: string | null;
  embedding_version: number | null;
  embeddings_computed_at: string | null;
  has_embeddings: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface OrgProfile {
  tenantFullName?: string;
  website?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  brandColorAccent?: string | null;
}

const MAX_VOICES = 3;
const MAX_CUSTOM_VOICE = 500;
const MAX_TAGLINE = 280;

// ── Page chrome (same shell as the other settings routes) ────────────────

function SettingsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </section>
      {children}
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function SaveButton({
  onClick,
  busy,
  disabled,
  label = "Save",
  savedLabel = "Saved",
  justSaved,
}: {
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  label?: string;
  savedLabel?: string;
  justSaved?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Save className="h-3.5 w-3.5" />
      {busy ? "Saving…" : justSaved ? savedLabel : label}
    </button>
  );
}

// Merge a partial update into the existing envelope, preserving every key
// already present. CRITICAL: if we save Typography here, we must not wipe
// the keywords/avoid_list that VoicePage owns.
function mergeEnvelope(prev: ToneEnvelope | null, patch: Partial<ToneEnvelope>): ToneEnvelope {
  return { ...(prev || {}), ...patch };
}

// ── Page ──────────────────────────────────────────────────────────────────

export function BrandIdentityPage() {
  // THE kit: what this page reads for colours/fonts/logo and the ONLY thing it
  // writes them to. save() updates the shared context, so every builder already
  // on screen repaints in the same commit — no reload, which is the walk row.
  const { kit, save: saveKit, error: kitError } = useBrandKit();
  // The kit always answers with a complete palette — the neutral fills any slot
  // the business has not chosen. These two read the CHOICE, so an unset colour
  // shows as an empty field ("not set") rather than as slate they never picked.
  const kitColour = (key: "primary" | "secondary" | "accent") =>
    kit.sources?.[key] === "tenant" ? kit.colours[key] : "";
  const kitFont = (key: "heading" | "body") =>
    kit.sources?.[`${key}_font`] === "default" ? "" : kit.fonts[key];
  const fontCatalog = kit.fonts.catalog.length ? kit.fonts.catalog : [];
  const oliver = useOliverApi();
  const lumen = useLumenApi();

  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [voice, setVoice] = useState<VoiceProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Section-local drafts (so per-section Save buttons only flush their own
  // section's changes — typing in Tagline doesn't affect the Logo section).
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [colorsDraft, setColorsDraft] = useState<{
    primary: string;
    secondary: string;
    accent: string;
  }>({ primary: "", secondary: "", accent: "" });
  const [typographyDraft, setTypographyDraft] = useState<{ heading: string; body: string }>({
    heading: "",
    body: "",
  });
  const [voiceDraft, setVoiceDraft] = useState<{ selected: string[]; custom: string }>({
    selected: [],
    custom: "",
  });
  const [taglineDraft, setTaglineDraft] = useState("");

  // Per-section save state — independent so a slow Tagline save doesn't lock
  // the Colors button.
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  const [savingTypography, setSavingTypography] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [savingTagline, setSavingTagline] = useState(false);

  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<{ section: string; message: string } | null>(null);

  // Hydrate from both APIs in parallel. Fetch once per page mount — convention
  // memory:convention_data_fetching.md.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [orgResult, voiceResult] = await Promise.allSettled([
        oliver.get<OrgProfile>("/settings"),
        lumen.get<VoiceProfileResponse | null>("/api/v1/my-brand/voice/profile"),
      ]);

      if (orgResult.status === "fulfilled" && orgResult.value) {
        // /settings is still read for the business NAME and the other account
        // facts this page shows. The colours below come from the kit.
        setProfile(orgResult.value);
      } else if (orgResult.status === "rejected") {
        console.warn("[BrandIdentityPage] /settings load failed:", orgResult.reason);
      }

      if (voiceResult.status === "fulfilled") {
        const v = voiceResult.value;
        setVoice(v);
        const env = (v?.tone_attributes ?? null) as ToneEnvelope | null;
        // Typography is NOT read from the envelope any more — the kit owns it
        // (and falls back to the envelope server-side until the backfill has run
        // for this environment, reported as sources.heading_font).
        const sel = Array.isArray(env?.selected_voices)
          ? env!.selected_voices!.filter((s): s is string => typeof s === "string")
          : [];
        setVoiceDraft({
          selected: sel.slice(0, MAX_VOICES),
          custom: typeof env?.custom_voice === "string" ? env.custom_voice : "",
        });
        setTaglineDraft(typeof env?.tagline === "string" ? env.tagline : "");
      } else if (voiceResult.status === "rejected") {
        // Non-fatal — the voice profile row may not exist yet for a fresh
        // tenant. Treat as empty.
        console.warn("[BrandIdentityPage] voice/profile load failed (treating as empty):", voiceResult.reason);
        setVoice(null);
      }
    } catch (e) {
      setLoadError((e as Error).message || "Could not load brand identity.");
    } finally {
      setLoading(false);
    }
  }, [oliver, lumen]);

  useEffect(() => {
    if (oliver.ready && lumen.ready) {
      load();
    }
  }, [oliver.ready, lumen.ready, load]);

  // The colour, font and logo drafts come from THE KIT, and re-seed whenever it
  // changes — including after a save, so the fields show what was stored rather
  // than what was typed.
  useEffect(() => {
    setLogoDraft(kit.logo_url ?? null);
    setColorsDraft({
      primary: kitColour("primary"),
      secondary: kitColour("secondary"),
      accent: kitColour("accent"),
    });
    setTypographyDraft({ heading: kitFont("heading"), body: kitFont("body") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit]);

  // Flash "Saved" pill for ~2s after a successful section save.
  const flash = useCallback((sectionKey: string) => {
    setSavedFlash(sectionKey);
    window.setTimeout(() => {
      setSavedFlash((cur) => (cur === sectionKey ? null : cur));
    }, 2000);
  }, []);

  // ── Section 1: Logo ─────────────────────────────────────────────────────
  // LogoPicker handles its own server-side persist (POST /settings/logo
  // returns the hosted URL). On URL-paste / "Save" we still need to flush
  // the URL into core.tenants via PATCH /settings.
  const handleLogoSave = useCallback(async () => {
    setSavingLogo(true);
    setSectionError(null);
    try {
      // LogoPicker still UPLOADS through oliver (POST /settings/logo — that is a
      // file-storage mechanism, not a brand store). Where the file LIVES is a
      // brand fact, so the address is recorded on the kit.
      const saved = await saveKit({ logo_url: logoDraft ?? null });
      setLogoDraft(saved.logo_url);
      flash("logo");
    } catch (e) {
      setSectionError({ section: "logo", message: (e as Error).message || "Save failed." });
    } finally {
      setSavingLogo(false);
    }
  }, [saveKit, logoDraft, flash]);

  // ── Section 2: Colors ───────────────────────────────────────────────────
  const handleColorsSave = useCallback(async () => {
    setSavingColors(true);
    setSectionError(null);
    try {
      // A PARTIAL patch carrying only the three colour fields — an empty string
      // CLEARS that one colour rather than leaving the old value, and no other
      // section of the kit is touched.
      await saveKit({
        colours: {
          primary: colorsDraft.primary,
          secondary: colorsDraft.secondary,
          accent: colorsDraft.accent,
        },
      });
      flash("colors");
    } catch (e) {
      setSectionError({ section: "colors", message: (e as Error).message || "Save failed." });
    } finally {
      setSavingColors(false);
    }
  }, [saveKit, colorsDraft, flash]);

  // ── Sections 3/4/5 all hit voice/profile (different envelope keys) ──────
  // Each builds a fresh merge from the LATEST envelope so concurrent edits
  // don't trample each other.
  const putVoiceProfile = useCallback(
    async (patch: Partial<ToneEnvelope>) => {
      const currentEnvelope = (voice?.tone_attributes ?? null) as ToneEnvelope | null;
      const nextEnvelope = mergeEnvelope(currentEnvelope, patch);
      // The PUT requires voice_examples too — pass through any existing list
      // (or empty array for new profiles). Backend tolerates [].
      const body = {
        tone_attributes: nextEnvelope,
        voice_examples: Array.isArray(voice?.voice_examples) ? voice!.voice_examples : [],
      };
      const updated = await lumen.put<VoiceProfileResponse>("/api/v1/my-brand/voice/profile", body);
      setVoice(updated);
      return updated;
    },
    [lumen, voice]
  );

  const handleTypographySave = useCallback(async () => {
    setSavingTypography(true);
    setSectionError(null);
    try {
      await saveKit({
        fonts: {
          heading: typographyDraft.heading,
          body: typographyDraft.body,
        },
      });
      flash("typography");
    } catch (e) {
      setSectionError({ section: "typography", message: (e as Error).message || "Save failed." });
    } finally {
      setSavingTypography(false);
    }
  }, [saveKit, typographyDraft, flash]);

  const handleVoiceSave = useCallback(async () => {
    setSavingVoice(true);
    setSectionError(null);
    try {
      await putVoiceProfile({
        selected_voices: voiceDraft.selected,
        custom_voice: voiceDraft.custom || undefined,
      });
      flash("voice");
    } catch (e) {
      setSectionError({ section: "voice", message: (e as Error).message || "Save failed." });
    } finally {
      setSavingVoice(false);
    }
  }, [putVoiceProfile, voiceDraft, flash]);

  const handleTaglineSave = useCallback(async () => {
    setSavingTagline(true);
    setSectionError(null);
    try {
      await putVoiceProfile({ tagline: taglineDraft || undefined });
      flash("tagline");
    } catch (e) {
      setSectionError({ section: "tagline", message: (e as Error).message || "Save failed." });
    } finally {
      setSavingTagline(false);
    }
  }, [putVoiceProfile, taglineDraft, flash]);

  // ── Derived: detect per-section changes so Save stays disabled until dirty
  // Dirty is measured against THE KIT, which is the thing being written.
  const logoChanged = (kit.logo_url ?? null) !== logoDraft;
  const colorsChanged =
    kitColour("primary") !== colorsDraft.primary ||
    kitColour("secondary") !== colorsDraft.secondary ||
    kitColour("accent") !== colorsDraft.accent;
  const envelope = (voice?.tone_attributes ?? null) as ToneEnvelope | null;
  const typographyChanged =
    kitFont("heading") !== typographyDraft.heading ||
    kitFont("body") !== typographyDraft.body;
  const voiceChanged =
    JSON.stringify(envelope?.selected_voices ?? []) !== JSON.stringify(voiceDraft.selected) ||
    (envelope?.custom_voice ?? "") !== voiceDraft.custom;
  const taglineChanged = (envelope?.tagline ?? "") !== taglineDraft;

  // ── Voice picker toggle (reuses the picker logic from ClientTenantModal)
  const toggleVoice = useCallback((key: string) => {
    setVoiceDraft((prev) => {
      if (prev.selected.includes(key)) {
        return { ...prev, selected: prev.selected.filter((k) => k !== key) };
      }
      if (prev.selected.length >= MAX_VOICES) return prev;
      return { ...prev, selected: [...prev.selected, key] };
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SettingsLayout
        title="Brand Identity"
        description="Your brand appears across emails, customer portals, and AI-generated content. Update once, applies everywhere."
      >
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          Loading brand identity…
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="Brand Identity"
      description="Your brand appears across emails, customer portals, and AI-generated content. Update once, applies everywhere."
    >
      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* A brand we could not READ is not a brand of slate. platform-api answers
          503 — never a colour — when core.tenants is unreadable, precisely so
          this can be said out loud instead of showing a save that would write
          over colours the page never managed to load. */}
      {kitError && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your brand could not be loaded ({kitError}). The colours and fonts below are the
          platform defaults, not yours — reload before saving.
        </div>
      )}

      {/* ── 1. Logo ───────────────────────────────────────────────────── */}
      <Section
        icon={<ImageIcon className="h-4 w-4" />}
        title="Logo"
        description="Shown on invoices, the customer portal, AI-generated emails, and the booking page."
      >
        <LogoPicker
          value={logoDraft}
          onChange={setLogoDraft}
          api={{ get: oliver.get, post: oliver.post }}
          website={profile?.website ?? null}
        />
        <div className="mt-4 flex items-center gap-3">
          <SaveButton
            onClick={handleLogoSave}
            busy={savingLogo}
            disabled={!logoChanged}
            label="Save logo"
            justSaved={savedFlash === "logo"}
          />
          {savedFlash === "logo" && (
            <span className="text-xs text-emerald-700">Saved — applied across all products.</span>
          )}
          {sectionError?.section === "logo" && (
            <span className="text-xs text-red-700">{sectionError.message}</span>
          )}
        </div>
      </Section>

      {/* ── 2. Colors ─────────────────────────────────────────────────── */}
      <Section
        icon={<Palette className="h-4 w-4" />}
        title="Colors"
        description="Primary and secondary always apply. Accent is optional — used for portal highlights."
      >
        <div className="space-y-3">
          {/* The swatch a picker shows for an UNSET colour is the kit neutral,
              not a literal. These three rows used to read #1A3A4A / #FEC82C /
              #1A7DB5 — IA navy, IA gold and a blue belonging to nobody — so the
              picker suggested our brand to a business that had chosen none. */}
          {([
            ["primary", "Primary"],
            ["secondary", "Secondary"],
            ["accent", "Accent (optional)"],
          ] as const).map(([key, label]) => {
            const v = colorsDraft[key];
            const fallback = NEUTRAL_BRAND_KIT.colours[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-36 text-sm text-gray-700">{label}</span>
                <input
                  type="color"
                  value={v || fallback}
                  onChange={(e) => setColorsDraft((p) => ({ ...p, [key]: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                  aria-label={`${label} color picker`}
                />
                <input
                  type="text"
                  value={v}
                  onChange={(e) => setColorsDraft((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={fallback}
                  className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                  aria-label={`${label} hex value`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton
            onClick={handleColorsSave}
            busy={savingColors}
            disabled={!colorsChanged}
            label="Save colors"
            justSaved={savedFlash === "colors"}
          />
          {savedFlash === "colors" && (
            <span className="text-xs text-emerald-700">Saved — applied across all products.</span>
          )}
          {sectionError?.section === "colors" && (
            <span className="text-xs text-red-700">{sectionError.message}</span>
          )}
        </div>
      </Section>

      {/* ── 3. Typography ─────────────────────────────────────────────── */}
      <Section
        icon={<Type className="h-4 w-4" />}
        title="Typography"
        description="Heading and body fonts for documents, emails, and the portal. Pick from curated web-safe fonts."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(["heading", "body"] as const).map((kind) => {
            const value = typographyDraft[kind];
            const preview = fontCatalog.find((f) => f.value === value)?.stack || "system-ui";
            return (
              <div key={kind}>
                <label className="block text-sm font-medium text-gray-700">
                  {kind === "heading" ? "Heading font" : "Body font"}
                </label>
                <select
                  value={value}
                  onChange={(e) => setTypographyDraft((p) => ({ ...p, [kind]: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="">— Use default —</option>
                  {fontCatalog.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}{f.export_safe ? "" : " — web only"}
                    </option>
                  ))}
                </select>
                <div
                  className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-base text-gray-800"
                  style={{ fontFamily: preview }}
                >
                  {kind === "heading" ? "The quick brown fox" : "The quick brown fox jumps over the lazy dog."}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton
            onClick={handleTypographySave}
            busy={savingTypography}
            disabled={!typographyChanged}
            label="Save typography"
            justSaved={savedFlash === "typography"}
          />
          {savedFlash === "typography" && (
            <span className="text-xs text-emerald-700">Saved.</span>
          )}
          {sectionError?.section === "typography" && (
            <span className="text-xs text-red-700">{sectionError.message}</span>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Fonts marked “web only” render everywhere on screen but are substituted in a
          downloaded graphic — only the faces bundled with the export renderer come out exact.
        </p>
      </Section>

      {/* ── 4. Brand Voice ────────────────────────────────────────────── */}
      <Section
        icon={<Mic2 className="h-4 w-4" />}
        title="Brand Voice"
        description="Pick up to 3 voices that describe how your brand should sound. Used by AI-generated copy and the brand-voice drift checker."
      >
        <BrandVoicePicker
          selected={voiceDraft.selected}
          onToggle={toggleVoice}
          max={MAX_VOICES}
        />
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Custom voice notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={voiceDraft.custom}
            onChange={(e) =>
              setVoiceDraft((p) => ({
                ...p,
                custom: e.target.value.slice(0, MAX_CUSTOM_VOICE),
              }))
            }
            rows={3}
            placeholder="e.g. Sign off as 'The Team' not 'Owner Name'. Avoid exclamation points. Reference our 'no jargon' rule."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          <div className="mt-1 text-right text-[11px] text-gray-400">
            {voiceDraft.custom.length}/{MAX_CUSTOM_VOICE}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton
            onClick={handleVoiceSave}
            busy={savingVoice}
            disabled={!voiceChanged}
            label="Save voice"
            justSaved={savedFlash === "voice"}
          />
          {savedFlash === "voice" && (
            <span className="text-xs text-emerald-700">Saved.</span>
          )}
          {sectionError?.section === "voice" && (
            <span className="text-xs text-red-700">{sectionError.message}</span>
          )}
        </div>
      </Section>

      {/* ── 5. Tagline ────────────────────────────────────────────────── */}
      <Section
        icon={<Quote className="h-4 w-4" />}
        title="Tagline"
        description="A short one-liner that sums up your brand. Appears on the booking page, in email signatures, and in AI-generated copy."
      >
        <input
          type="text"
          value={taglineDraft}
          onChange={(e) => setTaglineDraft(e.target.value.slice(0, MAX_TAGLINE))}
          placeholder="e.g. Built right, the first time."
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        <div className="mt-1 text-right text-[11px] text-gray-400">
          {taglineDraft.length}/{MAX_TAGLINE}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton
            onClick={handleTaglineSave}
            busy={savingTagline}
            disabled={!taglineChanged}
            label="Save tagline"
            justSaved={savedFlash === "tagline"}
          />
          {savedFlash === "tagline" && (
            <span className="text-xs text-emerald-700">Saved.</span>
          )}
          {sectionError?.section === "tagline" && (
            <span className="text-xs text-red-700">{sectionError.message}</span>
          )}
        </div>
      </Section>
    </SettingsLayout>
  );
}

// ── Local voice picker ────────────────────────────────────────────────────
//
// We don't reuse the BrandVoicePicker exported from ClientTenantModal
// directly because that picker bakes in its own state-shape contract
// (selected: string[] | string, onSelectedChange, custom + onCustomChange),
// which doesn't fit our per-section save model (we keep custom_voice
// separate so its save flush is one bag of envelope keys). Instead we use
// the same BRAND_VOICE_CATALOG constant + the same styling so the visual
// is identical and the data shape stays canonical.
function BrandVoicePicker({
  selected,
  onToggle,
  max,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  max: number;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-700">
        Pick up to {max} ({selected.length}/{max} selected)
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {BRAND_VOICE_CATALOG.map((v) => {
          const active = selected.includes(v.key);
          const disabled = !active && selected.length >= max;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onToggle(v.key)}
              disabled={disabled}
              title={
                disabled
                  ? `You've picked the max of ${max} voices — deselect one to pick another.`
                  : undefined
              }
              className={`text-left rounded-lg border-2 p-2.5 transition ${
                active
                  ? "border-sky-500 bg-sky-50"
                  : disabled
                    ? "border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed"
                    : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <div className="flex items-start gap-2">
                <input type="checkbox" readOnly checked={active} disabled={disabled} className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{v.key}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{v.description}</div>
                  <div className="mt-1 text-[11px] italic leading-snug text-slate-500">"{v.example}"</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BrandIdentityPage;
