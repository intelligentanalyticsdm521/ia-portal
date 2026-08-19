// SegmentRuleBuilder — pick fields, operators and values for a segment.
//
// The segment form used to be a name and a free-text box captioned "Plain
// English: contacts tagged VIP, in Texas, who opened an email in the last 30
// days", under a note promising dropdowns "coming soon". Nothing parsed that
// text, so no segment ever carried a rule — and buildSql returns an empty
// WHERE when there are no rules, which matches EVERY contact. A segment can be
// a campaign's send audience, so those segments were not merely empty; they
// were addressed to the whole CRM.
//
// EVERY field and operator below is one lib/segmentEvaluator.js actually
// implements. Offering one it does not would repeat the merge-tag defect,
// where the picker listed tags the resolver could not fill and they silently
// came out blank.
import { useEffect, useMemo, useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";

export interface SegmentRule {
  field: string;
  op: string;
  value: unknown;
}
export interface SegmentFilters {
  match: "all" | "any";
  rules: SegmentRule[];
}

type ValueKind = "text" | "number" | "date" | "tags" | "lists" | "none";

interface FieldDef {
  key: string;
  label: string;
  group: string;
  kind: ValueKind;
  ops: string[];
  hint?: string;
}

const TEXT_OPS = ["=", "!=", "contains", "starts_with", "in", "not in", "exists", "not_exists"];
const NUM_OPS = ["=", "!=", ">", ">=", "<", "<=", "exists", "not_exists"];
const DATE_OPS = [">=", "<=", ">", "<", "="];

// Mirrors FIELD_MAP + the computed fields in lib/segmentEvaluator.js.
export const SEGMENT_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First name", group: "Person",  kind: "text", ops: TEXT_OPS },
  { key: "last_name",  label: "Last name",  group: "Person",  kind: "text", ops: TEXT_OPS },
  { key: "email",      label: "Email",      group: "Person",  kind: "text", ops: TEXT_OPS },
  { key: "phone",      label: "Phone",      group: "Person",  kind: "text", ops: TEXT_OPS },
  { key: "company",    label: "Company",    group: "Person",  kind: "text", ops: TEXT_OPS },
  { key: "city",       label: "City",       group: "Location", kind: "text", ops: TEXT_OPS },
  { key: "state",      label: "State",      group: "Location", kind: "text", ops: TEXT_OPS },
  { key: "source",     label: "How we met them", group: "Person", kind: "text", ops: TEXT_OPS,
    hint: "Where the contact came from — a form, an import, the API." },
  { key: "stage",      label: "Lifecycle stage", group: "Person", kind: "text", ops: TEXT_OPS },
  { key: "lead_score", label: "Lead score", group: "Engagement", kind: "number", ops: NUM_OPS },
  { key: "tag",        label: "Tag",        group: "Grouping", kind: "tags",  ops: ["in", "not in"],
    hint: "A fact about the person. Matches any of the tags you pick." },
  { key: "list",       label: "Is on list", group: "Grouping", kind: "lists", ops: ["in", "not in"],
    hint: "Membership of a list you built by hand." },
  { key: "last_seen_days", label: "Last activity (days ago)", group: "Engagement", kind: "number",
    ops: ["<=", "<", ">=", ">"], hint: "e.g. 30 or less = active in the last month." },
  { key: "email_opened_in_days", label: "Opened an email (within days)", group: "Engagement", kind: "number",
    ops: ["<=", "<", ">=", ">"], hint: "Counts opens and clicks on campaigns." },
  { key: "created_at", label: "Created",    group: "Dates", kind: "date", ops: DATE_OPS },
  { key: "updated_at", label: "Last updated", group: "Dates", kind: "date", ops: DATE_OPS },
];

const OP_LABELS: Record<string, string> = {
  "=": "is", "!=": "is not", ">": "is more than", ">=": "is at least",
  "<": "is less than", "<=": "is at most",
  contains: "contains", starts_with: "starts with",
  in: "is any of", "not in": "is none of",
  exists: "has a value", not_exists: "is empty",
};

const fieldDef = (key: string) => SEGMENT_FIELDS.find((f) => f.key === key) || SEGMENT_FIELDS[0];
const needsValue = (op: string) => op !== "exists" && op !== "not_exists";

interface Props {
  value: SegmentFilters;
  onChange: (f: SegmentFilters) => void;
  /** Tag names for the tag picker. */
  tags?: string[];
  /** Lists to choose from, for "is on list". */
  lists?: Array<{ id: number; name: string }>;
  /** Live count of who matches, rendered above the rules. */
  matchCount?: number | null;
  counting?: boolean;
}

