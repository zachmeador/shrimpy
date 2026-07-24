import { renderShellCompletion, type CompletionShell } from "./script.js";
import { renderGroupUsage } from "../catalog.js";
import {
  installCompletion,
  resolveCompletionCachePath,
  resolveShellFromEnv,
  resolveShellProfilePath,
  writeCompletionCache,
} from "./runtime.js";
import {
  showUsage,
  usage,
  type CommandHandler,
} from "../framework.js";

const USAGE = renderGroupUsage("completion");

export const cmdCompletion: CommandHandler = async (argv) => {
  const action = argv[0];
  if (!action || action === "--help" || action === "-h") {
    return showUsage(USAGE);
  }
  if (action === "install") {
    const shell = parseCompletionShell(argv[1]);
    const result = await installCompletion(shell);
    console.log(`Installed ${shell} completion: ${result.profilePath}`);
    return 0;
  }
  if (action === "write-state") {
    const shell = parseCompletionShell(argv[1]);
    const cachePath = await writeCompletionCache(shell);
    console.log(cachePath);
    return 0;
  }
  if (action === "status") {
    const shell = parseCompletionShell(argv[1]);
    console.log(`shell: ${shell}`);
    console.log(`profile: ${resolveShellProfilePath(shell)}`);
    console.log(`cache: ${resolveCompletionCachePath(shell)}`);
    return 0;
  }
  if (action !== "bash" && action !== "zsh") {
    usage(USAGE, `unsupported shell or action: ${action}`);
  }
  console.log(renderShellCompletion(action as CompletionShell));
  return 0;
};

function parseCompletionShell(value: string | undefined): CompletionShell {
  const shell = value ?? resolveShellFromEnv() ?? "zsh";
  if (shell !== "bash" && shell !== "zsh") {
    usage(USAGE, `unsupported shell: ${shell}`);
  }
  return shell;
}
