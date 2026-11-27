import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getNativeClipboard } from "@earendil-works/pi-tui";
import type { FileToSend } from "../../../contracts/chat/index.ts";
import { extensionOf, mediaTypeOf } from "../../../lib/files/index.ts";
import { pictureOf } from "../../../lib/pictures/index.ts";
import { oneLine } from "../../../lib/plain/index.ts";

export interface Found {
  path: string;
  name: string;
  size: number;
}

function fileAt(path: string): Found | undefined {
  try {
    const stats = statSync(path);
    return stats.isFile() ? { path, name: basename(path), size: stats.size } : undefined;
  } catch {
    return undefined;
  }
}

export function readFound(found: Found): FileToSend | undefined {
  try {
    const bytes = new Uint8Array(readFileSync(found.path));
    return { name: found.name, mediaType: pictureOf(bytes)?.mediaType ?? mediaTypeOf(found.name), bytes };
  } catch {
    return undefined;
  }
}

export function filesPasted(text: string): Found[] | undefined {
  const words = shellWords(text);
  if (words === undefined || words.length === 0) return undefined;
  const found: Found[] = [];
  for (const word of words) {
    const path = pathOf(word);
    const file = path === undefined ? undefined : fileAt(path);
    if (file === undefined) return undefined;
    found.push(file);
  }
  return found;
}

function pathOf(word: string): string | undefined {
  if (word.startsWith("file://")) {
    try {
      return fileURLToPath(word);
    } catch {
      return undefined;
    }
  }
  return isAbsolute(word) ? word : undefined;
}

function shellWords(text: string): string[] | undefined {
  const words: string[] = [];
  let word: string | undefined;
  let quote: string | undefined;
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (char === "\\" && quote !== "'" && at + 1 < text.length) {
      at += 1;
      word = `${word ?? ""}${text.charAt(at)}`;
    } else if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else word = `${word ?? ""}${char}`;
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (/\s/.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else word = `${word ?? ""}${char}`;
  }
  if (quote !== undefined) return undefined;
  if (word !== undefined) words.push(word);
  return words;
}

export type Clipboard = { files: Found[] } | { picture: FileToSend } | { text: string } | "empty" | "unreadable";

export async function readClipboard(): Promise<Clipboard> {
  const clipboard = getNativeClipboard();
  if (clipboard === undefined) return "unreadable";
  try {
    const paths = (await clipboard.getFilePaths?.()) ?? [];
    if (paths.length > 0) return { files: paths.map(fileAt).filter((each) => each !== undefined) };
    const image = await clipboard.getImage();
    if (image) {
      const mediaType = pictureOf(image)?.mediaType ?? "image/png";
      return { picture: { name: nameFor("pasted", mediaType), mediaType, bytes: image } };
    }
    const text = await clipboard.getText();
    if (text) return { text };
    return image === undefined && text === undefined ? "unreadable" : "empty";
  } catch {
    return "unreadable";
  }
}

export const nameFor = (stem: string, mediaType: string): string => `${stem}.${extensionOf(mediaType) ?? "png"}`;

export async function openHere(name: string, bytes: Uint8Array): Promise<void> {
  const plain = basename(oneLine(name)).replace(/[\\/]/g, "_");
  const folder = await mkdtemp(join(tmpdir(), "shrimpy-"));
  const path = join(folder, plain === "" || plain === "." || plain === ".." ? "file" : plain);
  await writeFile(path, bytes);
  const viewer = spawn(process.platform === "darwin" ? "open" : "xdg-open", [path], { detached: true, stdio: "ignore" });
  viewer.on("error", () => undefined);
  viewer.unref();
}
