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
// brandAccentColor should be fetched once by the parent from
// /settings (Oliver) → brandColorAccent and passed in. Falls back to
// "#1A3A4A" (IA primary navy) — NEVER the deprecated "#EF6C33" hardcode.
//
// Merge tags use user-friendly names per the locked 2026-06-24
// "Merge tags user-friendly naming" convention — the picker inserts
// `{{welcome link}}` style tokens, NOT `{{tenant.welcome_link}}`.

import { useMemo, useRef } from "react";
import { Link as LinkIcon, MousePointerClick, Square } from "lucide-react";
import { MergeTagPicker, type MergeTag } from "./MergeTagPicker";

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
  /** Button background color. Defaults to brandAccentColor or #1A3A4A. */
  buttonColor?: string;
  /** Button text color. Defaults to auto-contrast (white or #1A3A4A). */
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
  /** Pulled from /settings.brandColorAccent at the page level. Fallback "#1A3A4A". */
  brandAccentColor?: string;
  /** Override the default merge-tag catalog (campaign vs. welcome-email surfaces). */
  mergeTagCatalog?: MergeTag[];
  /** Compact mode hides the inline preview (useful in tight composer columns). */
  compact?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_BG_FALLBACK = "#1A3A4A";

/**
 * Compute a readable text color (#FFFFFF or #1A3A4A) for a given background.
 * Uses YIQ luminance — same heuristic as OliverPortalsHubPage's accent
 * contrast check.
 */
export function autoContrastColor(bg: string): string {
  const hex = (bg || "").replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return "#FFFFFF";
  const expand = hex.length === 3
    ? hex.split("").map((c) => c + c).join("")
    : hex;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#FFFFFF";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#1A3A4A" : "#FFFFFF";
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
  brandAccentColor,
  mergeTagCatalog,
  compact,
}: CTAEditorBlockProps) {
  // Stable URL input ref so MergeTagPicker can insert at the caret.
  const urlRef = useRef<HTMLInputElement>(null);

  // Effective colors — fall back to brand accent, then IA navy, then auto-contrast.
  const effectiveBg = useMemo(() => {
    if (value.type === "link") return "transparent";
    return value.buttonColor || brandAccentColor || DEFAULT_BG_FALLBACK;
  }, [value.type, value.buttonColor, brandAccentColor]);

  const effectiveText = useMemo(() => {
    if (value.type === "link") return value.textColor || (brandAccentColor || DEFAULT_BG_FALLBACK);
    return value.textColor || autoContrastColor(effectiveBg);
  }, [value.type, value.textColor, brandAccentColor, effectiveBg]);

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
                ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
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
          className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#1A3A4A] focus:ring-1 focus:ring-[#1A3A4A]"
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
          className="w-full text-sm border border-slate-300 rounded p-1.5 focus:border-[#1A3A4A] focus:ring-1 focus:ring-[#1A3A4A] font-mono"
        />
        <div className="text-[10px] text-slate-400 mt-0.5">
          Paste a URL or click "Insert link tag" to drop in an automatic
          link like {"{{welcome link}}"} or {"{{unsubscribe link}}"}.
        </div>
      </div>

      {/* ── Button styling (button / other only) ── */}
      {showButtonStyling && (
        <>
          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Button color
              </label>
              <div className="flex items-center gap-2 mt-0.5">
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
              {!value.buttonColor && brandAccentColor && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Using your brand accent. Pick a color to override.
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Text color <span className="text-slate-400 normal-case font-normal">(auto)</span>
              </label>
              <div className="flex items-center gap-2 mt-0.5">
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
                      ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
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
                      ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
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
                  ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
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
export function CTAPreview({ value }: { value: CTAValue }) {
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
            color: value.textColor || "#1A3A4A",
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
          background: value.buttonColor || "#1A3A4A",
          color: value.textColor || "#FFFFFF",
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
export function ctaToBlock(value: CTAValue): Record<string, unknown> {
  const align = value.align || "center";
  if (value.type === "link") {
    const color = value.textColor || "#1A3A4A";
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
    background: value.buttonColor || "#1A3A4A",
    color: value.textColor || autoContrastColor(value.buttonColor || "#1A3A4A"),
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
