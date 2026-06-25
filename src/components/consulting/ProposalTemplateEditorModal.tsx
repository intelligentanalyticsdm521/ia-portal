// ProposalTemplateEditorModal — F4 (Consulting Rework 2026-06-25).
//
// Founder editor for non-intake document templates: proposal / report /
// scope_of_work / custom. Backed by consulting.document_template (kind
// IN ('proposal','report','scope_of_work','custom')).
//
// Editor stack: TipTap (already in the Portal bundle — see SparkBodyEditor).
// Toolbar: Bold | Italic | Heading 2 | Bullet list | Numbered list | Link |
// Insert merge tag.
//
// Merge-tag autocomplete: typing `{{` opens a popover seeded from the
// CONSULTING_MERGE_TAGS catalog below. Click a tag → inserts the canonical
// schema token (e.g. `{{client.business_name}}`). The token is canonical
// because consulting documents are FOUNDER-authored and read by the F4 PDF
// renderer / the OLIVER proposal flow — Brandon's [[merge-tags-user-friendly]]
// rule applies to CUSTOMER-edited templates (SPARK campaigns), not to internal
// founder templates. Documented at the top of CONSULTING_MERGE_TAGS.
//
// Backed by:
//   GET    /consulting/document-templates/:id  → load row
//   POST   /consulting/document-templates       → create
//   PATCH  /consulting/document-templates/:id  → update
//
// System-seed rows (is_system_seed=1) open read-only with a "Clone to founder
// scope" action that POSTs a new founder-scope template seeded from the row.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IadmModal, CORE_BLUE } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Link as LinkIcon,
  Heading2,
  Tag as TagIcon,
  Lock,
  Copy,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

// ─── Merge-tag catalog ──────────────────────────────────────────────────
//
// Consulting documents are AUTHORED BY THE FOUNDER, not the customer. Per
// the locked rule on merge tags, customer-edited templates (SPARK
// campaigns, welcome emails) must use user-friendly token names; FOUNDER-
// edited internal templates use the canonical schema names so the F4 PDF
// renderer + the OLIVER proposal flow can resolve them deterministically.
//
// Categories track where the value comes from at render time:
//   Project     — consulting.project.*
//   Client      — lumen.contact / core.tenant of linked_tenant_id
//   Founder     — the founder's own iam.user row
//   Proposal    — the linked oliver.proposal (when this template is attached
//                 to a proposal-kind document on a project)
//   System      — derived at render time (today's date, etc.)

export interface ConsultingMergeTag {
  token: string;        // e.g. "{{client.business_name}}"
  label: string;        // human-readable, shown in autocomplete + picker
  category: "Client" | "Project" | "Founder" | "Proposal" | "System";
  description?: string;
}

export const CONSULTING_MERGE_TAGS: ConsultingMergeTag[] = [
  // Client
  { token: "{{client.business_name}}", label: "Client business name",  category: "Client",   description: "The client tenant's business name." },
  { token: "{{client.first_name}}",    label: "Client first name",     category: "Client",   description: "Primary contact's first name." },
  { token: "{{client.last_name}}",     label: "Client last name",      category: "Client",   description: "Primary contact's last name." },
  { token: "{{client.email}}",         label: "Client email",          category: "Client" },
  { token: "{{client.phone}}",         label: "Client phone",          category: "Client" },
  { token: "{{client.website}}",       label: "Client website",        category: "Client" },
  // Project
  { token: "{{project.name}}",                 label: "Project name",                category: "Project" },
  { token: "{{project.number}}",               label: "Project number",              category: "Project" },
  { token: "{{project.category_name}}",        label: "Project category",            category: "Project" },
  { token: "{{project.description}}",          label: "Project description",         category: "Project" },
  { token: "{{project.started_at}}",           label: "Project start date",          category: "Project" },
  { token: "{{project.target_completion_date}}", label: "Project target completion", category: "Project" },
  { token: "{{project.total_budget}}",         label: "Project total budget",        category: "Project" },
  { token: "{{project.next_milestone_name}}",  label: "Next milestone name",         category: "Project" },
  // Proposal (only resolves when attached to a proposal context)
  { token: "{{proposal.number}}",              label: "Proposal number",             category: "Proposal" },
  { token: "{{proposal.title}}",               label: "Proposal title",              category: "Proposal" },
  { token: "{{proposal.subtotal}}",            label: "Proposal subtotal",           category: "Proposal" },
  { token: "{{proposal.total}}",               label: "Proposal total",              category: "Proposal" },
  { token: "{{proposal.public_url}}",          label: "Proposal review link",        category: "Proposal" },
  // Founder
  { token: "{{founder.first_name}}",           label: "Founder first name",          category: "Founder" },
  { token: "{{founder.last_name}}",            label: "Founder last name",           category: "Founder" },
  { token: "{{founder.email}}",                label: "Founder email",               category: "Founder" },
  { token: "{{founder.signature_block}}",      label: "Founder signature block",     category: "Founder", description: "Full email signature (name + title + contact)." },
  // System
  { token: "{{system.today}}",                 label: "Today's date",                category: "System" },
  { token: "{{system.year}}",                  label: "Current year",                category: "System" },
];

