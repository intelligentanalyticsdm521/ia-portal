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
import { ConfirmDialog, type ConfirmAsk } from "../../../components/ConfirmDialog";
import { useBrandKit } from "../../../brand/BrandKitProvider";
import { BuilderShell } from "../../BuilderShell";
import { Canvas } from "../../Canvas";
import {
  addSection, makeSection, makeWidget, patchNode,
  type BuilderDocument, type Selection, type Widget,
} from "../../model";
import { makeContext, type RenderContext } from "../../render";
import { arionKindOf, widgetsFor, type WidgetDef } from "../../registry";
import type { PremadeSection } from "../../templates";
import {
  toDocument, toPayload, toDraftPayload, sectionFromServer, sectionWidget, arionKindOfSection,
  sectionsWithoutNodes, fieldsOf, NODE_PROP, LOCK_PROP, type ArionSection,
} from "./siteModel";
import { renderSiteWidget, SITE_CSS, renderHeaderChrome, renderFooterChrome } from "./siteRender";
import {
  SITE_PREMADE, SITE_PREMADE_TAGS, SITE_PAGE_TEMPLATES, sitePremade, withCount, repeatFieldFor,
} from "./siteTemplates";
import { SiteSectionFields, SiteLockedPanel, type SiteFieldDeps } from "./SiteInspectorExtras";
import { EMPTY_SITE_CATALOGUE, readSiteCatalogue, type SiteCatalogue } from "./siteCatalogue";
import { EMPTY_PLAN, readSitePlan, lockFor, canAdd, pickerLock, type SitePlan } from "./sitePlan";
import type { WidgetLock } from "../../tier";
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
  /**
   * THE price list — Products & Services (D-23). The same one call the pricing
   * section's "Use my current prices" was written for; the services grid now
   * reads it too rather than filling itself with the fixture's own copy.
   */
  getPriceList: () => Promise<any>;
  buildSection: (kind: string, blueprintId?: string) => Promise<any>;
  save: (pageId: number, body: { sections: any[]; status?: string; title?: string; unpublish?: boolean; proposalIds?: string[] }) => Promise<any>;
  /**
   * D-05: hold this work BESIDE the live page. Nothing reaches the website.
   *
   * This is what "Save" means on a page that is already on the internet. The
   * old spelling — send `status: 'draft'` — is the same wire as Unpublish, so
   * pressing Save on a live home page 404'd the site with no warning.
   */
  saveDraft: (pageId: number, body: { sections: any[]; title?: string }) => Promise<any>;
  /** Throw the held draft away. The live page was never touched. */
  discardDraft: (pageId: number) => Promise<any>;
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
  /** Products & Services, for the services and pricing sections (D-23). */
  const [catalogue, setCatalogue] = useState<SiteCatalogue>(EMPTY_SITE_CATALOGUE);
  const [chrome, setChrome] = useState<{ businessName: string; logoUrl?: string | null; menu: Array<{ label: string }>; contactLine?: string }>({ businessName: "", menu: [] });
  const [pageEngine, setPageEngine] = useState<{ known: boolean; active: boolean | null; reason: string | null } | null>(null);
  /* WHAT THIS BUSINESS'S PLAN CARRIES (D-157). Read off the same reply the
   * catalogue comes in, never decided here — see sitePlan.ts. */
  const [plan, setPlan] = useState<SitePlan>(EMPTY_PLAN);
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
  /**
   * THE ONE PLACE THIS BUILDER ASKS "are you sure?".
   *
   * It used to ask six times with `window.confirm` — the browser's grey box,
   * with "OK"/"Cancel" buttons and the dev server's hostname above them — while
   * Publish, one button along, asked in an `IadmModal`. Six of one, one of the
   * other, on the same toolbar. Now every question in this builder is the same
   * dialog: one piece of state, one `ConfirmDialog`, named buttons.
   */
  const [confirmAsk, setConfirmAsk] = useState<ConfirmAsk | null>(null);

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
      const [page, lib, price, priceList]: any[] = await Promise.all([
        api.getPage(pageId),
        api.getCatalog(),
        api.getPricing().catch(() => null),
        // D-23. Best effort: a business whose price list we cannot read still
        // gets a page they can type on, and the picker says so in words.
        api.getPriceList().catch(() => null),
      ]);
      /* WHAT IS LIVE, and WHAT WAS SAVED BUT NOT PUBLISHED (D-05).
       *
       * The builder opens on the draft when there is one — that is the work the
       * author left — while `detail.status` keeps saying Live, because the
       * visitor is still seeing the published version. Two facts, both true, and
       * the header says both. */
      const live: ArionSection[] = page?.data?.sections || [];
      const held = page?.data?.draft?.sections;
      const sections: ArionSection[] = Array.isArray(held) && held.length ? held : live;
      setDoc(toDocument(sections));
      setResetKey((k) => k + 1);
      setDetail(page?.data || null);
      setCatalog(lib?.data?.sections || []);
      setPlan(readSitePlan(lib?.data));
      setPageEngine(lib?.data?.pageEngine
        ? { known: !!lib.data.pageEngine.known, active: lib.data.pageEngine.active, reason: lib.data.pageEngine.reason || null }
        : null);
      setAiLocked(lib?.data?.ai?.available === false ? (lib?.data?.ai?.reason || "Ask ARGUS is not on this plan.") : null);
      // ONE price, ONE source (P18). The old AI Builder carried a SECTION_COSTS
      // table in the Portal and the server charged something else; the price is
      // read here and never computed (feedback_no_fabricated_catalog).
      const pricing = price?.data || null;
      setCredits(pricing?.actions?.page?.credits ?? pricing?.actions?.section?.credits ?? null);
      // D-23. The reading is pure and lives with the shaping (siteCatalogue.ts),
      // including the rule that the cadence is carried verbatim (D-09).
      setCatalogue(priceList?.data ? readSiteCatalogue(priceList.data) : EMPTY_SITE_CATALOGUE);
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
    // The same plan gate as the pane's own insert: a ready-made section is
    // still a section, and the gallery is the other door into the same build.
    const locked = lockFor(plan, row.kind);
    if (locked) { setErr(locked.sentence); return false; }
    if (row.count) { setAsking({ key: row.key, at, value: row.count.default }); return false; }
    void addFromServer(row.kind, at);
    return false;
  }, [addFromServer, plan]);

  /* ── inserting from the pane ─────────────────────────────────────────── */

  /* Which widgets this plan cannot have, by the BUILDER's name for them.
     Derived from the one plan reply, never from a tier table here. */
  const lockedKinds = useMemo(() => {
    const out: Record<string, WidgetLock> = {};
    for (const w of widgetsFor("website")) {
      // The whole DEF, not just its kind: a widget with no section behind it
      // has no server row, and its own `tier` is what says which gate applies.
      const lock = pickerLock(plan, arionKindOf, w);
      if (lock) out[w.kind] = lock;
    }
    return out;
  }, [plan]);

  const insertWidget = useCallback((def: WidgetDef, count?: number): boolean => {
    const kind = arionKindOf(def.kind);
    /* THE PLAN, BEFORE ANYTHING IS BUILT (D-157).
     *
     * The panel greys the tile and says why, and this is the second end of the
     * same guard: a keyboard shortcut, a pressed tile and a drag all arrive
     * here, and only one of them goes through the panel. The server refuses
     * the build as well — three ends, on purpose, because the one a client
     * finds is never the one you thought of. */
    const locked = lockFor(plan, kind);
    if (locked) { setErr(locked.sentence); return false; }
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
  }, [addFromServer, change, doc, plan, selection]);

  /* ── save, preview, publish ──────────────────────────────────────────── */

  /**
   * WHY A SAVE IS REFUSED, IN WORDS THAT ARE TRUE.
   *
   * A section can have no ARION node for two different reasons, and the one
   * sentence used to cover both said "give it a moment and try again" — which
   * is right for the first and a LOOP for the second:
   *
   *   · the server is still building a section the author just asked for.
   *     Waiting really does fix it.
   *   · the author put a box straight onto the PAGE. Nothing is building it
   *     and nothing ever will: a website page is made of sections, and the
   *     free parts live inside a "Words and pictures" section. Waiting is
   *     useless, and the author cannot tell that from the old words. Found by
   *     driving it, 2026-09-17: add a box, press Save draft, and the page can
   *     never be saved again until the box is taken off.
   *
   * So the message names the second case and says what to do about it. The
   * REAL fix is for a page-level box to become a free section of its own, and
   * that is a server round trip rather than a sentence — written up in the
   * handoff. Until then the refusal has to be honest.
   */
  const orphanMessage = useCallback((count: number) => {
    const many = count !== 1;
    // A section the SERVER built always comes back with a node - an archetype
    // carries it on its one `site_*` widget, a free section on its own meta.
    // So an orphan with no `site_*` widget was made HERE, by dropping a part
    // straight onto the page, and no amount of waiting will give it one.
    const loose = sectionsWithoutNodes(doc).filter((s) => !sectionWidget(s));
    if (loose.length) {
      return `${count} ${many ? "parts are" : "part is"} sitting straight on the page, and a page is `
        + "made of sections. Put them inside a “Words and pictures” section, or take "
        + "them off — nothing was saved.";
    }
    return `${count} section${many ? "s have" : " has"} not finished being built. `
      + "Give it a moment and try again — nothing was saved.";
  }, [doc]);
  const payload = useCallback(() => {
    const orphans = sectionsWithoutNodes(doc);
    if (orphans.length) {
      throw new Error(orphanMessage(orphans.length));
    }
    return toPayload(doc);
  }, [doc]);

  /** The same sections, in the shape a draft has to come back in. */
  const draftPayload = useCallback(() => {
    const orphans = sectionsWithoutNodes(doc);
    if (orphans.length) {
      throw new Error(orphanMessage(orphans.length));
    }
    return toDraftPayload(doc);
  }, [doc]);

  /**
   * WRITE TO THE WEBSITE. Publish, or Unpublish, and nothing in between.
   *
   * `unpublish` is passed through to arion-api, which refuses `status:"draft"`
   * on a live page without it (D-05). The old third caller of this — "Save
   * draft" on a live page — is `holdDraft` below and does not come here at all.
   */
  const write = useCallback(async (status?: "draft" | "publish", opts: { unpublish?: boolean } = {}) => {
    setBusy(status === "publish" ? "publish" : "save");
    setErr(null); setOk(null); setLiveUrl(null);
    try {
      const res: any = await api.save(pageId, {
        sections: payload(), status, title: detail?.title,
        ...(opts.unpublish ? { unpublish: true } : {}),
      });
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

  /* ── D-05: SAVE THAT NEVER TAKES A PAGE OFF THE INTERNET ───────────────
   *
   * The walk's honourable mention, and the most dangerous thing it found:
   * pressing Save draft on the live home page moved it into a list headed
   * "Nobody can see these until you publish them" and the public URL started
   * returning 404. Nothing warned, nothing confirmed.
   *
   * On a LIVE page, Save now writes to arion.site_page_draft — beside the
   * published version, never over it. The visitor sees what they were seeing.
   * On a page that is not live there is nothing to protect, so Save is the
   * ordinary save it always was.
   */
  const isLive = detail?.status === "publish";

  const holdDraft = useCallback(async () => {
    setBusy("save"); setErr(null); setOk(null); setLiveUrl(null);
    try {
      // The DRAFT carries the rows the detail response sends, not the save
      // payload: a held draft has to reopen as the page it was, and `kind` and
      // `editable` are what tell a section we can edit from one built on the
      // site itself (D-05).
      await api.saveDraft(pageId, { sections: draftPayload(), title: detail?.title });
      dirtyRef.current = false;
      setOk("Saved. Your website has not changed — press Publish when you are ready for visitors to see it.");
      onSaved?.("Saved as a draft beside the live page.");
      await load();
    } catch (e: any) {
      // Never a tick on a save that did not land.
      setErr(messageFrom(e, "We could not hold that draft. Nothing on your website changed."));
    } finally { setBusy(null); }
  }, [api, detail, load, onSaved, pageId, payload]);

  const discardHeldDraft = useCallback(async () => {
    setBusy("discard"); setErr(null); setOk(null);
    try {
      await api.discardDraft(pageId);
      setOk("Threw the saved changes away. You are back to what is on your website.");
      await load();
    } catch (e: any) {
      setErr(messageFrom(e, "We could not throw that draft away. Nothing on your website changed."));
    } finally { setBusy(null); }
  }, [api, load, pageId]);

  /** The one Save the toolbar shows, whichever kind of page this is. */
  const saveNow = useCallback(() => {
    if (isLive) { void holdDraft(); return; }
    void write("draft");
  }, [holdDraft, isLive, write]);

  /** Work saved but not published, as the server last told us. */
  const heldDraft: { savedAt: string | null } | null = detail?.draft || null;

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

  /** "Publish" — the longest answer, asked in the same box as the rest. */
  const askPublish = useCallback(() => {
    setConfirmAsk({
      title: `Publish “${detail?.title || "this page"}”?`,
      body: (
        <>
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
        </>
      ),
      confirmLabel: "Yes, publish it",
      onConfirm: () => { void write("publish"); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.title, detail?.permalink, proposal, write]);

  /** Put the page back to the save before last, once the client says yes. */
  const undoLastSave = useCallback(async () => {
    setBusy("undo"); setErr(null); setOk(null);
    try { await api.undoPage(pageId); setOk("Put the previous version back."); await load(); }
    catch (e: any) { setErr(messageFrom(e, "We could not undo that.")); }
    finally { setBusy(null); }
  }, [api, load, pageId]);

  /** Bin the page on the website, once the client says yes. */
  const trashPage = useCallback(async () => {
    setSettingsBusy("trash"); setSettingsErr(null);
    try { await api.trash(pageId); setSettingsOpen(false); onClose(); }
    catch (e: any) { setSettingsErr(messageFrom(e, "We could not delete that page.")); }
    finally { setSettingsBusy(null); }
  }, [api, onClose, pageId]);

  /** Put an adopted section back, once the client has said yes to it. */
  const undoAdoption = useCallback(async (adoptionId: string) => {
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
  }, [api, load, pageId]);

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
    onUndoAdoption: (adoptionId: string) => {
      setConfirmAsk({
        title: "Put this section back the way your website built it?",
        body: "Anything you have changed on it since goes with it, and the section stops being editable here.",
        confirmLabel: "Yes, put it back",
        onConfirm: () => { void undoAdoption(adoptionId); },
      });
    },
    onSwapRoles: swapRoles,
    roleSwapBusy,
    onSwapLook: (sectionId: string, kind: string, blueprintId: string | null, label: string) => {
      setSwapErr(null);
      setSwapFor({ sectionId, kind, blueprintId, label });
    },
    catalogFor: (kind: string) => catalog.find((c) => c.kind === kind) || null,
    catalogue,
  }), [api, catalog, catalogue, pageId, roleSwapBusy, specsFor, swapRoles, undoAdoption]);

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
        // BY NODE ID (V-2, §11.12). The column scan this replaces reached the
        // top of a column only, so a section's fields wrote nothing at all
        // once that section held a box — silently, with the select moving.
        onPatch={(props) => change(patchNode(doc, w.id, props))}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, change, ctx, deps, doc]);

  /* ── the gallery's pre-made sections ─────────────────────────────────── */

  const premade: PremadeSection[] = useMemo(() => SITE_PREMADE.map((p) => ({
    key: p.key,
    name: p.name,
    // A section this plan cannot have stays IN the gallery and says why.
    // Hiding it would make "not on your plan" look exactly like a bug, and a
    // business that cannot see what they would get cannot decide to buy it.
    description: canAdd(plan, p.kind) ? p.description : lockFor(plan, p.kind)!.sentence,
    // …and the card is GREYED as well as explained (R-D2). The words alone
    // left a card that looked ready to place and refused after the press.
    // THE WHOLE REFUSAL travels, not just its words, so the gallery can say
    // WHICH of the three states this is — the same three the pane shows.
    ...(canAdd(plan, p.kind) ? {} : { locked: lockFor(plan, p.kind)! }),
    tags: p.tags,
    // The gallery places a section by calling build(); the website adapter
    // cannot build one locally (the SERVER does), so this returns a placeholder
    // the shell never uses — onPlaceSection is intercepted below.
    build: () => makeSection({ label: p.name }),
  })), [plan]);

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
          if (!dirtyRef.current) { onClose(); return; }
          setConfirmAsk({
            title: "Close without saving?",
            body: "You have changes here that are not on your website yet. Closing now throws them away.",
            confirmLabel: "Close and lose them",
            cancelLabel: "Keep editing",
            onConfirm: onClose,
          });
        }}
        adapter="website"
        resetKey={resetKey}
        title={detail?.title || "Page"}
        doc={doc}
        onChange={change}
        ctx={ctx}
        paperWidth="full"
        extraCss={SITE_CSS}
        /* D-30. The engine was written for a proposal, so without this a
           website inspector offers "Start a new page here (when printed or
           saved as a PDF)" and "the document's own font". A web page has no
           pages and is not a document. `pageBreakLabel: ""` HIDES the control
           rather than renaming it — there is nothing here to rename. */
        copy={{
          noun: "page",
          nounPlural: "pages",
          audience: "the people who visit your website",
          paneHeading: "Add to this page",
          paneHint: "Click one to add it where you are, or drag it onto the page.",
          outlineHeading: "This page, top to bottom",
          defaultFontLabel: "Your website's own font",
          pageBreakLabel: "",
          emptyHeading: "What goes on this page?",
          emptyHint: "Pick one to start. You can add the rest after.",
        }}
        onSave={saveNow}
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
        /* R-D1 — the PANEL says so before the press. `insertWidget`
           above is the seam a shortcut, a pressed tile and a drag all reach,
           and it refuses; this is the same answer, shown as a greyed tile with
           the reason as its line, so "not on your plan" never arrives looking
           like a bug. ONE source: the plan the server sent. */
        lockedKinds={lockedKinds}
        onPlaceSection={placePremade}
        onAddBlank={(at) => { void addFromServer("content", at); return false; }}
        widgetExtras={widgetExtras}
        /* OUR ANGIE, and the reference's eye — both in the bar's own
           positions (D-172), not stacked in with the verbs. */
        onAskArgus={() => setAskOpen(true)}
        askArgus={
          <button type="button" data-builder-argus onClick={() => setAskOpen(true)}
            title="Ask ARGUS" aria-label="Ask ARGUS"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#38BDF8", cursor: "pointer",
            }}>
            <Sparkles size={15} />
          </button>
        }
        onPreviewDoc={() => { if (!busy) void runPreview(); }}
        headerActions={
          <>
            {/* D-05. On a LIVE page this holds the work beside the published
                version; it does not touch the website and it does not send
                `status: draft`, which is the same wire as Unpublish. */}
            <button type="button" style={GHOST} disabled={!!busy || cannotPublish} onClick={saveNow}
              data-builder-anchor="save"
              title={isLive
                ? "Save your work. Your website keeps showing the published page until you press Publish."
                : "Save without publishing. Visitors do not see it yet."}>
              {busy === "save" ? "Working…" : isLive ? "Save" : "Save draft"}
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
                onClick={() => setConfirmAsk({
                  title: "Put back the version from before your last save?",
                  body: "Everything you have done since that save goes. What is on your website does not change until you publish.",
                  confirmLabel: "Yes, put it back",
                  onConfirm: () => { void undoLastSave(); },
                })}>
                {busy === "undo" ? "Working…" : "Undo last change"}
              </button>
            )}
            {isLive ? (
              <button type="button" style={GHOST} disabled={!!busy || cannotPublish}
                title="Take this page off your website. Visitors get a 'page not found' until you publish it again."
                onClick={() => setConfirmAsk({
                  // The ONE route off the internet, and it says what happens.
                  title: `Take “${detail?.title || "this page"}” off the internet?`,
                  body: "Visitors will get a ‘page not found’ until you publish it again. Nothing on the page is lost — it is all still here.",
                  confirmLabel: "Yes, take it off",
                  onConfirm: () => { void write("draft", { unpublish: true }); },
                })}>
                Take it off the internet
              </button>
            ) : null}
            <button type="button" style={PRIMARY} disabled={!!busy || cannotPublish}
              onClick={askPublish}
              title="Put this page live on your website. You are asked to confirm first.">
              {busy === "publish" ? "Working…" : "Publish"}
            </button>
          </>
        }
        /* D-165 §11.13.1 — the LEFT panel is widgets and nothing else. What
           the page itself is doing (held draft, whether it can be published,
           the sections built on the site) is a fact about the PAGE, so it is
           page settings: the right panel, when nothing is selected. It reads
           the selection this builder ALREADY tracks — a second piece of state
           saying the same thing is a second thing to get wrong. */
        documentExtras={(
          <div data-page-settings="website" style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
            <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.45 }}>
            {cannotPublish && (
              <div style={{ color: "#B91C1C", fontWeight: 600, marginBottom: 6 }}>
                Your website cannot show pages built here yet. {pageEngine?.reason}
              </div>
            )}
            {/* D-05: what is held, and the two things to do about it. */}
            {isLive && heldDraft && (
              <div data-draft-strip style={{
                marginBottom: 8, border: "1px solid #FCD34D", background: "#FFFBEB",
                borderRadius: 6, padding: "8px 10px", color: "#78350F",
              }}>
                <div style={{ fontWeight: 700 }}>Live · draft saved, not published</div>
                <div style={{ marginTop: 2 }}>
                  Your website still shows the published page. These changes are here until you publish them.
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                  <button type="button" disabled={!!busy || cannotPublish}
                    onClick={askPublish}
                    title="Put these changes on your website, where anybody can see them"
                    style={{
                      border: "none", background: "#EF6C33", color: "#fff", borderRadius: 4,
                      padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>
                    Publish these changes
                  </button>
                  <button type="button" disabled={!!busy}
                    onClick={() => setConfirmAsk({
                      title: "Throw your saved changes away?",
                      body: "The page goes back to exactly what is on your website now. This cannot be undone.",
                      confirmLabel: "Yes, discard them",
                      onConfirm: () => { void discardHeldDraft(); },
                    })}
                    title="Go back to the version that is on your website. Your saved changes are thrown away."
                    style={{
                      border: "1px solid #CBD5E1", background: "#fff", color: "#7C2D12", borderRadius: 4,
                      padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}>
                    {busy === "discard" ? "Working…" : "Discard them"}
                  </button>
                </div>
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
          </div>
        )}
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
          onTrash={() => setConfirmAsk({
            title: "Put this page in your website's bin?",
            body: "It comes off your website straight away. Your website keeps it in the bin for 30 days, so it can be brought back from there.",
            confirmLabel: "Yes, bin it",
            onConfirm: () => { void trashPage(); },
          })}
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

      {/* Publish is asked in the SAME dialog as every other question here. It
          used to be the one app modal among six browser boxes on one toolbar;
          now it is simply the question with the longest answer.

          z=1300 because the questions are raised from three different layers:
          the builder shell (an IadmModal at z-50), the page-settings sheet
          (1100) whose bin button asks, and the media picker (1200). A confirm
          that renders BEHIND the sheet that raised it is a press that does
          nothing, which is what the browser's box never did. */}
      <ConfirmDialog ask={confirmAsk} product="arion" z={1300} busy={!!busy} onClose={() => setConfirmAsk(null)} />

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
                  onAddBlank={() => undefined}
                  onAddTemplate={() => undefined}
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
