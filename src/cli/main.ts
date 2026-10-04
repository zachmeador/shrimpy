/** Runs `shrimpy`: `node src/cli/main.ts <command> [arguments]`. */
import { processIo, runCli } from "./index.ts";

process.exitCode = await runCli(process.argv.slice(2), processIo());
