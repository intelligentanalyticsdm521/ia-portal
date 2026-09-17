/**
 * builder/NameBlockDialog.tsx — "name it, and one line of what it is for" (M-23).
 *
 * BUILDER_UX_SPEC §M-23: *"Right-click a section → Save this as my own block →
 * name it, one line of what it is for → it appears in the template library
 * under 'Your own blocks', and in the '+'-between-sections picker."* For a snow
 * contractor with one severe-weather clause they use on every agreement, this
 * is the difference between the builder saving them time and costing them time.
 *
 * It replaces a `window.prompt`, which is the browser's grey box in the
 * browser's words and cannot ask a second question — so "name it" could be
 * asked and "what is it for" could not. One dialog, used wherever the builder
 * has to name something the author is keeping.
 *
 * ── ONE FIELD OR TWO ──────────────────────────────────────────────────────
 * 2026-09-17: the last two `window.prompt`s on these surfaces were "Name this
 * template" (two questions' worth) and "What should this campaign be about?"
 * (one). Rather than a second dialog for the one-field case, `askNote={false}`
 * drops the second box and the dialog is the SAME box either way. A separate
 * one-field component would be the same twenty lines with a different border
 * radius six months from now.
 */
import { useEffect, useRef, useState } from "react";

export interface NameBlockDialogProps {
  title: string;
  /** The sentence above the boxes, in the adapter's words. */
  intro: string;
  /** What the name box starts with — the section's own label, usually. */
  defaultName?: string;
  nameLabel?: string;
  /** What the first box suggests when it is empty. */
  namePlaceholder?: string;
  noteLabel?: string;
  /** False when there is only one question to ask. `note` comes back "". */
  askNote?: boolean;
  confirmLabel?: string;
  onSave: (name: string, note: string) => void;
  onClose: () => void;
}

export function NameBlockDialog(p: NameBlockDialogProps) {
  const [name, setName] = useState(p.defaultName || "");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const ok = !!name.trim();

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9660, background: "rgba(11,28,36,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
    >
      <div
        data-builder-nameblock="1"
        role="dialog"
        aria-label={p.title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); p.onClose(); }
          if (e.key === "Enter" && ok) { e.preventDefault(); p.onSave(name.trim(), note.trim()); }
        }}
        style={{ width: "min(420px, calc(100vw - 32px))", background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#0B1C24" }}>{p.title}</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#334155", marginTop: 6 }}>{p.intro}</p>

        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginTop: 12 }}>
          {p.nameLabel || "What do you call it?"}
        </label>
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-block-name
          placeholder={p.namePlaceholder || "Severe weather clause"}
          style={{ width: "100%", marginTop: 4, border: "1px solid #CBD5E1", borderRadius: 5, padding: "7px 9px", fontSize: 13 }}
        />

        {p.askNote !== false && (
          <>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginTop: 10 }}>
              {p.noteLabel || "One line about when to use it"}
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-block-note
              placeholder="Goes on every winter agreement"
              style={{ width: "100%", marginTop: 4, border: "1px solid #CBD5E1", borderRadius: 5, padding: "7px 9px", fontSize: 13 }}
            />
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={p.onClose} title="Go back without saving it"
            style={{ border: "1px solid #CBD5E1", background: "#fff", color: "#0B1C24", borderRadius: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Not now
          </button>
          <button type="button" disabled={!ok} data-block-save
            onClick={() => p.onSave(name.trim(), note.trim())}
            title={ok ? "Keep this, so you can drop it into any document" : "Give it a name first"}
            style={{ border: "none", background: ok ? "#0C4A60" : "#CBD5E1", color: "#fff", borderRadius: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: ok ? "pointer" : "not-allowed" }}>
            {p.confirmLabel || "Save it"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NameBlockDialog;
