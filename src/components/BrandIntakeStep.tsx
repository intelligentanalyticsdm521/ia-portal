/**
 * BrandIntakeStep — simplified brand-direction capture, reused by BOTH
 * onboarding wizards.
 *
 * Path A (Stripe-checkout → /pricing/onboarding) uses it as a NEW step
 * between Questionnaire and Branding (or as a single fold-out section for
 * the OLIVER/SPARK ProductSignupFlow which today asks only logistical
 * fields).
 *
 * The founder wizard (ClientTenantModal.tsx) uses it inside the ARION
 * section so AI copy gen + STELLA + SPARK have the same fields whether
 * the customer self-onboarded or the founder onboarded them.
 *
 * Pure presentational — takes a BrandIntake value + onChange callback,
 * no internal API calls. The wrapping component decides whether to
 * persist on change, on save, or via a runner.
 */

import {
  BRAND_TRAIT_LEXICON,
  DEFAULT_BRAND_INTAKE,
  POSITIONING_TERRITORIES,
  PHOTOGRAPHY_OPTIONS,
  VISUAL_DIRECTION_OPTIONS,
  type BrandIntake,
  type BrandTrait,
  type PhotographyPreference,
  type PositioningTerritory,
  type VisualDirection,
} from "../types/brandIntake";

const MAX_VOICE_TRAITS = 3;

export interface BrandIntakeStepProps {
  value: BrandIntake;
  onChange: (next: BrandIntake) => void;
  /** Optional intro copy — wrappers can override for their context. */
  intro?: string;
  /** Optional accent color (defaults to ARION orange). */
  accentColor?: string;
}

/**
 * Full Brand-Direction step. Renders all sections vertically. Designed
 * to live inside an already-scrolling shell (modal body, page main).
 */
