import { defineExtension, type Extension, section } from "@earendil-works/pi-durable";
import type { LeftOut } from "../../lib/files/index.ts";
import {
  carryOver,
  digestText,
  type HomeSnapshot,
  homePaths,
  readHomeSnapshot,
  revisionOf,
  type SourceRevision,
} from "../home/index.ts";
import type { AgentFacts } from "./base.ts";
import { type ContextReport, factsOf, reportOf } from "./preview.ts";
import { renderSections, SECTION_KEYS, type SectionKey } from "./sections.ts";

/** Source revision provenance for one rendered prompt section, keyed by the section's rendered text hash. */
export interface SectionProvenance {
  readonly key: SectionKey;
  readonly sha256: string;
  readonly sources: readonly SourceRevision[];
}

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
   * The agent reads its home one reading at a time, so two never run at once.
   */
  reload(): Promise<ContextReport>;
  /**
   * Look up the source revisions for a section's rendered text, matched by
   * content hash so mid-turn reloads never misattribute an earlier reading.
   */
  provenance(key: string, text: string): SectionProvenance | undefined;
  /** Home files left out on the latest reading (carried over or omitted). */
  leftOut(): readonly LeftOut[];
}

/** Maximum distinct section revisions kept in memory for hash lookup. */
const MAX_REVISIONS = 200;

/**
 * Read the home's files, and the skills that ship with Shrimpy, and make them
 * the instructions of every session, as prompt sections that follow the files
 * only when the home is read again. The sections hold text that is the same on
 * every request: rendering one reads no file and no clock, because the engine
 * renders sections again after a restart and after compaction.
 */
export async function homeContext(agent: AgentFacts): Promise<HomeContext> {
  const facts = factsOf(agent);
  const revisions = new Map<string, SectionProvenance>();

  const remember = (key: SectionKey, text: string, sources: readonly SourceRevision[]): void => {
    const sha256 = digestText(text);
    const id = `${key}:${sha256}`;
    revisions.delete(id);
    revisions.set(id, { key, sha256, sources });
    if (revisions.size > MAX_REVISIONS) {
      const oldest = revisions.keys().next().value;
      if (oldest !== undefined) revisions.delete(oldest);
    }
  };

  /** What was read, with the text of the sections made from it; `previous` is what the agent has until this is read. */
  const read = async (
    previous?: HomeSnapshot,
  ): Promise<{ snapshot: HomeSnapshot; text: ReadonlyMap<SectionKey, string>; report: ContextReport }> => {
    const paths = homePaths(facts.home);
    const fresh = await readHomeSnapshot(paths);
    // What can't be used is not taken out of the instructions: the agent goes on with what it last read of it.
    const snapshot = previous === undefined ? fresh : carryOver(previous, fresh, paths);
    const rendered = renderSections(facts, snapshot);
    for (const { key, text } of rendered) {
      remember(key, text, sourcesFor(key, text, snapshot));
    }
    return {
      snapshot,
      text: new Map(rendered.map(({ key, text }) => [key, text])),
      report: reportOf(snapshot),
    };
  };

  let current = await read();
  return {
    extension: defineExtension({
      name: "home-context",
      // The sections carry their own tags, so what is previewed is what the model gets.
      sections: SECTION_KEYS.map((key) => section(key, () => current.text.get(key), { tag: false })),
    }),
    report: current.report,
    async reload() {
      current = await read(current.snapshot);
      return current.report;
    },
    provenance(key, text) {
      return revisions.get(`${key}:${digestText(text)}`);
    },
    leftOut() {
      return current.snapshot.leftOut;
    },
  };
}

function sourcesFor(key: SectionKey, text: string, snapshot: HomeSnapshot): SourceRevision[] {
  const rev = snapshot.revisions;
  switch (key) {
    case "shrimpy":
      return [revisionOf("shrimpy/base", text, "shrimpy", null)];
    case "soul":
      return rev?.soul === undefined ? [] : [rev.soul];
    case "workspace":
      return [...(rev?.workspace ?? [])];
    case "context":
      return [...(rev?.files ?? [])];
    case "skills":
      return snapshot.skills.flatMap((skill) => {
        const found = rev?.skills[skill.file];
        return found === undefined ? [] : [found];
      });
  }
}
