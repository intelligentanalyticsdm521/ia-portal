/**
 * ForgePage — the standard content width for every FORGE screen.
 *
 * 80% of the content area at lg and up - the same measure ARION uses, because
 * a page that runs edge to edge stops reading as a page. A wide table is not a
 * reason to widen the page: the table scrolls inside it and the action column
 * is pinned, so the buttons stay put without the layout giving way.
 * This started life matching `.arion-page` geometry so a FORGE table on a wide
 * monitor didn't stretch edge to edge and read as a different product. That
 * borrowed 80% turned out to be the wrong constraint for this product: ARION's
 * pages are prose and dashboards, HESTIA's are data grids, and the 20% it gave
 * away was measured at 227px of a 1136px content area — more than a whole
 * column. Six of the seven list screens overflowed their scroll box because of
 * it, which is how the Archive button ended up off the right edge.
 *
 * Deliberately still NOT reusing the `.arion-page` class itself: that scope
 * carries ARION's whole component design system (its own card, table and badge
 * rules), and FORGE screens are built with the Tailwind `iadm-card` set.
 * Inheriting it would restyle them.
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
