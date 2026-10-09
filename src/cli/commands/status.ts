import { parseArgs } from "node:util";
import { type Address, formatAddress, type Registration, type RosterEntry } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { folderPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { thisAccount } from "../service/index.ts";
import { START_EVERYTHING } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { serviceStatusLine } from "./install.ts";
import { renderTable } from "./table.ts";
import { planUp } from "./up.ts";

const status: Command = {
  name: "status",
  usage: "",
  summary: "List the programs registered with this machine's gateway, and the members on its roster.",
  details:
    "The programs are listed by kind, name and version: where a program listens is told to the gateway alone. " +
    "The members are everyone the gateway knows, " +
    "people and agents, by ID, kind and name, with whether a program is registered as each. A version that " +
    "differs from this command's own is marked, and so is the gateway's, on standard error. It ends with a " +
    "line that says whether a service is installed for your Shrimpy folder, which shrimpy install sets up, " +
    "and whether it is running. If no gateway is running it says how to start Shrimpy, or, when none is meant " +
    "to run here because every agent in your Shrimpy folder belongs to a gateway elsewhere, where that " +
    "gateway is. It ends with the line on the service all the same, and exits 1.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    let inspected;
    try {
      inspected = await inspectGateway();
    } catch (error) {
      if (error instanceof GatewayNotRunningError) return noGatewayHere(io, error);
      throw error;
    }
    const { programs, members, version } = inspected;
    warnIfVersionDiffers(io, "the gateway", version);
    for (const line of renderPrograms(programs, SHRIMPY_VERSION)) io.out(line);
    io.out("");
    for (const line of renderMembers(members)) io.out(line);
    const service = await serviceStatusLine(thisAccount());
    if (service !== undefined) {
      io.out("");
      io.out(service);
    }
    return 0;
  },
};

/** What this machine's gateway says is running and who is on its roster, and the version it runs. */
async function inspectGateway(): Promise<{ programs: Registration[]; members: RosterEntry[]; version: string }> {
  const gateway = await connectLocalGateway();
  try {
    return { programs: await gateway.list(), members: await gateway.members(), version: await gateway.version() };
  } finally {
    await gateway.close().catch(() => undefined);
  }
}

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
async function noGatewayHere(io: Io, error: GatewayNotRunningError): Promise<number> {
  const elsewhere = gatewaysElsewhere();
  const where = elsewhere.map(formatAddress).join(" and ");
  if (elsewhere.length === 0) {
    io.err(`${error.message} Start Shrimpy with: ${START_EVERYTHING}`);
  } else {
    io.err(
      elsewhere.length === 1
        ? `${error.message} The agents in your Shrimpy folder belong to the gateway at ${where}, so Shrimpy starts none here. ` +
            "To see what runs there, run shrimpy status on that machine."
        : `${error.message} The agents in your Shrimpy folder belong to the gateways at ${where}, so Shrimpy starts none here. ` +
            "To see what runs there, run shrimpy status on each of those machines.",
    );
  }
  const service = await serviceStatusLine(thisAccount());
  if (service !== undefined) io.out(service);
  return 1;
}

/** The programs as a table, each one whose version is not `own` followed by a note saying so. */
function renderPrograms(programs: Registration[], own: string): string[] {
  if (programs.length === 0) return ["Programs:", "No programs are registered."];
  const rows = programs.map((program) => [program.kind, program.name, program.version]);
  const [header, ...lines] = renderTable(["kind", "name", "version"], rows);
  return [
    "Programs:",
    header ?? "",
    ...lines.map((line, index) =>
      programs[index]?.version === own ? line : `${line}  (differs from this command's ${own})`,
    ),
  ];
}

/** The roster as a table: ID, kind, name, and whether a program is registered as the member. */
function renderMembers(members: RosterEntry[]): string[] {
  const rows = members.map((member) => [member.id, member.kind, member.name, member.reachable ? "yes" : "no"]);
  return ["Members:", ...renderTable(["id", "kind", "name", "reachable"], rows)];
}

export const statusCommands: Command[] = [status];
