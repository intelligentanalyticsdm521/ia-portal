/**
 * builder/adapters/website/WebsiteBuilder.tsx — the WEBSITE adapter.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 3, §7 and §11.5. This is the whole
 * of "what a website page is"; the engine (BuilderShell) knows none of it:
 *
 *   · the page comes from the client's own WordPress through arion-api, as a
 *     list of ARION sections, and goes back the same way;
 *   · every section a client can add is BUILT BY THE SERVER from their own
 *     details — the Portal never invents Elementor JSON;
 *   · the inspector edits the section's own fields, from the field spec
 *     arion-api sends with the catalogue, so there is one description of a
 *     section and it lives in sectionSchema.js;
 *   · Ask ARGUS is one gold button, credit-metered, PROPOSE-ONLY;
 *   · Save draft → Preview → Publish, and the website's answer is shown
 *     whichever way it goes.
 *
 * ── IT REPLACES THE AI BUILDER ────────────────────────────────────────────
 * `WebsiteAiBuilder`, `AiBlockGenerator` and `AiPageAssembler` — the configure
 * → generate → accept → assemble wizard that showed a client `JSON.stringify`
 * in a `<pre>` and asked for a WordPress page id — are DELETED in the same
 * pass, and `/app/services/arion_website_ai_builder` redirects here. "Replace
 * means delete."
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { IadmModal } from "../../../components/IadmModal";
import { useBrandKit } from "../../../brand/BrandKitProvider";
import { BuilderShell } from "../../BuilderShell";
import { Canvas } from "../../Canvas";
import {
  addSection, makeSection, makeWidget, patchWidget,
  type BuilderDocument, type Selection, type Widget,
} from "../../model";
import { makeContext, type RenderContext } from "../../render";
import { arionKindOf, type WidgetDef } from "../../registry";
import type { PremadeSection } from "../../templates";
import {
  toDocument, toPayload, sectionFromServer, sectionWidget, arionKindOfSection,
  sectionsWithoutNodes, fieldsOf, NODE_PROP, LOCK_PROP, type ArionSection,
} from "./siteModel";
import { renderSiteWidget, SITE_CSS, renderHeaderChrome, renderFooterChrome } from "./siteRender";
import {
  SITE_PREMADE, SITE_PREMADE_TAGS, SITE_PAGE_TEMPLATES, sitePremade, withCount, repeatFieldFor,
} from "./siteTemplates";
import { SiteSectionFields, SiteLockedPanel, type SiteFieldDeps } from "./SiteInspectorExtras";
import { AskArgusBox } from "../../../arion/components/AskArgus";
import { PageSettingsSheet } from "../../../arion/components/PageSettingsSheet";
import { SwapLookSheet } from "../../../arion/components/SwapLookSheet";
import { AdoptSectionSheet, AdoptReviewList } from "../../../arion/components/AdoptSectionSheet";
import type { FieldContext } from "../../../arion/components/SectionFieldInputs";
import type {
  SectionCatalogEntry, SectionFieldSpec, SitePageSettings, SitePageSeo, AdoptPreview,
} from "../../../lib/arionApi";


/* ══════════════════════════════════════════════════════════════════════════
   What the adapter is handed
   ══════════════════════════════════════════════════════════════════════════ */

export interface WebsiteBuilderApi {
  getPage: (pageId: number) => Promise<any>;
  getCatalog: () => Promise<any>;
  getPricing: () => Promise<any>;
  buildSection: (kind: string, blueprintId?: string) => Promise<any>;
  save: (pageId: number, body: { sections: any[]; status?: string; title?: string; proposalIds?: string[] }) => Promise<any>;
  preview: (pageId: number, body: { sections: any[]; title?: string }) => Promise<any>;
  askSection: (pageId: number, body: any) => Promise<any>;
  askPage: (pageId: number, body: any) => Promise<any>;
  discardProposal: (id: string) => Promise<any>;
  adoptPreview: (pageId: number, index: number) => Promise<any>;
  adopt: (pageId: number, index: number, body: any) => Promise<any>;
  undoAdoption: (pageId: number, adoptionId: string) => Promise<any>;
  swapRoles: (body: any) => Promise<any>;
  /* The jobs that used to send a client to wp-admin (ARION pack 1). They keep
     their homes: the builder gained a canvas, it did not lose the address bar,
     the search fields, "change the look" or the bin. */
  getSettings: (pageId: number) => Promise<any>;
  saveSettings: (pageId: number, params: any) => Promise<any>;
  getSeo: (pageId: number) => Promise<any>;
  saveSeo: (pageId: number, params: any) => Promise<any>;
  trash: (pageId: number) => Promise<any>;
  swapLook: (body: any) => Promise<any>;
  undoPage: (pageId: number) => Promise<any>;
  field: FieldContext;
}

export interface WebsiteBuilderProps {
  pageId: number;
  api: WebsiteBuilderApi;
  onClose: () => void;
  /** Told when the page has been written to the website, with the exact words. */
  onSaved?: (message: string) => void;
}

