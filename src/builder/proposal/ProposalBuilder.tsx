/**
 * builder/proposal/ProposalBuilder.tsx — the PROPOSAL adapter.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 2 and §8. This is the whole of
 * "what a proposal is" — the engine (BuilderShell) knows none of it:
 *
 *   · the customer, picked ONCE (a company or a person), then which of their
 *     locations the document covers. Every merge field fills from that choice.
 *   · Products & Services, for the pricing table's rows and for priced lines.
 *   · the business's clause library, for the numbered-clause sections.
 *   · the property's own fields, for the service plan the crew also reads.
 *   · Ask ARGUS — one gold button, credit-metered, whose output is SECTIONS.
 *   · save as draft / send / save as a template.
 *
 * ── IT REPLACES THE OLD EDITOR ────────────────────────────────────────────
 * CreateProposalDrawer (the modal of stacked field lists) is gone from
 * OliverProposalsPage.tsx in the same pass. Same route, same list, same
 * buttons — a different editor behind them. "Replace means delete."
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, UserRound, Building2, MapPin, Plus, X } from "lucide-react";
import { IadmModal } from "../../components/IadmModal";
import { useBrandKit } from "../../brand/BrandKitProvider";
import { useLumenApi } from "../../hooks/useLumenApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { BuilderShell } from "../BuilderShell";
import type { BuilderProblem } from "../problems";
import {
  addSection, addWidget, deserialise, emptyDocument, makeWidget, setPropPath,
  insertBeside, patchNode, removeWidgetsWhere, walkWidgets,
  type BuilderDocument, type Section as BuilderSection, type Widget,
} from "../model";
import {
  detailsMerge, documentLogo, parseMoney, plainLabel, readDetails,
  reconcileDetails, widgetForToken, writeDetails, type DetailRow,
} from "./documentDetails";
import { PROPOSAL_ANCHORS, requestItemAnchor } from "./refusalAnchors";
import { makeContext, type LocationLite, type RenderContext } from "../render";
import { documentTotals, money } from "../totals";
import { unfilledTokens, tagLabel } from "../merge";
import { diffDocuments, diffSummary } from "../diff";
import { locationsUsedBy, openProposalDocument, toWire } from "../proposalDoc";
import {
  applyBrandDefaults, hydrateClauses, isSavedBlock, proposalLibrary, savedIdOf,
  savedTemplateEntries, templateByKey, withTotalBeforeSignature, type ClauseRow,
} from "../templates";
import { NameBlockDialog } from "../NameBlockDialog";
import { TemplateLibrary } from "../TemplateLibrary";
import { BLANK_TEMPLATE_ID } from "../templateLibraryModel";
import {
  basisOf, buildPick, cadenceOf, fmtMoney, CatalogPicker,
  type CatalogOffering, type CatalogPrice,
} from "../../components/oliver/ProposalCatalogPicker";
/* D-156 — the atomic widgets. The adapter owns the controls only it can draw:
   which product, which location, the business's tax rate and a coupon code. */
import {
  TAG_COLOURS, TAG_PRESETS, bindingOf, findInCatalogue, resolveCatalogCard, snapshotFrom, tagOf,
} from "../widgets";
import { documentMoneySettings, totalsSettings } from "../totals";

export interface ProposalApi {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
  patch: <T>(p: string, body: unknown) => Promise<T>;
}

export interface ProposalBuilderProps {
  api: ProposalApi;
  /** Editing an existing draft, or null for a new one. */
  proposalId?: string | null;
  /**
   * Editing a REVISION of a sent document, rather than the document itself.
   *
   * §11.5's remaining item. A revision opens in THIS builder — the same
   * sections, the same widgets, the same pane — with two additions and nothing
   * else: the customer's requested changes as a checklist in the pane, and a
   * badge on every section that differs from the version the customer read.
   * There is no second editor.
   */
  revision?: { proposalId: string; revisionId: string } | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** The customer's words, one line at a time, with a tick beside each. */
interface RequestItem { text: string; done: boolean }

interface RevisionMeta {
  revision_number: number;
  document_version: number;
  status: string;
  requested_by: string | null;
  request_note: string | null;
  public_token: string | null;
}

interface ContactRow {
  contact_id: string; first_name?: string; last_name?: string;
  email?: string; company_name?: string;
}

interface LocationRow extends LocationLite { is_default?: boolean }

const rows = <T,>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

export function ProposalBuilder({ api, proposalId = null, revision = null, onClose, onSaved }: ProposalBuilderProps) {
  const { kit } = useBrandKit();
  // §9/D-121 — the ONE custom-field mechanism. The property's own fields live
  // in lumen.custom_field, which already accepts entity_kind "property", so the
  // service plan reads and writes the fields the CREW sees on the job sheet
  // rather than inventing a second store on the document.
  const lumen = useLumenApi();

  /* ── What the document is about ──────────────────────────────────────── */
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactId, setContactId] = useState("");
  // The chosen customer is REMEMBERED, not looked up in the current search
  // results: searching again must not blank the name at the top of the page.
  const [pickedContact, setPickedContact] = useState<ContactRow | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [pickedLocationIds, setPickedLocationIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  // What the proposal ROW arrived with. D-156 moved the two numbers onto the
  // Totals widget — see `docMoney` below — and these are what a document
  // written before that keeps until somebody touches the Totals panel.
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  /**
   * The business's own sales-tax rate, for the Totals panel's "Add tax".
   *
   * Read ONCE, like the catalogue, and written onto the widget when it is
   * used — never looked up at render time. See widgets/totals.ts for why.
   */
  const [businessTax, setBusinessTax] = useState<{ percent: number; label: string } | null>(null);

  /* ── The document ────────────────────────────────────────────────────── */
  const [doc, setDoc] = useState<BuilderDocument>(() => emptyDocument());
  const [resetKey, setResetKey] = useState(0);
  // A revision never starts from a template — it starts from the document the
  // customer already read.
  const [picking, setPicking] = useState(!proposalId && !revision);   // the "start from" step
  const [busy, setBusy] = useState(false);
  /**
   * A refusal, reported AT the control that was pressed (D-20 / N-1).
   *
   * The engine owns the popover (`AnchoredToast`) and the jump; this is only
   * which button and which sentence.
   *
   * 2026-09-17 — there is NO second channel any more. The pane-bottom red line
   * (`err`) was the last three refusals' home: the template save, the two
   * property-field answers and the request tick all printed at the bottom of
   * the far-left pane while the control that caused them was somewhere else
   * entirely, which is D-20 word for word. Every one of them now names its own
   * anchor, and the pane-bottom line is DELETED rather than left as a second
   * place a message can land — two homes for one fact is how they disagree.
   */
  const [refusal, setRefusal] = useState<{ anchor: string; message: string; nonce: number } | null>(null);
  const refuseRef = useRef(0);
  /** Refuse a press: the sentence appears beside the button that caused it. */
  const refuse = useCallback((anchor: string, message: string) => {
    refuseRef.current += 1;
    setRefusal({ anchor, message, nonce: refuseRef.current });
  }, []);
  /** D-36 — "Saved" said in the builder, because the builder STAYS OPEN now. */
  const [saved, setSaved] = useState<string | null>(null);
  /** Which Details box the blanks counter is sending the author to. */
  const [focusToken, setFocusToken] = useState<string | null>(null);
  /**
   * The id of the row being edited, once one exists.
   *
   * A new document used to have no id until Save, and Save closed the builder
   * — so "save, keep working, save again" made a SECOND proposal. PROP-00068
   * in the 2026-09-16 test is exactly that: an exact duplicate of 00067 that
   * could not then be deleted. The id is remembered here the moment the POST
   * answers, and every later save is a PATCH of the same row.
   */
  const [liveId, setLiveId] = useState<string | null>(proposalId ?? null);

  /* ── The revision, when this is one ──────────────────────────────────── */
  const [revMeta, setRevMeta] = useState<RevisionMeta | null>(null);
  /** The document as the customer LAST READ IT. The diff's baseline. */
  const [baseDoc, setBaseDoc] = useState<BuilderDocument | null>(null);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);

