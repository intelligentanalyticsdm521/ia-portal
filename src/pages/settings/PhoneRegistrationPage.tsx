// Settings → Phone & texting → the carrier registration form (SMS-15).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A FORM AND NOT AN EMAIL THREAD.
//
// To text customers from a US business number, the carriers have to approve the
// BUSINESS: legal name, EIN, address, website, how it collects permission, and
// three to five real examples of what it will send. That filing costs about $44
// and the fee is spent whether the answer is yes or no. It cannot be edited
// afterwards. A rejection means paying again and waiting another five to eight
// business days, during which the client has a number that cannot text.
//
// Every common rejection is a missing field, and every one of them is knowable
// before we pay. So this is a required form, it validates as it saves, and the
// founder's "File carrier registration" button does not exist until it is
// complete.
//
// THE EIN IS OPTIONAL AND THE COST OF LEAVING IT BLANK IS ON THE SCREEN. A real
// sole proprietor has none; refusing them a line would refuse a whole category
// of client. What they get told, next to the empty box rather than in a support
// email afterwards, is that it means one campaign and a low daily limit.
//
// NEVER "INSTANT". The waiting copy comes from the server, verbatim, from the
// one place it is written (holistic §3).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

interface FieldDef {
  key: string;
  required: boolean;
  label: string;
  help?: string;
}

interface CheckResult {
  url?: string;
  status: "passed" | "failed" | "skipped";
  reason?: string;
  http?: number;
}

interface Payload {
  data: {
    line_id: number | null;
    registration_status: string;
    editable: boolean;
    record: Record<string, unknown>;
    complete: boolean;
    missing: string[];
    warnings: { field: string; message: string }[];
    unchecked: string[];
    sole_proprietor: boolean;
  };
  meta: {
    fields: FieldDef[];
    business_types: string[];
    blocked_shorteners: string[];
    sole_proprietor_warning: string;
    what_happens_next: string;
  };
}

const LONG_FIELDS = new Set(["opt_in_description"]);

