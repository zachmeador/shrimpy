/**
 * The Node-only door of shared files: reading a text file, saving one whole,
 * listing a folder, walking a folder of Markdown files and reading them, looking
 * at files without opening them, and keeping up with files by looking at them
 * again and again. Browser code must not import this file.
 */
export { type FollowFilesOptions, followFiles, type FollowingFiles } from "./follow.node.ts";
export { listFolder } from "./list.node.ts";
export { lookAtFile, lookAtMarkdown, whyNotLooked } from "./look.node.ts";
export { type MarkdownRead, readMarkdown } from "./markdown.node.ts";
export { readText } from "./read.node.ts";
export { saveFile } from "./save.node.ts";
