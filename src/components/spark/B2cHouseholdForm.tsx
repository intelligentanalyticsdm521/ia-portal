/**
 * B2cHouseholdForm — the household (B2C) search, behind the chooser. Growth B19.
 *
 * WIRED, AND OFF. This component is only ever mounted when the server has said
 * B2C is available (`GET /api/v1/leadgen/models`), which needs
 * `B2C_SEARCH_ENABLED` on LUMEN. With the switch off — everywhere today — the
 * chooser stays locked exactly as it is, and this file is unreachable.
 *
 * WHAT MAKES THIS FORM DIFFERENT FROM THE B2B ONE, and why it is its own file
 * rather than a branch inside the 1,500-line New Search page:
 *
 *   · There are no keywords. A household is not found by what it sells; it is
 *     found by a TRIGGER — it moved in recently, the house is old, a permit was
 *     filed. Those come from the server, so the taxonomy is one list and not
 *     two.
 *   · The rule is on screen before anything is filled in. Direct mail only, and
 *     the system CANNOT store an email or a phone number for these records.
 *   · There is a price per record, and while nobody has set one the form says
 *     so rather than showing $0.00 — which is a price, and the wrong one.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Mailbox } from "lucide-react";
import {
  type TriggerRow, type TriggerSelection,
  B2C_RULE, B2C_MOCK_NOTICE, defaultSelection, validateB2cForm, resultSentence,
} from "../../lib/b2cSearch";

interface Api {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
}

interface PreviewResult {
  available: boolean;
  count: number;
  mocked: boolean;
  price_sentence: string | null;
  describes?: string;
}

interface RunResult {
  job_id: number;
  written: number;
  skipped: number;
  mocked: boolean;
  notice: string;
}

export function B2cHouseholdForm({
  api, state, cities, zips, mocked,
}: {
  api: Api;
  state: string;
  cities: string[];
  zips: string[];
  /** The server said the households will be synthetic (dev only). */
  mocked: boolean;
}) {
  const { get, post } = api;
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [selections, setSelections] = useState<TriggerSelection[]>([]);
  const [target, setTarget] = useState(50);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "run">(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ data: { triggers: TriggerRow[] } }>("/api/v1/leadgen/b2c/triggers");
        if (!cancelled) setTriggers(r.data?.triggers ?? []);
      } catch {
        if (!cancelled) setTriggers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [get]);

  const errors = useMemo(
    () => validateB2cForm({ state, cities, zips, selections, target }),
    [state, cities, zips, selections, target],
  );

  const toggle = useCallback((t: TriggerRow) => {
    setResult(null); setPreview(null);
    setSelections((cur) => (cur.some((s) => s.key === t.key)
      ? cur.filter((s) => s.key !== t.key)
      : [...cur, defaultSelection(t)]));
  }, []);

  const setValue = useCallback((key: string, value: number) => {
    setResult(null); setPreview(null);
    setSelections((cur) => cur.map((s) => (s.key === key ? { ...s, value } : s)));
  }, []);

  async function runPreview() {
    setBusy("preview"); setProblem(null); setResult(null);
    try {
      const r = await post<{ data: PreviewResult }>("/api/v1/leadgen/b2c/preview", { state, cities, zips, selections });
      setPreview(r.data);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not count households just now.");
    } finally { setBusy(null); }
  }

  async function runSearch() {
    setBusy("run"); setProblem(null);
    try {
      const r = await post<{ data: RunResult }>("/api/v1/leadgen/b2c/search", { state, cities, zips, selections, target });
      setResult(r.data);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The household search did not run.");
    } finally { setBusy(null); }
  }

  const available = triggers.filter((t) => t.available);
  const coming = triggers.filter((t) => !t.available);

  return (
    <div className="space-y-4">
      {/* The rule, before anything is filled in. */}
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <Mailbox className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-[11px] leading-snug text-amber-900">{B2C_RULE}</p>
      </div>

      {mocked && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-snug text-slate-700">
          {B2C_MOCK_NOTICE}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-slate-800">Which households?</div>
        <div className="space-y-2">
          {available.map((t) => {
            const picked = selections.find((s) => s.key === t.key);
            return (
              <label key={t.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!picked}
                  onChange={() => toggle(t)}
                  aria-label={t.label}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-slate-800">{t.label}</span>
                  <span className="block text-[11px] leading-snug text-slate-600">{t.help}</span>
                  {picked && t.input !== "none" && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-700">
                      {t.inputLabel}
                      <input
                        type="number"
                        min={1}
                        value={picked.value === true ? "" : picked.value}
                        onChange={(e) => setValue(t.key, Number(e.target.value))}
                        className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
                        aria-label={`${t.label} value`}
                      />
                      {t.inputUnit}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {coming.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            Coming later: {coming.map((t) => t.label).join(", ")}.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[12px] text-slate-700" htmlFor="b2c-target">How many households?</label>
        <input
          id="b2c-target"
          type="number"
          min={1}
          max={500}
          value={target}
          onChange={(e) => { setTarget(Number(e.target.value)); setResult(null); }}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-[12px]"
        />
        <span className="text-[11px] text-slate-500">500 is the most one search can return.</span>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-slate-600">
          {errors.map((e) => <li key={e}>· {e}</li>)}
        </ul>
      )}

      {problem && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{problem}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={busy !== null || errors.length > 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-50"
        >
          {busy === "preview" ? "Counting…" : "How many are there?"}
        </button>
        <button
          type="button"
          onClick={runSearch}
          disabled={busy !== null || errors.length > 0}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy === "run" ? "Finding households…" : "Find households"}
        </button>
      </div>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-[12px] text-slate-800">
          <div className="font-semibold">{preview.count} households match.</div>
          {/* No price set anywhere yet, and the form says so rather than
              showing a number nobody agreed to. */}
          <div className="mt-1 text-[11px] text-slate-600">
            {preview.price_sentence ?? "Pricing for household records is not set yet, so nothing can be charged for this."}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-900">
          <div className="font-semibold">{resultSentence(result.written, result.skipped)}</div>
          <div className="mt-1 text-[11px]">{result.notice}</div>
          {result.mocked && <div className="mt-1 text-[11px]">{B2C_MOCK_NOTICE}</div>}
        </div>
      )}
    </div>
  );
}
