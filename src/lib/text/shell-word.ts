/** `text` as one word of a shell: as it is when the shell reads nothing in it, and in single quotes when it does. */
export function shellWord(text: string): string {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}
