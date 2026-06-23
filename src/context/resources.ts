import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

type PromptSectionKind =
  | "identity"
  | "memory"
  | "capability"
  | "runtime"
  | "activity"
  | "evidence"
  | "instruction";

export interface PromptSection {
  id: string;
  path?: string;
  title: string;
  kind: PromptSectionKind;
  source: string;
  reason: string;
  content: string;
}

export interface PromptResourceRef {
  rootPath: string;
  resourcePath: string;
}

interface PromptSectionSummary {
  id: string;
  path: string;
  title: string;
  kind: PromptSectionKind;
  source: string;
  reason: string;
  chars: number;
  lines: number;
}

/**
 * Section order in the assembled prompt. Stable identity/memory/instructions
 * first; discoverable capabilities next; generated runtime/activity/evidence
 * last so live state stays the most recent thing the model reads.
 */
export const PROMPT_SECTION_KIND_ORDER = [
  "identity",
  "memory",
  "instruction",
  "capability",
  "runtime",
  "activity",
  "evidence",
] satisfies PromptSectionKind[];

export function readPromptResource(
  rootPath: string,
  resourcePath: string,
): string | undefined {
  const path = join(rootPath, resourcePath);
  if (!existsSync(path)) return undefined;

  if (statSync(path).isDirectory()) {
    const skillPath = join(path, "SKILL.md");
    return existsSync(skillPath) ? readFileSync(skillPath, "utf-8") : undefined;
  }

  return readFileSync(path, "utf-8");
}

/** Expand a directory resource into one ref per Markdown file, recursively. */
export function expandDirectoryResource(
  rootPath: string,
  dirResourcePath: string,
): PromptResourceRef[] {
  const dirPath = join(rootPath, dirResourcePath);
  if (!existsSync(dirPath)) return [];
  if (!statSync(dirPath).isDirectory()) return [];

  const refs: PromptResourceRef[] = [];
  collectMarkdownRefs(rootPath, dirResourcePath, refs);
  return refs.sort((a, b) => a.resourcePath.localeCompare(b.resourcePath));
}

export function createPromptSection(
  section: Omit<PromptSection, "content"> & { content?: string },
): PromptSection | undefined {
  if (!section.content) return undefined;
  return {
    ...section,
    content: section.content,
  };
}

export function promptResourceKind(resourcePath: string): PromptSectionKind {
  if (resourcePath === "context/SYSTEM.md") return "identity";
  if (resourcePath === "context/USER.md") return "identity";
  if (resourcePath === "context/WORKSPACE.md") return "identity";
  if (resourcePath.startsWith("context/") || resourcePath === "context") return "memory";
  if (resourcePath.startsWith("skills/") || resourcePath.endsWith("SKILL.md")) return "capability";
  return "identity";
}

function collectMarkdownRefs(
  rootPath: string,
  dirResourcePath: string,
  refs: PromptResourceRef[],
): void {
  const dirPath = join(rootPath, dirResourcePath);
  const entries = readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const resourcePath = join(dirResourcePath, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownRefs(rootPath, resourcePath, refs);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      refs.push({ rootPath, resourcePath });
    }
  }
}

export function promptResourceTitle(resourcePath: string): string {
  if (resourcePath.startsWith("skills/")) {
    return `Skill: ${resourcePath.slice("skills/".length)}`;
  }
  if (resourcePath.endsWith("SKILL.md")) return "Skill";
  return resourcePath;
}

export function promptResourceSectionId(
  prefix: string,
  resourcePath: string,
): string {
  return `${prefix}:${resourcePath.replaceAll(/[^A-Za-z0-9_.:-]+/g, "/")}`;
}

export function assemblePromptResourceSections(
  resources: PromptResourceRef[],
  opts?: {
    idPrefix?: string;
    reason?: string;
  },
): PromptSection[] {
  const idPrefix = opts?.idPrefix ?? "resource";
  return resources
    .map((resource) => {
      const content = readPromptResource(resource.rootPath, resource.resourcePath);
      const source = join(resource.rootPath, resource.resourcePath);
      return createPromptSection({
        id: promptResourceSectionId(idPrefix, resource.resourcePath),
        path: source,
        title: promptResourceTitle(resource.resourcePath),
        kind: promptResourceKind(resource.resourcePath),
        source,
        reason: opts?.reason ?? "Configured context resource",
        content,
      });
    })
    .filter((section): section is PromptSection => Boolean(section));
}

export function renderPromptSections(sections: PromptSection[]): string {
  return sections
    .map(renderPromptSection)
    .filter(Boolean)
    .join("\n\n");
}

export function renderPromptSection(section: PromptSection): string {
  return [
    `<context path="${promptSectionPath(section)}">`,
    section.content.trimEnd(),
    "</context>",
  ].join("\n");
}

function promptSectionPath(section: PromptSection): string {
  return section.path ?? section.source;
}

export function summarizePromptSection(section: PromptSection): PromptSectionSummary {
  return {
    id: section.id,
    path: promptSectionPath(section),
    title: section.title,
    kind: section.kind,
    source: section.source,
    reason: section.reason,
    chars: section.content.length,
    lines: section.content === "" ? 0 : section.content.split("\n").length,
  };
}

export function orderPromptSectionsByKind(sections: PromptSection[]): PromptSection[] {
  return PROMPT_SECTION_KIND_ORDER.flatMap((kind) =>
    sections.filter((section) => section.kind === kind)
  );
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function renderPromptSectionManifest(sections: PromptSection[]): string {
  const ordered = orderPromptSectionsByKind(sections);
  const summaries = ordered.map(summarizePromptSection);
  const totalChars = summaries.reduce((total, summary) => total + summary.chars, 0);
  const lines = [
    "## Prompt Sections",
    "",
    `${formatCount(summaries.length, "section")}, ${formatCount(totalChars, "char")}.`,
    "",
  ];
  for (const summary of summaries) {
    lines.push(`- ${summary.path} [${summary.kind}] ${summary.chars} chars`);
    lines.push(`  id: ${summary.id}`);
    lines.push(`  source: ${summary.source}`);
    lines.push(`  reason: ${summary.reason}`);
  }
  return lines.join("\n").trimEnd();
}
