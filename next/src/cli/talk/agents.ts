import type { Registration } from "../../contracts/gateway/index.ts";
import { START_EVERYTHING } from "./hints.ts";

/**
 * The agent called `name` among the programs the gateway lists, the newest if
 * there are several. An agent that is not registered can't answer, so when
 * there is none the error says which agents are, and what to start.
 */
export function registeredAgent(programs: Registration[], name: string): Registration {
  const agent = programs.findLast((program) => program.kind === "agent" && program.name === name);
  if (agent !== undefined) return agent;
  const names = [...new Set(programs.filter((program) => program.kind === "agent").map((program) => program.name))];
  const others = names.length === 0 ? "No agent is registered." : `Registered agents: ${names.join(", ")}.`;
  throw new Error(
    `No agent named ${name} is registered with this machine's gateway. ${others} ` +
      `Start it with: shrimpy agent serve <home>, or start everything with: ${START_EVERYTHING}`,
  );
}
