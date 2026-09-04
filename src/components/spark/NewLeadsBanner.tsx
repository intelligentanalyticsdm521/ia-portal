import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

// "You have new leads" — the two halves of P5's in-app notification.
//
//   NewLeadsToast   the user is IN the app when a run finishes. The job page
//                   stashes the result and redirects to the inbox; this shows
//                   the confirmation on arrival, for a few seconds.
//   NewLeadsBanner  the user was NOT in the app. A scheduled run finished
//                   overnight, and the first SPARK page they open says so,
//                   above the content, until they go and look.
//
// Both are mounted once by SparkPageShell, so no page opts in and the inbox
// page is not touched.
//
// The count comes from GET /api/v1/leads meta.since_last_visit_count — the same
// "since your last visit" number the inbox pill uses, so the banner and the
// pill can never disagree. Dismissing calls POST /leadgen/inbox/visit, which is
// what the inbox itself calls: one act of "I've seen them", wherever it happens.

const TOAST_KEY = "iadm.portal.leadgen.runComplete";
const DISMISS_KEY = "iadm.portal.leadgen.newLeadsDismissedAt";
const COUNT_CACHE_KEY = "iadm.portal.leadgen.newLeadsCount";
const TOAST_VISIBLE_MS = 6000;
const TOAST_STALE_MS = 60_000;
const COUNT_TTL_MS = 5 * 60 * 1000;
const INBOX_PATH = "/app/services/spark_leads";

interface RunCompleteStash { jobId: string; delivered: number; at: number }

/** Called by the job page the moment a run finishes. */
export function stashRunComplete(jobId: string, delivered: number) {
  try {
    sessionStorage.setItem(TOAST_KEY, JSON.stringify({ jobId, delivered, at: Date.now() } as RunCompleteStash));
    // A finished run means the cached "new leads" count is stale.
    sessionStorage.removeItem(COUNT_CACHE_KEY);
    localStorage.removeItem(DISMISS_KEY);
  } catch { /* private browsing — the banner still covers it on the next page */ }
}

function readAndClearStash(): RunCompleteStash | null {
  try {
    const raw = sessionStorage.getItem(TOAST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(TOAST_KEY);
    const parsed = JSON.parse(raw) as RunCompleteStash;
    if (!parsed?.at || Date.now() - parsed.at > TOAST_STALE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function NewLeadsToast() {
  const navigate = useNavigate();
  const [stash, setStash] = useState<RunCompleteStash | null>(() => readAndClearStash());

  useEffect(() => {
    if (!stash) return;
    const t = window.setTimeout(() => setStash(null), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [stash]);

  if (!stash) return null;
  const n = stash.delivered;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex items-start gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-lg"
    >
      <Sparkles className="h-4 w-4 text-emerald-600 mt-0.5" />
      <div className="text-sm">
        <div className="font-semibold text-slate-900">
          {n > 0 ? `You have ${n} new lead${n === 1 ? "" : "s"}` : "Your lead search finished"}
        </div>
        <button
          type="button"
          onClick={() => { setStash(null); navigate(INBOX_PATH); }}
          className="text-[12px] text-[#EF6C33] font-semibold hover:underline"
        >
          Open your Lead Inbox
        </button>
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => setStash(null)} className="text-slate-400 hover:text-slate-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function NewLeadsBanner() {
  const { get, post, ready } = useSparkApi();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    // Cached for five minutes so moving between SPARK pages doesn't ask the
    // API the same question over and over (convention_data_fetching).
    try {
      const raw = sessionStorage.getItem(COUNT_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { n: number; at: number };
        if (cached && Date.now() - cached.at < COUNT_TTL_MS) { setCount(cached.n); return; }
      }
    } catch { /* fall through to the fetch */ }

    (async () => {
      try {
        const r = await get<{ meta?: { since_last_visit_count?: number } }>("/api/v1/leads?limit=1");
        const n = r?.meta?.since_last_visit_count ?? 0;
        if (cancelled) return;
        setCount(n);
        try { sessionStorage.setItem(COUNT_CACHE_KEY, JSON.stringify({ n, at: Date.now() })); } catch { /* ignore */ }
      } catch {
        // Silent: a tenant without Lead Gen gets a 403 here, and a banner is
        // never worth an error on someone's page.
        if (!cancelled) setCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  const dismiss = useCallback(async (goToInbox: boolean) => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    try { sessionStorage.setItem(COUNT_CACHE_KEY, JSON.stringify({ n: 0, at: Date.now() })); } catch { /* ignore */ }
    // Same call the inbox makes when you look at it — "I've seen them".
    try { await post("/api/v1/leadgen/inbox/visit", {}); } catch { /* best effort */ }
    if (goToInbox) navigate(INBOX_PATH);
  }, [post, navigate]);

  if (hidden || count <= 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2">
      <div className="flex items-center gap-2 text-[13px] text-amber-900">
        <Sparkles className="h-4 w-4 text-amber-700 flex-shrink-0" />
        <span>
          You have <strong>{count}</strong> new lead{count === 1 ? "" : "s"} since your last visit.
        </span>
        <button type="button" onClick={() => dismiss(true)} className="font-semibold text-[#EF6C33] hover:underline">
          Open inbox
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(false)}
        className="text-amber-700 hover:text-amber-900"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default NewLeadsBanner;
