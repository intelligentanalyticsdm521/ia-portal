// 2026-06-22: page renamed Cross-Channel → Cross-Platform. This module now
// re-exports from IAInsightsCrossPlatform.tsx so any lingering imports of
// the old name continue to resolve. Delete this shim once all imports are
// migrated.
export { IAInsightsCrossPlatform as IAInsightsCrossChannel } from './IAInsightsCrossPlatform';
