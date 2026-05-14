// SparkSmsCampaignsPage — Bulk SMS broadcast campaigns
//
// Master/detail page for LUMEN-API v1.15 SMS campaigns. Pick an audience
// (list / segment / tag / all contacts), pick a template or write inline
// body copy, optionally schedule for later, then trigger the send. The
// detail pane shows live progress + a delivery log of recent sends.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  MessageSquare,
  Send,
  X,
  Trash2,
  Pencil,
  Plus,
  Clock,
  Users,
  Check,
  AlertCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type AudienceType = "list" | "segment" | "tag" | "all";
type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

interface Campaign {
  id: number;
  tenant_id: string;
  name: string;
  description: string | null;
  template_id: number | null;
  body: string | null;
  audience_type: AudienceType;
  audience_id: number | null;
  scheduled_at: string | null;
  status: CampaignStatus;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

type SendStatus = "queued" | "sent" | "failed" | "skipped";

interface CampaignSend {
  id: number;
  campaign_id: number;
  contact_id: number | null;
  to_phone: string;
  status: SendStatus;
  error_message: string | null;
  acs_message_id: string | null;
  sent_at: string | null;
}

interface CampaignForm {
  name: string;
  description: string;
  audience_type: AudienceType;
  audience_id: string; // numeric input, kept as string to allow empty
  body_mode: "template" | "inline";
  template_id: string;
  body: string;
  scheduled_at: string; // datetime-local
}

const EMPTY_FORM: CampaignForm = {
  name: "",
  description: "",
  audience_type: "all",
  audience_id: "",
  body_mode: "inline",
  template_id: "",
  body: "",
  scheduled_at: "",
};

// ── Status pill ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<CampaignStatus, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#F1F5F9", fg: "#475569", label: "Draft" },
  scheduled: { bg: "#DBEAFE", fg: "#1E40AF", label: "Scheduled" },
  sending: { bg: "#FEF3C7", fg: "#92400E", label: "Sending" },
  sent: { bg: "#D1FAE5", fg: "#065F46", label: "Sent" },
  cancelled: { bg: "#F1F5F9", fg: "#475569", label: "Cancelled" },
  failed: { bg: "#FEE2E2", fg: "#991B1B", label: "Failed" },
};

function StatusPill({ status }: { status: CampaignStatus }) {
  const s = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

const SEND_STATUS_COLORS: Record<SendStatus, { bg: string; fg: string }> = {
  queued: { bg: "#F1F5F9", fg: "#475569" },
  sent: { bg: "#D1FAE5", fg: "#065F46" },
  failed: { bg: "#FEE2E2", fg: "#991B1B" },
  skipped: { bg: "#F5F5F4", fg: "#78716C" },
};

function SendStatusPill({ status }: { status: SendStatus }) {
  const c = SEND_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {status}
    </span>
  );
}

