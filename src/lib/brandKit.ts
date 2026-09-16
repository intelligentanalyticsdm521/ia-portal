/**
 * lib/brandKit.ts — THE brand kit, client side.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0. One object, one owner:
 *
 *   { colours: { primary, secondary, accent, text, background },
 *     fonts:   { heading, body, catalog[] },
 *     logo_url, updated_at }
 *
 * served by platform-api GET /brand-kit (lib/brandKit.js, core.tenants) and
 * written by PUT /brand-kit from Brand Identity. Nothing else in the Portal
 * decides what a business looks like.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * Before it, four Portal components each carried their own brand fallback and
 * every one of them was OUR colour:
 *
 *   CTAEditorBlock              DEFAULT_BG_FALLBACK = "#1A3A4A"  (IA navy)
 *   TemplateStudioEditorModal   brandPalette || { primary: "#1A3A4A",
 *                                                 secondary: "#FEC82C" }
 *   DocumentBrandFrame          FALLBACK.accentColor = "#1A7DB5"  (a FIFTH
 *                                                 colour, nobody's brand)
 *   SparkLandingPageEditor      the server behind it defaulted to "#EF6C33",
 *                               the orange IA itself retired
 *
 * A client who had chosen no colour was shown Intelligent Analytics' brand on
 * their own proposal, their own email button and their own exported graphic,
 * with nothing on screen to say so.
 *
 * ── THE NEUTRAL IS DECLARED ONCE ──────────────────────────────────────────
 * NEUTRAL_BRAND_KIT below is the ONLY hardcoded colour set left in the Portal's
 * brand path, and test/brand-kit.test.mjs fails if a second one appears or if
 * any of those three literals comes back into a brand-consuming file. It is
 * slate on purpose: the honest rendering of "this business has not chosen a
 * colour", never ours.
 */

import { emergencyActAsHeaders } from "./emergencyActAs";

export interface BrandColours {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
}

export interface BrandFontChoice {
  value: string;
  label: string;
  stack: string;
  /** True when LUMEN's server-side rasteriser has the face bundled, so a
   *  downloaded PNG really uses it. False means the browser will render it but
   *  an export substitutes — a fact the Template Studio shows rather than hides. */
  export_safe: boolean;
}

export interface BrandFonts {
  heading: string;
  body: string;
  catalog: BrandFontChoice[];
}

export interface BrandKit {
  tenant_id?: string;
  found?: boolean;
  colours: BrandColours;
  fonts: BrandFonts;
  logo_url: string | null;
  updated_at: string | null;
  /** Per-slot provenance: "tenant" | "default" | "legacy_voice_profile".
   *  Lets a swatch row say "not set yet" instead of implying a choice. */
  sources?: Record<string, string>;
}

/** A partial save. Send only the section that changed — one section must never
 *  blank another, which is what every save-all brand form we have built did. */
export interface BrandKitPatch {
  colours?: Partial<BrandColours>;
  fonts?: { heading?: string | null; body?: string | null };
  logo_url?: string | null;
}

/**
 * THE neutral default. Declared once, here.
 *
 * Byte-identical to platform-api's lib/brandKit.js NEUTRAL_BRAND_KIT and to the
 * NEUTRAL_BRAND_COLOURS in oliver-api, arion-api and LUMEN-API. Each repo's
 * suite pins it, so a change in one shows up as a failure in the others.
 */
export const NEUTRAL_BRAND_KIT: BrandKit = {
  colours: {
    primary: "#0F172A",
    secondary: "#475569",
    accent: "#334155",
    text: "#111827",
    background: "#FFFFFF",
  },
  fonts: { heading: "Inter", body: "Inter", catalog: [] },
  logo_url: null,
  updated_at: null,
};

/** A CSS font stack for a kit font name, from the catalog the API sent. */
export function fontStack(kit: BrandKit, which: "heading" | "body"): string {
  const name = kit.fonts[which];
  const hit = kit.fonts.catalog.find((f) => f.value === name);
  return hit ? hit.stack : `${name}, system-ui, sans-serif`;
}

/**
 * A readable foreground for a background colour, by WCAG relative luminance.
 *
 * This lived in CTAEditorBlock and returned "#1A3A4A" for the dark option —
 * our navy as ink on somebody else's button. It returns the kit's own text
 * colour now, so a business that chose its ink gets it.
 */
export function readableOn(background: string, kit: BrandKit): string {
  const hex = String(background || "").replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (full.length !== 6) return kit.colours.background;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return kit.colours.background;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? kit.colours.text : kit.colours.background;
}

/* ══════════════════════════════════════════════════════════════════════════
   The wire
   ══════════════════════════════════════════════════════════════════════════ */

export class BrandKitError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BrandKitError";
    this.status = status;
  }
}

export interface BrandKitCallParams {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}

async function request<T>(
  params: BrandKitCallParams,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const base = params.baseUrl.replace(/\/$/, "");
  const { body: payload, ...rest } = init;
  const res = await fetch(`${base}/brand-kit`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      "Content-Type": "application/json",
      "x-tenant-key": params.tenantId,
      ...emergencyActAsHeaders(),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  if (!res.ok) {
    const b = body as { error?: string; message?: string } | null;
    throw new BrandKitError(b?.message || b?.error || `Brand kit request failed (${res.status})`, res.status);
  }
  return body as T;
}

export function getBrandKit(params: BrandKitCallParams) {
  return request<BrandKit>(params);
}

/** Partial save. The API refuses an unparseable colour or a font we do not
 *  carry BY NAME rather than repairing it, and the message says which field. */
export function saveBrandKit(params: BrandKitCallParams & { patch: BrandKitPatch }) {
  return request<BrandKit>(params, { method: "PUT", body: params.patch });
}
