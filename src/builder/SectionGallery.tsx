/**
 * builder/SectionGallery.tsx — "Add to the page".
 *
 * The design canvas's third artboard: one dialog with three tabs — the
 * widgets this builder offers, the pre-made sections, and the business's own
 * saved templates — a search box across all of them, and filter chips.
 *
 * WHY A DIALOG AS WELL AS THE SIDE PANE: the pane is for the widget you
 * already know you want; the gallery is for "what can go here?" — it shows a
 * picture of each whole SECTION, which is the unit a business owner actually
 * thinks in ("a terms page", "a pricing page"), and the line underneath says
 * so in their words. Both routes add the same thing to the same model.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { IadmModal } from "../components/IadmModal";
import { groupForPane, widgetTooltip, type BuilderAdapter, type WidgetDef } from "./registry";
import { PREMADE_TAGS, PREMADE_SECTIONS, searchPremade, type PremadeSection } from "./templates";

export interface SavedTemplate { id: string; name: string; description?: string | null }

export interface SectionGalleryProps {
  open: boolean;
  adapter: BuilderAdapter;
  onClose: () => void;
  onPlaceSection: (premade: PremadeSection) => void;
  onPlaceWidget: (widget: WidgetDef, count?: number) => void;
  onOpenTemplate?: (t: SavedTemplate) => void;
  savedTemplates?: SavedTemplate[];
  /** The adapter's own pre-made sections. Defaults to the document ones. */
  premade?: PremadeSection[];
  /** The filter chips over those sections. */
  tags?: string[];
  /** A drawing of one pre-made section, when the adapter has its own. */
  thumb?: (key: string) => React.ReactNode;
}

type Tab = "sections" | "widgets" | "templates";

export function SectionGallery(p: SectionGalleryProps) {
  const [tab, setTab] = useState<Tab>("sections");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");
  const [picked, setPicked] = useState<string | null>(null);

  const pool = p.premade ?? PREMADE_SECTIONS;
  const tagList = p.tags ?? PREMADE_TAGS;
  const sections = useMemo(() => searchPremade(query, tag, pool), [query, tag, pool]);
  const widgets = useMemo(() => groupForPane(p.adapter, query).flatMap((g) => g.widgets), [p.adapter, query]);
  const templates = useMemo(
    () => (p.savedTemplates || []).filter((t) => !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase())),
    [p.savedTemplates, query]);

  const pickedSection = sections.find((s) => s.key === picked);

  if (!p.open) return null;

  return (
    <IadmModal
      open
      onClose={p.onClose}
      product="oliver"
      eyebrow="Add to the page"
      title="Widgets and pre-made sections"
      subtitle="Pre-made sections are starting points. Place one, then change anything on it."
      size="info"
      z={60}
      footer={
        <>
          <button type="button" style={btn} onClick={p.onClose} title="Close without adding anything">Cancel</button>
          <button
            type="button"
            style={{ ...btn, background: "#EF6C33", borderColor: "#EF6C33", color: "#fff" }}
            disabled={!pickedSection}
            title={pickedSection ? `Add “${pickedSection.name}” to the page` : "Choose a section first"}
            onClick={() => { if (pickedSection) { p.onPlaceSection(pickedSection); p.onClose(); } }}
          >
            {pickedSection ? `Place “${pickedSection.name}”` : "Place section"}
          </button>
        </>
      }
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", gap: 4, background: "#F2F6F9", borderRadius: 6, padding: 3, fontSize: 12, fontWeight: 600 }}>
            {([["sections", `Pre-made sections · ${sections.length}`], ["widgets", `Widgets · ${widgets.length}`], ["templates", `My templates · ${templates.length}`]] as Array<[Tab, string]>).map(([k, label]) => (
              <button key={k} type="button" title={label} onClick={() => setTab(k)}
                style={{
                  padding: "6px 14px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: tab === k ? "#0B1C24" : "transparent", color: tab === k ? "#fff" : "#5A7A8A",
                }}>{label}</button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #CBD5E1", borderRadius: 4, padding: "7px 10px", width: 320, background: "#fff" }}>
            <Search size={14} color="#94A3B8" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sections, widgets and templates…"
              aria-label="Search the gallery"
              style={{ border: "none", outline: "none", fontSize: 12, flex: 1 }} />
          </label>
        </div>

        {tab === "sections" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A" }}>Filter</span>
              {tagList.map((t) => (
                <button key={t} type="button" title={`Show ${t.toLowerCase()}`} onClick={() => setTag(t)}
                  style={{
                    fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "3px 9px", cursor: "pointer",
                    border: "1px solid " + (tag === t ? "#0B1C24" : "#CBD5E1"),
                    background: tag === t ? "#0B1C24" : "transparent", color: tag === t ? "#fff" : "#334155",
                  }}>{t}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, overflowY: "auto" }}>
              {sections.map((s) => (
                <button key={s.key} type="button" title={`${s.name} — ${s.description}`}
                  onDoubleClick={() => { p.onPlaceSection(s); p.onClose(); }}
                  onClick={() => setPicked(s.key)}
                  style={{
                    textAlign: "left", background: "#fff", borderRadius: 10, padding: 0, cursor: "pointer", overflow: "hidden",
                    border: "1px solid " + (picked === s.key ? "#0C4A60" : "#E2E8F0"),
                    boxShadow: picked === s.key ? "0 8px 24px rgba(0,0,0,0.08)" : "none",
                  }}>
                  {p.thumb ? p.thumb(s.key) : <SectionThumb kind={s.key} />}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.3, marginTop: 3 }}>{s.description}</div>
                  </div>
                </button>
              ))}
              {!sections.length && <Empty query={query} />}
            </div>
          </>
        )}

        {tab === "widgets" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, overflowY: "auto" }}>
            {widgets.map((w) => (
              <button key={w.kind} type="button" title={widgetTooltip(w)} data-widget-kind={w.kind}
                onClick={() => { p.onPlaceWidget(w, w.count?.default); p.onClose(); }}
                style={{ textAlign: "left", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, cursor: "pointer" }}>
                <img src={w.picture} alt="" aria-hidden="true" style={{ height: 40, width: 64, background: "#F2F6F9", borderRadius: 4 }} />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>{w.label}</div>
                <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.3, marginTop: 3 }}>{w.description}</div>
              </button>
            ))}
            {!widgets.length && <Empty query={query} />}
          </div>
        )}

        {tab === "templates" && (
          <div style={{ display: "grid", gap: 8, overflowY: "auto" }}>
            {templates.map((t) => (
              <button key={t.id} type="button" title={`Open “${t.name}” — it replaces what is on the page`}
                onClick={() => { p.onOpenTemplate?.(t); p.onClose(); }}
                style={{ textAlign: "left", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                {t.description && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 3 }}>{t.description}</div>}
              </button>
            ))}
            {!templates.length && (
              <div style={{ border: "1px dashed #CBD5E1", borderRadius: 8, padding: 24, textAlign: "center", fontSize: 12, color: "#5A7A8A" }}>
                Nothing saved yet. Build a document you like, then press “Save as template”.
              </div>
            )}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <div style={{ gridColumn: "1 / -1", border: "1px dashed #CBD5E1", borderRadius: 8, padding: 24, textAlign: "center", fontSize: 12, color: "#5A7A8A" }}>
      Nothing matches “{query}”. Clear the search to see everything again.
    </div>
  );
}

