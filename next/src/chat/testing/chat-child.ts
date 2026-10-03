/**
 * A whole chat server in its own process, for tests that kill it:
 *
 *   node chat-child.ts <dataDir>
 *
 * It puts its socket where SHRIMPY_RUNTIME_DIR says, like any chat server.
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { startChat } from "../index.ts";

const [dataDir] = process.argv.slice(2);
if (dataDir === undefined) throw new Error("usage: chat-child.ts <dataDir>");

const chat = await startChat({ dataDir });
process.stdout.write(`${JSON.stringify({ event: "listening", ...chat.endpoint })}\n`);

await new Promise<void>((resolve) => {
  process.once("SIGTERM", resolve);
  process.once("SIGINT", resolve);
});
await chat.close();
