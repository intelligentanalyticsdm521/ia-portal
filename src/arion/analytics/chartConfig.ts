// ARION Analytics — Chart.js configuration and brand colors
// 5-position visualization color order from brand standards

export const ARION_COLORS = {
  sky: '#2D9CDB',       // Position 1 — primary
  orange: '#EF6C33',    // Position 2 — IA Action Orange
  coreBlueMid: 'rgba(12,74,96,0.8)', // Position 3 — IA Core Blue at 80%
  gold: '#FEC82C',      // Position 4 — OLIVER Signal Gold
  coral: '#E64A28',     // Position 5 — SPARK Coral
} as const;

export const ARION_PALETTE = [
  ARION_COLORS.sky,
  ARION_COLORS.orange,
  ARION_COLORS.coreBlueMid,
  ARION_COLORS.gold,
  ARION_COLORS.coral,
];

export const DELTA_COLORS = {
  positive: '#1D9E75',
  negative: '#D85A30',
} as const;

export const CHART_FILLS = {
  skyLight: 'rgba(45,156,219,0.07)',
  orangeLight: 'rgba(239,108,51,0.07)',
};

// Channel colors — each channel maps to its position in the palette
export const CHANNEL_COLORS: Record<string, string> = {
  'Direct': ARION_COLORS.sky,
  'Organic Search': ARION_COLORS.orange,
  'Referral': ARION_COLORS.coreBlueMid,
  'Unassigned': ARION_COLORS.gold,
  'Organic Social': ARION_COLORS.coral,
  'Paid Search': ARION_COLORS.coral,
  'Email': ARION_COLORS.gold,
  'Social': ARION_COLORS.coral,
};

// Period options per tier
export const PERIOD_OPTIONS = {
  standard: [
    { value: 7, label: 'Last 7 days' },
    { value: 30, label: 'Last 30 days' },
  ],
  pro: [
    { value: 7, label: 'Last 7 days' },
    { value: 30, label: 'Last 30 days' },
    { value: 90, label: 'Last 90 days' },
  ],
  business: [
    { value: 7, label: 'Last 7 days' },
    { value: 30, label: 'Last 30 days' },
    { value: 90, label: 'Last 90 days' },
    { value: 365, label: 'Last 12 months' },
  ],
} as const;

// Format seconds to M:SS
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format percentage
export function formatPct(decimal: number): string {
  return (decimal * 100).toFixed(1) + '%';
}

// Format large numbers
export function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Bounce rate color
export function bounceColor(rate: number): string {
  if (rate < 0.5) return DELTA_COLORS.positive;
  if (rate > 0.7) return DELTA_COLORS.negative;
  return '#5A7A8A';
}

// Delta arrow + color
export function formatDelta(current: number, previous: number): { text: string; color: string } {
  if (!previous) return { text: '--', color: '#5A7A8A' };
  const pct = ((current - previous) / previous * 100).toFixed(1);
  const up = current >= previous;
  return {
    text: `${up ? '↑' : '↓'} ${Math.abs(Number(pct))}%`,
    color: up ? DELTA_COLORS.positive : DELTA_COLORS.negative,
  };
}
