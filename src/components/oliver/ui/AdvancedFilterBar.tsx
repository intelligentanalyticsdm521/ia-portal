// AdvancedFilterBar — #86 F-51 (LOCKED 2026-07-04)
//
// Faceted filter pattern: category dropdown → dynamic value dropdown →
// stack chips. Per Brandon: user picks a filter category, then picks a
// value from that category's valid options, then the choice becomes a
// chip that stays visible. Multiple chips can stack.
//
// Pattern reference: Linear filters, GitHub PR faceted filter.
//
// Consumers pass a list of FilterCategory definitions. Each category has
// a label + a resolver that returns valid values (either sync or async).
// The parent owns the applied-filters state and receives onChange with
// the current chip array.

import { useEffect, useMemo, useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";

export interface FilterValue {
  value: string;
  label: string;
}

export interface FilterCategory {
  key: string;
  label: string;
  /** Sync list of values, OR async loader. Returns options for the value dropdown. */
  values: FilterValue[] | (() => Promise<FilterValue[]>);
}

export interface AppliedFilter {
  categoryKey: string;
  categoryLabel: string;
  value: string;
  valueLabel: string;
}

interface Props {
  categories: FilterCategory[];
  applied: AppliedFilter[];
  onChange: (next: AppliedFilter[]) => void;
  placeholder?: string;
}

export function AdvancedFilterBar({ categories, applied, onChange, placeholder = "Add filter" }: Props) {
  const [openState, setOpenState] = useState<"closed" | "category" | "value">("closed");
  const [pickedCategory, setPickedCategory] = useState<FilterCategory | null>(null);
  const [values, setValues] = useState<FilterValue[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);

  useEffect(() => {
    if (openState !== "value" || !pickedCategory) return;
    if (Array.isArray(pickedCategory.values)) {
      setValues(pickedCategory.values);
      return;
    }
    let cancelled = false;
    setLoadingValues(true);
    pickedCategory.values()
      .then((r) => { if (!cancelled) setValues(r); })
      .catch(() => { if (!cancelled) setValues([]); })
      .finally(() => { if (!cancelled) setLoadingValues(false); });
    return () => { cancelled = true; };
  }, [openState, pickedCategory]);

  function pickCategory(cat: FilterCategory) {
    setPickedCategory(cat);
    setOpenState("value");
  }

  function pickValue(v: FilterValue) {
    if (!pickedCategory) return;
    const next: AppliedFilter = {
      categoryKey: pickedCategory.key,
      categoryLabel: pickedCategory.label,
      value: v.value,
      valueLabel: v.label,
    };
    // If same category+value already applied, no-op
    if (applied.some((a) => a.categoryKey === next.categoryKey && a.value === next.value)) {
      resetPicker();
      return;
    }
    onChange([...applied, next]);
    resetPicker();
  }

  function removeChip(idx: number) {
    onChange(applied.filter((_, i) => i !== idx));
  }

  function resetPicker() {
    setOpenState("closed");
    setPickedCategory(null);
    setValues([]);
  }

  const availableCategories = useMemo(() => {
    // Optionally filter out categories that only allow one value at a time
    // and already have a chip. For now, allow re-picking (multi-value support).
    return categories;
  }, [categories]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {applied.map((chip, idx) => (
        <span
          key={`${chip.categoryKey}-${chip.value}-${idx}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1"
        >
          <span className="opacity-60">{chip.categoryLabel}:</span>
          <span>{chip.valueLabel}</span>
          <button
            type="button"
            onClick={() => removeChip(idx)}
            className="rounded-full hover:bg-slate-200 p-0.5"
            aria-label={`Remove ${chip.categoryLabel} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenState(openState === "closed" ? "category" : "closed")}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 hover:border-slate-500 text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 font-semibold"
        >
          <Plus className="w-3 h-3" />
          {placeholder}
        </button>

        {openState === "category" && (
          <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg bg-white border border-slate-200 shadow-lg py-1">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
              Filter by
            </div>
            {availableCategories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => pickCategory(cat)}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
              >
                {cat.label}
                <ChevronDown className="w-3 h-3 opacity-50 -rotate-90" />
              </button>
            ))}
          </div>
        )}

        {openState === "value" && pickedCategory && (
          <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg bg-white border border-slate-200 shadow-lg py-1 max-h-64 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100 flex items-center justify-between">
              <span>{pickedCategory.label}</span>
              <button
                type="button"
                onClick={() => setOpenState("category")}
                className="text-slate-400 hover:text-slate-700 normal-case tracking-normal text-[10px] underline"
              >
                back
              </button>
            </div>
            {loadingValues ? (
              <div className="px-3 py-3 text-xs text-slate-500 italic">Loading…</div>
            ) : values.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500 italic">No values available</div>
            ) : (
              values.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => pickValue(v)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {v.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {applied.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11px] text-slate-500 hover:text-slate-800 underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default AdvancedFilterBar;
