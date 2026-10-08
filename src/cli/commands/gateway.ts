import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Address, formatAddress, type Registration, type RosterEntry } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { startGateway, type WebOptions } from "../../gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { folderPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { thisAccount } from "../service/index.ts";
import { START_EVERYTHING } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { installCommands, serviceStatusLine } from "./install.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";
import { serveUntilStopped } from "./serve.ts";
import { renderTable } from "./table.ts";
import { planUp } from "./up.ts";

const serve: Command = {
  name: "gateway serve",
  usage: "--data <dir> [--listen <host:port>]... [--web-port <port>] [--web-dir <dir>]",
  summary: "Run the gateway in the foreground until it is told to stop.",
  details:
    "The gateway keeps the roster of who is on the network in the data directory, which is made if it does " +
    "not exist. Prints one JSON line when it is listening. SIGTERM or Ctrl+C stops it. The browser entry " +
    "opens, on loopback only, when --web-port is given; 0 picks a free port, and the JSON line says which. " +
    `--web-dir serves the web client's files from that directory. ${ABOUT_LISTEN} The JSON line has the ` +
    "addresses it listens on as listen, each with the port it got, and names the file as listenKept when this " +
    "start took them from it, and has null there when it did not. An address that can't be listened on stops " +
    "the start, and the error says which and why.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: {
          data: { type: "string" },
          ...LISTEN_OPTION,
          "web-port": { type: "string" },
          "web-dir": { type: "string" },
        },
        allowPositionals: true,
      }),
    );
    expectArguments(positionals, []);
    if (values.data === undefined) throw new UsageError("Missing --data.");
    if (values.data === "") throw new UsageError("--data needs a directory.");
    const dataDir = resolve(values.data);
    const listen = listenAddresses(values.listen);
    const web = webOptions(values["web-port"], values["web-dir"]);
    return serveUntilStopped(
      io,
      () => startGateway({ dataDir, web, listen }),
      ({ socket, webPort, listening, listeningAsKept }) => ({
        event: "listening",
        dataDir,
        socket,
        webPort: webPort ?? null,
        listen: listening,
        listenKept: listeningAsKept ?? null,
        pid: process.pid,
      }),
    );
  },
};

/** The browser entry the flags ask for, or undefined when there is no port to open it on. */
function webOptions(port: string | undefined, dir: string | undefined): WebOptions | undefined {
  if (port === undefined) {
    if (dir !== undefined) throw new UsageError("--web-dir needs --web-port.");
    return undefined;
  }
  if (!/^\d+$/.test(port) || Number(port) > 65_535) {
    throw new UsageError(`--web-port must be a port number from 0 to 65535, not "${port}".`);
  }
  return { port: Number(port), staticDir: dir === undefined ? undefined : resolve(dir) };
}

const status: Command = {
  name: "gateway status",
  usage: "",
  summary: "List the programs registered with this machine's gateway, and the members on its roster.",
  details:
    "The programs are listed by kind, name and version: where a program listens is told to the gateway alone. " +
    "The members are everyone the gateway knows, " +
    "people and agents, by ID, kind and name, with whether a program is registered as each. A version that " +
    "differs from this command's own is marked, and so is the gateway's, on standard error. It ends with a " +
    "line that says whether a service is installed for your Shrimpy folder, which gateway install sets up, " +
    "and whether it is running. Exits 1 if no gateway is running. When none is meant to run here, because " +
    "every agent in your Shrimpy folder belongs to a gateway elsewhere, it says where that gateway is, and " +
    "ends with the line on the service all the same.",
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
 * belong to a gateway elsewhere and none is meant to run here, where theirs is, with the line on the service. Exits 1.
 */
async function noGatewayHere(io: Io, error: GatewayNotRunningError): Promise<number> {
  const elsewhere = gatewaysElsewhere();
  if (elsewhere.length === 0) {
    throw new Error(`${error.message} Start Shrimpy with: ${START_EVERYTHING}`, { cause: error });
  }
  const where = elsewhere.map(formatAddress).join(" and ");
  io.err(
    elsewhere.length === 1
      ? `${error.message} The agents in your Shrimpy folder belong to the gateway at ${where}, so Shrimpy starts none here. ` +
          "To see what runs there, run shrimpy gateway status on that machine."
      : `${error.message} The agents in your Shrimpy folder belong to the gateways at ${where}, so Shrimpy starts none here. ` +
          "To see what runs there, run shrimpy gateway status on each of those machines.",
  );
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

export const gatewayCommands: Command[] = [serve, status, ...installCommands];
