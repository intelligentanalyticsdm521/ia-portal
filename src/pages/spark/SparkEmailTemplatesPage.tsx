// SparkEmailTemplatesPage — Email template library + visual block builder.
//
// Master/detail layout: list templates on the left, edit on the right.
// The block builder converts a JSON tree → HTML via /api/v1/email-templates/render.
// "Send test" sends a single email via /api/v1/email-templates/send.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Save, Send, Trash2, ChevronUp, ChevronDown, Copy, Eye } from "lucide-react";

type Category = "transactional" | "marketing" | "system";

interface EmailTemplate {
  id: number;
  template_key: string | null;
  name: string;
  description: string | null;
  category: Category;
  subject: string;
  preheader: string | null;
  body_html: string;
  body_text: string | null;
  blocks_json: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  is_active: boolean;
  is_system: boolean;
  send_count: number;
  last_used_at: string | null;
  updated_at: string;
}

type BlockType = "heading" | "paragraph" | "image" | "button" | "divider" | "spacer" | "html";

interface Block {
  type: BlockType;
  text?: string;
  html?: string;
  level?: number;
  align?: "left" | "center" | "right";
  src?: string;
  alt?: string;
  width?: number;
  url?: string;
  color?: string;
  background?: string;
  height?: number;
}

interface BlockTree {
  blocks: Block[];
  settings: {
    background?: string;
    contentBackground?: string;
    fontFamily?: string;
    contentWidth?: number;
  };
}

const EMPTY_TREE: BlockTree = {
  blocks: [{ type: "heading", level: 1, text: "Welcome, {{contact.first_name}}!", align: "left" }],
  settings: { background: "#F4F4F4", contentBackground: "#FFFFFF", fontFamily: "Helvetica, Arial, sans-serif", contentWidth: 600 },
};

