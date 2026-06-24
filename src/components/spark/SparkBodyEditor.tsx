// SparkBodyEditor — rich-text body editor for every SPARK email surface.
//
// Replaces the raw-HTML/monospace textareas that previously lived in
// SparkCampaignComposerModal, SparkTemplateEditorModal, and
// SparkEmailTemplatesPage (BlockEditor html block).
//
// Brandon's locked conventions:
//   - Body inputs are prose / rich-text. NEVER expose raw HTML or
//     markdown syntax to the writer.
//   - Merge tags use the user-friendly form ({{first name}}, not
//     {{contact.first_name}}). The backend mergeTagCatalog resolver
//     accepts either form, so we always insert user-friendly.
//   - "Insert link" is a popover (URL + visible text), NOT typed
//     markdown like [text](url).
//
// Output contract:
//   onChange(html, text)
//     html → body_html (sanitised HTML produced by TipTap)
//     text → body_text (derived plain text via editor.getText())
//
// Toolbar order: Bold | Italic | Bullet list | Numbered list | Link |
// Insert merge tag | Insert CTA. The CTA button delegates upward
// (parent owns the CTA Editor modal — Phase 3 wiring), so we just
// invoke onInsertCTA when provided.
//
// Integration: NOT wired into any composer/template modal in this
// phase. Phase 3 handles that.

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Link as LinkIcon,
  Tag as TagIcon,
  ChevronDown,
  MousePointerClick,
} from "lucide-react";
import type { MergeTag } from "./MergeTagPicker";
import { DEFAULT_MERGE_TAGS, mergeTagToUserFriendlyToken } from "./MergeTagPicker";

export interface SparkBodyEditorProps {
  /** Current HTML value (body_html). */
  value: string;
  /** Fires on every edit. html → body_html, text → body_text. */
  onChange: (html: string, text: string) => void;
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Override the default merge tag catalog (e.g. tenant custom fields). */
  mergeTagCatalog?: MergeTag[];
  /** Invoked when the writer clicks "Insert CTA". Parent owns the modal. */
  onInsertCTA?: () => void;
  /** Optional minimum height in px for the editable surface. */
  minHeight?: number;
}

// ----- Toolbar button shell ---------------------------------------------------

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // Keep focus inside the editor.
      onClick={onClick}
      title={title}
      className={
        "inline-flex h-7 items-center justify-center rounded px-2 text-xs font-semibold transition-colors " +
        (active
          ? "bg-[#EF6C33]/10 text-[#EF6C33]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
      }
    >
      {children}
    </button>
  );
}

// ----- Link popover ----------------------------------------------------------

interface LinkPopoverProps {
  editor: Editor;
  onClose: () => void;
}

