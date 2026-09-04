import React, { useRef, useState } from 'react';
import type { SectionFieldSpec } from '../../lib/arionApi';

/**
 * The inputs inside a section's edit sheet.
 * ---------------------------------------------------------------------------
 * Rendered from the field spec arion-api sends with the section catalogue, so
 * there is one description of what a section holds and it lives in
 * `lib/websiteBuilder/sectionSchema.js`. Nothing here knows the word
 * "Elementor", and nothing shows raw JSON to a client.
 *
 * Sized for a phone first: one column, 16px inputs (anything smaller makes iOS
 * zoom on focus), 44px minimum tap targets.
 */

const input: React.CSSProperties = {
  width: '100%',
  fontSize: 16,
  lineHeight: 1.4,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface, #fff)',
  color: 'inherit',
  minHeight: 44,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
  color: 'var(--text)',
};

const helpStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  marginTop: 4,
};

export const smallButton: React.CSSProperties = {
  minHeight: 40,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

function Counter({ value, max }: { value: unknown; max?: number }) {
  if (!max) return null;
  const len = typeof value === 'string' ? value.length : 0;
  const over = len > max;
  return (
    <span style={{ fontSize: 11, color: over ? '#B91C1C' : 'var(--text-muted)', marginLeft: 8 }}>
      {len}/{max}
    </span>
  );
}

export function ImageField({ value, onChange, onUpload, label }: {
  value: string;
  label: string;
  onChange: (v: string) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (e: any) {
      // A failed upload must say so. Silence here would look like success and
      // leave the old picture in place with no explanation.
      setErr(e?.message || 'That picture would not upload. Try another one.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {value ? (
        <img
          src={value}
          alt=""
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block' }}
        />
      ) : (
        <div style={{
          background: 'var(--surface-2, #F8FAFC)', border: '1px dashed var(--border)',
          borderRadius: 8, padding: '24px 12px', textAlign: 'center',
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 8,
        }}>
          No picture chosen yet
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="abtn"
          style={smallButton}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Uploading…' : value ? 'Replace picture' : 'Upload a picture'}
        </button>
        {value && (
          <button type="button" style={smallButton} onClick={() => onChange('')} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {err && <div style={{ ...helpStyle, color: '#B91C1C' }}>{err}</div>}
      <div style={helpStyle}>JPG, PNG, GIF or WebP, up to 10 MB. It goes straight into your website's own media library.</div>
    </div>
  );
}

export function ScalarField({ spec, value, onChange, onUpload }: {
  spec: SectionFieldSpec;
  value: any;
  onChange: (v: any) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const id = `f-${spec.key}`;

  if (spec.type === 'image') {
    return <ImageField label={spec.label} value={String(value ?? '')} onChange={onChange} onUpload={onUpload} />;
  }

  if (spec.type === 'choice') {
    const opts = spec.optionLabels?.length
      ? spec.optionLabels
      : (spec.options || []).map((o) => ({ value: o, label: o }));
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor={id}>{spec.label}{spec.required ? ' *' : ''}</label>
        <select id={id} style={input} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {!spec.required && <option value="">—</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {spec.help && <div style={helpStyle}>{spec.help}</div>}
      </div>
    );
  }

  if (spec.type === 'rating') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor={id}>{spec.label}</label>
        <select id={id} style={input} value={String(Number(value) || 5)} onChange={(e) => onChange(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.type === 'textarea') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor={id}>
          {spec.label}{spec.required ? ' *' : ''}<Counter value={value} max={spec.max} />
        </label>
        <textarea
          id={id}
          style={{ ...input, minHeight: 96, resize: 'vertical' }}
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
        {spec.help && <div style={helpStyle}>{spec.help}</div>}
      </div>
    );
  }

  const inputType = spec.type === 'email' ? 'email' : 'text';
  const placeholder = spec.type === 'link' ? 'https://…  or  #contact  or  tel:01000960118' : '';

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle} htmlFor={id}>
        {spec.label}{spec.required ? ' *' : ''}<Counter value={value} max={spec.max} />
      </label>
      <input
        id={id}
        type={inputType}
        inputMode={spec.type === 'link' ? 'url' : undefined}
        style={input}
        placeholder={placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
      {spec.help && <div style={helpStyle}>{spec.help}</div>}
    </div>
  );
}

export function ParagraphsField({ spec, value, onChange, onAdd, onRemove }: {
  spec: SectionFieldSpec;
  value: string[];
  onChange: (index: number, v: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const noun = spec.itemLabel || 'Paragraph';
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{spec.label}</label>
      {items.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <textarea
            style={{ ...input, minHeight: 72, resize: 'vertical' }}
            rows={2}
            aria-label={`${noun} ${i + 1}`}
            value={String(p ?? '')}
            onChange={(e) => onChange(i, e.target.value)}
          />
          <button type="button" style={{ ...smallButton, flex: '0 0 auto' }} aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onRemove(i)}>
            Remove
          </button>
        </div>
      ))}
      {(!spec.max || items.length < spec.max) && (
        <button type="button" style={smallButton} onClick={onAdd}>Add {noun.toLowerCase()}</button>
      )}
    </div>
  );
}

export function ListField({ spec, value, onItemChange, onAdd, onRemove, onUpload }: {
  spec: SectionFieldSpec;
  value: Array<Record<string, any>>;
  onItemChange: (index: number, key: string, v: any) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const items = Array.isArray(value) ? value : [];
  const noun = spec.itemLabel || 'Item';
  const atMax = spec.max != null && items.length >= spec.max;
  const atMin = spec.min != null && items.length <= spec.min;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>{spec.label}</div>
      {items.length === 0 && (
        <div style={{ ...helpStyle, marginBottom: 10 }}>Nothing here yet.</div>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--border)', borderRadius: 10,
            padding: 12, marginBottom: 12, background: 'var(--surface-2, #F8FAFC)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{noun} {i + 1}</span>
            <button
              type="button"
              style={{ ...smallButton, minHeight: 36, padding: '6px 12px' }}
              disabled={atMin}
              title={atMin ? `A ${spec.label.toLowerCase()} section needs at least ${spec.min}.` : undefined}
              onClick={() => onRemove(i)}
            >
              Remove
            </button>
          </div>
          {(spec.item || []).map((sub) => (
            <ScalarField
              key={sub.key}
              spec={sub}
              value={item?.[sub.key]}
              onChange={(v) => onItemChange(i, sub.key, v)}
              onUpload={onUpload}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        style={smallButton}
        disabled={atMax}
        title={atMax ? `Up to ${spec.max}.` : undefined}
        onClick={onAdd}
      >
        Add {noun.toLowerCase()}
      </button>
    </div>
  );
}

/** A blank row for a list field, so a new item starts with every key present. */
export function blankItem(spec: SectionFieldSpec): Record<string, any> {
  const out: Record<string, any> = {};
  for (const sub of spec.item || []) {
    out[sub.key] = sub.type === 'rating' ? 5
      : sub.type === 'choice' ? (sub.options?.[0] ?? '')
      : '';
  }
  return out;
}
