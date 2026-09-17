/**
 * builder/FindBox.tsx — Ctrl+E, one box (M-22).
 *
 * The ranking, the grouping and the "it never creates records" rule all live in
 * `find.ts`, which is a `node --test`. This draws the box, moves the highlight
 * with the arrow keys and runs what Enter lands on.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { FIND_GROUP_LABEL, FIND_PLACEHOLDER, findResults, type FindInput, type FindResult } from "./find";

export interface FindBoxProps extends FindInput {
  onPick: (result: FindResult) => void;
  onClose: () => void;
}

export function FindBox(p: FindBoxProps) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(
    () => findResults(query, { doc: p.doc, adapter: p.adapter, actions: p.actions }),
    [query, p.doc, p.adapter, p.actions],
  );

  useEffect(() => { setAt(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    // Every key is handled HERE while the box is open, or the frame's own
    // shortcut map would delete the selected widget while the author is typing
    // "delete" into a search box.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); p.onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[at];
      if (hit) { p.onPick(hit); p.onClose(); }
    }
  }

  let lastKind: string | null = null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9620, background: "rgba(11,28,36,0.35)", display: "flex", justifyContent: "center", paddingTop: "12vh" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
    >
      <div
        data-builder-find="1"
        role="dialog"
        aria-label="Find"
        onKeyDown={onKeyDown}
        style={{ width: "min(520px, calc(100vw - 32px))", height: "fit-content", maxHeight: "70vh", overflow: "auto", background: "#fff", borderRadius: 10, boxShadow: "0 26px 64px rgba(0,0,0,0.32)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #EEF2F6" }}>
          <Search size={15} color="#5A7A8A" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={FIND_PLACEHOLDER}
            aria-label="Find"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, color: "#0B1C24" }}
          />
        </div>

        {results.length === 0 && (
          <div style={{ padding: "14px 14px 16px", fontSize: 12.5, color: "#5A7A8A" }}>
            Nothing here matches that. Try a section's name, or what you want to add.
          </div>
        )}

        <div style={{ padding: "4px 0 8px" }}>
          {results.map((r, i) => {
            const heading = r.kind !== lastKind ? FIND_GROUP_LABEL[r.kind] : null;
            lastKind = r.kind;
            return (
              <div key={r.id}>
                {heading && (
                  <div style={{ padding: "8px 14px 3px", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#94A3B8" }}>
                    {heading}
                  </div>
                )}
                <button
                  type="button"
                  data-find-result={r.id}
                  aria-current={i === at}
                  onMouseEnter={() => setAt(i)}
                  onClick={() => { p.onPick(r); p.onClose(); }}
                  title={r.hint || r.label}
                  style={{
                    display: "block", width: "100%", textAlign: "left", border: "none",
                    background: i === at ? "#F1F5F9" : "transparent", padding: "6px 14px", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0B1C24" }}>{r.label}</div>
                  {r.hint && <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.35 }}>{r.hint}</div>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FindBox;
