/**
 * lookModel.ts — the Look tab's rules, as a pure module.
 *
 * CUSTOMER_PORTAL_LOOK_SCOPE_2026-09-25 §5. No React, no import.meta.env, so
 * `npm test` (node --test over pure modules) drives every rule here.
 *
 * The data and the contrast arithmetic are NOT redefined here: they come from
 * ./presets.ts, the byte-identical copy of the customer portal's file (the
 * five token sets, the feature keys and their words, the WCAG sums). What this
 * module adds is only what the Portal's editor needs on top:
 *
 *   FEATURES            the ten buttons and functions as rows for the picker.
 *   choiceFromSaved     GET /portals/design?kind=customer → { preset,
 *                       use_brand, features }, plus the plan allowances and the
 *                       brand kit oliver-api sends beside them.
 *   lookProblems        the two pairs the save refuses under 4.5:1, in the
 *                       same sentence oliver-api's 400 look_unreadable uses.
 *   resolvePreviewLook  the preview's copy of oliver-api lib/portalLook.js
 *                       resolveLook(): preset tokens, then the business's
 *                       CHOSEN brand slots over them. The server resolves the
 *                       look customers actually get; this only paints the
 *                       unsaved preview, so it follows the server's rules.
 *   the preview protocol (§5.2) and the preview address.
 */

import {
  FEATURE_INFO,
  FEATURE_KEYS,
  LOCKED_FEATURES,
  MIN_CONTRAST,
  PRESETS,
  PRESET_KEYS,
  contrastRatio,
  normalizeFeatures as normalizeFeaturesShared,
  normalizeHex,
  type FeatureKey,
  type LookColors,
  type LookFeatures,
  type PortalLook,
  type PresetKey,
} from "./presets";

export { MIN_CONTRAST, FEATURE_KEYS };
export type { FeatureKey, LookFeatures, PortalLook, PresetKey };

// ── Buttons & functions (D-CP8) ────────────────────────────────────────────

export interface FeatureRow {
  key: FeatureKey;
  /** What the customer sees it called. */
  label: string;
  /** One line: what it does for the customer. */
  what: string;
  /** Cannot be switched off (contract §5.1: visits and account). */
  locked: boolean;
}

/** In the customer portal's nav order, in the shared file's words. */
export const FEATURES: FeatureRow[] = FEATURE_KEYS.map((key) => ({
  key,
  label: FEATURE_INFO[key].label,
  what: FEATURE_INFO[key].help,
  locked: LOCKED_FEATURES.includes(key),
}));

/** A missing key means on, except Documents; My visits and Account are always on. */
export function normalizeFeatures(raw: unknown): LookFeatures {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  return normalizeFeaturesShared(obj);
}

// ── The saved choice (portal_design.customer) ──────────────────────────────

/** What PATCH /portals/design?kind=customer stores: the choice, not the colours. */
export interface LookChoice {
  preset: PresetKey;
  use_brand: boolean;
  features: LookFeatures;
}

/**
 * When nothing has been saved: Fresh, brand on. Mirrors oliver-api
 * lib/portalLook.js DEFAULT_CHOICES — the server answers GET with these filled
 * in, so this only matters against an API that does not yet.
 */
export const DEFAULT_CHOICE: Readonly<Omit<LookChoice, "features">> = { preset: "fresh", use_brand: true };

export function isPresetKey(v: unknown): v is PresetKey {
  return typeof v === "string" && (PRESET_KEYS as readonly string[]).includes(v);
}

export function choiceFromSaved(saved: unknown): LookChoice {
  const s = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return {
    preset: isPresetKey(s.preset) ? s.preset : DEFAULT_CHOICE.preset,
    use_brand: typeof s.use_brand === "boolean" ? s.use_brand : DEFAULT_CHOICE.use_brand,
    features: normalizeFeatures(s.features),
  };
}

export function sameChoice(a: LookChoice | null, b: LookChoice | null): boolean {
  if (!a || !b) return a === b;
  if (a.preset !== b.preset || a.use_brand !== b.use_brand) return false;
  return FEATURE_KEYS.every((k) => a.features[k] === b.features[k]);
}

/** The brand kit slice oliver-api sends with the design (and the look reads). */
export interface BrandForLook {
  colours: Partial<Record<"primary" | "secondary" | "accent" | "text" | "background", string>>;
  fonts: { heading?: string | null; body?: string | null };
  /** Per-slot provenance from platform-api: "tenant", "legacy_voice_profile" or "default". */
  sources: Record<string, string>;
}

