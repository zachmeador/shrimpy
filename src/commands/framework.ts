import { parseArgs, type ParseArgsConfig } from "node:util";
import type { ShrimpyConfig } from "../config/load.js";
import type { CommandHandler, CommandResult } from "./contracts.js";
import {
  isHelpFlag,
  renderCommandPathHelp,
  resolveCliHelpPath,
} from "./help.js";

export type { CommandHandler, CommandResult } from "./contracts.js";

export interface CommandInvocation {
  argv: string[];
  config: ShrimpyConfig;
  usage: string;
}

type CommandAction = (
  invocation: CommandInvocation,
) => CommandResult | Promise<CommandResult>;

interface CommandGroup {
  name: string;
  path?: readonly string[];
  usage: string;
  commands: Record<string, CommandAction>;
  default?: CommandAction;
  defaultWhen?: (argv: readonly string[]) => boolean;
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
    const path = group.path ?? [group.name];

    if (isHelpFlag(action)) {
      return showUsage(renderCommandPathHelp(path));
    }

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
      if (group.default && (action.startsWith("-") || group.defaultWhen?.(argv))) {
        return group.default({
          argv,
          config,
          usage: group.usage,
        });
      }
      usage(group.usage, `unknown subcommand: ${action}`);
    }

    const helpPath = resolveCliHelpPath([...path, ...argv]);
    if (helpPath !== null) {
      const resolvedPath = helpPath.length > 0 ? helpPath : [...path, action];
      return showUsage(renderCommandPathHelp(resolvedPath));
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
    return await resolveCommandResult(await handler(argv, config), config);
  } catch (err) {
    if (err instanceof CommandError) {
      console.error(err.message);
      return err.exitCode;
    }
    throw err;
  }
}

export async function resolveCommandResult(
  result: CommandResult,
  config: ShrimpyConfig,
): Promise<number> {
  if (typeof result === "number") return result;
  if (result.kind === "shrimpy-tui") {
    const { runShrimpyTuiCommandSession } = await import("./tui.js");
    return runShrimpyTuiCommandSession(config, result.request, result.deps);
  }
  throw new Error("unknown command result");
}
