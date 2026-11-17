/** Words as a sentence ends them: as they are when they end with a period, a question mark or an exclamation mark, and with a period when they don't. */
export function asSentence(words: string): string {
  return /[.!?]$/.test(words) ? words : `${words}.`;
}