/** What the plan includes, as oliver-api decides it (lib/tierFeatures.js). */
export interface LookAllowances {
  /** Brand colours and fonts: Standard and above. */
  brand: boolean;
  /** "Powered by OLIVER" off: Pro and above. */
  remove_powered_by: boolean;
}

/**
 * The plan allowances out of the GET/PATCH answer. An API that does not send
 * them yet is treated the way oliver-api treats an unresolved plan: the brand
 * is allowed (the save is where a refusal belongs) and the credit line stays.
 */
export function allowancesFromSaved(saved: unknown): LookAllowances {
  const a = saved && typeof saved === "object" ? (saved as { allowances?: Record<string, unknown> }).allowances : null;
  return {
    brand: typeof a?.brand === "boolean" ? a.brand : true,
    remove_powered_by: typeof a?.remove_powered_by === "boolean" ? a.remove_powered_by : false,
  };
}

/** The brand kit out of the GET/PATCH answer, or null when none came. */
export function brandFromSaved(saved: unknown): BrandForLook | null {
  const b = saved && typeof saved === "object" ? (saved as { brand?: unknown }).brand : null;
  if (!b || typeof b !== "object") return null;
  const r = b as Record<string, unknown>;
  const colours = r.colours && typeof r.colours === "object" ? (r.colours as BrandForLook["colours"]) : {};
  const fonts = r.fonts && typeof r.fonts === "object" ? (r.fonts as BrandForLook["fonts"]) : {};
  const sources = r.sources && typeof r.sources === "object" ? (r.sources as Record<string, string>) : {};
  return { colours, fonts, sources };
}

/** A colour slot the business actually chose (sources say "tenant"), or null. */
export function chosenBrandColour(brand: BrandForLook | null, slot: "primary" | "secondary" | "text" | "background"): string | null {
  if (!brand || brand.sources[slot] !== "tenant") return null;
  return normalizeHex(brand.colours[slot]);
}

