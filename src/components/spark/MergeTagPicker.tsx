// MergeTagPicker — user-friendly merge-tag UI for SPARK editors.
//
// Brandon's 2026-06-17 rule: clients shouldn't have to understand to type
// `{{first_name}}` into their email campaigns. They click "First name"
// from a labeled chip; the picker inserts the right token at cursor.
//
// Wired into:
//   - SparkCampaignComposerModal (Subject + Body + SMS body)
//   - SPARK Templates editor (future)
//   - SPARK Newsletter editor (future)
//
// The underlying templates still use `{{...}}` syntax — backend rendering
// is unchanged. This component only changes how the WRITER interacts.
import { useEffect, useRef, useState } from "react";
import { Tag, ChevronDown } from "lucide-react";

export interface MergeTag {
  /** The raw token written into the template, e.g. "contact.first_name". */
  key: string;
  /** User-facing label, e.g. "First name". */
  label: string;
  /** Category for grouping in the dropdown. */
  category: "Contact" | "Tenant" | "Campaign" | "Custom";
  /** Optional sample value shown next to the label for clarity. */
  example?: string;
}

// Default tag catalog. In the next iteration we'll fetch this from
// GET /v1/spark/merge-tags so per-tenant custom fields appear, but
// these defaults are correct for every SPARK tenant.
export const DEFAULT_MERGE_TAGS: MergeTag[] = [
  // Contact
  { key: "contact.first_name", label: "First name",        category: "Contact", example: "Jane" },
  { key: "contact.last_name",  label: "Last name",         category: "Contact", example: "Smith" },
  { key: "contact.full_name",  label: "Full name",         category: "Contact", example: "Jane Smith" },
  { key: "contact.email",      label: "Email",             category: "Contact", example: "jane@example.com" },
  { key: "contact.phone",      label: "Phone",             category: "Contact", example: "(555) 555-1212" },
  { key: "contact.company",    label: "Company",           category: "Contact", example: "Acme Inc" },
  { key: "contact.city",       label: "City",              category: "Contact", example: "Marshalltown" },
  // Tenant
  { key: "tenant.business_name", label: "Business name",   category: "Tenant",  example: "Your Business" },
  { key: "tenant.website",       label: "Website",         category: "Tenant",  example: "https://example.com" },
  { key: "tenant.phone",         label: "Phone",           category: "Tenant",  example: "(555) 555-1234" },
  { key: "tenant.owner_name",    label: "Owner name",      category: "Tenant",  example: "Brandon Sheriff" },
  { key: "tenant.address",       label: "Address",         category: "Tenant",  example: "123 Main St" },
  // Campaign
  { key: "campaign.unsubscribe_url", label: "Unsubscribe link", category: "Campaign", example: "auto link" },
  { key: "campaign.preferences_url", label: "Preferences link", category: "Campaign", example: "auto link" },
  { key: "campaign.view_in_browser_url", label: "View in browser", category: "Campaign", example: "auto link" },
  { key: "campaign.send_date",       label: "Send date",       category: "Campaign", example: "Jun 17, 2026" },
];

export interface MergeTagPickerProps {
  /** Ref to the input or textarea where the tag will be inserted. */
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Current value of the target. */
  value: string;
  /** Setter for the target's value. */
  onChange: (next: string) => void;
  /** Override the tag catalog (e.g. with tenant-custom fields). */
  tags?: MergeTag[];
  /** Optional label override for the trigger button. Default "Insert ↓". */
  label?: string;
  /** Compact mode — smaller trigger. */
  compact?: boolean;
}

export function MergeTagPicker({
  targetRef, value, onChange, tags = DEFAULT_MERGE_TAGS, label, compact,
}: MergeTagPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const insertTag = (tag: MergeTag) => {
    const el = targetRef.current;
    const token = `{{${tag.key}}}`;
    if (!el) {
      // Fallback: append.
      onChange(value + token);
      setOpen(false);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    setOpen(false);
    // Restore caret position after the inserted token.
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }, 0);
  };

  // Group tags by category for the dropdown.
  const byCategory = new Map<string, MergeTag[]>();
  for (const t of tags) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }
  const order: MergeTag["category"][] = ["Contact", "Tenant", "Campaign", "Custom"];

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded border border-slate-300 bg-white hover:bg-slate-50 ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} font-semibold text-slate-700`}
        title="Insert a merge tag — auto-fills with each recipient's info"
      >
        <Tag className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        {label || "Insert"}
        <ChevronDown className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide px-2 pt-1 pb-2">
            Insert merge tag
          </div>
          {order.map((cat) => {
            const items = byCategory.get(cat);
            if (!items || !items.length) return null;
            return (
              <div key={cat} className="mb-2">
                <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide px-2 mb-1">
                  {cat}
                </div>
                <div className="space-y-0.5">
                  {items.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => insertTag(t)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-orange-50 hover:text-orange-900 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold">{t.label}</span>
                      {t.example && (
                        <span className="text-[10px] text-slate-400 italic truncate">{t.example}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="border-t border-slate-100 pt-1.5 mt-1 px-2 pb-1">
            <div className="text-[10px] text-slate-500">
              Tags auto-fill per recipient. Subject and body both support them.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight preview renderer — resolves the {{tag}} tokens against a
// sample object so writers can see how their copy lands. Used next to
// the editor as a "Preview" pane.
export function renderMergeTagPreview(input: string, sample: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    "contact.first_name": "Jane",
    "contact.last_name": "Smith",
    "contact.full_name": "Jane Smith",
    "contact.email": "jane@example.com",
    "contact.phone": "(555) 555-1212",
    "contact.company": "Acme Inc",
    "contact.city": "Marshalltown",
    "tenant.business_name": "Your Business",
    "tenant.website": "https://example.com",
    "tenant.phone": "(555) 555-1234",
    "tenant.owner_name": "Brandon Sheriff",
    "tenant.address": "123 Main St",
    "campaign.unsubscribe_url": "https://example.com/unsubscribe",
    "campaign.preferences_url": "https://example.com/preferences",
    "campaign.view_in_browser_url": "https://example.com/view",
    "campaign.send_date": new Date().toLocaleDateString(),
  };
  const ctx = { ...defaults, ...sample };
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => ctx[key] ?? `[${key}]`);
}

export default MergeTagPicker;
