import { findMember, type Member } from "../../contracts/chat/index.ts";
import { howToStartAgent, NO_AGENT_YET, type Program } from "../../contracts/gateway/index.ts";
import { listed } from "../../lib/text/index.ts";
import { lookForHome } from "../folder/index.ts";

/**
 * The member called `name` on the roster, whatever the case. A name is the only
 * thing that is looked up, so that a name always means one member. When nobody
 * is called that, the error says who there is.
 */
export function memberNamed<T extends Member>(members: readonly T[], name: string): T {
  const found = findMember(members, name);
  if (found !== undefined) return found;
  throw nobodyCalled(members, [name]);
}

/**
 * The members that `names` call, each once, whatever the case. Every name is
 * checked before any is used, and the error names each one the roster does not
 * have, and says who there is.
 */
export function membersNamed(members: readonly Member[], names: string[]): Member[] {
  const found = new Map<string, Member>();
  const nobody: string[] = [];
  for (const name of names) {
    const member = findMember(members, name);
    if (member === undefined) nobody.push(name);
    else found.set(member.id, member);
  }
  if (nobody.length > 0) throw nobodyCalled(members, nobody);
  return [...found.values()];
}

function nobodyCalled(members: readonly Member[], names: string[]): Error {
  const nobody = `Nobody called ${listed(names, "or")} is on the roster.`;
  const agents = members.filter((member) => member.kind === "agent").map((member) => member.name);
  if (agents.length === 0) return new Error(`${nobody} ${NO_AGENT_YET}`);
  return new Error(`${nobody} The agents are: ${agents.join(", ")}. An agent joins when it first runs: shrimpy agent serve <agent>`);
}

/** The agent called `name` on the roster. A person called that is an error that says so. */
export function agentNamed<T extends Member>(members: readonly T[], name: string): T {
  const found = memberNamed(members, name);
  if (found.kind !== "agent") throw new Error(`${found.name} is a person, not an agent.`);
  return found;
}

/**
 * The program linked as `agent`. An agent that is not linked can't answer, so
 * when there is none the error says to start it: here, if its home is in the
 * Shrimpy folder, and where it lives if not, since an agent can be on the
 * roster with its home on another machine, or under another user, and nothing
 * here can start it.
 */
export function runningAgent(programs: readonly Program[], agent: Member): Program {
  const linked = programs.findLast((program) => program.kind === "agent" && program.member === agent.id);
  if (linked !== undefined) return linked;
  throw new Error(notRunning(agent.name));
}

/** That the agent called `name` is on the roster and not running, and how to start it: here, or where it lives. */
export const notRunning = (name: string): string =>
  `The agent ${name} is on the roster but is not running. ${howToStartAgent(name, lookForHome(name))}`;
