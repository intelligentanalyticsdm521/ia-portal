// SparkTemplatesPage — F-91. Unified Email + SMS templates library.
//
// Replaces three separate nav entries (Email Templates / SMS Templates /
// Translations) with ONE main-nav "Templates" entry under Outreach.
// Grid of all templates with channel + category filters; "+ New" opens
// a channel-picker modal then the right editor. Click any row to open it.
//
// Translations (per-template per-locale overrides) are NOT a separate
// feature anymore — they're a future tab inside the editor modal (the
// legacy spark_template_i18n page still works for now via direct URL).
//
// ── 2026-09-16: AN EMAIL TEMPLATE OPENS THE BUILDER ───────────────────────
// BUILDER_PLATFORM_SCOPE_2026-09-15 §13.5 lists four surfaces and ONE email
// builder behind them; §13.8 recorded this library as the last door still on
// the old form-and-TipTap shape. It is not any more:
//
//   · an EMAIL row opens `SparkTemplateBuilderModal` → `EmailBuilder`, the same
//     canvas, widget pane and starter gallery the Newsletter Studio opens
//   · "New template → Email" opens that builder's own gallery, so the shape is
//     chosen once, in the one place a shape is chosen
//   · an SMS row still opens `SparkTemplateEditorModal`, which is now SMS-only.
//     There was never a visual builder for 160 characters and there is no
//     second email editor left to drift from the first
//
// The "advanced editor" link this file's header used to describe pointed at
// `/app/services/spark_email_templates`, which has routed BACK to this very
// page since SparkEmailTemplatesPage was deleted. It is gone with the form.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Mail, MessageSquare, Plus, ArrowRight, X, Sparkles, Send, Wand2 } from "lucide-react";
import { SparkTemplateEditorModal } from "../../components/spark/SparkTemplateEditorModal";
import { SparkTemplateBuilderModal } from "../../components/spark/SparkTemplateBuilderModal";

/** The two channels the LIBRARY holds. Each opens its own kind of editor. */
export type TemplateChannel = "email" | "sms";

type Category = "transactional" | "marketing" | "system";

interface EmailRow {
  id: number;
  name: string;
  category: Category;
  subject: string;
  send_count: number;
  last_used_at: string | null;
  is_active: boolean;
  is_system: boolean;
  updated_at: string;
  /**
   * Whether this row carries a DESIGN (`blocks_json`), computed by the list
   * route so the whole document does not have to travel to draw a chip.
   *
   * Three states, not two. `undefined` means the API answering is older than
   * the column — and a row is then labelled NEITHER, because guessing "old
   * editor" from an absent field would put a warning on every template the day
   * the Portal ships ahead of LUMEN.
   */
  has_design?: boolean;
  __channel: "email";
}
interface SmsRow {
  id: number;
  name: string;
  category: Category;
  body?: string;
  send_count: number;
  last_used_at: string | null;
  is_active: boolean;
  is_system: boolean;
  updated_at: string;
  __channel: "sms";
}
type TemplateRow = EmailRow | SmsRow;

