// downloadHelper — authenticated binary download.
//
// A document's blob_url points at a PRIVATE container, so an <a href> to it
// 403s. The bytes have to come back through the API behind the tenant guard,
// which means an authenticated fetch and an object-URL click.
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { STELLA_API_BASE, getStellaAuthHeaders } from "../../../lib/stellaApi";

export const STELLA_API_BASE_FOR_DOWNLOAD = STELLA_API_BASE;

export async function downloadStellaFile(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  filename: string,
  tenantOverride?: string | null
): Promise<void> {
  const headers = await getStellaAuthHeaders(msal, account, tenantOverride);
  const res = await fetch(`${STELLA_API_BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    // A refusal the API wrote for a person ({ message }) is shown as written;
    // anything else keeps the status and the raw body so it can be reported.
    let plain = "";
    try { plain = String(JSON.parse(text)?.message || "").trim(); } catch { /* not JSON */ }
    if (plain) throw new Error(plain);
    throw new Error(`Download failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers; one tick is
  // enough for the click to have been handled.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
