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
 *   WORDING_FIELDS      the six lines a business can reword (D-CP10), their
 *                       standard text, and the rules the save holds them to.
 *   choiceFromSaved     GET /portals/design?kind=customer → { preset,
 *                       use_brand, features, wording }, plus the plan
 *                       allowances and the brand kit oliver-api sends beside
 *                       them.
 *   lookSaveBody        what Save look sends to PATCH /portals/design.
 *   lookProblems        the two pairs the save refuses under 4.5:1, in the
 *                       same sentence oliver-api's 400 look_unreadable uses.
 *   resolvePreviewLook  the preview's copy of oliver-api lib/portalLook.js
 *                       resolveLook(): preset tokens, then the business's
 *                       CHOSEN brand slots over them. The server resolves the
 *                       look customers actually get; this only paints the
 *                       unsaved preview, so it follows the server's rules.
 *   the preview protocol (§5.2) and the preview address.
 */

import { apiErrorMessage } from "../../../lib/apiErrorMessage";
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

// ── Wording (D-CP10) ───────────────────────────────────────────────────────

/**
 * The six lines of the customer portal a business can put in its own words,
 * in the order a customer meets them. portal_design.customer.wording holds the
 * business's text; a line left empty (or missing) shows the standard text.
 *
 * The words in braces are filled in by the customer portal, never here:
 * {time} becomes morning, afternoon or evening by the customer's clock, {name}
 * the customer's first name ("there" when it is not known), {business} the
 * business's display name. oliver-api trims each line and refuses one over 60
 * characters, or one carrying HTML tags or control characters, with
 * 400 wording_invalid; unknown keys are dropped.
 */
export type WordingKey = "subtitle" | "greeting" | "book_label" | "request_label" | "change_time_title" | "footer_line";

export const WORDING_KEYS: readonly WordingKey[] = [
  "subtitle", "greeting", "book_label", "request_label", "change_time_title", "footer_line",
];

export type LookWording = Record<WordingKey, string>;

/** The most characters one line may have, after trimming. */
export const WORDING_MAX = 60;

/** What the portal says when the business has set nothing. */
export const STANDARD_WORDING: Readonly<LookWording> = Object.freeze({
  subtitle: "Customer portal",
  greeting: "Good {time}, {name}",
  book_label: "Book a visit",
  request_label: "Request service",
  change_time_title: "Need to change your time?",
  footer_line: "{business}",
});

export interface WordingField {
  key: WordingKey;
  /** What the owner calls the line. */
  label: string;
  /** Where the customer sees it. */
  where: string;
  /** What the words in braces become; null when the line has none. */
  hint: string | null;
}

export const WORDING_FIELDS: readonly WordingField[] = [
  {
    key: "subtitle",
    label: "Under your business name",
    where: "The small line under your business name at the top of every page.",
    hint: null,
  },
  {
    key: "greeting",
    label: "Home page greeting",
    where: "The heading at the top of the home page.",
    hint: "{time} shows as morning, afternoon or evening by the customer's clock, and {name} as their first name (or “there” if we don't have it).",
  },
  {
    key: "book_label",
    label: "Book a visit button",
    where: "The button on the home page, and the title of the booking page.",
    hint: null,
  },
  {
    key: "request_label",
    label: "Request service button",
    where: "The button on the home page, and the title of the request page.",
    hint: null,
  },
  {
    key: "change_time_title",
    label: "Change of time card",
    where: "The title of the card on a visit's page where a customer asks for a different time.",
    hint: null,
  },
  {
    key: "footer_line",
    label: "Footer",
    where: "The line at the very bottom of every page.",
    hint: "{business} shows as your business's name.",
  },
];

/**
 * The wording as the editor compares and saves it: all six keys, each the
 * business's own text trimmed, "" where it set nothing. Text that IS the
 * standard reads as "" too, so it shows as the grey standard, and an answer
 * that fills the standard in reads back the same as one that leaves it out.
 * Unknown keys are dropped.
 */
export function normalizeWording(raw: unknown): LookWording {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as LookWording;
  for (const key of WORDING_KEYS) {
    const v = obj[key];
    const text = typeof v === "string" ? v.trim() : "";
    out[key] = text === STANDARD_WORDING[key] ? "" : text;
  }
  return out;
}

/** Every key, the standard where the business set nothing. Braces are left for the portal. */
export function resolveWording(raw: unknown): LookWording {
  const w = normalizeWording(raw);
  const out = {} as LookWording;
  for (const key of WORDING_KEYS) out[key] = w[key] || STANDARD_WORDING[key];
  return out;
}

export function sameWording(a: unknown, b: unknown): boolean {
  const x = normalizeWording(a);
  const y = normalizeWording(b);
  return WORDING_KEYS.every((k) => x[k] === y[k]);
}

// An HTML tag: < then a letter, / or ! and on to the next >. A lone "<" or
// ">" in a sentence is words, not a tag.
const WORDING_TAG = /<\/?[a-z!][^>]*>/i;
// eslint-disable-next-line no-control-regex
const WORDING_CONTROL = /[\u0000-\u001f\u007f]/;

/** Why one line could not be saved, in a plain sentence, or null when it can. */
export function wordingProblem(text: unknown): string | null {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return null;
  if (t.length > WORDING_MAX) return `Keep this to ${WORDING_MAX} characters or fewer; it has ${t.length}.`;
  if (WORDING_TAG.test(t)) return "Plain words only: take out anything written between < and >.";
  if (WORDING_CONTROL.test(t)) return "Keep this to one plain line: take out the tab or line break.";
  return null;
}

