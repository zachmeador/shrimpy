/**
 * Text put together the one way Shrimpy writes it for a person or a shell:
 * words listed as a sentence lists them, a list cut short with how many more
 * there are, words ended as a sentence ends them or without the period that
 * ends them, or begun as one begins them, text on one line with single spaces, text cut to a length without
 * splitting a character, and a word as a shell takes it whole. It must not know
 * what the words are or who reads them. Safe for browsers.
 */
export { cutEnd, cutStart } from "./cut.ts";
export { listed, upTo } from "./listed.ts";
export { asSentence, capitalize, withoutPeriod } from "./sentence.ts";
export { shellWord } from "./shell-word.ts";
export { singleSpaced } from "./spaces.ts";
