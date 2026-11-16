/**
 * The Node-only door of shared files: reading a text file, and saving one
 * whole. Browser code must not import this file.
 */
export { readText } from "./read.node.ts";
export { saveFile } from "./save.node.ts";
