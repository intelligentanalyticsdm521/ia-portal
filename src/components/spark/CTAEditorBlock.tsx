// CTAEditorBlock — Reusable Call-To-Action block editor for SPARK
// composers (campaigns, templates, welcome emails, newsletters).
//
// Why this exists as its own component:
//   Per the locked 2026-06-24 "SPARK Campaign Composer v1.1" scope, every
//   SPARK email surface that lets a writer drop a CTA should share the SAME
//   shape (type/label/url/colors/radius/width/align) so the LUMEN-API
//   renderer can render exactly one button block schema. The previous
//   inline "button block" in the deprecated SparkEmailTemplatesPage was
//   missing border radius, width, alignment and HARDCODED the orange brand
//   accent #EF6C33 — wrong for every non-IA tenant.
//
// API contract (`CTAValue`) is the authoritative serialized shape — when
// emitted into the email block tree as a "button" block, the LUMEN-API
// emailBuilder.js renderer honors:
//
//   { type: "button", text, url, background, color,
//     border_radius, width ("fit"|"full"), align ("left"|"center"|"right") }
//
// "type: 'link'" serializes as a paragraph with an inline <a>, NOT a button
// block. "type: 'other'" serializes as a button block too (same renderer)
// but the editor labels it as a generic CTA for future flexibility.
//
// COLOURS COME FROM THE BRAND KIT (BUILDER_PLATFORM_SCOPE_2026-09-15 §2,
// step 0). useBrandKit() is one fetch for the whole shell, so the three chips
// (Primary / Secondary / Accent) and the default button colour are the
// business's own, and they repaint the moment Brand Identity saves.
//
// The brandPrimaryColor / brandSecondaryColor / brandAccentColor props survive
// as OVERRIDES for a caller that genuinely has a different palette (a preview
// of somebody else's document). They used to be the only source, fetched
// separately by each composer from oliver /settings, with a last resort of
// Intelligent Analytics' own navy on a client's button. There is no hardcoded
// colour in this file any more.
//
// Merge tags use user-friendly names per the locked 2026-06-24
// "Merge tags user-friendly naming" convention — the picker inserts
// `{{welcome link}}` style tokens, NOT `{{tenant.welcome_link}}`.

import { useMemo, useRef } from "react";
import { Link as LinkIcon, MousePointerClick, Square } from "lucide-react";
import { MergeTagPicker, type MergeTag } from "./MergeTagPicker";
import { useBrandKit } from "../../brand/BrandKitProvider";
import { NEUTRAL_BRAND_KIT, readableOn, type BrandKit } from "../../lib/brandKit";

// ── Types ─────────────────────────────────────────────────────────────────

export type CTAType = "link" | "button" | "other";
export type CTAWidth = "fit" | "full";
export type CTAAlign = "left" | "center" | "right";

/**
 * The serialized CTA payload. Persisted into block trees / template JSON.
 * Optional fields default to sensible values on render so older payloads
 * (e.g. from the deprecated button block) still render correctly.
 */
export interface CTAValue {
  type: CTAType;
  label: string;
  url: string;
  /** Button background color. Defaults to the brand kit accent. */
  buttonColor?: string;
  /** Button text color. Defaults to auto-contrast against the background. */
  textColor?: string;
  /** Border radius in px. 9999 == pill. Defaults to 6. */
  borderRadius?: number;
  /** "fit" → inline padding only, "full" → full container width. Default "fit". */
  width?: CTAWidth;
  /** Default "center". */
  align?: CTAAlign;
}

