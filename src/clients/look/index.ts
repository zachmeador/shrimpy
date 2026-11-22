/**
 * How Shrimpy looks, as data that both clients draw from: the two wools, dusk
 * and day, with every color by its name, what each pigment is for, the
 * wordmark and the shrimp, and a bitmap such as a sigil as the dots and half blocks a terminal
 * draws and as the path a page fills. It must not know a terminal or a page.
 * Safe for browsers.
 */
export { dots, halves, on, path, SHRIMP, widthOf, WORDMARK } from "./bitmap.ts";
export { type Mode, type PigmentName, ROLES, type Wool, WOOLS } from "./colors.ts";
