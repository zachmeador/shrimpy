/**
 * Pictures known by their bytes: whether a file is a PNG, JPEG, GIF or WebP
 * picture, and how wide and high it shows, read from how each kind starts. It
 * must not know whose pictures they are or where they go. Safe for browsers.
 */
export { type Picture, pictureOf } from "./pictures.ts";
