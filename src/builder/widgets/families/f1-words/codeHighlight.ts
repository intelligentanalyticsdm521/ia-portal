/**
 * f1-words/codeHighlight.ts — Elementor Pro's **Code Highlight**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `code-highlight`: title "Code
 * Highlight", group `pro-elements`, icon `eicon-code-highlight`, ONE panel
 * section called "Code Highlight" on the Content tab and NO Style tab at all.
 * Its controls, with Elementor's own labels and defaults:
 *
 *   language            select2  "Language"            `javascript`
 *   code                code     "Code"                `console.log( 'Code is Poetry' );`
 *   line_numbers        switcher "Line Numbers"        on
 *   copy_to_clipboard   switcher "Copy to Clipboard"   on
 *   highlight_lines     text     "Highlight Lines"     empty
 *   word_wrap           switcher "Word Wrap"           off
 *   theme               select   "Theme"               `default`
 *   font_size           slider   "Font Size"           empty
 *
 * ── THE JAVASCRIPT, AND THE FALLBACK ──────────────────────────────────────
 * Elementor colours the code with Prism and adds a Copy button, both in the
 * browser. Our renderer draws the code as a plain `<pre><code>` block with the
 * line numbers already in the markup, so a page with no JavaScript still shows
 * every character, in order, selectable and copyable by hand. Nothing here
 * emits a Copy button that would do nothing when pressed: a dead control is
 * worse than none.
 *
 * ── WHERE IT IS OFFERED ───────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_pro` and
 * `landing.elementor_pro`, and nowhere else.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { WidgetOption } from "../../../registry";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
const on = (v: unknown): boolean => v === true || v === "yes";

/** Elementor's own default code, so a dropped widget reads as Elementor's does. */
export const CODE_HIGHLIGHT_DEFAULT_CODE = "console.log( 'Code is Poetry' );";

/**
 * Elementor's own language list, in Elementor's own order.
 *
 * The VALUE is Elementor's slug — the page engine reads nothing else — and the
 * label is how that language is written down. Pairs and not plain strings,
 * because `csharp` does not slugify from "C#" and a value the engine does not
 * know is a code block with no colour and nothing on screen saying why.
 */
export const CODE_LANGUAGES: WidgetOption[] = [
  { value: "markup", label: "Markup" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sass", label: "Sass" },
  { value: "scss", label: "SCSS" },
  { value: "less", label: "Less" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "json", label: "JSON" },
  { value: "http", label: "HTTP" },
  { value: "xml", label: "XML" },
  { value: "svg", label: "SVG" },
  { value: "rust", label: "Rust" },
  { value: "csharp", label: "C#" },
  { value: "dart", label: "Dart" },
  { value: "git", label: "Git" },
  { value: "java", label: "Java" },
  { value: "sql", label: "SQL" },
  { value: "go", label: "Go" },
  { value: "kotlin", label: "Kotlin" },
  { value: "julia", label: "Julia" },
  { value: "python", label: "Python" },
  { value: "swift", label: "Swift" },
  { value: "bash", label: "Bash" },
  { value: "scala", label: "Scala" },
  { value: "haskell", label: "Haskell" },
  { value: "perl", label: "Perl" },
  { value: "objectivec", label: "Objective-C" },
  { value: "visual-basic,", label: "Visual Basic" },
  { value: "r", label: "R" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "aspnet", label: "ASP.NET" },
];

export const CODE_THEMES: WidgetOption[] = [
  { value: "default", label: "Default" },
  { value: "dark", label: "Dark" },
  { value: "okaidia", label: "Okaidia" },
  { value: "solarizedlight", label: "Solarized Light" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "twilight", label: "Twilight" },
];

/** Ink and paper per theme. Six names, six pairs, no theme without one. */
const THEME_PAINT: Record<string, { bg: string; fg: string; gutter: string }> = {
  default: { bg: "#F5F2F0", fg: "#1F2937", gutter: "#9CA3AF" },
  dark: { bg: "#1E1E1E", fg: "#E5E7EB", gutter: "#6B7280" },
  okaidia: { bg: "#272822", fg: "#F8F8F2", gutter: "#8A8F86" },
  solarizedlight: { bg: "#FDF6E3", fg: "#657B83", gutter: "#93A1A1" },
  tomorrow: { bg: "#2D2D2D", fg: "#CCCCCC", gutter: "#888888" },
  twilight: { bg: "#141414", fg: "#F7F7F7", gutter: "#7A7A7A" },
};

export function codeHighlightPaint(theme: unknown) {
  return THEME_PAINT[str(theme)] || THEME_PAINT.default;
}

/**
 * The lines Elementor's `highlight_lines` names, as a set.
 *
 * Elementor's own spelling is a comma-separated list of numbers and ranges:
 * `2,5-7`. Anything that is not a number or a range is ignored rather than
 * throwing — a half-typed range is the author mid-thought, not a broken page.
 */
export function highlightedLines(spec: unknown): Set<number> {
  const out = new Set<number>();
  for (const part of str(spec).split(",")) {
    const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) out.add(i);
      continue;
    }
    const one = part.trim().match(/^\d+$/);
    if (one) out.add(Number(part.trim()));
  }
  return out;
}

