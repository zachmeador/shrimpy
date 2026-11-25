/** A size in bytes as a person reads it: "812 B", "48.2 kB" or "1.3 MB". */
export function sizeWords(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
