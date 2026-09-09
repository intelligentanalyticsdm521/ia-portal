// StatementExportBar — Export and Print, on every financial statement.
//
// STELLA pack 1, item 4. Every statement was screen-only: an owner could look at
// their P&L and could not hand it to anyone. A lender wants a PDF, an accountant
// wants a spreadsheet, and a shoebox-and-paper owner wants to print it. This is
// one component so all six statements behave identically and are labelled
// identically — the alternative is six Export buttons that each do something
// slightly different.
//
// EXPORT is the SERVER's file, not the browser's. It calls the same statement
// endpoint with ?format=, so the CSV is generated from the same payload that
// drew the screen and cannot disagree with it. Rebuilding the table client-side
// would be a second implementation of every statement.
//
// PRINT is the BROWSER's, and it prints THIS page. window.print() with a print
// stylesheet that hides the chrome — nav, tabs, buttons — so the paper carries
// the statement and nothing else. A "print" that produced a PDF download would
// be the Export button again under a different name.
import { useState } from "react";
import { Download, Printer, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../lib/clientTenantContext";
import { downloadStellaFile } from "./dbmanager/downloadHelper";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

type Format = "csv" | "xlsx" | "pdf";

const FORMATS: { key: Format; label: string; Icon: typeof Download }[] = [
  { key: "csv", label: "CSV", Icon: Table2 },
  { key: "xlsx", label: "Excel", Icon: FileSpreadsheet },
  { key: "pdf", label: "PDF", Icon: FileText },
];

export function StatementExportBar({
  /** The statement's own API path, WITHOUT a format (e.g. "/ledger/pnl?from=…"). */
  path,
  /** Used only to name the downloaded file if the API sends no filename. */
  fileBase,
  /** Off when the statement has nothing in it — an empty export teaches nobody anything. */
  disabled,
}: {
  path: string;
  fileBase: string;
  disabled?: boolean;
}) {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: Format) {
    if (!account) return;
    setBusy(format);
    setError(null);
    try {
      const sep = path.includes("?") ? "&" : "?";
      await downloadStellaFile(
        instance, account,
        `${path}${sep}format=${format}`,
        `${fileBase}-${new Date().toISOString().slice(0, 10)}.${format}`,
        tenantOverride,
      );
    } catch (e) {
      // Said on the page, not in the console. A silent failed download is the
      // owner clicking Export four times and concluding the product is broken.
      setError(e instanceof Error ? e.message : "The download did not start. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stella-no-print" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#5A7A8A", marginRight: 2 }}>Export</span>
        {FORMATS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => run(key)}
            disabled={!!disabled || !!busy || !account}
            title={`Download this statement as ${label}`}
            style={btn(!!disabled || !!busy)}
          >
            <Icon size={13} />
            {busy === key ? "…" : label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!!disabled}
          title="Print this statement"
          style={{ ...btn(!!disabled), marginLeft: 4 }}
        >
          <Printer size={13} />
          Print
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#B91C1C", maxWidth: 380, textAlign: "right" }}>{error}</div>}
    </div>
  );
}

function btn(off: boolean) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 9px", fontSize: 11, fontWeight: 600,
    color: off ? "#94A3B8" : STELLA_INDIGO,
    background: "#fff",
    border: `1px solid ${STELLA_LAVENDER}`,
    borderRadius: 6,
    cursor: off ? "not-allowed" : "pointer",
  } as const;
}

/**
 * The print rules, mounted once by the Reports page.
 *
 * Deliberately inline rather than in a global stylesheet: the rules exist only
 * for these pages, and a global @media print that hid the app chrome everywhere
 * would silently change how every other page prints.
 */
export function StellaPrintStyles() {
  return (
    <style>{`
      @media print {
        /* The app chrome is not part of a financial statement. */
        .stella-no-print, nav, aside, header button, [data-tour] button { display: none !important; }
        /* Cards should not be boxed twice on paper, and must not be cut in half
           across a page break — a P&L split mid-section is unreadable. */
        .stella-print-block { break-inside: avoid; box-shadow: none !important; }
        body { background: #fff !important; }
        a[href]:after { content: "" !important; }
      }
    `}</style>
  );
}
