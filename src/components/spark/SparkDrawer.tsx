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
 * F-107 — both shim widths now map to the standard "info" size (1200×80,
 * the OLIVER customer modal size). The old `width` prop is kept for back-
 * compat but no longer changes dimensions: per the founder spec every form/
 * info modal uses the same canvas. New code should call IadmModal directly
 * with one of the semantic sizes (nav / info / report / confirm).
 *
 * Body content is wrapped in a padded div so existing pages that didn't
 * include their own padding still render with consistent spacing
 * (the old SparkDrawer wrapped children in `px-5 py-4`).
 */
export function SparkDrawer({
  open, onClose, title, subtitle, footer, children,
}: SparkDrawerProps) {
  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      title={title}
      subtitle={subtitle}
      footer={footer}
      size="info"
    >
      <div className="p-5">{children}</div>
    </IadmModal>
  );
}
