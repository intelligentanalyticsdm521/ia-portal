// Canonical engine label helper (Brandon-locked 2026-06-28).
// SE Ranking returns engine objects in two different shapes across endpoints:
//   1. heroCards.standard[]   uses name / type / device / label / longLabel
//   2. record.perEngine[]     uses engineName / engineRegion / engineLabel
//      enginesNotRanking[]    uses engineLabel + engineId (sometimes engineName)
// This helper accepts BOTH shapes and returns one of:
//   "Google - Desktop", "Google - Mobile", "Bing".
// If the input has enough signal to identify a recognized engine but no device
// info, defaults to Desktop. Unknown engines fall back to the raw engineLabel
// (so "Engine 12345" still leaks rather than hiding behind generic text — see
// onboarding defect: backend should populate engineName for every record).

export interface EngineLike {
  engineLabel?: string | null;
  label?: string | null;
  longLabel?: string | null;
  name?: string | null;
  engineName?: string | null;
  engineRegion?: string | null;
  type?: string | null;
  device?: string | null;
}

export function canonicalEngineLabel(e: EngineLike | null | undefined): string {
  if (!e) return 'Search Engine';
  // Combined signal text — every label/name field smushed together lowercased.
  const signal = [
    e.engineLabel, e.label, e.longLabel,
    e.name, e.engineName, e.engineRegion,
    e.type,
  ].filter(Boolean).join(' ').toLowerCase();
  const device = String(e.device || '').toLowerCase();
  const type = String(e.type || '').toLowerCase();

  const isGoogle = /\bgoogle\b/.test(signal) || type === 'google' || type === 'google_mobile';
  const isBing = /\bbing\b/.test(signal) || type === 'bing';
  const isMobile = device === 'mobile' || type === 'google_mobile' || /\bmobile\b/.test(signal);

  if (isGoogle) return isMobile ? 'Google - Mobile' : 'Google - Desktop';
  if (isBing) return 'Bing';
  // Unknown engine — return whatever raw label SE Ranking gave us so it's at
  // least visible. Better than hiding behind generic text.
  return e.engineLabel || e.label || e.name || e.engineName || 'Search Engine';
}
