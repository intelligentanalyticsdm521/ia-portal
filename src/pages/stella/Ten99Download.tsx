// Ten99Download — the two 1099-NEC downloads. STELLA pack 2, item 4.
//
// The 1099 tab has always been a WORKSHEET: who to chase for a W-9, who crossed
// the threshold. It told an owner what to do in January and handed them nothing
// to send. These two buttons are what a January actually needs — one vendor's
// form, and the whole year in the shape a filing service imports.
//
// THE TAX ID. On screen a taxpayer id is the last four digits, always. In the
// FILE it is whole, because a masked TIN makes a 1099 useless — and because the
// file carries it, pressing either of these buttons writes a row to the audit
// log naming who took it and when. That is the trade, and it is deliberate.
import { useState } from "react";
import { FileText, Table2 } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../lib/clientTenantContext";
import { downloadStellaFile } from "./dbmanager/downloadHelper";
import { STELLA_INDIGO } from "./StellaShell";

const btn = (disabled: boolean) => ({
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 10px", fontSize: 11, fontWeight: 600,
  color: disabled ? "#94A3B8" : STELLA_INDIGO,
  background: "#fff",
  border: `1px solid ${disabled ? "#E2E8F0" : STELLA_INDIGO}`,
  borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
} as const);

function useDownload() {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy, error, ready: !!account,
    async run(path: string, filename: string) {
      if (!account) return;
      setBusy(true); setError(null);
      try {
        await downloadStellaFile(instance, account, path, filename, tenantOverride);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The download did not start. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    },
  };
}

/** One vendor's 1099-NEC, as a PDF. */
export function Ten99Download({
  counterpartyId, year, name, disabled,
}: { counterpartyId: string; year: number; name: string | null; disabled?: boolean }) {
  const dl = useDownload();
  const safe = String(name || "vendor").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "vendor";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        // A vendor with no taxpayer id cannot be filed for. Saying that on the
        // button is more useful than producing a form with a blank in the one
        // box that matters.
        title={disabled ? "No taxpayer id on file — ask this vendor for a W-9 first" : "Their 1099-NEC, with the full taxpayer id. This download is recorded."}
        disabled={disabled || dl.busy || !dl.ready}
        onClick={() => dl.run(`/ledger/ten99/${counterpartyId}/pdf?year=${year}`, `1099-NEC-${year}-${safe}.pdf`)}
        style={btn(!!disabled || dl.busy || !dl.ready)}
      >
        <FileText size={11} /> {dl.busy ? "…" : "1099-NEC"}
      </button>
      {dl.error && <span style={{ fontSize: 10, color: "#B91C1C" }}>{dl.error}</span>}
    </div>
  );
}

/** The whole year, as the CSV a filing service imports. */
export function Ten99CsvDownload({ year, disabled }: { year: number; disabled?: boolean }) {
  const dl = useDownload();
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button
        title="Every vendor for the year, with full taxpayer ids, in the shape a filing service imports. This download is recorded."
        disabled={disabled || dl.busy || !dl.ready}
        onClick={() => dl.run(`/ledger/ten99/irs-csv?year=${year}`, `1099-NEC-${year}-irs.csv`)}
        style={btn(!!disabled || dl.busy || !dl.ready)}
      >
        <Table2 size={11} /> {dl.busy ? "Preparing…" : `Download all ${year} 1099s (CSV)`}
      </button>
      {dl.error && <span style={{ fontSize: 10, color: "#B91C1C" }}>{dl.error}</span>}
    </div>
  );
}