// ─── Types ──────────────────────────────────────────────────────────────

export type ProposalTemplateKind = "proposal" | "report" | "scope_of_work" | "custom";

interface TemplateDetail {
  template_id: string;
  slug: string;
  scope: "system" | "founder" | "per_tenant";
  kind: ProposalTemplateKind;
  name: string;
  description?: string | null;
  body_md: string | null;
  version: number;
  is_system_seed: boolean | number;
}

export interface ProposalTemplateEditorModalProps {
  open: boolean;
  /** null = create mode. */
  templateId: string | null;
  kind: ProposalTemplateKind;
  onClose: () => void;
  onSaved?: () => void;
}

const KIND_LABEL: Record<ProposalTemplateKind, string> = {
  proposal:      "Proposal Template",
  report:        "Report Template",
  scope_of_work: "Scope of Work Template",
  custom:        "Custom Template",
};

function asBool(v: boolean | number | undefined): boolean {
  return typeof v === "number" ? v === 1 : !!v;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

// ─── Component ──────────────────────────────────────────────────────────

export function ProposalTemplateEditorModal({
  open, templateId, kind, onClose, onSaved,
}: ProposalTemplateEditorModalProps) {
  const { get, post, patch } = useOliverApi();

  const isCreate = !templateId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const [isSystem, setIsSystem] = useState(false);
  const [version, setVersion] = useState(1);

  // Merge-tag picker (button + autocomplete-on-{{)
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [tagFilter, setTagFilter] = useState("");

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await get<{ template: TemplateDetail }>(`/consulting/document-templates/${templateId}`);
      const t = r?.template;
      if (!t) throw new Error("Template not found.");
      setName(t.name || "");
      setSlug(t.slug || "");
      setDescription(t.description || "");
      // body_md is stored as Markdown in the DB. TipTap accepts HTML; we
      // round-trip through HTML on edit and send the html serialization
      // back to the server which is responsible for normalizing back to
      // Markdown if needed. For the F4 simplification pass we'll just
      // pass the HTML string both ways (server treats body_md as opaque
      // string).
      setBodyHtml(t.body_md || "");
      setIsSystem(asBool(t.is_system_seed));
      setVersion(t.version || 1);
    } catch (e) {
      const msg = (e as Error).message || "Could not load template";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend endpoint not deployed yet — load failed.");
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [get, templateId]);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setName("");
      setSlug("");
      setDescription("");
      setBodyHtml("");
      setIsSystem(false);
      setVersion(1);
      setErr(null);
      setInfo(null);
    } else {
      void load();
    }
  }, [open, isCreate, load]);

  // TipTap editor — same setup as SparkBodyEditor minus the SPARK-specific
  // CTA insert. We listen for `{{` to trigger the autocomplete popover.
  const readOnly = isSystem;
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] } }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer" } }),
      ],
      content: bodyHtml,
      editable: !readOnly,
      onUpdate: ({ editor }) => {
        setBodyHtml(editor.getHTML());
      },
    },
    // The editor instance must be re-created whenever templateId changes
    // (initial content must come in via the constructor — TipTap doesn't
    // update on prop change after construction).
    [templateId, readOnly],
  );

  // Sync external content changes (e.g. after load()) into the editor.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== bodyHtml) {
      // emitUpdate=false avoids re-triggering onUpdate → setBodyHtml during
      // the load() reset (would cause a state thrash). The TipTap v3 setContent
      // API takes an options object; emitUpdate is the relevant flag.
      editor.commands.setContent(bodyHtml || "", { emitUpdate: false });
    }
    // intentionally NOT depending on bodyHtml — we only want this on
    // initial load + reset, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, templateId, readOnly]);

  // Watch for `{{` to open the autocomplete popover. TipTap doesn't surface
  // raw keypress events as cleanly as a textarea, but we can hook the
  // editor.on('update') for the most recent inserted character.
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const text = editor.getText();
      // Cursor-tail substring check: look at the last 50 chars for a `{{`
      // with no closing `}}` since.
      const tail = text.slice(-50);
      const openIdx = tail.lastIndexOf("{{");
      const closeIdx = tail.lastIndexOf("}}");
      if (openIdx > closeIdx) {
        const partial = tail.slice(openIdx + 2);
        setTagFilter(partial);
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    };
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor]);

  function insertMergeTag(token: string) {
    if (!editor) return;
    // If the user typed `{{partial`, replace the partial+`{{` with the
    // full token. Otherwise just insert the token at cursor.
    if (showAutocomplete) {
      const text = editor.getText();
      const tail = text.slice(-50);
      const openIdx = tail.lastIndexOf("{{");
      const partialLen = tail.length - openIdx; // includes "{{"
      // Backspace partialLen characters by issuing a chained delete.
      editor.chain().focus().deleteRange({
        from: editor.state.selection.from - partialLen,
        to: editor.state.selection.from,
      }).insertContent(token).run();
    } else {
      editor.chain().focus().insertContent(token).run();
    }
    setShowAutocomplete(false);
    setShowTagPicker(false);
    setTagFilter("");
  }

  const filteredTags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    if (!q) return CONSULTING_MERGE_TAGS;
    return CONSULTING_MERGE_TAGS.filter((t) =>
      t.token.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
    );
  }, [tagFilter]);

  // ── Save / clone ────────────────────────────────────────────────────

  async function handleSave() {
    setErr(null);
    setInfo(null);
    if (!name.trim()) { setErr("Template name is required."); return; }
    const html = editor?.getHTML() || bodyHtml || "";
    if (!html.trim() || html === "<p></p>") {
      setErr("Body cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        kind,
        name: name.trim(),
        slug: (slug || slugify(name)).trim() || slugify(name),
        description: description.trim() || null,
        body_md: html, // server treats this as opaque string for F4
      };
      if (isCreate) {
        await post(`/consulting/document-templates`, body);
      } else {
        await patch(`/consulting/document-templates/${templateId}`, body);
      }
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || "Save failed";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend not deployed yet — save will work once the API ships.");
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCloneToFounderScope() {
    if (!templateId) return;
    setSaving(true);
    setErr(null);
    setInfo(null);
    try {
      const r = await post<{ template: { template_id: string } }>(`/consulting/document-templates`, {
        source_template_id: templateId,
        scope: "founder",
      });
      if (r?.template?.template_id) {
        setInfo("Cloned to a new founder-scope template — close this modal to see it in the library.");
      } else {
        setInfo("Clone request sent.");
      }
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || "Clone failed";
      if (/404|not.?found/i.test(msg)) {
        setErr("F4 backend not deployed yet — clone will work once the API ships.");
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow={isCreate ? `NEW ${KIND_LABEL[kind].toUpperCase()}` : readOnly ? `SYSTEM ${KIND_LABEL[kind].toUpperCase()}` : `EDIT ${KIND_LABEL[kind].toUpperCase()}`}
      title={
        <span className="inline-flex items-center gap-2">
          {readOnly && <Lock className="h-4 w-4" />}
          {isCreate ? `New ${KIND_LABEL[kind]}` : name || KIND_LABEL[kind]}
        </span>
      }
      subtitle={
        <span className="text-xs">
          {readOnly
            ? "System template — read-only. Clone to founder scope to edit."
            : "Type {{ to autocomplete merge tags. Use the Tag button for the full catalog."}
        </span>
      }
      size="info"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            Close
          </button>
          {readOnly ? (
            <button
              type="button"
              onClick={handleCloneToFounderScope}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: CORE_BLUE }}
            >
              <Copy className="h-3.5 w-3.5" />
              {saving ? "Cloning…" : "Clone to founder scope"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: CORE_BLUE }}
            >
              {saving ? "Saving…" : isCreate ? "Create template" : "Save changes"}
            </button>
          )}
        </div>
      }
    >
      <div className="flex h-full flex-col overflow-y-auto">
        {loading && (
          <div className="px-6 py-10 text-center text-sm text-slate-500">Loading template…</div>
        )}

        {!loading && (
          <div className="px-5 py-4 space-y-4">
            {err && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 inline-flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> {err}
              </div>
            )}
            {info && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {info}
              </div>
            )}

            {/* Template meta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder={name ? slugify(name) : "auto-generated from name"}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={readOnly}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b border-slate-200 pb-2 relative">
              <Toolbar editor={editor} readOnly={readOnly} onOpenPicker={() => setShowTagPicker((v) => !v)} />
              {showTagPicker && !readOnly && (
                <MergeTagPicker
                  filter={tagFilter}
                  setFilter={setTagFilter}
                  filteredTags={filteredTags}
                  onPick={insertMergeTag}
                  onClose={() => { setShowTagPicker(false); setTagFilter(""); }}
                />
              )}
            </div>

            {/* Editor surface */}
            <div className="rounded-lg border border-slate-300 bg-white relative">
              <EditorContent
                editor={editor}
                className="min-h-[300px] px-3 py-2 text-sm prose prose-sm max-w-none focus:outline-none [&_p]:my-1 [&_h2]:font-bold [&_h2]:text-base [&_h3]:font-semibold"
              />
              {showAutocomplete && !readOnly && (
                <AutocompletePopover
                  filter={tagFilter}
                  filteredTags={filteredTags}
                  onPick={insertMergeTag}
                  onClose={() => setShowAutocomplete(false)}
                />
              )}
            </div>

            <div className="text-[10px] text-slate-500 italic">
              Version v{version}. Saving creates a new version snapshot. Submissions/PDFs already rendered
              keep referring to the version they were rendered against.
            </div>
          </div>
        )}
      </div>
    </IadmModal>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────