const GOLD: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#FEC82C", color: "#1A1A1A",
  border: "none", borderRadius: 4, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const GHOST: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "#fff",
  borderRadius: 4, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const PRIMARY: React.CSSProperties = {
  border: "none", background: "#EF6C33", color: "#fff", borderRadius: 4,
  padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
};

function messageFrom(err: any, fallback: string): string {
  const m = err?.message;
  return typeof m === "string" && m.trim() ? m : fallback;
}

export function WebsiteBuilder({ pageId, api, onClose, onSaved }: WebsiteBuilderProps) {
  const { kit } = useBrandKit();

  const [doc, setDoc] = useState<BuilderDocument>(() => toDocument([]));
  const [resetKey, setResetKey] = useState(0);
  const [detail, setDetail] = useState<any>(null);
  const [catalog, setCatalog] = useState<SectionCatalogEntry[]>([]);
  const [chrome, setChrome] = useState<{ businessName: string; logoUrl?: string | null; menu: Array<{ label: string }>; contactLine?: string }>({ businessName: "", menu: [] });
  const [pageEngine, setPageEngine] = useState<{ known: boolean; active: boolean | null; reason: string | null } | null>(null);
  const [aiLocked, setAiLocked] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [askErr, setAskErr] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const dirtyRef = useRef(false);

  /* The wp-admin jobs, kept (ARION pack 1). Loaded when the sheet opens, not
     on every page open: two more round trips to the website, and most visits
     to this screen are about the words. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SitePageSettings | null>(null);
  const [seo, setSeo] = useState<SitePageSeo | null>(null);
  const [settingsBusy, setSettingsBusy] = useState<string | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  /* "Change the look" — the same words, a different layout. */
  const [swapFor, setSwapFor] = useState<{ sectionId: string; kind: string; blueprintId: string | null; label: string } | null>(null);
  const [swapBusy, setSwapBusy] = useState<string | null>(null);
  const [swapErr, setSwapErr] = useState<string | null>(null);

  /* Adoption — one at a time, always previewed, never automatic. */
  const [adopt, setAdopt] = useState<{ index: number; sectionId: string; label: string } | null>(null);
  const [adoptPv, setAdoptPv] = useState<AdoptPreview | null>(null);
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptErr, setAdoptErr] = useState<string | null>(null);

  /* Publishing asks first. It is the one button that changes what the world
     sees, and it is next to Save draft. */
  const [confirmPublish, setConfirmPublish] = useState(false);

  /* "Review sections built on the site (N)" — a checklist, never a bulk
     adopt. Offered only when there IS something to review. */
  const [reviewOpen, setReviewOpen] = useState(false);

  /* Where the adapter could not tell which of two boxes is which, it says so
     rather than letting a guess look like a decision (pack 2b). */
  const [roleSwapBusy, setRoleSwapBusy] = useState(false);

  /* "How many?" — SD-010's guided count, asked ONCE, in words, before the
     section lands. The gallery route asks here; the pane route asks in the
     pane. Both end in the same `addFromServer`. */
  const [asking, setAsking] = useState<{ key: string; at: number; value: number } | null>(null);

  /* ── load ────────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [page, lib, price]: any[] = await Promise.all([
        api.getPage(pageId),
        api.getCatalog(),
        api.getPricing().catch(() => null),
      ]);
      const sections: ArionSection[] = page?.data?.sections || [];
      setDoc(toDocument(sections));
      setResetKey((k) => k + 1);
      setDetail(page?.data || null);
      setCatalog(lib?.data?.sections || []);
      setPageEngine(lib?.data?.pageEngine
        ? { known: !!lib.data.pageEngine.known, active: lib.data.pageEngine.active, reason: lib.data.pageEngine.reason || null }
        : null);
      setAiLocked(lib?.data?.ai?.available === false ? (lib?.data?.ai?.reason || "Ask ARGUS is not on this plan.") : null);
      // ONE price, ONE source (P18). The old AI Builder carried a SECTION_COSTS
      // table in the Portal and the server charged something else; the price is
      // read here and never computed (feedback_no_fabricated_catalog).
      const pricing = price?.data || null;
      setCredits(pricing?.actions?.page?.credits ?? pricing?.actions?.section?.credits ?? null);
      const c = lib?.data?.chrome || {};
      setChrome({
        businessName: String(c.businessName || ""),
        logoUrl: c.logoUrl || kit.logo_url || null,
        menu: Array.isArray(c.menu) ? c.menu : [],
        contactLine: String(c.contactLine || ""),
      });
      dirtyRef.current = false;
    } catch (e: any) {
      setErr(messageFrom(e, "We could not read that page from your website."));
    } finally {
      setLoading(false);
    }
  }, [api, pageId, kit.logo_url]);

  useEffect(() => { load(); }, [load]);

  /* Leaving with work in the builder loses it — nothing reaches the website
     until Save, which is the safety rule and also the trap. */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const change = useCallback((next: BuilderDocument) => { dirtyRef.current = true; setDoc(next); }, []);

  /* ── the one render context ──────────────────────────────────────────── */

  const ctx: RenderContext = useMemo(() => makeContext(doc, {
    mode: "edit",
    accent: doc.settings.accent || kit.colours.primary,
    headingFont: doc.settings.headingFont || kit.fonts.heading,
    bodyFont: doc.settings.bodyFont || kit.fonts.body,
    business: { name: chrome.businessName, logoUrl: chrome.logoUrl },
    extra: renderSiteWidget,
  }), [doc, kit, chrome]);

  const specsFor = useCallback((kind: string | null): SectionFieldSpec[] => {
    if (!kind) return [];
    return (catalog.find((c) => c.kind === kind)?.fields || []) as SectionFieldSpec[];
  }, [catalog]);

  /* ── adding a section: the SERVER builds it ──────────────────────────── */

  const addFromServer = useCallback(async (kind: string, at: number, count?: number, blueprintId?: string) => {
    setBusy("add"); setErr(null);
    try {
      const built: any = await api.buildSection(kind, blueprintId);
      const entry: ArionSection = built?.data?.section;
      if (!entry) throw new Error("We could not build that section.");
      let section = sectionFromServer(entry);
      // "How many?" — asked once, before the section lands, and applied to the
      // section the server just built rather than asked twice.
      if (count != null) {
        const w = sectionWidget(section);
        const repeat = repeatFieldFor(kind);
        if (w && repeat) {
          const next = withCount({ ...(w.props as any) }, kind, count);
          section = {
            ...section,
            columns: section.columns.map((c) => ({
              ...c, widgets: c.widgets.map((x) => (x.id === w.id ? { ...x, props: next } : x)),
            })),
          };
        }
      }
      change(addSection(doc, section, at));
      setSelection(null);
    } catch (e: any) {
      setErr(messageFrom(e, "We could not add that section."));
    } finally {
      setBusy(null);
    }
  }, [api, change, doc]);

  /* ── placing a pre-made section from the gallery ─────────────────────── */

  const placePremade = useCallback((premade: { key: string }, at: number): boolean => {
    const row = sitePremade(premade.key);
    if (!row) return true;
    if (row.count) { setAsking({ key: row.key, at, value: row.count.default }); return false; }
    void addFromServer(row.kind, at);
    return false;
  }, [addFromServer]);

  /* ── inserting from the pane ─────────────────────────────────────────── */

  const insertWidget = useCallback((def: WidgetDef, count?: number): boolean => {
    const kind = arionKindOf(def.kind);
    if (kind) {
      // A SECTION. It becomes a new section of its own, built by the server.
      void addFromServer(kind, doc.sections.length, count);
      return false;
    }
    // A CONTENT BLOCK. It goes into the free section that is selected, or a
    // new one — a paragraph has nowhere to live inside a hero.
    const target = selection
      ? doc.sections.find((s) => s.id === selection.sectionId)
      : [...doc.sections].reverse().find((s) => arionKindOfSection(s) === "content");
    if (!target || arionKindOfSection(target) !== "content") {
      setErr('Pick a "Words and pictures" section first, or add one — a heading has nowhere to live inside a banner.');
      return false;
    }
    const props: Record<string, unknown> = JSON.parse(JSON.stringify(def.defaults || {}));
    change({
      ...doc,
      sections: doc.sections.map((s) => (s.id !== target.id ? s : {
        ...s,
        columns: s.columns.map((c, i) => (i === 0 ? { ...c, widgets: [...c.widgets, makeWidget(def.kind, props)] } : c)),
      })),
    });
    return false;
  }, [addFromServer, change, doc, selection]);

  /* ── save, preview, publish ──────────────────────────────────────────── */

  const payload = useCallback(() => {
    const orphans = sectionsWithoutNodes(doc);
    if (orphans.length) {
      throw new Error(
        `${orphans.length} section${orphans.length === 1 ? " has" : "s have"} not finished being built. `
        + "Give it a moment and try again — nothing was saved.",
      );
    }
    return toPayload(doc);
  }, [doc]);

  const write = useCallback(async (status?: "draft" | "publish") => {
    setBusy(status === "publish" ? "publish" : "save");
    setErr(null); setOk(null); setLiveUrl(null);
    try {
      const res: any = await api.save(pageId, { sections: payload(), status, title: detail?.title });
      const written = res?.data?.sectionsWritten ?? doc.sections.length;
      // THE WEBSITE'S OWN ANSWER, never a toast we made up.
      setOk(
        (status === "publish" ? "Published. " : "Saved as a draft. ")
        + `${written} ${written === 1 ? "section is" : "sections are"} on your website now.`
        + (res?.data?.cachePurged === false ? " Your website's cache did not clear — give it a minute." : ""),
      );
      // The live address, right where they published it — the single most
      // asked question after a publish is "where is it?".
      if (status === "publish" && res?.data?.permalink) setLiveUrl(res.data.permalink);
      dirtyRef.current = false;
      onSaved?.(status === "publish" ? "Published." : "Saved as a draft.");
      await load();
    } catch (e: any) {
      // The plugin's words, verbatim, whichever way it failed. Never a green
      // toast on a failed write (reference_catch_swallow_report_success).
      setErr(messageFrom(e, "Your website would not take that change. Nothing was saved."));
    } finally {
      setBusy(null);
    }
  }, [api, detail, doc.sections.length, load, onSaved, pageId, payload]);

  const runPreview = useCallback(async () => {
    setBusy("preview"); setErr(null);
    try {
      const res: any = await api.preview(pageId, { sections: payload(), title: detail?.title });
      const url = res?.data?.previewUrl;
      // A preview with no link is a FAILED preview wearing a success.
      if (!url) throw new Error('Your website built the preview but did not say where it is.');
      setPreviewUrl(url);
      setShowPreview(true);
    } catch (e: any) {
      setErr(messageFrom(e, "We could not build a preview just now."));
    } finally {
      setBusy(null);
    }
  }, [api, detail, pageId, payload]);

  /* ── Ask ARGUS ───────────────────────────────────────────────────────── */

  const ask = useCallback(async (instruction: string) => {
    setBusy("ask"); setAskErr(null);
    try {
      const res: any = await api.askPage(pageId, { instruction, sections: payload() });
      setProposal(res?.data || null);
    } catch (e: any) {
      setAskErr(messageFrom(e, "ARGUS AI could not answer just now. Nothing was changed."));
    } finally {
      setBusy(null);
    }
  }, [api, pageId, payload]);

  const approveAsk = useCallback(() => {
    if (!proposal) return;
    // Edits come back as { index, after } per section; additions as whole
    // sections. Both land in the BUILDER, never on the website: the ordinary
    // Save still stands between them and the client's page.
    let next = doc;
    for (const edit of proposal.edits || []) {
      const s = next.sections[edit.index];
      const w = s ? sectionWidget(s) : null;
      if (!s || !w) continue;
      next = {
        ...next,
        sections: next.sections.map((x) => (x.id !== s.id ? x : {
          ...x,
          columns: x.columns.map((c) => ({
            ...c,
            widgets: c.widgets.map((y) => (y.id === w.id ? { ...y, props: { ...edit.after, [NODE_PROP]: (y.props as any)[NODE_PROP] } } : y)),
          })),
        })),
      };
    }
    for (const add of proposal.additions || []) {
      next = addSection(next, sectionFromServer(add.section), (add.afterIndex ?? next.sections.length - 1) + 1);
    }
    change(next);
    setResetKey((k) => k + 1);
    setProposal(null);
    setAskOpen(false);
    setOk("The changes are in the builder. Your website only changes when you Publish.");
  }, [change, doc, proposal]);

  const discardAsk = useCallback(async () => {
    const id = proposal?.proposal_id;
    setProposal(null); setAskErr(null);
    if (id) { try { await api.discardProposal(id); } catch { /* recorded next time */ } }
  }, [api, proposal]);

  /**
   * "We could not tell which of these two boxes is which."
   *
   * A hand-drawn card says nothing about which text is the period and which is
   * the list of what is included. The server writes its guess down rather than
   * letting it look like a decision, and this is the one tap that puts two
   * roles the right way round. The SERVER swaps them, because the Portal never
   * invents Elementor JSON.
   */
  const swapRoles = useCallback(async (sectionId: string, kind: string, list: string, roles: string[]) => {
    setRoleSwapBusy(true); setErr(null);
    try {
      const section = doc.sections.find((x) => x.id === sectionId);
      const w = section ? sectionWidget(section) : null;
      if (!section || !w) throw new Error("That section is no longer on the page.");
      const res: any = await api.swapRoles({
        kind, list, roleA: roles[0], roleB: roles[1],
        fields: fieldsOf(section), node: (w.props as any)[NODE_PROP],
      });
      const entry = res?.data?.section;
      if (!entry) throw new Error("Your website did not send the section back.");
      change({
        ...doc,
        sections: doc.sections.map((x) => (x.id === sectionId ? sectionFromServer(entry) : x)),
      });
      setOk("Swapped. Save when you are happy with it.");
    } catch (e: any) {
      setErr(messageFrom(e, "We could not swap those two over. Nothing was changed."));
    } finally {
      setRoleSwapBusy(false);
    }
  }, [api, change, doc]);

  /* ── the inspector's own panel ───────────────────────────────────────── */

  const deps: SiteFieldDeps = useMemo(() => ({
    field: api.field,
    specsFor,
    // ALWAYS PREVIEWED, never automatic: the sheet shows the section as it is
    // beside what it would become, asks for anything the mapper could not read,
    // and only then writes. The preview writes nothing, anywhere.
    onAdopt: async (index: number, sectionId: string, label: string) => {
      setAdopt({ index, sectionId, label });
      setAdoptPv(null); setAdoptErr(null); setAdoptLoading(true);
      try {
        const pv: any = await api.adoptPreview(pageId, index);
        setAdoptPv(pv?.data || null);
      } catch (e: any) {
        setAdoptErr(messageFrom(e, "We could not read that section well enough to show you what would happen."));
      } finally {
        setAdoptLoading(false);
      }
    },
    onUndoAdoption: async (adoptionId: string) => {
      if (!window.confirm(
        'Put this section back exactly as it was built on the website? '
        + 'Anything you have changed on it since will go with it.',
      )) return;
      setBusy("adopt"); setErr(null);
      try {
        await api.undoAdoption(pageId, adoptionId);
        setOk("That section is back exactly as it was, byte for byte.");
        await load();
      } catch (e: any) {
        setErr(messageFrom(e, "We could not undo that. Nothing was changed."));
      } finally {
        setBusy(null);
      }
    },
    onSwapRoles: swapRoles,
    roleSwapBusy,
    onSwapLook: (sectionId: string, kind: string, blueprintId: string | null, label: string) => {
      setSwapErr(null);
      setSwapFor({ sectionId, kind, blueprintId, label });
    },
    catalogFor: (kind: string) => catalog.find((c) => c.kind === kind) || null,
  }), [api, catalog, load, pageId, roleSwapBusy, specsFor, swapRoles]);

  const widgetExtras = useCallback((w: Widget, sectionId: string) => {
    if (w.kind === "site_custom") {
      return <SiteLockedPanel widget={w} sectionId={sectionId} deps={deps} busy={busy === "adopt"} />;
    }
    const kind = arionKindOf(w.kind);
    if (!kind) return null;
    const section = doc.sections.find((x) => x.id === sectionId);
    return (
      <SiteSectionFields
        widget={w}
        kind={kind}
        sectionId={sectionId}
        label={section?.label || kind}
        deps={deps}
        ctx={ctx}
        onPatch={(props) => {
          const section = doc.sections.find((s) => s.id === sectionId);
          if (!section) return;
          for (let c = 0; c < section.columns.length; c++) {
            const idx = section.columns[c].widgets.findIndex((x) => x.id === w.id);
            if (idx < 0) continue;
            change(patchWidget(doc, { sectionId, columnIndex: c, widgetIndex: idx }, props));
            return;
          }
        }}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, change, ctx, deps, doc]);

  /* ── the gallery's pre-made sections ─────────────────────────────────── */

  const premade: PremadeSection[] = useMemo(() => SITE_PREMADE.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    tags: p.tags,
    // The gallery places a section by calling build(); the website adapter
    // cannot build one locally (the SERVER does), so this returns a placeholder
    // the shell never uses — onPlaceSection is intercepted below.
    build: () => makeSection({ label: p.name }),
  })), []);

  /* ONLY a website that TOLD us it cannot draw these pages stops Save. A
   * website we could not ask is not a website with no page engine, and a falsy
   * check would treat "we do not know" as "there is none" (D-ARION-E). */
  const cannotPublish = !!pageEngine?.known && pageEngine.active === false;

  /* Every locked section on the page, and how many of them we could offer to
     take charge of. `customCount` is what the review entry counts. */
  const locked = useMemo(() => doc.sections
    .map((sec, i) => {
      const w = sectionWidget(sec);
      const lock: any = w && w.kind === "site_custom" ? (w.props as any)[LOCK_PROP] : null;
      return lock ? { sectionId: sec.id, order: i, ...lock } : null;
    })
    .filter(Boolean) as Array<any>, [doc]);
  const customCount = locked.length;


  if (loading) {
    return (
      <IadmModal open onClose={onClose} product="arion" eyebrow="ARION · Website" title="Opening the page…" size="builder">
        <div style={{ padding: 40, textAlign: "center", color: "#5A7A8A" }}>Reading the page from your website…</div>
      </IadmModal>
    );
  }

  return (
    <>
      <BuilderShell
        open
        onClose={() => {
          if (dirtyRef.current && !window.confirm("You have changes here that are not on your website yet. Close and lose them?")) return;
          onClose();
        }}
        adapter="website"
        resetKey={resetKey}
        eyebrow="ARION · Website builder"
        title={detail?.title || "Page"}
        subtitle={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(255,255,255,0.14)", borderRadius: 999, padding: "2px 9px" }}>
              {detail?.status === "publish" ? "Live" : detail?.status === "draft" ? "Draft" : detail?.status || "Draft"}
            </span>
            {detail?.permalink && <span style={{ opacity: 0.8 }}>{String(detail.permalink).replace(/^https?:\/\//, "")}</span>}
          </span>
        }
        doc={doc}
        onChange={change}
        ctx={ctx}
        paperWidth="full"
        paperNote={detail?.permalink ? String(detail.permalink).replace(/^https?:\/\//, "") : "your website"}
        extraCss={SITE_CSS}
        canvasHint="Click anything on the page to edit it. Everything here is what a visitor sees."
        chromeTop={renderHeaderChrome({ businessName: chrome.businessName, logoUrl: chrome.logoUrl, menu: chrome.menu })}
        chromeBottom={renderFooterChrome({ businessName: chrome.businessName, menu: chrome.menu, contactLine: chrome.contactLine })}
        chromeNote="Your website's header and footer. They are the same on every page — change them under Website → Menus."
        swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
        fonts={kit.fonts.catalog.map((f) => f.value)}
        defaultFontLabel="Your website's own font"
        premade={premade}
        premadeTags={SITE_PREMADE_TAGS}
        onSelectionChange={setSelection}
        onInsertWidget={insertWidget}
        onPlaceSection={placePremade}
        onAddBlank={(at) => { void addFromServer("content", at); return false; }}
        nextUp={null}
        askArgus={
          <button type="button" style={GOLD} onClick={() => setAskOpen(true)}
            title="Ask ARGUS to write or rewrite this page. Uses AI credits, and you see what it suggests before anything changes.">
            <Sparkles size={12} /> Ask ARGUS
          </button>
        }
        widgetExtras={widgetExtras}
        headerActions={
          <>
            <button type="button" style={GOLD} onClick={() => setAskOpen(true)}
              title="Ask ARGUS to write or rewrite this page. Uses AI credits.">
              <Sparkles size={13} /> Ask ARGUS
            </button>
            <button type="button" style={GHOST} disabled={!!busy} onClick={runPreview}
              title="See the page on your own website, rendered by your own theme. Nothing is published.">
              {busy === "preview" ? "Working…" : "Preview"}
            </button>
            <button type="button" style={GHOST} disabled={!!busy || cannotPublish} onClick={() => write("draft")}
              title="Save without publishing. Visitors do not see it yet.">
              {busy === "save" ? "Working…" : "Save draft"}
            </button>
            <button type="button" style={GHOST} disabled={!!busy}
              title="The page's address, its layout, what search engines show, and the bin."
              onClick={async () => {
                setSettingsOpen(true); setSettingsBusy("load"); setSettingsErr(null);
                try {
                  const [st, sq]: any[] = await Promise.all([api.getSettings(pageId), api.getSeo(pageId)]);
                  setSettings(st?.data || null); setSeo(sq?.data || null);
                } catch (e: any) {
                  setSettingsErr(messageFrom(e, "We could not read that page's settings."));
                } finally { setSettingsBusy(null); }
              }}>
              Page settings
            </button>
            {detail?.canUndo && (
              <button type="button" style={GHOST} disabled={!!busy}
                title="Put back the version of this page from before your last save."
                onClick={async () => {
                  if (!window.confirm("Put back the version from before your last save?")) return;
                  setBusy("undo"); setErr(null); setOk(null);
                  try { await api.undoPage(pageId); setOk("Put the previous version back."); await load(); }
                  catch (e: any) { setErr(messageFrom(e, "We could not undo that.")); }
                  finally { setBusy(null); }
                }}>
                {busy === "undo" ? "Working…" : "Undo last change"}
              </button>
            )}
            {detail?.status === "publish" ? (
              <button type="button" style={GHOST} disabled={!!busy || cannotPublish}
                title="Take this page off your website. It becomes a draft and nothing on it is lost."
                onClick={() => {
                  if (!window.confirm(
                    'Take this page off your website? It becomes a draft — nothing on it is lost.',
                  )) return;
                  void write("draft");
                }}>
                Unpublish
              </button>
            ) : null}
            <button type="button" style={PRIMARY} disabled={!!busy || cannotPublish}
              onClick={() => setConfirmPublish(true)}
              title="Put this page live on your website. You are asked to confirm first.">
              {busy === "publish" ? "Working…" : "Publish"}
            </button>
          </>
        }
        paneHeader={
          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.45 }}>
            {cannotPublish && (
              <div style={{ color: "#B91C1C", fontWeight: 600, marginBottom: 6 }}>
                Your website cannot show pages built here yet. {pageEngine?.reason}
              </div>
            )}
            <div style={{ fontWeight: 600, color: "#0B1C24" }}>{doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}</div>
            {customCount > 0 && (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                title="Go through the sections built on the website itself, one at a time. Nothing happens in bulk."
                style={{
                  marginTop: 6, border: "1px solid #CBD5E1", background: "#fff", color: "#0C4A60",
                  borderRadius: 6, padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                Review sections built on the site ({customCount})
              </button>
            )}
            <div>Everything on the canvas is what a visitor sees. Your website changes when you press Publish.</div>
            {ok && (
              <div style={{ color: "#166534", marginTop: 6 }}>
                {ok}{" "}
                {liveUrl && (
                  <a href={liveUrl} target="_blank" rel="noreferrer" title="Open the live page"
                    style={{ color: "#0C4A60", textDecoration: "underline" }}>
                    See it <ExternalLink size={10} />
                  </a>
                )}
              </div>
            )}
            {err && <div style={{ color: "#B91C1C", marginTop: 6 }}>{err}</div>}
          </div>
        }
      />

      {askOpen && (
        <IadmModal open onClose={() => { setAskOpen(false); void discardAsk(); }} product="arion" z={60}
          eyebrow="Powered by ARGUS AI" title="Ask ARGUS to change this page"
          subtitle="Type what you want in plain English. You see exactly what would change before anything happens."
          size="info">
          <div style={{ padding: 16 }}>
            <AskArgusBox
              strings={{
                title: "What would you like changed?",
                placeholder: "e.g. make the banner about winter contracts, and add a section about ice control",
                lockedReason: aiLocked,
              }}
              credits={credits}
              busy={busy === "ask"}
              error={askErr}
              summary={proposal?.summary || null}
              diff={proposal ? (proposal.diff || []) : null}
              onAsk={ask}
              onApprove={approveAsk}
              onDiscard={() => { void discardAsk(); }}
            />
          </div>
        </IadmModal>
      )}

      {settingsOpen && (
        <PageSettingsSheet
          settings={settings}
          seo={seo}
          loading={settingsBusy === "load"}
          busy={settingsBusy === "load" ? null : settingsBusy}
          error={settingsErr}
          onSaveSettings={async (params) => {
            setSettingsBusy("settings"); setSettingsErr(null);
            try { await api.saveSettings(pageId, params); setOk("Saved."); await load(); }
            catch (e: any) { setSettingsErr(messageFrom(e, "Your website would not take that. Nothing was saved.")); }
            finally { setSettingsBusy(null); }
          }}
          onSaveSeo={async (params) => {
            setSettingsBusy("seo"); setSettingsErr(null);
            try { await api.saveSeo(pageId, params); setOk("Search settings saved."); }
            catch (e: any) { setSettingsErr(messageFrom(e, "Your website would not take that. Nothing was saved.")); }
            finally { setSettingsBusy(null); }
          }}
          onTrash={async () => {
            if (!window.confirm("Put this page in your website's bin? It keeps it for 30 days.")) return;
            setSettingsBusy("trash"); setSettingsErr(null);
            try { await api.trash(pageId); setSettingsOpen(false); onClose(); }
            catch (e: any) { setSettingsErr(messageFrom(e, "We could not delete that page.")); }
            finally { setSettingsBusy(null); }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {swapFor && (
        <SwapLookSheet
          sectionLabel={swapFor.label}
          catalog={catalog.find((c) => c.kind === swapFor.kind) || null}
          currentBlueprintId={swapFor.blueprintId}
          busyBlueprint={swapBusy}
          error={swapErr}
          onClose={() => setSwapFor(null)}
          onSwap={async (blueprintId) => {
            setSwapBusy(blueprintId); setSwapErr(null);
            try {
              const section = doc.sections.find((x) => x.id === swapFor.sectionId);
              const w = section ? sectionWidget(section) : null;
              if (!section || !w) throw new Error("That section is no longer on the page.");
              // The SERVER swaps it, because the Portal never invents Elementor
              // JSON - the same rule as adding a section.
              const res: any = await api.swapLook({
                kind: swapFor.kind,
                blueprintId,
                fields: fieldsOf(section),
                node: (w.props as any)[NODE_PROP],
              });
              const entry = res?.data?.section;
              if (!entry) throw new Error("Your website did not send the new layout back.");
              change({
                ...doc,
                sections: doc.sections.map((x) => (x.id === swapFor.sectionId ? sectionFromServer(entry) : x)),
              });
              setSwapFor(null);
              setOk("The same words, in the new layout. Publish when you are happy with it.");
            } catch (e: any) {
              setSwapErr(messageFrom(e, "We could not change that layout. Nothing was changed."));
            } finally {
              setSwapBusy(null);
            }
          }}
        />
      )}

      {adopt && (
        <AdoptSectionSheet
          sectionLabel={adopt.label}
          preview={adoptPv}
          loading={adoptLoading}
          busy={busy === "adopt"}
          error={adoptErr}
          onClose={() => { setAdopt(null); setAdoptPv(null); setAdoptErr(null); }}
          onAdopt={async (fixes) => {
            setBusy("adopt"); setAdoptErr(null);
            try {
              // The fingerprint from the PREVIEW, so an adopt can only act on
              // the section the client actually looked at.
              const res: any = await api.adopt(pageId, adopt.index, {
                fingerprint: adoptPv?.fingerprint, fixes,
              });
              const adopted = res?.data?.section;
              // reference_catch_swallow_report_success: a 200 with no section
              // is a failure, and it must not arrive as a green toast.
              if (!adopted) throw new Error('Your website said it took charge of that section but did not send it back.');
              change({
                ...doc,
                sections: doc.sections.map((x) => (x.id === adopt.sectionId ? sectionFromServer(adopted) : x)),
              });
              setAdopt(null); setAdoptPv(null);
              setOk(`That section is editable now. You can undo it for ${res?.data?.undoDays ?? 30} days.`);
            } catch (e: any) {
              setAdoptErr(messageFrom(e, 'We could not take charge of that section. Nothing was changed.'));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}

      {asking && (() => {
        const row = sitePremade(asking.key);
        if (!row?.count) return null;
        return (
          <IadmModal open onClose={() => setAsking(null)} product="arion" z={70}
            eyebrow="Before it goes on the page" title={row.count.label} size="confirm"
            footer={
              <>
                <button type="button" style={{ ...GHOST, color: "#334155", border: "1px solid #CBD5E1" }}
                  onClick={() => setAsking(null)} title="Do not add it">Cancel</button>
                <button type="button" style={PRIMARY}
                  title={`Add ${row.name.toLowerCase()} with ${asking.value}`}
                  onClick={() => { const a = asking; setAsking(null); void addFromServer(row.kind, a.at, a.value); }}>
                  Add it
                </button>
              </>
            }>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "#5A7A8A", marginBottom: 12 }}>{row.description}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: Math.min(8, row.count.max - row.count.min + 1) }, (_, i) => row.count!.min + i).map((n) => (
                  <button key={n} type="button" title={`${n}`}
                    onClick={() => setAsking({ ...asking, value: n })}
                    style={{
                      width: 38, height: 38, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: "1px solid " + (asking.value === n ? "#0C4A60" : "#CBD5E1"),
                      background: asking.value === n ? "#0C4A60" : "#fff",
                      color: asking.value === n ? "#fff" : "#334155",
                    }}>{n}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                Asked once. You can add or remove any time from the panel on the right.
              </div>
            </div>
          </IadmModal>
        );
      })()}

      {reviewOpen && (
        <AdoptReviewList
          rows={locked.map((l) => ({
            index: Number(l.index) || l.order,
            label: String(l.label || "Custom section"),
            summary: String(l.preview || ""),
            adoptable: !!l.adoptable,
            kindLabel: l.adoptKindLabel || null,
            reasonText: l.why || null,
            confidenceLabel: (l.adoptConfidence || null) as any,
          }))}
          onClose={() => setReviewOpen(false)}
          onOpen={(index) => {
            const row = locked.find((l) => (Number(l.index) || l.order) === index);
            setReviewOpen(false);
            if (row) void deps.onAdopt(index, row.sectionId, String(row.label || "this section"));
          }}
        />
      )}

      {confirmPublish && (
        <IadmModal open onClose={() => setConfirmPublish(false)} product="arion" z={60}
          eyebrow="Publish" title={`Publish “${detail?.title || 'this page'}”?`} size="confirm"
          footer={
            <>
              <button type="button" style={{ ...GHOST, color: "#334155", border: "1px solid #CBD5E1" }}
                onClick={() => setConfirmPublish(false)} title="Go back to the builder">Not yet</button>
              <button type="button" style={PRIMARY} disabled={!!busy}
                title="Publish this page to your website"
                onClick={() => { setConfirmPublish(false); void write("publish"); }}>
                {busy === "publish" ? "Working…" : "Yes, publish it"}
              </button>
            </>
          }>
          <div style={{ padding: 16, fontSize: 13, lineHeight: 1.55 }}>
            <p>
              Everything on the canvas goes onto {detail?.permalink || "your website"} straight away,
              where anybody can see it.
            </p>
            {proposal && (
              <p style={{ color: "#B45309" }}>
                ARGUS has a suggestion still waiting for you and will NOT be published with this page.
              </p>
            )}
            <p style={{ color: "#5A7A8A" }}>
              Your website keeps the version before this one, so &ldquo;Undo last change&rdquo; puts it straight back.
            </p>
          </div>
        </IadmModal>
      )}

      {showPreview && (
        <IadmModal open onClose={() => setShowPreview(false)} product="arion" z={60}
          eyebrow="Preview" title="What this page will look like"
          subtitle="Rendered by your own website, from exactly what is on the canvas. Nothing has been published."
          size="report">
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              This is your own website rendering the page, behind a one-hour key so only you can open it.
              It is a preview: nothing has been saved and nothing is live.
            </p>
            {/* Some websites refuse to be framed, and a blank frame is exactly
                the failure this replaced — so the real tab is always offered. */}
            <a className="abtn abtn-sky" href={previewUrl || "#"} target="_blank" rel="noreferrer"
              title="Open the preview on your website in a new tab">
              Open in a new tab <ExternalLink size={12} />
            </a>
            <iframe
              title="Preview"
              src={previewUrl || undefined}
              style={{ width: "100%", height: 420, border: "1px solid #E2E8F0", borderRadius: 10, marginTop: 12, background: "#fff" }}
            />
            <div style={{ marginTop: 20, border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ fontSize: 11, padding: "6px 10px", background: "#F1F5F9", color: "#475569" }}>
                The same page, drawn here from the same sections:
              </div>
              <div style={{ maxHeight: 460, overflowY: "auto" }}>
                <Canvas
                  doc={doc}
                  ctx={{ ...ctx, mode: "view" }}
                  selection={null}
                  paperWidth="full"
                  extraCss={SITE_CSS}
                  chromeTop={renderHeaderChrome({ businessName: chrome.businessName, logoUrl: chrome.logoUrl, menu: chrome.menu })}
                  chromeBottom={renderFooterChrome({ businessName: chrome.businessName, menu: chrome.menu, contactLine: chrome.contactLine })}
                  onSelect={() => undefined}
                  onEditText={() => undefined}
                  onPatchSection={() => undefined}
                  onDuplicateSection={() => undefined}
                  onDeleteSection={() => undefined}
                  onMoveSection={() => undefined}
                  onAddSection={() => undefined}
                />
              </div>
            </div>
          </div>
        </IadmModal>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   New page — the template principle, at the moment a page is created
   ══════════════════════════════════════════════════════════════════════════ */

export { SITE_PAGE_TEMPLATES };
export default WebsiteBuilder;
