import type { ShrimpyConfig } from "../config/load.js";
import type { ShrimpyTuiCommandResult } from "./tui.js";

export type CommandResult = number | ShrimpyTuiCommandResult;

export type CommandHandler = (
  argv: string[],
  config: ShrimpyConfig,
) => CommandResult | Promise<CommandResult>;
