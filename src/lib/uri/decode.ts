/** Undo the percent-escapes in a piece of a URL, or give undefined when they are not valid. */
export function decodeUri(piece: string): string | undefined {
  try {
    return decodeURIComponent(piece);
  } catch {
    return undefined;
  }
}
