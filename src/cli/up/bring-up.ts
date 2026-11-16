import { formatAddress } from "../../lib/link/index.ts";
import { listed } from "../../lib/text/index.ts";
import { allHomes } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd } from "../programs/index.ts";
import { startAgent } from "./agents.ts";
import { type Follower, follow } from "./follow.ts";
import { startGatewayAndChat } from "./here.ts";
import { capitalize, type Started } from "./launch.ts";
import type { Pace } from "./pace.ts";
import type { Plan } from "./plan.ts";
import { type StopWatch, stopAll, watchForStop } from "./stop.ts";

/**
 * Start what `plan` says is missing and keep it running until `up` is asked to
 * stop or a program it must keep ends, then stop what it started. The result
 * is the exit code: 1 when a program ended in a way a stop does not explain.
 */
export async function bringUp(io: Io, plan: Plan, pace: Pace): Promise<number> {
  const crew: Started[] = [];
  const stop = watchForStop(io, crew);
  let failure: unknown;
  try {
    await keepUp(io, plan, crew, stop, pace);
  } catch (error) {
    failure = error;
  }
  const abnormal = await stopAll(io, crew, stop.requests() >= 3);
  stop.release();
  // A stop request is why an error that came with it, such as an abandoned lookup, happened.
  if (failure !== undefined && stop.requests() === 0) throw failure as Error;
  return abnormal ? 1 : 0;
}

/**
 * Start what is missing, and wait until `up` is asked to stop or one of the
 * programs it must keep ends: any of them when agents were named, and the
 * gateway or the chat server when it follows the folder, where an agent that
 * ends is started again. Whatever was started is in `crew` even when this
 * throws, so the caller can stop it.
 */
async function keepUp(io: Io, plan: Plan, crew: Started[], stop: StopWatch, pace: Pace): Promise<void> {
  let folder: Follower | undefined;
  try {
    await startMissing(io, plan, crew, stop);
    if (stop.requests() > 0) return;
    folder = plan.follow ? follow({ io, crew, pace, homes: allHomes }) : undefined;
    await folder?.look();
    if (stop.requests() > 0) return;
    if (crew.length === 0 && folder?.waiting() !== true) {
      io.out("Everything is already running.");
      return;
    }
    sayRunning(io, plan, crew, folder !== undefined);
    const ended = await Promise.race([
      stop.asked.then(() => undefined),
      ...crew
        .filter((member) => folder === undefined || member.role !== "agent")
        .map((member) => member.program.ended.then(() => member)),
    ]);
    if (ended !== undefined) {
      ended.endedByItself = true;
      const how = describeEnd(await ended.program.ended);
      throw new Error(`${capitalize(ended.what)} stopped by itself (${how}), so the rest was stopped.`);
    }
  } finally {
    await folder?.close();
  }
}

/** That everything runs, and how to use it: from here, or from the gateway's machine when the agents belong to one elsewhere. */
function sayRunning(io: Io, plan: Plan, crew: Started[], following: boolean): void {
  const agent = crew.find((member) => member.role === "agent")?.program.listening.name;
  io.out("Running. Press Ctrl+C to stop what this command started.");
  if (plan.here === undefined) {
    // There is no gateway here to ask, so these agents are talked to where the gateway is.
    const where = listed(plan.elsewhere.map(formatAddress));
    io.out(
      plan.elsewhere.length === 1
        ? `These agents belong to the gateway at ${where}, so you talk to them from that gateway's machine.`
        : `These agents belong to the gateways at ${where}, so you talk to each from its gateway's machine.`,
    );
  } else {
    if (plan.homes.length > 0) io.out(`Talk to an agent with: shrimpy run ${agent ?? "<agent>"} "<text>"`);
    else io.out("Let an agent in from another machine or user with: shrimpy invite <name>");
    io.out("See what is running with: shrimpy status");
  }
  if (following) io.out("An agent made in your Shrimpy folder starts by itself, and one that stops is started again.");
}

/**
 * Start the gateway and the chat server, whichever is not already running, and
 * the agents that were named. Agents that were not named are the folder's to
 * keep running, which comes after.
 */
async function startMissing(io: Io, plan: Plan, crew: Started[], stop: StopWatch): Promise<void> {
  if (plan.here === undefined) {
    io.out("Every agent here belongs to a gateway elsewhere, so no gateway or chat server is started on this machine.");
  } else {
    await startGatewayAndChat(io, plan.here, crew, stop);
    if (stop.requests() > 0) return;
  }
  if (plan.follow) return;

  const agents = await Promise.allSettled(plan.homes.map((home) => startAgent(io, home)));
  let failed: PromiseRejectedResult | undefined;
  for (const result of agents) {
    if (result.status === "rejected") {
      failed ??= result;
      continue;
    }
    if (result.value.started !== undefined) crew.push(result.value.started);
    io.out(result.value.line);
  }
  if (failed !== undefined) throw failed.reason;
}
