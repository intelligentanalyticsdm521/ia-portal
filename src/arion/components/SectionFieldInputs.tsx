import React, { useState } from 'react';
import type { SectionFieldSpec } from '../../lib/arionApi';
import { MediaPicker, type PickedImage } from './MediaPicker';

/**
 * The inputs inside a section's edit sheet.
 * ---------------------------------------------------------------------------
 * Rendered from the field spec arion-api sends with the section catalogue, so
 * there is one description of what a section holds and it lives in
 * `lib/websiteBuilder/sectionSchema.js`. Nothing here knows the word
 * "Elementor", and nothing shows raw JSON to a client.
 *
 * Sized for a phone first: one column, 16px inputs (anything smaller makes iOS
 * zoom on focus), and **44px minimum tap targets everywhere** — measured, not
 * assumed. The 1B walk found a 40px control next to 44px ones and it read as
 * broken, so there is one constant below and every button uses it.
 *
 * Phase 2 adds three things:
 *   - a picture PICKER (choose from the site's own library, upload, or paste),
 *     which carries the attachment id back so Elementor can emit srcset;
 *   - READ-ONLY fields, for a value whose one home is somewhere else — a
 *     form's recipient lives on the business details;
 *   - "Link to your booking page" on button links, when the business has one.
 */

/** Anything a finger has to hit. Apple's minimum, and the Portal's. */
export const TAP = 44;

