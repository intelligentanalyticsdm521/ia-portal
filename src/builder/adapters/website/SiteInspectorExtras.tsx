/**
 * builder/adapters/website/SiteInspectorExtras.tsx — the website inspector.
 *
 * Inspector.tsx's rule, applied to a web page:
 *
 *   "It does not edit the words. Text is typed on the page, because raw field
 *    lists are a FAIL. What lives here is everything that has no place on the
 *    page itself: how many, which source, what colour."
 *
 * On a website section that means: the pictures, the links, the icons, the
 * star ratings, the form's purpose and recipient, and how many cards there
 * are. The headline, the descriptions, the quotes and the prices are typed
 * straight onto the canvas.
 *
 * ── HOW IT KNOWS WHICH IS WHICH ───────────────────────────────────────────
 * It asks the RENDERER. `editablePaths()` reads the `data-edit` markers out of
 * the HTML the canvas is actually showing, so a field the page lets you type
 * into never appears here as well. A hand-written list beside the renderer
 * would drift the first time a renderer gained a run, and the client would get
 * the same box twice.
 *
 * ── WHERE THE FIELD SPEC COMES FROM ───────────────────────────────────────
 * arion-api, with the section catalogue — one description of a section, living
 * in `lib/websiteBuilder/sectionSchema.js`. The inputs are the Portal's
 * existing ones (`SectionFieldInputs`), so the picture picker, the alt-text
 * rule, the read-only recipient and the booking-link chip all behave here
 * exactly as they did in the sheet this replaces.
 */
import { useMemo, useState } from "react";
import { Unlock } from "lucide-react";
import type { Widget } from "../../model";
import type { RenderContext } from "../../render";
import { editablePaths } from "./siteRender";
import { repeatFieldFor, withCount, blankRow } from "./siteTemplates";
import {
  ScalarField, ParagraphsField, isHiddenSpec, smallButton,
  type FieldContext,
} from "../../../arion/components/SectionFieldInputs";
import type { SectionFieldSpec } from "../../../lib/arionApi";
import { LOCK_PROP, NODE_PROP } from "./siteModel";

export interface SiteFieldDeps {
  field: FieldContext;
  specsFor: (kind: string | null) => SectionFieldSpec[];
  /** Opens the before/after sheet. Writes nothing on its own. */
  onAdopt: (index: number, sectionId: string, label: string) => void | Promise<void>;
  /** Puts an adopted section back, byte for byte, within 30 days. */
  onUndoAdoption: (adoptionId: string) => void | Promise<void>;
  /** "Change the look" — the same words in another layout of the same kind. */
  onSwapLook: (sectionId: string, kind: string, blueprintId: string | null, label: string) => void;
  /** The catalogue entry for a kind, so "change the look" knows what exists. */
  catalogFor: (kind: string) => { variants?: Array<{ blueprintId: string; available: boolean }> } | null;
  /** Puts two roles the adapter had to guess at the right way round. */
  onSwapRoles: (sectionId: string, kind: string, list: string, roles: string[]) => void | Promise<void>;
  roleSwapBusy: boolean;
}

const L: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};

/* ══════════════════════════════════════════════════════════════════════════
   An archetype section
   ══════════════════════════════════════════════════════════════════════════ */

/** Which curated layout a section is wearing, from its own `ia:` handle. */
function blueprintOf(widget: Widget): string | null {
  const title = String((widget.props as any)?.[NODE_PROP]?.settings?._title || "");
  if (!title.startsWith("ia:")) return null;
  const id = title.split(":")[2] || "";
  return id && id !== "scratch" && id !== "library" ? id : null;
}

