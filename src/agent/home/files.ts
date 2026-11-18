import { isAbsolute, relative, sep } from "node:path";
import type { LeftOut } from "../../lib/files/index.ts";
import { cutEnd } from "../../lib/text/index.ts";

/** A left-out file as a sentence, which is how the agent says it on standard error and in the breadcrumb it leaves. */
export const leftOutSentence = ({ file, reason }: LeftOut): string => `${file} was left out: ${reason}.`;

/** Where `path` is, as a left-out file says: inside `root` with `/` between folders, or its absolute path when it is not in `root`. */
export function shownIn(root: string, path: string): string {
  const inside = relative(root, path);
  const outside = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return inside === "" || outside ? path : inside.split(sep).join("/");
}

/**
 * `text` cut to at most `limit` characters, never between the two halves of a
 * character that takes two, with a last line that says it was cut. Text that
 * fits is as it is.
 */
export function cutText(text: string, limit: number): string {
  const kept = cutEnd(text, limit);
  return kept === text ? text : `${kept.trimEnd()}\n[cut here: there is more]`;
}
