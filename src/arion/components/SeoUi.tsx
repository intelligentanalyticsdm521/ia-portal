/**
 * Shared UI primitives for the Phase 3.5 SEO section.
 * Date-range picker, stat card with trend arrow + sparkline, position-bucket card,
 * engine filter pill row. Kept local to /arion/components so non-SEO pages don't
 * pick up these styles unintentionally.
 */
import React from 'react';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from 'recharts';
import type { SeoRangeCode } from '../../lib/arionApi';
import { GlossaryIcon } from './Glossary';

export const SEO_RANGE_OPTIONS: Array<{ code: SeoRangeCode; label: string }> = [
  { code: '7d', label: 'Last 7 days' },
  { code: '30d', label: 'Last 30 days' },
  { code: 'current_month', label: 'Current month' },
  { code: 'current_quarter', label: 'Current quarter' },
  { code: '90d', label: 'Last 90 days' },
  { code: 'current_year', label: 'Current year' },
  { code: '365d', label: 'Last 12 months' },
];

export function SeoRangePicker({ value, onChange }: { value: SeoRangeCode; onChange: (v: SeoRangeCode) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SeoRangeCode)}
      style={{
        fontSize: 12,
        padding: '6px 10px',
        border: '1px solid var(--color-border-tertiary, #d5e0e8)',
        borderRadius: 6,
        background: 'var(--color-bg-input, #fff)',
        color: 'var(--color-text-primary, #0B1C24)',
        cursor: 'pointer',
      }}
    >
      {SEO_RANGE_OPTIONS.map((o) => (
        <option key={o.code} value={o.code}>{o.label}</option>
      ))}
    </select>
  );
}