// ── Time formatting ─────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 0) {
    // Future (scheduled). Express as "in Xm/Xh/Xd".
    const ahead = -diffSec;
    if (ahead < 60) return `in ${ahead}s`;
    const m = Math.floor(ahead / 60);
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h}h`;
    const days = Math.floor(h / 24);
    return `in ${days}d`;
  }
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 minute ago";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? "" : "s"} ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
}

function fmtAbs(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

// ── Page ─────────────────────────────────────────────────────────────

export function SparkSmsCampaignsPage() {
  const { get, post, patch, del, ready } = useSparkApi();

  const [list, setList] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<CampaignSend[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [showSendLog, setShowSendLog] = useState(true);

  // ── Fetchers ──────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: Campaign[] }>("/api/v1/sms-campaigns");
      const items = r?.data || [];
      setList(items);
      // If nothing selected, pick the first one.
      if (items.length > 0 && selectedId == null) {
        setSelectedId(items[0].id);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchDetail = useCallback(
    async (id: number) => {
      if (!ready) return;
      setDetailLoading(true);
      try {
        const r = await get<{ data: Campaign; sends: CampaignSend[] }>(
          `/api/v1/sms-campaigns/${id}`,
        );
        setDetail(r?.data ?? null);
        setSends(r?.sends ?? []);
      } catch {
        // Detail fetch is non-critical to keep the list usable.
        setDetail(null);
        setSends([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [get, ready],
  );

  useEffect(() => {
    if (selectedId != null) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
      setSends([]);
    }
  }, [selectedId, fetchDetail]);

  // ── Mutations ─────────────────────────────────────────────────────

  function buildPayload(): Record<string, unknown> | null {
    const name = form.name.trim();
    if (!name) return null;
    const payload: Record<string, unknown> = {
      name,
      description: form.description.trim() || null,
      audience_type: form.audience_type,
      audience_id:
        form.audience_type === "all"
          ? null
          : form.audience_id.trim()
            ? Number(form.audience_id)
            : null,
      scheduled_at: form.scheduled_at.trim()
        ? new Date(form.scheduled_at).toISOString()
        : null,
    };
    if (form.body_mode === "template") {
      payload.template_id = form.template_id.trim() ? Number(form.template_id) : null;
      payload.body = null;
    } else {
      payload.template_id = null;
      payload.body = form.body;
    }
    return payload;
  }

  async function refreshAndSelect(id: number | null) {
    await fetchList();
    if (id != null) {
      setSelectedId(id);
      await fetchDetail(id);
    }
  }

  async function submitCreate() {
    const body = buildPayload();
    if (!body) return;
    setSubmitting(true);
    try {
      const r = await post<{ data: Campaign }>("/api/v1/sms-campaigns", body);
      const newId = r?.data?.id ?? null;
      setCreating(false);
      setForm(EMPTY_FORM);
      await refreshAndSelect(newId);
    } catch (err) {
      alert(`Failed to create: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit() {
    if (!detail) return;
    const body = buildPayload();
    if (!body) return;
    setSubmitting(true);
    try {
      await patch(`/api/v1/sms-campaigns/${detail.id}`, body);
      setEditing(false);
      await refreshAndSelect(detail.id);
    } catch (err) {
      alert(`Failed to save: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendNow() {
    if (!detail) return;
    if (!confirm(`Send "${detail.name}" now? This cannot be undone.`)) return;
    try {
      await post(`/api/v1/sms-campaigns/${detail.id}/send`, {});
      await refreshAndSelect(detail.id);
    } catch (err) {
      alert(`Failed to send: ${(err as Error).message}`);
    }
  }

  async function cancelCampaign() {
    if (!detail) return;
    if (!confirm(`Cancel the scheduled send of "${detail.name}"?`)) return;
    try {
      await post(`/api/v1/sms-campaigns/${detail.id}/cancel`, {});
      await refreshAndSelect(detail.id);
    } catch (err) {
      alert(`Failed to cancel: ${(err as Error).message}`);
    }
  }

  async function deleteCampaign() {
    if (!detail) return;
    if (!confirm(`Delete "${detail.name}"? This cannot be undone.`)) return;
    try {
      await del(`/api/v1/sms-campaigns/${detail.id}`);
      const remaining = list.filter((c) => c.id !== detail.id);
      const nextId = remaining[0]?.id ?? null;
      setSelectedId(nextId);
      await fetchList();
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`);
    }
  }

  async function retryFailed() {
    if (!detail) return;
    if (!confirm(`Re-send to the ${detail.failed_count} contacts that previously failed?`)) return;
    try {
      await post(`/api/v1/sms-campaigns/${detail.id}/retry-failed`, {});
      await fetchList();
      await fetchDetail(detail.id);
    } catch (err) {
      alert(`Failed to retry: ${(err as Error).message}`);
    }
  }

  function startEdit() {
    if (!detail) return;
    setForm({
      name: detail.name,
      description: detail.description ?? "",
      audience_type: detail.audience_type,
      audience_id: detail.audience_id != null ? String(detail.audience_id) : "",
      body_mode: detail.template_id != null ? "template" : "inline",
      template_id: detail.template_id != null ? String(detail.template_id) : "",
      body: detail.body ?? "",
      scheduled_at: detail.scheduled_at
        ? toLocalInputValue(detail.scheduled_at)
        : "",
    });
    setEditing(true);
  }

  // ── Derived ───────────────────────────────────────────────────────

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) || null,
    [list, selectedId],
  );

  const statsStrip = useMemo(() => {
    if (!detail) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <MetricTile label="Targets" value={detail.total_targets} icon={Users} />
        <MetricTile label="Sent" value={detail.sent_count} icon={Check} tint="#065F46" />
        <MetricTile
          label="Failed"
          value={detail.failed_count}
          icon={AlertCircle}
          tint="#991B1B"
        />
        <MetricTile label="Skipped" value={detail.skipped_count} icon={X} tint="#78716C" />
      </div>
    );
  }, [detail]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <SparkPageShell
      title="SMS Campaigns"
      subtitle={`${list.length} campaign${list.length === 1 ? "" : "s"}`}
      help="Bulk SMS broadcasts to a list, segment, tag, or your full contact base. Pick a template or write inline copy, optionally schedule for later, then monitor live delivery progress and the per-contact send log."
      actions={
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditing(false);
            setCreating(true);
          }}
          className="text-sm px-3 py-1.5 rounded text-white flex items-center gap-1"
          style={{ background: "#EF6C33" }}
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      }
      stats={statsStrip ?? undefined}
      loading={loading}
      error={error}
    >
      {(creating || editing) && (
        <CampaignFormCard
          mode={editing ? "edit" : "create"}
          form={form}
          setForm={setForm}
          submitting={submitting}
          onCancel={() => {
            setCreating(false);
            setEditing(false);
            setForm(EMPTY_FORM);
          }}
          onSubmit={editing ? submitEdit : submitCreate}
        />
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No campaigns yet</div>
          <div className="text-xs text-slate-500 mt-1">
            Create your first SMS campaign to broadcast to a list, segment, tag, or
            your full contact base.
          </div>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setCreating(true);
            }}
            className="mt-4 text-xs px-3 py-1.5 rounded text-white"
            style={{ background: "#EF6C33" }}
          >
            Create campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          {/* Sidebar list */}
          <aside>
            <ul className="space-y-1">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                      selectedId === c.id
                        ? "border-[#EF6C33] bg-orange-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">
                        {c.name}
                      </span>
                      <StatusPill status={c.status} />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> created {timeAgo(c.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Detail pane */}
          <section className="space-y-3">
            {detailLoading && !detail ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Loading campaign…
              </div>
            ) : detail ? (
              <>
                <CampaignDetailCard
                  c={detail}
                  onSendNow={sendNow}
                  onCancel={cancelCampaign}
                  onEdit={startEdit}
                  onDelete={deleteCampaign}
                  onRetryFailed={retryFailed}
                />
                <SendLog
                  sends={sends}
                  expanded={showSendLog}
                  onToggle={() => setShowSendLog((v) => !v)}
                />
              </>
            ) : selected ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Couldn&apos;t load campaign details.
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                Select a campaign from the list to view details.
              </div>
            )}
          </section>
        </div>
      )}
    </SparkPageShell>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  tint?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 min-w-[120px]">
      <Icon className="h-4 w-4" style={{ color: tint ?? "#0B1C24" }} />
      <div>
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums" style={{ color: tint ?? "#0B1C24" }}>
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ── Detail card ──────────────────────────────────────────────────────

