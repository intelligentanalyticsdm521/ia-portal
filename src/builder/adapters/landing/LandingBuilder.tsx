/**
 * builder/adapters/landing/LandingBuilder.tsx — the LANDING PAGE adapter.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7. It is the same canvas, the same widget
 * pane, the same inspector and the same gallery as the proposal and the email
 * builders — with the WEB widget set and the web renderer.
 *
 * ── IT REPLACES THE STACKED-CARD EDITOR ───────────────────────────────────
 * `SparkLandingPageEditor` — five fixed kinds, up-and-down arrows, a form of
 * text boxes with no picture of the page anywhere — is DELETED in the same
 * pass, along with the copy of the page renderer that lived in LUMEN's route.
 * Same route, same list, same row click. Replace means delete.
 *
 * ── THE ARION NOTE ────────────────────────────────────────────────────────
 * §7's first sentence about landing pages: "With ARION: it is a website page,
 * built in the website builder and published on their site." A business that
 * HAS a website with us is told so, here, with the link — because building the
 * same page twice in two builders is the duplication this rebuild exists to
 * delete, and the only moment that advice is useful is the moment they open
 * this.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, Globe, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { IadmModal, IadmButton } from "../../../components/IadmModal";
import { useBrandKit } from "../../../brand/BrandKitProvider";
import { apiErrorMessage } from "../../../lib/apiErrorMessage";
import { BuilderShell } from "../../BuilderShell";
import { TemplateLibrary } from "../../TemplateLibrary";
import { patchNode, setPropPath, walkWidgets, type BuilderDocument, type Widget } from "../../model";
import type { RenderContext } from "../../render";
import {
  renderLandingSection, makeLandingContext, embedSnippet, openLandingDocument,
  LANDING_CSS, FORM_FIELDS, defaultFormFields, type LandingContext,
} from "./landingRender";
import {
  LANDING_TEMPLATES, LANDING_PREMADE_SECTIONS, LANDING_PREMADE_TAGS, landingLibrary,
  landingTemplateByKey, applyLandingBrand, type LandingBusiness,
} from "./landingTemplates";

export interface LandingApi {
  get: <T>(p: string) => Promise<T>;
  put: <T>(p: string, body: unknown) => Promise<T>;
}

export interface LandingPageRow {
  id: number;
  slug: string;
  name: string;
  title: string | null;
  status: string;
  published_url: string | null;
  blocks_json?: unknown;
  theme_json?: unknown;
  meta_description?: string | null;
}

export interface LandingBuilderProps {
  open: boolean;
  onClose: () => void;
  api: LandingApi;
  page: LandingPageRow | null;
  /** Answered after a save, so the list refreshes. */
  onSaved: (message: string) => void;
  /** Present when this business has an ARION website. §7's first sentence. */
  arionSitePath?: string | null;
}

