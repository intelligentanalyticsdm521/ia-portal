// SparkSendersPage — CRUD UI for /api/v1/senders (LUMEN-API track building it).
//
// A Sender is the (Display Name, local_part, domain, reply_to?) tuple that
// composes into an RFC 5322 "From:" line. Senders are scoped to a verified
// sender_domain — you cannot create a sender on an unverified domain.
//
// Locked 2026-06-24: SPARK Composer v1.1 pulls Senders + Signatures from this
// table and the sibling Signatures page. Onboarding-1.0.0 hardcodes one
// IA default sender; this is the first place a tenant can name multiple
// "From" identities (welcome@, hello@, support@, etc.).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Plus, Star, Trash2, Pencil, Mail } from "lucide-react";

interface SenderDomain {
  id: number;
  domain: string;
  status: "pending" | "verified" | "failed";
  is_default: boolean;
}

// Field names MUST match LUMEN-API GET /api/v1/senders (routes/senders.js):
// the row is SELECTed straight out of lumen.sender_address, so it carries
// `sender_domain_id` and `reply_to_override` — NOT `domain_id` / `reply_to`.
// 2026-09-01: this page previously declared the short names, which meant
// openEdit() read undefined into form.domain_id (Save button permanently
// disabled on edit), the Reply-to column always rendered "—", and the
// create/update bodies used keys the API ignores (POST 400'd on the missing
// sender_domain_id; PUT silently dropped the reply-to).
interface Sender {
  id: number;
  display_name: string;
  local_part: string;
  domain: string;
  sender_domain_id: number;
  reply_to_override: string | null;
  is_default: boolean;
  // 2026-06-24 — is_system marks the IA shared default senders seeded by
  // migration 065 (noreply / welcome / support / hello / notifications on
  // ia-dm.com). Surfaced to every tenant so the From dropdown is never
  // empty, but tenants can't edit / delete / set-default these rows; the
  // API blocks the mutations and the UI hides the buttons.
  is_system?: boolean;
  created_at: string;
}

interface SenderForm {
  id?: number;
  display_name: string;
  local_part: string;
  domain_id: number | null;
  reply_to: string;
}

const EMPTY_FORM: SenderForm = { display_name: "", local_part: "", domain_id: null, reply_to: "" };

// Allow alphanumeric + . + - + _, no @, no spaces. Local-part RFC 5321
// allows more but this is the safe set every recipient mailbox accepts.
const LOCAL_PART_RE = /^[a-zA-Z0-9._-]+$/;

