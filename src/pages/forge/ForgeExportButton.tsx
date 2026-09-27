/**
 * ForgeExportButton — the one way a FORGE screen offers its rows as a file.
 *
 * The work happens on CLICK and only on click. An export can be a 25,000-row
 * fetch, so a screen that started one on mount would pay for it on every visit
 * whether or not anybody wanted the file; it also means the file holds the rows
 * as they are when the button is pressed rather than as they were when the page
 * loaded.
 *
 * It is the platform Button, not a button of its own, so an export sits beside
 * "New Client" and "Preview" looking like what it is — one more control on the
 * screen, keyboard-reachable in the same tab order.
 */
import { useCallback, useState } from 'react';
import { Button } from './ForgeLayout';
import { describeError } from './useForge';

export function ForgeExportButton({
  onExport, onError, subject, label = 'Export CSV', busyLabel = 'Preparing…',
  disabled = false, variant = 'secondary', size = 'md',
}: {
  /** Fetches or reads the rows, builds the file, hands it to the browser. */
  onExport: () => Promise<void>;
  /**
   * Where a failure goes. Letting it throw out of the click handler would take
   * the whole screen down over a file that did not download — the page already
   * has somewhere to say so.
   */
  onError: (message: string) => void;
  /** Named in that failure message, in the voice describeError already uses. */
  subject: string;
  label?: string;
  busyLabel?: string;
  /** Nothing to export — an empty list, or a list that has not arrived yet. */
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    /* A second click while the first is in flight downloads the same file twice
       and, if one of the two fails, leaves the label stuck on `busyLabel`. */
    if (busy) return;
    setBusy(true);
    try {
      await onExport();
    } catch (err) {
      onError(describeError(err, subject));
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [busy, onExport, onError, subject]);

  return (
    <Button variant={variant} size={size} onClick={run} disabled={disabled || busy}>
      {busy ? busyLabel : label}
    </Button>
  );
}

export default ForgeExportButton;
