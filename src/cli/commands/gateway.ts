import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { startGateway, type WebOptions } from "../../gateway/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";
import { serveUntilStopped } from "./serve.ts";

const serve: Command = {
  name: "gateway serve",
  usage: "--data <dir> [--listen <host:port>]... [--web-port <port>] [--web-dir <dir>]",
  summary: "Run the gateway in the foreground until it is told to stop. shrimpy up starts it for you.",
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

export const gatewayCommands: Command[] = [serve];
