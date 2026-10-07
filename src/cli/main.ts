/** Runs `shrimpy`: `node src/cli/main.ts <command> [arguments]`. */
// First, so that it runs before anything loads SQLite.
import "./quiet.ts";
import { processIo, runCli } from "./index.ts";

process.exitCode = await runCli(process.argv.slice(2), processIo());
