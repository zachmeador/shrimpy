import { parseArgs } from "node:util";
import { checkAgentName } from "../../agent/index.ts";
import { type Address, type Invitation, type MachineInvitation, writeLink } from "../../contracts/gateway/index.ts";
import { isUnknownCall } from "../../lib/refusal/index.ts";
import type { Io } from "../io/index.ts";
import { withGatewayAsMe } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { ADMIN } from "./members.ts";
import { shellWord } from "./shell-word.ts";

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
      "restarts. A name another member has is refused, whatever the case, and so is a name no agent can have: it " +
      "starts with a letter or digit and has only letters, digits, dots, hyphens and underscores. The gateway has " +
      "to listen for agents apart from it, which it is told with shrimpy up --listen <host:port>: with no " +
      "address, nobody could use an invitation, and it refuses to make one. Exits 1 if no gateway is running.",
    "With no name, asks for an invitation for another machine of yours, and prints shrimpy join <link>, once " +
      "for each address the gateway listens on, to run on that machine. It lets that machine in as you, with " +
      "everything you may do, so only you can ask for it: on the gateway's machine, or on a machine of yours that " +
      "has joined. An agent is refused, an admin too. The invitation works once, for fifteen minutes, and the " +
      "gateway keeps it in memory, so one that has not been used is gone when the gateway restarts. The gateway " +
      "has to listen on an address that machine reaches, which it is told with shrimpy up --listen <host:port>. " +
      "Exits 1 if no gateway is running.",
  ].join("\n\n"),
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    if (positionals.length === 0) return inviteMachine(io);
    const [name] = expectArguments(positionals, ["<name>"]);
    // A home could not be made for any other name, so there is no use in asking.
    try {
      checkAgentName(name);
    } catch (error) {
      throw new UsageError((error as Error).message);
    }
    const invitation = await withGatewayAsMe((gateway) => gateway.invite(name));
    for (const line of invitationLines(name, invitation)) io.out(line);
    return 0;
  },
};

/** Whether `host` reaches only the machine it is used on. */
const isLoopback = (host: string): boolean => host === "localhost" || host === "::1" || host.startsWith("127.");

/** What `invite` prints: what the invitation is good for, and for each address the gateway listens on the line to run where the agent will live. */
function invitationLines(name: string, { code, addresses }: Invitation): string[] {
  const lines = [
    `The invitation works once, for fifteen minutes, and only for the name ${name}. ` +
      `Run ${addresses.length > 1 ? "one of these" : "this"} where the agent will live:`,
  ];
  const near = addresses.filter((address) => isLoopback(address.host));
  const far = addresses.filter((address) => !isLoopback(address.host));
  const group = (label: string | undefined, these: Address[]): void => {
    if (these.length === 0) return;
    lines.push("");
    if (label !== undefined) lines.push(label);
    for (const address of these) lines.push(`  shrimpy join ${shellWord(writeLink({ name, address, code }))}`);
  };
  group("As another user of this machine, since only this machine reaches a loopback address:", near);
  group(near.length > 0 ? "From another machine:" : undefined, far);
  return lines;
}

/** `invite` with no name: an invitation for another machine of the person's own, and the line to run there. */
async function inviteMachine(io: Io): Promise<number> {
  let invitation: MachineInvitation;
  try {
    invitation = await withGatewayAsMe((gateway) => gateway.inviteMachine());
  } catch (error) {
    if (!isUnknownCall(error)) throw error;
    throw new Error(
      "The gateway runs an older version of Shrimpy than this command, and does not know how to invite a machine. " +
        "Programs are meant to be upgraded together.",
      { cause: error },
    );
  }
  for (const line of machineInvitationLines(invitation)) io.out(line);
  return 0;
}

/**
 * What `invite` prints for another machine of the person's own: what the invitation is good for, and for each
 * address the gateway listens on the line to run there. A loopback address reaches only the gateway's machine, which
 * the lines say when there are others.
 */
function machineInvitationLines({ code, addresses, person }: MachineInvitation): string[] {
  const lines = [
    `The invitation works once, for fifteen minutes, and lets another machine of yours in as ${person.name}. ` +
      `Run ${addresses.length > 1 ? "one of these" : "this"} there:`,
  ];
  const near = addresses.filter((address) => isLoopback(address.host));
  const far = addresses.filter((address) => !isLoopback(address.host));
  const group = (label: string | undefined, these: Address[]): void => {
    if (these.length === 0) return;
    if (label !== undefined) lines.push("", label);
    for (const address of these) lines.push(`  shrimpy join ${shellWord(writeLink({ name: null, address, code }))}`);
  };
  group("On the gateway's machine, since only that machine reaches a loopback address:", near);
  group(near.length > 0 ? "From another machine:" : undefined, far);
  return lines;
}

export const inviteCommands: Command[] = [invite];
