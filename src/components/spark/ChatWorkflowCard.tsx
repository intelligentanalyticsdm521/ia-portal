// ChatWorkflowCard — SPARK → Leads → Lead sources → Inbound → Website chat.
//
// Contract CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §F.1. One card per chat
// workflow the business has, rendered inside the Website chat block:
//
//   • the header: name, Live/Off chip, the Live switch (a refused publish shows
//     the server's own sentences, inline, under the switch);
//   • the mode, said in words, with the way to change it (ARGUS → Workflows,
//     where every workflow's mode lives);
//   • Needs you: n, only when there is something;
//   • who replies — the name visitors read in "{owner} will reply";
//   • the services, each with its paths, each path with its switch and its
//     steps as a read-only tree (the full editor comes with the client
//     rollout, §H);
//   • drafts and warnings, and the time-zone picker right where the warning is.
//
// A business without the SPARK Growth package sees the one sentence the server
// sends and nothing else — no switch that exists to say no.
//
// ChatOwnTools is the "Your own tools" section in the same block: the
// business's own software that a chat step can call (a report, a quote
// tool, anything with a web address). Every business registers its tools the
// same way; nothing here knows whose tool is whose.
//
// Writes only — the page (SparkLeadSourcesPage) does the one load.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Check, Workflow, Wrench } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { ConfirmDialog, type ConfirmAsk } from "../ConfirmDialog";
import { ChatWorkflowSteps } from "./ChatWorkflowTree";
import {
  CHAT_WF, NEEDS_YOU_ROUTE, WORKFLOWS_ROUTE, SECRET_SENTENCE, TOOL_FIELDS,
  buildDisplayTree, isTimezoneWarning, modeLine, refusalSentences, relativeTime,
  timeZoneOptions, warningWords, workflowsUsingTool,
  type ChatActionRow, type ChatPlaybookRow, type TreePath,
} from "../../lib/chatWorkflows";

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
        aria-label={label}
      />
      {checked ? "On" : "Off"}
    </label>
  );
}

function Sentences({ lines, tone = "rose" }: { lines: string[]; tone?: "rose" | "amber" }) {
  if (!lines.length) return null;
  const cls = tone === "rose"
    ? "bg-rose-50 text-rose-800 ring-rose-200"
    : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <ul className={`mt-2 space-y-0.5 rounded px-2.5 py-1.5 text-[11px] ring-1 ${cls}`} role="alert">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}

interface CardProps {
  playbook: ChatPlaybookRow;
  /** The business's name, from the chat meta — the placeholder for "who replies". */
  businessName: string | null;
  /** The websites a time-zone answer is saved to (the workflow's own, or all of them). */
  siteIds: string[];
  onChanged: (row: ChatPlaybookRow) => void;
  onNotice: (words: string) => void;
}

