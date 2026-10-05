import { homePaths, type HomeSnapshot, type LeftOut, readHomeSnapshot } from "../home/index.ts";
import type { AgentFacts } from "./base.ts";
import { type RenderedSection, renderSections } from "./sections.ts";

/** What reading the home's files found. */
export interface ContextReport {
  /** Whether `SOUL.md` has instructions in it. */
  soul: boolean;
  /** How many Markdown files of `context/` the agent is given. */
  files: number;
  /** How many skills the agent is told about. */
  skills: number;
  /** Files that were not given, and why. */
  leftOut: LeftOut[];
}

/** What a home would give an agent if it started now, without starting anything. */
export interface ContextPreview extends ContextReport {
  readonly sections: readonly RenderedSection[];
}

/** The sections the home gives an agent now, read from its files and rendered as they would be for a model. */
export async function previewContext(agent: AgentFacts): Promise<ContextPreview> {
  const facts = factsOf(agent);
  const snapshot = await readHomeSnapshot(homePaths(facts.home));
  return { sections: renderSections(facts, snapshot), ...reportOf(snapshot) };
}

export const factsOf = (agent: AgentFacts): AgentFacts => ({ name: agent.name, home: homePaths(agent.home).root });

export function reportOf(snapshot: HomeSnapshot): ContextReport {
  return {
    soul: snapshot.soul !== undefined,
    files: snapshot.files.length,
    skills: snapshot.skills.length,
    leftOut: [...snapshot.leftOut],
  };
}
