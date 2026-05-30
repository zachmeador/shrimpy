import { parseArgs, type ParseArgsConfig } from "node:util";
import type { ShrimpyConfig } from "../config/index.js";

export type CommandHandler = (
  argv: string[],
  config: ShrimpyConfig,
) => Promise<number>;

export interface CommandInvocation {
  argv: string[];
  config: ShrimpyConfig;
  usage: string;
}

export type CommandAction = (
  invocation: CommandInvocation,
) => number | Promise<number>;

export interface CommandGroup {
  name: string;
  usage: string;
  commands: Record<string, CommandAction>;
  default?: CommandAction;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export class UsageError extends CommandError {
  constructor(message: string) {
    super(message, 1);
    this.name = "UsageError";
  }
}

export function createCommandGroup(group: CommandGroup): CommandHandler {
  return async (argv, config) => {
    const action = argv[0];

    if (!action) {
      if (group.default) {
        return group.default({
          argv: [],
          config,
          usage: group.usage,
        });
      }
      return showUsage(group.usage);
    }

    const command = group.commands[action];
    if (!command) {
      usage(group.usage, `unknown subcommand: ${action}`);
    }

    return command({
      argv: argv.slice(1),
      config,
      usage: group.usage,
    });
  };
}

export function parseCommandArgs<T extends ParseArgsConfig>(
  config: T & { usage?: string },
): ReturnType<typeof parseArgs<T>> {
  const { usage: usageText, ...parseConfig } = config;
  try {
    return parseArgs(parseConfig as T) as ReturnType<typeof parseArgs<T>>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UsageError(usageText ? `${message}\n\n${usageText}` : message);
  }
}

export function showUsage(usageText: string): number {
  console.log(usageText);
  return 0;
}

export function usage(usageText: string, detail?: string): never {
  throw new UsageError(detail ? `${detail}\n\n${usageText}` : usageText);
}

export function printError(message: string): number {
  console.error(message);
  return 1;
}

export function stripFlag(argv: string[], flag: string): {
  present: boolean;
  argv: string[];
} {
  let present = false;
  const filtered = argv.filter((arg) => {
    if (arg !== flag) return true;
    present = true;
    return false;
  });
  return { present, argv: filtered };
}

export function requireArg(
  value: string | undefined,
  usageText: string,
  label?: string,
): string {
  if (value) return value;
  usage(usageText, label ? `${label} required` : undefined);
}

export async function runCommand(
  handler: CommandHandler,
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  try {
    return await handler(argv, config);
  } catch (err) {
    if (err instanceof CommandError) {
      console.error(err.message);
      return err.exitCode;
    }
    throw err;
  }
}
