import React, { useEffect, useState } from 'react';
import type { SitePageSettings, SitePageSeo } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';

/**
 * "Page settings" — everything about a page that is not its content.
 * ---------------------------------------------------------------------------
 * Its address, its layout, which page it sits under, whether it is the home
 * page, its three search-engine fields, and deleting it. Every one of these was
 * a wp-admin-only job until now: the home page in particular could only ever be
 * set by a wp-cli call over Hostinger SSH during provisioning, which a
 * BYO-hosted client never gets and no client can reach at all.
 *
 * Two SAVES, on purpose. The address and the layout change what a visitor's
 * browser asks for; the search fields do not. Keeping them apart means a client
 * can fix a typo in a meta description without being told their page address is
 * about to change.
 *
 * Phone first: one column, 44px targets, 16px inputs so iOS does not zoom.
 */

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 16, lineHeight: 1.4, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', minHeight: 44,
  boxSizing: 'border-box', background: 'var(--surface, #fff)', color: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 14,
};

const helpStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', marginTop: 4,
};

function Note({ tone, children }: { tone: 'good' | 'bad' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'good'
    ? { bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC' }
    : tone === 'bad'
      ? { bg: '#FEE2E2', fg: '#991B1B', bd: '#FCA5A5' }
      : { bg: '#FEF3C7', fg: '#92400E', bd: '#FDE68A' };
  return (
    <div role="status" style={{
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      borderRadius: 8, padding: '10px 12px', fontSize: 13, margin: '10px 0',
    }}>
      {children}
    </div>
  );
}

export function PageSettingsSheet({
  settings, seo, loading, busy, error, onSaveSettings, onSaveSeo, onTrash, onClose,
  onPickFeaturedImage,
}: {
  settings: SitePageSettings | null;
  seo: SitePageSeo | null;
  loading: boolean;
  /** 'settings' | 'seo' | 'trash' | null */
  busy: string | null;
  error: string | null;
  onSaveSettings: (params: {
    slug?: string; template?: string; parentId?: number; makeHomePage?: boolean;
    excerpt?: string; categories?: string[]; tags?: string[]; featuredImageId?: number;
  }) => Promise<void>;
  /** Only supplied on a blog post: choosing the picture that goes with it. */
  onPickFeaturedImage?: () => void;
  onSaveSeo: (params: { title: string; description: string; focusKeyword: string }) => Promise<void>;
  onTrash: () => void;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('');
  const [parentId, setParentId] = useState(0);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDesc, setSeoDesc] = useState('');
  const [seoKeyword, setSeoKeyword] = useState('');
  // A blog post's own four (ARION pack 2, D-ARION-C). Categories and tags are
  // typed and read as plain comma-separated names, because that is how a
  // person thinks about them — a name that does not exist yet is created.
  const [excerpt, setExcerpt] = useState('');
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (!settings) return;
    setSlug(settings.slug || '');
    setTemplate(settings.template || '');
    setParentId(settings.parentId || 0);
    setExcerpt(settings.postFields?.excerpt || '');
    setCategories((settings.postFields?.categories || []).join(', '));
    setTags((settings.postFields?.tags || []).join(', '));
  }, [settings]);

  useEffect(() => {
    if (!seo) return;
    setSeoTitle(seo.title || '');
    setSeoDesc(seo.description || '');
    setSeoKeyword(seo.focusKeyword || '');
  }, [seo]);

  const isDraft = settings?.status === 'draft' || settings?.status === 'pending';
  const post = settings?.postFields || null;
  const asList = (v: string) => v.split(',').map((t) => t.trim()).filter(Boolean);
  const postDirty = !!post && (
    excerpt !== (post.excerpt || '')
    || asList(categories).join('|') !== (post.categories || []).join('|')
    || asList(tags).join('|') !== (post.tags || []).join('|')
  );
  const settingsDirty = !!settings && (
    slug !== (settings.slug || '')
    || template !== (settings.template || '')
    || parentId !== (settings.parentId || 0)
  );
  const seoDirty = !!seo && (
    seoTitle !== (seo.title || '')
    || seoDesc !== (seo.description || '')
    || seoKeyword !== (seo.focusKeyword || '')
  );

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Page settings"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ia-sheet" style={{
        background: 'var(--surface, #fff)', width: '100%', maxWidth: 640, maxHeight: '92vh',
        borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Page settings</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {settings?.title || 'This page'}
            </div>
          </div>
          <button type="button" style={{ ...smallButton, minHeight: 44, flex: '0 0 auto' }} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Reading this page’s settings…</div>}
          {error && <Note tone="bad">{error}</Note>}

          {settings && (
            <>
              {settings.isHomePage && (
                <Note tone="good">This is your home page — it is what people see first.</Note>
              )}
              {settings.slugAdjusted && (
                <Note tone="warn">
                  Another page already had that address, so your website used
                  <strong> {settings.slug}</strong> instead.
                </Note>
              )}
              {/* A draft may hold an address that is already in use; the website
                  renames it at publish time. Better said now than discovered
                  afterwards. */}
              {settings.slugOnPublish && settings.slugOnPublish !== settings.slug && (
                <Note tone="warn">
                  Another page is already using that address, so when you publish this page it will
                  be at <strong>{settings.slugOnPublish}</strong> instead. Pick a different one if
                  that matters.
                </Note>
              )}

              <label style={{ ...labelStyle, marginTop: 0 }} htmlFor="page-slug">The page’s address</label>
              <input
                id="page-slug" style={inputStyle} value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="garden-offices"
              />
              <div style={helpStyle}>
                {settings.permalink
                  ? <>People reach this page at <strong style={{ wordBreak: 'break-all' }}>{settings.permalink}</strong>.</>
                  : 'This is the last part of the web address.'}
                {' '}Changing it means the old address stops working, so only change it on a page nobody links to yet.
              </div>

              <label style={labelStyle} htmlFor="page-template">How the page is laid out</label>
              <select
                id="page-template" style={inputStyle} value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {settings.templates.map((t) => (
                  <option key={t.file || 'default'} value={t.file}>{t.label}</option>
                ))}
              </select>
              <div style={helpStyle}>
                A blank canvas has no header or footer — useful for a landing page, wrong for most pages.
              </div>

              <label style={labelStyle} htmlFor="page-parent">Sits inside</label>
              <select
                id="page-parent" style={inputStyle} value={String(parentId)}
                onChange={(e) => setParentId(Number(e.target.value))}
              >
                <option value="0">Nothing — it is a top-level page</option>
                {settings.parents.map((p) => (
                  <option key={p.pageId ?? 0} value={String(p.pageId ?? 0)}>
                    {p.title}{p.status !== 'publish' ? ' (draft)' : ''}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
                  disabled={busy !== null || !settingsDirty}
                  onClick={() => onSaveSettings({ slug, template, parentId })}
                >
                  {busy === 'settings' ? 'Saving…' : 'Save these settings'}
                </button>
                {!settings.isHomePage && settings.type === 'page' && (
                  <button
                    type="button" style={{ ...smallButton, minHeight: 44 }}
                    disabled={busy !== null || isDraft}
                    title={isDraft
                      ? 'Publish this page first — a draft home page would leave your website blank.'
                      : undefined}
                    onClick={() => {
                      if (window.confirm('Make this the first page people see on your website?')) {
                        onSaveSettings({ makeHomePage: true });
                      }
                    }}
                  >
                    Make this my home page
                  </button>
                )}
              </div>

              {/* ── a blog post's own four (D-ARION-C) ───────────────────── */}
              {post && (
                <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>About this post</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Where it is filed, and the picture that goes with it in your blog list.
                  </div>

                  <label style={labelStyle} htmlFor="post-excerpt">The short version</label>
                  <textarea
                    id="post-excerpt" rows={3}
                    style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
                    value={excerpt} onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="One or two lines, shown in the list of posts."
                  />

                  <label style={labelStyle} htmlFor="post-categories">Filed under</label>
                  <input
                    id="post-categories" style={inputStyle} value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    list="post-category-options"
                    placeholder="Lawn care, Seasonal"
                  />
                  <datalist id="post-category-options">
                    {(post.allCategories || []).map((c) => <option key={c} value={c} />)}
                  </datalist>
                  <div style={helpStyle}>
                    Separate them with commas. Anything new is created for you.
                  </div>

                  <label style={labelStyle} htmlFor="post-tags">Tags</label>
                  <input
                    id="post-tags" style={inputStyle} value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="mowing, autumn"
                  />

                  <label style={labelStyle}>The picture that goes with it</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {post.featuredImage.url
                      ? <img src={post.featuredImage.url} alt="" style={{ maxHeight: 56, maxWidth: 120, borderRadius: 6 }} />
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None chosen.</span>}
                    {onPickFeaturedImage && (
                      <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={onPickFeaturedImage}>
                        {post.featuredImage.url ? 'Change it' : 'Choose a picture'}
                      </button>
                    )}
                    {post.featuredImage.id > 0 && (
                      <button
                        type="button" style={{ ...smallButton, minHeight: 44 }}
                        disabled={busy !== null}
                        onClick={() => onSaveSettings({ featuredImageId: 0 })}
                      >
                        Take it off
                      </button>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
                      disabled={busy !== null || !postDirty}
                      onClick={() => onSaveSettings({
                        excerpt, categories: asList(categories), tags: asList(tags),
                      })}
                    >
                      {busy === 'settings' ? 'Saving…' : 'Save these details'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── search engines ───────────────────────────────────────── */}
              <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>How this page looks in search results</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  The title and the line under it that Google shows. Leave them blank and your website
                  works it out from the page.
                </div>

                {seo && !seo.seoPluginActive && seo.seoPluginNote && (
                  <Note tone="warn">{seo.seoPluginNote}</Note>
                )}

                <label style={labelStyle} htmlFor="seo-title">Title in search results</label>
                <input
                  id="seo-title" style={inputStyle} value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={settings.title}
                />
                <div style={helpStyle}>
                  {seoTitle.length} characters — about {seo?.recommended?.title ?? 60} works best.
                </div>

                <label style={labelStyle} htmlFor="seo-desc">The line underneath</label>
                <textarea
                  id="seo-desc" rows={3}
                  style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
                  value={seoDesc}
                  onChange={(e) => setSeoDesc(e.target.value)}
                  placeholder="Weekly lawn care in Ashby, from £18 a visit."
                />
                <div style={helpStyle}>
                  {seoDesc.length} characters — about {seo?.recommended?.description ?? 160} works best.
                </div>

                <label style={labelStyle} htmlFor="seo-keyword">What this page is about, in a few words</label>
                <input
                  id="seo-keyword" style={inputStyle} value={seoKeyword}
                  onChange={(e) => setSeoKeyword(e.target.value)}
                  placeholder="lawn care ashby"
                />

                <div style={{ marginTop: 16 }}>
                  <button
                    type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
                    disabled={busy !== null || !seoDirty}
                    onClick={() => onSaveSeo({ title: seoTitle, description: seoDesc, focusKeyword: seoKeyword })}
                  >
                    {busy === 'seo' ? 'Saving…' : 'Save search settings'}
                  </button>
                </div>
              </div>

              {/* ── delete ───────────────────────────────────────────────── */}
              <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Delete this {settings.type === 'post' ? 'post' : 'page'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 10 }}>
                  It comes off your website and goes in your website’s bin, where you can put it back
                  for 30 days.
                </div>
                <button
                  type="button"
                  style={{ ...smallButton, minHeight: 44, borderColor: '#FCA5A5', color: '#991B1B' }}
                  disabled={busy !== null || settings.isHomePage}
                  title={settings.isHomePage
                    ? 'This is your home page. Make a different page your home page first.'
                    : undefined}
                  onClick={onTrash}
                >
                  {busy === 'trash' ? 'Deleting…' : `Delete this ${settings.type === 'post' ? 'post' : 'page'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
