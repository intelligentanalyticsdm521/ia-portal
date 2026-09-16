/**
 * builder/adapters/email/EmailBuilder.tsx — the EMAIL adapter.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, step 4. This is the whole of "what an
 * email is"; the engine (BuilderShell, Canvas, Inspector, SectionGallery)
 * knows none of it and is not changed to learn it:
 *
 *   · the subject line and the preview line, which live above the canvas
 *     because they are not part of the page
 *   · a real contact to preview against, so merge tags are seen FILLED
 *   · Products & Services, for the product card's price and cadence
 *   · the business's own website, as a source of articles
 *   · the brand kit, for the masthead, the swatches and the accent
 *   · a test send to yourself, through the path the real send uses
 *
 * ── ONE BUILDER, THREE DOORS ──────────────────────────────────────────────
 * The Newsletter Studio opens it on an issue; the campaign composer's "Design
 * this in the builder" opens it on a campaign; the template editor will open it
 * on a template. Each hands in a row and takes back `{ document_json,
 * content_html, content_text }`. There is no second email builder, which is
 * §7's whole instruction for campaigns.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Globe, Loader2, Mail, Send, ShoppingBag, Tag, Wand2 } from "lucide-react";
import { IadmModal, IadmButton } from "../../../components/IadmModal";
import { useBrandKit } from "../../../brand/BrandKitProvider";
import { apiErrorMessage } from "../../../lib/apiErrorMessage";
import { BuilderShell } from "../../BuilderShell";
import {
  addWidget, makeWidget, setPropPath, patchWidget,
  type BuilderDocument, type Widget,
} from "../../model";
import { unfilledTokens } from "../../merge";
import type { RenderContext } from "../../render";
import {
  makeEmailContext, renderEmailSection, checkEmailSafe, EMAIL_WIDTH,
  type EmailBusiness, type EmailRenderContext,
} from "./emailRender";
import {
  EMAIL_TEMPLATES, EMAIL_PREMADE_SECTIONS, EMAIL_PREMADE_TAGS,
  emailTemplateByKey, startingEmail, applyEmailBrand, ensureFooter,
  withArticleCount, withProductCount,
} from "./emailTemplates";
import {
  openEmailDocument, toEmailWire, articlesFromPosts,
  type EmailRowLike, type EmailWire, type WebsitePost,
} from "./emailDoc";
// THE catalogue readers, the ones the proposal builder already uses. A second
// reading of "what does this cost and how is it billed" is how a price ends up
// saying one thing on a proposal and another in an email.
import {
  buildPick, type CatalogOffering, type CatalogPrice,
} from "../../../components/oliver/ProposalCatalogPicker";

/* ══════════════════════════════════════════════════════════════════════════
   What the adapter is handed
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailApi {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
}

export interface EmailSaveResult {
  subject: string;
  preheader: string;
  title: string;
}

export interface EmailBuilderProps {
  open: boolean;
  onClose: () => void;
  /** SPARK (LUMEN) — newsletters, contacts, the website proxy, the identity. */
  api: EmailApi;
  /** OLIVER — Products & Services. Optional: a tenant without it loses the picker, not the builder. */
  catalogApi?: EmailApi | null;
  eyebrow: string;
  /** What is being edited, in whatever shape the row is in. */
  row?: EmailRowLike | null;
  /** The name of the thing, shown at the top and saved with it. */
  title?: string;
  titlePlaceholder?: string;
  initialSubject?: string;
  initialPreheader?: string;
  /**
   * Written by whoever owns the row. Given the model AND the rendered body.
   *
   * The return value is ignored here — an owner that has something useful to
   * hand back (the id of the row it just created) is free to, and its own
   * test-send path is where that matters.
   */
  onSave: (wire: EmailWire, meta: EmailSaveResult) => Promise<unknown>;
  /** Present when this surface can send a test. Answers a sentence to show. */
  onTestSend?: (
    wire: EmailWire,
    meta: EmailSaveResult,
    toAddress: string,
    /** Whose details the test should fill in — the contact being previewed. */
    previewContactId: string | null,
  ) => Promise<string>;
  /** Extra buttons in the header — "Publish to site", "Create send". */
  extraActions?: ReactNode;
  /** The word for the Save button. */
  saveLabel?: string;
}

interface ContactRow {
  id?: number; contact_id?: string;
  first_name?: string; last_name?: string; email?: string; company?: string;
}

const rows = <T,>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? r?.items ?? []);

/* ══════════════════════════════════════════════════════════════════════════
   The component
   ══════════════════════════════════════════════════════════════════════════ */

