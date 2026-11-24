/** Words as a sentence ends them: as they are when they end with a period, a question mark or an exclamation mark, and with a period when they don't. */
export function asSentence(words: string): string {
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

/** Words to start a sentence with: as they are, with their first letter a capital. */
export const capitalize = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1);

/** Words to go on inside a longer sentence: as they are, without the period that ends them if one does. */
export function withoutPeriod(words: string): string {
  return words.replace(/\.$/, "");
}
