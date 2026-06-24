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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tag, ChevronDown } from "lucide-react";

export interface MergeTag {
  /** The schema token (e.g. "contact.first_name"). Kept for backwards-
   *  compat with older templates and as a stable identity key. The
   *  picker no longer inserts this form — it inserts the user-friendly
   *  token derived from `label`. */
  key: string;
  /** User-facing label, e.g. "First name". Also the basis for the
   *  inserted token: "First name" → "{{first name}}". */
  label: string;
  /** Category for grouping in the dropdown. */
  category: "Contact" | "Business" | "Setup Links" | "Campaign" | "Custom";
  /** Optional sample value shown next to the label for clarity. */
  example?: string;
  /** Plain-English explanation shown as a tooltip on hover. Helps writers
   *  distinguish similar-sounding tags (e.g. welcome link vs onboarding
   *  link vs activation link). */
  description?: string;
}

/**
 * Convert a merge tag to the user-friendly token that gets written into
 * the template — e.g. { label: "First name" } → "{{first name}}".
 *
 * Brandon's 2026-06-24 locked convention: customer-facing templates use
 * natural-language names like `{{first name}}` never schema names like
 * `{{contact.first_name}}`. The backend resolver accepts either form.
 */
export function mergeTagToUserFriendlyToken(tag: MergeTag): string {
  return `{{${tag.label.toLowerCase()}}}`;
}