export function SiteSectionFields({
  widget, kind, sectionId, label, deps, ctx, onPatch,
}: {
  widget: Widget;
  kind: string;
  sectionId: string;
  label: string;
  deps: SiteFieldDeps;
  /** The render context, so the "typed on the page" set is the real one. */
  ctx: RenderContext;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const specs = deps.specsFor(kind);
  const onPage = useMemo(() => editablePaths(widget, ctx), [widget, ctx]);
  const props: any = widget.props || {};

  const repeat = repeatFieldFor(kind);
  const listSpec = repeat ? specs.find((s) => s.key === repeat) : null;
  const items: any[] = listSpec && Array.isArray(props[listSpec.key]) ? props[listSpec.key] : [];

  /** Scalars with nowhere on the page: pictures, links, choices, recipients. */
  const scalars = specs.filter((s) =>
    s.type !== "list" && !isHiddenSpec(s) && !onPage.has(s.key));

  /** A free section's two fields are structure; the canvas owns them. */
  if (kind === "content") {
    return (
      <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
        <div style={L}>Words and pictures</div>
        <p style={{ marginTop: 6 }}>
          Add headings, paragraphs, pictures, buttons and video from the panel on the left, and type
          straight onto the page. Use the toolbar above the section for one, two or three columns.
        </p>
      </div>
    );
  }

  /* "Change the look" — offered only where there IS another layout. A button
     that opens an empty list is a control that lies (D-ARION-F). */
  const variants = (deps.catalogFor(kind)?.variants || []).filter((v) => v.available);
  const blueprintId = blueprintOf(widget);
  const others = variants.filter((v) => v.blueprintId !== blueprintId);
  const adoption = (widget.props as any)?.__adoption || null;
  const roleReview: Array<{ list: string; roles: string[]; why: string }> =
    Array.isArray((widget.props as any)?.__roleReview) ? (widget.props as any).__roleReview : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {others.length > 0 && (
        <button
          type="button"
          style={{ ...smallButton, minHeight: 36 }}
          title="Keep every word and show it in a different layout. Nothing you have typed is lost."
          onClick={() => deps.onSwapLook(sectionId, kind, blueprintId, label)}
        >
          Change the look ({others.length})
        </button>
      )}

      {adoption?.adoptionId && adoption.canUndo && (
        <div style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 8, padding: 10, fontSize: 11 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>This section was built on the website.</div>
          <div style={{ color: "#475569", marginBottom: 6 }}>
            You took charge of it{adoption.adoptedAt ? ` on ${new Date(adoption.adoptedAt).toLocaleDateString()}` : ""}.
            Undo puts back the original bytes exactly.
          </div>
          <button type="button" style={{ ...smallButton, minHeight: 36 }}
            title="Put the original section back, exactly as it was"
            onClick={() => {
              if (window.confirm("Put the original section back? Anything you have typed into it here goes with it.")) {
                void deps.onUndoAdoption(String(adoption.adoptionId));
              }
            }}>
            Undo adoption
          </button>
        </div>
      )}

      {/* "We could not tell which of these two boxes is which, so check this."
          The server writes its guess down rather than letting it look like a
          decision; this is the one tap that puts it right. Rendered ONLY when
          the server raised one. */}
      {roleReview.map((r, i) => (
        <div key={i} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 10, fontSize: 11 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Worth a check</div>
          <div style={{ color: "#78350F", marginBottom: 6 }}>{r.why}</div>
          <button type="button" style={{ ...smallButton, minHeight: 36 }} disabled={deps.roleSwapBusy}
            title="Swap these two over on every card in this section"
            onClick={() => deps.onSwapRoles(sectionId, kind, r.list, r.roles as string[])}>
            {deps.roleSwapBusy ? "Working\u2026" : "Swap them over"}
          </button>
        </div>
      ))}

      {scalars.length > 0 && (
        <div>
          <div style={{ ...L, marginBottom: 8 }}>Settings</div>
          {scalars.map((s) => (
            <ScalarField
              key={s.key}
              spec={s}
              value={props[s.key]}
              siblings={props}
              onChange={(v) => onPatch({ [s.key]: v })}
              onPatch={(patch) => onPatch(patch)}
              ctx={deps.field}
            />
          ))}
        </div>
      )}

      {/* "How many?" — asked once when the section was added, adjustable here.
          Everything else about an item is typed on the page, so this panel
          only shows an item's sub-fields that have nowhere on it. */}
      {listSpec && (
        <div>
          <div style={{ ...L, marginBottom: 6 }}>
            {listSpec.label}{" "}
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
              — typed on the page
            </span>
          </div>
          <CountRow
            value={items.length}
            min={listSpec.min ?? 1}
            max={listSpec.max ?? 8}
            onSet={(n) => onPatch(withCount(props, kind, n))}
          />
          {items.map((item, i) => {
            const subs = (listSpec.item || []).filter((sub) =>
              !isHiddenSpec(sub) && !onPage.has(`${listSpec.key}.*.${sub.key}`));
            if (!subs.length) return null;
            return (
              <div key={i} style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 10, marginTop: 8, background: "#F8FAFC" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", marginBottom: 8 }}>
                  {listSpec.itemLabel || "Item"} {i + 1}
                </div>
                {subs.map((sub) => (
                  <ScalarField
                    key={sub.key}
                    spec={sub}
                    value={item?.[sub.key]}
                    siblings={item || {}}
                    onChange={(v) => onPatch({
                      [listSpec.key]: items.map((x, j) => (j === i ? { ...x, [sub.key]: v } : x)),
                    })}
                    onPatch={(patch) => onPatch({
                      [listSpec.key]: items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                    })}
                    ctx={deps.field}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* `paragraphs` fields (About's story, a form's field list) have runs on
          the page for the ones that exist, and need a control to ADD one. */}
      {specs.filter((s) => s.type === "paragraphs").map((s) => (
        <ParagraphsField
          key={s.key}
          spec={s}
          value={Array.isArray(props[s.key]) ? props[s.key] : []}
          onChange={(i, v) => onPatch({ [s.key]: (props[s.key] || []).map((x: string, j: number) => (j === i ? v : x)) })}
          onAdd={() => onPatch({ [s.key]: [...(props[s.key] || []), ""] })}
          onRemove={(i) => onPatch({ [s.key]: (props[s.key] || []).filter((_: string, j: number) => j !== i) })}
        />
      ))}
    </div>
  );
}

function CountRow({ value, min, max, onSet }: { value: number; min: number; max: number; onSet: (n: number) => void }) {
  const span = Math.min(8, max - min + 1);
  const options = Array.from({ length: span }, (_, i) => min + i);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((n) => (
          <button key={n} type="button" title={`Show ${n}`} onClick={() => onSet(n)}
            style={{
              width: 30, height: 30, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (value === n ? "#0C4A60" : "#CBD5E1"),
              background: value === n ? "#0C4A60" : "#fff",
              color: value === n ? "#fff" : "#334155",
            }}>{n}</button>
        ))}
      </div>
      <span style={{ fontSize: 10, color: "#94A3B8" }}>Asked once. Add or remove any time.</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   A section built on the website itself
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The locked block's panel.
 *
 * Two honest answers and never a third: either we can offer to take charge of
 * it — previewed, one at a time, undoable for 30 days — or we say plainly why
 * not. Nothing here edits somebody else's Elementor work in place.
 */
export function SiteLockedPanel({
  widget, sectionId, deps, busy,
}: { widget: Widget; sectionId: string; deps: SiteFieldDeps; busy: boolean }) {
  const lock: any = (widget.props || {})[LOCK_PROP] || {};
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: "#334155" }}>
      <div style={L}>Built on the website</div>
      <p style={{ lineHeight: 1.5, margin: 0 }}>
        This section was made on the website itself, so the builder keeps it exactly as it is.
        Publishing this page does not change one byte of it.
      </p>
      {lock.preview && (
        <div style={{ fontStyle: "italic", color: "#475569", borderLeft: "3px solid #CBD5E1", paddingLeft: 8 }}>
          “{lock.preview}”
        </div>
      )}
      {lock.adoptable ? (
        <>
          <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              This looks like {lock.adoptKindLabel ? `a ${String(lock.adoptKindLabel).toLowerCase()}` : "a section we know"}
              {lock.adoptConfidence ? ` (${lock.adoptConfidence} confidence)` : ""}.
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>
              We can take charge of it so you can edit it here. You see the before and after first,
              and you can undo it for 30 days.
            </div>
          </div>
          {confirming ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="abtn abtn-sky" style={{ minHeight: 36 }} disabled={busy}
                title="Take charge of this section"
                onClick={() => { setConfirming(false); void deps.onAdopt(Number(lock.index) || 0, sectionId, String(lock.label || "this section")); }}>
                {busy ? "Working…" : "Yes, make it editable"}
              </button>
              <button type="button" style={{ ...smallButton, minHeight: 36 }} onClick={() => setConfirming(false)}
                title="Leave it exactly as it is">Cancel</button>
            </div>
          ) : (
            <button type="button" style={{ ...smallButton, minHeight: 36, display: "inline-flex", alignItems: "center", gap: 6 }}
              disabled={busy} onClick={() => setConfirming(true)}
              title="Take charge of this section so you can edit it here. Undoable for 30 days.">
              <Unlock size={12} /> Make it editable
            </button>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#64748B" }}>
          {lock.why || "The builder could not work out what this section is, so it leaves it alone. "
            + "You can add a new section above or below it, or ask us to rebuild the page."}
        </div>
      )}
    </div>
  );
}
