import { parseArgs } from "node:util";
import { contextOf, NO_GATEWAY, valueOf } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { listed } from "../../lib/text/index.ts";
import { agentsListed, setHomeAside } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { askGateway, homeOfMember, memberNamed, onRoster, withGatewayAsMe } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderMembers } from "./render-members.ts";

/** What an admin is, for the help of the commands that list and change them, and of the one that invites. */
export const ADMIN =
  "An admin may make rooms, add members to them, watch and control other agents' sessions and triggers, " +
  "promote, demote and remove agents, and invite agents in from elsewhere. Every person is one. The first agent to " +
  "join the gateway starts as one, and any other agent becomes one when it is promoted.";

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

/**
 * Remove the agent `name` from the roster, as whoever runs the command, then move its home out of the Shrimpy
 * folder's `agents/` when it is there. The home is looked for first, so a folder that can't be read changes nothing.
 * An agent can't remove itself: the gateway ends the agent's links as it removes it, this command's among them,
 * before the answer arrives.
 */
async function removeAgent(io: Io, name: string): Promise<number> {
  const { member, home } = await withGatewayAsMe((client) =>
    onRoster(client, async (roster) => {
      const member = memberNamed(roster.members.value, name);
      if (member.id === roster.you.value?.id) {
        const others = roster.members.value.filter((each) => each.admin && each.id !== member.id).map((each) => each.name);
        throw new Error(`An agent can't remove itself. Ask an admin: ${listed(others, "or")}.`);
      }
      const home = homeOfMember(member.id);
      valueOf(await roster.remove({ member: member.id }, contextOf()));
      return { member, home };
    }),
  );
  const off = `${member.name} is off the roster, and its name is free.`;
  if (home === undefined) {
    io.out(
      `${off} Its home isn't in ${agentsListed().where}, so it is kept where it lives. To retire it there, move the ` +
        "home out of that Shrimpy folder's agents/, and the shrimpy up running there stops it.",
    );
    return 0;
  }
  let place: string;
  try {
    place = setHomeAside(home);
  } catch (error) {
    throw new Error(
      `${off} Its home at ${home} could not be moved: ${asError(error).message}. Move it out of agents/, and a ` +
        "running shrimpy up stops it.",
      { cause: error },
    );
  }
  io.out(`${off} Its home, with every file, is now ${place}, so a running shrimpy up stops it.`);
  return 0;
}

const remove: Command = {
  name: "members remove",
  usage: "<name>",
  summary: "Remove an agent: take it off the roster, and move its home in your Shrimpy folder to removed/.",
  details:
    `${ADMIN} Anyone else who runs this is refused, with the names of the admins. The agent's tokens and ` +
    "invitations stop working at once, its name is free for another agent, and its ID is never used again. When " +
    "its home is in your Shrimpy folder's agents/, it is moved to removed/ there, so a running shrimpy up stops " +
    "the agent. A home that lives elsewhere is kept there, and moving it out of that folder's agents/ retires it. " +
    "Nothing is deleted. An agent can't remove itself.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    return removeAgent(io, name);
  },
};

export const membersCommands: Command[] = [members, promote, demote, remove];
