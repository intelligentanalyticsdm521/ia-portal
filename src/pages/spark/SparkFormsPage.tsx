// SparkFormsPage — F-104 library + metrics.
//
// Was a plain table with a "Create Form" button that navigated to a
// separate /spark_form_builder page. Per founder 2026-05-28:
//   "Forms: library + metrics, Form Builder as popup modal"
//
// Now:
//   - SparkPageShell + SparkStatStrip (Total / Active / Submissions / Hosted)
//   - SparkTable rows clickable → open SparkFormBuilderModal (in-page)
//   - "New form" action → simple inline name prompt, then open the modal
//     on the new id (no navigation)
//   - "Hosted ↗" link still opens in a new tab for QA
//
// SparkFormBuilderPage remains as a back-compat route for any deep links
// that still point at /app/services/spark_form_builder?id=…
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkFormBuilderModal } from "../../components/spark/SparkFormBuilderModal";
import { ClipboardList, ExternalLink, Plus, BarChart3, ToggleRight } from "lucide-react";

interface SparkForm {
  id: string;
  name: string;
  submission_count: number;
  is_active: boolean;
  created_at: string;
  slug?: string | null;
}

export function SparkFormsPage() {
  const { get, post, put, ready } = useSparkApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [forms, setForms] = useState<SparkForm[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  // Inline create state (SparkDrawer → IadmModal via F-97 shim).
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Builder modal — drives off the ?builder=<id> URL param so back-compat
  // deep links and the in-page open share the same source of truth.
  const builderId = searchParams.get("builder");
  function openBuilder(id: string) {
    setSearchParams((curr) => {
      const next = new URLSearchParams(curr);
      next.set("builder", id);
      return next;
    });
  }
  function closeBuilder() {
    setSearchParams((curr) => {
      const next = new URLSearchParams(curr);
      next.delete("builder");
      return next;
    });
  }

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await get<{ data: SparkForm[] }>("/api/v1/forms");
      setForms(raw.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await post<{ data: SparkForm }>("/api/v1/forms", { name: name.trim() });
      setCreateOpen(false);
      setName("");
      await load();
      // After create, open the builder modal directly on the new id so the
      // user can design fields without an extra click.
      if (created?.data?.id) openBuilder(String(created.data.id));
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(form: SparkForm) {
    try {
      await put(`/api/v1/forms/${form.id}`, { is_active: !form.is_active });
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: !f.is_active } : f));
    } catch (err) {
      setError(err);
    }
  }

  // Metrics — derived from the loaded forms. No extra API call.
  const stats = useMemo(() => {
    const active = forms.filter((f) => f.is_active).length;
    const hosted = forms.filter((f) => !!f.slug).length;
    const totalSubs = forms.reduce((s, f) => s + (f.submission_count || 0), 0);
    return { active, hosted, totalSubs };
  }, [forms]);

  return (
    <SparkPageShell
      title="Forms"
      subtitle="Form builder with hosted URLs and embedded widgets"
      help={
        <>
          <strong className="block mb-1">How SPARK Forms work:</strong>
          Design fields in the builder (opens as a popup on this page). Each form
          gets a <strong>hosted URL</strong> (a no-JS public form page) and a
          <strong> direct submit URL</strong> for embedding into your own site.
          Built-in fields (first_name / last_name / email / phone / company) auto-
          merge into the same contact in lumen.contact regardless of which form
          they came from.
        </>
      }
      actions={
        <button
          onClick={() => { setName(""); setCreateOpen(true); }}
          className="spark-btn spark-btn-accent"
        >
          <Plus className="h-3.5 w-3.5" /> New form
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total forms", value: forms.length, icon: ClipboardList },
          { label: "Active",      value: stats.active, accent: "emerald", icon: ToggleRight },
          { label: "Submissions", value: stats.totalSubs.toLocaleString(), accent: "blue", icon: BarChart3 },
          { label: "Hosted (slug)", value: stats.hosted },
        ]} />
      }
      loading={loading}
      error={error}
    >
      <SparkTable<SparkForm>
        rows={forms}
        getRowKey={(f) => f.id}
        totalCount={forms.length}
        emptyState="No forms yet. Click 'New form' to create your first one."
        onRowClick={(f) => openBuilder(f.id)}
        columns={[
          {
            key: "name", header: "Form", width: "wide",
            cell: (f) => (
              <div>
                <div className="font-medium">{f.name}</div>
                {f.slug && <div className="text-[10px] text-slate-400 font-mono mt-0.5">slug: {f.slug}</div>}
              </div>
            ),
          },
          {
            key: "subs", header: "Submissions", width: "compact",
            cell: (f) => (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium tabular-nums">
                {f.submission_count.toLocaleString()}
              </span>
            ),
          },
          {
            key: "active", header: "Active", width: "compact",
            cell: (f) => (
              <button
                onClick={(e) => { e.stopPropagation(); toggleActive(f); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${f.is_active ? "bg-blue-600" : "bg-gray-300"}`}
                title={f.is_active ? "Click to disable" : "Click to enable"}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${f.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            ),
          },
          {
            key: "created", header: "Created", width: "compact", hideOnMobile: true,
            cell: (f) => <span className="text-xs text-slate-500">{new Date(f.created_at).toLocaleDateString()}</span>,
          },
        ]}
        rowActions={(f) => {
          const hostedPath = f.slug
            ? `/api/v1/f/${encodeURIComponent("tenant")}/${encodeURIComponent(f.slug)}`
            : `/api/v1/forms/${f.id}/hosted`;
          return (
            <a
              href={hostedPath}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="spark-btn spark-btn-sm spark-btn-secondary"
              title="Open the hosted form page in a new tab"
            >
              Hosted <ExternalLink className="h-3 w-3" />
            </a>
          );
        }}
      />

      {/* New form drawer — uses the SparkDrawer→IadmModal shim from F-97. */}
      <SparkDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New form"
        subtitle="Just a name to start. The visual builder opens automatically on save."
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving || !name.trim()} className="spark-btn spark-btn-primary">
              {saving ? "Creating…" : "Create + open builder"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Form name</label>
          <input
            className="spark-field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Quote Request / Newsletter Signup / Service Request"
            autoFocus
          />
        </div>
      </SparkDrawer>

      {/* Form Builder modal — opened by row click or after Create. */}
      <SparkFormBuilderModal
        open={!!builderId}
        formId={builderId}
        onClose={closeBuilder}
        onSaved={() => { load(); }}
      />
    </SparkPageShell>
  );
}

export default SparkFormsPage;
