// SparkTemplatesPage — F-91. Unified Email + SMS templates library.
//
// Replaces three separate nav entries (Email Templates / SMS Templates /
// Translations) with ONE main-nav "Templates" entry under Outreach.
// Grid of all templates with channel + category filters; "+ New" opens
// a channel-picker modal then the editor modal. Click any row to open
// that template in the editor modal pre-populated.
//
// Translations (per-template per-locale overrides) are NOT a separate
// feature anymore — they're a future tab inside the editor modal (the
// legacy spark_template_i18n page still works for now via direct URL).
//
// For the visual block-builder, the editor modal has an "advanced editor"
// link that drops users into the legacy SparkEmailTemplatesPage (which
// keeps the block-builder UI). The library is the new front door.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Mail, MessageSquare, Plus, ArrowRight, X, Sparkles, Send } from "lucide-react";
import {
  SparkTemplateEditorModal,
  type TemplateChannel,
} from "../../components/spark/SparkTemplateEditorModal";

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

  // Modal state
  const [editor, setEditor] = useState<{ channel: TemplateChannel; templateId: number | null } | null>(null);
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
    setEditor({ channel, templateId: null });
  }
  function openExisting(row: TemplateRow) {
    setEditor({ channel: row.__channel, templateId: row.id });
  }

  return (
    <SparkPageShell
      title="Templates"
      subtitle="Email + SMS template library"
      help="One library for every template. Click a row to edit; click + New to start one. The advanced visual block editor is one click deep inside any email template."
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
            <button
              key={`${row.__channel}-${row.id}`}
              onClick={() => openExisting(row)}
              className="group text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 transition-colors"
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
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className="capitalize">{row.category}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5"><Send className="h-2.5 w-2.5" /> {row.send_count || 0}</span>
                <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#EF6C33]" />
              </div>
            </button>
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
                <div className="text-xs text-slate-500 leading-snug">Rich HTML, attachments, open/click tracking.</div>
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

      {/* Editor modal */}
      {editor && (
        <SparkTemplateEditorModal
          open={true}
          channel={editor.channel}
          templateId={editor.templateId}
          onClose={() => setEditor(null)}
          onChanged={() => { setEditor(null); load(); }}
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
