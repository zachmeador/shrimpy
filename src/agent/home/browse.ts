import { constants, type Stats } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { type HomeEntry, type HomeFile, MAX_IMAGE_BYTES, MAX_TEXT_BYTES } from "../../contracts/agent/index.ts";
import { codeOf, compare, why } from "../../lib/files/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { isInside } from "./files.ts";
import type { HomePaths } from "./layout.ts";

/** The folders at the top of a home that hold what the agent needs to run, which are never listed or shown. */
const KEPT = ["state", "runtime"];

const megabytes = (bytes: number): string => `${String(bytes / 1_000_000)} MB`;

const outside = (path: string): string => `${path} is outside the home, and only the home's files are shown.`;
const KEPT_WORDS = "Nothing in state/ or runtime/ is shown: they hold what the agent needs to run, such as its token.";
const missing = (path: string): string => `There is no ${path} in the home.`;
const unreadable = (path: string, error: unknown): string => `${path} can't be read: ${why(error)}.`;
const notAFolder = (path: string): string => `${path} is not a folder.`;
const notAFile = (path: string): string => `${path} is not a file.`;
const tooBig = (path: string): string =>
  `${path} is too big to show: text is shown up to ${megabytes(MAX_TEXT_BYTES)} and an image up to ${megabytes(MAX_IMAGE_BYTES)}.`;
const notShown = (path: string): string => `${path} is not text or a PNG, JPEG, GIF or WebP image, so it isn't shown.`;

/** Where the home is, with every link followed, and which paths in it are shown. */
interface Shown {
  /** The home's own path, with every link in it followed. */
  readonly root: string;
  /** Whether a path, with every link in it followed, is in the home and outside `state/` and `runtime/`. */
  shows(real: string): boolean;
  /** Whether it is in `state/` or `runtime/`. */
  keeps(real: string): boolean;
}

const within = (folder: string, path: string): boolean => path === folder || isInside(folder, path);

async function shownOf(paths: HomePaths): Promise<Shown> {
  const root = await realpath(paths.root);
  const kept = await Promise.all(KEPT.map((name) => realpath(join(paths.root, name)).catch(() => join(root, name))));
  const keeps = (real: string): boolean => kept.some((folder) => within(folder, real));
  return { root, keeps, shows: (real) => within(root, real) && !keeps(real) };
}

/** Something in the home that is shown: where it is with every link followed, and what it is. */
interface Found {
  readonly shown: Shown;
  readonly real: string;
  readonly info: Stats;
  /** How the path is written in what the agent says. */
  readonly named: string;
}

/**
 * What `path` names in the home: a path inside it with `/` between folders,
 * `""` for the home itself. It is refused when it leads out of the home, by
 * `..`, from `/` or through a link, when it leads into `state/` or `runtime/`,
 * and when there is nothing there.
 */
async function find(paths: HomePaths, path: string): Promise<Found> {
  if (path.startsWith("/")) refuse(outside(path));
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.includes("..")) refuse(outside(path));
  if (KEPT.includes(parts[0] ?? "")) refuse(KEPT_WORDS);
  const named = parts.length === 0 ? "The home" : parts.join("/");
  if (path.includes("\0")) refuse(missing(named));
  const shown = await shownOf(paths);
  let real: string;
  let info: Stats;
  try {
    real = await realpath(join(paths.root, ...parts));
    info = await stat(real);
  } catch (error) {
    refuse(codeOf(error) === "ENOENT" ? missing(named) : unreadable(named, error));
  }
  if (shown.keeps(real)) refuse(KEPT_WORDS);
  if (!shown.shows(real)) refuse(outside(named));
  return { shown, real, info, named };
}

/**
 * The entries of the folder at `path` in the home, in order of name, with
 * `state/` and `runtime/` left out of the home's own. An entry is a folder or a
 * file when it, or what its link leads to, is one that is shown, and anything
 * else is listed as other and never followed.
 */
export async function folderAt(paths: HomePaths, path: string): Promise<HomeEntry[]> {
  const { shown, real, info, named } = await find(paths, path);
  if (!info.isDirectory()) refuse(notAFolder(named));
  let names: string[];
  try {
    names = await readdir(real);
  } catch (error) {
    refuse(unreadable(named, error));
  }
  const listed = real === shown.root ? names.filter((name) => !KEPT.includes(name)) : names;
  const entries = await Promise.all(listed.map((name) => entryOf(shown, join(real, name), name)));
  return entries.sort((a, b) => compare(a.name, b.name));
}

async function entryOf(shown: Shown, path: string, name: string): Promise<HomeEntry> {
  try {
    const real = await realpath(path);
    if (shown.shows(real)) {
      const info = await stat(real);
      if (info.isDirectory()) return { name, kind: "folder", size: null };
      if (info.isFile()) return { name, kind: "file", size: info.size };
    }
  } catch {
    // A link to nothing, or an entry that can't be looked at, is something other than a folder or a file to open.
  }
  return { name, kind: "other", size: null };
}

/** How much of a file is looked at to tell whether it is text, before it is decoded whole. */
const LOOK_AT = 64 * 1024;

/**
 * The file at `path` in the home, as `folderAt` takes a path: an image when it
 * starts as a PNG, JPEG, GIF or WebP does, up to `MAX_IMAGE_BYTES`, or text
 * when it is UTF-8 with no NUL in it, up to `MAX_TEXT_BYTES`. Anything else is
 * refused with why.
 */
export async function fileAt(paths: HomePaths, path: string): Promise<HomeFile> {
  const { real, info, named } = await find(paths, path);
  if (!info.isFile()) refuse(info.isDirectory() ? `${named} is a folder, not a file.` : notAFile(named));
  if (info.size > MAX_IMAGE_BYTES) refuse(tooBig(named));
  let bytes: Buffer | undefined;
  let problem = notAFile(named);
  try {
    // The path has every link followed already, so a link put in its place since is not followed either.
    const handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.isFile() && opened.size > MAX_IMAGE_BYTES) problem = tooBig(named);
      else if (opened.isFile()) bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch (error) {
    refuse(unreadable(named, error));
  }
  if (bytes === undefined) refuse(problem);
  if (bytes.length > MAX_IMAGE_BYTES) refuse(tooBig(named));
  const image = imageType(bytes);
  if (image !== undefined) return { kind: "image", mediaType: image, data: bytes.toString("base64") };
  if (!startsAsText(bytes.subarray(0, LOOK_AT))) refuse(notShown(named));
  if (bytes.length > MAX_TEXT_BYTES) refuse(tooBig(named));
  try {
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    refuse(notShown(named));
  }
}

type ImageType = Extract<HomeFile, { kind: "image" }>["mediaType"];

/** The kind of image `bytes` are, by how each kind starts, or undefined for none of them. */
function imageType(bytes: Buffer): ImageType | undefined {
  const startsWith = (at: number, ...values: number[]): boolean => values.every((value, index) => bytes[at + index] === value);
  const says = (at: number, text: string): boolean => bytes.toString("latin1", at, at + text.length) === text;
  if (startsWith(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (says(0, "GIF87a") || says(0, "GIF89a")) return "image/gif";
  if (says(0, "RIFF") && says(8, "WEBP")) return "image/webp";
  return undefined;
}

/** Whether the start of a file reads as UTF-8 text, with no NUL in it. A character cut at the end of it doesn't count. */
function startsAsText(start: Buffer): boolean {
  if (start.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(start, { stream: true });
    return true;
  } catch {
    return false;
  }
}
