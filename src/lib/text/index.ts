/**
 * Text put together the one way Shrimpy writes it for a person or a shell:
 * words listed as a sentence lists them, words ended as a sentence ends them or
 * without the period that ends them, text on one line with single spaces, and a
 * word as a shell takes it whole. It must not know what the words are or who
 * reads them. Safe for browsers.
 */
export { listed } from "./listed.ts";
export { asSentence, withoutPeriod } from "./sentence.ts";
export { shellWord } from "./shell-word.ts";
export { singleSpaced } from "./spaces.ts";
