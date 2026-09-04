import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteMediaItem } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';

/**
 * "Choose a picture" — the bottom sheet that opens from any picture field.
 * ---------------------------------------------------------------------------
 * Three ways in, in the order a client actually wants them:
 *
 *   1. **From your website** — the pictures already in the media library.
 *      Getting a picture is the single most common reason somebody opens
 *      wp-admin (2026-08-24 audit §6), and most of the time the picture is
 *      already there.
 *   2. **Upload one** — straight into the site's own library through the
 *      plugin's site token. No WordPress application password, which is NULL
 *      on every production site.
 *   3. **Paste a web address** — for a picture that lives somewhere else.
 *
 * Two things it always carries back:
 *   - the **attachment id**, when there is one. That is the whole of "srcset
 *     where we can": Elementor emits `srcset`/`sizes` from an attachment id
 *     and nothing at all from a bare URL, so a phone downloads the desktop
 *     file. A pasted web address has no id, and the sheet says so.
 *   - the **description**, which is required. A picture nobody can see is a
 *     picture a screen reader — and Google — cannot read.
 *
 * Phone first: one column under 560px, 44px tap targets, 16px inputs so iOS
 * does not zoom on focus, and a sticky bar that clears the floating ARGUS
 * button in the bottom-right corner.
 */

export interface PickedImage {
  url: string;
  attachmentId: number | null;
  alt: string;
}

type Tab = 'library' | 'upload' | 'url';

const PER_PAGE = 24;

const tabButton = (active: boolean): React.CSSProperties => ({
  ...smallButton,
  minHeight: 44,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--surface-2, #F1F5F9)' : 'transparent',
  borderColor: active ? 'var(--accent, #38BDF8)' : 'var(--border)',
});

const altInput: React.CSSProperties = {
  width: '100%', fontSize: 16, lineHeight: 1.4, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', minHeight: 44,
  boxSizing: 'border-box', background: 'var(--surface, #fff)', color: 'inherit',
};