export function EmailBuilder(p: EmailBuilderProps) {
  const { kit } = useBrandKit();

  const [doc, setDoc] = useState<BuilderDocument>(() => startingEmail({ name: "" }, kit.colours.primary));
  const [resetKey, setResetKey] = useState(0);
  const [picking, setPicking] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState(p.title || "");
  const [subject, setSubject] = useState(p.initialSubject || "");
  const [preheader, setPreheader] = useState(p.initialPreheader || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  /* ── The business, for the masthead and the footer ─────────────────────── */
  const [identity, setIdentity] = useState<EmailBusiness>({ name: "" });

  /* ── The material the widgets pull from ────────────────────────────────── */
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [posts, setPosts] = useState<WebsitePost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [previewId, setPreviewId] = useState<string>("");
  const [testTo, setTestTo] = useState("");

  const subjectRef = useRef<HTMLInputElement>(null);
  const openedFor = useRef<string | null>(null);

  /* ── Load once ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!p.open) return;
    p.api.get<any>("/api/v1/email-builder/identity")
      .then((r) => {
        const d = r?.data ?? r;
        setIdentity({
          name: d?.name || "", address: d?.address || "",
          logoUrl: d?.logo_url || null, website: d?.website || null,
          social: Array.isArray(d?.social) ? d.social : [],
        });
      })
      .catch(() => setIdentity({ name: "" }));
    p.api.get<any>("/api/v1/contacts?per_page=25")
      .then((r) => setContacts(rows<ContactRow>(r).filter((c) => c.email)))
      .catch(() => setContacts([]));
    p.catalogApi?.get<any>("/catalog/offerings?include_prices=1")
      .then((r) => setOfferings(rows<CatalogOffering>(r)))
      .catch(() => setOfferings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);

  /* ── Open the row ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!p.open) { openedFor.current = null; return; }
    const key = JSON.stringify([p.title, !!p.row]);
    if (openedFor.current === key) return;
    openedFor.current = key;
    setTitle(p.title || "");
    setSubject(p.initialSubject || "");
    setPreheader(p.initialPreheader || "");
    setErr(null); setSaid(null);

    const hasBody = !!(p.row && (p.row.document_json || p.row.blocks_json || String(p.row.content_html || "").trim()));
    if (!hasBody) { setPicking(true); return; }
    const opened = openEmailDocument(p.row, identity, kit.colours.primary);
    setDoc(applyEmailBrand(opened.doc, brandDefaults(kit)));
    setNote(opened.note);
    setResetKey((k) => k + 1);
    setPicking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.row, p.title]);

  /* ── The one render context ────────────────────────────────────────────── */
  const previewContact = useMemo(
    () => contacts.find((c) => String(c.id ?? c.contact_id) === previewId) || contacts[0] || null,
    [contacts, previewId]);

  const merge = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    const put = (k: string, v?: string | null) => { if (v && String(v).trim()) m[k] = String(v); };
    const first = previewContact?.first_name || "";
    const last = previewContact?.last_name || "";
    // Both spellings, because the picker writes the friendly one and an older
    // template may hold the schema one. merge.lookup takes either.
    put("first name", first); put("contact.first_name", first);
    put("last name", last); put("contact.last_name", last);
    put("full name", [first, last].filter(Boolean).join(" "));
    put("email", previewContact?.email); put("contact.email", previewContact?.email);
    put("company", previewContact?.company);
    put("business name", identity.name); put("tenant.business_name", identity.name);
    put("website", identity.website || ""); put("address", identity.address || "");
    return m;
  }, [previewContact, identity]);

  const emailCtx = useMemo<EmailRenderContext>(() => makeEmailContext(doc, {
    mode: "edit",
    merge,
    accent: doc.settings.accent || kit.colours.primary,
    ink: kit.colours.text,
    paper: kit.colours.background,
    headingFont: doc.settings.headingFont || kit.fonts.heading,
    bodyFont: doc.settings.bodyFont || kit.fonts.body,
    business: identity,
    // A placeholder in the builder on purpose: the real link is per recipient
    // and LUMEN mints it at send time. It is never blank, so what the author
    // sees is the shape of the real footer.
    unsubscribeUrl: "https://example.invalid/unsubscribe",
    preferencesUrl: "https://example.invalid/preferences",
  }), [doc, merge, kit, identity]);

  /** The shell's RenderContext type is the document one; the email canvas uses
   *  its own. They are handed through unchanged — Canvas only passes it back to
   *  the renderer it was given. */
  const shellCtx = emailCtx as unknown as RenderContext;

  /* ── What is not ready to send ─────────────────────────────────────────── */
  const wire = useCallback((): EmailWire => toEmailWire(
    doc,
    { ...emailCtx, mode: "view" },
    { subject, preheader },
  ), [doc, emailCtx, subject, preheader]);

  const blanks = useMemo(() => {
    const texts: string[] = [subject, preheader];
    const walk = (v: unknown) => {
      if (typeof v === "string") texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const s of doc.sections) if (s.visibility === "customer") for (const c of s.columns) for (const w of c.widgets) walk(w.props);
    return unfilledTokens(texts, merge);
  }, [doc, subject, preheader, merge]);

  const unsafe = useMemo(() => {
    try { return checkEmailSafe(wire().content_html); } catch { return []; }
  }, [wire]);

  /* ── Starting points ───────────────────────────────────────────────────── */
  const start = useCallback((key: string | null, counts: { articles: number; products: number }) => {
    const accent = kit.colours.primary;
    const t = key ? emailTemplateByKey(key) : null;
    let built = t ? t.build(identity, accent) : startingEmail(identity, accent);
    if (t?.askArticles) built = withArticleCount(built, counts.articles);
    if (t?.askProducts) built = withProductCount(built, counts.products);
    setDoc(applyEmailBrand(ensureFooter(built, identity), brandDefaults(kit)));
    if (t && !subject.trim()) setSubject(t.subject);
    if (t && !preheader.trim()) setPreheader(t.preheader);
    if (t && !title.trim()) setTitle(t.name);
    setNote(null);
    setResetKey((k) => k + 1);
    setPicking(false);
  }, [identity, kit, preheader, subject, title]);

  /* ── Saving and testing ────────────────────────────────────────────────── */
  const meta = (): EmailSaveResult => ({ subject: subject.trim(), preheader: preheader.trim(), title: title.trim() });

  async function save() {
    if (!title.trim()) { setErr("Give it a name at the top first."); return; }
    setBusy(true); setErr(null); setSaid(null);
    try {
      await p.onSave(wire(), meta());
      setSaid("Saved.");
    } catch (e) { setErr(`Could not save: ${apiErrorMessage(e)}`); }
    finally { setBusy(false); }
  }

  async function testSend() {
    const to = testTo.trim();
    if (!p.onTestSend) return;
    if (!to) { setErr("Type the address to send the test to."); return; }
    if (!subject.trim()) { setErr("A test send needs a subject line."); return; }
    setBusy(true); setErr(null); setSaid(null);
    try { setSaid(await p.onTestSend(wire(), meta(), to, previewContact ? String(previewContact.id ?? previewContact.contact_id) : null)); }
    catch (e) { setErr(`Could not send the test: ${apiErrorMessage(e)}`); }
    finally { setBusy(false); }
  }

  /* ── The website, as a widget source ───────────────────────────────────── */
  const loadPosts = useCallback(async () => {
    setPostsError(null);
    try {
      const r = await p.api.get<any>("/api/v1/newsletters/wp-posts?limit=25");
      setPosts((r?.posts || []) as WebsitePost[]);
    } catch (e) {
      // The proxy's own codes, said in words. An unreachable website is not a
      // broken builder — the author types the articles instead.
      const raw = apiErrorMessage(e);
      setPosts([]);
      setPostsError(/no_arion_site|404/i.test(raw)
        ? "No website is connected to this business yet, so there is nothing to bring in. Type the articles here instead."
        : `Could not reach your website: ${raw}`);
    }
  }, [p.api]);

  if (!p.open) return null;

  if (picking) {
    return (
      <StartFrom
        business={identity}
        onPick={start}
        onClose={p.onClose}
      />
    );
  }

  return (
    <BuilderShell
      open
      onClose={p.onClose}
      adapter="email"
      resetKey={resetKey}
      eyebrow={p.eyebrow}
      doc={doc}
      onChange={setDoc}
      ctx={shellCtx}
      renderSection={renderEmailSection as unknown as (s: any, ctx: RenderContext) => string}
      canvasCss={CANVAS_EMAIL_CSS}
      paperWidth={EMAIL_WIDTH}
      canvasBackground="#E2E8F0"
      paper={kit.colours.background}
      canvasHint="Click anything to edit it. This is exactly what lands in the inbox."
      paperNote={`${EMAIL_WIDTH}px wide`}
      premade={EMAIL_PREMADE_SECTIONS}
      premadeTags={EMAIL_PREMADE_TAGS}
      swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
      fonts={kit.fonts.catalog.map((f) => f.value)}
      title={
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={p.titlePlaceholder || "Name this email — only you see this"}
          title="What this is called on your list. The recipient never sees it."
          style={titleInput}
        />
      }
      subtitle={
        <SubjectBar
          subject={subject} onSubject={setSubject} subjectRef={subjectRef}
          preheader={preheader} onPreheader={setPreheader}
          contacts={contacts} previewId={previewId} onPreview={setPreviewId}
        />
      }
      headerActions={
        <>
          {p.extraActions}
          {p.onTestSend && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                title="Send yourself this exact email, through the same path a real send uses"
                style={{ ...titleInput, minWidth: 180, fontSize: 12, fontWeight: 400 }}
              />
              <button type="button" onClick={testSend} disabled={busy} style={ghostBtn}
                title="Send a test to that address. It goes out exactly as a real send would.">
                {busy ? <Loader2 size={13} /> : <Send size={13} />} Send a test
              </button>
            </span>
          )}
          <button type="button" onClick={save} disabled={busy} style={orangeBtn}
            title="Save the email. You can come back to it.">
            {busy ? "Working…" : (p.saveLabel || "Save")}
          </button>
        </>
      }
      paneHeader={
        <PaneHeader
          note={note} err={err} said={said}
          blanks={blanks} unsafe={unsafe}
          previewName={previewContact ? [previewContact.first_name, previewContact.last_name].filter(Boolean).join(" ") || previewContact.email || "" : null}
        />
      }
      widgetExtras={(w, sectionId) => (
        <WidgetExtras
          widget={w}
          sectionId={sectionId}
          doc={doc}
          onChange={setDoc}
          offerings={offerings}
          posts={posts}
          postsError={postsError}
          onLoadPosts={loadPosts}
          identity={identity}
        />
      )}
    />
  );
}

