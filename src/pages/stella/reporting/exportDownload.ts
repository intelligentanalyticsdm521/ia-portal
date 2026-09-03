// exportDownload — authenticated POST that returns a FILE, not JSON.
//
// The export endpoint streams bytes, so it cannot go through stellaFetch (which
// parses JSON). It also cannot be an <a href> because it is a POST behind an
// auth header. Fetch, blob, object-URL, click.
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { STELLA_API_BASE, getStellaAuthHeaders } from "../../../lib/stellaApi";

export async function stellaExportDownload(
  msal: IPublicClientApplication,
  account: AccountInfo,
  body: Record<string, unknown>,
  fallbackName: string,
  tenantOverride?: string | null
): Promise<void> {
  const headers = await getStellaAuthHeaders(msal, account, tenantOverride);
  const res = await fetch(`${STELLA_API_BASE}/reporting/exports`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Export failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j.details ? `${j.error} — ${j.details}` : j.error || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  // The API names the file in Content-Disposition; honour it so the download
  // matches the run recorded in history rather than inventing a second name.
  const cd = res.headers.get("content-disposition") || "";
  const named = /filename="([^"]+)"/.exec(cd)?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = named || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
