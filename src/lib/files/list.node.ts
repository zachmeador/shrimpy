import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { compare } from "./files.ts";

/**
 * The entries of `folder` in the plain order of their names, leaving out the
 * hidden ones, whose names start with a dot, and any whose name `keep` turns
 * down. It fails as reading the folder fails.
 */
export async function listFolder(folder: string, keep: (name: string) => boolean = () => true): Promise<Dirent[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries.filter((entry) => !entry.name.startsWith(".") && keep(entry.name)).sort((a, b) => compare(a.name, b.name));
}