function brandDefaults(kit: { colours: { primary: string }; fonts: { heading: string; body: string } }) {
  return { accent: kit.colours.primary, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body };
}

/* ══════════════════════════════════════════════════════════════════════════
   The starting screen — never a blank canvas
   ══════════════════════════════════════════════════════════════════════════ */

function StartFrom({
  business, onPick, onClose,
}: {
  business: EmailBusiness;
  onPick: (key: string | null, counts: { articles: number; products: number }) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [articles, setArticles] = useState(3);
  const [products, setProducts] = useState(2);
  const t = chosen ? emailTemplateByKey(chosen) : null;

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · Email builder"
      title="Start from a shape that already works"
      subtitle="Every one of these opens with your logo at the top and your unsubscribe footer at the bottom. Change anything on it."
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton variant="ghost" onClick={() => onPick(null, { articles, products })}
            title="A masthead, a note from you, and the footer. The smallest email it is legal to send.">
            Just the basics
          </IadmButton>
          <IadmButton
            variant="accent" product="spark"
            disabled={!t}
            title={t ? `Build “${t.name}”` : "Choose one first"}
            onClick={() => onPick(chosen, { articles, products })}
          >
            {t ? `Build “${t.name}”` : "Choose one"}
          </IadmButton>
        </>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          {EMAIL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              title={`${tpl.name} — ${tpl.description}`}
              onClick={() => setChosen(tpl.key)}
              style={{
                textAlign: "left", background: "#fff", borderRadius: 10, padding: 0, cursor: "pointer", overflow: "hidden",
                border: "1px solid " + (chosen === tpl.key ? "#0C4A60" : "#E2E8F0"),
                boxShadow: chosen === tpl.key ? "0 8px 24px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <TemplateThumb kind={tpl.key} />
              <span style={{ display: "block", padding: "10px 12px" }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{tpl.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", lineHeight: 1.35, marginTop: 3 }}>{tpl.description}</span>
              </span>
            </button>
          ))}
        </div>

        {/* The guided count, asked ONCE, in words, before anything is built. */}
        {t?.askArticles && (
          <Ask label="How many articles?" value={articles} min={1} max={8} onChange={setArticles}
            help="You can add or remove one at any time." />
        )}
        {t?.askProducts && (
          <Ask label="How many products?" value={products} min={1} max={4} onChange={setProducts}
            help="Each one pulls its price and how it is billed from Products & Services." />
        )}

        <div style={{ fontSize: 11, color: "#5A7A8A", borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
          {business.name
            ? <>The masthead will show <strong>{business.name}</strong>{business.logoUrl ? " and your logo" : ""}, and the footer your address and unsubscribe link.</>
            : <>Fill in your business profile and this will open with your own logo and address already on it.</>}
        </div>
      </div>
    </IadmModal>
  );
}

function Ask({ label, value, min, max, onChange, help }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void; help: string;
}) {
  return (
    <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button key={n} type="button" title={`${n}`} onClick={() => onChange(n)}
            style={{
              width: 32, height: 32, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (value === n ? "#0C4A60" : "#CBD5E1"),
              background: value === n ? "#0C4A60" : "#fff", color: value === n ? "#fff" : "#334155",
            }}>{n}</button>
        ))}
        <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 6 }}>{help}</span>
      </div>
    </div>
  );
}

