// SparkLandingPageEditor — build the page, not just the record.
//
// Landing Pages shipped with "Block editor coming in v2 — for now, the page
// is a placeholder you can publish + capture submissions on." So you could
// create a row, publish it, and have nothing on the internet behind it.
// Gating that at Pro would sell a page builder that doesn't build pages.
//
// This is deliberately a SECTION editor, not a drag-and-drop canvas. A small
// business landing page is a headline, some copy, a picture, a button and a
// way to be contacted. Anything past that is a website — which is ARION's
// job. Fixed section types also mean the server can render them safely.
import { useEffect, useState } from "react";
import { IadmModal, IadmButton } from "../IadmModal";
import { Plus, Trash2, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";

export type Block =
  | { type: "hero"; headline: string; sub?: string; image?: string }
  | { type: "text"; body: string }
  | { type: "bullets"; items: string[] }
  | { type: "cta"; label: string; href: string }
  | { type: "form"; heading?: string; submitLabel?: string; phone?: boolean; messagePlaceholder?: string };

const BLOCK_LABELS: Record<Block["type"], string> = {
  hero: "Headline + image",
  text: "Paragraph",
  bullets: "Bullet list",
  cta: "Button",
  form: "Contact form",
};

function emptyBlock(type: Block["type"]): Block {
  switch (type) {
    case "hero": return { type: "hero", headline: "", sub: "", image: "" };
    case "text": return { type: "text", body: "" };
    case "bullets": return { type: "bullets", items: [""] };
    case "cta": return { type: "cta", label: "Get a quote", href: "#form" };
    case "form": return { type: "form", heading: "Get in touch", submitLabel: "Send", phone: true };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  page: { id: number; name: string; slug: string; blocks_json?: unknown } | null;
  onSave: (blocks: Block[]) => Promise<void>;
  publicUrl?: string | null;
}

export function SparkLandingPageEditor({ open, onClose, page, onSave, publicUrl }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !page) return;
    let b = page.blocks_json;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = []; } }
    // A brand-new page starts with the shape almost every landing page wants,
    // so nobody faces an empty screen wondering what a "block" is.
    setBlocks(Array.isArray(b) && b.length ? (b as Block[]) : [
      emptyBlock("hero"), emptyBlock("text"), emptyBlock("cta"), emptyBlock("form"),
    ]);
  }, [open, page]);

  function update(i: number, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } as Block : b)));
  }
  function move(i: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  const remove = (i: number) => setBlocks((p) => p.filter((_, idx) => idx !== i));
  const add = (t: Block["type"]) => setBlocks((p) => [...p, emptyBlock(t)]);

  async function save() {
    setSaving(true);
    try { await onSave(blocks); onClose(); }
    finally { setSaving(false); }
  }

  const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none";

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · LANDING PAGE"
      title={page ? page.name : "Landing page"}
      subtitle={page ? `/${page.slug}` : undefined}
      size="info"
      footer={
        <>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="mr-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <ExternalLink className="h-3 w-3" /> View live page
            </a>
          )}
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton variant="accent" product="spark" onClick={save} disabled={saving} data-tour="landing-save">
            {saving ? "Saving…" : "Save page"}
          </IadmButton>
        </>
      }
    >
      <div className="space-y-3 p-5">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {BLOCK_LABELS[b.type]}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move down"><ArrowDown className="h-3 w-3" /></button>
                <button onClick={() => remove(i)} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="Remove"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>

            {b.type === "hero" && (
              <div className="space-y-2">
                <input className={input} value={b.headline} onChange={(e) => update(i, { headline: e.target.value })} placeholder="The one line that says what you do" />
                <input className={input} value={b.sub || ""} onChange={(e) => update(i, { sub: e.target.value })} placeholder="A supporting line (optional)" />
                <input className={input} value={b.image || ""} onChange={(e) => update(i, { image: e.target.value })} placeholder="Image URL (optional)" />
              </div>
            )}
            {b.type === "text" && (
              <textarea className={input} rows={4} value={b.body} onChange={(e) => update(i, { body: e.target.value })} placeholder="Your copy. Leave a blank line between paragraphs." />
            )}
            {b.type === "bullets" && (
              <div className="space-y-1.5">
                {b.items.map((it, k) => (
                  <div key={k} className="flex gap-1">
                    <input
                      className={input}
                      value={it}
                      onChange={(e) => update(i, { items: b.items.map((x, xi) => (xi === k ? e.target.value : x)) } as Partial<Block>)}
                      placeholder="A reason to choose you"
                    />
                    <button onClick={() => update(i, { items: b.items.filter((_, xi) => xi !== k) } as Partial<Block>)} className="rounded px-2 text-rose-500 hover:bg-rose-50">×</button>
                  </div>
                ))}
                <button onClick={() => update(i, { items: [...b.items, ""] } as Partial<Block>)} className="text-[11px] font-semibold text-[#EF6C33]">+ Add bullet</button>
              </div>
            )}
            {b.type === "cta" && (
              <div className="grid grid-cols-2 gap-2">
                <input className={input} value={b.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Button text" />
                <input className={input} value={b.href} onChange={(e) => update(i, { href: e.target.value })} placeholder="#form or https://…" />
              </div>
            )}
            {b.type === "form" && (
              <div className="space-y-2">
                <input className={input} value={b.heading || ""} onChange={(e) => update(i, { heading: e.target.value })} placeholder="Form heading" />
                <input className={input} value={b.submitLabel || ""} onChange={(e) => update(i, { submitLabel: e.target.value })} placeholder="Button text" />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={!!b.phone} onChange={(e) => update(i, { phone: e.target.checked })} />
                  Ask for a phone number
                </label>
                <p className="text-[11px] text-slate-500">Submissions land in Contacts automatically.</p>
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {(Object.keys(BLOCK_LABELS) as Block["type"][]).map((t) => (
            <button
              key={t}
              onClick={() => add(t)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-3 w-3" /> {BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </IadmModal>
  );
}

export default SparkLandingPageEditor;
