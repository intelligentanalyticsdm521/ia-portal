import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useArionContext } from '../useArionContext';

/* ── Tier helpers ── */
const TIER_ORDER = ['lite', 'standard', 'pro', 'business'] as const;
export type ArionTier = (typeof TIER_ORDER)[number];

export function meetsMinTier(current: string | null | undefined, required: ArionTier): boolean {
  const idx = TIER_ORDER.indexOf((current || 'lite') as ArionTier);
  const req = TIER_ORDER.indexOf(required);
  return idx >= req;
}

/* ── Lock SVG ── */
function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 24" fill="none" style={{ color: '#64748B' }}>
      <rect x="1" y="10" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10V7a5 5 0 0110 0v3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ── TierGate ── */
export function TierGate({
  currentTier, requiredTier, featureName, planLabel, children,
}: {
  currentTier: string | null | undefined;
  requiredTier: ArionTier;
  featureName: string;
  planLabel?: string;
  children: React.ReactNode;
}) {
  if (meetsMinTier(currentTier, requiredTier)) return <>{children}</>;
  const label = planLabel || `${requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} plan required`;
  return (
    <div className="gated">
      <div className="gated-blur">{children}</div>
      <div className="gate-overlay">
        <LockIcon />
        <div className="gate-ttl">{label}</div>
        <div className="gate-sub">{featureName}</div>
        <button className="gate-btn">Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}</button>
      </div>
    </div>
  );
}

/* ── AddonUpsell ── */
export function AddonUpsell({
  title, description, price, planName, ctaText, ctaHref,
}: {
  title: string;
  description: string;
  price: string;
  planName: string;
  ctaText?: string;
  ctaHref?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="addon-banner">
      <div className="addon-body">
        <div className="addon-ttl">{title}</div>
        <div className="addon-desc">{description}</div>
      </div>
      <div className="addon-right">
        <div className="addon-price">{price}<span>/mo</span></div>
        <div className="addon-plan">{planName}</div>
        <button className="addon-cta" onClick={() => ctaHref && navigate(ctaHref)}>
          {ctaText || 'Activate SEO Tools \u2192'}
        </button>
      </div>
    </div>
  );
}

/* ── StatCard ── */
export function StatCard({ label, value, delta, deltaType, children }: {
  label: string;
  value?: string | number | null;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  children?: React.ReactNode;
}) {
  const cls = deltaType === 'negative' ? 'stat-delta neg' : deltaType === 'neutral' ? 'stat-delta neu' : 'stat-delta';
  return (
    <div className="stat-card">
      <div className="stat-lbl">{label}</div>
      {children ? children : <div className="stat-val">{value ?? '\u2014'}</div>}
      {delta && <div className={cls}>{delta}</div>}
    </div>
  );
}

/* ── MetricCard ── */
export function MetricCard({ label, value, delta, deltaType }: {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: 'positive' | 'neutral';
}) {
  return (
    <div className="mcard">
      <div className="mcard-lbl">{label}</div>
      <div className="mcard-val">{value}</div>
      {delta && <div className="mcard-delta" style={deltaType === 'neutral' ? { color: 'var(--text-muted)' } : undefined}>{delta}</div>}
    </div>
  );
}

/* ── HealthRow ── */
export function HealthRow({ status, label, value, valueStyle }: {
  status: 'ok' | 'warn' | 'err';
  label: string;
  value?: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="hrow">
      <div className={`hdot ${status}`} />
      <div className="hlbl">{label}</div>
      {value && <div className="hval" style={valueStyle}>{value}</div>}
    </div>
  );
}

/* ── AccessButton ── */
export function AccessButton({ variant, label, icon, onClick, href }: {
  variant: 'outline' | 'sky' | 'dark';
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const cls = `abtn abtn-${variant}`;
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{icon}{label}</a>;
  }
  return <button className={cls} onClick={onClick}>{icon}{label}</button>;
}