export function MediaPicker({
  title, currentUrl, currentAlt, needsAlt, altLabel, onChoose, onClose, api,
}: {
  title: string;
  currentUrl: string;
  currentAlt: string;
  /** False for a background picture, which screen readers skip — so no description is asked for. */
  needsAlt: boolean;
  altLabel: string;
  onChoose: (picked: PickedImage) => void;
  onClose: () => void;
  api: {
    list: (params: { page: number; perPage: number; search: string }) => Promise<{
      items: SiteMediaItem[]; page: number; totalPages: number; total: number;
    }>;
    upload: (file: File) => Promise<{ url: string; attachmentId: number | null }>;
    describe: (attachmentId: number, alt: string) => Promise<void>;
  };
}) {
  const [tab, setTab] = useState<Tab>('library');

  const [items, setItems] = useState<SiteMediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PickedImage>({
    url: currentUrl || '', attachmentId: null, alt: currentAlt || '',
  });
  const [pastedUrl, setPastedUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true); setListError(null);
    try {
      const res = await api.list({ page: p, perPage: PER_PAGE, search: q });
      setItems(res.items || []);
      setPage(res.page || p);
      setTotalPages(res.totalPages || 1);
      setTotal(res.total || 0);
    } catch (e: any) {
      // A library we cannot read must SAY so. Falling back to an empty grid
      // would read as "you have no pictures", which is a different fact.
      setListError(e?.message || 'We could not read the pictures on your website just now.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { if (tab === 'library') load(1, query); }, [tab, query, load]);

  const chooseExisting = (item: SiteMediaItem) => {
    setError(null);
    setSelected({
      url: item.url,
      attachmentId: item.attachmentId,
      // Its own description wins; the one on the section is the fallback so
      // swapping a picture never silently drops the words that were there.
      alt: item.alt || selected.alt || '',
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const res = await api.upload(file);
      setSelected({ url: res.url, attachmentId: res.attachmentId, alt: selected.alt || '' });
      setTab('library');
      setQuery('');
      await load(1, '');
    } catch (e: any) {
      setError(e?.message || 'That picture would not upload. Try another one.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const usePasted = () => {
    const url = pastedUrl.trim();
    setError(null);
    if (!/^https?:\/\//i.test(url)) {
      setError('A picture address has to start with http:// or https://.');
      return;
    }
    setSelected({ url, attachmentId: null, alt: selected.alt || '' });
  };

  const altMissing = needsAlt && !selected.alt.trim();

  const confirm = async () => {
    if (!selected.url) { setError('Choose a picture first.'); return; }
    if (altMissing) { setError(`${altLabel} — say what is in the picture before you use it.`); return; }
    setBusy(true); setError(null);
    try {
      // Save the description onto the picture itself as well, so every other
      // page using it gets it too. Best effort: the section keeps the words
      // either way, so a failure here must not block the choice.
      if (selected.attachmentId && selected.alt.trim()) {
        try { await api.describe(selected.attachmentId, selected.alt.trim()); } catch { /* section still carries it */ }
      }
      onChoose({ ...selected, alt: selected.alt.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ia-sheet" style={{
        background: 'var(--surface, #fff)', width: '100%', maxWidth: 720,
        borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button type="button" style={{ ...smallButton, minHeight: 44, flex: '0 0 auto' }} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={tabButton(tab === 'library')} onClick={() => setTab('library')}>
            From your website
          </button>
          <button type="button" style={tabButton(tab === 'upload')} onClick={() => setTab('upload')}>
            Upload one
          </button>
          <button type="button" style={tabButton(tab === 'url')} onClick={() => setTab('url')}>
            Paste an address
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {tab === 'library' && (
            <>
              <form
                onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
                style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
              >
                <input
                  aria-label="Search your pictures"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  style={{ ...altInput, flex: '1 1 180px', width: 'auto' }}
                />
                <button type="submit" style={{ ...smallButton, minHeight: 44 }}>Search</button>
                {query && (
                  <button
                    type="button" style={{ ...smallButton, minHeight: 44 }}
                    onClick={() => { setSearch(''); setQuery(''); }}
                  >
                    Clear
                  </button>
                )}
              </form>

              {listError && (
                <div style={{ fontSize: 13, color: '#991B1B', marginBottom: 10 }}>
                  {listError}{' '}
                  <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={() => load(page, query)}>
                    Try again
                  </button>
                </div>
              )}

              {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Looking…</div>}

              {!loading && !listError && items.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {query
                    ? `Nothing on your website matches “${query}”.`
                    : 'There are no pictures on your website yet — upload one.'}
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: 10,
              }}>
                {items.map((item) => {
                  const chosen = selected.url === item.url;
                  return (
                    <button
                      key={item.attachmentId ?? item.url}
                      type="button"
                      onClick={() => chooseExisting(item)}
                      aria-pressed={chosen}
                      title={item.filename || item.title}
                      style={{
                        padding: 0, border: chosen ? '3px solid var(--accent, #38BDF8)' : '1px solid var(--border)',
                        borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2, #F8FAFC)',
                        cursor: 'pointer', minHeight: 110, display: 'block', width: '100%',
                      }}
                    >
                      <img
                        src={item.thumbnailUrl || item.url}
                        alt={item.alt || item.filename || 'Picture on your website'}
                        loading="lazy"
                        style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{
                        display: 'block', fontSize: 10, color: 'var(--text-muted)', padding: '4px 6px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.filename || item.title || 'Picture'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button" style={{ ...smallButton, minHeight: 44 }}
                    disabled={page <= 1 || loading} onClick={() => load(page - 1, query)}
                  >
                    ← Newer
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Page {page} of {totalPages} · {total} {total === 1 ? 'picture' : 'pictures'}
                  </span>
                  <button
                    type="button" style={{ ...smallButton, minHeight: 44 }}
                    disabled={page >= totalPages || loading} onClick={() => load(page + 1, query)}
                  >
                    Older →
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'upload' && (
            <div>
              <button
                type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
                disabled={busy} onClick={() => fileRef.current?.click()}
              >
                {busy ? 'Uploading…' : 'Choose a file from this device'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                JPG, PNG, GIF or WebP, up to 10 MB. It goes straight into your website's own
                picture library, so you can use it again on any other page.
              </div>
            </div>
          )}

          {tab === 'url' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor="mp-url">
                Address of the picture
              </label>
              <input
                id="mp-url"
                value={pastedUrl}
                onChange={(e) => setPastedUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                style={altInput}
              />
              <button type="button" style={{ ...smallButton, minHeight: 44, marginTop: 10 }} onClick={usePasted}>
                Use this address
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                A picture kept somewhere else loads at one size on every screen, and it disappears
                from your website if that other place takes it down. Uploading it is better.
              </div>
            </div>
          )}

          {/* What you are about to use — always visible, whichever tab you came from. */}
          <div style={{
            marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Chosen picture</div>
            {selected.url ? (
              <img
                src={selected.url}
                alt=""
                style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
            ) : (
              <div style={{
                background: 'var(--surface-2, #F8FAFC)', border: '1px dashed var(--border)',
                borderRadius: 8, padding: '20px 12px', textAlign: 'center',
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                Nothing chosen yet
              </div>
            )}

            {selected.url && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {selected.attachmentId
                  ? 'On your website — it will load at the right size for each screen.'
                  : 'Kept somewhere else — it will load at one size on every screen.'}
              </div>
            )}

            {needsAlt && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor="mp-alt">
                  {altLabel} *
                </label>
                <input
                  id="mp-alt"
                  value={selected.alt}
                  onChange={(e) => setSelected((s) => ({ ...s, alt: e.target.value }))}
                  placeholder="e.g. A cedar-clad garden room at dusk"
                  maxLength={200}
                  style={{ ...altInput, borderColor: altMissing ? '#FCA5A5' : 'var(--border)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Say what is in the picture, so somebody using a screen reader — and Google —
                  knows what it shows.
                </div>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" style={{ fontSize: 13, color: '#991B1B', marginTop: 12 }}>{error}</div>
          )}
        </div>

        {/* `.ia-sticky-bar` clears the floating ARGUS button in the corner. */}
        <div className="ia-sticky-bar ia-sticky-bar--sheet" style={{
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center',
          background: 'var(--surface, #fff)',
        }}>
          <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button
            type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
            disabled={busy || !selected.url}
            onClick={confirm}
          >
            {busy ? 'Working…' : 'Use this picture'}
          </button>
        </div>
      </div>
    </div>
  );
}
