// InfoTip — small "?" icon with a hover/focus tooltip.
//
// Used to attach inline explanations to wizard fields without
// cluttering the layout. Click/keyboard focus also opens the tip so
// it's usable on touch + by keyboard.
//
// Usage:
//   <Label>City <InfoTip text="Used to target SEO + booking-page geo." /></Label>
import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

export function InfoTip({ text, side = "top" }: { text: string; side?: "top" | "bottom" | "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const placement: React.CSSProperties =
      side === "bottom" ? { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
    : side === "left"   ? { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
    : side === "right"  ? { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
    :                     { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" };

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        aria-label="More information"
        style={{
          background: "transparent", border: "none", padding: 0, cursor: "help",
          color: "#7C97A6", display: "inline-flex", alignItems: "center",
        }}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", zIndex: 1000, ...placement,
            background: "#0B1C24", color: "#fff", padding: "6px 9px",
            borderRadius: 6, fontSize: 11, lineHeight: 1.45, fontWeight: 400,
            width: 240, textAlign: "left",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)", letterSpacing: 0,
            textTransform: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default InfoTip;