export function PhoneRegistrationPage() {
  const { get, put, ready } = useSparkApi();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [samples, setSamples] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await get<Payload>("/api/v1/conversations/phone-line/registration");
      setPayload(r);
      const rec = (r.data?.record || {}) as Record<string, unknown>;
      const next: Record<string, string> = {};
      for (const f of r.meta?.fields || []) {
        if (f.key === "sample_messages") continue;
        next[f.key] = String(rec[f.key] ?? "");
      }
      setForm(next);
      const s = Array.isArray(rec.sample_messages) ? (rec.sample_messages as string[]) : [];
      setSamples(s.length ? s : ["", "", ""]);
      setChecks((rec.checks as Record<string, CheckResult>) || {});
      setError(null);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const body = {
        registration: {
          ...form,
          sample_messages: samples.map((s) => s.trim()).filter(Boolean),
          uses_link_shorteners: false,
          affiliate_marketing: false,
        },
      };
      const r = await put<{
        ok: boolean;
        errors: { field: string; message: string }[];
        warnings: { field: string; message: string }[];
        checks: Record<string, CheckResult>;
        can_file: boolean;
        missing: string[];
      }>("/api/v1/conversations/phone-line/registration", body);
      const map: Record<string, string> = {};
      for (const e of r.errors || []) map[e.field] = e.message;
      setErrors(map);
      setChecks(r.checks || {});
      setNotice(r.can_file
        ? "Saved. Everything the carriers need is in — we file it next."
        : "Saved. There is still something missing before we can file it.");
      await load();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const fields = payload?.meta?.fields || [];
  const editable = payload?.data?.editable !== false;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <Link
          to="/app/settings/phone-texting"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />Phone &amp; texting
        </Link>
      </div>

      <header className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">What the mobile carriers need to know</h1>
        {payload?.meta?.what_happens_next && (
          <p className="mt-2 text-sm text-gray-600">{payload.meta.what_happens_next}</p>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          We get one go at this. Once it is filed it cannot be changed, and a refusal means starting
          again — so it is worth checking your answers before you finish.
        </p>
      </header>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!loading && !payload?.data?.line_id && (
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Ask for a number first — this registration is filed against a specific number.{" "}
          <Link to="/app/settings/phone-texting" className="underline">Phone &amp; texting</Link>
        </div>
      )}

      {!loading && !editable && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This has gone to the carriers and cannot be changed. If something is wrong, tell us and we
          will re-file it.
        </div>
      )}

      {!loading && payload?.data?.line_id && (
        <section className="space-y-4 rounded-lg border bg-white p-5">
          {fields.filter((f) => f.key !== "sample_messages").map((f) => (
            <div key={f.key}>
              <label htmlFor={`reg-${f.key}`} className="block text-xs font-semibold text-slate-800">
                {f.label}
                {!f.required && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
              </label>
              {f.help && <p className="mt-0.5 text-[11px] text-slate-500">{f.help}</p>}
              {f.key === "business_type" ? (
                <select
                  id={`reg-${f.key}`}
                  value={form[f.key] || ""}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                >
                  <option value="">Choose…</option>
                  {(payload.meta.business_types || []).map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              ) : LONG_FIELDS.has(f.key) ? (
                <textarea
                  id={`reg-${f.key}`}
                  rows={3}
                  value={form[f.key] || ""}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                />
              ) : (
                <input
                  id={`reg-${f.key}`}
                  type="text"
                  value={form[f.key] || ""}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                />
              )}
              {errors[f.key] && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />{errors[f.key]}
                </p>
              )}
              {/* The two public pages: what we saw when we looked. A check that
                  did not run says so, and is never shown as a pass. */}
              {checks[f.key] && (
                <p className={`mt-1 flex items-start gap-1 text-[11px] ${
                  checks[f.key].status === "passed" ? "text-emerald-700"
                    : checks[f.key].status === "failed" ? "text-rose-700" : "text-slate-500"
                }`}>
                  {checks[f.key].status === "passed"
                    ? <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    : <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />}
                  {checks[f.key].status === "passed"
                    ? "We can see this page and it mentions text messages."
                    : checks[f.key].status === "skipped"
                      ? "We have not been able to check this page yet."
                      : `We could not use this page — ${checks[f.key].reason}.`}
                </p>
              )}
              {f.key === "ein" && !form.ein && payload.meta.sole_proprietor_warning && (
                <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  {payload.meta.sole_proprietor_warning}
                </p>
              )}
            </div>
          ))}

          {/* Samples — three to five, and they are read for link shorteners. */}
          <div>
            <label className="block text-xs font-semibold text-slate-800">Sample messages</label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Three to five real examples of what you would text a customer. The carrier reads these.
              Public link shorteners ({(payload.meta.blocked_shorteners || []).slice(0, 3).join(", ")}…)
              are blocked outright — use your own web address.
            </p>
            {samples.map((sample, i) => (
              <input
                key={i}
                type="text"
                value={sample}
                disabled={!editable}
                placeholder={i === 0 ? "Hi {name}, your appointment is tomorrow at 9am. Reply STOP to opt out." : ""}
                onChange={(e) => {
                  const next = [...samples];
                  next[i] = e.target.value;
                  setSamples(next);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
              />
            ))}
            {editable && samples.length < 5 && (
              <button
                type="button"
                onClick={() => setSamples([...samples, ""])}
                className="mt-1 text-[11px] text-slate-600 underline hover:text-slate-800"
              >
                Add another
              </button>
            )}
            {errors.sample_messages && (
              <p className="mt-1 flex items-start gap-1 text-[11px] text-rose-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />{errors.sample_messages}
              </p>
            )}
          </div>

          {(payload.data.warnings || []).filter((w) => w.field !== "ein").map((w) => (
            <p key={w.field} className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">{w.message}</p>
          ))}

          {payload.data.complete && (
            <p className="flex items-start gap-1.5 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Everything the carriers need is in. We file it for you — nothing else to do.
            </p>
          )}

          {editable && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded bg-[#EF6C33] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
            >
              Save
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export default PhoneRegistrationPage;
