import { parseArgs } from "node:util";
import { contextOf, valueOf } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";
import { askGateway, memberNamed, NO_GATEWAY, onRoster, withGatewayAsMe } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderMembers } from "./render-members.ts";

/** What an admin is, for the help of the commands that list and change them, and of the one that invites. */
export const ADMIN =
  "An admin may make rooms, add members to them, watch and control other agents' sessions and triggers, " +
  "promote and demote agents, and invite agents in from elsewhere. Every person is one. The first agent to join " +
  "the gateway starts as one, and any other agent becomes one when it is promoted.";

const members: Command = {
  name: "members",
  usage: "",
  summary: "List the roster: each member's kind, whether it is an admin, and whether a program is running as it.",
  details: `${ADMIN} Members are listed oldest first, each with its ID. Exits 1 if no gateway is running.`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    const view = await askGateway();
    if (view === undefined) throw new Error(NO_GATEWAY);
    for (const line of renderMembers(view.members)) io.out(line);
    return 0;
  },
};

/**
 * Make the member `name` an admin or an ordinary agent again, as whoever runs the command: the person who runs the
 * gateway, or the agent whose shell it is. Anyone else than a person or an admin is refused by the gateway, which
 * says who the admins are.
 */
async function changeRole(io: Io, name: string, admin: boolean): Promise<number> {
  await withGatewayAsMe((client) =>
    onRoster(client, async (roster) => {
      const member = memberNamed(roster.members.value, name);
      if (member.admin === admin) {
        io.out(admin ? `${member.name} is an admin already.` : `${member.name} is not an admin.`);
        return;
      }
      const asked = { member: member.id };
      valueOf(admin ? await roster.promote(asked, contextOf()) : await roster.demote(asked, contextOf()));
      io.out(admin ? `${member.name} is an admin now.` : `${member.name} is no longer an admin.`);
    }),
  );
  return 0;
}

const promote: Command = {
  name: "members promote",
  usage: "<name>",
  summary: "Make an agent an admin.",
  details:
    `${ADMIN} Anyone else who runs this is refused, with the names of the admins. It counts at once for the ` +
    "gateway and the chat server, and for an agent from the next connection to it.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    return changeRole(io, name, true);
  },
};

const demote: Command = {
  name: "members demote",
  usage: "<name>",
  summary: "Make an admin agent an ordinary agent again.",
  details: `${ADMIN} Anyone else who runs this is refused. A person is an admin always, and can't be demoted.`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    return changeRole(io, name, false);
  },
};

export const membersCommands: Command[] = [members, promote, demote];
