// DetailDrawer — F-102.
//
// Was the bespoke OLIVER modal frame (white header, "OLIVER" eyebrow in
// muted blue-gray). Founder edict 2026-05-28: "OLIVER's old white
// DetailDrawer header gets replaced [by IadmModal] so every product feels
// the same." (See IadmModal docblock for full standard spec — ink gradient
// header #0B1C24 → #1a3540, Core Blue first button, platform accent second.)
//
// Rather than touch the ~25 OLIVER pages that use this, we turn DetailDrawer
// into a thin shim over IadmModal: same prop surface, but render the standard
// chrome. Every consumer auto-converts in one commit.
//
// Width/size translation:
//   width="md"  → IadmModal size "md" (800 × 70vh)
//   width="lg"  → IadmModal size "lg" (1200 × 80vh)
//   width="xl"  → IadmModal size "lg" (also 1200 × 80vh)
//   size="fixed" overrides → "lg" (matches the founder's standard).
//
// Per-pixel widths from the old DetailDrawer (md=600, lg=900, xl=1200) get
// rounded UP to the IadmModal grid so the "static size, not dynamic" rule
// holds — no content-driven jumps between calls.
import { type ReactNode } from "react";
import { IadmModal, type IadmModalSize } from "../../IadmModal";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "md" | "lg" | "xl";
  /**
   * Sizing mode preserved for back-compat. "fixed" → always "lg" (1200×80vh).
   * "fluid" → mapped from width prop.
   */
  size?: "fluid" | "fixed";
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

// F-107 — every DetailDrawer call now resolves to the standard "info" size
// (1200×80vh — the OLIVER CustomerModal canvas the founder locked). The
// width/size props are kept for back-compat but no longer change dimensions.
// New code should call IadmModal directly with one of the semantic sizes
// (nav / info / report / confirm).
function mapSize(_width: NonNullable<Props["width"]>, _size: NonNullable<Props["size"]>): IadmModalSize {
  return "info";
}

export function DetailDrawer({
  open, onClose, title, subtitle, width = "lg", size = "fluid",
  headerActions, footer, children,
}: Props) {
  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      title={title}
      subtitle={subtitle}
      headerActions={headerActions}
      footer={footer}
      size={mapSize(width, size)}
    >
      {/* Preserve the old DetailDrawer body padding so every existing OLIVER
          page that wrote its content assuming "16px 24px 20px" of padding
          still renders identically. */}
      <div style={{ padding: "16px 24px 20px" }}>{children}</div>
    </IadmModal>
  );
}