function CampaignDetailCard({
  c,
  onSendNow,
  onCancel,
  onEdit,
  onDelete,
  onRetryFailed,
}: {
  c: Campaign;
  onSendNow: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetryFailed: () => void;
}) {
  const canSendNow = c.status === "draft" || c.status === "scheduled";
  const canCancel = c.status === "scheduled";
  const canEdit = c.status === "draft" || c.status === "scheduled";
  const canDelete = c.status !== "sending" && c.status !== "sent";
  const canRetryFailed = (c.status === "sent" || c.status === "failed") && c.failed_count > 0;

  const progressPct =
    c.total_targets > 0
      ? Math.min(100, Math.round((c.sent_count / c.total_targets) * 100))
      : 0;

  const audienceLabel =
    c.audience_type === "all"
      ? "All contacts"
      : `${c.audience_type[0].toUpperCase()}${c.audience_type.slice(1)} #${c.audience_id ?? "?"}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900 truncate">{c.name}</h3>
            <StatusPill status={c.status} />
          </div>
          {c.description && (
            <div className="text-xs text-slate-600 mt-1">{c.description}</div>
          )}
          <div className="text-[10px] text-slate-400 mt-1">
            Created {timeAgo(c.created_at)}
            {c.created_by ? ` by ${c.created_by}` : ""} · updated{" "}
            {timeAgo(c.updated_at)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 flex-shrink-0">
          {canSendNow && (
            <button
              onClick={onSendNow}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded text-white"
              style={{ background: "#EF6C33" }}
              title="Send this campaign immediately"
            >
              <Send className="h-3 w-3" /> Send now
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          )}
          {canEdit && (
            <button
              onClick={onEdit}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
          {canRetryFailed && (
            <button
              onClick={onRetryFailed}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              title={`Re-send to the ${c.failed_count} contacts that previously failed`}
            >
              <Send className="h-3 w-3" /> Retry failed ({c.failed_count})
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <MetaRow label="Audience" icon={Users}>
          {audienceLabel}
        </MetaRow>
        <MetaRow label="Scheduled" icon={Clock}>
          {c.scheduled_at ? (
            <span title={fmtAbs(c.scheduled_at)}>{fmtAbs(c.scheduled_at)}</span>
          ) : (
            <span className="text-slate-400">Not scheduled</span>
          )}
        </MetaRow>
        <MetaRow label="Started">
          {c.started_at ? <span title={fmtAbs(c.started_at)}>{timeAgo(c.started_at)}</span> : "—"}
        </MetaRow>
        <MetaRow label="Completed">
          {c.completed_at ? (
            <span title={fmtAbs(c.completed_at)}>{timeAgo(c.completed_at)}</span>
          ) : (
            "—"
          )}
        </MetaRow>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
            Send progress
          </div>
          <div className="text-[11px] tabular-nums text-slate-600">
            {c.sent_count.toLocaleString()} / {c.total_targets.toLocaleString()} ({progressPct}%)
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background:
                c.status === "failed"
                  ? "#DC2626"
                  : c.status === "sent"
                    ? "#10B981"
                    : "#EF6C33",
            }}
          />
        </div>
        {c.last_error && (
          <div className="mt-2 flex items-start gap-1 text-[11px] text-red-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span className="break-words">{c.last_error}</span>
          </div>
        )}
      </div>

      {/* Body preview */}
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1">
          Message body
          {c.template_id != null && (
            <span className="ml-2 normal-case text-[10px] text-slate-400">
              (from template #{c.template_id})
            </span>
          )}
        </div>
        <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {c.body || "(template body — not inlined on this record)"}
        </pre>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wide text-slate-500 w-24 flex-shrink-0">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-xs text-slate-800 break-words">{children}</div>
    </div>
  );
}

// ── Send log ─────────────────────────────────────────────────────────

function SendLog({
  sends,
  expanded,
  onToggle,
}: {
  sends: CampaignSend[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          Delivery log
          <span className="text-[10px] font-normal text-slate-500">
            ({sends.length.toLocaleString()} most recent)
          </span>
        </span>
        <span className="text-xs text-slate-500">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-200 overflow-x-auto">
          {sends.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No sends recorded yet.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">Contact</th>
                  <th className="text-left px-3 py-2 font-semibold">Phone</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-600 tabular-nums" title={fmtAbs(s.sent_at)}>
                      {timeAgo(s.sent_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      {s.contact_id != null ? (
                        <a
                          href={`/app/services/spark_contacts?id=${s.contact_id}`}
                          className="text-[#EF6C33] hover:underline"
                        >
                          #{s.contact_id}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-700">{s.to_phone}</td>
                    <td className="px-3 py-1.5">
                      <SendStatusPill status={s.status} />
                    </td>
                    <td
                      className="px-3 py-1.5 text-red-700 max-w-[280px] truncate"
                      title={s.error_message ?? undefined}
                    >
                      {s.error_message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / edit form ───────────────────────────────────────────────

function CampaignFormCard({
  mode,
  form,
  setForm,
  submitting,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: CampaignForm;
  setForm: (f: CampaignForm) => void;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const audienceNeedsId = form.audience_type !== "all";
  return (
    <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
      <div className="text-sm font-bold text-slate-900 mb-3">
        {mode === "create" ? "New SMS campaign" : "Edit campaign"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Name *
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="May newsletter blast"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
            autoFocus
          />
        </label>
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Description
          </div>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="(optional)"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
          />
        </label>
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Audience type
          </div>
          <select
            value={form.audience_type}
            onChange={(e) =>
              setForm({
                ...form,
                audience_type: e.target.value as AudienceType,
                audience_id: e.target.value === "all" ? "" : form.audience_id,
              })
            }
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
          >
            <option value="all">All contacts</option>
            <option value="list">List</option>
            <option value="segment">Segment</option>
            <option value="tag">Tag</option>
          </select>
        </label>
        {audienceNeedsId && (
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
              {form.audience_type[0].toUpperCase()}
              {form.audience_type.slice(1)} ID
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.audience_id}
              onChange={(e) =>
                setForm({ ...form, audience_id: e.target.value.replace(/[^\d]/g, "") })
              }
              placeholder="e.g. 42"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
            />
          </label>
        )}
        <label className="text-xs md:col-span-2">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Schedule send (leave empty to save as draft)
          </div>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
          />
        </label>
      </div>

      {/* Body mode picker */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
          Message
        </div>
        <div className="flex items-center gap-4 mb-2 text-xs text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="body_mode"
              checked={form.body_mode === "template"}
              onChange={() => setForm({ ...form, body_mode: "template" })}
            />
            Use template
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="body_mode"
              checked={form.body_mode === "inline"}
              onChange={() => setForm({ ...form, body_mode: "inline" })}
            />
            Write inline
          </label>
        </div>
        {form.body_mode === "template" ? (
          <label className="text-xs block">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
              Template ID
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.template_id}
              onChange={(e) =>
                setForm({ ...form, template_id: e.target.value.replace(/[^\d]/g, "") })
              }
              placeholder="e.g. 17"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
            />
          </label>
        ) : (
          <label className="text-xs block">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
              Body
            </div>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4}
              placeholder="Hi {{first_name}}, …"
              className="w-full text-sm font-mono border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
            />
            <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
              {form.body.length} chars · {Math.ceil(Math.max(1, form.body.length) / 160)} segment(s)
            </div>
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={
            submitting ||
            !form.name.trim() ||
            (form.body_mode === "inline" && !form.body.trim()) ||
            (form.body_mode === "template" && !form.template_id.trim())
          }
          className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
          style={{ background: "#EF6C33" }}
        >
          {submitting ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── datetime-local helper ────────────────────────────────────────────

// Convert an ISO timestamp to the local "YYYY-MM-DDTHH:mm" string the
// <input type="datetime-local"> control wants. The browser interprets
// that string in the user's local TZ, so we feed it local components.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default SparkSmsCampaignsPage;
