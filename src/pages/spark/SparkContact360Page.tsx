// SparkContact360Page — Unified cross-product contact view (v2.0).
//
// Aggregates everything we know about a contact across SPARK, OLIVER, and
// ARION via GET /api/v1/contacts/:id/360. Read-only — meant as a fast
// glance/diagnostic page; mutations happen on the source-of-truth pages.
//
// URL accepts ?id=<contactId> for direct linking; otherwise the user enters
// a contact ID in the lookup field.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  User,
  Mail,
  Phone,
  Tag,
  List as ListIcon,
  Activity,
  Briefcase,
  StickyNote,
  Search,
  MapPin,
  Hash,
} from "lucide-react";

interface Contact {
  id: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_score: number | null;
  preferred_locale: string | null;
  created_at: string;
  updated_at: string;
  city?: string | null;
  state?: string | null;
}

interface Response360 {
  data: {
    profile: Contact;
    tags?: Array<{ id: number; name: string; color: string | null }>;
    lists?: Array<{ id: number; name: string }>;
    activity?: Array<{ id: number; product: string; activity_type: string; title: string; detail: string | null; occurred_at: string }>;
    email_events?: Array<{ id: number; event_type: string; campaign_name: string | null; campaign_subject: string | null; occurred_at: string }>;
    sms_sends?: Array<{ id: number; campaign_name: string | null; status: string; sent_at: string }>;
    deals?: Array<{ id: number; name: string; stage: string; value: number | null }>;
    oliver_jobs?: Array<{ id: number; status: string; title?: string }>;
    oliver_jobs_warning?: string;
    notes?: Array<{ id: number; body: string; created_at: string; created_by: string | null }>;
    touchpoints?: Array<{ id: number; channel: string; source: string; medium: string; occurred_at: string }>;
    score_link?: string;
  };
}

const PRODUCT_COLORS: Record<string, string> = {
  spark: "#EF6C33",
  oliver: "#FEC82C",
  arion: "#2D9CDB",
};