const input: React.CSSProperties = {
  width: '100%',
  fontSize: 16,
  lineHeight: 1.4,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface, #fff)',
  color: 'inherit',
  minHeight: TAP,
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
  minHeight: TAP,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

/**
 * Everything an input needs that is not the field itself: where pictures come
 * from, and where "your booking page" points. Threaded down rather than read
 * from a context so the pure components stay testable.
 */
export interface FieldContext {
  /** '' when the business has no online booking page — the chip is then absent. */
  bookingHref: string;
  media: {
    list: (params: { page: number; perPage: number; search: string }) => Promise<any>;
    upload: (file: File) => Promise<{ url: string; attachmentId: number | null }>;
    describe: (attachmentId: number, alt: string) => Promise<void>;
    /* Looking after a picture, not only choosing one (ARION pack 1). Optional
       so a screen that only picks does not have to supply them. */
    usage?: (attachmentId: number) => Promise<any>;
    remove?: (attachmentId: number) => Promise<void>;
    replace?: (attachmentId: number, file: File) => Promise<{ url: string; usedOn: number }>;
  };
}

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

/** A field the client never types into and never sees — an attachment id. */
export function isHiddenSpec(spec: SectionFieldSpec): boolean {
  return spec.type === 'hidden';
}

/* ── pictures ───────────────────────────────────────────────────────────── */

export function ImageField({ spec, value, siblings, onPatch, ctx }: {
  spec: SectionFieldSpec;
  value: string;
  /** The object this field lives in, so the picker can read and write its id and description. */
  siblings: Record<string, any>;
  onPatch: (patch: Record<string, any>) => void;
  ctx: FieldContext;
}) {
  const [open, setOpen] = useState(false);
  const idKey = spec.idKey as string | undefined;
  const altKey = spec.altKey as string | undefined;
  const attachmentId = idKey ? siblings?.[idKey] : null;

  const choose = (picked: PickedImage) => {
    const patch: Record<string, any> = { [spec.key]: picked.url };
    // The attachment id travels WITH the url, always. Setting one without the
    // other would leave the widget pointing at a new picture with an old id,
    // which is how Elementor ends up rendering the wrong srcset.
    if (idKey) patch[idKey] = picked.attachmentId ?? '';
    if (altKey && picked.alt) patch[altKey] = picked.alt;
    onPatch(patch);
    setOpen(false);
  };

  const remove = () => {
    const patch: Record<string, any> = { [spec.key]: '' };
    if (idKey) patch[idKey] = '';
    onPatch(patch);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{spec.label}{spec.required ? ' *' : ''}</label>
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
        <button type="button" className="abtn" style={smallButton} onClick={() => setOpen(true)}>
          {value ? 'Change picture' : 'Choose a picture'}
        </button>
        {value && (
          <button type="button" style={smallButton} onClick={remove}>Remove</button>
        )}
      </div>
      {value && (
        <div style={helpStyle}>
          {attachmentId
            ? 'On your website — it loads at the right size for each screen.'
            : 'Kept somewhere else — it loads at one size on every screen.'}
        </div>
      )}
      {spec.help && <div style={helpStyle}>{spec.help}</div>}

      {open && (
        <MediaPicker
          title={spec.label}
          currentUrl={value}
          currentAlt={altKey ? String(siblings?.[altKey] ?? '') : ''}
          needsAlt={!!altKey}
          altLabel="Describe the picture"
          onChoose={choose}
          onClose={() => setOpen(false)}
          api={ctx.media}
        />
      )}
    </div>
  );
}

/* ── one scalar field ───────────────────────────────────────────────────── */

export function ScalarField({ spec, value, siblings, onChange, onPatch, ctx }: {
  spec: SectionFieldSpec;
  value: any;
  siblings: Record<string, any>;
  onChange: (v: any) => void;
  onPatch: (patch: Record<string, any>) => void;
  ctx: FieldContext;
}) {
  const id = `f-${spec.key}`;

  // An attachment id has nothing for a person to read or type. It travels
  // with its picture and is never rendered.
  if (isHiddenSpec(spec)) return null;

  if (spec.type === 'image') {
    return <ImageField spec={spec} value={String(value ?? '')} siblings={siblings} onPatch={onPatch} ctx={ctx} />;
  }

  /**
   * A value with ONE home, shown so the client can see it and see where it
   * comes from. Today: a form's recipient, which lives on the business
   * details — so a form can never quietly point at an inbox nobody reads,
   * and changing it changes it everywhere at once.
   */
  if (spec.readOnly) {
    const shown = String(value ?? '');
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor={id}>{spec.label}</label>
        <input
          id={id}
          readOnly
          value={shown}
          aria-describedby={`${id}-help`}
          style={{ ...input, background: 'var(--surface-2, #F8FAFC)', color: 'var(--text-muted)' }}
        />
        <div id={`${id}-help`} style={helpStyle}>
          {shown
            ? spec.help
            : 'We do not have an email address for your business yet, so this form has nowhere '
              + 'to send enquiries. Add one under Settings → Your business.'}
        </div>
      </div>
    );
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
  const showBooking = spec.type === 'link' && spec.offersBooking && !!ctx.bookingHref;
  const alreadyBooking = showBooking && String(value ?? '').trim() === ctx.bookingHref;

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
      {showBooking && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            style={{ ...smallButton, opacity: alreadyBooking ? 0.6 : 1 }}
            disabled={alreadyBooking}
            onClick={() => onChange(ctx.bookingHref)}
          >
            {alreadyBooking ? '✓ Goes to your booking page' : 'Link to your booking page'}
          </button>
        </div>
      )}
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

export function ListField({ spec, value, onItemChange, onItemPatch, onAdd, onRemove, ctx }: {
  spec: SectionFieldSpec;
  value: Array<Record<string, any>>;
  onItemChange: (index: number, key: string, v: any) => void;
  onItemPatch: (index: number, patch: Record<string, any>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  ctx: FieldContext;
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{noun} {i + 1}</span>
            <button
              type="button"
              style={{ ...smallButton, padding: '6px 12px' }}
              disabled={atMin}
              title={atMin ? `A ${spec.label.toLowerCase()} section needs at least ${spec.min}.` : undefined}
              onClick={() => onRemove(i)}
            >
              Remove
            </button>
          </div>
          {(spec.item || []).filter((sub) => !isHiddenSpec(sub)).map((sub) => (
            <ScalarField
              key={sub.key}
              spec={sub}
              value={item?.[sub.key]}
              siblings={item || {}}
              onChange={(v) => onItemChange(i, sub.key, v)}
              onPatch={(patch) => onItemPatch(i, patch)}
              ctx={ctx}
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
