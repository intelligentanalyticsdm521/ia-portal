// RulesAppliedCard — "How your rules are being applied", under question 8.
//
// The owner has just typed a paragraph in their own words. The one thing they
// will want to know next is whether the software understood it, and this is
// where they find out: the readback, the rules in plain language, how many
// inquiries they have touched, and a link to anything waiting on a decision.
//
// WHY IT IS A SEPARATE COMPONENT AND NOT SIX LINES ON THE PAGE. Your business
// is a platform-api page — every other block on it reads and writes
// core.business_profile through platformApi. This one block reads LUMEN,
// because that is where the compiled rules and the inquiries live. Keeping the
// second API inside one component means the page keeps its single data-fetch
// shape and nobody has to hold two clients in their head to read it.
//
// It never writes the rules. The words are edited in the textarea above, saved
// by the page's own Save button, and compiled by LUMEN on the next read (the
// hash short-circuits everything when nothing changed). "Read them again" is
// there for the owner who saved and wants to see the readback now.
//
// Terminology: the second opinion is never named after a vendor; the word
// "tenant" appears nowhere a person can see.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, RefreshCw, AlertTriangle, Lock } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import {
  IL_OWNER_PATHS,
  RULE_EFFECT_LABEL,
  RULE_KIND_LABEL,
  type IlRulesSummary,
} from "../../lib/ilOwnerApi";

export function RulesAppliedCard() {
  const { get, post, ready } = useLumenApi();
  const [data, setData] = useState<IlRulesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      setData(await get<IlRulesSummary>(IL_OWNER_PATHS.rules));
    } catch (e) {
      // Shown, never swallowed: a block that quietly showed nothing would read
      // as "your rules are not being applied", which may not be true.
      setError(e instanceof Error ? e.message : "We could not check your rules just now.");
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const recompile = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await post<IlRulesSummary>(IL_OWNER_PATHS.compile, {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not read your rules just now.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        Checking how your rules are being applied…
      </div>
    );
  }

  // Lite: the words are saved, the applying is a paid step. Say so plainly and
  // do not dress it up as an error.
  if (data?.tier_locked) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <div className="text-xs text-amber-900">
            <div className="font-semibold">Your rules are saved</div>
            <p className="mt-0.5">
              {data.compile.message
                || "Turning them into something we apply to every inquiry comes with Standard."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rejected = data?.status === "rejected" || !!data?.rejected_reason;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">How your rules are being applied</span>
        <button
          type="button"
          onClick={() => void recompile()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Read them again
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">{error}</div>
      )}

      {rejected && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div>
            <div className="font-semibold">We could not turn all of that into a rule</div>
            <p className="mt-0.5">{data?.rejected_reason}</p>
            <p className="mt-0.5">Try saying it the way you would to a new employee — a place, a job length, a kind of customer.</p>
          </div>
        </div>
      )}

      {!data?.has_rules && !rejected && (
        <p className="mt-2 text-xs text-gray-600">
          Nothing yet. Write your rules above the way you would say them — “no jobs over two days
          this month, Ankeny only, commercial first” — and we will apply them to every inquiry.
        </p>
      )}

      {data?.has_rules && (
        <>
          {data.explanation_plain && (
            <p className="mt-2 text-xs italic text-gray-700">{data.explanation_plain}</p>
          )}

          <ul className="mt-2 space-y-1">
            {data.constraints.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-xs text-gray-700">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                <span>
                  <span className="font-medium text-gray-900">{RULE_KIND_LABEL[c.kind] || c.kind}</span>
                  {" — "}
                  {c.say}{" "}
                  <span className="text-gray-500">({RULE_EFFECT_LABEL[c.effect] || c.effect})</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
            <span>
              Applied to <span className="font-semibold text-gray-900">{data.leads_touched}</span>{" "}
              {data.leads_touched === 1 ? "inquiry" : "inquiries"}
            </span>
            {data.held_now > 0 && (
              <Link
                to="/app/services/spark_leads"
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-200"
              >
                <Clock className="h-3 w-3" />
                {data.held_now} waiting on you
              </Link>
            )}
            {data.expires_at && (
              <span className={data.expired ? "text-amber-800" : undefined}>
                {data.expired ? "Stopped applying on " : "Runs until "}
                {new Date(data.expires_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default RulesAppliedCard;
