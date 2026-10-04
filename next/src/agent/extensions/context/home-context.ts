import { defineExtension, type Extension, section } from "@earendil-works/pi-durable";
import { homePaths, type HomeSnapshot, type LeftOut, readHomeSnapshot } from "../../home/index.ts";
import type { AgentFacts } from "./base.ts";
import { type RenderedSection, renderSections, SECTION_KEYS, type SectionKey } from "./sections.ts";

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

/** The home's context as a durable extension, and the means to read the home again. */
export interface HomeContext {
  readonly extension: Extension;
  /** What the first reading found. */
  readonly report: ContextReport;
  /**
   * Read the home's files again. Requests prepared after it render the new
   * text, and the engine adds the change to each session it reaches. Whatever
   * the sessions already hold stays as it was.
   */
  reload(): Promise<ContextReport>;
}

/** What a home would give an agent if it started now, without starting anything. */
export interface ContextPreview {
  readonly sections: readonly RenderedSection[];
  readonly leftOut: readonly LeftOut[];
}

/**
 * Read the home's files and make them the instructions of every session, as
 * prompt sections that follow the files only when the home is read again. The
 * sections hold text that is the same on every request: rendering one reads no
 * file and no clock, because the engine renders sections again after a restart
 * and after compaction.
 */
export async function homeContext(agent: AgentFacts): Promise<HomeContext> {
  const facts = factsOf(agent);
  const read = async (): Promise<{ text: ReadonlyMap<SectionKey, string>; report: ContextReport }> => {
    const snapshot = await readHomeSnapshot(homePaths(facts.home));
    return {
      text: new Map(renderSections(facts, snapshot).map(({ key, text }) => [key, text])),
      report: reportOf(snapshot),
    };
  };

  let current = await read();
  // Two reloads at once would read twice and keep whichever finished last, which may be the older reading.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    extension: defineExtension({
      name: "home-context",
      // The sections carry their own tags, so what is previewed is what the model gets.
      sections: SECTION_KEYS.map((key) => section(key, () => current.text.get(key), { tag: false })),
    }),
    report: current.report,
    reload() {
      const reloaded = queue.then(async () => {
        current = await read();
        return current.report;
      });
      queue = reloaded.catch(() => undefined);
      return reloaded;
    },
  };
}

/** The sections the home gives an agent now, read from its files and rendered as they would be for a model. */
export async function previewContext(agent: AgentFacts): Promise<ContextPreview> {
  const facts = factsOf(agent);
  const snapshot = await readHomeSnapshot(homePaths(facts.home));
  return { sections: renderSections(facts, snapshot), leftOut: snapshot.leftOut };
}

const factsOf = (agent: AgentFacts): AgentFacts => ({ name: agent.name, home: homePaths(agent.home).root });

function reportOf(snapshot: HomeSnapshot): ContextReport {
  return {
    soul: snapshot.soul !== undefined,
    files: snapshot.files.length,
    skills: snapshot.skills.length,
    leftOut: [...snapshot.leftOut],
  };
}