export function LandingBuilder(p: LandingBuilderProps) {
  const { kit } = useBrandKit();
  const [doc, setDoc] = useState<BuilderDocument | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  /* IS ANYTHING SELECTED? (D-165 §11.13.1) Page settings are what the right
     panel shows when nothing is. */
  /* No `selected` flag: the Inspector draws page settings only when nothing
     is selected, so this adapter keeps no second copy of the selection. */
  const [copied, setCopied] = useState(false);
  const [business, setBusiness] = useState<LandingBusiness>({ name: "" });
  /**
   * WHAT THE SERVER LAST SAID about this page being live (D-17).
   *
   * The chip used to read `p.page.status`, a prop from the list, which nothing
   * updated after a publish — so it kept saying "Not live yet" about a page
   * that was live. The row the save answers with wins over the prop.
   */
  const [live, setLive] = useState<{ status: string; url: string | null } | null>(null);
  /** Publishing asks first: it is the button that puts this on the internet. */
  const [confirmPublish, setConfirmPublish] = useState(false);
  const openedFor = useRef<number | null>(null);
  /** The current public address, for the clipboard, without a stale closure. */
  const liveUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!p.open) return;
    p.api.get<any>("/api/v1/email-builder/identity")
      .then((r) => {
        const d = r?.data ?? r;
        setBusiness({ name: d?.name || "", address: d?.address || "", email: d?.email || "", phone: d?.phone || "" });
      })
      .catch(() => setBusiness({ name: "" }));
  }, [p.open, p.api]);

  useEffect(() => {
    if (!p.open || !p.page) { openedFor.current = null; return; }
    if (openedFor.current === p.page.id) return;
    openedFor.current = p.page.id;
    setErr(null); setSaid(null); setCopied(false); setLive(null); setConfirmPublish(false);

    const raw = p.page.blocks_json;
    const empty = raw == null
      || (Array.isArray(raw) && raw.length === 0)
      || (typeof raw === "string" && (raw.trim() === "" || raw.trim() === "[]"));
    if (empty) { setDoc(null); setPicking(true); return; }
    setDoc(applyLandingBrand(openLandingDocument(raw, kit.colours.accent), brandDefaults(kit)));
    setPicking(false);
    setResetKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.page]);

  const ctx = useMemo<LandingContext>(() => makeLandingContext(doc || ({ v: 2, settings: {}, sections: [] } as any), {
    mode: "edit",
    merge: {},
    accent: doc?.settings.accent || kit.colours.accent,
    // What the builder SHOWS is where it will really post, so an author can see
    // the page is wired rather than take it on trust.
    formAction: p.page ? `/api/v1/landing/<your business>/${p.page.slug}/submit` : "#",
    hidden: {},
    business,
  }), [doc, kit, p.page, business]);

  /** The library’s list — §11.9. Three shapes, each with a real render. */
  const libraryEntries = useMemo(
    () => landingLibrary(business, kit.colours.accent),
    [business, kit]);

  const start = useCallback((key: string | null) => {
    const accent = kit.colours.accent;
    const t = key ? landingTemplateByKey(key) : null;
    const built = (t || LANDING_TEMPLATES[0]).build(business, accent);
    setDoc(applyLandingBrand(built, brandDefaults(kit)));
    setPicking(false);
    setResetKey((k) => k + 1);
  }, [business, kit]);

  /**
   * SAVE, and PUBLISH.
   *
   * D-17 (BUILDER_USER_TEST_2026-09-16): *"Publish gave no feedback at all — no
   * confirm dialog, no toast, and the header chip still read 'Not live yet'
   * afterwards. It had in fact published."* Three separate failures: no ask
   * before, no answer after, and a chip reading off a prop that nobody
   * refreshed.
   *
   * The server's OWN row is read back and kept here, so the chip says what the
   * database says rather than what this component was handed when it opened.
   * D-36: the builder stays open either way, with a tick.
   */
  async function save(alsoPublish: boolean) {
    if (!p.page || !doc) return;
    setBusy(true); setErr(null); setSaid(null);
    try {
      const r: any = await p.api.put(`/api/v1/landing-pages/${p.page.id}`, {
        blocks_json: doc,
        theme_json: { accent: doc.settings.accent || kit.colours.accent },
        ...(alsoPublish ? { status: "published" } : {}),
      });
      const row = (r?.data ?? r) as LandingPageRow | null;
      if (row && row.id) setLive({ status: String(row.status || ""), url: row.published_url || null });
      p.onSaved(alsoPublish
        ? "Published. The page is live at its address."
        : "Saved. It is not live until you press Publish.");
      setSaid(alsoPublish ? "Published ✓ — anybody with the link can see it now." : "Saved ✓");
    } catch (e) {
      setErr(`Could not save: ${apiErrorMessage(e)}`);
    } finally { setBusy(false); }
  }

  async function copyEmbed() {
    const url = liveUrlRef.current;
    if (!url) return;
    const snippet = embedSnippet(url, { title: p.page?.title || p.page?.name || "Landing page", height: 900 });
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setSaid("Embed code copied. Paste it into any page on a website we do not run.");
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setErr("Your browser would not let us reach the clipboard. Open the page's address and copy it from there.");
    }
  }

  if (!p.open || !p.page) return null;

  if (picking || !doc) {
    return (
      <TemplateLibrary
        eyebrow="SPARK · Landing page"
        open
        onClose={p.onClose}
        product="spark"
        title={`Start ${p.page.name}`}
        subtitle="Each of these opens with a headline, some copy and a form — the shape that actually converts. Pick one and change anything on it."
        entries={libraryEntries}
        onPick={start}
        notice={p.arionSitePath ? (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 12px", fontSize: 12, lineHeight: 1.5 }}>
            <Globe size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            You have a website with us — <strong>build this as a page on your own site instead</strong> and it will live at your own address, with your own navigation around it.
            {" "}
            <Link to={p.arionSitePath} style={{ color: "#1D4ED8", fontWeight: 600 }}>Open the website builder</Link>.
            <div style={{ color: "#475569", marginTop: 4 }}>
              A hosted page here still works, and is the right answer for a one-off campaign you do not want on your site.
            </div>
          </div>
        ) : undefined}
      />
    );
  }
  const status = live?.status || p.page.status;
  const publicUrl = (live ? live.url : p.page.published_url) || null;
  const published = status === "published" && !!publicUrl;
  liveUrlRef.current = publicUrl;

  return (
    <>
    {/* D-17: Publish asks first, and says exactly what happens. The website
        builder's confirm is the model, and this is its wording for a hosted
        page. */}
    {confirmPublish && (
      <IadmModal open onClose={() => setConfirmPublish(false)} product="spark" z={60}
        eyebrow="Publish" title={`Put “${p.page.name}” on the internet?`} size="confirm"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setConfirmPublish(false)}>Not yet</IadmButton>
            <IadmButton variant="accent" product="spark" disabled={busy}
              onClick={() => { setConfirmPublish(false); void save(true); }}>
              {busy ? "Working…" : "Yes, publish it"}
            </IadmButton>
          </>
        }>
        <div style={{ padding: 18, fontSize: 13, lineHeight: 1.55, color: "#334155" }}>
          Everything on the page goes to its own address straight away, where anybody with the link can
          see it. You can keep editing afterwards — press <strong>Save &amp; update live</strong> and the
          change goes out.
        </div>
      </IadmModal>
    )}
    <BuilderShell
      open
      onClose={p.onClose}
      adapter="landing"
      resetKey={resetKey}
      doc={doc}
      onChange={setDoc}
      ctx={ctx as unknown as RenderContext}
      renderSection={renderLandingSection as unknown as (s: any, c: RenderContext) => string}
      canvasCss={LANDING_CSS.replace(/__ACCENT__/g, doc.settings.accent || kit.colours.accent)}
      paperWidth={760}
      canvasBackground="#E2E8F0"
      /* D-30: a landing page is a PAGE. Without this the engine offers "Start a
         new page here (when printed or saved as a PDF)" and calls the fonts
         "the document's own" — a proposal's words in a web builder. */
      copy={{
        noun: "page",
        nounPlural: "pages",
        audience: "the people who land on it",
        paneHeading: "Add to this page",
        paneHint: "Click one to add it where you are, or drag it onto the page.",
        outlineHeading: "This page, top to bottom",
        defaultFontLabel: "This page's own font",
        pageBreakLabel: "",
        emptyHeading: "What goes on this page?",
        emptyHint: "A headline, a reason to care, and a form. Pick one to start.",
      }}
      onSave={() => void save(false)}
      premade={LANDING_PREMADE_SECTIONS}
      premadeTags={LANDING_PREMADE_TAGS}
      swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
      fonts={kit.fonts.catalog.map((f) => f.value)}
      title={<span style={{ fontSize: 15, fontWeight: 600 }}>{p.page.name}</span>}
      headerActions={
        <>
          {published && (
            <button type="button" onClick={copyEmbed} style={ghostBtn}
              title="Copy a snippet you can paste into any website we do not run. It loads this exact page, and the form keeps working.">
              {copied ? <Check size={13} /> : <Copy size={13} />} Copy embed code
            </button>
          )}
          <button type="button" onClick={() => save(false)} disabled={busy} style={ghostBtn}
            title="Save without making it live">
            {busy ? "Working…" : "Save"}
          </button>
          <button type="button" data-builder-anchor="publish"
            onClick={() => (published ? void save(true) : setConfirmPublish(true))}
            disabled={busy} style={orangeBtn}
            title={published
              ? "Save and update the live page"
              : "Put this page on the internet at its own address. You are asked to confirm first."}>
            {busy ? "Working…" : published ? "Save & update live" : "Publish"}
          </button>
        </>
      }
      /* D-165 §11.13.1 — the LEFT panel is widgets and nothing else. What is
         true of the PAGE (that there is no form on it yet, that this business
         has a website these could be pages of, what the last press did) is
         page settings: the right panel, when nothing is selected. */
      documentExtras={(
        <div data-page-settings="landing"
          style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC",
            fontSize: 11, lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, color: "#5A7A8A" }}>
            This page
          </div>
          {p.arionSitePath && (
            <div style={{ color: "#1D4ED8" }}>
              <Globe size={11} style={{ verticalAlign: -1 }} /> You have a website with us —{" "}
              <Link to={p.arionSitePath} style={{ color: "#1D4ED8", fontWeight: 600 }}>build this as a website page instead</Link>.
            </div>
          )}
          {!hasForm(doc) && (
            <div style={{ color: "#B45309" }}>
              There is no contact form on this page yet, so a visitor has no way to reach you. Add one from the panel on the left.
            </div>
          )}
          {err && <div style={{ color: "#B91C1C" }}>{err}</div>}
          {said && <div style={{ color: "#047857" }}>{said}</div>}
        </div>
      )}
      widgetExtras={(w) => (
        <LandingExtras widget={w} doc={doc} onChange={setDoc} />
      )}
    />
    </>
  );
}

