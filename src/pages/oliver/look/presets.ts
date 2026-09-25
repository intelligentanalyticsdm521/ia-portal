// src/look/presets.ts — THE five customer-portal looks, and the arithmetic that
// keeps them readable.
//
// ONE FILE, TWO REPOS. The customer portal owns this file; the Portal keeps a
// byte-identical copy at Portal-septa/src/pages/oliver/look/presets.ts (its
// preset cards, its live contrast warning), and a test in each repo fails the
// moment the two differ. oliver-api mirrors the same values in
// lib/portalLook.js. So: no imports, nothing app-specific, plain data and pure
// functions only. Change it here, copy it there, run both suites.
//
// Scope + build contract: overnight-report/CUSTOMER_PORTAL_LOOK_SCOPE_2026-09-25.md
// §4 (the rule) and §5.1 (the `look` object this file's shapes follow).
//
// THE RULE (§4): screens only ever read named style tokens. A preset changes
// the VALUES of those tokens, never the layout, so switching looks can never
// break a screen.
//
// WHERE THE NUMBERS COME FROM. Background, surface, primary, accent, text,
// fonts, corner radius, card style and density are the research's values
// (fifteen competitor portals read, 2026-09-25) with the contrast guard below
// applied. Two colours per look were not in the research and were chosen here:
//
//   muted  — secondary text. Picked per look to sit at 5:1 or better on BOTH
//            the page background and the card surface, in the look's own hue.
//   border — card outlines, dividers and table rules. Fresh and Polished use
//            the research's hairline; the other three take a light tint of the
//            background's hue so a divider never reads as a grey foreign line.
//
// Measured (contrast ratio, WCAG 2.x relative luminance):
//
//   look      primary/surface  text/background  muted/background  muted/surface
//   fresh          5.47            16.92             7.18             7.58
//   friendly       5.18            12.96             6.44             6.78
//   sturdy        14.68            16.12             6.87             7.56
//   grounded       6.39            13.63             5.19             5.66
//   polished      14.63            13.54             5.49             5.93
//
// `primary_text` and `accent_text` are not chosen, they are computed: black or
// white, whichever reads better on the colour (readableTextOn below — the
// Calendly rule from the research). Friendly's sunflower and Sturdy's safety
// amber therefore carry black text; every other button colour carries white.

export type PresetKey = 'fresh' | 'friendly' | 'sturdy' | 'grounded' | 'polished';

export const PRESET_KEYS: readonly PresetKey[] = ['fresh', 'friendly', 'sturdy', 'grounded', 'polished'];

export type CardStyle = 'outlined' | 'elevated' | 'flat';
export type Density = 'compact' | 'comfortable' | 'roomy';

export interface LookColors {
  primary: string;
  primary_text: string;
  accent: string;
  accent_text: string;
  text: string;
  muted: string;
  background: string;
  surface: string;
  border: string;
}

export interface LookFonts {
  heading: string;
  body: string;
}

export interface LookShape {
  /** Card corner radius in px. Buttons derive theirs from it. */
  radius: number;
  card: CardStyle;
  density: Density;
}

/** §5.1 `features`, in nav order. */
export type FeatureKey =
  | 'book' | 'request' | 'visits' | 'invoices' | 'quotes'
  | 'messages' | 'reschedule' | 'documents' | 'photos' | 'account';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'book', 'request', 'visits', 'invoices', 'quotes',
  'messages', 'reschedule', 'documents', 'photos', 'account',
];

export type LookFeatures = Record<FeatureKey, boolean>;

/** The whole look as the API serves it on GET /public/portal/tenant (§5.1). */
export interface PortalLook {
  preset: PresetKey;
  use_brand: boolean;
  colors: LookColors;
  fonts: LookFonts;
  shape: LookShape;
  features: LookFeatures;
  powered_by: boolean;
}

export interface PresetTokens {
  colors: LookColors;
  fonts: LookFonts;
  shape: LookShape;
}

