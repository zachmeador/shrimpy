import type { Member } from "../../contracts/chat/index.ts";
import type { Registration } from "../../contracts/gateway/index.ts";
import { START_EVERYTHING } from "./hints.ts";

/**
 * The agent called `name` on the roster, whatever the case, or its full ID. A
 * member that is not an agent, or that nobody has, is an error that says who
 * there is.
 */
export function agentNamed(members: Member[], name: string): Member {
  const wanted = name.toLowerCase();
  const found = members.find((member) => member.id === name || member.name.toLowerCase() === wanted);
  if (found?.kind === "agent") return found;
  if (found !== undefined) throw new Error(`${found.name} is a person, not an agent.`);
  const agents = members.filter((member) => member.kind === "agent").map((member) => member.name);
  const others = agents.length === 0 ? "No agent has joined yet." : `The agents are: ${agents.join(", ")}.`;
  throw new Error(
    `Nobody called ${name} is on this machine's roster. ${others} ` +
      "An agent joins when it first runs: shrimpy agent serve <home>",
  );
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
      `Start it with: shrimpy agent serve <home>, or start everything with: ${START_EVERYTHING}`,
  );
}
