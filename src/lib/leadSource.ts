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
// This is the ONE place those labels live — the inbox row and the lead modal
// both read it, so they can never drift apart.

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
  landing_page: "Landing page",
  import: "Import",
};

/** Where the person came from. B2B search has no visitor journey behind it. */
const CHANNEL_LABELS: Record<string, string> = {
  spark_leadgen: "B2B search",
  hunter_discover: "B2B search",
  data_axle: "B2B search",
  brave_search: "B2B search",
  you_search: "B2B search",
  mojeek_search: "B2B search",
  google_cse: "B2B search",
  linkedin: "LinkedIn",
};

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
