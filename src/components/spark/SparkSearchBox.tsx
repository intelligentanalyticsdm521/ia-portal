import { useEffect, useState } from "react";
import { Search } from "lucide-react";

interface SparkSearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  /** Debounce ms before firing onChange. Default 300. */
  debounceMs?: number;
  placeholder?: string;
  /** Width preset */
  width?: "default" | "wide";
}

/**
 * Debounced search input — used inside page headers and filter rows.
 *
 * Stores its own immediate value for responsive typing, fires onChange
 * after the debounce window so we don't hammer the API on every keystroke.
 */
export function SparkSearchBox({
  value, onChange, debounceMs = 300, placeholder = "Search…", width = "default",
}: SparkSearchBoxProps) {
  const [local, setLocal] = useState(value);

  // Keep local in sync if the parent value changes externally (e.g. clear)
  useEffect(() => { setLocal(value); }, [value]);

  // Debounce outbound onChange
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  const widthCls = width === "wide" ? "w-64" : "w-48";

  return (
    <div className={`relative ${widthCls}`}>
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      <input
        type="search"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-7 pr-3 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      />
    </div>
  );
}