function Toolbar({ editor, readOnly, onOpenPicker }: { editor: Editor | null; readOnly: boolean; onOpenPicker: () => void }) {
  if (!editor) return null;
  const Btn = ({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={readOnly}
      title={title}
      className={`inline-flex h-7 items-center justify-center rounded px-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active ? "bg-[#FEC82C]/20 text-[#7A4F0B]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
      <Btn active={editor.isActive("bold")} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn active={editor.isActive("italic")} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 2 })} title="Heading" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </Btn>
      <Btn active={editor.isActive("bulletList")} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn active={editor.isActive("orderedList")} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrderedIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        active={editor.isActive("link")}
        title="Insert / edit link"
        onClick={() => {
          const existing = editor.getAttributes("link")?.href || "";
          const url = prompt("Link URL", existing);
          if (url == null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </Btn>
      <span className="mx-1 h-4 w-px bg-slate-300" />
      <button
        type="button"
        onClick={onOpenPicker}
        disabled={readOnly}
        title="Insert merge tag"
        className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        <TagIcon className="h-3.5 w-3.5" />
        Merge tag
        <ChevronDown className="h-3 w-3" />
      </button>
    </>
  );
}

// ─── Merge-tag picker popover (button-driven) ──────────────────────────

interface PickerProps {
  filter: string;
  setFilter: (s: string) => void;
  filteredTags: ConsultingMergeTag[];
  onPick: (token: string) => void;
  onClose: () => void;
}

function MergeTagPicker({ filter, setFilter, filteredTags, onPick, onClose }: PickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  // Group by category for the picker (not the autocomplete — autocomplete
  // is a flat list because it's keyboard-driven and category headers would
  // interfere with select-on-Enter).
  const grouped = useMemo(() => {
    const out = new Map<string, ConsultingMergeTag[]>();
    for (const t of filteredTags) {
      const arr = out.get(t.category) || [];
      arr.push(t);
      out.set(t.category, arr);
    }
    return Array.from(out.entries());
  }, [filteredTags]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-1 w-80 max-h-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      <div className="sticky top-0 bg-white border-b border-slate-100 px-2 py-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter merge tags…"
          autoFocus
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </div>
      <ul className="py-1">
        {grouped.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-500 italic">No tags match.</li>
        ) : (
          grouped.map(([cat, items]) => (
            <li key={cat}>
              <div className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{cat}</div>
              <ul>
                {items.map((t) => (
                  <li key={t.token}>
                    <button
                      type="button"
                      onClick={() => onPick(t.token)}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                      title={t.description || t.token}
                    >
                      <div className="font-semibold text-slate-800">{t.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{t.token}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ─── Autocomplete popover (typed-{{) ───────────────────────────────────

function AutocompletePopover({
  filter, filteredTags, onPick, onClose,
}: {
  filter: string;
  filteredTags: ConsultingMergeTag[];
  onPick: (token: string) => void;
  onClose: () => void;
}) {
  // Esc closes the popover. The arrow-key navigation is deferred — given
  // the small catalog, click-to-insert is enough for the F4 ship.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const top = filteredTags.slice(0, 8);
  if (top.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Merge tag suggestions"
      className="absolute left-3 top-full z-30 mt-0 w-72 max-h-[200px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
      style={{ marginTop: -2 }}
    >
      <div className="border-b border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Merge tag · "{filter}"
      </div>
      <ul>
        {top.map((t) => (
          <li key={t.token}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(t.token)}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
            >
              <div className="font-semibold text-slate-800">{t.label}</div>
              <div className="font-mono text-[10px] text-slate-500">{t.token}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProposalTemplateEditorModal;