export function SparkContact360Page() {
  const { get, ready } = useSparkApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlId = searchParams.get("id") || "";
  const [input, setInput] = useState(urlId);
  const [contactId, setContactId] = useState<number | null>(urlId ? parseInt(urlId) : null);
  const [data, setData] = useState<Response360["data"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetch360 = useCallback(async () => {
    if (!ready || contactId == null) return;
    setLoading(true); setError(null);
    try {
      const r = await get<Response360>(`/api/v1/contacts/${contactId}/360`);
      setData(r.data);
    } catch (err) { setError(err); setData(null); }
    finally { setLoading(false); }
  }, [get, ready, contactId]);
  useEffect(() => { fetch360(); }, [fetch360]);

  function lookup() {
    const v = input.trim();
    if (!/^\d+$/.test(v)) return;
    const n = parseInt(v);
    setContactId(n);
    setSearchParams({ id: v });
  }

  const profile = data?.profile;
  const fullName = useMemo(() => {
    if (!profile) return "";
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email || `Contact #${profile.id}`;
  }, [profile]);

  const filters = (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Contact ID</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
          placeholder="e.g. 1234"
          className="w-32 text-xs border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      <button onClick={lookup} disabled={!/^\d+$/.test(input.trim())} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
        <Search className="h-3.5 w-3.5" /> View 360
      </button>
    </div>
  );

  return (
    <SparkPageShell
      title="Contact 360°"
      subtitle={profile ? fullName : "Cross-product unified view"}
      help="Aggregated view of everything the platform knows about a contact across SPARK, OLIVER, and ARION. Read-only — go to source-of-truth pages to make changes."
      filters={filters}
      loading={loading}
      error={error}
    >
      {!data ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <User className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">Look up a contact</div>
          <div className="text-xs text-slate-500 mt-1">Enter a contact ID above to see a unified cross-product timeline.</div>
        </div>
      ) : !profile ? (
        <div className="text-xs text-slate-500">No data.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Profile column */}
          <div className="lg:col-span-1 space-y-3">
            <Card title="Profile" icon={User}>
              <div className="text-base font-bold text-slate-900 mb-1">{fullName}</div>
              <div className="text-[10px] text-slate-400 mb-3">Contact #{profile.id} · Locale {profile.preferred_locale || "—"}</div>
              <MetaRow icon={Mail} label="Email" value={profile.email} />
              <MetaRow icon={Phone} label="Phone" value={profile.phone} />
              <MetaRow icon={Hash} label="Lead score" value={profile.lead_score != null ? String(profile.lead_score) : null} />
              {(profile.city || profile.state) && (
                <MetaRow icon={MapPin} label="Location" value={[profile.city, profile.state].filter(Boolean).join(", ")} />
              )}
              <div className="mt-3 text-[10px] text-slate-400">
                Updated {new Date(profile.updated_at).toLocaleString()}
              </div>
            </Card>

            <Card title="Tags" icon={Tag} count={data.tags?.length}>
              {data.tags && data.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((t) => (
                    <span key={t.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: t.color || "#94A3B8", color: "white" }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              ) : <Empty />}
            </Card>

            <Card title="Lists" icon={ListIcon} count={data.lists?.length}>
              {data.lists && data.lists.length > 0 ? (
                <ul className="text-xs text-slate-700 space-y-0.5">
                  {data.lists.map((l) => <li key={l.id} className="truncate">{l.name}</li>)}
                </ul>
              ) : <Empty />}
            </Card>
          </div>

          {/* Activity + Engagement columns */}
          <div className="lg:col-span-2 space-y-3">
            <Card title="Recent Activity" icon={Activity} count={data.activity?.length}>
              {data.activity && data.activity.length > 0 ? (
                <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full text-white tracking-wide flex-shrink-0 mt-0.5" style={{ background: PRODUCT_COLORS[a.product] || "#64748B" }}>
                        {a.product}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{a.title}</div>
                        {a.detail && <div className="text-slate-600 text-[10px] line-clamp-2">{a.detail}</div>}
                        <div className="text-[10px] text-slate-400 mt-0.5">{new Date(a.occurred_at).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty />}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card title="Email Events" icon={Mail} count={data.email_events?.length}>
                {data.email_events && data.email_events.length > 0 ? (
                  <ul className="text-xs space-y-1 max-h-60 overflow-y-auto">
                    {data.email_events.slice(0, 25).map((e) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="truncate text-slate-700"><code className="text-[10px] bg-slate-100 px-1 rounded mr-1">{e.event_type}</code>{e.campaign_subject || e.campaign_name || "(direct)"}</span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">{new Date(e.occurred_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty />}
              </Card>

              <Card title="SMS Sends" icon={Phone} count={data.sms_sends?.length}>
                {data.sms_sends && data.sms_sends.length > 0 ? (
                  <ul className="text-xs space-y-1 max-h-60 overflow-y-auto">
                    {data.sms_sends.slice(0, 25).map((s) => (
                      <li key={s.id} className="flex items-center justify-between">
                        <span className="truncate text-slate-700"><code className="text-[10px] bg-slate-100 px-1 rounded mr-1">{s.status}</code>{s.campaign_name || "—"}</span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">{new Date(s.sent_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty />}
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card title="SPARK Deals" icon={Briefcase} count={data.deals?.length}>
                {data.deals && data.deals.length > 0 ? (
                  <ul className="text-xs space-y-1">
                    {data.deals.map((d) => (
                      <li key={d.id} className="flex items-center justify-between">
                        <span className="truncate text-slate-700">{d.name}</span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">
                          {d.stage}{d.value != null && ` · $${d.value.toLocaleString()}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty />}
              </Card>

              <Card title="OLIVER Jobs" icon={Briefcase} count={data.oliver_jobs?.length}>
                {data.oliver_jobs && data.oliver_jobs.length > 0 ? (
                  <ul className="text-xs space-y-1">
                    {data.oliver_jobs.map((j) => (
                      <li key={j.id} className="flex items-center justify-between">
                        <span className="truncate text-slate-700">{j.title || `Job #${j.id}`}</span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2"><code>{j.status}</code></span>
                      </li>
                    ))}
                  </ul>
                ) : data.oliver_jobs_warning ? (
                  <div className="text-[10px] italic text-slate-400">OLIVER API unavailable ({data.oliver_jobs_warning})</div>
                ) : <Empty />}
              </Card>
            </div>

            <Card title="Notes" icon={StickyNote} count={data.notes?.length}>
              {data.notes && data.notes.length > 0 ? (
                <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                  {data.notes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <div className="text-slate-700 whitespace-pre-wrap line-clamp-3">{n.body}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{n.created_by || "?"} · {new Date(n.created_at).toLocaleDateString()}</div>
                    </li>
                  ))}
                </ul>
              ) : <Empty />}
            </Card>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Card({ title, icon: Icon, count, children }: { title: string; icon: typeof User; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-3.5 w-3.5" /> {title}
        </div>
        {count != null && (
          <span className="text-[10px] text-slate-400 tabular-nums">{count.toLocaleString()}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-700 mb-0.5">
      <Icon className="h-3 w-3 text-slate-400" />
      <span className="text-[10px] uppercase font-semibold text-slate-400 w-12">{label}</span>
      <span className="truncate flex-1">{value}</span>
    </div>
  );
}

function Empty() { return <div className="text-[10px] italic text-slate-400">No records.</div>; }

export default SparkContact360Page;
