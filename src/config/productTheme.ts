// Canonical per-product brand colors.
//
// These hexes already existed, copy-pasted across GlobalSearch.tsx,
// GetStartedCard.tsx, ConsultingProjectModal.tsx, MilestoneList.tsx and the
// SubNav tag definitions — which is how ARION ended up as #38BDF8 in some
// places and #1A7DB5 in others. This module is the single source; new code
// should import from here rather than adding a fourth copy.
//
// ARION resolves to #38BDF8 because that is what the SubNav tags and
// GlobalSearch both use, so it is what customers see most often.

export type ProductThemeKey =
  | "arion" | "oliver" | "spark" | "stella" | "forge" | "argus" | "consulting";

export const PRODUCT_COLORS: Record<ProductThemeKey, string> = {
  arion: "#38BDF8",
  oliver: "#FEC82C",
  spark: "#EF6C33",
  stella: "#7C3AED",
  forge: "#0F766E",
  argus: "#84CC16",
  consulting: "#0C4A60",
};

/** IA orange — the fallback for anything not owned by a single product. */
export const IA_ACCENT = "#EF6C33";

/** Brand color for a product key, or the IA accent when unknown. */
export function productColor(key: string | undefined | null): string {
  const k = String(key || "").toLowerCase() as ProductThemeKey;
  return PRODUCT_COLORS[k] || IA_ACCENT;
}

/**
 * Product key implied by a service key ("spark_newsletter" -> "spark").
 * Service keys are consistently `<product>_<surface>`.
 */
export function productOfServiceKey(serviceKey: string | undefined | null): string {
  return String(serviceKey || "").split("_")[0].toLowerCase();
}
