import { singleSpaced } from "./spaces.ts";

/**
 * Split a search query into lowercase terms: space-separated words, with
 * double-quoted phrases kept together. Duplicate terms are removed in order.
 */
export function parseSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const raw = (match[1] ?? match[2] ?? "").trim().toLowerCase();
    if (raw === "" || seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }
  return terms;
}

/** Whether `text` contains every lowercase term in `terms`, case-insensitively. */
export function matchesTerms(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

/**
 * A single-line snippet of `text` centered around the first match of any term
 * in `terms`, capped to `maxChars` characters with ellipses where cut.
 */
export function snippetAround(text: string, terms: readonly string[], maxChars = 220): string {
  const flat = singleSpaced(text);
  if (flat.length <= maxChars) return flat;
  const lower = flat.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  if (first === -1) return `${flat.slice(0, maxChars - 1)}…`;
  const lead = Math.floor(maxChars * 0.35);
  let start = Math.max(0, first - lead);
  let end = start + maxChars;
  if (end > flat.length) {
    end = flat.length;
    start = Math.max(0, end - maxChars);
  }
  const body = flat.slice(start, end);
  return `${start > 0 ? "…" : ""}${body}${end < flat.length ? "…" : ""}`;
}
