import { useState, useRef, useEffect, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

interface SparkTooltipProps {
  /** What's shown when the user hovers / focuses */
  content: ReactNode;
  /** Trigger element. Defaults to a small (?) icon if omitted */
  children?: ReactNode;
  /** Max width of the tooltip body in px */
  maxWidth?: number;
  /** Position preference */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Lightweight tooltip — hover or focus to show a richer description.
 * Used across SPARK pages on jargon (Tier X/Y/Z, Lists vs Segments, etc.)
 * so non-technical users always have an inline explanation.
 *
 * Renders a (?) icon trigger by default; pass children for a custom trigger.
 */
export function SparkTooltip({ content, children, maxWidth = 280, side = "top" }: SparkTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const padding = 8;
    let top = r.top - padding;
    let left = r.left + r.width / 2;
    if (side === "bottom") top = r.bottom + padding;
    else if (side === "right") { top = r.top + r.height / 2; left = r.right + padding; }
    else if (side === "left") { top = r.top + r.height / 2; left = r.left - padding; }
    setCoords({ top, left });
  }, [open, side]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center cursor-help align-middle"
        tabIndex={0}
        aria-label="More info"
      >
        {children ?? <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-700 transition" />}
      </button>
      {open && (
        <div
          role="tooltip"
          className="fixed z-50 bg-slate-900 text-white text-xs rounded-md px-3 py-2 shadow-lg pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            maxWidth,
            transform:
              side === "top" ? "translate(-50%, -100%)" :
              side === "bottom" ? "translate(-50%, 0)" :
              side === "right" ? "translate(0, -50%)" :
              "translate(-100%, -50%)",
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
