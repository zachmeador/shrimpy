/**
 * Files that people and programs share, read and written with no knowledge of
 * what is in them: here, for browsers too, why a file couldn't be read, or an
 * entry a folder lists looked at, in a few words, a file left out and why, the
 * plain order names sort in, and whether a name is a Markdown file's; through
 * `node.ts`, reading a text file, saving one whole, so that a reader never sees
 * half of it, and listing a folder without its hidden entries. It must not know
 * whose files they are or what they hold.
 */
export { codeOf, compare, isMarkdown, type LeftOut, why, whyUnseen } from "./files.ts";
