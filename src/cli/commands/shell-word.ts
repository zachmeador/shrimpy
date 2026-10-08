/** `text` as one word of a shell: as it is when the shell reads nothing in it, and in quotes when it does, as the brackets of an IPv6 address are. */
export function shellWord(text: string): string {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}
