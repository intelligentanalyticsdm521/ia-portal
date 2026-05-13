import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SparkDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Footer content (typically Cancel + Save buttons) */
  footer?: ReactNode;
  /** Width preset — default 480 (form). Wide for table-style content. */
  width?: "default" | "wide";
  children: ReactNode;
}

/**
 * SparkDrawer — right-side slide-out panel for create/edit forms.
 *
 * Brevo/Pipedrive/HubSpot all use this pattern. Feels more "SaaS tool" than
 * a center modal — keeps context visible behind, easier to compare while
 * editing.
 *
 * - 480px default width (form-friendly), 720px for wide
 * - Backdrop closes on click
 * - ESC closes
 * - Body scroll locked while open
 */
export function SparkDrawer({
  open, onClose, title, subtitle, footer, width = "default", children,
}: SparkDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = width === "wide" ? "w-[720px] max-w-[90vw]" : "w-[480px] max-w-[90vw]";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="flex-1 bg-black/40 cursor-default"
        aria-label="Close"
      />
      {/* Panel */}
      <div className={`${widthClass} bg-white shadow-2xl flex flex-col h-full animate-spark-drawer-in`}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 -mr-1 p-1 rounded hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body — scrolls if needed */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {/* Footer — sticky */}
        {footer && (
          <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 bg-slate-50/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
