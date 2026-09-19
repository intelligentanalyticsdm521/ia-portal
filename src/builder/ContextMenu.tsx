/**
 * builder/ContextMenu.tsx — the right-click menu (M-8).
 *
 * It draws whatever `builderMenu.menuFor` returns and nothing else: the rows,
 * their order, what is greyed and why are all decided in that module, which is
 * a `node --test`. This file is a popover, a keyboard, and a click-away.
 *
 * It is positioned where the pointer was and then nudged back inside the
 * window, because a menu opened on the last section of a long document falls
 * off the bottom of the screen and there is nothing to press.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MenuAction, MenuItem } from "./builderMenu";

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onPick: (action: MenuAction) => void;
  onClose: () => void;
}

const WIDTH = 248;

export function ContextMenu(p: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: p.y, left: p.x });

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320;
    setPos({
      top: Math.max(8, Math.min(p.y, window.innerHeight - h - 8)),
      left: Math.max(8, Math.min(p.x, window.innerWidth - WIDTH - 8)),
    });
  }, [p.x, p.y, p.items]);

  // Escape closes it HERE and does not reach the frame, or right-clicking a
  // section and pressing Escape would ask to close the whole builder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      p.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p]);

  return (
    <>
      <div
        onMouseDown={p.onClose}
        onContextMenu={(e) => { e.preventDefault(); p.onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 9690 }}
      />
      <div
        ref={ref}
        role="menu"
        data-builder-contextmenu="1"
        aria-label="What you can do with this"
        style={{
          position: "fixed", top: pos.top, left: pos.left, width: WIDTH, zIndex: 9700,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
          boxShadow: "0 18px 44px rgba(11,28,36,0.24)", padding: "5px 0",
        }}
      >
        {p.items.map((item, i) => (
          <div key={item.action}>
            {item.separator && i > 0 && (
              <div style={{ height: 1, background: "#EEF2F6", margin: "4px 0" }} />
            )}
            <button
              type="button"
              role="menuitem"
              data-menu-action={item.action}
              disabled={item.disabled}
              title={item.disabled ? (item.reason || item.label) : item.label}
              onClick={() => { if (!item.disabled) { p.onPick(item.action); p.onClose(); } }}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                border: "none", background: "transparent", padding: "6px 12px", fontSize: 12.5,
                color: item.disabled ? "#94A3B8" : item.danger ? "#B91C1C" : "#0B1C24",
                cursor: item.disabled ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "#F1F5F9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {/* THE CHORD, right-aligned (D-172). The reference prints one on
                  six of its twelve rows; a menu that knows the shortcut and does
                  not say it teaches nobody anything. */}
              {item.shortcut && (
                <span data-menu-shortcut={item.action}
                  style={{ flex: "0 0 auto", fontSize: 11, color: "#94A3B8", letterSpacing: "0.02em" }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default ContextMenu;
