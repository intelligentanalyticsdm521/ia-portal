// lib/leadSource.ts — how a lead reads on the row and in the modal.
//
// LOCKED (LEADGEN_POST_CAPTURE_SCOPE §8.1 L9): a lead reads "Source · via
// Channel". Source is the capture point (what it is); Channel is where the
// person came from. Source first, then Channel.
//
// Brandon 2026-09-04: customers don't care which engine pointed us at a
// business, and we no longer store pointer names on the lead. Every current B2B
// source reads "SPARK Lead Gen"; a named social source shows its own name.
//
// TWO WAYS A LEAD KNOWS WHAT IT IS (G-1, migration 146):
//   1. A B2B search lead has only `source` — a stable key — so it is looked up
//      in the maps below.
//   2. An Intake / Inbound lead ALSO carries `source_label` (what the client
//      named the connection: "Spring tune-up lead form") and `channel` ("Google
//      Ads"), written by services/intake. Those columns WIN, because the client
//      chose the words. The maps are the fallback for a row that has neither.
//
// This is the ONE place those labels live — the inbox row, the source facet and
// the lead modal all read it, so they can never drift apart.

const SOURCE_LABELS: Record<string, string> = {
  spark_leadgen: "SPARK Lead Gen",
  hunter_discover: "SPARK Lead Gen",
  data_axle: "SPARK Lead Gen",
  brave_search: "SPARK Lead Gen",
  you_search: "SPARK Lead Gen",
  mojeek_search: "SPARK Lead Gen",
  google_cse: "SPARK Lead Gen",
  linkedin: "LinkedIn",
  arion_form: "Website form",
  spark_form: "Website form",
  // Conversations 4. The client's OWN website, so it is Inbound, not Intake
  // (§9 "Naming"). The row reads "Website chat · via fernbrook.example":
  // services/chat writes `channel` = the site's own domain, so the channel half
  // names WHICH website rather than repeating the capture point.
  web_chat: "Website chat",
  landing_page: "Landing page",
  import: "Import",
  // Intake connectors (G-2). One entry per provider in the locked order; a
  // provider that is not built yet still gets a label so an old row from a
  // disconnected source never renders as a raw key.
  google_ads_leadform: "Google Ads lead form",
  google_lsa: "Local Services Ads",
  meta_leadform: "Facebook lead form",
  gbp_call: "Google Business Profile",
  yelp: "Yelp",
  angi: "Angi",
  houzz: "Houzz",
  bark: "Bark",
};

/** Where the person came from. B2B search has no visitor journey behind it. */
const CHANNEL_LABELS: Record<string, string> = {
  // The fallback only: a chat lead written by services/chat carries the site's
  // own domain in `channel`, and rowChannelLabel prefers that. This is what an
  // older row with no domain on it reads as.
  web_chat: "Your website",
  spark_leadgen: "B2B search",
  hunter_discover: "B2B search",
  data_axle: "B2B search",
  brave_search: "B2B search",
  you_search: "B2B search",
  mojeek_search: "B2B search",
  google_cse: "B2B search",
  linkedin: "LinkedIn",
  google_ads_leadform: "Google Ads",
  google_lsa: "Google Local Services",
  meta_leadform: "Facebook",
  gbp_call: "Google Business Profile",
  yelp: "Yelp",
  angi: "Angi",
  houzz: "Houzz",
  bark: "Bark",
};

/** The two columns migration 146 added, when the row has them. */
export interface LeadSourceRow {
  source?: string | null;
  sources_found?: string | null;
  source_label?: string | null;
  channel?: string | null;
}

/** The first source on the row — the column may hold a JSON array. */
function firstSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let first = String(raw);
  try {
    const arr = JSON.parse(first);
    if (Array.isArray(arr) && arr.length) first = String(arr[0]);
  } catch { /* a plain string */ }
  return first || null;
}

export function sourceLabel(raw: string | null | undefined): string {
  const first = firstSource(raw);
  if (!first) return "—";
  return SOURCE_LABELS[first] ?? first;
}

export function channelLabel(raw: string | null | undefined): string | null {
  const first = firstSource(raw);
  if (!first) return null;
  return CHANNEL_LABELS[first] ?? null;
}

/** "SPARK Lead Gen · via B2B search" — the reading order Brandon locked. */
export function sourceAndChannel(raw: string | null | undefined): string {
  const s = sourceLabel(raw);
  const c = channelLabel(raw);
  return c ? `${s} · via ${c}` : s;
}

// ── row-aware versions (G-1) ────────────────────────────────────────────────

/** What the client named this source, else the label for its key. */
export function rowSourceLabel(row: LeadSourceRow | null | undefined): string {
  if (!row) return "—";
  const named = (row.source_label || "").trim();
  if (named) return named;
  return sourceLabel(row.source || row.sources_found);
}

/** Where they came from: the stored channel, else the one the key implies. */
export function rowChannelLabel(row: LeadSourceRow | null | undefined): string | null {
  if (!row) return null;
  const named = (row.channel || "").trim();
  if (named) return named;
  return channelLabel(row.source || row.sources_found);
}

/** "Spring tune-up lead form · via Google Ads" — the whole cell, one call. */
export function rowSourceAndChannel(row: LeadSourceRow | null | undefined): string {
  const s = rowSourceLabel(row);
  const c = rowChannelLabel(row);
  return c ? `${s} · via ${c}` : s;
}

/**
 * The key a Source facet groups by. Facets group by the SOURCE KEY, never by
 * the client's own label, so ten Google Ads forms are one filter chip and not
 * ten — but the chip is named with the label a client would recognise.
 */
export function sourceFacetKey(row: LeadSourceRow | null | undefined): string {
  if (!row) return "unknown";
  return firstSource(row.source || row.sources_found) || "unknown";
}

/** The chip's name for a facet key. */
export function sourceFacetLabel(key: string): string {
  if (key === "unknown") return "Unknown";
  return SOURCE_LABELS[key] ?? key;
}
