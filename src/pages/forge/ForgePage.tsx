/**
 * ForgePage — the standard content width for every FORGE screen.
 *
 * Matches ARION's page geometry (`.arion-page` in styles/index.css: 80% of the
 * content area, centred, with vertical padding). FORGE pages previously ran
 * edge to edge, so a table on a wide monitor stretched to the full viewport and
 * read as a different product from the rest of the portal.
 *
 * Deliberately NOT reusing the `.arion-page` class itself: that scope carries
 * ARION's whole component design system (its own card, table and badge rules),
 * and FORGE screens are built with the Tailwind `iadm-card` set. Inheriting it
 * would restyle them. Only the geometry is shared, which is all that was asked
 * for and all that should be coupled.
 *
 * Below `lg` the 80% cap is dropped in favour of full width with gutters —
 * 80% of a phone is unreadable, and ARION drops it at its own breakpoint too.
 */
import type { PropsWithChildren } from 'react';

export function ForgePage({ children }: PropsWithChildren) {
  return (
    <div className="mx-auto w-full px-4 py-4 lg:w-4/5 lg:px-0">
      {children}
    </div>
  );
}

export default ForgePage;
