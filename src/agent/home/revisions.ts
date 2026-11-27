import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

/** Where a prompt section's source text came from. */
export type SourceOrigin = "shrimpy" | "home" | "workspace" | "shipped";

/** Revision metadata for one source file or built-in text that contributed to a prompt section. */
export interface SourceRevision {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mtimeMs: number | null;
  readonly origin: SourceOrigin;
  readonly carriedOver: boolean;
}

/** Source revisions captured during one reading of a home. */
export interface HomeRevisions {
  readonly soul?: SourceRevision;
  readonly workspace: readonly SourceRevision[];
  readonly files: readonly SourceRevision[];
  /** Keyed by skill's absolute `SKILL.md` path. */
  readonly skills: Readonly<Record<string, SourceRevision>>;
}

/** First 16 hex characters of the UTF-8 SHA-256 digest of `text`. */
export function digestText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Best-effort file modification time in integer epoch milliseconds, or null when unavailable. */
export async function mtimeOf(path: string): Promise<number | null> {
  try {
    return Math.trunc((await stat(path)).mtimeMs);
  } catch {
    return null;
  }
}

/** Build revision metadata for one source text. */
export function revisionOf(
  path: string,
  text: string,
  origin: SourceOrigin,
  mtimeMs: number | null,
  carriedOver = false,
): SourceRevision {
  return {
    path,
    sha256: digestText(text),
    bytes: Buffer.byteLength(text, "utf8"),
    mtimeMs,
    origin,
    carriedOver,
  };
}
