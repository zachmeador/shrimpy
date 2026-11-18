/** Line breaks and runs of spaces made into single spaces, and nothing at either end. */
export function singleSpaced(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