export function SparkTemplatesPage() {
  const { get, ready } = useSparkApi();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [smss, setSmss] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Filter state
  const [channelFilter, setChannelFilter] = useState<"all" | TemplateChannel>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");

  // Modal state. An SMS template opens the form; an EMAIL template opens the
  // builder. They are separate pieces of state rather than one with a channel
  // on it, because they are now two genuinely different surfaces.
  const [smsEditor, setSmsEditor] = useState<{ templateId: number | null } | null>(null);
  const [emailBuilder, setEmailBuilder] = useState<{ templateId: number | null } | null>(null);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [e, s] = await Promise.all([
        get<{ items: Omit<EmailRow, "__channel">[] }>("/api/v1/email-templates?include_inactive=true").catch(() => ({ items: [] })),
        get<{ items: Omit<SmsRow, "__channel">[] }>("/api/v1/sms-templates?include_inactive=true").catch(() => ({ items: [] })),
      ]);
      setEmails((e.items || []).map((t) => ({ ...t, __channel: "email" as const })));
      setSmss((s.items || []).map((t) => ({ ...t, __channel: "sms" as const })));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  // Product filter — F-81 makes /email-templates return the tenant's own
  // rows AND the 'iadm-platform' system rows. The system set seeds
  // OLIVER-specific templates (job.scheduled, invoice.paid, etc.) that have
  // no place in the SPARK library. Hide any system row whose template_key
  // signals it's OLIVER work. Tenant-owned rows always show through.
  function isOliverSystemTemplate(r: TemplateRow): boolean {
    if (!r.is_system) return false;
    // We can't easily check template_key from the row shape exposed in the
    // LIST endpoint (this page's interface only includes name/category/etc).
    // We DO get it on the row via spread — emails-templates GET returns it.
    const key = (r as unknown as { template_key?: string }).template_key || "";
    return /^(job|invoice|quote|approval|subscription)\./.test(key);
  }

  const rows: TemplateRow[] = useMemo(() => {
    let list: TemplateRow[] = [];
    if (channelFilter === "all" || channelFilter === "email") list = list.concat(emails);
    if (channelFilter === "all" || channelFilter === "sms") list = list.concat(smss);
    // Drop OLIVER-side system templates (job/invoice/quote/approval/subscription).
    list = list.filter((r) => !isOliverSystemTemplate(r));
    if (categoryFilter !== "all") list = list.filter((r) => r.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [emails, smss, channelFilter, categoryFilter, search]);

  function openNew(channel: TemplateChannel) {
    setChannelPickerOpen(false);
    // Email lands straight on the builder's OWN starter gallery — the one
    // place a shape is chosen. There is no intermediate form to fill in first.
    if (channel === "email") setEmailBuilder({ templateId: null });
    else setSmsEditor({ templateId: null });
  }
  function openExisting(row: TemplateRow) {
    if (row.__channel === "email") setEmailBuilder({ templateId: row.id });
    else setSmsEditor({ templateId: row.id });
  }

  return (
    <SparkPageShell
      title="Templates"
      subtitle="Email + SMS template library"
      help="One library for every template. Click an email template and it opens on the builder — the same canvas as the Newsletter Studio, with your logo at the top and your unsubscribe footer at the bottom. SMS templates open a short form, because 160 characters do not need a canvas."
      loading={loading}
      error={error}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Channel filter */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {([
              { key: "all", label: "All" },
              { key: "email", label: "Email" },
              { key: "sms", label: "SMS" },
            ] as Array<{ key: typeof channelFilter; label: string }>).map((c) => (
              <button
                key={c.key}
                onClick={() => setChannelFilter(c.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  channelFilter === c.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="all">All categories</option>
            <option value="marketing">Marketing</option>
            <option value="transactional">Transactional</option>
            <option value="system">System</option>
          </select>
          {/* Search */}
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 w-44"
          />
        </div>
        <button
          onClick={() => setChannelPickerOpen(true)}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </button>
      </div>

      {/* Grid */}
      {rows.length === 0 && !loading ? (
        <EmptyState onNew={() => setChannelPickerOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((row) => (
            <div
              key={`${row.__channel}-${row.id}`}
              role="button"
              tabIndex={0}
              onClick={() => openExisting(row)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openExisting(row); } }}
              title={row.__channel === "email" ? `Design “${row.name}” in the builder` : `Edit “${row.name}”`}
              className="group text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#EF6C33]"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  row.__channel === "email"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}>
                  {row.__channel === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                  {row.__channel}
                </div>
                <div className="flex items-center gap-1">
                  {row.is_system && (
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">System</span>
                  )}
                  {!row.is_active && (
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Inactive</span>
                  )}
                </div>
              </div>
              <div className="font-semibold text-slate-900 truncate mb-0.5">{row.name}</div>
              <div className="text-xs text-slate-600 truncate mb-2">
                {row.__channel === "email" ? (row as EmailRow).subject || <span className="italic text-slate-400">No subject</span>
                                            : (row as SmsRow).body?.slice(0, 80) || <span className="italic text-slate-400">No body</span>}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-2">
                <span className="capitalize">{row.category}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5"><Send className="h-2.5 w-2.5" /> {row.send_count || 0}</span>
                {/* Three states on purpose — see EmailRow.has_design. */}
                {row.__channel === "email" && (row as EmailRow).has_design === true && (
                  <span className="text-slate-600" title="Built on the visual builder. Opening it shows exactly what lands in the inbox.">· Designed</span>
                )}
                {row.__channel === "email" && (row as EmailRow).has_design === false && (
                  <span className="text-amber-700" title="Written in the old editor. Open it and the words, pictures and links are read back onto the canvas — check the layout before you send.">· Old editor</span>
                )}
                <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#EF6C33]" />
              </div>
              {row.__channel === "email" && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEmailBuilder({ templateId: row.id }); }}
                  title="Open this template on the canvas — sections, widgets and the live result"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#EF6C33] hover:text-[#EF6C33]"
                >
                  <Wand2 className="h-3 w-3" /> Design in the builder
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Channel picker modal */}
      {channelPickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setChannelPickerOpen(false)}
        >
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-gradient-to-r from-[#0B1C24] to-[#1a3540] text-white rounded-t-xl">
              <h3 className="font-semibold text-base">Pick a channel</h3>
              <button onClick={() => setChannelPickerOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => openNew("email")}
                className="group flex flex-col items-start gap-2 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="font-semibold text-slate-900">Email</div>
                <div className="text-xs text-slate-500 leading-snug">Opens the builder — pick a shape, then type straight onto the page.</div>
              </button>
              <button
                onClick={() => openNew("sms")}
                className="group flex flex-col items-start gap-2 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="font-semibold text-slate-900">SMS</div>
                <div className="text-xs text-slate-500 leading-snug">~160 char/part. STOP/HELP auto-handled.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS — the form, which is the right shape for 160 characters. */}
      {smsEditor && (
        <SparkTemplateEditorModal
          open={true}
          templateId={smsEditor.templateId}
          onClose={() => setSmsEditor(null)}
          onChanged={() => { setSmsEditor(null); load(); }}
        />
      )}

      {/* EMAIL — THE builder. Same canvas as the Newsletter Studio and the
          campaign composer, opened on this template. It stays open after a
          save so the author can keep working; the library refreshes behind. */}
      {emailBuilder && (
        <SparkTemplateBuilderModal
          open={true}
          templateId={emailBuilder.templateId}
          onClose={() => { setEmailBuilder(null); load(); }}
          onChanged={load}
        />
      )}
    </SparkPageShell>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Sparkles className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No templates yet</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Pre-built system templates appear here too — start one to customise it for your tenant.
      </p>
      <button onClick={onNew} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]">
        <Plus className="h-3.5 w-3.5" /> New template
      </button>
    </div>
  );
}

export default SparkTemplatesPage;
