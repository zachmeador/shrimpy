import type { Reloaded } from "../../contracts/agent/index.ts";
import { contextOf, valueOf } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";
import { type HeldAgent, onAgent } from "../talk/index.ts";
import { connectIfRunning, startOne } from "./connected.ts";
import type { Target } from "./which-agent.ts";

/** How much of each kind an agent reads from its home, which a reload and a preview both count. */
export type Read = Pick<Reloaded, "soul" | "files" | "skills" | "triggers">;

/** What was found, such as "SOUL.md, 2 context files, 1 skill and 3 triggers". */
export function whatItReads({ soul, files, skills, triggers }: Read): string {
  const parts = [
    ...(soul ? ["SOUL.md"] : []),
    ...(files > 0 ? [`${files} context ${files === 1 ? "file" : "files"}`] : []),
    ...(skills > 0 ? [`${skills} ${skills === 1 ? "skill" : "skills"}`] : []),
    ...(triggers > 0 ? [`${triggers} ${triggers === 1 ? "trigger" : "triggers"}`] : []),
  ];
  const last = parts.pop();
  if (last === undefined) return "nothing from its home's files";
  return parts.length === 0 ? last : `${parts.join(", ")} and ${last}`;
}

/** What a reload found about the model: the agent's default, and the one it replaced when it replaced one. */
function modelLine({ model, changedFrom }: Pick<Reloaded, "model" | "changedFrom">): string {
  const now = `${model.provider}/${model.id}`;
  if (changedFrom === null) return `Its default model is ${now}.`;
  return `Its default model is now ${now}, not ${changedFrom.provider}/${changedFrom.id}. Each session uses it from its next request.`;
}

/** The files an agent could not use, one to a line, each with why. */
export function leftOutLines(leftOut: readonly { file: string; reason: string }[]): string[] {
  return leftOut.map((each) => `  ${each.file}: ${each.reason}`);
}

/**
 * After a change to the files of the agent `target` names: tell a running agent
 * to read its files again, say what it reads now, and do what `then` adds with
 * the agent; or, with no agent running, say the change waits for the start,
 * with `afterStart` finishing that clause.
 */
export async function toldOfChange(
  io: Io,
  target: Target,
  options: { afterStart?: string; then?: (agent: HeldAgent) => Promise<void> } = {},
): Promise<void> {
  const reached = await connectIfRunning(target.home);
  if (reached === undefined) {
    io.out(`No agent is running at ${target.home}, so the change takes effect when the agent starts${options.afterStart ?? ""}. ${startOne(target)}`);
    return;
  }
  try {
    await onAgent(reached, async (agent) => {
      const reloaded = valueOf(await agent.reload(contextOf()));
      io.out(`Told the agent to read its files again. It now reads ${whatItReads(reloaded)}.`);
      if (reloaded.changedFrom !== null) io.out(modelLine(reloaded));
      if (reloaded.leftOut.length > 0) io.out(`Left out:\n${leftOutLines(reloaded.leftOut).join("\n")}`);
      await options.then?.(agent);
    });
  } finally {
    await reached.close().catch(() => undefined);
  }
}