export function SegmentRuleBuilder({ value, onChange, tags = [], lists = [], matchCount, counting }: Props) {
  const rules = value.rules || [];

  const setRule = (i: number, patch: Partial<SegmentRule>) => {
    const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...value, rules: next });
  };

  const addRule = () => onChange({ ...value, rules: [...rules, { field: "tag", op: "in", value: [] }] });
  const removeRule = (i: number) => onChange({ ...value, rules: rules.filter((_, idx) => idx !== i) });

  // Changing the field usually invalidates the operator and always invalidates
  // the value, so both reset to something the new field supports.
  const changeField = (i: number, key: string) => {
    const def = fieldDef(key);
    setRule(i, {
      field: key,
      op: def.ops[0],
      value: def.kind === "tags" || def.kind === "lists" ? [] : "",
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-600">Include contacts matching</span>
        <select
          value={value.match}
          onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="all">all of these rules</option>
          <option value="any">any of these rules</option>
        </select>
        <span className="ml-auto text-slate-500">
          {counting ? "counting…"
            : matchCount == null ? ""
            : <><strong className="text-slate-800">{matchCount.toLocaleString()}</strong> contact{matchCount === 1 ? "" : "s"} match</>}
        </span>
      </div>

      {/* A segment with no rules matches EVERYONE, and a segment can be a
          campaign's audience. Say so plainly rather than letting it save
          quietly. */}
      {rules.length === 0 && (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong className="font-semibold">No rules yet.</strong> A segment with no rules matches
            every contact you have — add at least one rule before saving.
          </span>
        </div>
      )}

      {rules.map((rule, i) => {
        const def = fieldDef(rule.field);
        const ops = def.ops;
        return (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-[11px] font-semibold uppercase text-slate-400">
                {i === 0 ? "Where" : value.match === "any" ? "or" : "and"}
              </span>

              <select
                value={rule.field}
                onChange={(e) => changeField(i, e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {["Person", "Grouping", "Engagement", "Location", "Dates"].map((g) => (
                  <optgroup key={g} label={g}>
                    {SEGMENT_FIELDS.filter((f) => f.group === g).map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={String(rule.op)}
                onChange={(e) => setRule(i, { op: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o] || o}</option>)}
              </select>

              {needsValue(String(rule.op)) && (
                <ValueInput
                  kind={def.kind}
                  op={String(rule.op)}
                  value={rule.value}
                  tags={tags}
                  lists={lists}
                  onChange={(v) => setRule(i, { value: v })}
                />
              )}

              <button
                onClick={() => removeRule(i)}
                aria-label={`Remove rule ${i + 1}`}
                className="ml-auto p-1 text-slate-400 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {def.hint && <p className="mt-1 pl-12 text-[11px] text-slate-500">{def.hint}</p>}
          </div>
        );
      })}

      <button
        onClick={addRule}
        className="inline-flex items-center gap-1 text-xs font-medium text-[#EF6C33] hover:underline"
      >
        <Plus className="h-3 w-3" /> Add rule
      </button>
    </div>
  );
}

function ValueInput({
  kind, op, value, tags, lists, onChange,
}: {
  kind: ValueKind; op: string; value: unknown;
  tags: string[]; lists: Array<{ id: number; name: string }>;
  onChange: (v: unknown) => void;
}) {
  const arr = Array.isArray(value) ? value : [];

  if (kind === "tags" || kind === "lists") {
    const options = kind === "tags"
      ? tags.map((t) => ({ id: t, label: t }))
      : lists.map((l) => ({ id: l.id, label: l.name }));
    if (!options.length) {
      return (
        <span className="text-[11px] italic text-slate-400">
          {kind === "tags" ? "No tags yet — create one on a contact first." : "No lists yet — create one first."}
        </span>
      );
    }
    const toggle = (id: string | number) =>
      onChange(arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id]);
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = arr.includes(o.id);
          return (
            <button
              key={String(o.id)}
              onClick={() => toggle(o.id)}
              aria-pressed={on}
              className={`rounded-full px-2 py-0.5 text-[11px] border transition-colors ${
                on ? "border-[#EF6C33] bg-[#EF6C33]/10 font-medium text-[#EF6C33]"
                   : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  // "is any of" / "is none of" on a text field take a comma-separated list.
  if (op === "in" || op === "not in") {
    return (
      <input
        value={arr.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))}
        placeholder="value, another value"
        className="min-w-[10rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
      />
    );
  }

  return (
    <input
      type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      onChange={(e) => onChange(kind === "number" ? Number(e.target.value) : e.target.value)}
      placeholder={kind === "number" ? "0" : "value"}
      className="min-w-[8rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
    />
  );
}

/** True when this segment would match the entire CRM. */
export function matchesEveryone(filters: SegmentFilters): boolean {
  return !filters?.rules?.length;
}