function hasForm(doc: BuilderDocument): boolean {
  // THE WHOLE TREE (§11.12). A form the author dropped into a box is still a
  // form, and the flat walk this replaces would have told them they had none
  // while the page they were looking at plainly had one.
  return walkWidgets(doc).some(({ widget }) => widget.kind === "form");
}

function brandDefaults(kit: { colours: { accent: string }; fonts: { heading: string; body: string } }) {
  return { accent: kit.colours.accent, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body };
}

/* ══════════════════════════════════════════════════════════════════════════
   The form's own panel
   ══════════════════════════════════════════════════════════════════════════ */

function LandingExtras({ widget, doc, onChange }: {
  widget: Widget; doc: BuilderDocument; onChange: (d: BuilderDocument) => void;
}) {
  // BY NODE ID (V-2). The column scan this replaces could not find a form
  // inside a box, so "What to ask for" changed nothing and said nothing.
  const setProps = (props: Record<string, unknown>) => { onChange(patchNode(doc, widget.id, props)); };

  if (widget.kind === "form") {
    const chosen: string[] = Array.isArray((widget.props as any).fields) && (widget.props as any).fields.length
      ? (widget.props as any).fields.map((f: any) => (typeof f === "string" ? f : String(f?.key || "")))
      : defaultFormFields();
    return (
      <div style={panel}>
        <div style={panelTitle}>What to ask for</div>
        {FORM_FIELDS.map((f) => (
          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
            title={f.always
              ? "Always asked — without it a submission cannot become a contact"
              : `Ask the visitor for their ${f.label.toLowerCase()}`}>
            <input
              type="checkbox"
              disabled={f.always}
              checked={f.always || chosen.includes(f.key)}
              onChange={(e) => setProps({
                fields: e.target.checked
                  ? [...new Set([...chosen, f.key])]
                  : chosen.filter((k) => k !== f.key),
              })}
            />
            {f.label}{f.always ? <span style={{ color: "#94A3B8" }}> — always</span> : null}
          </label>
        ))}
        <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.4 }}>
          Every submission becomes a contact automatically, and the campaign that brought them here is credited.
        </div>
      </div>
    );
  }

  if (widget.kind === "hero" || widget.kind === "image" || widget.kind === "gallery") {
    const key = widget.kind === "hero" ? "image" : "src";
    if (widget.kind === "gallery") {
      const items: any[] = Array.isArray((widget.props as any).items) ? (widget.props as any).items : [];
      return (
        <div style={panel}>
          <div style={panelTitle}>Photos</div>
          {items.map((it, i) => (
            <input key={i} value={typeof it === "string" ? it : String(it?.src || "")}
              onChange={(e) => setProps({ items: items.map((x, j) => (j === i ? e.target.value : x)) })}
              placeholder={`Picture ${i + 1} address`} style={panelInput} />
          ))}
        </div>
      );
    }
    const alt = String((widget.props as any).alt || "");
    return (
      <div style={panel}>
        <div style={panelTitle}>Picture</div>
        <input value={String((widget.props as any)[key] || "")}
          onChange={(e) => setProps({ [key]: e.target.value })}
          placeholder="Paste the picture's address" style={panelInput} />
        <input value={alt} onChange={(e) => setProps({ alt: e.target.value })}
          placeholder="Describe the picture"
          title="Read aloud by screen readers, and shown if the picture does not load."
          style={panelInput} />
        {!alt.trim() && (
          <div style={{ fontSize: 10, color: "#B45309" }}>
            Without a description, somebody using a screen reader learns nothing from this picture.
          </div>
        )}
      </div>
    );
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Chrome
   ══════════════════════════════════════════════════════════════════════════ */

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,0.3)",
  background: "transparent", color: "#fff", borderRadius: 4, padding: "5px 10px",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const orangeBtn: React.CSSProperties = { ...ghostBtn, background: "#EF6C33", borderColor: "#EF6C33" };
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

export { setPropPath };
export default LandingBuilder;
