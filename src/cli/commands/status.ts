import { parseArgs } from "node:util";
import {
  type Address,
  compareShrimpy,
  GATEWAY_NOT_RUNNING,
  NO_GATEWAY,
  type Program,
  type TurnedAwayProgram,
  type Versions,
  whyTurnedAway,
} from "../../contracts/gateway/index.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { listed } from "../../lib/text/index.ts";
import { folderPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { thisAccount } from "../service/index.ts";
import { askGateway } from "../talk/index.ts";
import { planUp } from "../up/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import { warnIfNewerThanGateway } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { serviceStatusLine } from "./install.ts";
import { renderMembers } from "./render-members.ts";
import { renderTable } from "./table.ts";


const status: Command = {
  name: "status",
  usage: "",
  summary: "List the programs linked to the gateway, and the members on its roster.",
  details:
    "The gateway is this machine's, or, in the shell of an agent that lives apart from it or on a machine that joined " +
    "as yours, the one that agent or machine joined. The programs are listed by kind, name and version. " +
    "The members are everyone the gateway knows, people and agents, as shrimpy members lists them: by name and " +
    "kind, with whether each is an admin, whether a program is linked as it, and its ID. A program newer " +
    "than the gateway is marked, and so is this command, on standard error, since the gateway's machine updates first. " +
    "A program the gateway turns away for the release it runs is listed after them, with what to update. It ends with a " +
    "line that says whether a service is installed for your Shrimpy folder, which shrimpy install sets up, " +
    "and whether it is running. If no gateway is running it says how to start Shrimpy, or, when none is meant " +
    "to run here because every agent in your Shrimpy folder belongs to a gateway elsewhere, where that " +
    "gateway is. It ends with the line on the service all the same, and exits 1.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    const inspected = await askGateway();
    if (inspected === undefined) return noGatewayHere(io);
    const { programs, turnedAway, members, versions } = inspected;
    warnIfNewerThanGateway(io, versions.shrimpy);
    for (const line of renderPrograms(programs, versions.shrimpy)) io.out(line);
    for (const line of renderTurnedAway(turnedAway, versions)) io.out(line);
    io.out("");
    io.out("Members:");
    for (const line of renderMembers(members)) io.out(line);
    const service = await serviceStatusLine(thisAccount());
    if (service !== undefined) {
      io.out("");
      io.out(service);
    }
    return 0;
  },
};

/** The gateways the agents of the Shrimpy folder belong to, when they all belong to one elsewhere and `up` starts none here. */
function gatewaysElsewhere(): Address[] {
  try {
    const plan = planUp([], undefined, undefined, folderPath);
    return plan?.here === undefined ? (plan?.elsewhere ?? []) : [];
  } catch {
    // A folder that can't be read has no agents to speak of, and the ordinary answer is the one to give.
    return [];
  }
}

/**
 * What to say when no gateway runs on this machine: how to start Shrimpy, or, when the agents of the Shrimpy folder
 * belong to a gateway elsewhere and none is meant to run here, where theirs is. The line on the service comes after
 * either. Exits 1.
 */
async function noGatewayHere(io: Io): Promise<number> {
  const elsewhere = gatewaysElsewhere();
  const where = listed(elsewhere.map(formatAddress));
  if (elsewhere.length === 0) {
    io.err(NO_GATEWAY);
  } else {
    io.err(
      elsewhere.length === 1
        ? `${GATEWAY_NOT_RUNNING} The agents in your Shrimpy folder belong to the gateway at ${where}, so Shrimpy starts none here. ` +
            "To see what runs there, run shrimpy status on that machine."
        : `${GATEWAY_NOT_RUNNING} The agents in your Shrimpy folder belong to the gateways at ${where}, so Shrimpy starts none here. ` +
            "To see what runs there, run shrimpy status on each of those machines.",
    );
  }
  const service = await serviceStatusLine(thisAccount());
  if (service !== undefined) io.out(service);
  return 1;
}

/** The programs as a table, each one newer than the gateway, which runs `gateway`, followed by a note saying so. */
function renderPrograms(programs: readonly Program[], gateway: string): string[] {
  if (programs.length === 0) return ["Programs:", "No programs are linked."];
  const rows = programs.map((program) => [program.kind, program.name, program.shrimpy]);
  const [header, ...lines] = renderTable(["kind", "name", "version"], rows);
  const newer = (program: Program | undefined): boolean => program !== undefined && (compareShrimpy(program.shrimpy, gateway) ?? 0) > 0;
  return [
    "Programs:",
    header ?? "",
    ...lines.map((line, index) => (newer(programs[index]) ? `${line}  (newer than the gateway's ${gateway})` : line)),
  ];
}

/** Why the gateway, which runs `gateway`, turned away each program it lists as turned away for its release. */
function renderTurnedAway(programs: readonly TurnedAwayProgram[], gateway: Versions): string[] {
  const lines = programs.flatMap((program) => whyTurnedAway(program, gateway) ?? []);
  return lines.length === 0 ? [] : ["", ...lines];
}

export const statusCommands: Command[] = [status];
