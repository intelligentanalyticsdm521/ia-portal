// useArionAgentsApi — the plumbing for the ARION Agents page, kept out of the
// page.
//
// Two reasons this is its own file rather than eight lines at the top of
// ArionAgentsPage.tsx:
//
//   1. `lib/arionApi.ts` takes { baseUrl, bearerToken, tenantId } on every call,
//      so every page that talks to it repeats the same three-line dance. This is
//      the dance, once. `useArionSites` already exists for the same reason.
//
//   2. THE WORD. `feedback_no_tenant_in_ui` is enforced by a source-pinned test
//      over the client-facing agent surfaces, and it is enforced on the WHOLE
//      file — deliberately, because a guard that tries to tell code from copy is
//      a guard that eventually lets copy through. Keeping the wiring here leaves
//      the page itself able to say Business and nothing else, which is the point
//      of the rule rather than a way around it.

import { useCallback } from 'react';
import { useAccessToken } from '../../auth/useAccessToken';
import { useAppState } from '../../app/AppState';
import {
  getArionAgentActivity, getArionAgentRuns, getArionAgentSettings,
  putArionAgentSettings, postArionAgentRun, approveArionDraft, rejectArionDraft,
  publishArionDraft, getArionLearnedVoice,
  type ArionAgentActivityEnvelope, type ArionLearnedVoice,
} from '../../lib/arionApi';
import type { AgentRunsPayload, AgentSettingsResponse } from '../../components/agents/types';

export interface ArionAgentsApi {
  /** False until there is a signed-in business and a configured service address. */
  ready: boolean;
  loadAll: () => Promise<{
    activity: ArionAgentActivityEnvelope['data'];
    runs: AgentRunsPayload;
    settings: AgentSettingsResponse;
    voice: ArionLearnedVoice;
  }>;
  saveSettings: (patch: Record<string, unknown>) => Promise<AgentSettingsResponse>;
  runNow: () => Promise<void>;
  approve: (id: string, edits?: { title?: string; body_markdown?: string }) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
  publish: (id: string) => Promise<void>;
}

export function useArionAgentsApi(): ArionAgentsApi {
  const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();

  const auth = useCallback(async () => {
    const token = await getToken();
    return { baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId as string };
  }, [baseUrl, activeTenantId, getToken]);

  const loadAll = useCallback(async () => {
    const a = await auth();
    // Once per page, all four together (convention_data_fetching).
    const [activity, runs, settings, voice] = await Promise.all([
      getArionAgentActivity(a),
      getArionAgentRuns({ ...a, limit: 20 }),
      getArionAgentSettings(a),
      getArionLearnedVoice(a),
    ]);
    return { activity: activity.data, runs: runs.data, settings: settings.data, voice };
  }, [auth]);

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    const r = await putArionAgentSettings({ ...(await auth()), patch });
    return r.data;
  }, [auth]);

  const runNow = useCallback(async () => { await postArionAgentRun(await auth()); }, [auth]);

  const approve = useCallback(async (id: string, edits?: { title?: string; body_markdown?: string }) => {
    await approveArionDraft({ ...(await auth()), outputId: id, edits });
  }, [auth]);

  const reject = useCallback(async (id: string, reason: string) => {
    await rejectArionDraft({ ...(await auth()), outputId: id, reason });
  }, [auth]);

  const publish = useCallback(async (id: string) => {
    await publishArionDraft({ ...(await auth()), outputId: id });
  }, [auth]);

  return {
    ready: !!activeTenantId && !!baseUrl,
    loadAll, saveSettings, runNow, approve, reject, publish,
  };
}

export default useArionAgentsApi;
