import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

export function readJsonFile<T>(
  path: string,
  fallback: () => T,
  parse: (raw: unknown) => T,
): T {
  if (!existsSync(path)) return fallback();

  try {
    return parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return fallback();
  }
}

export function readJsonFileStrict<T>(
  path: string,
  parse: (raw: unknown) => T,
): T {
  return parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function writeJsonFileAtomic(
  path: string,
  data: unknown,
  opts?: {
    trailingNewline?: boolean;
    mode?: number;
  },
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  const tmpPath = join(
    dir,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const trailingNewline = opts?.trailingNewline ?? true;
  const content = JSON.stringify(data, null, 2) + (trailingNewline ? "\n" : "");

  try {
    writeFileSync(tmpPath, content, {
      encoding: "utf-8",
      ...(opts?.mode === undefined ? {} : { mode: opts.mode }),
    });
    renameSync(tmpPath, path);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup only; preserve the original write failure.
    }
    throw err;
  }
}