/** The lines Save look would be refused on, by key. Empty when all six can be saved. */
export function wordingProblems(wording: unknown): Partial<Record<WordingKey, string>> {
  const obj = wording && typeof wording === "object" ? (wording as Record<string, unknown>) : {};
  const out: Partial<Record<WordingKey, string>> = {};
  for (const key of WORDING_KEYS) {
    const p = wordingProblem(obj[key]);
    if (p) out[key] = p;
  }
  return out;
}

export interface WordingError {
  /** The line the server named, or null when it named none. */
  key: WordingKey | null;
  /** The server's own sentence. */
  message: string;
}

const API_ERROR = /^[A-Z]+ API \d+: (.*)$/s;

/**
 * A save refused with 400 wording_invalid, as the line it is about and the
 * API's sentence; null for every other error. The line is read from the
 * answer's `field` (or `key`, `wording_key`, `wording`, or the same inside
 * `details`), so the Look tab can print the sentence under that field.
 */
export function wordingErrorFromApi(e: unknown): WordingError | null {
  if (!e || typeof e !== "object") return null;
  const err = e as { code?: unknown; body?: unknown; message?: unknown };
  let body: Record<string, unknown> | null = err.body && typeof err.body === "object" ? (err.body as Record<string, unknown>) : null;
  if (!body && typeof err.message === "string") {
    const m = err.message.match(API_ERROR);
    if (m) {
      try {
        const parsed: unknown = JSON.parse(m[1]);
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch { /* not JSON: not a wording refusal we can place */ }
    }
  }
  const code = typeof err.code === "string" ? err.code : typeof body?.error === "string" ? body.error : null;
  if (code !== "wording_invalid") return null;
  const details = body?.details && typeof body.details === "object" && !Array.isArray(body.details)
    ? (body.details as Record<string, unknown>)
    : {};
  const named = [body?.field, body?.key, body?.wording_key, body?.wording, details.field, details.key]
    .find((v): v is WordingKey => typeof v === "string" && (WORDING_KEYS as readonly string[]).includes(v));
  return { key: named ?? null, message: apiErrorMessage(e) };
}

// ── The saved choice (portal_design.customer) ──────────────────────────────

/** What PATCH /portals/design?kind=customer stores: the choice, not the colours. */
export interface LookChoice {
  preset: PresetKey;
  use_brand: boolean;
  features: LookFeatures;
  /** The business's own text per line; "" means the standard text. */
  wording: LookWording;
}

/**
 * When nothing has been saved: Fresh, brand on. Mirrors oliver-api
 * lib/portalLook.js DEFAULT_CHOICES — the server answers GET with these filled
 * in, so this only matters against an API that does not yet.
 */
export const DEFAULT_CHOICE: Readonly<Omit<LookChoice, "features" | "wording">> = { preset: "fresh", use_brand: true };

export function isPresetKey(v: unknown): v is PresetKey {
  return typeof v === "string" && (PRESET_KEYS as readonly string[]).includes(v);
}

/**
 * The wording is read from the stored `wording`; an answer that carries it
 * only inside the resolved `look` (standard text filled in) reads the same,
 * because text that is the standard reads back as "".
 */
export function choiceFromSaved(saved: unknown): LookChoice {
  const s = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const look = s.look && typeof s.look === "object" ? (s.look as Record<string, unknown>) : null;
  return {
    preset: isPresetKey(s.preset) ? s.preset : DEFAULT_CHOICE.preset,
    use_brand: typeof s.use_brand === "boolean" ? s.use_brand : DEFAULT_CHOICE.use_brand,
    features: normalizeFeatures(s.features),
    wording: normalizeWording(s.wording !== undefined ? s.wording : look?.wording),
  };
}

/** Drives "Unsaved changes": wording compares as it would be saved (trimmed, standard = ""). */
export function sameChoice(a: LookChoice | null, b: LookChoice | null): boolean {
  if (!a || !b) return a === b;
  if (a.preset !== b.preset || a.use_brand !== b.use_brand) return false;
  if (!FEATURE_KEYS.every((k) => a.features[k] === b.features[k])) return false;
  return sameWording(a.wording, b.wording);
}

/**
 * What Save look sends to PATCH /portals/design?kind=customer:
 * { preset, use_brand, features, wording }. All six wording keys always go,
 * "" for "use the standard text", so a line cleared here is cleared on the
 * server too instead of the old text being kept.
 */
export function lookSaveBody(draft: LookChoice, brandAllowed: boolean): LookChoice {
  return {
    preset: draft.preset,
    // Below Standard the switch is off on screen; send what is on screen.
    use_brand: draft.use_brand && brandAllowed,
    features: normalizeFeatures(draft.features),
    wording: normalizeWording(draft.wording),
  };
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

/**
 * The look the preview is sent: §5.1's object plus `wording`, every key
 * present with the standard filled in where the business set nothing and the
 * braces left for the portal to fill — the same shape oliver-api serves on
 * GET /public/portal/tenant (D-CP10).
 */
export type PreviewLook = PortalLook & { wording: LookWording };

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
 * up with. `use_brand` is what is in effect, as the server reports it. The
 * wording rides along resolved (standard where empty, braces unexpanded).
 */
export function resolvePreviewLook(choice: LookChoice, brand: BrandForLook | null, opts: ResolveOptions): PreviewLook {
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
    wording: resolveWording(choice.wording),
  };
}

// ── Preview protocol (contract §5.2) ───────────────────────────────────────

export const LOOK_MESSAGE = "oliver-look";
export const LOOK_READY_MESSAGE = "oliver-look-ready";

export function lookMessage<L extends PortalLook>(look: L): { type: typeof LOOK_MESSAGE; look: L } {
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
