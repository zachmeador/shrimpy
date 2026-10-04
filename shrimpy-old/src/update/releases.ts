import { execFileSync } from "node:child_process";

export interface TaggedRelease {
  tag: string;
  commit: string;
  version: string;
}

export type ExecFileSyncText = (
  file: string,
  args: string[],
  options: {
    encoding: "utf-8";
    stdio: ["ignore", "pipe", "pipe"];
    cwd?: string;
  },
) => string | Buffer;

export function resolveTaggedReleases(
  origin: string,
  exec: ExecFileSyncText = execFileSync,
): TaggedRelease[] {
  const output = String(exec(
    "git",
    ["ls-remote", "--tags", origin, "v*"],
    {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ));
  const commitsByTag = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const [commit, ref] = line.trim().split(/\s+/, 2);
    if (!commit || !ref?.startsWith("refs/tags/")) continue;
    const rawTag = ref.slice("refs/tags/".length);
    const peeled = rawTag.endsWith("^{}");
    const tag = peeled ? rawTag.slice(0, -3) : rawTag;
    const version = parseReleaseTag(tag);
    if (!version) continue;
    if (peeled || !commitsByTag.has(tag)) commitsByTag.set(tag, commit);
  }
  const releases = [...commitsByTag].map(([tag, commit]) => ({
    tag,
    commit,
    version: parseReleaseTag(tag)!,
  }));
  return releases.sort((left, right) =>
    compareSemver(right.version, left.version)
  );
}

export function newestTaggedRelease(
  releases: TaggedRelease[],
  currentVersion: string,
): TaggedRelease | undefined {
  if (!parseSemver(currentVersion)) {
    throw new Error(`installed Shrimpy version is not semantic: ${currentVersion}`);
  }
  return releases.find((release) =>
    compareSemver(release.version, currentVersion) > 0
  );
}

export function resolveExactTaggedRelease(
  releases: TaggedRelease[],
  tag: string,
): TaggedRelease {
  const parsed = parseReleaseTag(tag);
  if (!parsed) throw new Error(`invalid Shrimpy release tag: ${tag}`);
  const release = releases.find((candidate) => candidate.tag === tag);
  if (!release) throw new Error(`Shrimpy release tag not found at origin: ${tag}`);
  return release;
}

export function parseReleaseTag(tag: string): string | undefined {
  if (!tag.startsWith("v")) return undefined;
  const version = tag.slice(1);
  return parseSemver(version) ? version : undefined;
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new Error(`cannot compare non-semantic versions: ${left}, ${right}`);
  for (let index = 0; index < 3; index += 1) {
    const delta = a.numbers[index]! - b.numbers[index]!;
    if (delta !== 0) return delta;
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    const aNumber = numericIdentifier(aPart);
    const bNumber = numericIdentifier(bPart);
    if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
    if (aNumber !== undefined) return -1;
    if (bNumber !== undefined) return 1;
    return aPart.localeCompare(bPart);
  }
  return 0;
}

function parseSemver(
  value: string,
): { numbers: [number, number, number]; prerelease: string[] } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return undefined;
  return {
    numbers: [
      Number.parseInt(match[1]!, 10),
      Number.parseInt(match[2]!, 10),
      Number.parseInt(match[3]!, 10),
    ],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function numericIdentifier(value: string): number | undefined {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : undefined;
}
