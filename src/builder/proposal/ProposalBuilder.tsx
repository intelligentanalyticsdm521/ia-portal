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
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { BuilderShell } from "../BuilderShell";
import {
  addSection, deserialise, emptyDocument, makeWidget, setPropPath,
  type BuilderDocument, type Widget,
} from "../model";
import { makeContext, type LocationLite, type RenderContext } from "../render";
import { documentTotals, money } from "../totals";
import { unfilledTokens, tagLabel } from "../merge";
import { openProposalDocument, toWire } from "../proposalDoc";
import {
  SHIPPED_TEMPLATES, applyBrandDefaults, hydrateClauses, templateByKey, type ClauseRow,
} from "../templates";
import {
  buildPick, cadenceOf, type CatalogOffering, type CatalogPrice,
} from "../../components/oliver/ProposalCatalogPicker";

export interface ProposalApi {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
  patch: <T>(p: string, body: unknown) => Promise<T>;
}

export interface ProposalBuilderProps {
  api: ProposalApi;
  /** Editing an existing draft, or null for a new one. */
  proposalId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface ContactRow {
  contact_id: string; first_name?: string; last_name?: string;
  email?: string; company_name?: string;
}

interface LocationRow extends LocationLite { is_default?: boolean }

const rows = <T,>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

export function ProposalBuilder({ api, proposalId = null, onClose, onSaved }: ProposalBuilderProps) {
  const { kit } = useBrandKit();

  /* ── What the document is about ──────────────────────────────────────── */
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactId, setContactId] = useState("");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [pickedLocationIds, setPickedLocationIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");

  /* ── The document ────────────────────────────────────────────────────── */
  const [doc, setDoc] = useState<BuilderDocument>(() => emptyDocument());
  const [resetKey, setResetKey] = useState(0);
  const [picking, setPicking] = useState(!proposalId);   // the "start from" step
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ── The business's own material ─────────────────────────────────────── */
  const [clauses, setClauses] = useState<ClauseRow[]>([]);
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ id: string; name: string; description?: string | null; document?: any; body?: any }>>([]);
  const [askOpen, setAskOpen] = useState(false);
  // The business's own identity for the document header, resolved exactly the
  // way DocumentBrandFrame resolves it (the document template's logo/accent
  // beats the brand kit's — §2 step 0 says that override stays).
  const [identity, setIdentity] = useState<{ name: string; email?: string; phone?: string; website?: string; logoUrl?: string | null; accent?: string | null }>({ name: "" });

  const loadedFor = useRef<string | null>(null);

