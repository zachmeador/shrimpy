import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Io } from "../io/index.ts";

const REPOSITORY = "zachmeador/shrimpy";

/** The scope that every Pi package's name starts with. */
const PI_SCOPE = "@earendil-works/";

/** What curl printed for `args`, or undefined when GitHub answered that there is nothing there. */
function curl(args: string[]): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFile("curl", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) return resolve(stdout);
      if (error.code === "ENOENT") return reject(new Error("Reaching GitHub takes curl, which isn't on the PATH.", { cause: error }));
      // With -f, curl ends with 22 for an answer of 400 or more: no such release or file.
      if (error.code === 22) return resolve(undefined);
      reject(new Error(`Couldn't reach GitHub: ${stderr.trim() || error.message}`, { cause: error }));
    });
  });
}

/** The file at `path` in the tag of release `version`, or undefined when the release or the file isn't there. */
const fileAt = (version: string, path: string): Promise<string | undefined> =>
  curl(["-fsSL", `https://raw.githubusercontent.com/${REPOSITORY}/v${version}/${path}`]);

/** The version of GitHub's latest release, which skips prereleases. */
export async function latestVersion(): Promise<string> {
  const to = await curl(["-fsS", "-o", "/dev/null", "-w", "%{redirect_url}", `https://github.com/${REPOSITORY}/releases/latest`]);
  const version = /\/releases\/tag\/v([^/?#\s]+)$/.exec(to?.trim() ?? "")?.[1];
  if (version === undefined) throw new Error("Shrimpy has no release on GitHub yet.");
  return version;
}

/** One release's part of the changelog: its heading, and the lines under it but the blank ones. */
export interface Section {
  readonly version: string;
  /** The release's name, which its heading gives after the version. */
  readonly name: string | undefined;
  readonly heading: string;
  readonly lines: string[];
}

/** What a release says of itself in its package.json and its changelog. */
export interface Release {
  readonly version: string;
  readonly name: string | undefined;
  /** Each Pi package it runs, and its exact version. */
  readonly pi: Record<string, string>;
  /** Every release's part of its changelog. */
  readonly changelog: Section[];
}

/** A release's heading in the changelog: `## 🦐 1.0.0 - A Rising Tide - 2026-12-01`. */
const HEADING = /^##\s+(?:🦐\s+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?:\s+-\s+(.+?))?(?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*$/u;

/** The changelog's releases, in its order. Lines under a heading that isn't a release's, such as Unreleased, are left out. */
function sectionsOf(changelog: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const line of changelog.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const found = HEADING.exec(line);
      current =
        found?.[1] === undefined ? undefined : { version: found[1], name: found[2], heading: line.replace(/^##\s+(?:🦐\s+)?/u, ""), lines: [] };
      if (current !== undefined) sections.push(current);
    } else if (current !== undefined && line.trim() !== "") {
      current.lines.push(line);
    }
  }
  return sections;
}

/** Read release `version`'s package.json and changelog at its tag. */
export async function readRelease(version: string): Promise<Release> {
  const [manifest, changelog] = await Promise.all([fileAt(version, "package.json"), fileAt(version, "CHANGELOG.md")]);
  if (manifest === undefined) throw new Error(`There is no release ${version} on GitHub.`);
  const read = JSON.parse(manifest) as { version?: unknown; dependencies?: Record<string, unknown> };
  const own = typeof read.version === "string" ? read.version : version;
  const pi = Object.entries(read.dependencies ?? {}).filter(
    (entry): entry is [string, string] => entry[0].startsWith(PI_SCOPE) && typeof entry[1] === "string",
  );
  const sections = sectionsOf(changelog ?? "");
  return { version: own, name: sections.find((section) => section.version === own)?.name, pi: Object.fromEntries(pi), changelog: sections };
}

/** Run the install script at release `version`'s tag, passing on what it prints, and fail when it fails. */
export async function installRelease(version: string, io: Io): Promise<void> {
  const script = await fileAt(version, "scripts/install.sh");
  if (script === undefined) throw new Error(`There is no release ${version} on GitHub, or it has no install script.`);
  const child = spawn("bash", ["-c", script, "install.sh", version], { stdio: ["ignore", "pipe", "pipe"] });
  const ended = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  createInterface({ input: child.stdout }).on("line", (line) => io.out(line));
  createInterface({ input: child.stderr }).on("line", (line) => io.err(line));
  if ((await ended) !== 0) throw new Error(`Shrimpy ${version}'s install script failed, so nothing else was changed.`);
}
