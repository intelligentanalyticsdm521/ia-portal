import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { smallButton } from '../../components/SectionFieldInputs';
import type { SiteMenus } from '../../../lib/arionApi';
import {
  type MenuRow, menuRowKey, toMenuRows, toMenuInput, moveMenuRow, removeMenuRow,
  toggleMenuRowParent, menuRowsEqual,
} from '../../utils/menuListState';

/**
 * ARION → Website → Menus
 * ---------------------------------------------------------------------------
 * "I built a page. Now put it in my menu."
 *
 * Until ARION pack 2 there was no way to do that at all without signing into
 * WordPress — the single most-missed job in the gap analysis. A client could
 * compose and publish a page from the Portal and then had no way to let anybody
 * find it.
 *
 * Shape: the same ordered-list editor the section list uses. Drag a row, or use
 * the up/down buttons — which are the ones that work on a phone and with a
 * keyboard. Nothing reaches the website until Save, the website snapshots
 * before it writes, and Undo puts the previous menu back in one tap.
 *
 * No vendor's name anywhere: a "theme location" is "where it shows".
 */

const TAP = 44;

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

export function WebsiteMenus() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const [data, setData] = useState<SiteMenus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [menuId, setMenuId] = useState<number | null>(null);
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [baseRows, setBaseRows] = useState<MenuRow[]>([]);
  const [name, setName] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [baseLocations, setBaseLocations] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [newMenuName, setNewMenuName] = useState('');
  const [creating, setCreating] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const load = useCallback(async (keepMenu?: number | null) => {
    if (!activeSiteId) return;
    setLoadError(null);
    try {
      const res: any = await arionApi.getSiteMenus(activeSiteId);
      const payload: SiteMenus = res?.data;
      setData(payload);
      const wanted = keepMenu ?? menuId;
      const menu = payload.menus.find((m) => m.menuId === wanted) || payload.menus[0] || null;
      if (menu) {
        setMenuId(menu.menuId);
        const next = toMenuRows(menu);
        setRows(next);
        setBaseRows(next);
        setName(menu.name);
        setLocations(menu.locations);
        setBaseLocations(menu.locations);
      } else {
        setMenuId(null);
        setRows([]); setBaseRows([]); setName(''); setLocations([]); setBaseLocations([]);
      }
    } catch (e: any) {
      setLoadError(messageFrom(e, 'We could not read your menus just now.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, arionApi]);

  useEffect(() => { void load(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeSiteId]);

  const menu = useMemo(
    () => (data && menuId ? data.menus.find((m) => m.menuId === menuId) || null : null),
    [data, menuId],
  );
  const dirty = useMemo(
    () => !menuRowsEqual(rows, baseRows)
      || JSON.stringify([...locations].sort()) !== JSON.stringify([...baseLocations].sort())
      || (menu ? name !== menu.name : false),
    [rows, baseRows, locations, baseLocations, name, menu],
  );

  const move = (from: number, to: number) => setRows(moveMenuRow(rows, from, to));
  const removeAt = (index: number) => setRows(removeMenuRow(rows, index));

  const addPage = (objectId: number, kind: string, title: string) => {
    setRows([...rows, { key: menuRowKey(), kind, objectId, title, url: '', parentIndex: null }]);
    setAdding(false);
  };

  const addLink = () => {
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setRows([...rows, { key: menuRowKey(), kind: 'custom', title: linkTitle.trim(), url: linkUrl.trim(), parentIndex: null }]);
    setLinkTitle(''); setLinkUrl(''); setAdding(false);
  };

  const addBooking = () => {
    if (!data?.booking.url) return;
    setRows([...rows, {
      key: menuRowKey(), kind: 'custom', title: data.booking.label || 'Book now',
      url: data.booking.url, parentIndex: null,
    }]);
    setAdding(false);
  };

  const save = async () => {
    if (!activeSiteId || !menuId) return;
    setBusy('save'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.saveSiteMenu(activeSiteId, menuId, {
        name: menu && name !== menu.name ? name : undefined,
        items: toMenuInput(rows),
        locations,
      });
      const payload: SiteMenus = res?.data;
      setData(payload);
      const fresh = payload.menus.find((m) => m.menuId === menuId);
      if (fresh) {
        const next = toMenuRows(fresh);
        setRows(next); setBaseRows(next);
        setName(fresh.name);
        setLocations(fresh.locations); setBaseLocations(fresh.locations);
      }
      setOk('Saved. Your menu is live.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not save that menu.'));
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (!activeSiteId || !menuId) return;
    setBusy('undo'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.undoSiteMenu(activeSiteId, menuId);
      const payload: SiteMenus = res?.data;
      setData(payload);
      const fresh = payload.menus.find((m) => m.menuId === menuId);
      if (fresh) {
        const next = toMenuRows(fresh);
        setRows(next); setBaseRows(next);
        setName(fresh.name);
        setLocations(fresh.locations); setBaseLocations(fresh.locations);
      }
      setOk(payload.restored ? 'Put back.' : 'There was nothing to undo.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not put that menu back.'));
    } finally {
      setBusy(null);
    }
  };

  const createMenu = async () => {
    if (!activeSiteId || !newMenuName.trim()) return;
    setBusy('create'); setError(null); setOk(null);
    try {
      const res: any = await arionApi.createSiteMenu(activeSiteId, newMenuName.trim());
      const payload: SiteMenus = res?.data;
      setData(payload);
      const made = payload.menus.find((m) => m.name === newMenuName.trim());
      setCreating(false); setNewMenuName('');
      await load(made?.menuId ?? null);
      setOk('Menu created. Add what goes in it, then Save.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not create that menu.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No website selected." />;
  if (loadError) {
    return (
      <Card title="Menus">
        <ErrorBanner message={loadError} />
        <button type="button" style={smallButton} onClick={() => void load(null)}>Try again</button>
      </Card>
    );
  }
  if (!data) return <Loading message="Reading your menus…" />;

  const alreadyIn = new Set(rows.filter((r) => r.objectId).map((r) => `${r.kind}:${r.objectId}`));

  return (
    <div>
      {error && <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>}
      {ok && <Banner tone="good" onClose={() => setOk(null)}>{ok}</Banner>}
      {dirty && <Banner tone="warn">Nothing has been saved yet. Your website still shows the old menu.</Banner>}

      <Card
        title="Menus"
        subtitle="What people click to get around your website."
        action={
          <button type="button" style={{ ...smallButton, minHeight: TAP }} onClick={() => setCreating(true)}>
            New menu
          </button>
        }
      >
        {creating && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <label htmlFor="new-menu-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              What is this menu called?
            </label>
            <input
              id="new-menu-name" value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)}
              placeholder="e.g. Footer links"
              style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="abtn abtn-sky" style={{ minHeight: TAP }}
                disabled={busy === 'create' || !newMenuName.trim()} onClick={createMenu}>
                {busy === 'create' ? 'Creating…' : 'Create'}
              </button>
              <button type="button" style={smallButton} onClick={() => { setCreating(false); setNewMenuName(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {data.menus.length === 0 ? (
          <EmptyPanel message="This website has no menus yet. Create one and choose where it shows." />
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.menus.map((m) => (
              <button
                key={m.menuId}
                type="button"
                onClick={() => { if (!dirty) void load(m.menuId); }}
                disabled={dirty && m.menuId !== menuId}
                title={dirty && m.menuId !== menuId ? 'Save or undo your changes first.' : undefined}
                style={{
                  ...smallButton,
                  minHeight: TAP,
                  background: m.menuId === menuId ? 'var(--accent-soft, #E0F2FE)' : 'transparent',
                  fontWeight: m.menuId === menuId ? 700 : 400,
                }}
              >
                {m.name} · {m.items.length}
              </button>
            ))}
          </div>
        )}
      </Card>

      {menu && (
        <>
          <Card title="What is in it" subtitle="Drag a row, or use the arrows. Tap the arrow-right to tuck a row under the one above it." style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="menu-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Menu name
              </label>
              <input
                id="menu-name" value={name} onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', maxWidth: 380, fontSize: 16, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box' }}
              />
            </div>

            {rows.length === 0 ? (
              <EmptyPanel message="Nothing in this menu yet." />
            ) : (
              <div>
                {rows.map((r, i) => (
                  <div
                    key={r.key}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}
                    style={{
                      borderTop: '1px solid var(--border)', padding: '10px 0',
                      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                      paddingLeft: r.parentIndex === null ? 0 : 24,
                    }}
                  >
                    <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                      <input
                        value={r.title}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        aria-label={`What entry ${i + 1} says`}
                        style={{ width: '100%', fontSize: 15, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box' }}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, wordBreak: 'break-all' }}>
                        {r.kind === 'custom'
                          ? r.url
                          : `${r.kind === 'post' ? 'Blog post' : 'Page'}${r.title ? '' : ''}`}
                        {r.parentIndex !== null && ` · under “${rows[r.parentIndex]?.title || ''}”`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" style={smallButton} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" style={smallButton} onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} aria-label="Move down">↓</button>
                      <button
                        type="button" style={smallButton} disabled={i === 0}
                        aria-label={r.parentIndex === null ? 'Tuck under the row above' : 'Bring back out'}
                        onClick={() => setRows(toggleMenuRowParent(rows, i))}
                      >
                        {r.parentIndex === null ? '→' : '←'}
                      </button>
                      <button type="button" style={smallButton} onClick={() => removeAt(i)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...smallButton, minHeight: TAP }} onClick={() => setAdding(!adding)}>
                {adding ? 'Close' : 'Add something'}
              </button>
              <button type="button" className="abtn abtn-sky" style={{ minHeight: TAP }} disabled={!dirty || busy !== null} onClick={save}>
                {busy === 'save' ? 'Saving…' : 'Save this menu'}
              </button>
              <button
                type="button" style={{ ...smallButton, minHeight: TAP }}
                disabled={!menu.canUndo || busy !== null} onClick={undo}
                title={menu.canUndo ? undefined : 'There is nothing to put back yet.'}
              >
                {busy === 'undo' ? 'Putting back…' : 'Undo last change'}
              </button>
            </div>

            {adding && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Your pages</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {data.addable.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing to add yet.</span>}
                  {data.addable.map((a) => (
                    <button
                      key={`${a.kind}-${a.objectId}`}
                      type="button"
                      style={{ ...smallButton, opacity: alreadyIn.has(`${a.kind}:${a.objectId}`) ? 0.5 : 1 }}
                      onClick={() => addPage(a.objectId, a.kind, a.title)}
                    >
                      {a.title}{a.status !== 'publish' ? ' (draft)' : ''}
                    </button>
                  ))}
                </div>

                {data.booking.url && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Your booking page</div>
                    <button type="button" style={smallButton} onClick={addBooking}>
                      Add “{data.booking.label}”
                    </button>
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>A link of your own</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="What it says"
                    style={{ flex: '1 1 160px', fontSize: 15, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box' }}
                  />
                  <input
                    value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… or tel:… or /a-page"
                    style={{ flex: '1 1 220px', fontSize: 15, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', minHeight: TAP, boxSizing: 'border-box' }}
                  />
                  <button type="button" style={smallButton} disabled={!linkTitle.trim() || !linkUrl.trim()} onClick={addLink}>Add</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  A phone number goes in as <code>tel:+15551234567</code> — tapping it on a phone starts the call.
                </div>
              </div>
            )}
          </Card>

          <Card title="Where it shows" subtitle="Your website has these places for a menu." style={{ marginTop: 12 }}>
            {data.locations.length === 0 ? (
              <EmptyPanel message="This website's design does not have a place for a menu." />
            ) : (
              data.locations.map((loc) => {
                const on = locations.includes(loc.location);
                const heldByAnother = !on && loc.menuId !== 0 && loc.menuId !== menuId;
                const otherName = data.menus.find((m) => m.menuId === loc.menuId)?.name || '';
                return (
                  <label
                    key={loc.location}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0',
                      borderTop: '1px solid var(--border)', minHeight: TAP, cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setLocations(on
                        ? locations.filter((l) => l !== loc.location)
                        : [...locations, loc.location])}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14 }}>
                      {loc.label}
                      {heldByAnother && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {' '}· “{otherName}” is here now; ticking this moves it
                        </span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </Card>
        </>
      )}
    </div>
  );
}
