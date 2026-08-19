// FormOutcomesEditor — what happens to whoever fills this form in.
//
// Both form stores gained tags / list / consent, and neither had anywhere to
// set them, so the capability was real and unreachable —
// arion.site_form_config still had zero rows. This is that screen, shared by
// both entry points so a WordPress form and a SPARK-hosted form are configured
// the same way and cannot drift:
//
//   * SPARK-hosted form  -> saved on lumen.form.settings
//   * ARION/WordPress    -> saved on arion.site_form_config
//
// Tags are chosen by NAME, not id, matching how both back ends store them:
// the config then survives a tag being merged or recreated, and reads as what
// it means. Typing a name that does not exist yet is allowed on purpose — the
// tag is created on the first submission, because being made to go and create
// "Newsletter" before you can say "this form adds Newsletter" is friction for
// no benefit.
import { useEffect, useState } from "react";
import { Tag as TagIcon, ListPlus, ShieldCheck } from "lucide-react";
import { MultiSelectCombo, type ComboOption } from "./MultiSelectCombo";

export interface FormOutcomes {
  apply_tags: string[];
  add_to_list_id: number | null;
  marketing_optin: boolean;
}

export const EMPTY_OUTCOMES: FormOutcomes = {
  apply_tags: [],
  add_to_list_id: null,
  marketing_optin: false,
};

interface Props {
  value: FormOutcomes;
  onChange: (v: FormOutcomes) => void;
  get: <T>(p: string) => Promise<T>;
  ready: boolean;
  /** Shown above the controls; the form builder already has its own heading. */
  showHeading?: boolean;
}

export function FormOutcomesEditor({ value, onChange, get, ready, showHeading = true }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [lists, setLists] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    if (!ready) return;
    get<{ data: Array<{ name: string }> }>("/api/v1/tags")
      .then((r) => setTags((r.data || []).map((t) => t.name).filter(Boolean)))
      .catch(() => setTags([]));
    get<{ data: Array<{ id: number; name: string }> }>("/api/v1/lists?limit=200")
      .then((r) => setLists((r.data || []).map((l) => ({ id: l.id, name: l.name }))))
      .catch(() => setLists([]));
  }, [get, ready]);

  const listOptions: ComboOption[] = lists.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="space-y-3">
      {showHeading && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            When someone submits this form
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            The contact is always created. These decide what else happens.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <TagIcon className="h-3 w-3" /> Tag them
        </label>
        <MultiSelectCombo
          options={tags.map((t) => ({ value: t, label: t }))}
          selected={value.apply_tags}
          onChange={(next) => onChange({ ...value, apply_tags: next.map(String) })}
          // A tag that does not exist yet is created on the first submission,
          // so the config can be written before the tag is.
          creatable
          placeholder="Newsletter, Website lead…"
          emptyHint="No tags yet — type one and it will be created."
        />
        <p className="mt-1 text-[11px] text-slate-500">
          This is how a subscription list is built: tag them here, then send to that tag.
        </p>
      </div>

      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <ListPlus className="h-3 w-3" /> Add them to a list
        </label>
        <select
          value={value.add_to_list_id ?? ""}
          onChange={(e) => onChange({ ...value, add_to_list_id: e.target.value ? Number(e.target.value) : null })}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="">Don't add to a list</option>
          {listOptions.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
        {!lists.length && (
          <p className="mt-1 text-[11px] italic text-slate-400">
            No lists yet — create one on the Lists page first.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2.5">
        <input
          type="checkbox"
          checked={value.marketing_optin}
          onChange={(e) => onChange({ ...value, marketing_optin: e.target.checked })}
          className="mt-0.5"
        />
        <span className="text-[11px] text-slate-600">
          <span className="flex items-center gap-1 font-medium text-slate-800">
            <ShieldCheck className="h-3 w-3" /> Treat this as marketing consent
          </span>
          Tick this only where the form actually says so — a newsletter sign-up, not a
          "request a quote" form. Consent is the thing you have to be able to evidence
          later, so it should record what the person was told.
        </span>
      </label>
    </div>
  );
}

/** Pull outcomes out of a stored settings blob, whatever shape it is in. */
export function outcomesFromSettings(settings: unknown): FormOutcomes {
  let s: Record<string, unknown> = {};
  if (typeof settings === "string") {
    try { s = JSON.parse(settings || "{}"); } catch { s = {}; }
  } else if (settings && typeof settings === "object") {
    s = settings as Record<string, unknown>;
  }
  const raw = s.apply_tags;
  const apply_tags = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(",").map((x) => x.trim()).filter(Boolean)
      : [];
  return {
    apply_tags,
    add_to_list_id: Number.isFinite(Number(s.add_to_list_id)) ? Number(s.add_to_list_id) : null,
    marketing_optin: !!s.marketing_optin,
  };
}

/** Merge outcomes back into a settings blob without losing what else is there. */
export function settingsWithOutcomes(settings: unknown, outcomes: FormOutcomes): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (typeof settings === "string") {
    try { base = JSON.parse(settings || "{}"); } catch { base = {}; }
  } else if (settings && typeof settings === "object") {
    base = { ...(settings as Record<string, unknown>) };
  }
  // lumen.form.settings predates this feature and carries unrelated keys
  // (redirect_url and friends). Replacing the blob wholesale would silently
  // drop them.
  return {
    ...base,
    apply_tags: outcomes.apply_tags,
    add_to_list_id: outcomes.add_to_list_id,
    marketing_optin: outcomes.marketing_optin,
  };
}