/** A drawing of the SHAPE the section makes, not an icon of a concept. */
function SectionThumb({ kind }: { kind: string }) {
  const bar = (w: string, h = 6, bg = "#E2E8F0") => <div style={{ height: h, width: w, background: bg, borderRadius: 2 }} />;
  const wrap: React.CSSProperties = { height: 110, background: "#F2F6F9", padding: 12, display: "flex", flexDirection: "column", gap: 6 };
  switch (kind) {
    case "title_dark":
      return <div style={wrap}>{<div style={{ height: 22, background: "#0B1C24", borderRadius: 3 }} />}{bar("70%", 10, "#CBD5E1")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{bar("100%")}{bar("100%")}{bar("100%")}{bar("100%")}</div></div>;
    case "title_light":
      return <div style={wrap}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: "2px solid #EF6C33" }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: "#0C4A60" }} />{bar("40%")}</div>{bar("80%", 14, "#CBD5E1")}{bar("60%")}</div>;
    case "terms": case "billing":
      return <div style={wrap}>{bar("45%", 8, "#0C4A60")}{[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>{bar("12px", 6, "#CBD5E1")}{bar("100%")}</div>))}</div>;
    case "pricing":
      return <div style={wrap}>{bar("45%", 8, "#0C4A60")}{bar("100%", 10, "#0C4A60")}{bar("100%")}{bar("100%", 6, "#F8FAFC")}{bar("100%")}</div>;
    case "acceptance":
      return <div style={wrap}>{bar("45%", 8, "#0C4A60")}{bar("90%")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
          <div style={{ height: 34, border: "1px dashed #A8CDD8", borderRadius: 4, background: "#fff" }} />
          <div style={{ height: 34, border: "1px dashed #CBD5E1", borderRadius: 4, background: "#fff" }} /></div></div>;
    case "property_plan": case "at_a_glance":
      return <div style={{ ...wrap, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", alignContent: "start" }}>
        <div style={{ gridColumn: "span 2" }}>{bar("70%", 8, "#0C4A60")}</div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i}>{bar("100%", 6, i % 2 ? "#E2E8F0" : "#CBD5E1")}</div>)}</div>;
    case "cards":
      return <div style={{ ...wrap, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 4, background: "#fff" }} />
        <div style={{ border: "2px solid #EF6C33", borderRadius: 4, background: "#fff" }} />
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 4, background: "#fff" }} /></div>;
    case "multisite":
      return <div style={wrap}>{bar("50%", 8, "#0C4A60")}{bar("100%")}{bar("80%")}{bar("40%", 8, "#0C4A60")}{bar("100%")}</div>;
    case "totals":
      return <div style={wrap}>{bar("100%")}{bar("100%")}<div style={{ height: 2, background: "#0C4A60" }} />{bar("60%", 10, "#CBD5E1")}</div>;
    default:
      return <div style={wrap}>{bar("60%", 8, "#0C4A60")}{bar("100%")}{bar("100%")}{bar("70%")}</div>;
  }
}

const btn: React.CSSProperties = {
  border: "1px solid #CBD5E1", background: "#fff", color: "#334155", borderRadius: 4,
  padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};

export default SectionGallery;
