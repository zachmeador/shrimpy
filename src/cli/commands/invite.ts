import { parseArgs } from "node:util";
import { checkAgentName } from "../../contracts/agent/index.ts";
import { findMember } from "../../contracts/chat/index.ts";
import { type Address, contextOf, type Invitation, valueOf, writeLink, writePageLink } from "../../contracts/gateway/index.ts";
import { isLoopback } from "../../lib/link/index.ts";
import { shellWord } from "../../lib/text/index.ts";
import type { Io } from "../io/index.ts";
import { onRoster, withGatewayAsMe } from "../talk/index.ts";
import { checking, expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { ADMIN } from "./members.ts";

const invite: Command = {
  name: "invite",
  usage: "[<name>]",
  summary: "Invite an agent that will live elsewhere, or with no name another machine of yours, and print the line to run there.",
  details: [
    "With a name, asks the gateway for an invitation for an agent called <name>, as whoever runs the command: the " +
      `person who runs the gateway, or the agent whose shell it runs in. ${ADMIN} Anyone else is refused, with the ` +
      "names of the admins. It prints shrimpy join <link>, once for each address the gateway listens on, to " +
      "run where the agent will live: on another machine, in a container or as another user of the gateway's " +
      "machine, which is what a loopback address is for. The invitation works once, for fifteen minutes, and only " +
      "for that name. The gateway keeps it in memory, so one that has not been used is gone when the gateway " +
      "restarts. Naming an agent that is already on the roster makes an invitation that replaces that agent's " +
      "token and updates its gateway key when used, which covers a leaked token, a gateway whose key changed " +
      "and a home that moves to another machine. A name the person has is refused, whatever the case, and so " +
      "is a name no agent can have: it starts with a letter or digit and has only letters, digits, dots, hyphens " +
      "and underscores. The gateway has to listen for agents apart from it, which it is told with shrimpy up " +
      "--listen <host:port>: with no address, nobody could use an invitation, and it refuses to make one. " +
      "Exits 1 if no gateway is running.",
    "With no name, asks for an invitation for another machine of yours, and prints shrimpy join <link>, once " +
      "for each address the gateway listens on, to run on that machine, and a link to open in a browser, which " +
      "lets the browser in instead. It lets that machine or browser in as you, with everything you may do, so only " +
      "you can ask for it: on the gateway's machine, or on a machine of yours that has joined. An agent is refused, " +
      "an admin too. The invitation works once, for fifteen minutes, and the gateway keeps it in memory, so one that " +
      "has not been used is gone when the gateway restarts. For a machine, the gateway has to listen on an address " +
      "it reaches, which it is told with shrimpy up --listen <host:port>. For a browser, the gateway serves the web " +
      "client's page on 127.0.0.1:7448 unless settings.json says where, as shrimpy gateway serve --help has it. " +
      "Exits 1 if no gateway is running.",
  ].join("\n\n"),
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    if (positionals.length === 0) return inviteMachine(io);
    const [name] = expectArguments(positionals, ["<name>"]);
    // A home could not be made for any other name, so there is no use in asking.
    checking(() => checkAgentName(name));
    const { invitation, target, replaces } = await withGatewayAsMe((client) =>
      onRoster(client, async (roster) => {
        const existing = findMember(roster.members.value, name);
        const invitation = valueOf(await roster.invite({ name }, contextOf()));
        return {
          invitation,
          target: existing?.kind === "agent" ? existing.name : name,
          replaces: existing?.kind === "agent",
        };
      }),
    );
    const lines = invitationLines(invitation, target, {
      header: (run) =>
        replaces
          ? `${target} is already on the roster. The invitation works once, for fifteen minutes, and replaces ${target}'s token when used. Run ${run} where ${target} lives:`
          : `The invitation works once, for fifteen minutes, and only for the name ${target}. Run ${run} where the agent will live:`,
      loopback: "As another user of this machine, since only this machine reaches a loopback address:",
    });
    for (const line of lines) io.out(line);
    return 0;
  },
};

/**
 * What `invite` prints: what the invitation is good for, in `header`, which
 * is told whether there is one line to run or several, and for each address
 * the gateway listens on the line to run, which joins as `name`, or as a
 * machine of yours when it is null. A loopback address reaches only the
 * gateway's machine, which the label `loopback` says when there are others.
 */
function invitationLines(
  { code, addresses, fingerprint }: Invitation,
  name: string | null,
  words: { header: (run: string) => string; loopback: string },
): string[] {
  const lines = [words.header(addresses.length > 1 ? "one of these" : "this")];
  const near = addresses.filter((address) => isLoopback(address.host));
  const far = addresses.filter((address) => !isLoopback(address.host));
  const group = (label: string | undefined, these: Address[]): void => {
    if (these.length === 0) return;
    lines.push("");
    if (label !== undefined) lines.push(label);
    for (const address of these) lines.push(`  shrimpy join ${shellWord(writeLink({ name, address, code, fingerprint }))}`);
  };
  group(words.loopback, near);
  group(near.length > 0 ? "From another machine:" : undefined, far);
  return lines;
}

/**
 * `invite` with no name: an invitation for another machine of the person's
 * own, and the line to run there, with the link a browser opens to be let in
 * instead, when the gateway serves the page. Without an address for a machine,
 * there is only the browser's link.
 */
async function inviteMachine(io: Io): Promise<number> {
  const { invitation, person } = await withGatewayAsMe((client) =>
    onRoster(client, async (roster) => ({
      invitation: valueOf(await roster.inviteDevice(contextOf())),
      person: roster.you.value?.name ?? "you",
    })),
  );
  const lines =
    invitation.addresses.length === 0
      ? []
      : invitationLines(invitation, null, {
          header: (run) => `The invitation works once, for fifteen minutes, and lets another machine of yours in as ${person}. Run ${run} there:`,
          loopback: "On the gateway's machine, since only that machine reaches a loopback address:",
        });
  if (invitation.page !== null) {
    const host = new URL(invitation.page).hostname.replace(/^\[(.*)\]$/, "$1");
    const where = isLoopback(host) ? " on the gateway's machine, since only that machine reaches a loopback address" : "";
    if (lines.length === 0) lines.push(`The invitation works once, for fifteen minutes, and lets a browser in as ${person}. Open this in a browser${where}:`, "");
    else lines.push("", `Or open this in a browser${where}:`);
    lines.push(`  ${writePageLink(invitation.page, invitation.code)}`);
  }
  for (const line of lines) io.out(line);
  return 0;
}

export const inviteCommands: Command[] = [invite];