export function SparkSendersPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [list, setList] = useState<Sender[]>([]);
  const [domains, setDomains] = useState<SenderDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SenderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [s, d] = await Promise.all([
        get<{ data: Sender[] }>("/api/v1/senders"),
        get<{ data: SenderDomain[] }>("/api/v1/sender-domains"),
      ]);
      setList(s?.data || []);
      setDomains((d?.data || []).filter(x => x.status === "verified"));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectedDomain = useMemo(
    () => domains.find(d => d.id === form.domain_id) || null,
    [domains, form.domain_id]
  );

  const previewFrom = useMemo(() => {
    const display = form.display_name.trim() || "(display name)";
    const local = form.local_part.trim() || "local";
    const domain = selectedDomain?.domain || "yourdomain.com";
    return `${display} <${local}@${domain}>`;
  }, [form.display_name, form.local_part, selectedDomain]);

  const localPartValid = form.local_part === "" || LOCAL_PART_RE.test(form.local_part);
  const canSave = !!form.display_name.trim() && !!form.local_part.trim() && !!form.domain_id && localPartValid;

  function openAdd() {
    // Preselect the tenant's default verified domain if available.
    const def = domains.find(d => d.is_default) || domains[0] || null;
    setForm({ ...EMPTY_FORM, domain_id: def?.id ?? null });
    setModalOpen(true);
  }

  function openEdit(s: Sender) {
    setForm({
      id: s.id,
      display_name: s.display_name,
      local_part: s.local_part,
      domain_id: s.sender_domain_id,
      reply_to: s.reply_to_override || "",
    });
    setModalOpen(true);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      // Keys are the API's, not the form's — see the Sender interface note.
      const body = {
        display_name: form.display_name.trim(),
        local_part: form.local_part.trim().toLowerCase(),
        sender_domain_id: form.domain_id,
        reply_to_override: form.reply_to.trim() || null,
      };
      if (form.id) {
        await put(`/api/v1/senders/${form.id}`, body);
      } else {
        await post("/api/v1/senders", body);
      }
      setModalOpen(false);
      await fetchAll();
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally { setSaving(false); }
  }

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/senders/${id}/default`, {});
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this sender? Campaigns using it will fall back to the default.")) return;
    try {
      await del(`/api/v1/senders/${id}`);
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const noVerifiedDomain = domains.length === 0;

  return (
    <SparkPageShell
      title="Senders"
      subtitle={`${list.length} sender${list.length === 1 ? "" : "s"}`}
      help={
        <>
          A <strong>sender</strong> is a named From-address you can pick when composing a SPARK campaign.
          You can have multiple senders on the same verified sender domain (e.g. <code>welcome@</code>, <code>support@</code>, <code>hello@</code>).
          The default sender is used when a campaign doesn't override it.
        </>
      }
      actions={
        <div className="flex items-center gap-2">
          {/* Deliverability stops being a nav section and becomes a status you
              glance at from where you manage senders — which is where you'd
              act on it anyway. The full dashboard (suppression list, SPF /
              DKIM / DMARC verifier, bounce trend) is one click away rather
              than deleted. */}
          <Link
            to="/app/services/spark_deliverability"
            data-tour="senders-deliverability"
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium ${
              noVerifiedDomain
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
            title="Deliverability — bounces, suppressions and DNS checks"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${noVerifiedDomain ? "bg-amber-500" : "bg-emerald-500"}`} />
            Deliverability{noVerifiedDomain ? " — needs setup" : " — OK"}
          </Link>
          <button
            onClick={openAdd}
            disabled={noVerifiedDomain}
            title={noVerifiedDomain ? "Verify a sender domain first" : ""}
            className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add sender
          </button>
        </div>
      }
      loading={loading}
      error={error}
    >
      {noVerifiedDomain && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You don't have any verified sender domains yet. Add and verify a sender domain
          first, then come back here to define the From-addresses you'll send from.
        </div>
      )}

      <div className="border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-2 font-semibold">Display name</th>
              <th className="text-left p-2 font-semibold">Email</th>
              <th className="text-left p-2 font-semibold">Reply-to</th>
              <th className="text-center p-2 font-semibold">Default</th>
              <th className="text-right p-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">
                No senders yet. Click "Add sender" to define your first From-address.
              </td></tr>
            )}
            {list.map(s => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <span>{s.display_name}</span>
                    {s.is_system && (
                      <span
                        title="Shared IA default — available to every tenant. Add your own sender to use a branded From-address."
                        className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider"
                      >
                        IA default
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2 text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3 text-slate-400" />
                    {s.local_part}@{s.domain}
                  </span>
                </td>
                <td className="p-2 text-slate-500 text-xs">{s.reply_to_override || "—"}</td>
                <td className="p-2 text-center">
                  {s.is_default && <Star className="h-4 w-4 text-[#EF6C33] inline" />}
                </td>
                <td className="p-2">
                  <div className="flex items-center justify-end gap-1">
                    {/* IA shared defaults are platform-managed. Hide all
                        mutation affordances — the backend rejects them too
                        (403 system_sender_readonly). */}
                    {!s.is_system && !s.is_default && (
                      <button
                        onClick={() => setDefault(s.id)}
                        className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1"
                      >
                        <Star className="h-3 w-3" /> Set default
                      </button>
                    )}
                    {!s.is_system && (
                      <>
                        <button
                          onClick={() => openEdit(s)}
                          className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          onClick={() => remove(s.id)}
                          className="text-xs px-2 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IadmModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product="spark"
        size="info"
        title={form.id ? "Edit sender" : "Add sender"}
        subtitle="Pick a verified sender domain and the local part to compose the From-address."
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setModalOpen(false)}>Cancel</IadmButton>
            <IadmButton
              variant="accent"
              product="spark"
              onClick={save}
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : form.id ? "Save changes" : "Create sender"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <Labeled label="Sender domain">
            <select
              value={form.domain_id ?? ""}
              onChange={(e) => setForm({ ...form, domain_id: e.target.value ? Number(e.target.value) : null })}
              className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
            >
              <option value="">-- Select a verified domain --</option>
              {domains.map(d => (
                <option key={d.id} value={d.id}>
                  {d.domain}{d.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Local part" hint="The part before the @. Letters, numbers, dot, dash, underscore.">
              <input
                value={form.local_part}
                placeholder="welcome"
                onChange={(e) => setForm({ ...form, local_part: e.target.value.replace(/\s/g, "") })}
                className={`w-full text-sm border rounded p-2 focus:ring-1 ${
                  localPartValid
                    ? "border-slate-300 focus:border-[#EF6C33] focus:ring-[#EF6C33]"
                    : "border-rose-400 focus:border-rose-500 focus:ring-rose-300"
                }`}
              />
              {!localPartValid && (
                <div className="text-[11px] text-rose-600 mt-0.5">
                  Only letters, numbers, dot, dash, and underscore are allowed.
                </div>
              )}
            </Labeled>
            <Labeled label="Display name" hint="The name your recipients see in their inbox.">
              <input
                value={form.display_name}
                placeholder="Acme Co."
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
              />
            </Labeled>
          </div>

          <Labeled label="Reply-to override (optional)" hint="If empty, replies go to the From-address.">
            <input
              value={form.reply_to}
              placeholder="support@yourbusiness.com"
              onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
            />
          </Labeled>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Preview</div>
            <div className="text-sm font-mono text-slate-800">
              <span className="text-slate-500">From: </span>{previewFrom}
            </div>
          </div>
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <div className="mt-0.5">{children}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

export default SparkSendersPage;