export function SeoFilterPills({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-tertiary, #5A7A8A)', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>{label}</span>
      <div style={{ display: 'inline-flex', border: '1px solid var(--color-border-tertiary, #d5e0e8)', borderRadius: 6, overflow: 'hidden' }}>
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: value === o.value ? 600 : 400,
              background: value === o.value ? '#2D9CDB' : 'transparent',
              color: value === o.value ? '#fff' : o.disabled ? 'var(--color-text-disabled, #a0b0b8)' : 'var(--color-text-primary, #0B1C24)',
              border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--color-border-tertiary, #d5e0e8)',
              cursor: o.disabled ? 'not-allowed' : 'pointer',
              opacity: o.disabled ? 0.5 : 1,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Stat card with big number, trend arrow, sub-label, optional mini line chart.
 * Matches the density of SE Ranking's hero cards.
 */
export function SeoStatCard({
  label,
  value,
  sub,
  delta,
  deltaFormat = 'signed',
  deltaIsGoodWhenPositive = true,
  sparklineData,
  sparklineColor = '#2D9CDB',
  accent = '#2D9CDB',
  locked = false,
  termKey,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  deltaFormat?: 'signed' | 'percentage' | 'position';
  deltaIsGoodWhenPositive?: boolean;
  sparklineData?: Array<{ date: string; value: number }>;
  sparklineColor?: string;
  accent?: string;
  locked?: boolean;
  /** Optional glossary term key — renders an info icon next to the label. */
  termKey?: string;
}) {
  const deltaText = delta == null
    ? null
    : deltaFormat === 'percentage'
      ? `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}%`
      : deltaFormat === 'position'
        ? `${delta > 0 ? '+' : ''}${Math.round(Number(delta))}`
        : `${delta > 0 ? '+' : ''}${Math.round(Number(delta))}`;
  const deltaColor = delta == null || delta === 0
    ? 'var(--color-text-tertiary, #5A7A8A)'
    : (delta > 0) === deltaIsGoodWhenPositive
      ? '#1D9E75'
      : '#D85A30';
  const arrow = delta == null || delta === 0 ? '' : delta > 0 ? '▲' : '▼';

  return (
    <div style={{ background: 'var(--color-bg-card, #F8FAFC)', borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${accent}`, position: 'relative', minHeight: 100 }}>
      {locked && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, backdropFilter: 'blur(2px)' }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textAlign: 'center', padding: '0 16px' }}>
            🔒 Upgrade to unlock
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--color-text-tertiary, #5A7A8A)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
            {label}
            {termKey && <GlossaryIcon termKey={termKey} size={11} />}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginTop: 2 }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary, #5A7A8A)', marginTop: 2 }}>{sub}</div>}
        </div>
        {deltaText && (
          <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: deltaColor, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>{arrow}</span>
            <span>{deltaText.replace(/^[-+]/, '')}</span>
          </div>
        )}
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <div style={{ height: 36, marginTop: 6 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-grad-${sparklineColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={sparklineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparklineColor}
                strokeWidth={1.5}
                fill={`url(#spark-grad-${sparklineColor.replace('#', '')})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/**
 * Position-bucket card used on Overview + Rankings summary. Big count, change
 * arrow, inline sparkline — matches SE Ranking's distribution row.
 */
export function SeoBucketCard({
  label,
  count,
  delta,
  sparklineData,
  color = '#2D9CDB',
  onClick,
}: {
  label: string;
  count: number;
  delta?: number | null;
  sparklineData?: Array<{ date: string; value: number }>;
  color?: string;
  onClick?: () => void;
}) {
  const deltaColor = delta == null || delta === 0
    ? 'var(--color-text-tertiary, #5A7A8A)'
    : delta > 0 ? '#1D9E75' : '#D85A30';
  const arrow = delta == null || delta === 0 ? '' : delta > 0 ? '▲' : '▼';
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bg-card, #fff)',
        borderRadius: 8,
        padding: '10px 12px',
        borderTop: `2px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary, #5A7A8A)', fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)' }}>{count}</span>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: deltaColor }}>
            {arrow} {Math.abs(delta)}
          </span>
        )}
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <div style={{ height: 24, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/**
 * Tiny sparkline chart cell for inline use inside table rows.
 */
export function SeoSparkline({ data, color = '#2D9CDB', height = 28 }: { data: Array<{ date: string; value: number }>; color?: string; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', fontSize: 10, color: '#5A7A8A' }}>—</div>;
  return (
    <div style={{ height, width: 80 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={1.3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Position history full chart for keyword detail modal.
 */
export function SeoPositionHistoryChart({
  series,
  color = '#2D9CDB',
  height = 220,
  label,
}: {
  series: Array<{ date: string; pos: number }>;
  color?: string;
  height?: number;
  label?: string;
}) {
  if (!series || series.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A7A8A' }}>No data</div>;
  // Translate pos=0 (not ranking) to null so the line breaks visually.
  const data = series.map((s) => ({ date: s.date, pos: s.pos > 0 ? s.pos : null }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} />
          <YAxis reversed domain={[1, 100]} tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} label={{ value: 'Position', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#5A7A8A' }} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any) => (v == null ? 'Not ranking' : `Position ${v}`)} />
          <Line type="monotone" dataKey="pos" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} connectNulls={false} name={label || 'Position'} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Color for a position bucket. Good for coloring bucket cards consistently.
 */
export const POSITION_BUCKET_COLORS: Record<string, string> = {
  top1: '#1D9E75',
  top2_3: '#2D9CDB',
  top4_5: '#2D9CDB',
  top6_10: '#FEC82C',
  top11_30: '#EF6C33',
  top31_100: '#D85A30',
  notRanking: '#94A3B8',
};

export const POSITION_BUCKET_LABELS: Record<string, string> = {
  top1: 'Top 1',
  top2_3: 'Top 2–3',
  top4_5: 'Top 4–5',
  top6_10: 'Top 6–10',
  top11_30: 'Top 11–30',
  top31_100: 'Top 31–100',
  notRanking: 'Not Ranking',
};
