/** Words as a sentence lists them: "a", "a and b", "a, b and c", or with "or" in place of "and". */
export function listed(words: readonly string[], joiner: "and" | "or" = "and"): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1) ?? ""}`;
}

/**
 * At most `most` of `items`, 12 unless another number is given, for a list with
 * commas between them, the last of them saying how many more there are when
 * some are left out: "a", "b", "c and 3 more".
 */
export function upTo(items: readonly string[], most = 12): string[] {
  if (items.length <= most) return [...items];
  const shown = items.slice(0, most);
  return [...shown.slice(0, -1), `${shown.at(-1) ?? ""} and ${String(items.length - most)} more`];
}
