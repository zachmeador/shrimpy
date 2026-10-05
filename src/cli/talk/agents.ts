import type { Member } from "../../contracts/chat/index.ts";
import type { Registration } from "../../contracts/gateway/index.ts";
import { START_EVERYTHING } from "./hints.ts";

/**
 * The member called `name` on the roster, whatever the case. A name is the only
 * thing that is looked up, so that a name always means one member. When nobody
 * is called that, the error says who there is.
 */
export function memberNamed(members: Member[], name: string): Member {
  const found = find(members, name);
  if (found !== undefined) return found;
  throw nobodyCalled(members, [name]);
}

/**
 * The members that `names` call, each once, whatever the case. Every name is
 * checked before any is used, and the error names each one the roster does not
 * have, and says who there is.
 */
export function membersNamed(members: Member[], names: string[]): Member[] {
  const found = new Map<string, Member>();
  const nobody: string[] = [];
  for (const name of names) {
    const member = find(members, name);
    if (member === undefined) nobody.push(name);
    else found.set(member.id, member);
  }
  if (nobody.length > 0) throw nobodyCalled(members, nobody);
  return [...found.values()];
}

function find(members: Member[], name: string): Member | undefined {
  const wanted = name.toLowerCase();
  return members.find((member) => member.name.toLowerCase() === wanted);
}

function nobodyCalled(members: Member[], names: string[]): Error {
  const agents = members.filter((member) => member.kind === "agent").map((member) => member.name);
  const others = agents.length === 0 ? "No agent has joined yet." : `The agents are: ${agents.join(", ")}.`;
  const who = names.length === 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
  return new Error(
    `Nobody called ${who} is on this machine's roster. ${others} ` +
      "An agent joins when it first runs: shrimpy agent serve <agent>",
  );
}

/** The agent called `name` on the roster. A person called that is an error that says so. */
export function agentNamed(members: Member[], name: string): Member {
  const found = memberNamed(members, name);
  if (found.kind !== "agent") throw new Error(`${found.name} is a person, not an agent.`);
  return found;
}

/**
 * The registration of `agent`, the newest if there are several. An agent that is
 * not registered can't answer, so when there is none the error says to start it.
 */
export function runningAgent(programs: Registration[], agent: Member): Registration {
  const registered = programs.findLast((program) => program.kind === "agent" && program.memberId === agent.id);
  if (registered !== undefined) return registered;
  throw new Error(
    `The agent ${agent.name} is on the roster but is not running. ` +
      `Start it with: shrimpy agent serve ${agent.name}, or start everything with: ${START_EVERYTHING}`,
  );
}
