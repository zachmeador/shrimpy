import { defineExtension, type Extension, section } from "@earendil-works/pi-durable";
import { carryOver, type HomeSnapshot, homePaths, readHomeSnapshot } from "../home/index.ts";
import type { AgentFacts } from "./base.ts";
import { type ContextReport, factsOf, reportOf } from "./preview.ts";
import { renderSections, SECTION_KEYS, type SectionKey } from "./sections.ts";

/** The home's context as a durable extension, and the means to read the home again. */
export interface HomeContext {
  readonly extension: Extension;
  /** What the first reading found. */
  readonly report: ContextReport;
  /**
   * Read the home's files again. Requests prepared after it render the new
   * text, and the engine adds the change to each session it reaches. Whatever
   * the sessions already hold stays as it was. A file, a folder of notes or a
   * skill that the reading leaves out stays as the reading before it had it.
   */
  reload(): Promise<ContextReport>;
}

/**
 * Read the home's files, and the skills that ship with Shrimpy, and make them
 * the instructions of every session, as prompt sections that follow the files
 * only when the home is read again. The sections hold text that is the same on
 * every request: rendering one reads no file and no clock, because the engine
 * renders sections again after a restart and after compaction.
 */
export async function homeContext(agent: AgentFacts): Promise<HomeContext> {
  const facts = factsOf(agent);
  /** What was read, with the text of the sections made from it; `previous` is what the agent has until this is read. */
  const read = async (
    previous?: HomeSnapshot,
  ): Promise<{ snapshot: HomeSnapshot; text: ReadonlyMap<SectionKey, string>; report: ContextReport }> => {
    const paths = homePaths(facts.home);
    const fresh = await readHomeSnapshot(paths);
    // What can't be used is not taken out of the instructions: the agent goes on with what it last read of it.
    const snapshot = previous === undefined ? fresh : carryOver(previous, fresh, paths);
    return {
      snapshot,
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
        current = await read(current.snapshot);
        return current.report;
      });
      queue = reloaded.catch(() => undefined);
      return reloaded;
    },
  };
}