export function BrandIntakeStep({
  value,
  onChange,
  intro = "These 12 quick answers shape every piece of AI-generated copy and design across your sites, campaigns, and customer messages. Skip anything you're not sure about — we'll guess sensibly from your other answers.",
  accentColor = "#EF6C33",
}: BrandIntakeStepProps) {
  // Defensive — if a parent forgot to seed full defaults, coerce here too.
  const v: BrandIntake = {
    ...DEFAULT_BRAND_INTAKE,
    ...(value || {}),
    sliders: { ...DEFAULT_BRAND_INTAKE.sliders, ...(value?.sliders || {}) },
  };

  function set<K extends keyof BrandIntake>(k: K, next: BrandIntake[K]) {
    onChange({ ...v, [k]: next });
  }

  function setSlider(k: keyof BrandIntake["sliders"], n: number) {
    onChange({ ...v, sliders: { ...v.sliders, [k]: n } });
  }

  function setDifferentiator(i: number, s: string) {
    const arr = [...v.differentiators];
    arr[i] = s;
    set("differentiators", arr);
  }

  function toggleTrait(t: BrandTrait) {
    if (v.voice_traits.includes(t)) {
      set("voice_traits", v.voice_traits.filter((x) => x !== t));
    } else if (v.voice_traits.length < MAX_VOICE_TRAITS) {
      set("voice_traits", [...v.voice_traits, t]);
    }
  }

  function toggleAvoid(t: BrandTrait) {
    if (v.tones_to_avoid.includes(t)) {
      set("tones_to_avoid", v.tones_to_avoid.filter((x) => x !== t));
    } else {
      set("tones_to_avoid", [...v.tones_to_avoid, t]);
    }
  }

  function togglePositioning(t: PositioningTerritory) {
    if (v.positioning_territories.includes(t)) {
      set("positioning_territories", v.positioning_territories.filter((x) => x !== t));
    } else {
      set("positioning_territories", [...v.positioning_territories, t]);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-6">{intro}</p>

      {/* ── Voice traits ──────────────────────────────────────────── */}
      <Section
        title="Voice traits"
        sub={`Pick up to ${MAX_VOICE_TRAITS} words that describe how you sound (${v.voice_traits.length}/${MAX_VOICE_TRAITS}).`}
      >
        <ChipGrid>
          {BRAND_TRAIT_LEXICON.map((t) => {
            const active = v.voice_traits.includes(t);
            const disabled = !active && v.voice_traits.length >= MAX_VOICE_TRAITS;
            return (
              <Chip
                key={`v_${t}`}
                label={t}
                active={active}
                disabled={disabled}
                onClick={() => toggleTrait(t)}
                accentColor={accentColor}
              />
            );
          })}
        </ChipGrid>
      </Section>

      {/* ── Sliders ───────────────────────────────────────────────── */}
      <Section
        title="Brand personality"
        sub="Where do you land on each spectrum? Default is neutral (5)."
      >
        <SliderRow
          left="Casual"
          right="Formal"
          value={v.sliders.casual_formal}
          onChange={(n) => setSlider("casual_formal", n)}
          accentColor={accentColor}
        />
        <SliderRow
          left="Affordable"
          right="Premium"
          value={v.sliders.affordable_premium}
          onChange={(n) => setSlider("affordable_premium", n)}
          accentColor={accentColor}
        />
        <SliderRow
          left="Traditional"
          right="Modern"
          value={v.sliders.traditional_modern}
          onChange={(n) => setSlider("traditional_modern", n)}
          accentColor={accentColor}
        />
        <SliderRow
          left="Local / Personal"
          right="Corporate"
          value={v.sliders.local_corporate}
          onChange={(n) => setSlider("local_corporate", n)}
          accentColor={accentColor}
        />
      </Section>

      {/* ── Tones to avoid ────────────────────────────────────────── */}
      <Section
        title="Tones to avoid"
        sub="Anything from the list above that does NOT fit your brand."
      >
        <ChipGrid>
          {BRAND_TRAIT_LEXICON.map((t) => {
            const active = v.tones_to_avoid.includes(t);
            return (
              <Chip
                key={`a_${t}`}
                label={t}
                active={active}
                onClick={() => toggleAvoid(t)}
                accentColor="#dc2626"
              />
            );
          })}
        </ChipGrid>
      </Section>

      {/* ── Differentiators ──────────────────────────────────────── */}
      <Section
        title="Top 3 differentiators"
        sub="Short bullets — what would you tell a customer choosing between you and a competitor?"
      >
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            value={v.differentiators[i] || ""}
            onChange={(e) => setDifferentiator(i, e.target.value)}
            placeholder={
              i === 0
                ? "e.g. Owner-operated — no subcontractors"
                : i === 1
                  ? "e.g. We show up when we say we will"
                  : "e.g. Year-round service, not seasonal"
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2"
          />
        ))}
      </Section>

      {/* ── Visual direction ─────────────────────────────────────── */}
      <Section title="Visual direction" sub="Pick one — what feel should the site/designs have?">
        <ChipGrid>
          {VISUAL_DIRECTION_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={v.visual_direction === o.value}
              onClick={() => set("visual_direction", o.value as VisualDirection)}
              accentColor={accentColor}
            />
          ))}
        </ChipGrid>
      </Section>

      {/* ── Photography ──────────────────────────────────────────── */}
      <Section title="Photography" sub="What kind of imagery should we use?">
        <ChipGrid>
          {PHOTOGRAPHY_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={v.photography_preference === o.value}
              onClick={() => set("photography_preference", o.value as PhotographyPreference)}
              accentColor={accentColor}
            />
          ))}
        </ChipGrid>
      </Section>

      {/* ── Aspirations ──────────────────────────────────────────── */}
      <Section
        title="Brands you admire"
        sub="2-3 brands whose tone or look you'd like yours to feel adjacent to (any industry)."
      >
        <input
          value={v.admired_brands}
          onChange={(e) => set("admired_brands", e.target.value)}
          placeholder="e.g. Patagonia, Allbirds, Yeti"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </Section>

      <Section title="One brand to avoid" sub="A brand whose voice/look you do NOT want to be confused with.">
        <input
          value={v.avoid_brand}
          onChange={(e) => set("avoid_brand", e.target.value)}
          placeholder="e.g. A big-box chain"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </Section>

      {/* ── Positioning territory ────────────────────────────────── */}
      <Section
        title="Positioning territory"
        sub="Pick all that apply — where do you want to be known in your category?"
      >
        <ChipGrid>
          {POSITIONING_TERRITORIES.map((t) => (
            <Chip
              key={t}
              label={t}
              active={v.positioning_territories.includes(t)}
              onClick={() => togglePositioning(t)}
              accentColor={accentColor}
            />
          ))}
        </ChipGrid>
      </Section>
    </div>
  );
}

// ─── Internal subcomponents ──────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 mb-2">{sub}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ChipGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  label,
  active,
  disabled,
  onClick,
  accentColor,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  const bg = active ? accentColor : "white";
  const fg = active ? "white" : "#374151";
  const border = active ? accentColor : "#d1d5db";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-sm border transition ${disabled ? "opacity-40 cursor-not-allowed" : "hover:border-gray-500"}`}
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      {label}
    </button>
  );
}

function SliderRow({
  left,
  right,
  value,
  onChange,
  accentColor,
}: {
  left: string;
  right: string;
  value: number;
  onChange: (n: number) => void;
  accentColor: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>{left}</span>
        <span className="font-mono text-gray-700">{value}/10</span>
        <span>{right}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor }}
      />
    </div>
  );
}
