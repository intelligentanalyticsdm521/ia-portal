// useTeam — the plumbing for ARGUS → Your team (contract ARGUS employees
// phase 1 §C.1, §F), kept out of the screens.
//
//   useTeamApi()   platform-api /me/team: the employee and its jobs, the
//                  switched-on jobs, one job's change, its notes.
//   useArionTeam() arion-api: the web person's waiting items, runs, the
//                  founder's knobs, what it learned about your writing, and the
//                  one POST every ARION button goes through.
//   useJobWriter() one PUT /me/team/jobs/:key with its sentence: the green
//                  notice when it worked, the refusal in the row when it did not.
//
// Every returned object is memoised (stable identity), so a screen that lists
// it in an effect's deps fetches once per page, not once per render
// (convention_data_fetching).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from '../app/AppState';
import {
  getTeam, getTeamEmployee, getTeamJobsOn, putTeamJob, getTeamJobChanges,
} from '../lib/platformApi';
import {
  getArionAgentActivity, getArionAgentRuns, getArionAgentSettings, putArionAgentSettings,
  getArionLearnedVoice, postArionTeam,
} from '../lib/arionApi';
import { jobWriteWords, teamLoadWords, teamRefusal, type JobMode, type JobView } from '../lib/team';

const PLATFORM_API_BASE = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string) || '';
const ARION_API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string) || '';

function useCallParams(baseUrl: string) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const params = useCallback(async () => {
    const t = await getToken();
    return { baseUrl, bearerToken: t.accessToken, tenantId: activeTenantId as string };
  }, [baseUrl, activeTenantId, getToken]);
  return { params, ready: !!activeTenantId && !!baseUrl };
}

export function useTeamApi() {
  const { params, ready } = useCallParams(PLATFORM_API_BASE);
  // GET /me/team: the only answer that says whether the product is owned and who is on the team.
  const list = useCallback(async () => getTeam(await params()), [params]);
  const employee = useCallback(async (employeeKey: string) => getTeamEmployee({ ...(await params()), employeeKey }), [params]);
  const jobsOn = useCallback(async () => getTeamJobsOn(await params()), [params]);
  const putJob = useCallback(
    async (jobKey: string, patch: { enabled?: boolean; mode?: JobMode; vars?: Record<string, unknown> }) =>
      putTeamJob({ ...(await params()), jobKey, patch }),
    [params],
  );
  const changes = useCallback(async (jobKey: string) => getTeamJobChanges({ ...(await params()), jobKey }), [params]);
  return useMemo(() => ({ ready, list, employee, jobsOn, putJob, changes }), [ready, list, employee, jobsOn, putJob, changes]);
}

export function useArionTeam() {
  const { params, ready } = useCallParams(ARION_API_BASE);
  // arionApi does NOT strip the { data } envelope: every read here returns `.data`.
  const waiting = useCallback(async () => {
    const r = await getArionAgentActivity({ ...(await params()), waiting: true });
    return [...(r.data?.rows || []), ...(r.data?.escalated || [])];
  }, [params]);
  const runs = useCallback(async () => (await getArionAgentRuns({ ...(await params()), limit: 50 })).data, [params]);
  const settings = useCallback(async () => (await getArionAgentSettings(await params())).data, [params]);
  const putSettings = useCallback(
    async (patch: Record<string, unknown>) => (await putArionAgentSettings({ ...(await params()), patch })).data,
    [params],
  );
  const voice = useCallback(async () => getArionLearnedVoice(await params()), [params]);
  const post = useCallback(
    async (path: string, body?: unknown) => postArionTeam({ ...(await params()), path, body }),
    [params],
  );
  return useMemo(
    () => ({ ready, waiting, runs, settings, putSettings, voice, post }),
    [ready, waiting, runs, settings, putSettings, voice, post],
  );
}

export type JobWriteResult = { ok: true; job: JobView; words: string } | { ok: false; words: string };

/**
 * One job write. The server is the only judge: the screen sends the change,
 * and shows the JobView the server answers with — never an optimistic guess,
 * because a refused switch-on that LOOKED on is the lie this page exists to end.
 */
export function useJobWriter() {
  const team = useTeamApi();
  const [busy, setBusy] = useState<string | null>(null);
  const write = useCallback(
    async (job: Pick<JobView, 'job_key' | 'display_name'>, patch: { enabled?: boolean; mode?: JobMode; vars?: Record<string, unknown> }): Promise<JobWriteResult> => {
      setBusy(job.job_key);
      try {
        const next = await team.putJob(job.job_key, patch);
        // The sentence follows what the server answered, not what was asked.
        return { ok: true, job: next, words: jobWriteWords(job.display_name, patch, next) };
      } catch (err) {
        return { ok: false, words: teamRefusal(err) };
      } finally {
        setBusy(null);
      }
    },
    [team],
  );
  return useMemo(() => ({ busy, write, ready: team.ready }), [busy, write, team.ready]);
}

/**
 * One job's row, for a page that shows that job's switch where the work lives
 * (Settings → The Responder; ARION → My Business → Reviews). Read once per
 * page. No job and no error means still loading; an error means we could not
 * read it, and the page shows no switch rather than a guessed one.
 */
export function useTeamJob(employeeKey: string, jobKey: string) {
  const team = useTeamApi();
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!team.ready) return;
    let cancelled = false;
    setError(null);
    team.employee(employeeKey)
      .then((r) => {
        if (cancelled) return;
        const j = (r.jobs || []).find((x) => x.job_key === jobKey) || null;
        if (j) setJob(j);
        else setError("We couldn't find this job on your team's list just now.");
      })
      .catch((err) => { if (!cancelled) setError(`We couldn't load this switch. ${teamLoadWords(err)}`); });
    return () => { cancelled = true; };
  }, [team, employeeKey, jobKey]);
  return { job, setJob, error };
}
