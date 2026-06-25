/**
 * BrandIntake — simplified brand-direction capture used by BOTH onboarding
 * wizards.
 *
 * This is the shared shape lifted from the Rolling-In-It intake form
 * (C:/Users/brand/OneDrive/Desktop/Claude Code Session Sync/Intake Form…)
 * after Brandon flagged that:
 *   - Path A (Stripe-checkout → /pricing/onboarding) was capturing a
 *     single-select brandVoice enum (5 options) + a single primaryColor.
 *   - The founder wizard's ARION section had a 12-voice multi-select and
 *     3 colors but no differentiators / sliders / positioning / colors-to-
 *     avoid / photography preference / etc.
 *   - The intake form has ~25 load-bearing fields none of which had slots.
 *
 * The same shape is used in BOTH wizards so AI features (ARION copy gen,
 * SPARK campaign writer, STELLA) can rely on a single contract.
 *
 * Persisted to `lumen.brand_voice_profile` (migration 053 base table +
 * migration 066 explicit intake columns). Pure JSON shape — no React or
 * server dependencies — so it can be imported on either side of the
 * wire freely.
 *
 * Every field is OPTIONAL because the step is skippable in Path A. The
 * Founder wizard treats them as soft-required for Build-Your-Brand
 * engagements (no hard block — Save & Continue still advances).
 */

// ─── Sliders (1-10) ──────────────────────────────────────────────────────
//
// 1 = far-left pole; 10 = far-right pole. Default 5 (neutral) when the
// customer has not interacted with the slider yet. Each slider answers a
// single positioning question — together they quantify the brand spectrum
// that the AI copywriter consumes alongside the voice tags.
export interface BrandSliders {
  /** 1 = Casual / 10 = Formal */
  casual_formal: number;
  /** 1 = Affordable / 10 = Premium */
  affordable_premium: number;
  /** 1 = Traditional / 10 = Modern */
  traditional_modern: number;
  /** 1 = Local/Personal / 10 = Corporate */
  local_corporate: number;
}

export const DEFAULT_BRAND_SLIDERS: BrandSliders = {
  casual_formal: 5,
  affordable_premium: 5,
  traditional_modern: 5,
  local_corporate: 5,
};

// ─── Voice trait lexicon (small, shared) ─────────────────────────────────
//
// Used for BOTH voice_traits (pick up to 3) and tones_to_avoid (pick any).
// Kept deliberately small so the picker is scannable; the founder wizard
// retains the richer BRAND_VOICE_CATALOG for its broader 12-voice picker.
//
// The values here are the human-readable lowercase labels Rolling In It
// chose in its intake (bold, energetic, reliable, trustworthy, approachable,
// friendly, efficient). Extended with a handful of additional contractor /
// service / B2B common traits so the lexicon covers most SMB cases.
export const BRAND_TRAIT_LEXICON = [
  "bold",
  "energetic",
  "reliable",
  "trustworthy",
  "approachable",
  "friendly",
  "efficient",
  "playful",
  "professional",
  "luxurious",
  "scientific",
  "expert",
  "warm",
  "direct",
  "witty",
] as const;

export type BrandTrait = typeof BRAND_TRAIT_LEXICON[number];

// ─── Visual direction ────────────────────────────────────────────────────
export const VISUAL_DIRECTION_OPTIONS = [
  { value: "bold_graphic", label: "Bold / graphic" },
  { value: "modern_sleek", label: "Modern / sleek" },
  { value: "classic_elegant", label: "Classic / elegant" },
  { value: "organic_handmade", label: "Organic / handmade" },
] as const;

export type VisualDirection = typeof VISUAL_DIRECTION_OPTIONS[number]["value"];

export const PHOTOGRAPHY_OPTIONS = [
  { value: "real_photos", label: "Real photos of our work" },
  { value: "stock_ok", label: "Stock photography is fine" },
  { value: "both", label: "Both — mix real + stock" },
] as const;

export type PhotographyPreference = typeof PHOTOGRAPHY_OPTIONS[number]["value"];

// ─── Positioning territory ───────────────────────────────────────────────
export const POSITIONING_TERRITORIES = [
  "reliable",
  "fast",
  "premium",
  "friendly",
  "expert",
  "local",
  "value",
] as const;

export type PositioningTerritory = typeof POSITIONING_TERRITORIES[number];

// ─── Top-level shape ─────────────────────────────────────────────────────
export interface BrandIntake {
  // Voice & tone
  /** Pick up to 3 from BRAND_TRAIT_LEXICON. */
  voice_traits: BrandTrait[];
  /** Pick any subset of BRAND_TRAIT_LEXICON the customer wants to avoid. */
  tones_to_avoid: BrandTrait[];

  // Sliders
  sliders: BrandSliders;

  // Differentiators
  /** Up to 3 short bullets — "why choose us over a competitor". */
  differentiators: string[];