function LinkPopover({ editor, onClose }: LinkPopoverProps) {
  const existing = editor.getAttributes("link")?.href ?? "";
  const selectedText = editor.state.doc.textBetween(
    editor.state.selection.from,
    editor.state.selection.to,
    " ",
  );
  const [url, setUrl] = useState<string>(existing);
  const [text, setText] = useState<string>(selectedText);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const apply = () => {
    const href = url.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
      onClose();
      return;
    }
    const normalised = /^https?:\/\//i.test(href) || href.startsWith("mailto:")
      ? href
      : `https://${href}`;
    if (text && text !== selectedText) {
      // Replace selection with display text + apply link.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text,
          marks: [{ type: "link", attrs: { href: normalised } }],
        })
        .run();
    } else if (selectedText) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalised }).run();
    } else {
      // No selection — insert the display text (fallback to URL) with a link mark.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: text || normalised,
          marks: [{ type: "link", attrs: { href: normalised } }],
        })
        .run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().unsetLink().run();
    onClose();
  };

  return (
    <div
      ref={wrapRef}
      className="absolute z-50 mt-1 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-2 text-[10px] uppercase font-bold tracking-wide text-slate-500">
        {existing ? "Edit link" : "Insert link"}
      </div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">URL</label>
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="https://example.com"
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
      />
      <label className="mt-2 block text-[11px] font-semibold text-slate-600 mb-0.5">
        Link text (optional)
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="Click here"
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
      />
      <div className="mt-3 flex items-center justify-between">
        {existing ? (
          <button
            type="button"
            onClick={remove}
            className="text-[11px] font-semibold text-red-600 hover:underline"
          >
            Remove link
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded bg-[#EF6C33] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#d85a26]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Merge tag popover -----------------------------------------------------

interface MergeTagPopoverProps {
  tags: MergeTag[];
  onPick: (token: string) => void;
  onClose: () => void;
}

function MergeTagPopover({ tags, onPick, onClose }: MergeTagPopoverProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [tags, filter]);

  const byCategory = useMemo(() => {
    const m = new Map<string, MergeTag[]>();
    for (const t of filtered) {
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    return m;
  }, [filtered]);
  const order: MergeTag["category"][] = ["Contact", "Business", "Campaign", "Custom"];

  return (
    <div
      ref={wrapRef}
      className="absolute z-50 mt-1 max-h-96 w-80 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
    >
      <div className="px-2 pb-2 pt-1 text-[10px] uppercase font-bold tracking-wide text-slate-500">
        Insert merge tag
      </div>
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter…"
        className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
      />
      {order.map((cat) => {
        const items = byCategory.get(cat);
        if (!items || !items.length) return null;
        return (
          <div key={cat} className="mb-2">
            <div className="mb-1 px-2 text-[10px] uppercase font-semibold tracking-wide text-slate-400">
              {cat}
            </div>
            <div className="space-y-0.5">
              {items.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onDoubleClick={() => onPick(mergeTagToUserFriendlyToken(t))}
                  onClick={() => onPick(mergeTagToUserFriendlyToken(t))}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-orange-50 hover:text-orange-900"
                >
                  <span className="font-semibold">{t.label}</span>
                  {t.example && (
                    <span className="truncate text-[10px] italic text-slate-400">{t.example}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div className="px-2 py-3 text-center text-xs text-slate-400">No matches</div>
      )}
    </div>
  );
}

// ----- Main editor ----------------------------------------------------------

export function SparkBodyEditor({
  value,
  onChange,
  placeholder,
  mergeTagCatalog,
  onInsertCTA,
  minHeight = 200,
}: SparkBodyEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  // "{{" keystroke trigger state. autoTrigger holds the floating-menu
  // anchor + filter when the user has just typed "{{" in the body. The
  // existing toolbar-driven tagOpen popover stays as a fallback.
  const [autoTrigger, setAutoTrigger] = useState<{
    from: number; // ProseMirror pos of the "{{"
    to: number;   // ProseMirror pos right after the filter chars (= cursor)
    filter: string;
    coords: { left: number; top: number; bottom: number };
  } | null>(null);
  const [autoActiveIdx, setAutoActiveIdx] = useState(0);
  const tags = mergeTagCatalog && mergeTagCatalog.length ? mergeTagCatalog : DEFAULT_MERGE_TAGS;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Drop heading + code-block UI; body is prose, not a doc editor.
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "text-[#EF6C33] underline",
        },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "spark-body-editor prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm text-slate-800",
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const text = ed.getText();
      onChange(html, text);
      // Re-check for the "{{" trigger after every content change.
      detectMergeTagTrigger(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      detectMergeTagTrigger(ed);
    },
  });

  // Scan the paragraph node containing the cursor for "{{" that is not yet
  // closed by "}}". When found, open the floating menu anchored at the
  // "{{" pixel coords with the chars between "{{" and the cursor as the
  // filter. When not found, close the menu.
  function detectMergeTagTrigger(ed: Editor) {
    const { from } = ed.state.selection;
    const $pos = ed.state.doc.resolve(from);
    const parent = $pos.parent;
    const parentStart = $pos.start(); // doc pos of the first char in parent
    const offsetInParent = from - parentStart;
    const textBefore = parent.textBetween(0, offsetInParent, undefined, "￼");
    // Find the LAST "{{" before cursor that isn't followed by "}}" or newline.
    const lastOpen = textBefore.lastIndexOf("{{");
    if (lastOpen === -1) { setAutoTrigger(null); return; }
    const after = textBefore.slice(lastOpen + 2);
    if (after.includes("}}") || /\n/.test(after) || after.length > 40) {
      setAutoTrigger(null);
      return;
    }
    const triggerPos = parentStart + lastOpen;
    let coords: { left: number; top: number; bottom: number };
    try {
      coords = ed.view.coordsAtPos(triggerPos);
    } catch {
      setAutoTrigger(null);
      return;
    }
    setAutoTrigger({ from: triggerPos, to: from, filter: after, coords });
  }

  // Keep TipTap in sync if the parent rewrites `value` externally
  // (template load, AI-generate, undo from outside, etc.). Avoid the
  // round-trip when the editor produced the change itself.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const insertMergeTag = useCallback(
    (token: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(token).run();
      setTagOpen(false);
    },
    [editor],
  );

  // Pick handler for the "{{" autocomplete menu — replaces the typed
  // "{{" + filter chars with the chosen user-friendly token.
  const pickAutoTag = useCallback((tag: MergeTag) => {
    if (!editor || !autoTrigger) return;
    const token = mergeTagToUserFriendlyToken(tag);
    editor
      .chain()
      .focus()
      .deleteRange({ from: autoTrigger.from, to: autoTrigger.to })
      .insertContent(token)
      .run();
    setAutoTrigger(null);
  }, [editor, autoTrigger]);

  // Filtered tags for the "{{" auto menu (re-built on filter change).
  const autoFiltered = useMemo(() => {
    if (!autoTrigger) return tags;
    const q = autoTrigger.filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [autoTrigger, tags]);

  // Reset highlighted index whenever the filter changes.
  useEffect(() => { setAutoActiveIdx(0); }, [autoTrigger?.filter]);

  // Hook keyboard nav into the editor while the auto menu is open.
  useEffect(() => {
    if (!editor || !autoTrigger) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAutoTrigger(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAutoActiveIdx((i) => Math.min(autoFiltered.length - 1, i + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAutoActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (autoFiltered.length > 0) {
          event.preventDefault();
          pickAutoTag(autoFiltered[Math.min(autoActiveIdx, autoFiltered.length - 1)]);
        }
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [editor, autoTrigger, autoFiltered, autoActiveIdx, pickAutoTag]);

  if (!editor) {
    // Render a stable shell so layout doesn't jump while TipTap warms up.
    return (
      <div
        className="rounded border border-slate-300 bg-white"
        style={{ minHeight: minHeight + 36 }}
      />
    );
  }

  return (
    <div className="spark-body-editor-wrap rounded border border-slate-300 bg-white focus-within:border-[#EF6C33] focus-within:ring-1 focus-within:ring-[#EF6C33]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <BoldIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <ItalicIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <ListIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrderedIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              setTagOpen(false);
              setLinkOpen((v) => !v);
            }}
            active={editor.isActive("link") || linkOpen}
            title="Insert link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
        </div>
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              setLinkOpen(false);
              setTagOpen((v) => !v);
            }}
            active={tagOpen}
            title="Insert merge tag — auto-fills with each recipient's info"
          >
            <TagIcon className="mr-1 h-3.5 w-3.5" />
            Merge tag
            <ChevronDown className="ml-0.5 h-3 w-3" />
          </ToolbarButton>
          {tagOpen && (
            <MergeTagPopover
              tags={tags}
              onPick={insertMergeTag}
              onClose={() => setTagOpen(false)}
            />
          )}
        </div>
        {onInsertCTA && (
          <>
            <span className="mx-1 h-4 w-px bg-slate-300" />
            <ToolbarButton onClick={onInsertCTA} title="Insert call-to-action button">
              <MousePointerClick className="mr-1 h-3.5 w-3.5" />
              CTA
            </ToolbarButton>
          </>
        )}
      </div>
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      {placeholder && editor.isEmpty && (
        <style>{`.spark-body-editor.ProseMirror p.is-editor-empty:first-child::before,
.spark-body-editor.ProseMirror:empty::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
  float: left;
  height: 0;
}`}</style>
      )}
      {/* "{{" auto-trigger floating menu — fixed-positioned at the
          ProseMirror coords of the typed "{{". Caret-anchored so it
          follows the cursor as the user keeps typing the filter. */}
      {autoTrigger && autoFiltered.length > 0 && (
        <div
          className="fixed z-[60] max-h-72 w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          style={{ left: autoTrigger.coords.left, top: autoTrigger.coords.bottom + 4 }}
        >
          <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wide text-slate-500">
            Merge tag
            {autoTrigger.filter && (
              <span className="text-slate-400 normal-case font-normal"> — filter: {autoTrigger.filter}</span>
            )}
          </div>
          {autoFiltered.map((t, idx) => (
            <button
              key={t.key}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickAutoTag(t); }}
              onMouseEnter={() => setAutoActiveIdx(idx)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs ${
                idx === autoActiveIdx ? "bg-orange-50 text-orange-900" : "hover:bg-orange-50 hover:text-orange-900"
              }`}
            >
              <span className="font-semibold">{t.label}</span>
              <span className="text-[10px] text-slate-400">{t.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SparkBodyEditor;
