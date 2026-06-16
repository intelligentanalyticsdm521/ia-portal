// SparkUnifiedWorkflowModal — step-1 type chooser for the unified
// "Workflows & Automations" list page.
//
// Step 1: pick "Trigger-based automation" vs "Rule-based".
// Step 2 (if rule): pick scoring / routing / auto-tag.
//
// The page receives the choice and opens the appropriate next modal
// (SparkAutomationModal or SparkRuleEditorModal). This component is purely
// a router — it never touches the API itself.
import { useEffect, useState } from "react";
import {
  Zap, GitBranch, Tag as TagIcon, Workflow, ListChecks,
} from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";
import type { RuleType } from "./SparkRuleEditorModal";
import type { TriggerType } from "./SparkAutomationModal";

export type WorkflowChoice =
  | { kind: "automation"; trigger?: TriggerType }
  | { kind: "rule"; ruleType: RuleType };

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (c: WorkflowChoice) => void;
}

type Stage = "kind" | "rule";

const RULE_OPTIONS: Array<{ key: RuleType; label: string; desc: string; icon: typeof Zap }> = [
  { key: "scoring", label: "Scoring rule", desc: "Adjust a contact's running score when an event fires.", icon: Zap },
  { key: "routing", label: "Routing rule", desc: "Pick an owner for inbound leads matching criteria.",     icon: GitBranch },
  { key: "autotag", label: "Auto-tag rule", desc: "Apply tags to leads matching criteria.",                  icon: TagIcon },
];

export function SparkUnifiedWorkflowModal({ open, onClose, onChoose }: Props) {
  const [stage, setStage] = useState<Stage>("kind");

  useEffect(() => { if (open) setStage("kind"); }, [open]);

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · WORKFLOW"
      title="New workflow"
      subtitle={stage === "kind" ? "Trigger-based or rule-based?" : "Pick a rule type"}
      size="nav"
      footer={
        stage === "rule" ? (
          <IadmButton variant="ghost" onClick={() => setStage("kind")}>← Back</IadmButton>
        ) : (
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
        )
      }
    >
      <div className="p-5 space-y-3">
        {stage === "kind" && (
          <>
            <ChoiceCard
              icon={Workflow}
              title="Trigger-based automation"
              desc="Fires a sequence when something happens — contact created, stage changed, email opened, etc."
              onClick={() => onChoose({ kind: "automation" })}
            />
            <ChoiceCard
              icon={ListChecks}
              title="Rule-based"
              desc="Passive rules that score, route, or auto-tag leads based on conditions you define."
              onClick={() => setStage("rule")}
            />
          </>
        )}

        {stage === "rule" && (
          <>
            {RULE_OPTIONS.map(({ key, label, desc, icon: Icon }) => (
              <ChoiceCard
                key={key}
                icon={Icon}
                title={label}
                desc={desc}
                onClick={() => onChoose({ kind: "rule", ruleType: key })}
              />
            ))}
          </>
        )}
      </div>
    </IadmModal>
  );
}

function ChoiceCard({ icon: Icon, title, desc, onClick }: { icon: typeof Zap; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33] flex-shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 leading-snug mt-0.5">{desc}</div>
      </div>
    </button>
  );
}

export default SparkUnifiedWorkflowModal;
