/**
 * The words of a draft, for reading on a card.
 *
 * A campaign draft is stored as HTML (the email body). Shown as-is in a text
 * element, an owner reads "<p>" and "<strong>" tags instead of their email
 * (seen on dev, ARGUS → Your team → The marketer → Needs you, 8 Oct 2026). This
 * turns the HTML into plain, readable text: paragraphs and line breaks are
 * kept as blank lines and new lines, every other tag goes, and the common
 * entities are decoded. Text that holds no tag comes back unchanged.
 */
export function readableText(body: string | null | undefined): string {
  if (body === null || body === undefined) return "";
  const s = String(body);
  if (!/<[a-z][^>]*>/i.test(s)) return s;
  const text = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}