export interface CTAEditorBlockProps {
  value: CTAValue;
  onChange: (next: CTAValue) => void;
  /** OVERRIDE the kit's primary. Omit and the brand kit supplies it. */
  brandPrimaryColor?: string;
  /** OVERRIDE the kit's secondary. */
  brandSecondaryColor?: string;
  /** OVERRIDE the kit's accent. The default for a new CTA either way. */
  brandAccentColor?: string;
  /** Override the default merge-tag catalog (campaign vs. welcome-email surfaces). */
  mergeTagCatalog?: MergeTag[];
  /** Compact mode hides the inline preview (useful in tight composer columns). */
  compact?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Compute a readable text colour for a given background, by YIQ luminance.
 *
 * The dark option used to be Intelligent Analytics' navy, written out — our
 * ink on somebody else's button. It is the brand kit's own text colour now, so
 * a business that chose its ink gets it. Pass the kit; the neutral one is the
 * default so a pure caller (the serializer below, a test) still works.
 */
export function autoContrastColor(bg: string, kit: BrandKit = NEUTRAL_BRAND_KIT): string {
  return readableOn(bg, kit);
}

/** Catalog used when no parent override is provided. Includes the link tokens
 *  most CTA editors need (welcome / onboarding / unsubscribe / preferences). */
export const DEFAULT_CTA_MERGE_TAGS: MergeTag[] = [
  { key: "welcome link",      label: "Welcome link",      category: "Campaign", example: "auto link" },
  { key: "onboarding link",   label: "Onboarding link",   category: "Campaign", example: "auto link" },
  { key: "unsubscribe link",  label: "Unsubscribe link",  category: "Campaign", example: "auto link" },
  { key: "preferences link",  label: "Preferences link",  category: "Campaign", example: "auto link" },
  { key: "view in browser",   label: "View in browser",   category: "Campaign", example: "auto link" },
  { key: "tenant website",    label: "Business website",  category: "Business", example: "https://example.com" },
];

const RADIUS_PRESETS: { label: string; value: number }[] = [
  { label: "0",    value: 0 },
  { label: "4",    value: 4 },
  { label: "8",    value: 8 },
  { label: "12",   value: 12 },
  { label: "24",   value: 24 },
  { label: "Pill", value: 9999 },
];

// ── Component ─────────────────────────────────────────────────────────────

export function CTAEditorBlock({
  value,
  onChange,
  brandPrimaryColor,
  brandSecondaryColor,
  brandAccentColor,
  mergeTagCatalog,
  compact,
}: CTAEditorBlockProps) {
  // Stable URL input ref so MergeTagPicker can insert at the caret.
  const urlRef = useRef<HTMLInputElement>(null);
  // THE brand kit — one fetch for the whole shell, live on save.
  const { kit } = useBrandKit();
  const primary = brandPrimaryColor || kit.colours.primary;
  const secondary = brandSecondaryColor || kit.colours.secondary;
  const accent = brandAccentColor || kit.colours.accent;

  // Effective colours — the author's own override, then the brand accent. No
  // literal behind them: the kit is already the neutral when nothing is set.
  const effectiveBg = useMemo(() => {
    if (value.type === "link") return "transparent";
    return value.buttonColor || accent;
  }, [value.type, value.buttonColor, accent]);

  const effectiveText = useMemo(() => {
    if (value.type === "link") return value.textColor || accent;
    return value.textColor || autoContrastColor(effectiveBg, kit);
  }, [value.type, value.textColor, accent, effectiveBg, kit]);

  const align = value.align || "center";
  const width = value.width || "fit";
  const radius = value.borderRadius ?? 6;
  const tags = mergeTagCatalog && mergeTagCatalog.length > 0 ? mergeTagCatalog : DEFAULT_CTA_MERGE_TAGS;

  // ── Field handlers ──
  const setType = (t: CTAType) => onChange({ ...value, type: t });
  const setLabel = (label: string) => onChange({ ...value, label });
  const setUrl = (url: string) => onChange({ ...value, url });
  const setButtonColor = (buttonColor: string) =>
    onChange({ ...value, buttonColor, textColor: undefined });
  const setTextColor = (textColor: string) => onChange({ ...value, textColor });
  const setRadius = (borderRadius: number) => onChange({ ...value, borderRadius });
  const setWidth = (w: CTAWidth) => onChange({ ...value, width: w });
  const setAlign = (a: CTAAlign) => onChange({ ...value, align: a });

  const showButtonStyling = value.type === "button" || value.type === "other";

  return (
    <div className="border border-slate-200 rounded p-3 bg-white space-y-3">
      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">
        Call-to-action
      </div>

      {/* ── Type radio ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mr-1">Type</span>
        {([
          { v: "link",   label: "Link",   icon: LinkIcon },
          { v: "button", label: "Button", icon: MousePointerClick },
          { v: "other",  label: "Other",  icon: Square },
        ] as const).map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => setType(v)}
            className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
              value.type === v
                ? "bg-slate-800 text-white border-slate-800"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Label ── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          {value.type === "link" ? "Link text" : "Button label"}
        </label>
        <input
          type="text"
          value={value.label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={value.type === "link" ? "Read the welcome email" : "Get started"}
          className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
        />
      </div>

      {/* ── URL with merge-tag picker ── */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            URL
          </label>
          <MergeTagPicker
            targetRef={urlRef}
            value={value.url}
            onChange={setUrl}
            tags={tags}
            label="Insert link tag"
            compact
          />
        </div>
        <input
          ref={urlRef}
          type="text"
          value={value.url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com  or  {{welcome link}}"
          className="w-full text-sm border border-slate-300 rounded p-1.5 focus:border-slate-400 focus:ring-1 focus:ring-slate-300 font-mono"
        />
        <div className="text-[10px] text-slate-400 mt-0.5">
          Paste a URL or click "Insert link tag" to drop in an automatic
          link like {"{{welcome link}}"} or {"{{unsubscribe link}}"}.
        </div>
      </div>

      {/* ── Button styling (button / other only) ── */}
      {showButtonStyling && (
        <>
          {/* Colors — brand-aware chip picker. Defaults to Accent when no
             override is set. Custom reveals the hex/color inputs. */}
          {(() => {
            const brandChips = [
              { key: "primary",   label: "Primary",   hex: primary   },
              { key: "secondary", label: "Secondary", hex: secondary },
              { key: "accent",    label: "Accent",    hex: accent    },
            ].filter((c) => !!c.hex);
            const matchedBrand = brandChips.find((c) => c.hex && c.hex.toLowerCase() === effectiveBg.toLowerCase());
            // Custom = user has explicitly set buttonColor AND it doesn't match any brand chip.
            const isCustom = !!value.buttonColor && !matchedBrand;
            return (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Button color
                  </label>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {brandChips.map((c) => {
                      const active = !isCustom && (matchedBrand?.key === c.key || (!matchedBrand && !value.buttonColor && c.key === "accent"));
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setButtonColor(c.hex!)}
                          title={`${c.label}: ${c.hex}`}
                          className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${
                            active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ background: c.hex }} />
                          {c.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setButtonColor(value.buttonColor || effectiveBg)}
                      className={`text-[11px] px-2 py-1 rounded border ${
                        isCustom ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {isCustom && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="color"
                        value={effectiveBg}
                        onChange={(e) => setButtonColor(e.target.value)}
                        className="h-7 w-10 border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={effectiveBg}
                        onChange={(e) => setButtonColor(e.target.value)}
                        className="flex-1 text-xs font-mono border border-slate-300 rounded p-1"
                      />
                    </div>
                  )}
                  {!value.buttonColor && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {kit.sources?.accent === "tenant"
                        ? `Using your brand accent (${accent}).`
                        : "No brand colour set yet — pick one under Settings → Brand Identity and every builder follows."}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Text color <span className="text-slate-400 normal-case font-normal">(auto)</span>
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={effectiveText}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="h-7 w-10 border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      value={effectiveText}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="flex-1 text-xs font-mono border border-slate-300 rounded p-1"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Border radius chips */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Border radius
            </label>
            <div className="flex flex-wrap gap-1 mt-1">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRadius(r.value)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    radius === r.value
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Width chips */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Width
            </label>
            <div className="flex gap-1 mt-1">
              {([
                { v: "fit",  label: "Fit content" },
                { v: "full", label: "Full width" },
              ] as const).map((w) => (
                <button
                  key={w.v}
                  type="button"
                  onClick={() => setWidth(w.v)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    width === w.v
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Alignment (applies to link too) ── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          Alignment
        </label>
        <div className="flex gap-1 mt-1">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAlign(a)}
              className={`text-[11px] px-2 py-1 rounded border capitalize ${
                align === a
                  ? "bg-slate-800 text-white border-slate-800"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── Inline preview ── */}
      {!compact && (
        <div className="border-t border-slate-100 pt-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Preview
          </div>
          <CTAPreview
            value={{ ...value, buttonColor: effectiveBg, textColor: effectiveText }}
          />
        </div>
      )}
    </div>
  );
}

// ── Standalone preview ────────────────────────────────────────────────────

/**
 * Mirror of the LUMEN-API emailBuilder button rendering, so writers see the
 * same thing the inbox will render. If you change the renderer, update this
 * preview to match.
 */
/**
 * The preview takes the kit so a CTA with no explicit colour previews in the
 * BUSINESS's accent — which is what the inbox will show. It previewed in IA
 * navy before, so the editor and the sent email disagreed for every tenant
 * who had not overridden the colour.
 */
export function CTAPreview({ value, kit = NEUTRAL_BRAND_KIT }: { value: CTAValue; kit?: BrandKit }) {
  const align = value.align || "center";
  const radius = value.borderRadius ?? 6;
  const width = value.width || "fit";
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const label = value.label || (value.type === "link" ? "Link text" : "Click here");

  if (value.type === "link") {
    return (
      <div className="bg-slate-50 rounded p-4" style={{ textAlign: align }}>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{
            color: value.textColor || kit.colours.accent,
            textDecoration: "underline",
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          {label}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded p-4" style={{ display: "flex", justifyContent: justify }}>
      <span
        style={{
          display: "inline-block",
          background: value.buttonColor || kit.colours.accent,
          color: value.textColor || readableOn(value.buttonColor || kit.colours.accent, kit),
          padding: "12px 24px",
          borderRadius: `${radius}px`,
          fontWeight: 600,
          fontSize: 16,
          fontFamily: "Helvetica, Arial, sans-serif",
          textDecoration: "none",
          textAlign: "center",
          width: width === "full" ? "100%" : undefined,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Serializer to email block tree ────────────────────────────────────────

/**
 * Convert a CTAValue into the block shape consumed by LUMEN-API
 * emailBuilder.js. The renderer was extended (same commit) to honor
 * border_radius + width + align fields on button blocks.
 *
 * - type "link" emits a paragraph block with an inline <a>. We keep the
 *   underlying `text` field equal to the label so the plain-text fallback
 *   stays meaningful.
 * - type "button"/"other" emits a "button" block.
 */
/**
 * ...and the serializer takes it too, because this is where the colour gets
 * BAKED into the saved block. A CTA saved with no explicit colour used to
 * write IA navy into the tenant's template forever; it writes their accent
 * now, and the neutral only when they have chosen nothing at all.
 */
export function ctaToBlock(value: CTAValue, kit: BrandKit = NEUTRAL_BRAND_KIT): Record<string, unknown> {
  const align = value.align || "center";
  if (value.type === "link") {
    const color = value.textColor || kit.colours.accent;
    const url = value.url || "#";
    const label = value.label || "Click here";
    // Plain text mirrors label so the text fallback isn't an empty paragraph.
    return {
      type: "paragraph",
      align,
      color,
      text: label,
      html: `<a href="${escapeAttr(url)}" style="color:${color};font-weight:600;text-decoration:underline;">${escapeHtml(label)}</a>`,
    };
  }
  return {
    type: "button",
    text: value.label || "Click here",
    url: value.url || "#",
    background: value.buttonColor || kit.colours.accent,
    color: value.textColor || autoContrastColor(value.buttonColor || kit.colours.accent, kit),
    align,
    border_radius: value.borderRadius ?? 6,
    width: value.width || "fit",
  };
}

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default CTAEditorBlock;