/** A font slot the business chose (directly, or still in the older voice profile), or null. */
export function chosenBrandFont(brand: BrandForLook | null, slot: "heading" | "body"): string | null {
  if (!brand) return null;
  const src = brand.sources[`${slot}_font`];
  if (src !== "tenant" && src !== "legacy_voice_profile") return null;
  const v = brand.fonts[slot];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── Contrast ───────────────────────────────────────────────────────────────

/** A ratio that cannot be measured counts as the worst one, so it can only fail. */
function ratioOf(a: string, b: string): number {
  return normalizeHex(a) && normalizeHex(b) ? contrastRatio(a, b) : 1;
}

export interface LookProblem {
  /** The pair, as oliver-api names it in 400 look_unreadable. */
  pair: "primary_on_surface" | "text_on_background";
  /** One decimal, rounded down, as the API shows it. */
  ratio: number;
  foreground: string;
  background: string;
  /** One plain sentence for the owner. */
  message: string;
}

const CHECKS: Array<{ pair: LookProblem["pair"]; fg: keyof LookColors; bg: keyof LookColors; fgLabel: string; bgLabel: string }> = [
  { pair: "primary_on_surface", fg: "primary", bg: "surface", fgLabel: "main colour", bgLabel: "card background" },
  { pair: "text_on_background", fg: "text", bg: "background", fgLabel: "text colour", bgLabel: "page background" },
];

/** The two pairs the save refuses under 4.5:1 (contract §5.1), worded as the API words them. */
export function lookProblems(colors: LookColors): LookProblem[] {
  const out: LookProblem[] = [];
  for (const c of CHECKS) {
    const fg = colors[c.fg];
    const bg = colors[c.bg];
    const ratio = ratioOf(fg, bg);
    if (ratio < MIN_CONTRAST) {
      const shown = Math.floor(ratio * 10) / 10;
      out.push({
        pair: c.pair,
        ratio: shown,
        foreground: fg,
        background: bg,
        message: `The ${c.fgLabel} (${fg}) on the ${c.bgLabel} (${bg}) is too hard to read: ${shown} to 1, and it needs at least ${MIN_CONTRAST} to 1.`,
      });
    }
  }
  return out;
}

// ── The resolved look (what the preview is sent) ───────────────────────────

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/**
 * Button words on a colour, oliver-api's rule: white when white reaches 4.5:1,
 * else the look's own dark text when that does, else black or white, whichever
 * reads better.
 */
export function buttonTextOn(background: string, dark: string): string {
  if (ratioOf(WHITE, background) >= MIN_CONTRAST) return WHITE;
  const d = normalizeHex(dark);
  if (d && d !== BLACK && ratioOf(d, background) >= MIN_CONTRAST) return d;
  return ratioOf(BLACK, background) >= ratioOf(WHITE, background) ? BLACK : WHITE;
}

function mixHex(a: string, b: string, t: number): string {
  const A = normalizeHex(a);
  const B = normalizeHex(b);
  if (!A || !B) return A || B || a;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const out = [1, 3, 5].map((i) => Math.round(ch(A, i) + (ch(B, i) - ch(A, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Secondary text for a brand text/background pair: readable on page and card. */
function deriveMuted(text: string, background: string, surface: string): string {
  for (const t of [0.3, 0.25, 0.2, 0.15, 0.1, 0.05]) {
    const m = mixHex(text, background, t);
    if (ratioOf(m, background) >= MIN_CONTRAST && ratioOf(m, surface) >= MIN_CONTRAST) return m;
  }
  return normalizeHex(text) || text;
}

export interface ResolveOptions {
  /** allowances.brand */
  brandAllowed: boolean;
  /** allowances.remove_powered_by */
  removePoweredBy: boolean;
}

/**
 * The preset's tokens; then, when the switch is on and the plan allows it, the
 * brand kit's primary, secondary (as the accent), text, background, heading and
 * body font — only the slots the business chose, so a preset is never repainted
 * in the platform's neutral slate. A brand text or background gets its own
 * muted and border. Button words are worked out for the colours the look ends
 * up with. `use_brand` is what is in effect, as the server reports it.
 */
export function resolvePreviewLook(choice: LookChoice, brand: BrandForLook | null, opts: ResolveOptions): PortalLook {
  const preset = PRESETS[choice.preset] || PRESETS[DEFAULT_CHOICE.preset];
  const colors: LookColors = { ...preset.colors };
  const fonts = { ...preset.fonts };
  const brandOn = choice.use_brand && opts.brandAllowed;

  if (brandOn) {
    const primary = chosenBrandColour(brand, "primary");
    const accent = chosenBrandColour(brand, "secondary");
    const text = chosenBrandColour(brand, "text");
    const background = chosenBrandColour(brand, "background");
    if (primary) colors.primary = primary;
    if (accent) colors.accent = accent;
    if (text) colors.text = text;
    if (background) colors.background = background;
    if (text || background) {
      colors.muted = deriveMuted(colors.text, colors.background, colors.surface);
      colors.border = mixHex(colors.background, colors.text, 0.12);
    }
    const heading = chosenBrandFont(brand, "heading");
    const body = chosenBrandFont(brand, "body");
    if (heading) fonts.heading = heading;
    if (body) fonts.body = body;
  }

  colors.primary_text = buttonTextOn(colors.primary, colors.text);
  colors.accent_text = buttonTextOn(colors.accent, colors.text);

  return {
    preset: choice.preset,
    use_brand: brandOn,
    colors,
    fonts,
    shape: { ...preset.shape },
    features: normalizeFeatures(choice.features),
    powered_by: !opts.removePoweredBy,
  };
}

// ── Preview protocol (contract §5.2) ───────────────────────────────────────

export const LOOK_MESSAGE = "oliver-look";
export const LOOK_READY_MESSAGE = "oliver-look-ready";

export function lookMessage(look: PortalLook): { type: typeof LOOK_MESSAGE; look: PortalLook } {
  return { type: LOOK_MESSAGE, look };
}

export function isLookReady(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { type?: unknown }).type === LOOK_READY_MESSAGE;
}

/**
 * Where the preview loads the customer portal: the business's own portal
 * address with ?look=preview on it. `portalAddress` is what the hub page
 * already prints (the path form, or a ready custom domain); `devOrigin`
 * replaces its origin in local dev, where the customer app runs on :5175.
 */
export function lookPreviewSrc(portalAddress: string, slug: string | null, devOrigin: string | null): string | null {
  if (!slug) return null;
  try {
    const url = devOrigin ? new URL(`/${encodeURIComponent(slug)}/`, devOrigin) : new URL(portalAddress);
    url.searchParams.set("look", "preview");
    return url.toString();
  } catch {
    return null;
  }
}

// ── Fonts ──────────────────────────────────────────────────────────────────

/** A Google Fonts stylesheet for one family, regular and bold. */
export function googleFontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.trim()).replace(/%20/g, "+")}:wght@400;700&display=swap`;
}
