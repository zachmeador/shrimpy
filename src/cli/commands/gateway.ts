import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { settingsPath } from "../folder/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";
import { serveUntilStopped } from "./serve.ts";

const serve: Command = {
  name: "gateway serve",
  usage: "--data <dir> [--listen <host:port>]...",
  summary: "Run the gateway in the foreground until it is told to stop. shrimpy up starts it for you.",
  details:
    "The gateway keeps the roster of who is on the network in the data directory, which is made if it does " +
    "not exist. Your name there is set in settings.json in your Shrimpy folder, as {\"name\": \"...\"}, which the " +
    "gateway reads when it starts and whenever the file changes. The gateway's key is in state/key.pem in the data " +
    "directory, made when there is none. Prints one JSON line when it is listening. SIGTERM or " +
    `Ctrl+C stops it. ${ABOUT_LISTEN} The JSON line has the ` +
    "addresses it listens on as listen, each with the port it got, and names the file as listenKept when this " +
    "start took them from it, and has null there when it did not. It has the fingerprint of the gateway's key as " +
    "fingerprint, which every invitation's link carries. An address that can't be listened on stops " +
    "the start, and the error says which and why.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: {
          data: { type: "string" },
          ...LISTEN_OPTION,
        },
        allowPositionals: true,
      }),
    );
    expectArguments(positionals, []);
    if (values.data === undefined) throw new UsageError("Missing --data.");
    if (values.data === "") throw new UsageError("--data needs a directory.");
    const dataDir = resolve(values.data);
    const listen = listenAddresses(values.listen);
    return serveUntilStopped(
      io,
      async () => {
        // Loaded here, so that no other command loads the gateway.
        const { startGateway } = await import("../../gateway/index.ts");
        return startGateway({ dataDir, listen, settings: settingsPath() });
      },
      ({ socket, listening, listeningAsKept, fingerprint }) => ({
        event: "listening",
        dataDir,
        socket,
        listen: listening,
        listenKept: listeningAsKept ?? null,
        fingerprint,
        pid: process.pid,
      }),
    );
  },
};

export const gatewayCommands: Command[] = [serve];
