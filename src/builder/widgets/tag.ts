/**
 * builder/widgets/tag.ts — THE RIBBON, DRAWN.
 *
 * What a ribbon IS — its names, its presets, its colours, the tolerant reader
 * and the one-per-row rule's vocabulary — is `./ribbon.ts`, which imports
 * nothing so that `treeOps` can read it while `render.ts` is still evaluating.
 * This file is the two functions that need the render pipeline's `esc`, and it
 * re-exports the rest so every existing caller is unchanged.
 */
import { esc } from "../esc";
import { tagOf } from "./ribbon";

export * from "./ribbon";

/**
 * The ribbon.
 *
 * `accent` is the document's own colour and is used whenever the author has
 * not picked one, so the default ribbon belongs to the brand rather than to a
 * colour somebody in here chose.
 */
export function tagHtml(
  props: Record<string, unknown> | undefined | null,
  accent: string,
  editPath = "ribbon_title",
): string {
  const tag = tagOf(props);
  if (!tag) return "";
  const colour = tag.colour || accent;
  const ink = tag.textColour ? `;color:${esc(tag.textColour)}` : "";
  const side = tag.position === "left" ? ` data-ribbon-position="left"` : "";
  return `<div class="bx-card-badge" style="background:${esc(colour)}${ink}"${side} data-edit="${esc(editPath)}">${esc(tag.text)}</div>`;
}

/** The colour a ribboned card's border takes — the ribbon's, else the accent. */
export function tagBorder(props: Record<string, unknown> | undefined | null, accent: string): string {
  const tag = tagOf(props);
  if (!tag) return "";
  return tag.colour || accent;
}
