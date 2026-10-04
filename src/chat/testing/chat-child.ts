/**
 * A whole chat server in its own process, for tests that kill it:
 *
 *   node chat-child.ts <dataDir>
 *
 * It puts its socket where SHRIMPY_RUNTIME_DIR says, like any chat server.
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startChat } from "../index.ts";

const [dataDir] = process.argv.slice(2);
if (dataDir === undefined) throw new Error("usage: chat-child.ts <dataDir>");

await runUntilStopped(
  () => startChat({ dataDir }),
  (chat) => ({ event: "listening", serverId: chat.serverId, socket: chat.socket, pid: process.pid }),
);
