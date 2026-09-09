import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { smallButton } from '../../components/SectionFieldInputs';
import { MediaPicker } from '../../components/MediaPicker';
import type { SiteKit, SiteChrome, SiteChromeField, SiteOptions } from '../../../lib/arionApi';

/**
 * ARION → Website → Brand and layout
 * ---------------------------------------------------------------------------
 * The three things that are the same on every page and could only be changed
 * by signing into WordPress:
 *
 *   Your colours and fonts — until ARION pack 2 these were written ONCE, by a
 *   command run over SSH while the site was being built, so a client could
 *   never change their own brand and a site we did not host could not be
 *   branded at all. They now go through the plugin, so they work everywhere.
 *
 *   Your header and your footer — through the design your website is actually
 *   running, over a list of things we know how to set. Anything that design
 *   does not offer says so, in words, instead of being changed silently and
 *   not appearing.
 *
 *   The Book now button — which is a website setting, and lives with the
 *   others under Website settings; it is shown here too because this is where
 *   somebody looks for it, and both places write the same one setting.
 */

const TAP = 44;
const KIT_COLOUR_LABELS: Record<string, string> = {
  primary: 'Main colour',
  secondary: 'Second colour',
  accent: 'Highlight colour',
  text: 'Words',
};
const KIT_FONT_LABELS: Record<string, string> = {
  primary: 'Headings',
  secondary: 'Body text',
  text: 'Body text',
  accent: 'Highlights',
};

function messageFrom(err: any, fallback: string): string {
  const m = err?.body?.error?.message || err?.error?.message || err?.message;
  return typeof m === 'string' && m.trim() ? m : fallback;
}

