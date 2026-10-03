import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { GatewayConnection, Registration } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { startGateway, type WebOptions } from "../../gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { serveUntilStopped } from "./serve.ts";

const serve: Command = {
  name: "gateway serve",
  usage: "[--web-port <port>] [--web-dir <dir>]",
  summary: "Run the gateway in the foreground until it is told to stop.",
  details:
    "Prints one JSON line when it is listening. SIGTERM or Ctrl+C stops it. The browser entry opens, on " +
    "loopback only, when --web-port is given; 0 picks a free port, and the JSON line says which. " +
    "--web-dir serves the web client's files from that directory.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { "web-port": { type: "string" }, "web-dir": { type: "string" } },
        allowPositionals: true,
      }),
    );
    expectArguments(positionals, []);
    const web = webOptions(values["web-port"], values["web-dir"]);
    return serveUntilStopped(
      io,
      () => startGateway({ web }),
      ({ socket, webPort }) => ({ event: "listening", socket, webPort: webPort ?? null, pid: process.pid }),
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
  summary: "List the programs registered with this machine's gateway: kind, name, version and pid.",
  details: "A version that differs from this command's own is marked. Exits 1 if no gateway is running.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    for (const line of renderPrograms(await listPrograms(), SHRIMPY_VERSION)) io.out(line);
    return 0;
  },
};

async function listPrograms(): Promise<Registration[]> {
  let gateway: GatewayConnection;
  try {
    gateway = await connectLocalGateway();
  } catch (error) {
    if (error instanceof GatewayNotRunningError) {
      throw new Error(`${error.message} Start one with: shrimpy gateway serve`, { cause: error });
    }
    throw error;
  }
  try {
    return await gateway.list();
  } finally {
    await gateway.close().catch(() => undefined);
  }
}

/** The programs as a table, each one whose version is not `own` followed by a note saying so. */
function renderPrograms(programs: Registration[], own: string): string[] {
  if (programs.length === 0) return ["No programs are registered."];
  const header = ["kind", "name", "version", "pid"];
  const rows = programs.map((program) => [program.kind, program.name, program.version, String(program.pid)]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    line(header),
    ...rows.map((row, index) => {
      const differs = programs[index]?.version !== own;
      return differs ? `${line(row)}  (differs from this command's ${own})` : line(row);
    }),
  ];
}

export const gatewayCommands: Command[] = [serve, status];
