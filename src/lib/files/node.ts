/**
 * The Node-only door of shared files: reading a text file, saving one whole,
 * and listing a folder. Browser code must not import this file.
 */
export { listFolder } from "./list.node.ts";
export { readText } from "./read.node.ts";
export { saveFile } from "./save.node.ts";