function Banner({ tone, children, onClose }: {
  tone: 'good' | 'bad' | 'warn'; children: React.ReactNode; onClose?: () => void;
}) {
  const palette = tone === 'good'
    ? { bg: '#ECFDF5', fg: '#065F46', bd: '#A7F3D0' }
    : tone === 'warn'
      ? { bg: '#FFFBEB', fg: '#92400E', bd: '#FDE68A' }
      : { bg: '#FEF2F2', fg: '#991B1B', bd: '#FECACA' };
  return (
    <div style={{
      background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
      borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13,
      display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between',
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
          ×
        </button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box',
};

export function WebsiteDesign() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const [kit, setKit] = useState<SiteKit | null>(null);
  const [kitError, setKitError] = useState<string | null>(null);
  const [chrome, setChrome] = useState<SiteChrome | null>(null);
  const [options, setOptions] = useState<SiteOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [colours, setColours] = useState<Record<string, string>>({});
  const [fonts, setFonts] = useState<Record<string, string>>({});
  const [chromeDraft, setChromeDraft] = useState<Record<string, string | number | boolean>>({});
  const [pickingLogo, setPickingLogo] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // The same picture library the page editor uses. Choosing only — a logo is
  // never deleted or replaced from this screen.
  const mediaApi = useMemo(() => ({
    list: async (params: { page: number; perPage: number; search: string }) => {
      if (!activeSiteId) throw new Error('No website selected.');
      const res: any = await arionApi.listSiteMedia(activeSiteId, params);
      return res?.data || { items: [], page: 1, totalPages: 1, total: 0 };
    },
    upload: async (file: File) => {
      if (!activeSiteId) throw new Error('No website selected.');
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('That file could not be read.'));
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(file);
      });
      const res: any = await arionApi.uploadSiteMedia(activeSiteId, {
        filename: file.name, contentType: file.type, dataBase64,
      });
      const url = res?.data?.url;
      if (!url) throw new Error('The picture uploaded but your website did not say where it went.');
      return { url, attachmentId: res?.data?.attachmentId ?? null };
    },
    describe: async (attachmentId: number, alt: string) => {
      if (!activeSiteId) throw new Error('No website selected.');
      await arionApi.setSiteMediaAlt(activeSiteId, attachmentId, alt);
    },
  }), [activeSiteId, arionApi]);

  const load = useCallback(async () => {
    if (!activeSiteId) return;
    setLoadError(null); setKitError(null);
    try {
      const [chromeRes, optionsRes] = await Promise.all([
        arionApi.getSiteChrome(activeSiteId),
        arionApi.getSiteOptions(activeSiteId),
      ]);
      setChrome((chromeRes as any)?.data || null);
      setOptions((optionsRes as any)?.data || null);
    } catch (e: any) {
      setLoadError(messageFrom(e, 'We could not read your website’s design just now.'));
    }
    try {
      // The kit is refused outright on a website with no Elementor, and that
      // refusal is a sentence about THIS card — not a reason to blank the page.
      const kitRes: any = await arionApi.getSiteKit(activeSiteId);
      const payload: SiteKit = kitRes?.data;
      setKit(payload);
      setColours(Object.fromEntries(payload.colors.map((c) => [c.id, c.color])));
      setFonts(Object.fromEntries(payload.typography.map((t) => [t.id, t.fontFamily])));
    } catch (e: any) {
      setKitError(messageFrom(e, 'We could not read your colours and fonts.'));
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, arionApi]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeSiteId]);

  const chromeValue = useCallback((key: string) => {
    if (key in chromeDraft) return chromeDraft[key];
    const field = chrome?.fields.find((f) => f.key === key);
    return field ? field.value : null;
  }, [chrome, chromeDraft]);

  const setChromeValue = (key: string, value: string | number | boolean) => {
    setChromeDraft({ ...chromeDraft, [key]: value });
  };

  const headerFields = useMemo(() => (chrome?.fields || []).filter((f) => f.group === 'header'), [chrome]);
  const footerFields = useMemo(() => (chrome?.fields || []).filter((f) => f.group === 'footer'), [chrome]);
  const chromeDirty = Object.keys(chromeDraft).length > 0;

  const kitDirty = useMemo(() => {
    if (!kit) return false;
    const colourChanged = kit.colors.some((c) => (colours[c.id] ?? c.color) !== c.color)
      || Object.keys(colours).some((id) => !kit.colors.find((c) => c.id === id));
    const fontChanged = kit.typography.some((t) => (fonts[t.id] ?? t.fontFamily) !== t.fontFamily)
      || Object.keys(fonts).some((id) => !kit.typography.find((t) => t.id === id));
    return colourChanged || fontChanged;
  }, [kit, colours, fonts]);

  const saveKit = async () => {
    if (!activeSiteId) return;
    setBusy('kit'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.saveSiteKit(activeSiteId, {
        colors: Object.entries(colours).map(([id, color]) => ({ id, color })),
        typography: Object.entries(fonts).map(([id, fontFamily]) => ({ id, fontFamily })),
      });
      const payload: SiteKit = res?.data;
      setKit((prev) => (prev ? { ...payload, suggested: prev.suggested } : payload));
      setColours(Object.fromEntries(payload.colors.map((c) => [c.id, c.color])));
      setFonts(Object.fromEntries(payload.typography.map((t) => [t.id, t.fontFamily])));
      setOk('Saved. Your colours and fonts are live on every page.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not save your colours and fonts.'));
    } finally {
      setBusy(null);
    }
  };

  const useMyBrand = () => {
    if (!kit?.suggested) return;
    if (kit.suggested.hasBrandColour) {
      setColours({ ...colours, ...Object.fromEntries(kit.suggested.colors.map((c) => [c.id, c.color])) });
    }
    setFonts({ ...fonts, ...Object.fromEntries(kit.suggested.typography.map((t) => [t.id, t.fontFamily])) });
  };

  const saveChrome = async () => {
    if (!activeSiteId || !chromeDirty) return;
    setBusy('chrome'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.saveSiteChrome(activeSiteId, chromeDraft);
      setChrome((res as any)?.data || null);
      setChromeDraft({});
      setOk('Saved. Your header and footer are live.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not save that.'));
    } finally {
      setBusy(null);
    }
  };

  const saveBooking = async (params: { bookingInHeader?: boolean; bookingLabel?: string }) => {
    if (!activeSiteId) return;
    setBusy('booking'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.saveSiteOptions(activeSiteId, params);
      setOptions((res as any)?.data || null);
      setOk('Saved.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not save that.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No website selected." />;
  if (!ready) return <Loading message="Reading your website’s design…" />;
  if (loadError) {
    return (
      <Card title="Brand and layout">
        <ErrorBanner message={loadError} />
        <button type="button" style={smallButton} onClick={() => void load()}>Try again</button>
      </Card>
    );
  }

  const renderField = (f: SiteChromeField) => {
    if (!f.supported) {
      return (
        <div key={f.key} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{f.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{f.reason}</div>
        </div>
      );
    }
    const value = chromeValue(f.key);
    return (
      <div key={f.key} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        <label htmlFor={`chrome-${f.key}`} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          {f.label}
        </label>
        {f.type === 'switch' ? (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: TAP, cursor: 'pointer' }}>
            <input
              id={`chrome-${f.key}`} type="checkbox" checked={!!value}
              onChange={(e) => setChromeValue(f.key, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 13 }}>{value ? 'Shown' : 'Hidden'}</span>
          </label>
        ) : f.type === 'choice' ? (
          <select
            id={`chrome-${f.key}`} value={String(value ?? '')}
            onChange={(e) => setChromeValue(f.key, e.target.value)}
            style={{ ...inputStyle, maxWidth: 320 }}
          >
            {(f.options || []).map((o) => (
              <option key={o} value={o}>
                {o === 'logo' ? 'Your logo' : o === 'name' ? 'Your business name' : 'Nothing'}
              </option>
            ))}
          </select>
        ) : f.type === 'textarea' ? (
          <textarea
            id={`chrome-${f.key}`} rows={2} value={String(value ?? '')}
            onChange={(e) => setChromeValue(f.key, e.target.value)}
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
          />
        ) : f.type === 'image' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {f.imageUrl
              ? <img src={f.imageUrl} alt="Your logo" style={{ maxHeight: 44, maxWidth: 180, borderRadius: 6 }} />
              : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No logo set.</span>}
            <button type="button" style={smallButton} onClick={() => setPickingLogo(true)}>Choose a picture</button>
            {Number(value) > 0 && (
              <button type="button" style={smallButton} onClick={() => setChromeValue(f.key, 0)}>Take it off</button>
            )}
            {f.key in chromeDraft && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Changed — press Save.</span>
            )}
          </div>
        ) : (
          <input
            id={`chrome-${f.key}`} value={String(value ?? '')}
            onChange={(e) => setChromeValue(f.key, e.target.value)}
            style={{ ...inputStyle, maxWidth: 460 }}
          />
        )}
        {f.help && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{f.help}</div>}
      </div>
    );
  };

  return (
    <div>
      {error && <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>}
      {ok && <Banner tone="good" onClose={() => setOk(null)}>{ok}</Banner>}

      {/* ── Colours and fonts ─────────────────────────────────────────── */}
      <Card
        title="Your colours and fonts"
        subtitle="These are used everywhere on your website at once."
        action={
          kit?.suggested && (kit.suggested.hasBrandColour || kit.suggested.typography.length > 0) ? (
            <button type="button" style={{ ...smallButton, minHeight: TAP }} onClick={useMyBrand}>
              Use my brand
            </button>
          ) : undefined
        }
      >
        {kitError ? (
          <ErrorBanner message={kitError} />
        ) : !kit ? (
          <EmptyPanel message="We could not read your colours and fonts." />
        ) : (
          <>
            {kit.suggested && !kit.suggested.hasBrandColour && (
              <Banner tone="warn">
                We have no brand colour on file for your business, so there is nothing to copy in — pick your
                colours below, or tell us your brand colour and we will remember it.
              </Banner>
            )}
            {['primary', 'secondary', 'accent', 'text'].map((id) => {
              const current = colours[id] ?? kit.colors.find((c) => c.id === id)?.color ?? '';
              return (
                <div key={id} style={{
                  borderTop: '1px solid var(--border)', padding: '12px 0',
                  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                }}>
                  <label htmlFor={`colour-${id}`} style={{ fontSize: 13, fontWeight: 600, flex: '0 0 130px' }}>
                    {KIT_COLOUR_LABELS[id] || id}
                  </label>
                  <input
                    id={`colour-${id}`} type="color" value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'}
                    onChange={(e) => setColours({ ...colours, [id]: e.target.value })}
                    style={{ width: 56, height: TAP, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' }}
                  />
                  <input
                    value={current} onChange={(e) => setColours({ ...colours, [id]: e.target.value })}
                    placeholder="#1A3A4A" aria-label={`${KIT_COLOUR_LABELS[id] || id} as a code`}
                    style={{ ...inputStyle, width: 140, flex: '0 0 140px' }}
                  />
                </div>
              );
            })}

            {['primary', 'secondary'].map((id) => {
              const current = fonts[id] ?? kit.typography.find((t) => t.id === id)?.fontFamily ?? '';
              return (
                <div key={`font-${id}`} style={{
                  borderTop: '1px solid var(--border)', padding: '12px 0',
                  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                }}>
                  <label htmlFor={`font-${id}`} style={{ fontSize: 13, fontWeight: 600, flex: '0 0 130px' }}>
                    {KIT_FONT_LABELS[id] || id}
                  </label>
                  <input
                    id={`font-${id}`} value={current}
                    onChange={(e) => setFonts({ ...fonts, [id]: e.target.value })}
                    placeholder="Inter"
                    style={{ ...inputStyle, maxWidth: 260 }}
                  />
                </div>
              );
            })}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="abtn abtn-sky" style={{ minHeight: TAP }}
                disabled={!kitDirty || busy !== null} onClick={saveKit}>
                {busy === 'kit' ? 'Saving…' : 'Save colours and fonts'}
              </button>
              {kitDirty && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing has been saved yet.</span>}
            </div>
          </>
        )}
      </Card>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <Card
        title="The top of every page"
        subtitle={chrome ? `Set through your website’s design (${chrome.theme}).` : undefined}
        style={{ marginTop: 12 }}
      >
        {headerFields.map(renderField)}

        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>The menu in your header</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {(chrome?.menuLocations || []).length === 0
              ? 'This design has no place for a menu.'
              : (chrome?.menuLocations || []).map((m) => (
                <div key={m.location}>
                  {m.label}: {m.menuName ? `“${m.menuName}”` : 'nothing yet'}
                </div>
              ))}
            <div style={{ marginTop: 6 }}>
              <Link to="/app/services/arion_website_menus">Change what is in it, and where it shows →</Link>
            </div>
          </div>
        </div>

        {options && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Your “{options.booking.label}” button</div>
            {!options.booking.url ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                There is no booking page for this button to open yet, so it is off.
              </div>
            ) : !options.booking.tierAllows ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Your plan does not include the booking button in your header.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: TAP, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={options.booking.inHeader} disabled={busy !== null}
                    onChange={(e) => void saveBooking({ bookingInHeader: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 13 }}>Show it in my header</span>
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{options.booking.url}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <Card title="The bottom of every page" style={{ marginTop: 12 }}>
        {footerFields.length === 0
          ? <EmptyPanel message="Your website’s design does not offer anything we can set down here." />
          : footerFields.map(renderField)}
        {chrome?.suggested?.footerText && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button" style={smallButton}
              disabled={!footerFields.some((f) => f.key === 'footer_text' && f.supported)}
              onClick={() => setChromeValue('footer_text', chrome.suggested!.footerText)}
            >
              Use “{chrome.suggested.footerText}”
            </button>
          </div>
        )}
      </Card>

      {chromeDirty && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="abtn abtn-sky" style={{ minHeight: TAP }} disabled={busy !== null} onClick={saveChrome}>
            {busy === 'chrome' ? 'Saving…' : 'Save the header and footer'}
          </button>
          <button type="button" style={smallButton} onClick={() => setChromeDraft({})}>Undo my changes</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing has been saved yet.</span>
        </div>
      )}

      {pickingLogo && activeSiteId && (
        <MediaPicker
          title="Logo"
          currentUrl={String(chrome?.fields.find((f) => f.key === 'logo_id')?.imageUrl || '')}
          currentAlt=""
          // A logo is announced by the site name beside it, so there is
          // nothing extra for a screen reader to be told here.
          needsAlt={false}
          altLabel="Describe the logo"
          onChoose={(picked) => {
            // A logo has to be a picture ON this website: WordPress stores a
            // logo by its attachment id, so a URL from somewhere else cannot
            // be one. Refuse rather than store a 0 that reads as "no logo".
            if (!picked.attachmentId) {
              setError('That picture is not in your website’s own library, so it cannot be used as a logo. Upload it here first.');
              setPickingLogo(false);
              return;
            }
            setChromeValue('logo_id', picked.attachmentId);
            setPickingLogo(false);
          }}
          onClose={() => setPickingLogo(false)}
          api={mediaApi}
        />
      )}
    </div>
  );
}
