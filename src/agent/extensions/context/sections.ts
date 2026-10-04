import type { HomeSnapshot } from "../../home/index.ts";
import { type AgentFacts, baseInstructions } from "./base.ts";

/** The sections, in the order the model reads them. */
export const SECTION_KEYS = ["shrimpy", "soul", "context", "skills"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** A section as the model gets it, its tags included. */
export interface RenderedSection {
  readonly key: SectionKey;
  readonly text: string;
}

/**
 * The text of each section for a snapshot of the home, in order. A section with
 * nothing to say is left out. This is a pure function of its arguments, so the
 * same snapshot always gives the same text, and no request reads a file.
 */
export function renderSections(agent: AgentFacts, snapshot: HomeSnapshot): RenderedSection[] {
  const bodies: Record<SectionKey, string | undefined> = {
    shrimpy: baseInstructions(agent),
    soul: snapshot.soul?.trim(),
    context: contextBody(snapshot),
    skills: skillsBody(snapshot),
  };
  return SECTION_KEYS.flatMap((key) => {
    const body = bodies[key];
    return body === undefined || body === "" ? [] : [{ key, text: `<${key}>\n${body}\n</${key}>` }];
  });
}

function contextBody(snapshot: HomeSnapshot): string | undefined {
  if (snapshot.files.length === 0) return undefined;
  return snapshot.files
    .map((file) => `<file path="${file.path.replaceAll('"', "&quot;")}">\n${file.text.trim()}\n</file>`)
    .join("\n");
}

function skillsBody(snapshot: HomeSnapshot): string | undefined {
  if (snapshot.skills.length === 0) return undefined;
  return snapshot.skills.map((skill) => `- ${skill.name}: ${skill.description}\n  ${skill.file}`).join("\n");
}
