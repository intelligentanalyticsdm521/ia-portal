// Canonical engine label helper (Brandon-locked 2026-06-28).
// SE Ranking sometimes returns generic labels like "Engine 12345" — never
// expose those to the customer. Map any engine-shaped object to one of:
//   "Google - Desktop", "Google - Mobile", "Bing".
// Unknown engines (Yandex, DuckDuckGo, etc.) fall back to "Search Engine"
// so a raw numeric id never reaches the UI.

export interface EngineLike {
  engineLabel?: string | null;
  label?: string | null;
  longLabel?: string | null;
  name?: string | null;
  type?: string | null;
  device?: string | null;
}

export function canonicalEngineLabel(e: EngineLike | null | undefined): string {
  if (!e) return 'Search Engine';
  const raw = `${e.engineLabel || ''} ${e.label || ''} ${e.longLabel || ''}`.toLowerCase();
  const name = String(e.name || '').toLowerCase();
  const type = String(e.type || '').toLowerCase();
  const device = String(e.device || '').toLowerCase();
  const isGoogle = name === 'google' || type === 'google' || type === 'google_mobile' || /google/.test(raw);
  const isBing = name === 'bing' || type === 'bing' || /bing/.test(raw);
  const isMobile = device === 'mobile' || type === 'google_mobile' || /mobile/.test(raw);
  if (isGoogle) return isMobile ? 'Google - Mobile' : 'Google - Desktop';
  if (isBing) return 'Bing';
  return 'Search Engine';
}
