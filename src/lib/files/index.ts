/**
 * Files that people and programs share, read and written with no knowledge of
 * what is in them: here, for browsers too, why a file couldn't be read, or an
 * entry a folder lists looked at, in a few words, a file left out and why, said
 * as a sentence, a Markdown file as it was read and which of those a reader goes on with when it
 * can't read them now, the plain order names sort in, and whether a name is a
 * Markdown file's, and the media type a file's name says and the extension a
 * media type is named with; through `node.ts`, reading a text file, saving one whole, so
 * that a reader never sees half of it, listing a folder without its hidden
 * entries, reading the Markdown files under a folder, looking at files by their
 * sizes, modes and times, and reading files again when a look finds them
 * changed. It must not know whose files they are or what they hold.
 */
export {
  codeOf,
  compare,
  isMarkdown,
  type LeftOut,
  leftOutSentence,
  type MarkdownFile,
  stillHeld,
  stillKept,
  takesIn,
  why,
  whyUnseen,
} from "./files.ts";
export { extensionOf, mediaTypeOf } from "./media.ts";
