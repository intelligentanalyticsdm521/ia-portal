// MultiSelectCombo — type to filter, pick several, each shows as a token.
//
// The segment builder's value box was a row of toggle chips: every tag and
// every list rendered as a button, all of them on screen at once. Fine with
// four tags, unusable with forty, and it looked nothing like the two dropdowns
// beside it. Founder 2026-08-19: "I don't like all the select buttons, just
// make a dropdown style... a third box where it's typable and dynamic but also
// a dropdown where you can select multiple things."
//
// So: one control that reads as a third dropdown. Click it and the options
// drop down; type and they filter; chosen values sit inside as removable
// tokens.
//
// `creatable` covers the free-text case — "company is any of Acme, Globex" has
// no fixed option list, so what you type becomes the value.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

const SPARK_ORANGE = "#EF6C33";

export interface ComboOption {
  value: string | number;
  label: string;
}

interface Props {
  options: ComboOption[];
  selected: Array<string | number>;
  onChange: (next: Array<string | number>) => void;
  placeholder?: string;
  /** Allow values that are not in `options` — for free-text fields. */
  creatable?: boolean;
  /** Shown in place of the list when there is nothing to choose from. */
  emptyHint?: string;
}

export function MultiSelectCombo({
  options, selected, onChange, placeholder = "Select…", creatable = false, emptyHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on an outside click. Without this the panel stays open behind the
  // next rule the user starts editing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const labelFor = (v: string | number) =>
    options.find((o) => String(o.value) === String(v))?.label ?? String(v);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const notPicked = options.filter((o) => !selected.some((s) => String(s) === String(o.value)));
    return q ? notPicked.filter((o) => o.label.toLowerCase().includes(q)) : notPicked;
  }, [options, selected, query]);

  // A typed value that matches nothing can be added as-is on a creatable field.
  const canCreate =
    creatable &&
    !!query.trim() &&
    !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) &&
    !selected.some((s) => String(s).toLowerCase() === query.trim().toLowerCase());

  useEffect(() => { setActive(0); }, [query, open]);

  const add = (v: string | number) => {
    if (!selected.some((s) => String(s) === String(v))) onChange([...selected, v]);
    setQuery("");
    inputRef.current?.focus();
  };
  const remove = (v: string | number) =>
    onChange(selected.filter((s) => String(s) !== String(v)));

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - (canCreate ? 0 : 1))); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Escape")    { setOpen(false); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) add(filtered[active].value);
      else if (canCreate) add(query.trim());
      return;
    }
    // Backspace on an empty box removes the last token — standard for this
    // control, and faster than reaching for the little x.
    if (e.key === "Backspace" && !query && selected.length) {
      remove(selected[selected.length - 1]);
    }
  }

  return (
    <div ref={wrapRef} className="relative min-w-[12rem] flex-1">
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        className="flex min-h-[1.85rem] flex-wrap items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs focus-within:border-[#EF6C33] focus-within:ring-1 focus-within:ring-[#EF6C33]"
      >
        {selected.map((v) => (
          <span
            key={String(v)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ color: SPARK_ORANGE, backgroundColor: `${SPARK_ORANGE}1A` }}
          >
            {labelFor(v)}
            <button
              onClick={(e) => { e.stopPropagation(); remove(v); }}
              aria-label={`Remove ${labelFor(v)}`}
              className="opacity-60 hover:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? "" : placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-w-[4rem] flex-1 border-0 bg-transparent px-0.5 py-0 text-xs outline-none placeholder:text-slate-400"
        />
        <ChevronDown
          className={`h-3 w-3 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((o, i) => (
            <button
              key={String(o.value)}
              onClick={() => add(o.value)}
              onMouseEnter={() => setActive(i)}
              role="option"
              aria-selected={i === active}
              className={`block w-full px-2.5 py-1.5 text-left text-xs ${
                i === active ? "bg-orange-50 text-slate-900" : "text-slate-700"
              }`}
            >
              {o.label}
            </button>
          ))}

          {canCreate && (
            <button
              onClick={() => add(query.trim())}
              className={`block w-full px-2.5 py-1.5 text-left text-xs ${
                filtered.length === 0 ? "bg-orange-50" : ""
              }`}
            >
              Use <strong>{query.trim()}</strong>
            </button>
          )}

          {!filtered.length && !canCreate && (
            <div className="px-2.5 py-2 text-[11px] italic text-slate-400">
              {options.length === 0
                ? (emptyHint || "Nothing to choose from yet.")
                : query
                  ? "No matches."
                  : "Everything is already selected."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
