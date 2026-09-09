// pages/admin/AgentCodeProposalsCard.tsx — the propose-only code queue.
//
// The ARION content agent may notice that a rule it keeps working around should
// change, and write a DIFF for a human. It can never apply one:
//
//   · there is no apply endpoint, anywhere;
//   · `arion.content_agent_code_proposal.applied_commit` is a record of what a
//     PERSON did afterwards, never an instruction;
//   · `test/content-agent-propose-only.test.js` fails if any agent module gains
//     an execution primitive, if an apply route appears, or if agent code writes
//     `applied_commit`.
//
// So "Approve" here means "I agree with this, and I will take it through the
// ordinary scope → plan → review → migrate → deploy process myself". The card says
// exactly that, because a green Approve button next to a diff is otherwise read
// as "and now it is deployed".
//
// It reads the FOUNDER's own tenant, because the agent runs on IA's own website
// and IA's own repos are what it would propose against. It is on the internal
// page for the same reason.
import { useCallback, useEffect, useState } from "react";
import { FileCode2, ShieldCheck } from "lucide-react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import {
  ArionApiError, getArionCodeProposals, decideArionCodeProposal,
  type ArionCodeProposal,
} from "../../lib/arionApi";

export function AgentCodeProposalsCard() {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [rows, setRows] = useState<ArionCodeProposal[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const auth = useCallback(async () => {
    const token = await getToken();
    return { baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId as string };
  }, [apiBaseUrl, activeTenantId, getToken]);

  const load = useCallback(async () => {
    if (!activeTenantId || !apiBaseUrl) return;
    setError(null);
    try {
      const r = await getArionCodeProposals({ ...(await auth()), status: "pending" });
      setRows(r.data);
      setNote(r.meta?.note || null);
    } catch (err) {
      // A 404 here means the content agent is not on this deployment yet, which
      // is a fact and not an error worth shouting about.
      setError(err instanceof ArionApiError && err.status === 404
        ? null
        : err instanceof Error ? err.message : "Could not load the proposal queue.");
      setRows([]);
    }
  }, [auth, activeTenantId, apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (p: ArionCodeProposal, decision: "approve" | "reject") => {
    setBusy(p.proposal_id);
    setError(null);
    try {
      const r = await decideArionCodeProposal({ ...(await auth()), proposalId: p.proposal_id, decision });
      setNote(r.data.note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  if (rows && rows.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-2">
          <FileCode2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Changes the agent has suggested to us</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Nothing waiting. If an agent decides one of our own rules is getting in its way, it
              writes the change here for a person to read. It can never apply one itself.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
      <header className="flex items-start gap-2">
        <FileCode2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Changes the agent has suggested to us</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Internal. <strong>Approving does not apply anything.</strong> It means you agree, and the
            change still goes through the normal review and deploy like anybody else's.
          </p>
        </div>
      </header>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">{error}</div>}
      {note && (
        <div className="flex items-start gap-1.5 rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
          <span>{note}</span>
        </div>
      )}

      <ul className="space-y-3">
        {(rows || []).map((p) => (
          <li key={p.proposal_id} className="rounded border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{p.proposal_kind}</div>
                <div className="text-[11px] text-slate-500">
                  {p.target_repo || "—"}{p.target_path ? ` · ${p.target_path}` : ""}
                  {" · "}{new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void decide(p, "approve")}
                  disabled={busy === p.proposal_id}
                  className="rounded border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                >I agree with this</button>
                <button
                  type="button"
                  onClick={() => void decide(p, "reject")}
                  disabled={busy === p.proposal_id}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >No</button>
              </div>
            </div>
            {p.rationale && <p className="mt-2 text-xs text-slate-700">{p.rationale}</p>}
            {p.risk_note && (
              <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                {p.risk_note}
              </p>
            )}
            {p.diff_text && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[11px] leading-snug text-slate-100">
                {p.diff_text}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AgentCodeProposalsCard;
