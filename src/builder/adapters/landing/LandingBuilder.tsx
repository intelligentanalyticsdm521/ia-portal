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
import { patchWidget, setPropPath, type BuilderDocument, type Widget } from "../../model";
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
  const [copied, setCopied] = useState(false);
  const [business, setBusiness] = useState<LandingBusiness>({ name: "" });
  const openedFor = useRef<number | null>(null);

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
    setErr(null); setSaid(null); setCopied(false);

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

  async function save(alsoPublish: boolean) {
    if (!p.page || !doc) return;
    setBusy(true); setErr(null); setSaid(null);
    try {
      await p.api.put(`/api/v1/landing-pages/${p.page.id}`, {
        blocks_json: doc,
        theme_json: { accent: doc.settings.accent || kit.colours.accent },
        ...(alsoPublish ? { status: "published" } : {}),
      });
      p.onSaved(alsoPublish
        ? "Published. The page is live at its address."
        : "Saved. It is not live until you press Publish.");
      setSaid(alsoPublish ? "Published." : "Saved.");
    } catch (e) {
      setErr(`Could not save: ${apiErrorMessage(e)}`);
    } finally { setBusy(false); }
  }

  async function copyEmbed() {
    if (!p.page?.published_url) return;
    const snippet = embedSnippet(p.page.published_url, { title: p.page.title || p.page.name, height: 900 });
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
        open
        onClose={p.onClose}
        product="spark"
        eyebrow="SPARK · Landing page"
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
  const published = p.page.status === "published" && !!p.page.published_url;

  return (
    <BuilderShell
      open
      onClose={p.onClose}
      adapter="landing"
      resetKey={resetKey}
      eyebrow="SPARK · Landing page"
      doc={doc}
      onChange={setDoc}
      ctx={ctx as unknown as RenderContext}
      renderSection={renderLandingSection as unknown as (s: any, c: RenderContext) => string}
      canvasCss={LANDING_CSS.replace(/__ACCENT__/g, doc.settings.accent || kit.colours.accent)}
      paperWidth={760}
      canvasBackground="#E2E8F0"
      canvasHint="Click anything on the page to edit it. This is the page a visitor gets."
      paperNote="hosted page"
      premade={LANDING_PREMADE_SECTIONS}
      premadeTags={LANDING_PREMADE_TAGS}
      swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
      fonts={kit.fonts.catalog.map((f) => f.value)}
      title={<span style={{ fontSize: 15, fontWeight: 600 }}>{p.page.name}</span>}
      subtitle={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11 }}>
          <span style={{ background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "2px 9px" }}>/{p.page.slug}</span>
          {published
            ? <a href={p.page.published_url!} target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}
              title="Open the live page in a new tab">Live <ExternalLink size={10} style={{ verticalAlign: -1 }} /></a>
            : <span style={{ opacity: 0.8 }}>Not live yet</span>}
        </span>
      }
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
          <button type="button" onClick={() => save(true)} disabled={busy} style={orangeBtn}
            title={published ? "Save and update the live page" : "Save and put it on the internet at its address"}>
            {busy ? "Working…" : published ? "Save & update live" : "Publish"}
          </button>
        </>
      }
      paneHeader={
        <div style={{ fontSize: 11, lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 6 }}>
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
      }
      widgetExtras={(w, sectionId) => (
        <LandingExtras widget={w} sectionId={sectionId} doc={doc} onChange={setDoc} />
      )}
    />
  );
}

function hasForm(doc: BuilderDocument): boolean {
  return doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => w.kind === "form")));
}

function brandDefaults(kit: { colours: { accent: string }; fonts: { heading: string; body: string } }) {
  return { accent: kit.colours.accent, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body };
}

/* ══════════════════════════════════════════════════════════════════════════
   The form's own panel
   ══════════════════════════════════════════════════════════════════════════ */

function LandingExtras({ widget, sectionId, doc, onChange }: {
  widget: Widget; sectionId: string; doc: BuilderDocument; onChange: (d: BuilderDocument) => void;
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