  /* ── Load once ───────────────────────────────────────────────────────── */
  useEffect(() => {
    api.get<any>("/contacts?limit=200").then((r) => setContacts(rows<ContactRow>(r))).catch(() => setContacts([]));
    Promise.all([
      api.get<any>("/settings").catch(() => ({})),
      api.get<any>("/settings/invoice-template").catch(() => ({})),
    ]).then(([settings, tpl]) => setIdentity({
      name: settings.tenantFullName || settings.tenantName || "",
      email: settings.email, phone: settings.phone, website: settings.website,
      logoUrl: tpl.logoUrl || settings.logoUrl || null,
      accent: tpl.accentColor || null,
    })).catch(() => undefined);
    api.get<any>("/catalog/offerings").then((r) => setOfferings(rows<CatalogOffering>(r))).catch(() => setOfferings([]));
    api.get<any>("/proposal-builder/clauses").then((r) => setClauses(rows<ClauseRow>(r))).catch(() => setClauses([]));
    api.get<any>("/proposal-templates").then((r) => setSavedTemplates(rows<any>(r).map((t: any) => ({
      id: t.proposal_template_id || t.template_id, name: t.name, description: t.description,
      document: t.document, body: t.body,
    })))).catch(() => setSavedTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Editing an existing proposal ────────────────────────────────────── */
  useEffect(() => {
    if (!proposalId || loadedFor.current === proposalId) return;
    loadedFor.current = proposalId;
    api.get<any>(`/proposals/${proposalId}`).then((r) => {
      const row = r?.data ?? r;
      setTitle(row.title || "");
      setContactId(row.contact_id || "");
      setPickedLocationIds((row.location_ids || []).map((x: string) => String(x).toLowerCase()));
      if (row.valid_until) setValidUntil(String(row.valid_until).slice(0, 10));
      const opened = openProposalDocument(row) || emptyDocument();
      setDoc(applyBrandDefaults(opened, brandDefaults(kit)));
      setResetKey((k) => k + 1);
      setPicking(false);
    }).catch((e) => setErr(apiErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

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

  const contact = contacts.find((c) => c.contact_id === contactId) || null;
  const pickedLocations = useMemo(
    () => locations.filter((l) => pickedLocationIds.includes(String(l.location_id).toLowerCase())),
    [locations, pickedLocationIds]);

  /* ── The one render context ──────────────────────────────────────────── */
  const ctx: RenderContext = useMemo(() => {
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

    const locationMap: Record<string, LocationLite> = {};
    for (const l of locations) locationMap[String(l.location_id).toLowerCase()] = l;

    return makeContext(doc, {
      mode: "edit",
      merge,
      accent: doc.settings.accent || identity.accent || kit.colours.primary,
      headingFont: doc.settings.headingFont || kit.fonts.heading,
      bodyFont: doc.settings.bodyFont || kit.fonts.body,
      business: {
        name: identity.name || "Your business",
        tagline: identity.website || "",
        logoUrl: identity.logoUrl || kit.logo_url,
        contactLine: [identity.email, identity.phone].filter(Boolean).join(" · "),
      },
      locations: locationMap,
      totals: documentTotals(doc, { taxRate: Number(taxRate) / 100, discount: Number(discount) || 0 }),
    });
  }, [doc, contact, pickedLocations, locations, kit, identity, validUntil, taxRate, discount]);

  const totals = ctx.totals;

  /* ── Starting points ─────────────────────────────────────────────────── */
  const startFromTemplate = useCallback((key: string) => {
    const t = templateByKey(key);
    if (!t) return;
    const built = hydrateClauses(t.build(), clauses);
    setDoc(applyBrandDefaults(built, brandDefaults(kit)));
    if (!title.trim()) setTitle(t.name.replace(/\s*\(.*\)$/, ""));
    setResetKey((k) => k + 1);
    setPicking(false);
  }, [clauses, kit, title]);

  const startFromSaved = useCallback((t: { id: string; name: string; document?: any; body?: any }) => {
    const opened = t.document
      ? deserialise(t.document)
      : openProposalDocument({ blocks: t.body?.blocks ? { v: 1, blocks: t.body.blocks } : null }) || emptyDocument();
    setDoc(applyBrandDefaults(hydrateClauses(opened, clauses), brandDefaults(kit)));
    if (!title.trim()) setTitle(t.name);
    setResetKey((k) => k + 1);
    setPicking(false);
  }, [clauses, kit, title]);

  /* ── Saving ──────────────────────────────────────────────────────────── */
  const wire = useCallback(() => toWire(doc, {
    ...ctx, mode: "view",
    taxRate: Number(taxRate) / 100,
    discount: Number(discount) || 0,
  }), [ctx, discount, doc, taxRate]);

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

  async function save(send: boolean) {
    if (!title.trim()) { setErr("Give the document a title at the top first."); return; }
    if (send && !contactId) { setErr("Pick a customer to send it to, or press Save draft and share the link yourself."); return; }
    if (send && blanks.length) {
      const list = blanks.slice(0, 4).map((t) => tagLabel(t)).join(", ");
      // Assert the PRESENCE of the thing we want, not just the absence of an
      // error: a document sent with {{plow_rate}} on it is the failure.
      setErr(`${blanks.length} detail${blanks.length === 1 ? " is" : "s are"} still blank (${list}). Fill them in, or remove them, before sending.`);
      return;
    }
    setErr(null); setBusy(true);
    try {
      const w = wire();
      const payload = {
        contact_id: contactId || null,
        title: title.trim(),
        scope_html: w.scope_html || null,
        blocks: w.blocks,
        document: w.document,
        line_items: w.line_items,
        tax_rate: Number(taxRate) / 100,
        discount_amount: Number(discount) || 0,
        valid_until: validUntil || null,
        location_ids: pickedLocationIds,
      };
      let id = proposalId;
      let number = "";
      if (id) {
        await api.patch(`/proposals/${id}`, payload);
      } else {
        const res = await api.post<{ proposal_id: string; proposal_number: string }>("/proposals", payload);
        id = (res as any).proposal_id; number = (res as any).proposal_number;
      }
      let msg = id && number ? `Saved ${number}.` : "Saved.";
      if (send && id) {
        const sent = await api.post<{ url: string }>(`/proposals/${id}/send`);
        msg += ` Sent — the customer's link is ${(sent as any).url}`;
      }
      onSaved(msg);
    } catch (e) {
      setErr(`Could not save: ${apiErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsTemplate() {
    const name = window.prompt("Name this template", title.trim() || "Untitled document");
    if (!name?.trim()) return;
    setBusy(true); setErr(null);
    try {
      const w = wire();
      await api.post("/proposal-templates", {
        name: name.trim(),
        description: title.trim() ? `Saved from “${title.trim()}”` : null,
        body: { title: title.trim() || null, tax_rate: Number(taxRate) || 0, blocks: w.blocks.blocks },
        document: w.document,
      });
      onSaved(`Saved “${name.trim()}” as a template. It is in the gallery for your next document.`);
    } catch (e) {
      setErr(`Could not save the template: ${apiErrorMessage(e)}`);
    } finally { setBusy(false); }
  }

  /* ── The starting-point step ─────────────────────────────────────────── */
  if (picking) {
    return (
      <StartFrom
        templates={SHIPPED_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description }))}
        saved={savedTemplates}
        onPickShipped={startFromTemplate}
        onPickSaved={startFromSaved}
        onBlank={() => { setDoc(applyBrandDefaults(emptyDocument(), brandDefaults(kit))); setResetKey((k) => k + 1); setPicking(false); }}
        onClose={onClose}
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
        eyebrow="OLIVER · Document builder"
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
            contacts={contacts} contactId={contactId} onPickContact={setContactId}
            locations={locations} picked={pickedLocationIds} onPickLocations={setPickedLocationIds}
          />
        }
        doc={doc}
        onChange={setDoc}
        ctx={ctx}
        swatches={[kit.colours.primary, kit.colours.secondary, kit.colours.accent, kit.colours.text, kit.colours.background]}
        fonts={kit.fonts.catalog.map((f) => f.value)}
        savedTemplates={savedTemplates.map((t) => ({ id: t.id, name: t.name, description: t.description }))}
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
            onSaveClause={async (c) => {
              const saved = await api.post<any>("/proposal-builder/clauses", c);
              setClauses((prev) => [...prev.filter((x) => x.clause_key !== c.clause_key), (saved as any)]);
            }}
            onSeedClauses={async (pack) => {
              await api.post("/proposal-builder/clauses/seed", { pack });
              const r = await api.get<any>("/proposal-builder/clauses");
              setClauses(rows<ClauseRow>(r));
            }}
          />
        )}
        headerActions={
          <>
            <button type="button" onClick={() => setAskOpen(true)} style={goldBtn}
              title="Ask ARGUS to write, rewrite or build a section. Uses AI credits.">
              <Sparkles size={13} /> Ask ARGUS
            </button>
            <button type="button" onClick={saveAsTemplate} disabled={busy} style={ghostBtn}
              title="Save this document's sections as a template you can start from next time">
              Save as template
            </button>
            <button type="button" onClick={() => save(false)} disabled={busy} style={ghostBtn}
              title="Save without sending. You can come back to it.">
              {busy ? "Working…" : "Save draft"}
            </button>
            <button type="button" onClick={() => save(true)} disabled={busy} style={orangeBtn}
              title={blanks.length ? `${blanks.length} detail(s) are still blank` : "Email the customer a link to this document"}>
              {busy ? "Working…" : "Send to customer"}
            </button>
          </>
        }
        paneHeader={
          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600, color: "#0B1C24" }}>
              {totals.total > 0 ? `Total ${money(totals.total, ctx.currency)}` : "No priced lines yet"}
            </div>
            {blanks.length > 0 && (
              <div style={{ color: "#B45309", marginTop: 2 }} title={blanks.map((t) => tagLabel(t)).join(", ")}>
                {blanks.length} detail{blanks.length === 1 ? "" : "s"} still blank
              </div>
            )}
            {err && <div style={{ color: "#B91C1C", marginTop: 4 }}>{err}</div>}
          </div>
        }
      />

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
   The customer, picked once
   ══════════════════════════════════════════════════════════════════════════ */

function CustomerBar({
  contacts, contactId, onPickContact, locations, picked, onPickLocations,
}: {
  contacts: ContactRow[]; contactId: string; onPickContact: (id: string) => void;
  locations: LocationRow[]; picked: string[]; onPickLocations: (ids: string[]) => void;
}) {
  const c = contacts.find((x) => x.contact_id === contactId);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {c?.company_name ? <Building2 size={12} /> : <UserRound size={12} />}
        <select
          value={contactId}
          onChange={(e) => { onPickContact(e.target.value); onPickLocations([]); }}
          title="Choose the customer once. Every merge field on the page fills from this."
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, padding: "2px 8px", fontSize: 11 }}
        >
          <option value="">Choose a customer…</option>
          {contacts.map((x) => (
            <option key={x.contact_id} value={x.contact_id} style={{ color: "#0B1C24" }}>
              {x.company_name || [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email}
            </option>
          ))}
        </select>
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

/* ══════════════════════════════════════════════════════════════════════════
   Widget-specific panels: catalogue, clauses, locations
   ══════════════════════════════════════════════════════════════════════════ */

function WidgetExtras({
  widget, sectionId, doc, onChange, offerings, clauses, locations, onSaveClause, onSeedClauses,
}: {
  widget: Widget; sectionId: string; doc: BuilderDocument;
  onChange: (d: BuilderDocument) => void;
  offerings: CatalogOffering[]; clauses: ClauseRow[]; locations: LocationRow[];
  onSaveClause: (c: ClauseRow) => Promise<void>;
  onSeedClauses: (pack: string) => Promise<void>;
}) {
  const patch = (props: Record<string, unknown>) => {
    onChange({
      ...doc,
      sections: doc.sections.map((s) => s.id !== sectionId ? s : {
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => (w.id === widget.id ? { ...w, props: { ...w.props, ...props } } : w)),
        })),
      }),
    });
  };

  const p: any = widget.props || {};

  if (widget.kind === "pricing_table" || widget.kind === "priced_line" || widget.kind === "property_block") {
    return (
      <CatalogPicker
        offerings={offerings}
        label={widget.kind === "pricing_table" ? "Add a service to the table" : widget.kind === "property_block" ? "Add a service to this property" : "Fill from Products & Services"}
        onPick={(o, price) => {
          const pick = buildPick(o, price);
          if (widget.kind === "pricing_table") {
            patch({
              rows: [...(Array.isArray(p.rows) ? p.rows : []), {
                name: pick.parts.name,
                basis: cadenceOf(price) || (price?.label ?? "Each visit"),
                rate: `$${Number(pick.parts.unit_price).toFixed(2)}`,
                offering_id: pick.parts.offering_id, price_id: pick.parts.price_id,
              }],
            });
          } else if (widget.kind === "property_block") {
            patch({
              items: [...(Array.isArray(p.items) ? p.items : []), {
                description: pick.parts.name, quantity: 1, unit_price: pick.parts.unit_price,
                cadence: pick.parts.cadence,
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

  if (widget.kind === "property_plan" || widget.kind === "property_block") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LBL}>Which location</span>
        <select style={INPUT} value={String(p.locationId || "")}
          title="The location this block is about. Its name and address fill in automatically."
          onChange={(e) => patch({ locationId: e.target.value })}>
          <option value="">Choose a location…</option>
          {locations.map((l) => (
            <option key={String(l.location_id)} value={String(l.location_id).toLowerCase()}>
              {l.name}{l.city ? ` · ${l.city}` : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (widget.kind === "key_facts" || widget.kind === "key_value_table" || widget.kind === "property_plan") {
    return (
      <button type="button" style={miniBtn} title="Add another row to this list"
        onClick={() => patch({ rows: [...(Array.isArray(p.rows) ? p.rows : []), { label: "", value: "" }] })}>
        <Plus size={11} /> Add a row
      </button>
    );
  }

  return null;
}

function CatalogPicker({ offerings, label, onPick }: {
  offerings: CatalogOffering[]; label: string;
  onPick: (o: CatalogOffering, price: CatalogPrice | null) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => offerings.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase())), [offerings, q]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={LBL}>{label}</span>
      <input style={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your services…"
        title="Search Products & Services" />
      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {list.map((o) => (
          <div key={o.offering_id}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#0B1C24" }}>{o.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {(o.prices?.length ? o.prices : [null]).map((pr, i) => (
                <button key={pr?.price_id || i} type="button" style={{ ...miniBtn, padding: "2px 7px", fontSize: 10 }}
                  title={pr ? `Adds at $${Number(pr.unit_amount ?? 0).toFixed(2)}${cadenceOf(pr) ? `, ${cadenceOf(pr)}` : ""} — the cadence is written onto the line` : "No catalogue price — starts at $0 and you type it"}
                  onClick={() => onPick(o, pr)}>
                  {pr ? `${pr.label ? `${pr.label} · ` : ""}$${Number(pr.unit_amount ?? 0).toFixed(2)}` : "No price — type one"}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div style={{ fontSize: 11, color: "#94A3B8" }}>Nothing matches “{q}”.</div>}
      </div>
    </div>
  );
}

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

/* ══════════════════════════════════════════════════════════════════════════
   "Start from" — never a blank page (§7)
   ══════════════════════════════════════════════════════════════════════════ */

function StartFrom({ templates, saved, onPickShipped, onPickSaved, onBlank, onClose }: {
  templates: Array<{ key: string; name: string; description: string }>;
  saved: Array<{ id: string; name: string; description?: string | null; document?: any; body?: any }>;
  onPickShipped: (key: string) => void;
  onPickSaved: (t: any) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  return (
    <IadmModal open onClose={onClose} product="oliver" eyebrow="OLIVER · Document builder"
      title="Start your document" size="info"
      subtitle="Templates are a starting point — open one, change anything, save it as your own."
      footer={<button type="button" style={ghostDark} onClick={onClose} title="Close">Cancel</button>}>
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
          {templates.map((t) => (
            <button key={t.key} type="button" onClick={() => onPickShipped(t.key)} title={`${t.name} — ${t.description}`}
              style={{ textAlign: "left", border: "1px solid #E2E8F0", borderRadius: 10, padding: 14, background: "#fff", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4, lineHeight: 1.4 }}>{t.description}</div>
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <div>
            <div style={LBL}>Your saved templates</div>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {saved.map((t) => (
                <button key={t.id} type="button" onClick={() => onPickSaved(t)} title={`Open “${t.name}”`}
                  style={{ textAlign: "left", border: "1px solid #E2E8F0", borderRadius: 8, padding: 10, background: "#fff", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</span>
                  {t.description && <span style={{ fontSize: 11, color: "#5A7A8A" }}> — {t.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="button" onClick={onBlank} style={{ ...miniBtn, justifySelf: "start" }}
          title="Start with nothing on the page and add sections yourself">
          <X size={11} /> Start from an empty page instead
        </button>
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

function addressLine(l?: LocationRow | null): string {
  if (!l) return "";
  return [l.address_line1, l.address_line2, [l.city, l.state].filter(Boolean).join(", "), l.postal_code]
    .filter((x) => String(x ?? "").trim()).join(", ");
}

function brandDefaults(kit: ReturnType<typeof useBrandKit>["kit"]) {
  return { accent: kit.colours.primary, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body };
}

export default ProposalBuilder;
