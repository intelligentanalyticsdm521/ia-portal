/**
 * TextingOffNotice — one sentence, on the surfaces that send texts, when texting
 * is switched off.
 *
 * It renders NOTHING when texting is on, and nothing while the answer is in
 * flight. When it renders, the sentence comes from the server (see
 * useSmsCapability) — so there is one wording, it names the real reason
 * (verification with the mobile carriers), and it does not name a version, an
 * ETA, or a stub.
 *
 * Deliberately quieter than the amber "Coming Soon" banner it replaces. This is
 * not a warning that the page is half-built: the page works, everything saved on
 * it is kept, and one switch is off. A klaxon would say the wrong thing.
 */
import { Info } from 'lucide-react';
import { useSmsCapability } from '../../hooks/useSmsCapability';

export function TextingOffNotice() {
  const { enabled, reason } = useSmsCapability();
  if (enabled !== false || !reason) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
        <Info className="h-3 w-3" />
      </div>
      <p className="text-sm text-slate-700">{reason}</p>
    </div>
  );
}

export default TextingOffNotice;
