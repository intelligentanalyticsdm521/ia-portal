import { type ReactNode } from "react";
import { IadmModal } from "../IadmModal";

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
 * SparkDrawer — was a right-side slide-out panel; now a thin compatibility
 * shim over IadmModal so all 15 SPARK pages that consume it inherit the
 * standard centered modal chrome (ink gradient header, fixed canvas,
 * SPARK orange accents, drag-text-safe backdrop close).
 *
 * Founder edict 2026-05-28: "side panel should only be used for our
 * checkout system, everything else should use our standard sized modal."
 *
 * To preserve calling-site behavior:
 *   - width="default" → IadmModal size "md" (800px × 70vh)
 *   - width="wide"    → IadmModal size "lg" (1200px × 80vh)
 *
 * Body content is wrapped in a padded div so existing pages that didn't
 * include their own padding still render with consistent spacing
 * (the old SparkDrawer wrapped children in `px-5 py-4`).
 *
 * Direct uses of IadmModal in new code should reach for it directly —
 * this shim is just for the existing consumer pages.
 */
export function SparkDrawer({
  open, onClose, title, subtitle, footer, width = "default", children,
}: SparkDrawerProps) {
  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      title={title}
      subtitle={subtitle}
      footer={footer}
      size={width === "wide" ? "lg" : "md"}
    >
      <div className="p-5">{children}</div>
    </IadmModal>
  );
}
