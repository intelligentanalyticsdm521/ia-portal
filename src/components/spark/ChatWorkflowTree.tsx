// ChatWorkflowTree — one path of a chat workflow, read-only, as lines an owner
// reads ("ARGUS says: …", "Asks their email", "Saves them as a lead").
//
// Shared by SPARK → Lead sources → Website chat (the workflow card) and
// ARGUS → Workflows (a row, expanded). The words are decided in
// lib/chatWorkflows.ts; this only lays them out. Editing the words comes with
// the full editor (contract §H) — nothing here writes.
import type { ReactNode } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { TreeStep } from "../../lib/chatWorkflows";

function Line({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "do" | "end" }) {
  const cls = tone === "do"
    ? "text-emerald-800"
    : tone === "end" ? "text-slate-400" : "text-slate-700";
  return <li className={`text-[11px] leading-relaxed ${cls}`}>{children}</li>;
}

function Chip({ label, link }: { label: string; link?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-300">
      {label}
      {link && <ExternalLink className="h-2.5 w-2.5 text-slate-400" aria-label="opens a web page" />}
    </span>
  );
}

export function ChatWorkflowSteps({ steps }: { steps: TreeStep[] }) {
  if (!steps.length) {
    return <p className="text-[11px] text-slate-400">No steps to show for this one.</p>;
  }
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        switch (s.kind) {
          case "say":
            return <Line key={i}>ARGUS says: &ldquo;{s.text}&rdquo;</Line>;
          case "ask":
            return (
              <Line key={i}>
                {s.text}
                {s.prompt && <span className="text-slate-400"> &mdash; &ldquo;{s.prompt}&rdquo;</span>}
              </Line>
            );
          case "do":
            return <Line key={i} tone="do">{s.text}</Line>;
          case "handoff":
            return (
              <Line key={i}>
                ARGUS says: &ldquo;{s.text}&rdquo; <span className="text-slate-500">and puts it in Needs you for you to answer</span>
              </Line>
            );
          case "end":
            return (
              <Line key={i} tone="end">
                {s.text ? <span className="text-slate-700">ARGUS says: &ldquo;{s.text}&rdquo; </span> : null}
                That&rsquo;s the end — ARGUS offers the opening buttons again.
              </Line>
            );
          case "goto":
            return (
              <li key={i} className="flex items-center gap-1 text-[11px] text-slate-600">
                <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />
                <Chip label={s.label} />
              </li>
            );
          case "buttons":
            return (
              <li key={i} className="text-[11px] leading-relaxed text-slate-700">
                {s.text && <div>ARGUS says: &ldquo;{s.text}&rdquo;</div>}
                {s.groups.length > 0 && <ul className="mt-1 space-y-1.5 border-l-2 border-slate-200 pl-3">
                  {s.groups.map((g, gi) => (
                    <li key={gi}>
                      <div className="flex flex-wrap items-center gap-1">
                        {g.labels.map((l, li) => <Chip key={li} label={l} link={g.link} />)}
                      </div>
                      {g.children.length > 0 && (
                        <div className="mt-1 pl-2">
                          <ChatWorkflowSteps steps={g.children} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>}
              </li>
            );
          default:
            return null;
        }
      })}
    </ol>
  );
}

export default ChatWorkflowSteps;
