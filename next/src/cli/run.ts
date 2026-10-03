import { type Command, loadAll, loadFamily } from "./commands/index.ts";
import type { Io } from "./io.ts";
import { UsageError } from "./usage-error.ts";

/**
 * Run `shrimpy` with the arguments after its name. The result is the exit
 * code: 0 for success, 2 when the command was used wrongly, and 1 for any
 * other failure. A command may use other codes for results it reports.
 */
export async function runCli(argv: string[], io: Io): Promise<number> {
  const [family, name, ...rest] = argv;
  if (family === undefined) {
    io.err(await overview());
    return 2;
  }
  if (family === "help" || family === "--help" || family === "-h") {
    io.out(await overview());
    return 0;
  }

  const command = (await loadFamily(family))?.find((candidate) => candidate.name === `${family} ${name}`);
  if (command === undefined) {
    io.err(`Unknown command: ${argv.filter((word) => !word.startsWith("-")).slice(0, 2).join(" ")}`);
    io.err(await overview());
    return 2;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    io.out([describe(command), "", command.summary, command.details].filter((line) => line !== undefined).join("\n"));
    return 0;
  }

  try {
    return await command.run(rest, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(error.message);
      io.err(describe(command));
      return 2;
    }
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function describe(command: Command): string {
  return `Usage: shrimpy ${command.name} ${command.usage}`;
}

async function overview(): Promise<string> {
  const lines = (await loadAll()).flatMap((command) => [
    `  ${command.name} ${command.usage}`,
    `      ${command.summary}`,
  ]);
  return ["Usage: shrimpy <command> [arguments]", "", "Commands:", ...lines].join("\n");
}