  // Visual direction
  visual_direction: VisualDirection | "";
  photography_preference: PhotographyPreference | "";

  // Aspirations / inspiration
  /** Free-text — 2-3 admired brands. Helps the AI copy borrow register. */
  admired_brands: string;
  /** Free-text — 1 brand to avoid sounding like. */
  avoid_brand: string;

  // Positioning
  /** Multi-select territories the brand wants to own. */
  positioning_territories: PositioningTerritory[];
}

export const DEFAULT_BRAND_INTAKE: BrandIntake = {
  voice_traits: [],
  tones_to_avoid: [],
  sliders: { ...DEFAULT_BRAND_SLIDERS },
  differentiators: ["", "", ""],
  visual_direction: "",
  photography_preference: "",
  admired_brands: "",
  avoid_brand: "",
  positioning_territories: [],
};

// ─── Hydration helper ────────────────────────────────────────────────────
//
// Defensively coerce a partial (or legacy / undefined) value into a full
// BrandIntake. Used by hydration paths in both wizards so a saved_state
// row written before this feature lands still works.
export function coerceBrandIntake(v: unknown): BrandIntake {
  if (!v || typeof v !== "object") return { ...DEFAULT_BRAND_INTAKE };
  const o = v as Partial<BrandIntake> & Record<string, unknown>;
  const traits = Array.isArray(o.voice_traits)
    ? (o.voice_traits as unknown[]).filter(
        (k): k is BrandTrait =>
          typeof k === "string" && (BRAND_TRAIT_LEXICON as readonly string[]).includes(k),
      )
    : [];
  const avoid = Array.isArray(o.tones_to_avoid)
    ? (o.tones_to_avoid as unknown[]).filter(
        (k): k is BrandTrait =>
          typeof k === "string" && (BRAND_TRAIT_LEXICON as readonly string[]).includes(k),
      )
    : [];
  const sliders: BrandSliders = {
    casual_formal: clamp(Number(o.sliders && (o.sliders as BrandSliders).casual_formal) || 5),
    affordable_premium: clamp(Number(o.sliders && (o.sliders as BrandSliders).affordable_premium) || 5),
    traditional_modern: clamp(Number(o.sliders && (o.sliders as BrandSliders).traditional_modern) || 5),
    local_corporate: clamp(Number(o.sliders && (o.sliders as BrandSliders).local_corporate) || 5),
  };
  const diffs = Array.isArray(o.differentiators)
    ? (o.differentiators as unknown[]).map((s) => (typeof s === "string" ? s : "")).slice(0, 3)
    : [];
  while (diffs.length < 3) diffs.push("");
  const territories = Array.isArray(o.positioning_territories)
    ? (o.positioning_territories as unknown[]).filter(
        (k): k is PositioningTerritory =>
          typeof k === "string" && (POSITIONING_TERRITORIES as readonly string[]).includes(k),
      )
    : [];
  const visual = typeof o.visual_direction === "string"
    && (VISUAL_DIRECTION_OPTIONS as readonly { value: string }[]).some((v) => v.value === o.visual_direction)
      ? (o.visual_direction as VisualDirection)
      : "";
  const photo = typeof o.photography_preference === "string"
    && (PHOTOGRAPHY_OPTIONS as readonly { value: string }[]).some((v) => v.value === o.photography_preference)
      ? (o.photography_preference as PhotographyPreference)
      : "";
  return {
    voice_traits: traits,
    tones_to_avoid: avoid,
    sliders,
    differentiators: diffs as string[],
    visual_direction: visual,
    photography_preference: photo,
    admired_brands: typeof o.admired_brands === "string" ? o.admired_brands : "",
    avoid_brand: typeof o.avoid_brand === "string" ? o.avoid_brand : "",
    positioning_territories: territories,
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 5;
  if (n < 1) return 1;
  if (n > 10) return 10;
  return Math.round(n);
}

// ─── Serializer for lumen.brand_voice_profile ────────────────────────────
//
// The brand_voice_profile.tone_attributes column is a JSON blob (per the
// migration 053 header comment) — we use it to hold the structured intake
// alongside legacy fields. Both wizards converge on this shape via the
// `flushBrandIntakeToProfile` helper in the backend.
export interface BrandVoiceProfileToneAttributes {
  /** Canonical voice tags (intake voice_traits + founder-wizard brand_voice merged). */
  voice_traits?: BrandTrait[];
  tones_to_avoid?: BrandTrait[];
  sliders?: BrandSliders;
  visual_direction?: VisualDirection | "";
  photography_preference?: PhotographyPreference | "";
  positioning_territories?: PositioningTerritory[];
  admired_brands?: string;
  avoid_brand?: string;
  /** Free-text differentiators — also seeded as voice_examples. */
  differentiators?: string[];
  /** Source flag — "onboarding_wizard" | "founder_wizard" | "intake_import". */
  source?: string;
  /** ISO timestamp captured at write time. */
  captured_at?: string;
}