export const PRESETS: Readonly<Record<PresetKey, PresetTokens>> = {
  fresh: {
    colors: {
      primary: '#0F766E', primary_text: '#FFFFFF',
      accent: '#0369A1', accent_text: '#FFFFFF',
      text: '#0F172A', muted: '#475569',
      background: '#F7F9FB', surface: '#FFFFFF', border: '#E2E8F0',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    shape: { radius: 12, card: 'outlined', density: 'comfortable' },
  },
  friendly: {
    colors: {
      primary: '#C2410C', primary_text: '#FFFFFF',
      accent: '#FFB703', accent_text: '#000000',
      text: '#3B2A20', muted: '#6F5646',
      background: '#FFF8F0', surface: '#FFFFFF', border: '#F0E2D2',
    },
    fonts: { heading: 'Nunito', body: 'Nunito' },
    shape: { radius: 20, card: 'elevated', density: 'comfortable' },
  },
  sturdy: {
    colors: {
      primary: '#1F2937', primary_text: '#FFFFFF',
      accent: '#F59E0B', accent_text: '#000000',
      text: '#111827', muted: '#4B5563',
      background: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
    },
    fonts: { heading: 'Barlow Condensed', body: 'Barlow' },
    shape: { radius: 4, card: 'flat', density: 'compact' },
  },
  grounded: {
    colors: {
      primary: '#2F6B3A', primary_text: '#FFFFFF',
      accent: '#A16207', accent_text: '#FFFFFF',
      text: '#1C2B1E', muted: '#5B6B5E',
      background: '#F4F6EE', surface: '#FFFFFF', border: '#DDE3D6',
    },
    fonts: { heading: 'Bitter', body: 'Source Sans 3' },
    shape: { radius: 10, card: 'elevated', density: 'comfortable' },
  },
  polished: {
    colors: {
      primary: '#1E293B', primary_text: '#FFFFFF',
      accent: '#8A6A3D', accent_text: '#FFFFFF',
      text: '#1E293B', muted: '#5E6472',
      background: '#F8F6F1', surface: '#FFFFFF', border: '#E7E2D8',
    },
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    shape: { radius: 6, card: 'outlined', density: 'roomy' },
  },
};

/** What the Portal's preset cards say about each look. Plain words only. */
export const PRESET_INFO: Readonly<Record<PresetKey, { name: string; feel: string; suits: string }>> = {
  fresh: {
    name: 'Fresh',
    feel: 'Bright and clean: lots of white, calm teal, crisp outlines.',
    suits: 'Cleaning, window washing, pool service, dental and medical offices.',
  },
  friendly: {
    name: 'Friendly',
    feel: 'Warm and playful: cream background, rounded shapes, a sunny highlight.',
    suits: 'Pet sitting, dog walking, grooming, daycare, childcare and tutoring.',
  },
  sturdy: {
    name: 'Sturdy',
    feel: 'Bold and no-nonsense: charcoal with safety amber, square corners.',
    suits: 'Contractors, plumbing, HVAC, electrical, roofing, pest control.',
  },
  grounded: {
    name: 'Grounded',
    feel: 'Natural and earthy: sage paper, forest green, a slab-serif heading.',
    suits: 'Lawn care, landscaping, tree service, snow removal, gardening.',
  },
  polished: {
    name: 'Polished',
    feel: 'Refined and premium: ivory and ink, a brass highlight, a serif heading.',
    suits: 'Med spas, salons, boutique pet resorts, professional services.',
  },
};

/** The customer-facing name of each button or function, and what it does. */
export const FEATURE_INFO: Readonly<Record<FeatureKey, { label: string; help: string }>> = {
  book: { label: 'Book a visit', help: 'Customers pick one of your open times themselves.' },
  request: { label: 'Request service', help: 'Customers describe what they need and you schedule it.' },
  visits: { label: 'My visits', help: 'Their upcoming and past visits. Always on.' },
  invoices: { label: 'Invoices & pay', help: 'Their invoices, with a button to pay online.' },
  quotes: { label: 'Quotes & proposals', help: 'Quotes they can read and accept.' },
  messages: { label: 'Messages', help: 'Customers can message you from the portal.' },
  reschedule: { label: 'Change a visit time', help: 'Customers can ask to move a booked visit.' },
  documents: { label: 'Documents', help: 'Files you share with the customer.' },
  photos: { label: 'Report cards & photos', help: 'Photos and notes from each visit.' },
  account: { label: 'Account', help: 'Their contact details and notification choices. Always on.' },
};

/** Features a business cannot switch off: a portal with neither is not a portal. */
export const LOCKED_FEATURES: readonly FeatureKey[] = ['visits', 'account'];

/**
 * §5.1: "a missing key means true, except `documents` which means false", and
 * the two locked features are on whatever the stored value says.
 */
export function normalizeFeatures(raw?: Partial<Record<string, unknown>> | null): LookFeatures {
  const out = {} as LookFeatures;
  for (const key of FEATURE_KEYS) {
    const v = raw ? raw[key] : undefined;
    out[key] = typeof v === 'boolean' ? v : key !== 'documents';
  }
  for (const key of LOCKED_FEATURES) out[key] = true;
  return out;
}

export const DEFAULT_FEATURES: Readonly<LookFeatures> = normalizeFeatures(null);

/** The look a portal wears when nobody has chosen one: Fresh, everything on, "Powered by OLIVER". */
export const DEFAULT_LOOK: Readonly<PortalLook> = {
  preset: 'fresh',
  use_brand: false,
  colors: PRESETS.fresh.colors,
  fonts: PRESETS.fresh.fonts,
  shape: PRESETS.fresh.shape,
  features: DEFAULT_FEATURES,
  powered_by: true,
};

/* ── The contrast guard (§5.1). One arithmetic for all three apps. ─────── */

/** WCAG AA for body text. Below this a pair is refused. */
export const MIN_CONTRAST = 4.5;

const HEX6 = /^#([0-9a-f]{6})$/i;

/** `#RRGGBB` (any case) → `#RRGGBB` upper case; anything else → null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toUpperCase();
  return HEX6.test(s) ? s.toUpperCase() : null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#RRGGBB` colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex);
  if (!h) return 0;
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableTextOn(background: string): '#FFFFFF' | '#000000' {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#000000', background) ? '#FFFFFF' : '#000000';
}

export type ContrastPair = 'primary_on_surface' | 'text_on_background';

/** The pairs §5.1 refuses to save, each with its measured ratio. Empty = readable. */
export function contrastProblems(colors: Pick<LookColors, 'primary' | 'surface' | 'text' | 'background'>):
  { pair: ContrastPair; ratio: number }[] {
  const out: { pair: ContrastPair; ratio: number }[] = [];
  const p = contrastRatio(colors.primary, colors.surface);
  if (p < MIN_CONTRAST) out.push({ pair: 'primary_on_surface', ratio: Math.round(p * 100) / 100 });
  const t = contrastRatio(colors.text, colors.background);
  if (t < MIN_CONTRAST) out.push({ pair: 'text_on_background', ratio: Math.round(t * 100) / 100 });
  return out;
}
