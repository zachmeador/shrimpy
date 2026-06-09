import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const SKILLS_DIR = "skills";
export const SKILL_ENTRYPOINT = "SKILL.md";
export const SKILL_PROMPT_WARNING_THRESHOLD = 20;

export function normalizeSkillId(skillId: string): string {
  if (skillId.startsWith("/") || skillId.includes("\\") || skillId.includes("\0")) {
    throw new Error(`invalid skill id: ${skillId}`);
  }
  const segments = skillId
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("skill id is required");
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`invalid skill id: ${skillId}`);
    }
    if (segment.includes("~") || segment.includes(":")) {
      throw new Error(`invalid skill id: ${skillId}`);
    }
  }

  return segments.join("/");
}

export function skillNameForId(skillId: string): string {
  return skillId.split("/").at(-1) || skillId;
}

export function readSkillNameFromContent(content: string): string | undefined {
  return readYamlFrontmatter(content).get("name");
}

export function readSkillDescriptionFromContent(content: string): string {
  return readYamlFrontmatter(content).get("description") ?? "";
}

export function readYamlFrontmatter(content: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!content.startsWith("---\n")) return result;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return result;
  const lines = content.slice(4, end).split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result.set(key, value);
  }
  return result;
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

export function titleFromSkillName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function deriveSkillIdFromSource(sourcePath: string): string {
  const resolved = resolve(sourcePath);
  const name = existsSync(resolved) && statSync(resolved).isDirectory()
    ? basename(resolved)
    : basename(resolved) === SKILL_ENTRYPOINT
      ? basename(dirname(resolved))
      : basename(resolved).replace(/\.[^.]+$/, "");
  return normalizeSkillId(name);
}

export function deriveSkillIdFromUrl(source: string): string {
  const url = new URL(source);
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const name = lastSegment === SKILL_ENTRYPOINT
    ? segments.at(-2)
    : lastSegment.replace(/\.[^.]+$/, "");
  if (!name) {
    throw new Error(`skill URL does not include a usable skill name: ${source}`);
  }
  return normalizeSkillId(decodeURIComponent(name));
}

export function deriveSkillIdFromGitHubPath(path: string): string {
  if (!path) return "skill";
  return normalizeSkillId(path.split("/").at(-1) ?? path);
}