/** A drawing of the shape each template makes. */
function TemplateThumb({ kind }: { kind: string }) {
  const bar = (w: string, h = 6, bg = "#E2E8F0") => <div style={{ height: h, width: w, background: bg, borderRadius: 2 }} />;
  const wrap: React.CSSProperties = { height: 108, background: "#F2F6F9", padding: 12, display: "flex", flexDirection: "column", gap: 5 };
  const foot = <div style={{ marginTop: "auto", height: 8, background: "#CBD5E1", borderRadius: 2 }} />;
  switch (kind) {
    case "monthly_update":
      return <div style={wrap}><div style={{ height: 10, width: 34, background: "#0B1C24", borderRadius: 2, margin: "0 auto" }} />
        {bar("70%", 8, "#CBD5E1")}
        <div style={{ display: "flex", gap: 5 }}><div style={{ width: 22, height: 18, background: "#94A3B8", borderRadius: 2 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>{bar("100%", 4)}{bar("80%", 4)}</div></div>
        <div style={{ display: "flex", gap: 5 }}><div style={{ width: 22, height: 18, background: "#94A3B8", borderRadius: 2 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>{bar("100%", 4)}{bar("60%", 4)}</div></div>
        {foot}</div>;
    case "promo":
      return <div style={wrap}><div style={{ height: 10, width: 34, background: "#0B1C24", borderRadius: 2, margin: "0 auto" }} />
        {bar("80%", 10, "#CBD5E1")}
        <div style={{ height: 12, width: "45%", background: "#EF6C33", borderRadius: 999, margin: "2px auto" }} />
        <div style={{ display: "flex", gap: 5 }}>
          <div style={{ flex: 1, height: 24, border: "1px solid #CBD5E1", borderRadius: 3, background: "#fff" }} />
          <div style={{ flex: 1, height: 24, border: "1px solid #CBD5E1", borderRadius: 3, background: "#fff" }} /></div>
        {foot}</div>;
    case "event":
      return <div style={wrap}><div style={{ height: 10, width: 34, background: "#0B1C24", borderRadius: 2, margin: "0 auto" }} />
        {bar("70%", 9, "#CBD5E1")}
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 16, border: "1px solid #0C4A60", borderRadius: 3 }} />)}</div>
        {bar("100%", 4)}{bar("80%", 4)}
        {foot}</div>;
    default:
      return <div style={wrap}><div style={{ height: 10, width: 34, background: "#0B1C24", borderRadius: 2, margin: "0 auto" }} />
        {bar("60%", 9, "#CBD5E1")}{bar("100%", 4)}{bar("100%", 4)}{bar("40%", 4)}
        {foot}</div>;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   The subject line, which is not part of the page
   ══════════════════════════════════════════════════════════════════════════ */

function SubjectBar({
  subject, onSubject, subjectRef, preheader, onPreheader, contacts, previewId, onPreview,
}: {
  subject: string; onSubject: (v: string) => void;
  subjectRef: React.RefObject<HTMLInputElement>;
  preheader: string; onPreheader: (v: string) => void;
  contacts: ContactRow[]; previewId: string; onPreview: (id: string) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Mail size={12} />
        <input
          ref={subjectRef}
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
          placeholder="Subject line — this is what they see first"
          title="The subject line. Merge tags work here too: {{first name}}"
          style={{ ...barInput, minWidth: 320 }}
        />
      </span>
      <input
        value={preheader}
        onChange={(e) => onPreheader(e.target.value)}
        placeholder="Preview line (optional)"
        title="The grey line some mail apps show beside the subject."
        style={{ ...barInput, minWidth: 220 }}
      />
      {contacts.length > 0 && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          title="Choose a real contact and every personal detail on the page fills in with THEIR information, so you see what they will see.">
          <Tag size={12} />
          <select
            value={previewId}
            onChange={(e) => onPreview(e.target.value)}
            style={{ ...barInput, minWidth: 180 }}
          >
            <option value="">Previewing as the first contact</option>
            {contacts.map((c) => (
              <option key={String(c.id ?? c.contact_id)} value={String(c.id ?? c.contact_id)}>
                {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
              </option>
            ))}
          </select>
        </label>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The pane header — what is not ready
   ══════════════════════════════════════════════════════════════════════════ */

function PaneHeader({ note, err, said, blanks, unsafe, previewName }: {
  note: string | null; err: string | null; said: string | null;
  blanks: string[]; unsafe: Array<{ rule: string; detail: string }>; previewName: string | null;
}) {
  return (
    <div style={{ fontSize: 11, lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 6 }}>
      {previewName && (
        <div style={{ color: "#5A7A8A" }}>
          Showing it as <strong style={{ color: "#0B1C24" }}>{previewName}</strong> will see it.
        </div>
      )}
      {note && <div style={{ color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 4, padding: "6px 8px" }}>{note}</div>}
      {blanks.length > 0 && (
        <div style={{ color: "#B45309" }} title={blanks.join(", ")}>
          {blanks.length} personal detail{blanks.length === 1 ? "" : "s"} could not be filled in for this contact: {blanks.slice(0, 3).join(", ")}
          {blanks.length > 3 ? "…" : ""}
        </div>
      )}
      {unsafe.length > 0 && (
        <div style={{ color: "#B91C1C" }} title={unsafe.map((u) => u.detail).join("\n")}>
          {unsafe.length} thing{unsafe.length === 1 ? "" : "s"} a mail app would render badly: {unsafe[0].detail}
        </div>
      )}
      {err && <div style={{ color: "#B91C1C" }}>{err}</div>}
      {said && <div style={{ color: "#047857" }}>{said}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The panels that know where a widget's content comes from
   ══════════════════════════════════════════════════════════════════════════ */

function WidgetExtras({
  widget, sectionId, doc, onChange, offerings, posts, postsError, onLoadPosts, identity,
}: {
  widget: Widget; sectionId: string; doc: BuilderDocument;
  onChange: (d: BuilderDocument) => void;
  offerings: CatalogOffering[];
  posts: WebsitePost[] | null; postsError: string | null; onLoadPosts: () => Promise<void>;
  identity: EmailBusiness;
}) {
  const path = useMemo(() => {
    for (const s of doc.sections) {
      if (s.id !== sectionId) continue;
      for (let c = 0; c < s.columns.length; c++) {
        const i = s.columns[c].widgets.findIndex((w) => w.id === widget.id);
        if (i >= 0) return { sectionId, columnIndex: c, widgetIndex: i };
      }
    }
    return null;
  }, [doc, sectionId, widget.id]);

  const setProps = (props: Record<string, unknown>) => { if (path) onChange(patchWidget(doc, path, props)); };
  const setAt = (dotted: string, value: unknown) => {
    if (path) onChange(patchWidget(doc, path, setPropPath(widget.props, dotted, value)));
  };

  if (widget.kind === "article_card") {
    return (
      <FromTheWebsite
        items={(widget.props as any).items || []}
        posts={posts}
        error={postsError}
        onLoad={onLoadPosts}
        onUse={(chosen) => {
          const existing: any[] = Array.isArray((widget.props as any).items) ? (widget.props as any).items : [];
          const brought = articlesFromPosts(chosen);
          // Fill the EMPTY slots first, then grow. An author who answered
          // "three" and picked two gets three slots, two of them filled.
          const next = [...existing];
          let k = 0;
          for (let i = 0; i < next.length && k < brought.length; i++) {
            if (!String(next[i]?.title || "").trim()) next[i] = brought[k++];
          }
          while (k < brought.length) next.push(brought[k++]);
          setProps({ items: next });
        }}
      />
    );
  }

  if (widget.kind === "product_card") {
    return (
      <FromTheCatalogue
        offerings={offerings}
        items={(widget.props as any).items || []}
        onUse={(picked) => {
          const existing: any[] = Array.isArray((widget.props as any).items) ? (widget.props as any).items : [];
          const next = [...existing];
          let placed = false;
          for (let i = 0; i < next.length; i++) {
            if (!String(next[i]?.name || "").trim()) { next[i] = picked; placed = true; break; }
          }
          if (!placed) next.push(picked);
          setProps({ items: next });
        }}
      />
    );
  }

  if (widget.kind === "email_footer") {
    const address = String((widget.props as any).address || "");
    return (
      <div style={panel}>
        <div style={panelTitle}>Your postal address</div>
        <input
          value={address}
          onChange={(e) => setProps({ address: e.target.value })}
          placeholder="123 Main St, Marshalltown, IA 50158"
          title="A real postal address is required on every marketing email."
          style={panelInput}
        />
        {identity.address && identity.address !== address && (
          <button type="button" style={miniBtn} title={`Use ${identity.address}`}
            onClick={() => setProps({ address: identity.address })}>
            Use the address on your business profile
          </button>
        )}
        {!address.trim() && (
          <div style={{ fontSize: 10, color: "#B45309" }}>
            The law asks for this on every marketing email. It goes in the footer, in small grey type.
          </div>
        )}
      </div>
    );
  }

  if (widget.kind === "image" || widget.kind === "hero") {
    const key = widget.kind === "hero" ? "image" : "src";
    const alt = String((widget.props as any).alt || "");
    return (
      <div style={panel}>
        <div style={panelTitle}>Picture</div>
        <input
          value={String((widget.props as any)[key] || "")}
          onChange={(e) => setProps({ [key]: e.target.value })}
          placeholder="Paste the picture's address"
          style={panelInput}
        />
        <input
          value={alt}
          onChange={(e) => setProps({ alt: e.target.value })}
          placeholder="Describe the picture"
          title="Read aloud by screen readers, and shown instead of the picture when a mail app blocks images — which most do by default."
          style={panelInput}
        />
        {!alt.trim() && (
          <div style={{ fontSize: 10, color: "#B45309" }}>
            Most mail apps block pictures until the reader asks for them. Without a description they see nothing here.
          </div>
        )}
      </div>
    );
  }

  if (widget.kind === "personal_note") {
    return (
      <div style={panel}>
        <div style={panelTitle}>Greet them by name</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[["{{first name}}", "First name"], ["{{full name}}", "Full name"], ["{{company}}", "Company"]].map(([token, label]) => (
            <button key={token} type="button" style={miniBtn} title={`Put ${label.toLowerCase()} in the greeting`}
              onClick={() => setAt("greeting", `${String((widget.props as any).greeting || "").replace(/,\s*$/, "")} ${token},`.trim())}>
              + {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#94A3B8" }}>
          Each person sees their own. Choose a contact at the top to see it filled in.
        </div>
      </div>
    );
  }

  return null;
}

function FromTheWebsite({ items, posts, error, onLoad, onUse }: {
  items: any[]; posts: WebsitePost[] | null; error: string | null;
  onLoad: () => Promise<void>; onUse: (posts: WebsitePost[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const empty = items.filter((a) => !String(a?.title || "").trim()).length;

  return (
    <div style={panel}>
      <div style={panelTitle}>From your website</div>
      {posts === null ? (
        <button type="button" style={miniBtn} disabled={busy}
          title="Look at the posts on your own website and bring some in as articles"
          onClick={async () => { setBusy(true); await onLoad(); setBusy(false); }}>
          <Globe size={11} /> {busy ? "Looking…" : "Show my posts"}
        </button>
      ) : error ? (
        <div style={{ fontSize: 10, color: "#B45309" }}>{error}</div>
      ) : posts.length === 0 ? (
        <div style={{ fontSize: 10, color: "#94A3B8" }}>No posts found on your website.</div>
      ) : (
        <>
          <div style={{ maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {posts.map((post) => {
              const on = picked.has(post.post_id);
              return (
                <button key={post.post_id} type="button" title={post.title}
                  onClick={() => setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(post.post_id)) n.delete(post.post_id); else n.add(post.post_id);
                    return n;
                  })}
                  style={{
                    textAlign: "left", fontSize: 11, padding: "5px 7px", borderRadius: 4, cursor: "pointer",
                    border: "1px solid " + (on ? "#0C4A60" : "#E2E8F0"),
                    background: on ? "#EFF6FF" : "#fff",
                  }}>
                  <span style={{ fontWeight: 600, display: "block" }}>{post.title}</span>
                  <span style={{ color: "#94A3B8" }}>{(post.excerpt || "").replace(/<[^>]*>/g, "").slice(0, 60)}</span>
                </button>
              );
            })}
          </div>
          <button type="button" style={{ ...miniBtn, background: "#0C4A60", color: "#fff", borderColor: "#0C4A60" }}
            disabled={!picked.size}
            title={picked.size ? `Put ${picked.size} of them on the page` : "Choose one first"}
            onClick={() => { onUse(posts.filter((x) => picked.has(x.post_id))); setPicked(new Set()); }}>
            Use {picked.size || ""} {picked.size === 1 ? "article" : "articles"}
          </button>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>
            {empty ? `${empty} empty slot${empty === 1 ? "" : "s"} will be filled first.` : "They are added after the ones already here."}
          </div>
        </>
      )}
    </div>
  );
}

function FromTheCatalogue({ offerings, items, onUse }: {
  offerings: CatalogOffering[]; items: any[];
  onUse: (item: Record<string, unknown>) => void;
}) {
  if (!offerings.length) {
    return (
      <div style={panel}>
        <div style={panelTitle}>From Products &amp; Services</div>
        <div style={{ fontSize: 10, color: "#94A3B8" }}>
          Nothing in your catalogue yet. Add what you sell in Products &amp; Services and it will be one click from here.
        </div>
      </div>
    );
  }
  const empty = items.filter((x) => !String(x?.name || "").trim()).length;
  return (
    <div style={panel}>
      <div style={panelTitle}>From Products &amp; Services</div>
      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {offerings.slice(0, 40).map((o) => {
          // buildPick, the SAME reader the proposal builder uses. It knows that
          // `unit_amount` is DOLLARS (not cents), that a price's own label is
          // the distinguishing detail between tiers of one service, and what
          // the catalogue's word for the billing basis is. A second reading of
          // those three columns is how a price says one thing on a proposal and
          // another in an email.
          const price = pickDefaultPrice(o);
          const { parts } = buildPick(o, price);
          const money = formatMoney(parts.unit_price);
          const cadence = parts.cadence || (price?.label ? String(price.label) : "");
          return (
            <button key={String(o.offering_id || o.name)} type="button"
              title={`Put “${parts.name}” on the page${money ? ` at ${money}${cadence ? ` ${cadence}` : ""}` : ""}`}
              onClick={() => onUse({
                name: parts.name,
                blurb: String(parts.description || "").slice(0, 160),
                price: money,
                // The catalogue's OWN word for how it is billed. A price with no
                // basis beside it is the thing a customer reads wrong.
                cadence,
                image: "", alt: "", url: "", ctaLabel: "",
              })}
              style={{
                textAlign: "left", fontSize: 11, padding: "5px 7px", borderRadius: 4,
                border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer",
                display: "flex", justifyContent: "space-between", gap: 8,
              }}>
              <span style={{ fontWeight: 600 }}>{parts.name}</span>
              <span style={{ color: "#5A7A8A", whiteSpace: "nowrap" }}>
                {money}{cadence ? <span style={{ color: "#94A3B8" }}> {cadence}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#94A3B8" }}>
        <ShoppingBag size={10} style={{ verticalAlign: -1 }} />{" "}
        {empty ? `${empty} empty card${empty === 1 ? "" : "s"} will be filled first.` : "Adds a card at the end."}
      </div>
    </div>
  );
}

/**
 * The price to show, of however many a service carries.
 *
 * The one the business marked default, else the first. Never a made-up
 * "cheapest" — an email that quietly advertises a tier the business did not
 * choose is worse than one that quotes nothing.
 */
function pickDefaultPrice(o: CatalogOffering): CatalogPrice | null {
  const list = Array.isArray(o.prices) ? o.prices : [];
  return list.find((x) => x.is_default) || list[0] || null;
}

/** Dollars. The catalogue stores unit_amount in DOLLARS, not cents. */
function formatMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Chrome
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The CANVAS's own chrome, and only that.
 *
 * The email itself carries no stylesheet — every style in it is inline,
 * because Gmail strips <style> from a body. These rules exist purely so the
 * empty runs of text on the canvas show their placeholder; none of them
 * reaches a mailbox.
 */
const CANVAS_EMAIL_CSS = `
[data-edit]:empty::before { content: attr(data-placeholder); color: #94A3B8; }
[data-edit]:empty { min-height: 1.3em; display: block; }
[data-kind="email_footer"] { outline: 1px dashed #CBD5E1; outline-offset: 4px; border-radius: 3px; }
[data-locked="1"]::after {
  content: "Required — stays on every send";
  display: block; margin-top: 4px; font: 600 9px/1.4 system-ui, sans-serif;
  letter-spacing: .06em; text-transform: uppercase; color: #B45309; text-align: center;
}
`;

const titleInput: React.CSSProperties = {
  background: "transparent", border: "none", borderBottom: "1px dashed rgba(255,255,255,0.35)",
  color: "#fff", fontSize: 15, fontWeight: 600, outline: "none", minWidth: 320, padding: "0 0 2px",
};

const barInput: React.CSSProperties = {
  background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.25)", padding: "3px 10px", fontSize: 11, outline: "none",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,0.3)",
  background: "transparent", color: "#fff", borderRadius: 4, padding: "5px 10px",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};

const orangeBtn: React.CSSProperties = {
  ...ghostBtn, background: "#EF6C33", borderColor: "#EF6C33",
};

const panel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6,
  border: "1px solid #E2E8F0", borderRadius: 6, padding: 10, background: "#F8FAFC",
};

const panelTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};

const panelInput: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 4, padding: "5px 7px", fontSize: 11, background: "#fff", width: "100%",
};

const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #CBD5E1", background: "#fff",
  borderRadius: 4, padding: "4px 8px", fontSize: 10, fontWeight: 600, color: "#334155", cursor: "pointer",
};

export { Wand2, addWidget, makeWidget };
export default EmailBuilder;