/* ── PlatformTabs ── */
export function PlatformTabs({ tabs, active, onChange }: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="ptabs">
      {tabs.map(t => (
        <button key={t.key} className={`ptab${active === t.key ? ' active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── InfoCard ── */
export function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="info-card">
      <div className="info-ttl">{title}</div>
      <div className="info-body">{children}</div>
    </div>
  );
}

/* ── WarnNotice ── */
export function WarnNotice({ children }: { children: React.ReactNode }) {
  return <div className="warn-notice">{children}</div>;
}

/* ── Card ── */
export function Card({ title, subtitle, action, children, className, style }: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`} style={style}>
      {(title || action) && (
        <div className="card-hdr">
          <div>
            {title && <div className="card-ttl">{title}</div>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── MiniBarChart ── */
export function MiniBarChart({ values, height }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars" style={height ? { height } : undefined}>
      {values.map((v, i) => (
        <div key={i} className={`bar${v >= max * 0.8 ? ' hi' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

/* ── Loading / Error / Empty ── */
export function Loading({ message }: { message?: string }) {
  return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{message || 'Loading...'}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 9, padding: '12px 14px', marginBottom: 12, color: '#dc2626', fontSize: 12 }}>
      {message}
    </div>
  );
}

export function EmptyPanel({ message }: { message: string }) {
  return <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>{message}</div>;
}

/* ── Score Circle ── */
export function ScoreCircle({ score, label }: { score: number | null; label?: string }) {
  if (score == null) return <div className="score-circle" style={{ color: 'var(--text-muted)', borderColor: '#E5E7EB' }}>--</div>;
  const cls = score >= 90 ? 'good' : score >= 50 ? 'average' : 'poor';
  return (
    <div style={{ textAlign: 'center' }}>
      <div className={`score-circle ${cls}`}>{score}</div>
      {label && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>}
    </div>
  );
}

/* ── Status Pill ── */
export function StatusPill({ status, label }: { status: 'active' | 'warning' | 'error' | 'info'; label: string }) {
  return <span className={`status-pill ${status}`}>{label}</span>;
}

/* ── Quick Link Card ── */
export function QuickLink({ to, icon, label, sublabel, color }: {
  to: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  color?: string;
}) {
  const navigate = useNavigate();
  const isExternal = to.startsWith('http');
  const handleClick = () => { isExternal ? window.open(to, '_blank') : navigate(to); };
  return (
    <div className="quick-link" onClick={handleClick}>
      <div className="quick-link-icon" style={{ background: color || 'var(--arion-sky-tint)', color: color ? '#fff' : 'var(--arion-sky)' }}>
        {icon}
      </div>
      <div>
        <div className="quick-link-text">{label}</div>
        {sublabel && <div className="quick-link-sub">{sublabel}</div>}
      </div>
    </div>
  );
}

/* ── Sidebar Info Card ── */
export function SidebarCard({ label, value, valueClass }: { label: string; value: string; valueClass?: 'success' | 'warning' }) {
  return (
    <div className="sidebar-card">
      <span className="sidebar-card-label">{label}</span>
      <span className={`sidebar-card-value${valueClass ? ` ${valueClass}` : ''}`}>{value}</span>
    </div>
  );
}

/* ── ConsultingUpsell ── */
export function ConsultingUpsell({ headline, subtext, serviceType, triggerPage }: {
  headline: string; subtext: string; serviceType: string; triggerPage: string;
}) {
  const { selectedSite, arionApi } = useArionContext();
  const [sent, setSent] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [desc, setDesc] = React.useState('');

  const submit = async () => {
    if (!selectedSite) return;
    await arionApi.submitConsultingInquiry(selectedSite.siteId, serviceType, desc, triggerPage);
    setSent(true); setOpen(false);
  };

  return (
    <div className="upsell-card">
      <div className="upsell-icon">
        <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" stroke="#EF6C33" strokeWidth="1.4" fill="none"/></svg>
      </div>
      <div className="upsell-body">
        <div className="upsell-t">{headline}</div>
        <div className="upsell-s">{subtext}</div>
      </div>
      {sent ? <span style={{ color: '#27AE60', fontSize: 11, whiteSpace: 'nowrap' }}>Request sent &#10003;</span> :
        <button className="upsell-btn" onClick={() => setOpen(true)}>Talk to IA &rarr;</button>}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Talk to Intelligent Analytics</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0' }}>Service: <strong>{serviceType}</strong></p>
            <textarea placeholder="Describe what you need..." value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit}>Send Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