export function SparkEmailTemplatesPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [list, setList] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<EmailTemplate>>({});
  const [tree, setTree] = useState<BlockTree>(EMPTY_TREE);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<"editor" | "preview">("editor");
  const [testEmail, setTestEmail] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const q = filter === "all" ? "?include_inactive=true" : `?category=${filter}&include_inactive=true`;
      const r = await get<{ items: EmailTemplate[] }>(`/api/v1/email-templates${q}`);
      setList(r?.items || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, filter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = useMemo(() => list.find(t => t.id === selectedId) || null, [list, selectedId]);

  // Sync draft + tree when selection changes
  useEffect(() => {
    if (!selectedId) { setDraft({}); setTree(EMPTY_TREE); return; }
    (async () => {
      try {
        const t = await get<EmailTemplate>(`/api/v1/email-templates/${selectedId}`);
        setDraft(t);
        if (t.blocks_json) { try { setTree(JSON.parse(t.blocks_json)); } catch { setTree(EMPTY_TREE); } }
        else setTree(EMPTY_TREE);
      } catch (err) { console.error(err); }
    })();
  }, [selectedId, get]);

  // Live-render the block tree as user edits
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await post<{ html: string; text: string }>("/api/v1/email-templates/render", { blocks_json: tree });
        if (!cancelled) setRenderedHtml(r?.html || "");
      } catch { /* no-op */ }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tree, post]);

  async function createNew() {
    try {
      const r = await post<EmailTemplate>("/api/v1/email-templates", {
        name: "New template", subject: "Subject line", category: "marketing",
        blocks_json: EMPTY_TREE,
      });
      await fetchList();
      setSelectedId(r.id);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function saveDraft() {
    if (!selectedId || !draft) return;
    setSaving(true);
    try {
      await put(`/api/v1/email-templates/${selectedId}`, {
        name: draft.name, subject: draft.subject, preheader: draft.preheader,
        description: draft.description, category: draft.category,
        body_html: undefined,  // let server re-render from blocks
        blocks_json: tree,
        from_name: draft.from_name, from_email: draft.from_email, reply_to: draft.reply_to,
        is_active: draft.is_active,
      });
      await fetchList();
    } catch (err) { alert(`Save failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  async function deleteTemplate() {
    if (!selectedId) return;
    if (!confirm("Deactivate this template? (System templates cannot be deleted.)")) return;
    try {
      await del(`/api/v1/email-templates/${selectedId}`);
      setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function sendTest() {
    if (!selectedId || !testEmail.trim()) return;
    try {
      const r = await post<{ subject: string; sent: boolean }>("/api/v1/email-templates/send", {
        template_id: selectedId,
        to: testEmail.trim(),
        vars: {
          "contact.first_name": "Test", "contact.last_name": "User", "contact.email": testEmail.trim(),
          "tenant.name": "Your Business", "login_url": "https://portal.intelligentanalyticsdm.com",
          "reset_url": "https://portal.intelligentanalyticsdm.com/reset",
        },
      });
      alert(`Test sent to ${testEmail}. Subject: "${r.subject}"`);
    } catch (err) { alert(`Send failed: ${(err as Error).message}`); }
  }

  function updateBlock(idx: number, patch: Partial<Block>) {
    setTree(t => ({ ...t, blocks: t.blocks.map((b, i) => i === idx ? { ...b, ...patch } : b) }));
  }
  function addBlock(type: BlockType) {
    const defaults: Record<BlockType, Block> = {
      heading: { type: "heading", level: 2, text: "New heading", align: "left" },
      paragraph: { type: "paragraph", text: "Some body copy goes here.", align: "left" },
      image: { type: "image", src: "https://via.placeholder.com/600x200", alt: "Image", width: 600, align: "center" },
      button: { type: "button", text: "Click here", url: "https://example.com", background: "#EF6C33", color: "#FFFFFF", align: "center" },
      divider: { type: "divider", color: "#E5E5E5" },
      spacer: { type: "spacer", height: 24 },
      html: { type: "html", html: "<p>Raw HTML</p>" },
    };
    setTree(t => ({ ...t, blocks: [...t.blocks, defaults[type]] }));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    setTree(t => {
      const j = idx + dir;
      if (j < 0 || j >= t.blocks.length) return t;
      const blocks = t.blocks.slice();
      [blocks[idx], blocks[j]] = [blocks[j], blocks[idx]];
      return { ...t, blocks };
    });
  }
  function deleteBlock(idx: number) {
    setTree(t => ({ ...t, blocks: t.blocks.filter((_, i) => i !== idx) }));
  }

  return (
    <SparkPageShell
      title="Email templates"
      subtitle={`${list.length} template${list.length === 1 ? "" : "s"}`}
      help="Build and manage transactional + marketing email templates. Use {{contact.first_name}} style variables — they're filled in when the email sends. Use the visual block editor to compose responsive emails."
      actions={
        <button onClick={createNew} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New template
        </button>
      }
      filters={
        <div className="flex items-center gap-2">
          {(["all", "transactional", "marketing", "system"] as const).map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border ${filter === c ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200 text-slate-600"}`}>
              {c}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* List */}
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No templates.</div>}
          {list.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === t.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{t.subject}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-600">{t.category}</span>
                  {t.is_system && <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-blue-50 text-blue-700">System</span>}
                  {!t.is_active && <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-500">Inactive</span>}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Sends: {t.send_count}</div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="lg:col-span-3">
          {!selected && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select a template to edit, or click "New template".
            </div>
          )}
          {selected && (
            <div className="border border-slate-200 rounded">
              {/* Toolbar */}
              <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreviewMode("editor")} className={`text-xs px-3 py-1 rounded ${previewMode === "editor" ? "bg-white border border-slate-300" : "text-slate-500"}`}>Edit</button>
                  <button onClick={() => setPreviewMode("preview")} className={`text-xs px-3 py-1 rounded flex items-center gap-1 ${previewMode === "preview" ? "bg-white border border-slate-300" : "text-slate-500"}`}><Eye className="h-3 w-3" /> Preview</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="text-xs border border-slate-300 rounded px-2 py-1 w-44" />
                  <button disabled={!testEmail.trim()} onClick={sendTest} className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1 disabled:opacity-50">
                    <Send className="h-3 w-3" /> Send test
                  </button>
                  <button disabled={saving} onClick={saveDraft} className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
                    <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
                  </button>
                  {!selected.is_system && (
                    <button onClick={deleteTemplate} className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Deactivate
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-slate-200">
                <Input label="Name" value={draft.name || ""} onChange={v => setDraft(d => ({ ...d, name: v }))} />
                <Input label="Subject" value={draft.subject || ""} onChange={v => setDraft(d => ({ ...d, subject: v }))} />
                <Input label="Preheader (preview text)" value={draft.preheader || ""} onChange={v => setDraft(d => ({ ...d, preheader: v }))} />
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Category</label>
                  <select value={draft.category || "marketing"} onChange={e => setDraft(d => ({ ...d, category: e.target.value as Category }))}
                    className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5">
                    <option value="transactional">Transactional</option>
                    <option value="marketing">Marketing</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <Input label="From name (optional)" value={draft.from_name || ""} onChange={v => setDraft(d => ({ ...d, from_name: v }))} />
                <Input label="From email (optional)" value={draft.from_email || ""} onChange={v => setDraft(d => ({ ...d, from_email: v }))} />
              </div>

              {/* Block builder OR preview */}
              {previewMode === "editor" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                  {/* Left: block list */}
                  <div className="space-y-2">
                    <div className="text-xs uppercase font-semibold text-slate-500">Blocks</div>
                    {tree.blocks.map((b, i) => (
                      <BlockEditor key={i} idx={i} block={b}
                        onChange={p => updateBlock(i, p)}
                        onUp={() => moveBlock(i, -1)} onDown={() => moveBlock(i, 1)}
                        onDelete={() => deleteBlock(i)}
                        onDuplicate={() => setTree(t => ({ ...t, blocks: [...t.blocks.slice(0, i + 1), { ...b }, ...t.blocks.slice(i + 1)] }))}
                      />
                    ))}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {(["heading", "paragraph", "image", "button", "divider", "spacer", "html"] as BlockType[]).map(bt => (
                        <button key={bt} onClick={() => addBlock(bt)}
                          className="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 capitalize">
                          + {bt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Right: live preview */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-3 py-2 border-b bg-slate-50">Live preview</div>
                    <iframe srcDoc={renderedHtml} className="w-full h-[600px] border-0" title="preview" />
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <iframe srcDoc={renderedHtml} className="w-full h-[700px] border border-slate-200 rounded" title="preview" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
    </div>
  );
}

function BlockEditor({ idx, block, onChange, onUp, onDown, onDelete, onDuplicate }: {
  idx: number; block: Block;
  onChange: (p: Partial<Block>) => void;
  onUp: () => void; onDown: () => void; onDelete: () => void; onDuplicate: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded p-2 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase font-bold text-slate-500">#{idx + 1} · {block.type}</div>
        <div className="flex items-center gap-1">
          <button onClick={onUp} className="p-0.5 hover:bg-slate-100 rounded"><ChevronUp className="h-3 w-3" /></button>
          <button onClick={onDown} className="p-0.5 hover:bg-slate-100 rounded"><ChevronDown className="h-3 w-3" /></button>
          <button onClick={onDuplicate} className="p-0.5 hover:bg-slate-100 rounded"><Copy className="h-3 w-3" /></button>
          <button onClick={onDelete} className="p-0.5 hover:bg-rose-50 rounded text-rose-600"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {block.type === "heading" && (
        <>
          <input value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Heading text"
            className="w-full text-sm border border-slate-200 rounded p-1.5 mb-1" />
          <div className="flex gap-1 text-[10px]">
            <select value={block.level || 2} onChange={(e) => onChange({ level: Number(e.target.value) })} className="border border-slate-200 rounded p-1">
              <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
            </select>
            <select value={block.align || "left"} onChange={(e) => onChange({ align: e.target.value as Block["align"] })} className="border border-slate-200 rounded p-1">
              <option>left</option><option>center</option><option>right</option>
            </select>
          </div>
        </>
      )}
      {block.type === "paragraph" && (
        <textarea value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} rows={3}
          placeholder="Body copy. Variables like {{contact.first_name}} are supported."
          className="w-full text-sm border border-slate-200 rounded p-1.5" />
      )}
      {block.type === "image" && (
        <div className="space-y-1">
          <input value={block.src || ""} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://image.url" className="w-full text-xs border border-slate-200 rounded p-1.5" />
          <input value={block.alt || ""} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Alt text" className="w-full text-xs border border-slate-200 rounded p-1.5" />
          <input value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="Click target URL (optional)" className="w-full text-xs border border-slate-200 rounded p-1.5" />
        </div>
      )}
      {block.type === "button" && (
        <div className="space-y-1">
          <input value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Button text" className="w-full text-xs border border-slate-200 rounded p-1.5" />
          <input value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="Destination URL" className="w-full text-xs border border-slate-200 rounded p-1.5" />
          <div className="flex gap-1">
            <input type="color" value={block.background || "#EF6C33"} onChange={(e) => onChange({ background: e.target.value })} className="w-8 h-7 border border-slate-200 rounded" />
            <input type="color" value={block.color || "#FFFFFF"} onChange={(e) => onChange({ color: e.target.value })} className="w-8 h-7 border border-slate-200 rounded" />
          </div>
        </div>
      )}
      {block.type === "spacer" && (
        <input type="number" value={block.height || 24} onChange={(e) => onChange({ height: Number(e.target.value) })} className="w-20 text-xs border border-slate-200 rounded p-1.5" />
      )}
      {block.type === "html" && (
        <textarea value={block.html || ""} onChange={(e) => onChange({ html: e.target.value })} rows={3}
          placeholder="<p>Raw HTML</p>" className="w-full font-mono text-[11px] border border-slate-200 rounded p-1.5" />
      )}
    </div>
  );
}

export default SparkEmailTemplatesPage;