  /* ── The business's own material ─────────────────────────────────────── */
  const [clauses, setClauses] = useState<ClauseRow[]>([]);
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  /**
   * HAS THE CATALOGUE LANDED? (M-24)
   *
   * *"The shell, the pane and the canvas paint from the document alone, and
   * never block on the catalogue, the customer's locations, the clause library
   * or the brand kit — those arrive and fill in, with skeletons where they
   * land."* They already did arrive in the background; what was missing was any
   * way to tell "you have no services yet" from "your services are on their
   * way", and a picker that reads *"Nothing matches"* for half a second is a
   * picker a person stops trusting. ONE flag, cleared when the read settles
   * either way — a catalogue that FAILED must not say "loading" for ever.
   */
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ id: string; name: string; description?: string | null; document?: any; body?: any }>>([]);
  const [askOpen, setAskOpen] = useState(false);
  /** Is the "name this template" dialog up? (It replaced a `window.prompt`.) */
  const [namingTemplate, setNamingTemplate] = useState(false);
  // The business's own identity for the document header, resolved exactly the
  // way DocumentBrandFrame resolves it (the document template's logo/accent
  // beats the brand kit's — §2 step 0 says that override stays).
  const [identity, setIdentity] = useState<{ name: string; email?: string; phone?: string; website?: string; logoUrl?: string | null; accent?: string | null }>({ name: "" });

  const loadedFor = useRef<string | null>(null);

  /* ── Load once ───────────────────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([
      api.get<any>("/settings").catch(() => ({})),
      api.get<any>("/settings/invoice-template").catch(() => ({})),
    ]).then(([settings, tpl]) => setIdentity({
      name: settings.tenantFullName || settings.tenantName || "",
      email: settings.email, phone: settings.phone, website: settings.website,
      logoUrl: tpl.logoUrl || settings.logoUrl || null,
      accent: tpl.accentColor || null,
    })).catch(() => undefined);
    // include_prices=1 or every offering arrives priceless and the picker can
    // only offer "type one" — which is how the old picker under-quoted.
    api.get<any>("/catalog/offerings?include_prices=1")
      .then((r) => setOfferings(rows<CatalogOffering>(r)))
      .catch(() => setOfferings([]))
      .finally(() => setCatalogueLoading(false));
    api.get<any>("/proposal-builder/clauses").then((r) => setClauses(rows<ClauseRow>(r))).catch(() => setClauses([]));
    // The business's default sales-tax rate. A business that has not set one
    // up answers 0 and the Totals panel says so in words rather than showing
    // a rate nobody typed.
    api.get<any>("/proposal-builder/money-settings")
      .then((r) => {
        const d = (r && typeof r === "object" && "data" in r ? (r as any).data : r) || {};
        setBusinessTax({ percent: Number(d.tax_rate_percent) || 0, label: String(d.tax_rate_name || "") });
      })
      .catch(() => setBusinessTax({ percent: 0, label: "" }));
    api.get<any>("/proposal-templates").then((r) => setSavedTemplates(rows<any>(r).map((t: any) => ({
      id: t.proposal_template_id || t.template_id, name: t.name, description: t.description,
      document: t.document, body: t.body,
    })))).catch(() => setSavedTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── The customer picker asks the API, so a long list is still reachable ─ */
  useEffect(() => {
    const q = contactSearch.trim();
    const t = setTimeout(() => {
      const qs = q ? `?search=${encodeURIComponent(q)}&per_page=25` : "?per_page=25";
      api.get<any>(`/contacts${qs}`).then((r) => setContacts(rows<ContactRow>(r))).catch(() => setContacts([]));
    }, q ? 220 : 0);
    return () => clearTimeout(t);
  }, [api, contactSearch]);

  /* ── Editing an existing proposal ────────────────────────────────────── */
  useEffect(() => {
    if (!proposalId || loadedFor.current === proposalId) return;
    loadedFor.current = proposalId;
    api.get<any>(`/proposals/${proposalId}`).then((r) => {
      const row = r?.data ?? r;
      setTitle(row.title || "");
      setContactId(row.contact_id || "");
      if (row.contact_id) {
        setPickedContact({
          contact_id: row.contact_id,
          first_name: (row.customer_name || "").split(" ")[0],
          last_name: (row.customer_name || "").split(" ").slice(1).join(" "),
          email: row.customer_email, company_name: row.customer_company,
        });
      }
      setPickedLocationIds((row.location_ids || []).map((x: string) => String(x).toLowerCase()));
      if (row.valid_until) setValidUntil(String(row.valid_until).slice(0, 10));
      const opened = openProposalDocument(row) || emptyDocument();
      setDoc(applyBrandDefaults(opened, brandDefaults(kit)));
      setResetKey((k) => k + 1);
      setPicking(false);
    }).catch((e) => refuse("load", `We could not open that document: ${apiErrorMessage(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  /* ── Opening a REVISION ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!revision) return;
    const key = `rev:${revision.revisionId}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    api.get<any>(`/proposals/${revision.proposalId}/revisions/${revision.revisionId}`).then((r) => {
      const row = r?.data ?? r;
      const p = row.proposal || {};
      setTitle(p.title || "");
      setContactId(p.contact_id || "");
      if (p.contact_id) {
        setPickedContact({
          contact_id: p.contact_id,
          first_name: (p.customer_name || "").split(" ")[0],
          last_name: (p.customer_name || "").split(" ").slice(1).join(" "),
          email: p.customer_email, company_name: p.customer_company,
        });
      }
      setPickedLocationIds((p.location_ids || []).map((x: string) => String(x).toLowerCase()));
      if (p.valid_until) setValidUntil(String(p.valid_until).slice(0, 10));
      if (p.tax_rate != null) setTaxRate(String(Math.round(Number(p.tax_rate) * 10000) / 100));
      if (p.discount_amount != null) setDiscount(String(Number(p.discount_amount) || 0));
      const opened = row.document ? deserialise(row.document) : emptyDocument();
      setDoc(opened);
      setBaseDoc(row.base_document ? deserialise(row.base_document) : null);
      setRequestItems(Array.isArray(row.request_items) ? row.request_items : []);
      setRevMeta({
        revision_number: Number(row.revision_number) || 1,
        document_version: Number(row.document_version) || 2,
        status: String(row.status || "draft"),
        requested_by: row.requested_by || null,
        request_note: row.request_note || null,
        public_token: row.public_token || null,
      });
      setResetKey((k) => k + 1);
      setPicking(false);
    }).catch((e) => refuse("load", `We could not open that revision: ${apiErrorMessage(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision?.revisionId]);

  /** What this document changes, measured against what the customer read. */
  const diff = useMemo(() => diffDocuments(baseDoc, revision ? doc : null), [baseDoc, doc, revision]);

  /* ── The customer's locations, the moment a customer is chosen ───────── */
  useEffect(() => {
    if (!contactId) { setLocations([]); return; }
    api.get<any>(`/proposal-builder/customers/${contactId}/locations`)
      .then((r) => {
        const list = rows<LocationRow>(r);
        setLocations(list);
        setPickedLocationIds((prev) => {
          if (prev.length) return prev;
          const dflt = list.find((l) => l.is_default) || list[0];
          return dflt ? [String(dflt.location_id).toLowerCase()] : [];
        });
      })
      .catch(() => setLocations([]));
  }, [api, contactId]);

  const contact = pickedContact && pickedContact.contact_id === contactId
    ? pickedContact
    : contacts.find((c) => c.contact_id === contactId) || null;
  const pickedLocations = useMemo(
    () => locations.filter((l) => pickedLocationIds.includes(String(l.location_id).toLowerCase())),
    [locations, pickedLocationIds]);

  /* ── What the CUSTOMER PICK answers, on its own ──────────────────────── */
  //
  // Split out from the render context because the Details group needs to know
  // exactly this: a token these values already fill is not the author's to
  // type, and must not get a box. One list, two readers.
  const autoMerge = useMemo(() => {
    const primary = pickedLocations[0];
    const merge: Record<string, string> = {};
    const put = (k: string, v?: string | null) => { if (v && String(v).trim()) merge[k] = String(v); };
    put("customer.name", contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" "));
    put("customer.legal_name", contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" "));
    put("customer.contact_name", [contact?.first_name, contact?.last_name].filter(Boolean).join(" "));
    put("customer.email", contact?.email);
    put("property.name", primary?.name);
    put("property.address", addressLine(primary));
    put("property.access_notes", primary?.access_notes);
    put("property.gate_code", primary?.gate_code);
    put("contract.valid_until", validUntil);
    put("business.name", identity.name);
    put("business.email", identity.email);
    put("business.phone", identity.phone);
    return merge;
  }, [contact, pickedLocations, validUntil, identity]);

  /* ── The Details group: every blank is a field (D-03) ────────────────── */
  //
  // The rows live ON the document (documentDetails.ts says where and why), so
  // they save, close and reopen with it. `details` is the reconciled view the
  // panel renders: one row per token the page uses that the customer pick does
  // not already answer, plus any value the author typed for a token they have
  // since deleted.
  const details = useMemo(
    () => reconcileDetails(doc, autoMerge, declaredDetails(doc)),
    [doc, autoMerge],
  );
  const setDetail = useCallback((token: string, value: string) => {
    setDoc((d) => writeDetails(d, reconcileDetails(d, autoMerge, declaredDetails(d))
      .map((r) => (r.token === token ? { ...r, value } : r))));
  }, [autoMerge]);

  /**
   * A TOTALS WIDGET ON "YOUR BUSINESS RATE" FOLLOWS THE BUSINESS.
   *
   * The NUMBER always lives on the widget, because the customer's page and the
   * PDF are drawn by a server with no tax table. The MODE says whether to keep
   * it up to date, and this is where that happens: once, when the business's
   * rate has arrived and the document is in hand. A draft opened after the
   * rate changed shows the new one; a document set to a rate of its own is
   * never touched.
   */
  useEffect(() => {
    if (!businessTax) return;
    setDoc((d) => {
      // THE WHOLE TREE (V-2). The hand-rolled walk this replaces read the top
      // of each column, so a Totals widget the author had put inside a box —
      // a per-property subtotal, which is exactly where one goes — never
      // heard the business's rate and quietly charged 0% tax.
      let next = d;
      for (const { widget: w } of walkWidgets(d)) {
        if (w.kind !== "totals") continue;
        const st = totalsSettings(w.props);
        if (st.taxMode !== "business") continue;
        if (st.taxRatePercent === businessTax.percent && st.taxLabel === businessTax.label) continue;
        next = patchNode(next, w.id, { taxRatePercent: businessTax.percent, taxLabel: businessTax.label });
      }
      return next;
    });
  }, [businessTax]);

  /* ── The document's money ────────────────────────────────── */
  //
  // ONE MECHANISM (D-157): tax and discount are set on the Totals widget, and
  // the proposal row's `tax_rate` / `discount_amount` follow from it. The two
  // state variables below are what the row arrived with, and they are used
  // only while no Totals widget declares anything — which is every document
  // written before today.
  const docMoney = useMemo(
    () => documentMoneySettings(doc)
      ?? { taxRate: Number(taxRate) / 100, discount: Number(discount) || 0 },
    [doc, taxRate, discount],
  );

  /**
   * WHAT A COUPON CODE IS WORTH — a READ, never a redemption.
   *
   * `POST /coupons/apply` redeems: it stamps an invoice or a quote, bumps
   * `times_redeemed` and writes a redemption row. A proposal being written is
   * none of those things, and a builder that redeemed a coupon every time
   * somebody typed a code into a draft would burn a business's redemption
   * limit on documents that were never sent. So this asks what the coupon is
   * worth, and the discount is written onto the Totals widget as a number the
   * document carries.
   */
  const lookupCoupon = useCallback(async (code: string): Promise<CouponLookup> => {
    const clean = String(code || "").trim();
    if (!clean) return { ok: false, message: "Type the code first." };
    try {
      const r = await api.get<any>(`/proposal-builder/coupons/${encodeURIComponent(clean)}`);
      const d = (r && typeof r === "object" && "data" in r ? (r as any).data : r) || {};
      if (!d.code) return { ok: false, message: "We could not find that code." };
      return {
        ok: true,
        coupon: {
          code: String(d.code),
          percentOff: d.percent_off == null ? null : Number(d.percent_off),
          amountOff: d.amount_off == null ? null : Number(d.amount_off),
        },
      };
    } catch (e: any) {
      const msg = String(e?.message || "");
      return { ok: false, message: msg.includes("404") ? "We could not find that code." : "That code could not be checked just now." };
    }
  }, [api]);

  /* ── The one render context ──────────────────────────────────────────── */
  const ctx: RenderContext = useMemo(() => {
    // The typed Details first, the customer pick over the top: the customer's
    // own name is authoritative and is never something to type twice.
    const merge: Record<string, string> = { ...detailsMerge(readDetails(doc)), ...autoMerge };

    const locationMap: Record<string, LocationLite> = {};
    for (const l of locations) locationMap[String(l.location_id).toLowerCase()] = l;

    // D-39 — the title band's own logo, when the author chose one, else the
    // business's. ONE resolver: the same prop the server reads in
    // lib/proposalContext.js, so the canvas, the customer's page and the PDF
    // cannot show three different logos.
    const docLogo = documentLogo(doc);

    return makeContext(doc, {
      mode: "edit",
      merge,
      // The catalogue a Product card shows its LIVE price from. Loaded once
      // when the builder opens; a card falls back to its own snapshot when it
      // is absent, which is what the customer's page and the PDF do.
      catalogue: offerings,
      accent: doc.settings.accent || identity.accent || kit.colours.primary,
      headingFont: doc.settings.headingFont || kit.fonts.heading,
      bodyFont: doc.settings.bodyFont || kit.fonts.body,
      business: {
        name: identity.name || "Your business",
        tagline: identity.website || "",
        logoUrl: docLogo === "none" ? "" : (docLogo || identity.logoUrl || kit.logo_url),
        contactLine: [identity.email, identity.phone].filter(Boolean).join(" · "),
      },
      locations: locationMap,
      totals: documentTotals(doc, docMoney),
      // The ONE renderer draws the badges. The author's canvas and the
      // customer's revision page hand in the SAME map, so they cannot badge
      // different sections.
      ...(revision ? { changed: diff.sections } : {}),
    });
  }, [doc, autoMerge, locations, kit, identity, docMoney, offerings, revision, diff]);

  const totals = ctx.totals;

  /* ── Starting points ─────────────────────────────────────────────────── */
  const startFromTemplate = useCallback((key: string) => {
    const t = templateByKey(key);
    if (!t) return;
    const built = withTotalBeforeSignature(hydrateClauses(t.build(), clauses));
    setDoc(applyBrandDefaults(built, brandDefaults(kit)));
    if (!title.trim()) setTitle(t.name);
    setResetKey((k) => k + 1);
    setPicking(false);
  }, [clauses, kit, title]);

  /** A saved row, as a document. Used by the library's picture and by opening it. */
  const openSavedDoc = useCallback((t: { document?: any; body?: any }) => (
    t.document
      ? deserialise(t.document)
      : openProposalDocument({ blocks: t.body?.blocks ? { v: 1, blocks: t.body.blocks } : null }) || emptyDocument()
  ), []);

  const startFromSaved = useCallback((t: { id: string; name: string; document?: any; body?: any }) => {
    setDoc(applyBrandDefaults(hydrateClauses(openSavedDoc(t), clauses), brandDefaults(kit)));
    if (!title.trim()) setTitle(t.name);
    setResetKey((k) => k + 1);
    setPicking(false);
  }, [clauses, kit, title, openSavedDoc]);

  /**
   * The library's list — §11.9. The shipped templates, the business's own
   * saved ones and the empty page, all as entries with a real picture. The
   * grid, the search and the chips are TemplateLibrary's; the adapter only
   * says what a proposal template is.
   */
  const libraryOpts = useMemo(() => ({
    clauses,
    accent: identity.accent || kit.colours.primary,
    headingFont: kit.fonts.heading,
    bodyFont: kit.fonts.body,
    business: {
      name: identity.name || "Your business",
      tagline: identity.website || "",
      logoUrl: identity.logoUrl || kit.logo_url,
      contactLine: [identity.email, identity.phone].filter(Boolean).join(" · "),
    },
  }), [clauses, identity, kit]);

  const libraryEntries = useMemo(() => [
    ...proposalLibrary(libraryOpts),
    ...savedTemplateEntries(
      savedTemplates.map((t) => ({ id: t.id, name: t.name, description: t.description, document: t.document })),
      (row) => openSavedDoc(savedTemplates.find((x) => x.id === row.id) || row),
      libraryOpts,
    ),
  ], [libraryOpts, savedTemplates, openSavedDoc]);

  /** One id back from the library: a shipped key, a saved row, or the empty page. */
  const startFrom = useCallback((id: string) => {
    if (id === BLANK_TEMPLATE_ID) {
      setDoc(applyBrandDefaults(emptyDocument(), brandDefaults(kit)));
      setResetKey((k) => k + 1);
      setPicking(false);
      return;
    }
    const savedId = savedIdOf(id);
    if (savedId) {
      const row = savedTemplates.find((x) => x.id === savedId);
      if (row) startFromSaved(row);
      return;
    }
    startFromTemplate(id);
  }, [kit, savedTemplates, startFromSaved, startFromTemplate]);

  /* ── Saving ──────────────────────────────────────────────────────────── */
  const wire = useCallback(() => toWire(doc, { ...ctx, mode: "view", ...docMoney }),
    [ctx, doc, docMoney]);

  const blanks = useMemo(() => {
    const texts: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const s of doc.sections) if (s.visibility === "customer") for (const c of s.columns) for (const w of c.widgets) walk(w.props);
    return unfilledTokens(texts, ctx.merge);
  }, [doc, ctx.merge]);

  /**
   * WHAT IS STILL MISSING, in the engine's shape (A-1 / N-1).
   *
   * One problem per blank the page still carries, in plain words, each pointing
   * at the first widget that uses it — so the engine's counter button, its jump
   * and the refusal beside Send all work here exactly as they do everywhere
   * else. Stream B's own chip row is DELETED: the problems list is what says
   * what is missing, and the Details boxes are where it is typed.
   */
  const problems = useMemo<BuilderProblem[]>(() => {
    const labels = Object.fromEntries(details.map((d) => [d.token, d.label]));
    return blanks.map((token) => {
      const at = widgetForToken(doc, token);
      return {
        id: `blank:${token}`,
        message: `${plainLabel(token, labels)} is still blank.`,
        ...(at ? { focus: at } : {}),
      };
    });
  }, [blanks, details, doc]);

  /**
   * Save the document.
   *
   * @param send  email it to the customer
   * @param close leave the builder afterwards. D-36: **Save draft no longer
   *              closes it.** Three of the four builders stayed open and this
   *              one did not, so pressing Save felt like losing the document —
   *              and the only route back burned a "free revision" (D-04).
   *              "Save and close" is now its own button, which is the whole of
   *              what that behaviour was ever for.
   */
  async function save(send: boolean, close = true) {
    // N-1 / D-20: a refusal appears AT the button that was pressed. Every one
    // of these used to print in the far-left pane, 1,413px from Send.
    const anchor = send ? "send" : close ? "save-close" : "save";
    if (!title.trim()) { refuse(anchor, "Give the document a title at the top first."); return; }
    if (send && !contactId) { refuse(anchor, "Pick a customer to send it to, or press Save draft and share the link yourself."); return; }
    if (send && blanks.length) {
      const labels = Object.fromEntries(details.map((d) => [d.token, d.label]));
      const list = blanks.slice(0, 4).map((t) => plainLabel(t, labels)).join(", ");
      // Assert the PRESENCE of the thing we want, not just the absence of an
      // error: a document sent with {{plow_rate}} on it is the failure. And
      // the names are PLAIN WORDS now — "snow_trigger" was two of the four
      // names a first-time user was shown and told to go and find (D-03).
      refuse(anchor, `${blanks.length} detail${blanks.length === 1 ? " is" : "s are"} still blank (${list}). Type them into the Details boxes on the left, or take them off the page, before sending.`);
      return;
    }
    setSaved(null); setRefusal(null); setBusy(true);
    try {
      const w = wire();
      const payload = {
        contact_id: contactId || null,
        title: title.trim(),
        scope_html: w.scope_html || null,
        blocks: w.blocks,
        document: w.document,
        line_items: w.line_items,
        tax_rate: docMoney.taxRate,
        discount_amount: docMoney.discount,
        valid_until: validUntil || null,
        // The chips the author ticked, PLUS every location a property block or
        // a service plan on the page actually refers to. Accepting opens a job
        // per location from this list; a site priced on the document and
        // missing from it gets no job.
        location_ids: [...new Set([...pickedLocationIds, ...locationsUsedBy(doc)])],
      };
      // liveId, not proposalId: a document created earlier in THIS session is
      // patched, never posted again. That is the whole of D-25's duplicate.
      let id = liveId;
      let number = "";
      if (id) {
        await api.patch(`/proposals/${id}`, payload);
      } else {
        const res = await api.post<{ proposal_id: string; proposal_number: string }>("/proposals", payload);
        id = (res as any).proposal_id; number = (res as any).proposal_number;
        setLiveId(id);
      }
      let msg = number ? `Saved ${number}.` : "Saved.";
      if (send && id) {
        const sent = await api.post<{ url: string; emailed_to?: string | null }>(`/proposals/${id}/send`);
        const to = (sent as any).emailed_to;
        msg += to
          ? ` Sent to ${to}. Their link is ${(sent as any).url}`
          : ` Sent — the customer's link is ${(sent as any).url}`;
      }
      if (close || send) { onSaved(msg); return; }
      // Stay put, and SAY so. A tick that appears and nothing else moving is
      // what "it saved" looks like in every editor a business owner has used.
      setSaved(`${msg} You are still in the builder.`);
    } catch (e) {
      refuse(anchor, `Could not save: ${apiErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /* ── Saving a REVISION ───────────────────────────────────────────────── */

  /** The ticks, written straight through: a tick is work done, not a draft. */
  const toggleRequestItem = useCallback(async (index: number) => {
    if (!revision) return;
    const next = requestItems.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
    setRequestItems(next);
    try {
      await api.patch(`/proposals/${revision.proposalId}/revisions/${revision.revisionId}`, { request_items: next });
    } catch (e) {
      // Put it back. A tick that looks saved and is not is worse than one that
      // refuses: the author would work from a list that lies to them — and the
      // sentence goes beside THAT tick, not at the bottom of the pane, because
      // the box visibly un-ticking itself with no word anywhere near it is the
      // same "nothing happened" D-20 was written about.
      setRequestItems(requestItems);
      refuse(requestItemAnchor(index), `Could not save that tick: ${apiErrorMessage(e)}`);
    }
  }, [api, refuse, requestItems, revision]);

  async function saveRevision(send: boolean) {
    if (!revision) return;
    const anchor = send ? "send" : "save";
    if (send && diff.identical) {
      refuse(anchor, "Nothing has changed yet, so there is nothing to send. Edit the document first.");
      return;
    }
    if (send && blanks.length) {
      const labels = Object.fromEntries(details.map((d) => [d.token, d.label]));
      const list = blanks.slice(0, 4).map((t) => plainLabel(t, labels)).join(", ");
      refuse(anchor, `${blanks.length} detail${blanks.length === 1 ? " is" : "s are"} still blank (${list}). Type them into the Details boxes on the left, or take them off the page, before sending.`);
      return;
    }
    setSaved(null); setRefusal(null); setBusy(true);
    try {
      const w = wire();
      // D-15 — the title is the PROPOSAL's, not the revision's, so a rename in
      // this builder used to be typed, saved and silently reverted. A rename is
      // not a content edit (the same reasoning /link already runs on), so the
      // API takes a title-only PATCH in any status.
      if (title.trim()) {
        await api.patch(`/proposals/${revision.proposalId}`, { title: title.trim() })
          .catch((e) => { throw new Error(`the title could not be saved (${apiErrorMessage(e)})`); });
      }
      await api.patch(`/proposals/${revision.proposalId}/revisions/${revision.revisionId}`, {
        document: w.document,
        request_items: requestItems,
      });
      if (!send) {
        setSaved("Revision saved. The customer still sees the version they were sent.");
        return;
      }
      const sent = await api.post<any>(`/proposals/${revision.proposalId}/revisions/${revision.revisionId}/send`, {
        document: w.document,
        blocks: w.blocks,
        scope_html: w.scope_html || null,
        line_items: w.line_items,
        tax_rate: docMoney.taxRate,
        discount_amount: docMoney.discount,
      });
      const url = (sent as any)?.data?.public_url || (sent as any)?.public_url;
      onSaved(`Revision v${revMeta?.document_version ?? 2} sent — they must sign it again.${url ? ` Their link is ${url}` : ""}`);
    } catch (e) {
      refuse(anchor, `Could not ${send ? "send" : "save"} the revision: ${apiErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Save as template" — asked in the BUILDER's own dialog, not the browser's.
   *
   * It used to be a `window.prompt`: the browser's grey box, in the browser's
   * words, with a "Cancel" the author reads as cancelling the document. It is
   * the same question M-23 already answers for a saved block — name it, and one
   * line about when to use it — so it is the same dialog (`NameBlockDialog`),
   * and the note is written onto the template so the gallery row says something
   * useful instead of "Saved from …".
   */
  async function saveAsTemplate(name: string, note: string) {
    setNamingTemplate(false);
    setBusy(true);
    try {
      const w = wire();
      await api.post("/proposal-templates", {
        name,
        description: note || (title.trim() ? `Saved from “${title.trim()}”` : null),
        body: { title: title.trim() || null, tax_rate: Number(taxRate) || 0, blocks: w.blocks.blocks },
        document: w.document,
      });
      onSaved(`Saved “${name}” as a template. It is in the gallery for your next document.`);
    } catch (e) {
      refuse(PROPOSAL_ANCHORS.saveTemplate, `Could not save the template: ${apiErrorMessage(e)}`);
    } finally { setBusy(false); }
  }

  /* ── The starting-point step ─────────────────────────────────────────── */
  if (picking) {
    return (
      <TemplateLibrary
        open
        onClose={onClose}
        product="oliver"
        eyebrow="OLIVER · Document builder"
        title="Start your document"
        subtitle="Every one of these opens in your colours with your details already on it. Pick the one closest to the job, change anything, and save it as your own."
        entries={libraryEntries}
        onPick={startFrom}
      />
    );
  }

  /* ── The builder ─────────────────────────────────────────────────────── */
  return (
    <>
      <BuilderShell
        open
        onClose={onClose}
        adapter="proposal"
        resetKey={resetKey}
        eyebrow={revision
          ? `OLIVER · Revision v${revMeta?.document_version ?? 2}${revMeta?.requested_by === "customer" ? " · asked for by the customer" : ""}`
          : "OLIVER · Document builder"}
        title={
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title this document — e.g. Commercial Service Agreement"
            title="The document's title. The customer sees it in their email and at the top of the page."
            style={{
              background: "transparent", border: "none", borderBottom: "1px dashed rgba(255,255,255,0.35)",
              color: "#fff", fontSize: 15, fontWeight: 600, outline: "none", minWidth: 420, padding: "0 0 2px",
            }}
          />
        }
        subtitle={
          <CustomerBar
            search={contactSearch} onSearch={setContactSearch}
            contact={contact} contacts={contacts}
            onPickContact={(id) => { setContactId(id); setPickedContact(contacts.find((c) => c.contact_id === id) || null); }}
            locations={locations} picked={pickedLocationIds} onPickLocations={setPickedLocationIds}
          />
        }
        doc={doc}
        onChange={setDoc}
        ctx={ctx}
        /* D-156 — the interception is GONE. "Choose your plan" is a heading, a
           line of copy and a ROW OF CARDS in ONE section now, because a box can
           hold a row; the shell places it like every other ready-made section,
           in one step and therefore in one undo. */
        /* N-1 — the engine's problems mechanism, on the surface that needed it
           most. The counter in the pane, the jump, and the refusal beside the
           button that was pressed all come from these three props. */
        problems={problems}
        refusal={refusal}
        onDismissRefusal={() => setRefusal(null)}
        /* The engine scrolls the page to the blank; only this adapter knows
           that the box it is typed into is in its own Details group. */
        onFocusProblem={(problem) => {
          const token = problem.id.startsWith("blank:") ? problem.id.slice(6) : "";
          if (token) setFocusToken(token);
        }}
        /* N-2 — Ctrl+S. The "?" panel advertises it in every builder and this
           was the one that did not honour it. Save draft, which is what the
           other three do: it saves and stays open. */
        onSave={() => { void (revision ? saveRevision(false) : save(false, false)); }}
        swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
        fonts={kit.fonts.catalog.map((f) => f.value)}
        savedTemplates={savedTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          /* M-23 — a block and a template are the same saved row; a row holding
             exactly ONE section is a block, so there is one store and two
             lists rather than two stores that can disagree. */
          block: isSavedBlock(t),
          section: (t.document as { sections?: BuilderSection[] } | undefined)?.sections?.[0],
        }))}
        /* M-23 — right-click a section → name it → it is in the library under
           "Your own blocks" and in the "+" picker, on every document from now
           on. Saved through the ONE template store this builder already has. */
        onSaveBlock={async (section, name, note) => {
          try {
            await api.post("/proposal-templates", {
              name,
              description: note || `Your own block, saved from “${title.trim() || "a document"}”`,
              body: { title: null, tax_rate: 0, blocks: [] },
              document: { v: 2, settings: { style: doc.settings.style }, sections: [section] },
            });
            const r = await api.get<any>("/proposal-templates");
            setSavedTemplates(rows<any>(r).map((t: any) => ({
              id: t.proposal_template_id || t.template_id, name: t.name, description: t.description,
              document: t.document, body: t.body,
            })));
            setSaved(`Saved “${name}”. It is under “Your own blocks” whenever you press +.`);
          } catch (e) {
            refuse("save", `Could not save that block: ${apiErrorMessage(e)}`);
          }
        }}
        /* M-22 — this builder's own rows in Find, beside the engine's. */
        findActions={[
          { id: "save-draft", label: "Save draft", hint: "Keep your work and carry on" },
          { id: "send", label: "Send to customer", hint: "Email them a link to this document" },
          { id: "save-template", label: "Save as template", hint: "Start from this next time" },
          { id: "ask-argus", label: "Ask ARGUS", hint: "Have it write or rebuild a section" },
        ]}
        onFindAction={(id) => {
          if (id === "save-draft") { void save(false, false); return; }
          if (id === "send") { void save(true); return; }
          if (id === "save-template") { setNamingTemplate(true); return; }
          if (id === "ask-argus") setAskOpen(true);
        }}
        onOpenTemplate={(t) => { const full = savedTemplates.find((x) => x.id === t.id); if (full) startFromSaved(full); }}
        nextUp={null}
        askArgus={
          <button type="button" onClick={() => setAskOpen(true)}
            title="Ask ARGUS to write, rewrite or build a section. Uses AI credits."
            style={goldBtn}>
            <Sparkles size={12} /> Ask ARGUS
          </button>
        }
        widgetExtras={(w, sectionId) => (
          <WidgetExtras
            widget={w} sectionId={sectionId} doc={doc} onChange={setDoc}
            offerings={offerings} clauses={clauses} locations={locations}
            catalogueLoading={catalogueLoading}
            businessTax={businessTax} lookupCoupon={lookupCoupon}
            onSaveClause={async (c) => {
              const saved = await api.post<any>("/proposal-builder/clauses", c);
              setClauses((prev) => [...prev.filter((x) => x.clause_key !== c.clause_key), (saved as any)]);
            }}
            onSeedClauses={async (pack) => {
              await api.post("/proposal-builder/clauses/seed", { pack });
              const r = await api.get<any>("/proposal-builder/clauses");
              setClauses(rows<ClauseRow>(r));
            }}
            onLoadPropertyFields={async (locationId) => {
              try {
                const r = await lumen.get<any>(`/api/v1/custom-fields/values/property/${locationId}`);
                return rows<any>(r)
                  .filter((f) => String(f.value_text ?? "").trim())
                  .map((f) => ({ label: f.label, value: String(f.value_text), field_key: f.field_key }));
              } catch { return []; }
            }}
            onSavePropertyFields={async (locationId, propRows) => {
              // Written back through the ONE custom-field API, keyed by the
              // field the row came from — a row the author typed by hand with
              // no field behind it stays on the document and is not invented
              // into the property's record.
              const values: Record<string, string> = {};
              for (const r of propRows as any[]) {
                if (r?.field_key) values[r.field_key] = String(r.value ?? "");
              }
              if (!Object.keys(values).length) {
                refuse(PROPOSAL_ANCHORS.propertySave, "These rows are not property fields yet, so there is nothing to save back. Add them in Settings → Custom fields first.");
                return;
              }
              try {
                await lumen.put(`/api/v1/custom-fields/values/property/${locationId}`, { values });
                onSaved("Saved to the property. Your crew sees the same details on the job.");
              } catch (e) {
                refuse(PROPOSAL_ANCHORS.propertySave, `Could not save to the property: ${apiErrorMessage(e)}`);
              }
            }}
          />
        )}
        headerActions={
          revision ? (
            <>
              <button type="button" onClick={() => setAskOpen(true)} style={goldBtn}
                title="Ask ARGUS to write, rewrite or build a section. Uses AI credits.">
                <Sparkles size={13} /> Ask ARGUS
              </button>
              <button type="button" data-save-draft="1" data-builder-anchor="save" onClick={() => saveRevision(false)} disabled={busy} style={ghostBtn}
                title="Save your changes without sending. The builder stays open and the customer still sees the version they were sent.">
                {busy ? "Working…" : "Save draft"}
              </button>
              <button type="button" data-save-close="1" data-builder-anchor="save-close" onClick={() => { void saveRevision(false).then(() => onClose()); }}
                disabled={busy} style={ghostBtn} title="Save and go back to the document.">
                Save and close
              </button>
              <button type="button" data-builder-anchor="send" onClick={() => saveRevision(true)} disabled={busy || diff.identical} style={orangeBtn}
                title={diff.identical
                  ? "Nothing has changed yet — edit the document first"
                  : blanks.length
                    ? `${blanks.length} detail(s) are still blank`
                    : `Send v${revMeta?.document_version ?? 2} to the customer. They must sign it again.`}>
                {busy ? "Working…" : `Send v${revMeta?.document_version ?? 2}`}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setAskOpen(true)} style={goldBtn}
                title="Ask ARGUS to write, rewrite or build a section. Uses AI credits.">
                <Sparkles size={13} /> Ask ARGUS
              </button>
              <button type="button" data-builder-anchor={PROPOSAL_ANCHORS.saveTemplate}
                onClick={() => setNamingTemplate(true)} disabled={busy} style={ghostBtn}
                title="Save this document's sections as a template you can start from next time">
                Save as template
              </button>
              <button type="button" data-save-draft="1" data-builder-anchor="save" onClick={() => save(false, false)} disabled={busy} style={ghostBtn}
                title="Save your work and carry on. The builder stays open.">
                {busy ? "Working…" : "Save draft"}
              </button>
              <button type="button" data-save-close="1" data-builder-anchor="save-close" onClick={() => save(false, true)} disabled={busy} style={ghostBtn}
                title="Save and go back to the list. You can open it again from the row.">
                Save and close
              </button>
              <button type="button" data-builder-anchor="send" onClick={() => save(true)} disabled={busy} style={orangeBtn}
                title={blanks.length ? `${blanks.length} detail(s) are still blank` : "Email the customer a link to this document"}>
                {busy ? "Working…" : "Send to customer"}
              </button>
            </>
          )
        }
        paneHeader={
          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.4 }}>
            <div data-doc-total={totals.total} style={{ fontWeight: 600, color: "#0B1C24" }}>
              {totals.total > 0 ? `Total ${money(totals.total, ctx.currency)}` : "No priced lines yet"}
            </div>
            {/* D-35's chip row LIVED HERE and is deleted: the engine's own
                "N details still to fill in / Take me to the first one" button
                (LeftPane, from `problems`) is the one counter now, and two
                counters over one fact is how they start disagreeing. The
                Details BOXES stay — the list says what is missing, the boxes
                are where it is typed. */}
            <DetailsGroup
              rows={details}
              onSet={setDetail}
              focusToken={focusToken}
              onFocused={() => setFocusToken(null)}
            />
            {saved && (
              <div data-saved-tick="1" style={{ color: "#047857", marginTop: 6, fontWeight: 600 }}>
                ✓ {saved}
              </div>
            )}
            {revision && (
              <RequestedChanges
                items={requestItems}
                note={revMeta?.request_note || null}
                requestedBy={revMeta?.requested_by || null}
                summary={diffSummary(diff)}
                onToggle={toggleRequestItem}
              />
            )}
            {/* The pane-bottom red line IS DELETED (2026-09-17). Every refusal
                this builder can make now names its own control and the engine
                puts the sentence beside it; a second place for a message to
                land is a second place to miss it. */}
          </div>
        }
      />

      {/* M-23's dialog, reused: "Save as template" asks the same two questions
          in the same box, instead of the browser's `window.prompt`. */}
      {namingTemplate && (
        <NameBlockDialog
          title="Save this as a template"
          intro="It goes in your gallery, in your colours, with your details already on it — pick it as the starting point for your next document."
          defaultName={title.trim() || "Untitled document"}
          nameLabel="What do you call it?"
          noteLabel="One line about when to use it"
          confirmLabel="Save the template"
          onSave={(name, note) => { void saveAsTemplate(name, note); }}
          onClose={() => setNamingTemplate(false)}
        />
      )}

      {askOpen && (
        <AskArgusModal
          api={api}
          context={{
            business_name: identity.name,
            customer_name: ctx.merge["customer.name"],
            property_name: ctx.merge["property.name"],
            services: offerings.map((o) => o.name).slice(0, 40),
            clause_titles: clauses.map((c) => c.title).slice(0, 60),
          }}
          onClose={() => setAskOpen(false)}
          onAccept={(sections) => {
            let next = doc;
            for (const s of sections) next = addSection(next, s as any);
            setDoc(next);
            setResetKey((k) => k + 1);
            setAskOpen(false);
          }}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The customer's requested changes — a side note the author ticks off
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What they asked for, in their words, beside the document.
 *
 * It is a CHECKLIST rather than a paragraph because the author is working
 * through it: the question they keep asking themselves is "have I done the
 * second thing?", and a paragraph cannot answer that. The note itself is shown
 * underneath in full, so nothing is lost to the splitter.
 *
 * Ticks are saved the moment they are made — a tick is work done, not a draft,
 * and an author who ticks three things and closes the tab has still done them.
 */
function RequestedChanges({
  items, note, requestedBy, summary, onToggle,
}: {
  items: RequestItem[];
  note: string | null;
  requestedBy: string | null;
  summary: string;
  onToggle: (index: number) => void;
}) {
  const done = items.filter((i) => i.done).length;
  return (
    <div style={{
      marginTop: 8, border: "1px solid #FCD34D", background: "#FFFBEB",
      borderRadius: 6, padding: "8px 9px",
    }}>
      <div style={{ fontWeight: 700, color: "#92400E", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span>{requestedBy === "customer" ? "What the customer asked for" : "What this revision changes"}</span>
        {items.length > 0 && <span style={{ fontWeight: 600 }}>{done}/{items.length}</span>}
      </div>

      {items.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 4 }}>
          {items.map((it, i) => (
            <li key={`${i}-${it.text.slice(0, 12)}`}>
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer", color: it.done ? "#78716C" : "#451A03" }}>
                <input
                  type="checkbox"
                  checked={it.done}
                  data-builder-anchor={requestItemAnchor(i)}
                  onChange={() => onToggle(i)}
                  title={it.done ? "Mark this as not done yet" : "Tick this off once the document covers it"}
                  style={{ marginTop: 2 }}
                />
                <span style={{ textDecoration: it.done ? "line-through" : "none", lineHeight: 1.35 }}>{it.text}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : note ? (
        <div style={{ marginTop: 4, color: "#451A03", whiteSpace: "pre-wrap" }}>{note}</div>
      ) : (
        <div style={{ marginTop: 4, color: "#92400E" }}>
          No note — you started this revision yourself.
        </div>
      )}

      {items.length > 0 && note && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer", color: "#92400E", fontSize: 10 }} title="Show the message exactly as they typed it">
            Their message, in full
          </summary>
          <div style={{ marginTop: 4, color: "#451A03", whiteSpace: "pre-wrap" }}>{note}</div>
        </details>
      )}

      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #FDE68A", color: "#92400E" }}>
        {summary}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The customer, picked once
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The customer, chosen ONCE — by typing, not by scrolling.
 *
 * It was a <select> of the first page of customers, which is fine on the
 * fixture database and useless on a real one: `/contacts` pages at 50, so a
 * business with four hundred customers could not reach most of them, and the
 * one they wanted was never on screen. Typing asks the API, which already
 * matches name, email and company.
 *
 * Once a customer is chosen the bar reads like the design's: the name, the
 * locations this document covers as chips, and "change".
 */
function CustomerBar({
  search, contact, contacts, onSearch, onPickContact, locations, picked, onPickLocations,
}: {
  search: string;
  contact: ContactRow | null;
  contacts: ContactRow[];
  onSearch: (q: string) => void;
  onPickContact: (id: string) => void;
  locations: LocationRow[]; picked: string[]; onPickLocations: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = (c: ContactRow) =>
    c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "";

  if (contact && !open) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {contact.company_name ? <Building2 size={12} /> : <UserRound size={12} />}
          <span style={{ background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>
            {label(contact)}
          </span>
          <button type="button" onClick={() => setOpen(true)} title="Choose a different customer"
            style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer", fontSize: 11 }}>
            change
          </button>
        </span>
        {locations.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <MapPin size={12} />
            {locations.map((l) => {
              const id = String(l.location_id).toLowerCase();
              const on = picked.includes(id);
              return (
                <button key={id} type="button"
                  title={on ? `${l.name} is covered by this document — click to remove it` : `Add ${l.name} to this document`}
                  onClick={() => onPickLocations(on ? picked.filter((x) => x !== id) : [...picked, id])}
                  style={{
                    borderRadius: 999, padding: "2px 9px", fontSize: 11, cursor: "pointer",
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: on ? "#FFFFFF" : "transparent", color: on ? "#0B1C24" : "#fff",
                  }}>
                  {l.name}{l.city ? ` · ${l.city}` : ""}
                </button>
              );
            })}
          </span>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, position: "relative" }}>
      <UserRound size={12} />
      <input
        value={search}
        autoFocus={open}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Type a customer's name…"
        title="Choose the customer once. Every merge field on the page fills from this."
        data-customer-search="1"
        style={{
          background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.25)", padding: "3px 10px", fontSize: 11, width: 240, outline: "none",
        }}
      />
      {contacts.length > 0 && (
        <span style={{
          position: "absolute", top: "100%", left: 20, zIndex: 20, marginTop: 4, background: "#fff",
          border: "1px solid #CBD5E1", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          maxHeight: 260, overflowY: "auto", minWidth: 280,
        }}>
          {contacts.slice(0, 25).map((c) => (
            <button key={c.contact_id} type="button" title={`Use ${label(c)}`}
              onClick={() => { onPickContact(c.contact_id); onPickLocations([]); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                padding: "7px 10px", fontSize: 12, color: "#0B1C24", cursor: "pointer",
              }}>
              {label(c)}
              {c.email && <span style={{ color: "#5A7A8A" }}> · {c.email}</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Widget-specific panels: catalogue, clauses, locations
   ══════════════════════════════════════════════════════════════════════════ */

function WidgetExtras({
  widget, sectionId, doc, onChange, offerings, clauses, locations, catalogueLoading,
  businessTax, lookupCoupon,
  onSaveClause, onSeedClauses, onLoadPropertyFields, onSavePropertyFields,
}: {
  widget: Widget; sectionId: string; doc: BuilderDocument;
  onChange: (d: BuilderDocument) => void;
  offerings: CatalogOffering[]; clauses: ClauseRow[]; locations: LocationRow[];
  /** The business's own sales-tax rate, for the Totals panel. */
  businessTax: { percent: number; label: string } | null;
  /** Read-only: what a coupon code is worth. It is never redeemed from here. */
  lookupCoupon: (code: string) => Promise<CouponLookup>;
  /** M-24 — the catalogue read has not settled yet. */
  catalogueLoading?: boolean;
  onSaveClause: (c: ClauseRow) => Promise<void>;
  onSeedClauses: (pack: string) => Promise<void>;
  onLoadPropertyFields: (locationId: string) => Promise<Array<{ label: string; value: string }>>;
  onSavePropertyFields: (locationId: string, rows: Array<{ label?: string; value?: string }>) => Promise<void>;
}) {
  /**
   * WRITE THIS WIDGET'S PROPS, WHEREVER IT SITS (V-2, §11.12).
   *
   * FOUND BY DRIVING IT (verifier, 2026-09-17, on `d156/integration`): this
   * hand-rolled `sections.map(columns.map(widgets.map(…)))`, which only ever
   * looks at the TOP of a column. Every control on this panel was therefore a
   * no-op for a widget inside a box — the catalogue picker ("Use this plan",
   * loading a price onto a card, which is Brandon's literal ask), the Best
   * Price tag, the location picker, the clause picker, the logo, a price
   * line's quantity and unit price, and Totals' tax rate, discount and coupon.
   * They all appeared to work: the select moved, and the document did not.
   *
   * `patchNode` is the one write, by node id, at any depth — the same one the
   * canvas's typing and the inspector use. The hand-rolled walk is DELETED
   * rather than kept beside it, because two answers to "where is this widget"
   * is how one of them stays wrong.
   */
  const patch = (props: Record<string, unknown>) => {
    onChange(patchNode(doc, widget.id, props));
  };

  const p: any = widget.props || {};

  // A property block needs BOTH: which location it is, and what is being done
  // there. The location picker used to sit in a later branch that an early
  // return never reached, so a block could be priced but never placed.
  const locationPicker = (widget.kind === "property_plan" || widget.kind === "address_block"
    || widget.kind === "address_block") ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LBL}>Which location</span>
        <select style={INPUT} value={String(p.locationId || "")}
          title="The location this block is about. Its name and address fill in automatically."
          onChange={async (e) => {
            const locationId = e.target.value;
            // Name the block after the location unless the author has already
            // named it. The totals list one line per site and can only print
            // the name the block carries.
            const loc = locations.find((l) => String(l.location_id).toLowerCase() === locationId);
            const heading = String(p.heading || "").trim() || loc?.name || "";
            patch({ locationId, heading });
            if (widget.kind === "property_plan" && locationId) {
              const planRows = await onLoadPropertyFields(locationId);
              if (planRows.length) patch({ locationId, heading, rows: planRows });
            }
          }}>
          <option value="">Choose a location…</option>
          {locations.map((l) => (
            <option key={String(l.location_id)} value={String(l.location_id).toLowerCase()}>
              {l.name}{l.city ? ` · ${l.city}` : ""}
            </option>
          ))}
        </select>
      </div>
      {widget.kind === "property_plan" && p.locationId && (
        <button type="button" style={miniBtn} data-builder-anchor={PROPOSAL_ANCHORS.propertySave}
          title="Save what is on this page back to the property, so the crew sees the same sheet on the job"
          onClick={() => onSavePropertyFields(String(p.locationId), Array.isArray(p.rows) ? p.rows : [])}>
          Save these details to the property
        </button>
      )}
    </div>
  ) : null;

  /* ── D-156's atomic widgets ─────────────────────────────────── */

  if (widget.kind === "card") {
    return <TagControls widget={widget} patch={patch} />;
  }

  if (widget.kind === "catalog_card") {
    return (
      <CatalogCardPanel
        widget={widget} sectionId={sectionId} doc={doc} onChange={onChange}
        offerings={offerings} catalogueLoading={catalogueLoading} patch={patch}
      />
    );
  }

  if (widget.kind === "price_line") {
    return (
      <>
        <CatalogPicker
          offerings={offerings}
          loading={catalogueLoading}
          label="Fill from Products &amp; Services"
          onPick={(o, price) => {
            const pick = buildPick(o, price);
            patch({
              name: pick.parts.name, description: pick.parts.description,
              bullets: pick.parts.features, unit_price: pick.parts.unit_price,
              offering_id: pick.parts.offering_id, price_id: pick.parts.price_id,
              cadence: pick.parts.cadence,
            });
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ ...FIELD_COL, flex: 1 }}>
            <span style={LBL}>How many</span>
            <input type="number" min={0} step="1" style={INPUT} data-price-qty="1"
              title="How many of these the customer is buying"
              value={Number(p.quantity ?? 1)}
              onChange={(e) => patch({ quantity: Number(e.target.value) || 0 })} />
          </div>
          <div style={{ ...FIELD_COL, flex: 1 }}>
            <span style={LBL}>Price each</span>
            <input type="number" min={0} step="0.01" style={INPUT} data-price-unit="1"
              title="What one of them costs. The line and the total follow it."
              value={Number(p.unit_price ?? 0)}
              onChange={(e) => patch({ unit_price: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <TagControls widget={widget} patch={patch} />
      </>
    );
  }

  if (widget.kind === "totals") {
    return <TotalsPanel widget={widget} patch={patch} businessTax={businessTax} lookupCoupon={lookupCoupon} />;
  }

  // D-156: `property_block` is DELETED — a property is a box holding an
  // address block and its own priced lines, and each of those has its own
  // panel. What is left here is the rate card and the priced line.
  if (widget.kind === "pricing_table" || widget.kind === "price_line" || widget.kind === "priced_line") {
    return (
      <>
      {locationPicker}
      <CatalogPicker
        offerings={offerings}
        loading={catalogueLoading}
        label={widget.kind === "pricing_table" ? "Add a service to the table" : "Fill from Products & Services"}
        onPick={(o, price) => {
          const pick = buildPick(o, price);
          if (widget.kind === "pricing_table") {
            patch({
              rows: [...(Array.isArray(p.rows) ? p.rows : []), {
                name: pick.parts.name,
                // D-09: the BASIS the catalogue carries, in plain words — "per
                // push", "per visit", "monthly", "one-time". It was
                // `cadenceOf(price) || price.label || "Each visit"`, and
                // cadenceOf said "billed monthly" for every per-push tier
                // because that is how the tiers bill; the tier's own label says
                // what the customer is buying and now wins. "Each visit" was
                // invented here and is gone.
                basis: basisOf(price),
                // D-29: $1,200.00, not $1200.00. toFixed has no separator.
                rate: fmtMoney(pick.parts.unit_price),
                offering_id: pick.parts.offering_id, price_id: pick.parts.price_id,
              }],
            });
          } else {
            patch({
              name: pick.parts.name, description: pick.parts.description,
              features: pick.parts.features, unit_price: pick.parts.unit_price,
              offering_id: pick.parts.offering_id, price_id: pick.parts.price_id,
              cadence: pick.parts.cadence,
            });
          }
        }}
      />
      </>
    );
  }

  if (widget.kind === "clauses") {
    const used = new Set((Array.isArray(p.items) ? p.items : []).map((i: any) => i?.clause_key).filter(Boolean));
    const byCategory = new Map<string, ClauseRow[]>();
    for (const c of clauses) {
      const k = (c as any).category || "Other";
      byCategory.set(k, [...(byCategory.get(k) || []), c]);
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={LBL}>From your clause library</span>
        {!clauses.length && (
          <div style={{ border: "1px dashed #CBD5E1", borderRadius: 6, padding: 10, fontSize: 11, color: "#5A7A8A" }}>
            Your library is empty. Start from a pack and edit the words — they become yours.
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" style={miniBtn} title="Add the snow & ice starter clauses to your library"
                onClick={() => void onSeedClauses("snow_ice")}>Snow &amp; ice</button>
              <button type="button" style={miniBtn} title="Add the general service-business clauses to your library"
                onClick={() => void onSeedClauses("general")}>General</button>
            </div>
          </div>
        )}
        <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {[...byCategory.entries()].map(([cat, list]) => (
            <div key={cat}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 3 }}>{cat}</div>
              {list.map((c) => (
                <button key={c.clause_key} type="button" disabled={used.has(c.clause_key)}
                  title={used.has(c.clause_key) ? "Already on this page" : `Add “${c.title}” to this section`}
                  onClick={() => patch({ items: [...(Array.isArray(p.items) ? p.items : []).filter((i: any) => (i?.title || i?.body)), { title: c.title, body: c.body, clause_key: c.clause_key }] })}
                  style={{
                    ...miniBtn, width: "100%", justifyContent: "flex-start", marginBottom: 3,
                    opacity: used.has(c.clause_key) ? 0.45 : 1,
                  }}>
                  <Plus size={11} /> {c.title}
                </button>
              ))}
            </div>
          ))}
        </div>
        <button type="button" style={miniBtn} title="Save the clauses on this section back to your library so every document can use them"
          onClick={async () => {
            for (const i of (Array.isArray(p.items) ? p.items : [])) {
              const t = String(i?.title || "").trim();
              if (!t || !String(i?.body || "").trim()) continue;
              const key = (i?.clause_key || t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")).slice(0, 80);
              await onSaveClause({ clause_key: key, title: t, body: String(i.body), ...(i?.category ? { category: i.category } : {}) } as ClauseRow);
            }
          }}>
          Save these clauses to my library
        </button>
      </div>
    );
  }

  // D-39 — the title band's logo. §8 req 1 says every part of the title page
  // is editable; this was the one part that was not.
  if (widget.kind === "doc_header") {
    const current = String(p.logoUrl || "");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LBL}>Logo on this document</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button type="button" data-logo="brand"
            style={{ ...miniBtn, background: !current ? "#0B6E8C" : "#fff", color: !current ? "#fff" : "#334155" }}
            title="Use the logo from your brand settings — the one every document wears"
            onClick={() => patch({ logoUrl: "" })}>Your brand logo</button>
          <button type="button" data-logo="none"
            style={{ ...miniBtn, background: current === "none" ? "#0B6E8C" : "#fff", color: current === "none" ? "#fff" : "#334155" }}
            title="No picture — your business name in its place"
            onClick={() => patch({ logoUrl: "none" })}>No logo</button>
          <label style={{ ...miniBtn, cursor: "pointer" }}
            title="Upload a picture for this document only. PNG, JPG or SVG, up to 200 KB.">
            Upload a picture
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo-upload="1"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                // 200 KB, said out loud: the whole document is capped at 1 MB
                // on the way into document_json, and a 4 MB logo would take
                // the save down with a message about bytes.
                if (file.size > 200 * 1024) {
                  patch({ logoError: "That picture is larger than 200 KB. Save a smaller copy and try again." });
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => patch({ logoUrl: String(reader.result || ""), logoError: "" });
                reader.readAsDataURL(file);
              }} />
          </label>
        </div>
        {current && current !== "none" && (
          <img src={current} alt="" style={{ maxHeight: 44, maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start" }} />
        )}
        {p.logoError && <span style={{ fontSize: 10, color: "#B91C1C" }}>{String(p.logoError)}</span>}
      </div>
    );
  }

  if (locationPicker) return locationPicker;

  if (widget.kind === "key_value_table" || widget.kind === "property_plan") {
    return (
      <button type="button" style={miniBtn} title="Add another row to this list"
        onClick={() => patch({ rows: [...(Array.isArray(p.rows) ? p.rows : []), { label: "", value: "" }] })}>
        <Plus size={11} /> Add a row
      </button>
    );
  }

  return null;
}

/* `ComparisonCardsPanel` LIVED HERE and is DELETED (D-156, integration).

   It was the inspector for the `comparison_cards` composite: a catalogue
   picker that filled several cards at once, a field per card in tab order,
   and "Use this plan" per card. Every one of those is now a control on ONE
   card, in `widgets/card.ts` and `widgets/productCard.ts`, because a card is
   a widget: the picker is the catalogue card's own, the fields are its
   controls, and "Use this plan" is a button on the card it belongs to. The
   composite is deleted from the registry, from the renderers and from every
   stored document by the upgrade on the way in, so a panel for it would be a
   panel nothing can ever open. */


/* `scrollToToken` LIVED HERE and is deleted (A-1 / N-1). It was stream B's own
   scroll-to-the-blank until the engine landed a shared problems mechanism; the
   engine now selects the widget, scrolls the canvas to it and puts the caret in
   this adapter's Details box through `onFocusProblem`. One jump, not two. */

/* ══════════════════════════════════════════════════════════════════════════
   D-156 — the panels the atomic widgets need, and only the adapter can draw
   ══════════════════════════════════════════════════════════════════════════

   A widget's own fields are typed ON THE PAGE (every run with a `data-edit`
   path) or in the shared inspector's Content group. What is here is the three
   things the ENGINE cannot know: which of THIS business's products a card is
   bound to, what THIS business's tax rate is, and what a coupon code of theirs
   is worth. Exactly the reasoning D-33 settled for "Which location". */

export interface CouponLookup {
  ok: boolean;
  message?: string;
  coupon?: { code: string; percentOff: number | null; amountOff: number | null };
}

const FIELD_COL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

/**
 * ADD A TAG TO THIS CARD (D-157).
 *
 * Brandon: *"cards has a recommended section … add tag to this card … Best
 * Price & Most Popular"*. Three presets because those are the three he named,
 * a free-text box because the fourth one is somebody's own words, and a colour
 * beside it because "Best Price" in the same blue as everything else is not a
 * tag anybody notices. "Your brand colour" is the default and the first
 * choice, so a tag belongs to the business unless it is meant to shout.
 */
function TagControls({ widget, patch }: { widget: Widget; patch: (props: Record<string, unknown>) => void }) {
  const tag = tagOf(widget.props);
  return (
    <div style={FIELD_COL}>
      <span style={LBL}>Tag on this card</span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {TAG_PRESETS.map((preset) => (
          <button key={preset.text} type="button" data-tag-preset={preset.text}
            style={{
              ...miniBtn,
              background: tag?.text === preset.text ? "#0B6E8C" : "#fff",
              color: tag?.text === preset.text ? "#fff" : "#334155",
            }}
            title={`Put “${preset.text}” on this card`}
            onClick={() => patch({ tag: { text: preset.text, colour: preset.colour }, recommended: false })}>
            {preset.text}
          </button>
        ))}
        <button type="button" data-tag-clear="1" style={miniBtn} title="Take the tag off this card"
          onClick={() => patch({ tag: null, recommended: false })}>No tag</button>
      </div>
      <input style={INPUT} value={tag?.text || ""} data-tag-text="1"
        placeholder="Or type your own — “Best for corner lots”"
        title="The words on the ribbon at the top of the card"
        onChange={(e) => {
          const text = e.target.value;
          patch({ tag: text.trim() ? { text, colour: tag?.colour || "" } : null, recommended: false });
        }} />
      {tag && (
        <select style={INPUT} value={tag.colour || ""} data-tag-colour="1"
          title="The colour of the ribbon"
          onChange={(e) => patch({ tag: { text: tag.text, colour: e.target.value } })}>
          {TAG_COLOURS.map((c) => <option key={c.label} value={c.value}>{c.label}</option>)}
        </select>
      )}
    </div>
  );
}

/**
 * THE PRODUCT CARD — bound to the catalogue, live, with "Use this plan".
 *
 * Brandon: *"product cards where they can directly load products/services from
 * their actual Product Catalog"*. Picking a product writes the BINDING plus a
 * snapshot of what the catalogue said; the card draws the live figure whenever
 * the builder is holding the catalogue and the snapshot everywhere else (the
 * customer's page and the PDF, where there is no catalogue in the request).
 *
 * "Use this plan" is unchanged in meaning from the old tier block: the card is
 * an OFFER and never sums, and pressing this puts a `price_line` under it —
 * which is money, and which the total counts. Pressing it on a second card
 * replaces the line rather than adding one, because the customer buys one.
 */
function CatalogCardPanel({
  widget, sectionId, doc, onChange, offerings, catalogueLoading, patch,
}: {
  widget: Widget; sectionId: string; doc: BuilderDocument;
  onChange: (d: BuilderDocument) => void;
  offerings: CatalogOffering[];
  catalogueLoading?: boolean;
  patch: (props: Record<string, unknown>) => void;
}) {
  const p: any = widget.props || {};
  const binding = bindingOf(p);
  const resolved = resolveCatalogCard(p, offerings);
  const live = findInCatalogue(binding, offerings);

  const bind = (o: CatalogOffering, price: CatalogPrice | null) => patch({
    offeringId: o.offering_id,
    priceId: price?.price_id || "",
    snapshot: snapshotFrom(o, price),
  });

  const usePlan = () => {
    const line = makeWidget("price_line", {
      name: resolved.title,
      description: resolved.description,
      bullets: resolved.bullets,
      quantity: 1,
      unit_price: resolved.amount,
      cadence: resolved.cadence,
      ...(binding?.offeringId ? { offering_id: binding.offeringId } : {}),
      ...(binding?.priceId ? { price_id: binding.priceId } : {}),
      fromCards: widget.id,
    });
    /**
     * BESIDE THE CARD, AT ANY DEPTH (V-2).
     *
     * Both halves of this used to read the top of a column only. So for the
     * card Brandon actually builds — one of two in a row inside a box —
     * "Use this plan" filtered nothing (a stale line inside the box stayed,
     * and a second press added a second line, which the total then counted
     * TWICE) and then dropped the new line at index 0 of the section's FIRST
     * column, nowhere near the card that was pressed.
     *
     * `walkWidgets` finds the old line wherever it is; `insertNode` puts the
     * new one directly after the card among its own siblings — one card, one
     * line, in the box the author is looking at.
     */
    const next = removeWidgetsWhere(doc, (w) => (w.props as any)?.fromCards === widget.id);
    onChange(insertBeside(next, widget.id, line));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <CatalogPicker
        offerings={offerings}
        loading={catalogueLoading}
        label={binding ? "Load a different product or service" : "Load one of your products or services"}
        onPick={bind}
      />

      {binding && (
        <>
          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.45 }} data-catalog-source={resolved.source}>
            {resolved.source === "live"
              ? `Showing ${live?.offering.name} at today's catalogue price. Change the price in Products & Services and this card follows it.`
              : "This card is showing the price it was loaded with — your catalogue is not open here. Reopen the builder to refresh it."}
          </div>
          <button type="button" style={miniBtn} data-use-plan={widget.id}
            title="Put this plan on the document as a priced line, so it counts towards the total"
            onClick={usePlan}>
            Use this plan
          </button>
          {resolved.overridden.length > 0 && (
            <button type="button" style={miniBtn} data-clear-overrides="1"
              title="Throw away the words you typed over this card and show the catalogue's own again"
              onClick={() => patch({ overrides: {} })}>
              Back to the catalogue’s words
            </button>
          )}
          {/* The Binding section's `refresh` (catalogue F.2). A document a
              customer has been sent must keep the price they were quoted;
              a draft being written should follow the catalogue. */}
          <div style={FIELD_COL}>
            <span style={LBL}>Keep the price up to date</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {([["live", "Follow the catalogue"], ["snapshot", "Keep this price"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" data-refresh={mode}
                  style={{
                    ...miniBtn,
                    background: resolved.refresh === mode ? "#0B6E8C" : "#fff",
                    color: resolved.refresh === mode ? "#fff" : "#334155",
                  }}
                  title={mode === "live"
                    ? "Change the price in Products & Services and this card follows it"
                    : "Pin the figures as they are now — what a customer was quoted must not move under them"}
                  onClick={() => patch({ refresh: mode })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" style={miniBtn} data-unbind="1"
            title="Stop this card following a product. What is on it stays as typed words."
            onClick={() => patch({ offeringId: "", priceId: "" })}>
            Unlink from the catalogue
          </button>
        </>
      )}

      <TagControls widget={widget} patch={patch} />
    </div>
  );
}

/**
 * THE TOTALS PANEL — subtotal, tax rate, discount, coupon (D-157).
 *
 * Every number typed here is written ONTO the widget, never looked up at
 * render time: the customer's page and the signed PDF are drawn by a server
 * holding no tax table and no coupon table, and a figure that only existed in
 * the editor is the defect §11.10 recorded twice over.
 */
function TotalsPanel({ widget, patch, businessTax, lookupCoupon }: {
  widget: Widget;
  patch: (props: Record<string, unknown>) => void;
  businessTax: { percent: number; label: string } | null;
  lookupCoupon: (code: string) => Promise<CouponLookup>;
}) {
  const s = totalsSettings(widget.props);
  const [code, setCode] = useState(s.coupon?.code || "");
  const [note, setNote] = useState("");
  const taxOn = s.taxRatePercent != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={FIELD_COL}>
        <span style={LBL}>Tax</span>
        {/* THREE STATES, each said out loud (catalogue F.1.3 `tax_mode`). A
            tick box could only say two of them, and the difference between
            "your business rate" and "this document's own rate" is whether a
            rate that changes tomorrow reaches a draft that has not gone out. */}
        <select style={INPUT} value={s.taxMode} data-tax-mode="1"
          title="Where this document's tax rate comes from"
          onChange={(e) => {
            const mode = e.target.value as "business" | "document" | "none";
            if (mode === "none") return patch({ taxMode: "none", taxRatePercent: null, taxLabel: "" });
            if (mode === "business") {
              return patch({
                taxMode: "business",
                taxRatePercent: businessTax?.percent ?? 0,
                taxLabel: businessTax?.label || "",
              });
            }
            patch({ taxMode: "document", taxRatePercent: s.taxRatePercent ?? businessTax?.percent ?? 0 });
          }}>
          <option value="none">No tax on this document</option>
          <option value="business">Your business rate</option>
          <option value="document">A rate for this document only</option>
        </select>
        {taxOn && (
          <>
            <input type="number" min={0} max={100} step="0.001" style={INPUT} data-tax-rate="1"
              disabled={s.taxMode === "business"}
              title={s.taxMode === "business"
                ? "This follows your business rate. Choose “a rate for this document only” to type a different one."
                : "The rate this document is taxed at, as a percentage"}
              value={Number(s.taxRatePercent ?? 0)}
              onChange={(e) => patch({ taxRatePercent: Number(e.target.value) || 0 })} />
            <span style={{ fontSize: 10, color: "#94A3B8" }}>
              {s.taxMode === "business"
                ? (businessTax && businessTax.percent
                  ? `Your business rate is ${businessTax.percent}%${businessTax.label ? ` (${businessTax.label})` : ""}. Change it in your books and every draft follows.`
                  : "You have no business rate set up yet. Set one up in your books, or choose “a rate for this document only”.")
                : "Typed here, and it stays as typed even if your business rate changes."}
            </span>
          </>
        )}
      </div>

      <div style={FIELD_COL}>
        <span style={LBL}>Discount</span>
        <input type="number" min={0} max={100} step="0.1" style={INPUT} data-discount-pct="1"
          title="A percentage off the subtotal"
          value={Number(s.discountPercent || 0)}
          onChange={(e) => patch({ discountPercent: Number(e.target.value) || 0 })} />
        <span style={{ fontSize: 10, color: "#94A3B8" }}>Per cent off the subtotal. Leave it at 0 for none.</span>
      </div>

      <div style={FIELD_COL}>
        <span style={LBL}>Coupon code</span>
        <div style={{ display: "flex", gap: 5 }}>
          <input style={{ ...INPUT, flex: 1 }} value={code} data-coupon-code="1"
            placeholder="SPRING25"
            title="One of your own coupon codes. We check what it is worth and put it on the document."
            onChange={(e) => { setCode(e.target.value); setNote(""); }} />
          <button type="button" style={miniBtn} data-coupon-apply="1"
            title="Check this code and take it off the total"
            onClick={async () => {
              const r = await lookupCoupon(code);
              if (!r.ok || !r.coupon) { setNote(r.message || "We could not find that code."); return; }
              patch({ coupon: r.coupon });
              setNote(r.coupon.percentOff
                ? `${r.coupon.code} takes ${r.coupon.percentOff}% off.`
                : `${r.coupon.code} takes ${fmtMoney(Number(r.coupon.amountOff || 0))} off.`);
            }}>Use it</button>
        </div>
        {s.coupon && (
          <button type="button" style={miniBtn} data-coupon-clear="1"
            title="Take this coupon off the document"
            onClick={() => { patch({ coupon: null }); setCode(""); setNote(""); }}>
            Take “{s.coupon.code}” off
          </button>
        )}
        {note && <span style={{ fontSize: 10, color: "#5A7A8A" }} data-coupon-note="1">{note}</span>}
        <span style={{ fontSize: 10, color: "#94A3B8" }}>
          Nothing is redeemed while you are writing. The coupon is counted when the work is invoiced.
        </span>
      </div>
    </div>
  );
}

/* `CatalogPicker` LIVED HERE and is DELETED (D-156 stream B). There were two
   catalogue pickers — this one, which every money widget used, and an
   unreachable one in components/oliver/ProposalCatalogPicker.tsx that nothing
   imported. It moved into that file, beside `buildPick` and `cadenceOf`, which
   are the readers it depends on; the unreachable one is gone. One picker,
   opened from the product card, the priced line, the pricing table and the
   property block. */

/* ══════════════════════════════════════════════════════════════════════════
   Ask ARGUS
   ══════════════════════════════════════════════════════════════════════════ */

function AskArgusModal({ api, context, onClose, onAccept }: {
  api: ProposalApi;
  context: Record<string, unknown>;
  onClose: () => void;
  onAccept: (sections: unknown[]) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<"section" | "document">("section");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sections: any[]; note: string } | null>(null);

  async function ask() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<any>("/proposal-builder/argus/draft", { instruction, scope, context });
      setResult((r as any).data ?? r);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <IadmModal open onClose={onClose} product="argus" eyebrow="Ask ARGUS" z={70}
      title="Have ARGUS draft this for you"
      subtitle="ARGUS writes sections you can then edit like anything else. It never invents a price."
      size="info"
      footer={
        <>
          <button type="button" style={ghostDark} onClick={onClose} title="Close without adding anything">Cancel</button>
          {result
            ? <button type="button" style={orangeBtn} title="Add these sections to the end of the document"
              onClick={() => onAccept(result.sections)}>Add {result.sections.length} section{result.sections.length === 1 ? "" : "s"}</button>
            : <button type="button" style={orangeBtn} disabled={busy || !instruction.trim()} onClick={ask}
              title="Send this to ARGUS. Uses AI credits.">{busy ? "Thinking…" : "Ask ARGUS"}</button>}
        </>
      }>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["section", "document"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setScope(k)}
              title={k === "section" ? "One section" : "Several sections — a whole document"}
              style={{ ...miniBtn, background: scope === k ? "#0B1C24" : "#fff", color: scope === k ? "#fff" : "#334155" }}>
              {k === "section" ? "One section" : "A whole document"}
            </button>
          ))}
        </div>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} style={{ ...INPUT, resize: "vertical" }}
          placeholder="e.g. Write a scope-of-services section for commercial snow plowing with a 2 inch trigger"
          title="Say what you want in plain English" />
        {error && <div style={{ fontSize: 12, color: "#B91C1C" }}>{error}</div>}
        {result && (
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12, background: "#F8FAFC" }}>
            <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 8 }}>{result.note}</div>
            {result.sections.map((s: any, i: number) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                <strong>{s.label || `Section ${i + 1}`}</strong>
                <span style={{ color: "#5A7A8A" }}> — {s.columns?.[0]?.widgets?.length ?? 0} part(s)</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#94A3B8" }}>
          ARGUS returns sections, never finished markup, so everything it writes stays editable on the page.
        </div>
      </div>
    </IadmModal>
  );
}

/* ── small shared bits ───────────────────────────────────────────────────── */

const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A" };
const INPUT: React.CSSProperties = { border: "1px solid #CBD5E1", borderRadius: 4, padding: "6px 8px", fontSize: 12, background: "#fff", color: "#0B1C24", width: "100%" };
const miniBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #CBD5E1", background: "#fff", borderRadius: 4, padding: "5px 9px", fontSize: 11, fontWeight: 600, color: "#334155", cursor: "pointer" };
const goldBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "#FEC82C", border: "1px solid #FEC82C", color: "#1A3A4A", borderRadius: 4, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const orangeBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "#EF6C33", border: "1px solid #EF6C33", color: "#fff", borderRadius: 4, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 4, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostDark: React.CSSProperties = { ...miniBtn, padding: "7px 12px", fontSize: 12 };

/**
 * The plain-word labels and help a TEMPLATE declares for its own merge fields.
 *
 * A template that writes `{{snow_trigger}}` into a clause is the only thing
 * that knows the field means "start plowing at this many inches". It says so
 * in a `meta.details` map on the section it wrote, and the Details group reads
 * it — which is how the group shows "Trigger depth" and a sentence of help
 * instead of `snow_trigger`.
 */
function declaredDetails(doc: BuilderDocument): Record<string, { label: string; help?: string }> {
  const out: Record<string, { label: string; help?: string }> = {};
  for (const s of doc.sections) {
    const declared = (s as any)?.meta?.details;
    if (!declared || typeof declared !== "object") continue;
    for (const [token, spec] of Object.entries(declared as Record<string, any>)) {
      if (!spec) continue;
      const label = typeof spec === "string" ? spec : String(spec.label ?? "");
      if (!label) continue;
      out[token] = { label, ...(typeof spec === "object" && spec.help ? { help: String(spec.help) } : {}) };
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   The Details group — D-03's answer
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every blank the document carries, as a box with a plain-word label.
 *
 * Nothing in here is a token. "Service term starts", "Trigger depth", "Severe
 * event threshold" — the words a home-services owner would use — and one line
 * of help under any the template explained. Filled boxes collapse behind
 * "N filled", so a document with nine merge fields and two blanks shows the
 * two.
 */
function DetailsGroup({ rows, onSet, focusToken, onFocused }: {
  rows: DetailRow[];
  onSet: (token: string, value: string) => void;
  focusToken: string | null;
  onFocused: () => void;
}) {
  const [showFilled, setShowFilled] = useState(false);
  const boxes = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!focusToken) return;
    const el = boxes.current[focusToken];
    if (el) { el.focus(); el.select(); }
    onFocused();
  }, [focusToken, onFocused]);

  if (!rows.length) return null;
  const blank = rows.filter((r) => !String(r.value ?? "").trim());
  const filled = rows.filter((r) => String(r.value ?? "").trim());
  const shown = showFilled ? rows : blank;

  return (
    <div data-details-group="1" style={{
      marginTop: 8, border: "1px solid #DBE7ED", background: "#fff",
      borderRadius: 6, padding: "8px 9px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ ...LBL, color: "#0B1C24" }}>Details</span>
        {filled.length > 0 && (
          <button type="button" onClick={() => setShowFilled((v) => !v)}
            title={showFilled ? "Show only the ones still blank" : "Show the ones already filled in too"}
            style={{ background: "none", border: "none", color: "#1A7DB5", fontSize: 10, cursor: "pointer", padding: 0 }}>
            {showFilled ? "Hide the filled ones" : `${filled.length} filled`}
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: "#5A7A8A", margin: "2px 0 6px", lineHeight: 1.4 }}>
        These are the blanks on the page. Type them here — never over the top of the words on the document.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((r) => (
          <label key={r.token} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#0B1C24" }}>{r.label}</span>
            <input
              ref={(el) => { boxes.current[r.token] = el; }}
              data-detail-token={r.token}
              style={{ ...INPUT, borderColor: String(r.value ?? "").trim() ? "#CBD5E1" : "#F59E0B" }}
              value={r.value}
              placeholder={r.help || `Type the ${r.label.toLowerCase()}`}
              title={r.help || `${r.label} — it fills in wherever the document asks for it`}
              onChange={(e) => onSet(r.token, e.target.value)}
            />
            {r.help && <span style={{ fontSize: 10, color: "#94A3B8" }}>{r.help}</span>}
          </label>
        ))}
        {!shown.length && (
          <div style={{ fontSize: 11, color: "#047857" }}>Nothing is blank. This document is ready to send.</div>
        )}
      </div>
    </div>
  );
}

function addressLine(l?: LocationRow | null): string {
  if (!l) return "";
  return [l.address_line1, l.address_line2, [l.city, l.state].filter(Boolean).join(", "), l.postal_code]
    .filter((x) => String(x ?? "").trim()).join(", ");
}

function brandDefaults(kit: ReturnType<typeof useBrandKit>["kit"]) {
  return { accent: kit.colours.primary, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body };
}

export default ProposalBuilder;
