/*
 * Every sentence the model reads from `ask_agent`: what it is for, what its
 * arguments mean, and what it answers. Nothing else in this module writes words
 * for the model.
 */
import { localTime } from "../../lib/time/index.ts";
import { delayText } from "../home/index.ts";

export const ASK_DESCRIPTION =
  "Ask another agent a question, and carry on with its answer. Use it when you need that agent's answer to go on " +
  "with what you are doing here. The question is posted in a new thread of your DM with the agent, and this answers at once: " +
  "end your turn, and the answer comes to you in this same conversation as a new input. You are also told if the " +
  "agent read the question and said nothing, if its turn failed, or if it hasn't answered in time. The agent sees " +
  "nothing of this conversation, so write the question to stand alone. Only an agent can be asked: to tell a " +
  "person something, use send_message.";
export const ASK_TO = "Who to ask: @name, such as @maya, the name of an agent.";
export const ASK_TEXT = "The question. The agent sees nothing of this conversation, so write it to stand alone.";
export const ASK_WITHIN =
  "How long to wait for the answer: a whole number and a unit, s, m, h or d, such as 30m, 2h or 1d. " +
  "It can be from 1m to 1d, and is 30m if you leave it out.";

export const TEXT_EMPTY = "Not asked: write the question.";
export const BAD_TO = "Not asked: to should be @name, such as @maya, the name of an agent.";

export const badWithin = (text: string): string =>
  `Not asked: within: "${text}" is not a delay I can read. Write a whole number and a unit: 30m, 2h or 1d.`;

export const tooSoon = (shortest: number): string =>
  `Not asked: the shortest wait is ${delayText(shortest)}. Give a longer one.`;

export const tooFar = (longest: number): string => `Not asked: the longest wait is ${delayText(longest)}. Give a shorter one.`;

export const noRoster = (name: string): string =>
  `Not asked: can't look up @${name}, because the gateway is unreachable right now. Try again later.`;

export function nobody(name: string, agents: string[]): string {
  const known = agents.length === 0 ? "There are no other agents." : `The agents you can ask: ${agents.join(", ")}.`;
  return `Not asked: nobody is called @${name}. ${known}`;
}

export const aPerson = (name: string): string =>
  `Not asked: @${name} is a person, and a person leaves nothing that says they have answered. ` +
  "Use send_message to write to them, and carry on when they write back.";

export const yourself = (name: string): string => `Not asked: @${name} is you. Ask another agent.`;

export const tooMany = (open: number): string =>
  `Not asked: ${open} of your questions in this conversation are already waiting for answers, which is the most there can be. ` +
  "Wait for one of them to come back first.";

export const UNREACHABLE = "Not asked: chat is unreachable right now, so nothing was posted. Try again later.";

export const refused = (reason: string): string => `Not asked: chat did not accept it (${reason}).`;

export const uncertain = (name: string): string =>
  "Chat dropped the connection before it confirmed the question, so it may or may not have been posted. " +
  `To check before you ask again, run \`shrimpy threads ${name}\` in your shell: the question's thread is named for how it starts.`;

export const asked = (name: string, due: number): string =>
  `Asked @${name}. The answer comes to you here as a new input, and if there is none by ${localTime(due)} you are told that instead. ` +
  "You can end your turn now.";