export function renderCodeHighlight(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const code = str(p.code);
  if (!code.trim()) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Paste the code you want to show. It is shown exactly as typed, never run.</div>`
      : "";
  }
  const paint = codeHighlightPaint(p.theme);
  const wrap = on(p.word_wrap);
  const numbers = on(p.line_numbers);
  const marked = highlightedLines(p.highlight_lines);
  const size = Number(p.font_size) > 0 ? Number(p.font_size) : 13;
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const body = lines.map((line, i) => {
    const n = i + 1;
    const hit = marked.has(n)
      ? "background:rgba(250,204,21,0.22);display:block;margin:0 -10px;padding:0 10px;"
      : "";
    const gutter = numbers
      ? `<span aria-hidden="true" style="display:inline-block;width:2.2em;color:${paint.gutter};user-select:none">${n}</span>`
      : "";
    return `<span style="${hit}">${gutter}${esc(line) || "&nbsp;"}</span>`;
  }).join("\n");
  return `<pre class="bx-code" data-language="${esc(str(p.language) || "javascript")}"`
    + ` style="margin:0;background:${paint.bg};color:${paint.fg};border-radius:6px;padding:12px;`
    + `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:${size}px;line-height:1.55;`
    + `overflow-x:auto;white-space:${wrap ? "pre-wrap" : "pre"};word-break:${wrap ? "break-word" : "normal"}">`
    + `<code>${body}</code></pre>`;
}

export const CODE_HIGHLIGHT_DEF: FamilyWidgetDef = {
  kind: "code_highlight",
  label: "Code Highlight",
  description: "A block of code, shown exactly as typed with its lines numbered. It is never run.",
  icon: "FileCode",
  picture: pictureFrom(box(5, 7, 54, 26)
    + `<path d="M19 15l-5 5 5 5M45 15l5 5-5 5" stroke="#94A3B8"/>` + bar(26, 19, 12, 3)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    language: "javascript",
    code: CODE_HIGHLIGHT_DEFAULT_CODE,
    line_numbers: true,
    copy_to_clipboard: true,
    highlight_lines: "",
    word_wrap: false,
    theme: "default",
  },
  controls: [
    { key: "language", label: "Language", type: "select", tab: "content", section: "Code Highlight", options: CODE_LANGUAGES },
    { key: "code", label: "Code", type: "code", tab: "content", section: "Code Highlight" },
    { key: "line_numbers", label: "Line Numbers", type: "toggle", tab: "content", section: "Code Highlight" },
    {
      key: "copy_to_clipboard", label: "Copy to Clipboard", type: "toggle", tab: "content", section: "Code Highlight",
      help: "Adds a Copy button on your published page. The preview here shows the code without it.",
    },
    {
      key: "highlight_lines", label: "Highlight Lines", type: "text", tab: "content", section: "Code Highlight",
      help: "Line numbers to shade, like 2,5-7.",
    },
    { key: "word_wrap", label: "Word Wrap", type: "toggle", tab: "content", section: "Code Highlight" },
    { key: "theme", label: "Theme", type: "select", tab: "content", section: "Code Highlight", options: CODE_THEMES },
    { key: "font_size", label: "Font Size", type: "number", tab: "content", section: "Code Highlight", responsive: true },
  ],
};
