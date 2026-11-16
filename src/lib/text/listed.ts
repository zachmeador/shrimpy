/** Words as a sentence lists them: "a", "a and b", "a, b and c", or with "or" in place of "and". */
export function listed(words: readonly string[], joiner: "and" | "or" = "and"): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1) ?? ""}`;
}