// Default tag catalog. In the next iteration we'll fetch this from
// GET /v1/spark/merge-tags so per-tenant custom fields appear, but
// these defaults are correct for every SPARK tenant.
export const DEFAULT_MERGE_TAGS: MergeTag[] = [
  // Contact
  { key: "contact.first_name", label: "First name",        category: "Contact", example: "Jane",                description: "The recipient's first name." },
  { key: "contact.last_name",  label: "Last name",         category: "Contact", example: "Smith",               description: "The recipient's last name." },
  { key: "contact.full_name",  label: "Full name",         category: "Contact", example: "Jane Smith",          description: "First name + last name combined." },
  { key: "contact.email",      label: "Email",             category: "Contact", example: "jane@example.com",    description: "The recipient's email address." },
  { key: "contact.phone",      label: "Phone",             category: "Contact", example: "(555) 555-1212",      description: "The recipient's phone number." },
  { key: "contact.company",    label: "Company",           category: "Contact", example: "Acme Inc",            description: "The recipient's company name." },
  { key: "contact.city",       label: "City",              category: "Contact", example: "Marshalltown",        description: "The recipient's city." },
  // Business
  { key: "tenant.business_name", label: "Business name",   category: "Business", example: "Your Business",       description: "YOUR business name (the sender, not the recipient)." },
  { key: "tenant.website",       label: "Website",         category: "Business", example: "https://example.com", description: "Your business website URL." },
  { key: "tenant.phone",         label: "Phone",           category: "Business", example: "(555) 555-1234",      description: "Your business phone number." },
  { key: "tenant.owner_name",    label: "Owner name",      category: "Business", example: "Brandon Sheriff",     description: "Your name as the business owner. Use in signatures or 'from Brandon' lines." },
  { key: "tenant.address",       label: "Address",         category: "Business", example: "123 Main St",         description: "Your business mailing address." },
  // Setup Links — server resolves these per-send with the correct URL for the recipient + event.
  { key: "vars.welcome_link",    label: "Welcome link",     category: "Setup Links", example: "First-time account setup",  description: "URL where a NEW user verifies their email + creates their password. Use ONCE per recipient — clicking it activates their account. Auto-expires after 72h. THIS is the link to use in welcome emails." },
  { key: "vars.onboarding_link", label: "Onboarding link",  category: "Setup Links", example: "Open the setup wizard",     description: "Deep-link into the in-app setup wizard. Use when the recipient ALREADY has an account and just needs to finish configuring it (e.g. after they self-checkout and have already done CIAM signup)." },
  { key: "vars.activation_link", label: "Activation link",  category: "Setup Links", example: "Activate a trial / feature", description: "Generic activation URL. Use for 'activate your trial', 'verify subscription', or 're-enable account' style emails. NOT the same as the welcome link — that's for first-time setup only." },
  { key: "vars.product_list",    label: "Product list",     category: "Setup Links", example: "ARION, SPARK, and OLIVER",  description: "Comma-separated list of products the recipient bought (e.g. 'ARION, SPARK, and OLIVER'). Renders as natural English in a sentence." },
  // Campaign
  { key: "campaign.unsubscribe_url", label: "Unsubscribe link", category: "Campaign", example: "auto link",       description: "Per-recipient unsubscribe URL. REQUIRED BY LAW on marketing emails (CAN-SPAM). Auto-injected if missing." },
  { key: "campaign.preferences_url", label: "Preferences link", category: "Campaign", example: "auto link",       description: "URL to the recipient's notification preferences page — they can turn off categories without unsubscribing entirely." },
  { key: "campaign.view_in_browser_url", label: "View in browser", category: "Campaign", example: "auto link",   description: "URL to view this email in a browser (for recipients whose mail client mangles HTML)." },
  { key: "campaign.send_date",       label: "Send date",       category: "Campaign", example: "Jun 17, 2026",   description: "The date this campaign was sent (or scheduled to send)." },
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
    // User-friendly insertion: "First name" → "{{first name}}".
    // Backend mergeTagCatalog resolver accepts either form.
    const token = mergeTagToUserFriendlyToken(tag);
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
  const order: MergeTag["category"][] = ["Contact", "Business", "Setup Links", "Campaign", "Custom"];

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
                      title={t.description || t.example || t.label}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-orange-50 hover:text-orange-900 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold">{t.label}</span>
                      {t.example && (
                        <span className="text-[10px] text-slate-400 italic truncate ml-2">{t.example}</span>
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

// ---------------------------------------------------------------------------
// useMergeTagAutoComplete — "{{" keystroke trigger for plain inputs/textareas.
//
// Watches the target's value at the cursor position. When the user types
// "{{", a small floating menu appears anchored under the input. As they
// continue typing, the chars after "{{" filter the catalog. On pick, the
// "{{" + filter chars are replaced with the chosen user-friendly token
// (e.g. "{{first name}}"). Esc / outside click closes the menu and leaves
// the "{{" the user typed as literal text.
//
// Returns a React node — render it adjacent to the input. The hook owns
// open/close state and positioning relative to the input.
// ---------------------------------------------------------------------------
export interface UseMergeTagAutoCompleteArgs {
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  tags?: MergeTag[];
}

export function useMergeTagAutoComplete({
  targetRef, value, onChange, tags = DEFAULT_MERGE_TAGS,
}: UseMergeTagAutoCompleteArgs) {
  // Position of the "{{" trigger in the value (start index of the "{{"),
  // or null when the menu is closed.
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = triggerStart != null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const inMenu = menuRef.current && menuRef.current.contains(e.target as Node);
      const inTarget = targetRef.current && targetRef.current.contains(e.target as Node);
      if (!inMenu && !inTarget) {
        setTriggerStart(null);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, targetRef]);

  // Detect "{{" at-or-before cursor and track the filter chars after it.
  const recompute = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    // Walk backwards from caret looking for "{{" without an intervening
    // "}}" or whitespace > 30 chars (so we don't latch onto an old "{{").
    let i = caret - 1;
    let scanned = 0;
    while (i >= 1 && scanned < 40) {
      const two = value.slice(i - 1, i + 1);
      if (two === "}}") { setTriggerStart(null); return; }
      if (two === "{{") {
        const start = i - 1;
        const after = value.slice(start + 2, caret);
        // Disallow newline in the filter — closes the menu on Enter.
        if (/\n/.test(after)) { setTriggerStart(null); return; }
        setTriggerStart(start);
        setFilter(after);
        setActiveIdx(0);
        return;
      }
      i--;
      scanned++;
    }
    setTriggerStart(null);
  }, [targetRef, value]);

  // Re-check on every value change and on key events that move the caret.
  useEffect(() => {
    recompute();
  }, [value, recompute]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [tags, filter]);

  const pickTag = useCallback((tag: MergeTag) => {
    if (triggerStart == null) return;
    const el = targetRef.current;
    const caret = el?.selectionStart ?? value.length;
    const token = mergeTagToUserFriendlyToken(tag);
    const next = value.slice(0, triggerStart) + token + value.slice(caret);
    onChange(next);
    setTriggerStart(null);
    setFilter("");
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const pos = triggerStart + token.length;
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }, 0);
  }, [triggerStart, targetRef, value, onChange]);

  // Key handler for the host input. Caller wires this into onKeyDown.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (triggerStart == null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setTriggerStart(null);
      setFilter("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (filtered.length > 0) {
        e.preventDefault();
        pickTag(filtered[Math.min(activeIdx, filtered.length - 1)]);
      }
    }
  }, [triggerStart, filtered, activeIdx, pickTag]);

  const menu = open && filtered.length > 0 ? (
    <div
      ref={menuRef}
      className="absolute left-0 z-50 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
      style={{ top: "100%" }}
    >
      <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wide text-slate-500">
        Merge tag {filter && <span className="text-slate-400 normal-case font-normal">— filter: {filter}</span>}
      </div>
      {filtered.map((t, idx) => (
        <button
          key={t.key}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pickTag(t); }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs ${
            idx === activeIdx ? "bg-orange-50 text-orange-900" : "hover:bg-orange-50 hover:text-orange-900"
          }`}
        >
          <span className="font-semibold">{t.label}</span>
          <span className="text-[10px] text-slate-400">{t.category}</span>
        </button>
      ))}
    </div>
  ) : null;

  return { onKeyDown, menu, open };
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
  // Also resolve user-friendly tokens like "{{first name}}" — built from
  // the catalog labels so the preview matches what the picker inserts.
  const friendly: Record<string, string> = {};
  for (const t of DEFAULT_MERGE_TAGS) {
    const friendlyKey = t.label.toLowerCase();
    const v = defaults[t.key];
    if (v !== undefined) friendly[friendlyKey] = v;
  }
  const ctx = { ...defaults, ...friendly, ...sample };
  // Allow spaces inside the token (user-friendly form): {{first name}}.
  return input.replace(/\{\{\s*([\w. ]+?)\s*\}\}/g, (_m, key: string) => {
    const k = key.trim();
    if (k in ctx) return ctx[k];
    const lower = k.toLowerCase();
    if (lower in ctx) return ctx[lower];
    return `[${k}]`;
  });
}

export default MergeTagPicker;
