import { isAbsolute, relative, sep } from "node:path";
import { cutEnd } from "../../lib/text/index.ts";

/** Whether `path` is inside `folder`, and not `folder` itself. */
export const isInside = (folder: string, path: string): boolean => path.startsWith(`${folder}${sep}`);

/** Where `path` is, as a left-out file says: inside `root` with `/` between folders, or its absolute path when it is not in `root`. */
export function shownIn(root: string, path: string): string {
  const inside = relative(root, path);
  const outside = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return inside === "" || outside ? path : inside.split(sep).join("/");
}

/** Marker appended by `cutText` when text is truncated at a character limit. */
export const CUT_MARKER = "\n[cut here: there is more]";

/**
 * `text` cut to at most `limit` characters, never between the two halves of a
 * character that takes two, with a last line that says it was cut. Text that
 * fits is as it is.
 */
export function cutText(text: string, limit: number): string {
  const kept = cutEnd(text, limit);
  return kept === text ? text : `${kept.trimEnd()}${CUT_MARKER}`;
}
