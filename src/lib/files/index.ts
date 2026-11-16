/**
 * Files that people and programs share, read and written with no knowledge of
 * what is in them: here, for browsers too, why a file couldn't be read in a few
 * words, a file left out and why, and the plain order names sort in; through
 * `node.ts`, reading a text file and saving one whole, so that a reader never
 * sees half of it. It must not know whose files they are or what they hold.
 */
export { codeOf, compare, type LeftOut, why } from "./files.ts";