export function ChatWorkflowCard({ playbook, businessName, siteIds, onChanged, onNotice }: CardProps) {
  const { put } = useSparkApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string[]>([]);
  const [openServices, setOpenServices] = useState<Set<string>>(new Set());
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [pathOverride, setPathOverride] = useState<Record<string, boolean>>({});
  const [ownerDraft, setOwnerDraft] = useState(playbook.owner_display || "");
  const [tzSaved, setTzSaved] = useState<string | null>(null);

  const tree = useMemo(
    () => buildDisplayTree(playbook.tree, { business: businessName, owner: playbook.owner_display }),
    [playbook.tree, businessName, playbook.owner_display],
  );
  const live = playbook.status === "live";
  const where = playbook.site_label || "all your websites";
  const warnings = (playbook.warnings || []).filter((w) => warningWords(w));
  // The tree's own notes (a link button hidden for want of an address) read
  // like the warnings, once each.
  const amber = [...new Set([...warnings.map(warningWords), ...tree.notes])];
  const tzWarning = !tzSaved && warnings.some(isTimezoneWarning);

  function toggleIn(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }

  /** Takes the server's answer to a write. The answer may be the stored row
   *  without the read-only parts (tree, warnings, gate), so those are kept
   *  from what is on screen unless the answer carries them. */
  function accept(r: unknown) {
    const data = (r as { data?: Partial<ChatPlaybookRow> } | null)?.data;
    if (!data || (data.playbook_id && data.playbook_id !== playbook.playbook_id)) return;
    onChanged({
      ...playbook,
      ...data,
      playbook_id: playbook.playbook_id,
      tree: data.tree ?? playbook.tree,
      warnings: Array.isArray(data.warnings) ? data.warnings : playbook.warnings,
      allowed: typeof data.allowed === "boolean" ? data.allowed : playbook.allowed,
      allowed_words: data.allowed_words ?? playbook.allowed_words,
      needs_you_count: typeof data.needs_you_count === "number" ? data.needs_you_count : playbook.needs_you_count,
      site_label: data.site_label ?? playbook.site_label,
    });
  }

  async function setLive(on: boolean) {
    setBusy("status");
    setRefusal([]);
    try {
      const r = await put(CHAT_WF.playbook(playbook.playbook_id), { status: on ? "live" : "off" });
      accept(r);
      if (!(r as { data?: unknown })?.data) onChanged({ ...playbook, status: on ? "live" : "off" });
      onNotice(on
        ? `${playbook.name} is live on ${where}. Visitors see it on the next page they open.`
        : `${playbook.name} is off. Visitors get the usual chat until you switch it back on.`);
    } catch (err) {
      setRefusal(refusalSentences(err));
    } finally {
      setBusy(null);
    }
  }

  async function setPath(p: TreePath, enabled: boolean) {
    setBusy(`path:${p.key}`);
    setRefusal([]);
    try {
      const r = await put(CHAT_WF.path(playbook.playbook_id, p.key), { enabled });
      setPathOverride((o) => ({ ...o, [p.key]: enabled }));
      accept(r);
      onNotice(enabled
        ? `"${p.label}" is back on. Visitors can take it from their next message.`
        : `"${p.label}" is off. Its button is hidden from visitors.`);
    } catch (err) {
      setRefusal(refusalSentences(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveOwner() {
    const value = ownerDraft.trim();
    if (value === (playbook.owner_display || "")) return;
    setBusy("owner");
    setRefusal([]);
    try {
      const r = await put(CHAT_WF.playbook(playbook.playbook_id), { owner_display: value || null });
      accept(r);
      if (!(r as { data?: unknown })?.data) onChanged({ ...playbook, owner_display: value || null });
      onNotice(value
        ? `Visitors now read "${value} will reply".`
        : `Visitors now read "${businessName || "your business"} will reply".`);
    } catch (err) {
      setRefusal(refusalSentences(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveTimeZone(tz: string) {
    if (!tz || !siteIds.length) return;
    setBusy("tz");
    setRefusal([]);
    try {
      for (const id of siteIds) await put(CHAT_WF.site(id), { timezone: tz });
      setTzSaved(tz);
      onNotice(`Saved. ARGUS now reads your opening hours in ${tz} time.`);
    } catch (err) {
      setRefusal(refusalSentences(err));
    } finally {
      setBusy(null);
    }
  }

  const enabledOf = (p: TreePath) => (p.key in pathOverride ? pathOverride[p.key] : p.enabled);

  // A render function, not a component: a component declared inside this one
  // would remount every row (and drop the focused switch) on each render.
  function renderPath(p: TreePath) {
    const open = openPaths.has(p.key);
    const on = enabledOf(p);
    return (
      <li key={p.key} className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setOpenPaths((s) => toggleIn(s, p.key))}
            aria-expanded={open}
            className={`flex min-w-0 items-center gap-1 text-left text-xs font-semibold ${on ? "text-slate-900" : "text-slate-400 line-through"}`}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className="truncate">{p.label}</span>
          </button>
          <Switch
            checked={on}
            disabled={busy === `path:${p.key}`}
            onChange={(v) => setPath(p, v)}
            label={`${p.label} — shown to visitors`}
          />
        </div>
        {open && (
          <div className="border-t border-slate-100 px-3 py-2">
            <ChatWorkflowSteps steps={p.steps} />
          </div>
        )}
      </li>
    );
  }

  if (!playbook.allowed) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Workflow className="h-4 w-4 text-slate-400" />
          Chat workflow · {playbook.name}
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {playbook.allowed_words || "Chat workflows with buttons come with the SPARK Leads Growth package."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3" data-chat-workflow={playbook.playbook_id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Workflow className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="truncate">Chat workflow · {playbook.name}</span>
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${live
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
              : "bg-slate-100 text-slate-600 ring-slate-200"}`}
            >
              {live ? "Live" : "Off"}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            {modeLine(playbook.mode)}.{" "}
            <Link to={WORKFLOWS_ROUTE} className="font-semibold text-slate-700 underline">Change in ARGUS → Workflows</Link>
          </div>
          {playbook.needs_you_count > 0 && (
            <Link to={NEEDS_YOU_ROUTE} className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
              Needs you: {playbook.needs_you_count}
            </Link>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] text-slate-600">Live on {where}</span>
          <Switch checked={live} disabled={busy === "status"} onChange={setLive} label={`Live on ${where}`} />
        </div>
      </div>

      <Sentences lines={refusal} />

      <label className="mt-3 block text-xs">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          The name visitors see when someone will reply
        </span>
        <input
          value={ownerDraft}
          onChange={(e) => setOwnerDraft(e.target.value)}
          onBlur={() => void saveOwner()}
          placeholder={businessName || "Your business name"}
          maxLength={80}
          disabled={busy === "owner"}
          className="w-full max-w-sm rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      {amber.length > 0 && (
        <ul className="mt-3 space-y-1">
          {amber.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {tzWarning && siteIds.length > 0 && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
          <span className="font-semibold">Your time zone</span>
          <select
            defaultValue=""
            disabled={busy === "tz"}
            onChange={(e) => void saveTimeZone(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>Pick your time zone…</option>
            {timeZoneOptions().map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      )}

      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">What ARGUS walks visitors through</div>
        <ul className="mt-1 space-y-1.5">
          {tree.services.map((s) => {
            const open = openServices.has(s.key);
            return (
              <li key={s.key} className="rounded-lg bg-slate-50 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setOpenServices((x) => toggleIn(x, s.key))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-xs font-semibold text-slate-900"
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {s.label}
                  <span className="font-normal text-slate-500">· {s.paths.length} {s.paths.length === 1 ? "path" : "paths"}</span>
                </button>
                {open && (
                  <div className="space-y-2 px-2.5 pb-2.5">
                    {s.intro.length > 0 && (
                      <div className="rounded bg-white px-2.5 py-2 ring-1 ring-slate-100">
                        <ChatWorkflowSteps steps={s.intro} />
                      </div>
                    )}
                    <ul className="space-y-1.5">
                      {s.paths.map(renderPath)}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
          {tree.shared.length > 0 && (
            <li className="rounded-lg bg-slate-50 ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setOpenServices((x) => toggleIn(x, "__shared"))}
                aria-expanded={openServices.has("__shared")}
                className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-xs font-semibold text-slate-900"
              >
                {openServices.has("__shared") ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Used by every service
                <span className="font-normal text-slate-500">· one switch turns each off everywhere</span>
              </button>
              {openServices.has("__shared") && (
                <ul className="space-y-1.5 px-2.5 pb-2.5">
                  {tree.shared.map(renderPath)}
                </ul>
              )}
            </li>
          )}
        </ul>
        {tree.services.length === 0 && tree.shared.length === 0 && (
          <p className="mt-1 text-[11px] text-slate-500">This workflow has no services to show yet.</p>
        )}
      </div>

      {tree.drafts.length > 0 && (
        <ul className="mt-3 space-y-1">
          {tree.drafts.map((d) => (
            <li key={d.key} className="rounded bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
              Draft — not shown to visitors: &lsquo;{d.label}&rsquo;
            </li>
          ))}
        </ul>
      )}
      {playbook.draft_version != null && tree.drafts.length === 0 && (
        <p className="mt-3 text-[11px] text-slate-600">There is a draft waiting — it isn&rsquo;t shown to visitors.</p>
      )}
    </div>
  );
}

// ── Your own tools ──────────────────────────────────────────────────────────

interface ToolsProps {
  actions: ChatActionRow[];
  playbooks: ChatPlaybookRow[];
  businessName: string | null;
  onActions: (rows: ChatActionRow[]) => void;
  onNotice: (words: string) => void;
}

export function ChatOwnTools({ actions, playbooks, businessName, onActions, onNotice }: ToolsProps) {
  const { post, patch } = useSparkApi();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "", url: "",
    fields: TOOL_FIELDS.map((f) => f.key),
    email_visitor: true, attach_to_lead: true,
  });
  const [formErr, setFormErr] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowWords, setRowWords] = useState<Record<string, string[]>>({});
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);

  const active = actions.filter((a) => a.status !== "off");

  function replaceRow(row: ChatActionRow) {
    onActions(actions.map((a) => (a.action_id === row.action_id ? row : a)));
  }

  async function addTool() {
    setBusy("add");
    setFormErr([]);
    try {
      const r = await post<{ data: ChatActionRow; secret: string }>(CHAT_WF.actions, {
        name: form.name.trim(),
        url: form.url.trim(),
        fields: form.fields,
        result_handling: { email_visitor: form.email_visitor, attach_to_lead: form.attach_to_lead, note: true, result_label: "report" },
      });
      onActions([...actions, r.data]);
      setSecret({ name: r.data.name, value: r.secret });
      setCopied(false);
      setAdding(false);
      setForm({ name: "", url: "", fields: TOOL_FIELDS.map((f) => f.key), email_visitor: true, attach_to_lead: true });
    } catch (err) {
      setFormErr(refusalSentences(err));
    } finally {
      setBusy(null);
    }
  }

  async function testTool(a: ChatActionRow) {
    setBusy(`test:${a.action_id}`);
    setRowWords((w) => ({ ...w, [a.action_id]: [] }));
    try {
      const r = await post<{ ok: boolean; ms: number; plain: string }>(CHAT_WF.test(a.action_id), {});
      replaceRow({ ...a, last_test_at: new Date().toISOString(), last_test_ok: !!r.ok, last_test_plain: r.plain });
    } catch (err) {
      setRowWords((w) => ({ ...w, [a.action_id]: refusalSentences(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function rotate(a: ChatActionRow) {
    setBusy(`rotate:${a.action_id}`);
    try {
      const r = await post<{ data: ChatActionRow; secret: string }>(CHAT_WF.rotate(a.action_id), {});
      if (r.data) replaceRow(r.data);
      setSecret({ name: a.name, value: r.secret });
      setCopied(false);
    } catch (err) {
      setRowWords((w) => ({ ...w, [a.action_id]: refusalSentences(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: ChatActionRow) {
    setBusy(`remove:${a.action_id}`);
    try {
      await patch(CHAT_WF.action(a.action_id), { status: "off" });
      onActions(actions.map((x) => (x.action_id === a.action_id ? { ...x, status: "off" } : x)));
      onNotice(`${a.name} is removed. No chat step can call it now.`);
    } catch (err) {
      setRowWords((w) => ({ ...w, [a.action_id]: refusalSentences(err) }));
    } finally {
      setBusy(null);
    }
  }

  function askRemove(a: ChatActionRow) {
    const using = workflowsUsingTool(playbooks, a.name, { business: businessName });
    setAsk({
      title: `Remove ${a.name}?`,
      body: using.length
        ? `${using.join(", ")} ${using.length === 1 ? "runs" : "run"} this tool. Until you add a tool called "${a.name}" again, that step can't run and the visitor's details come to you instead.`
        : "No chat workflow runs it right now. You can add it again any time.",
      confirmLabel: "Yes, remove it",
      onConfirm: () => void remove(a),
    });
  }

  function askRotate(a: ChatActionRow) {
    setAsk({
      title: `Replace the secret for ${a.name}?`,
      body: "The old secret stops working straight away. Your tool will refuse our requests until you paste the new one into its settings.",
      confirmLabel: "Replace the secret",
      onConfirm: () => void rotate(a),
    });
  }

  const canAdd = form.name.trim() && form.url.trim();

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-900">Your own tools</h4>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Software of your own that a chat step can run — a report, a quote calculator, anything with a web
        address. ARGUS sends it what the visitor told us and passes the result back to them.
      </p>

      {active.length === 0 && !adding && (
        <p className="mt-2 text-[11px] text-slate-500">No tools added yet.</p>
      )}
      <ul className="mt-2 space-y-2">
        {active.map((a) => {
          const tested = relativeTime(a.last_test_at);
          return (
            <li key={a.action_id} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{a.name}</div>
                  <div className="truncate text-[11px] text-slate-600">{a.url}</div>
                  <div className="text-[10px] text-slate-500">Secret starting {a.secret_prefix}…</div>
                  <div className={`mt-0.5 text-[11px] ${a.last_test_ok === false ? "text-rose-700" : "text-slate-600"}`}>
                    {a.last_test_plain
                      ? `${a.last_test_plain}${tested ? ` (${tested})` : ""}`
                      : "Not tested yet."}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void testTool(a)}
                    disabled={busy === `test:${a.action_id}`}
                    className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy === `test:${a.action_id}` ? "Testing…" : "Test this tool"}
                  </button>
                  <button
                    type="button"
                    onClick={() => askRotate(a)}
                    className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white"
                  >
                    Replace the secret
                  </button>
                  <button
                    type="button"
                    onClick={() => askRemove(a)}
                    className="text-[11px] font-semibold text-slate-500 underline hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <Sentences lines={rowWords[a.action_id] || []} />
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-3">
          <div className="text-xs font-bold text-slate-900">Add a tool</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Quote calculator"
                maxLength={120}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                autoFocus
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">Web address</span>
              <input
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://tools.example.com/run"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <fieldset className="mt-2">
            <legend className="text-[11px] font-semibold text-slate-700">Send them:</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {TOOL_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-1 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.fields.includes(f.key)}
                    onChange={(e) => setForm({
                      ...form,
                      fields: e.target.checked
                        ? TOOL_FIELDS.map((x) => x.key).filter((k) => k === f.key || form.fields.includes(k))
                        : form.fields.filter((k) => k !== f.key),
                    })}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={form.email_visitor}
                onChange={(e) => setForm({ ...form, email_visitor: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Email the result to the visitor
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={form.attach_to_lead}
                onChange={(e) => setForm({ ...form, attach_to_lead: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Keep the file on the lead
            </label>
          </div>
          <Sentences lines={formErr} />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void addTool()}
              disabled={busy === "add" || !canAdd}
              className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy === "add" ? "Adding…" : "Add it"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setFormErr([]); }}
              className="text-xs font-semibold text-slate-600 underline"
            >
              Not now
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          + Add a tool
        </button>
      )}

      <IadmModal
        open={!!secret}
        onClose={() => { setSecret(null); setCopied(false); }}
        product="spark"
        eyebrow="SPARK · YOUR OWN TOOLS"
        title="Your tool's secret"
        subtitle={secret ? `For ${secret.name}` : undefined}
        size="info"
        footer={
          <IadmButton variant="primary" onClick={() => { setSecret(null); setCopied(false); }}>
            I've copied it
          </IadmButton>
        }
      >
        {secret && (
          <div className="space-y-3">
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-800">
                {secret.value}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(secret.value).then(() => setCopied(true)).catch(() => {
                    // A browser that refuses the clipboard: the secret is on screen and selectable.
                  });
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-slate-700">{SECRET_SENTENCE}</p>
          </div>
        )}
      </IadmModal>

      <ConfirmDialog ask={ask} product="spark" onClose={() => setAsk(null)} />
    </div>
  );
}

export default ChatWorkflowCard;
