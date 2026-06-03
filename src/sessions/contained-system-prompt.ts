import {
  formatSkillsForPrompt,
  type BuildSystemPromptOptions,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import {
  createPromptSection,
  renderPromptSections,
  type PromptSection,
} from "../context/index.js";

const CONTEXT_END_MARKER = "[end context]";

export interface ContainedSystemPromptInput {
  basePrompt: string;
  cwd: string;
  skills?: Skill[];
  selectedTools?: string[];
  now?: Date;
}

export interface ContainedSystemPrompt {
  systemPrompt: string;
  sections: PromptSection[];
}

export function buildContainedSystemPrompt(
  input: ContainedSystemPromptInput,
): ContainedSystemPrompt {
  const sections = buildContainedSystemPromptSections(input);
  return {
    sections,
    systemPrompt: appendContainedSystemPromptSections(input.basePrompt, sections),
  };
}

export function buildContainedSystemPromptFromPiOptions(
  options: BuildSystemPromptOptions,
  fallbackPrompt: string,
): string {
  return buildContainedSystemPrompt({
    basePrompt: options.customPrompt ?? fallbackPrompt,
    cwd: options.cwd,
    skills: options.skills,
    selectedTools: options.selectedTools,
  }).systemPrompt;
}

export function buildContainedSystemPromptSections(
  input: ContainedSystemPromptInput,
): PromptSection[] {
  return [
    createPromptSection({
      id: "pi:available_skills",
      title: "Available Skills",
      kind: "capability",
      source: "pi",
      reason: "Pi skill inventory",
      content: renderSkillsForSelectedTools(input.skills ?? [], input.selectedTools),
    }),
    {
      id: "pi:runtime_facts",
      title: "Pi Runtime Facts",
      kind: "runtime",
      source: "pi",
      reason: "Pi runtime prompt facts",
      content: renderPiRuntimeFacts(input.cwd, input.now),
    },
  ].filter((section): section is PromptSection => Boolean(section));
}

export function appendContainedSystemPromptSections(
  basePrompt: string,
  sections: PromptSection[],
): string {
  const renderedSections = renderPromptSections(sections);
  const body = [basePrompt.trimEnd(), renderedSections.trimEnd()]
    .filter(Boolean)
    .join("\n\n---\n\n")
    .trimEnd();
  return body ? `${body}\n\n${CONTEXT_END_MARKER}` : "";
}

function renderSkillsForSelectedTools(
  skills: Skill[],
  selectedTools: string[] | undefined,
): string | undefined {
  const hasRead = !selectedTools || selectedTools.includes("read");
  if (!hasRead) return undefined;

  const rendered = formatSkillsForPrompt(skills).trim();
  return rendered || undefined;
}

function renderPiRuntimeFacts(cwd: string, now = new Date()): string {
  return [
    `Current date: ${formatPiPromptDate(now)}`,
    `Current working directory: ${cwd.replace(/\\/g, "/")}`,
  ].join("\n");
}

function formatPiPromptDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
