import { renderShellCompletion, type CompletionShell } from "./completion-script.js";
import { renderGroupUsage } from "./catalog.js";
import {
  showUsage,
  usage,
  type CommandHandler,
} from "./framework.js";

const USAGE = renderGroupUsage("completion");

export const cmdCompletion: CommandHandler = async (argv) => {
  const shell = argv[0];
  if (!shell || shell === "--help" || shell === "-h") {
    return showUsage(USAGE);
  }
  if (shell !== "bash" && shell !== "zsh") {
    usage(USAGE, `unsupported shell: ${shell}`);
  }
  console.log(renderShellCompletion(shell as CompletionShell));
  return 0;
};
