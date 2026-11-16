/**
 * An agent's home on disk, as the agent alone reads it. The files it shares
 * with the `shrimpy` command, such as `agent.json`, the trigger files and the
 * wake file, are in `contracts/agent`; this adds where the agent keeps its own,
 * what its instructions, context and skills files tell the agent, read into a
 * snapshot together with the skills that ship with Shrimpy, which goes on with
 * what an earlier reading had of a file the next one leaves out, and what its
 * breadcrumbs folder holds. It writes and deletes the breadcrumbs the agent and
 * a trigger leave. It also looks at the files an agent reads, by their names,
 * sizes, modes and times and never their contents, so the agent can tell when to
 * read them again, and says what to do with storage that another version of
 * Shrimpy wrote. It must not know about the engine, the model runtime or how the
 * agent is reached.
 */
export { type BreadcrumbFile, readBreadcrumbs, removeBreadcrumb, writeBreadcrumb } from "./breadcrumbs.ts";
export { cutText, leftOutSentence, shownIn } from "./files.ts";
export { type HomePaths, homePaths, storageOfAnotherVersion } from "./layout.ts";
export { lookAtHome } from "./look.ts";
export { carryOver, type ContextFile, type HomeSnapshot, readHomeSnapshot } from "./snapshot.ts";
export type { SkillTrail } from "./skills.ts";
