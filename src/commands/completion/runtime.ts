import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { renderShellCompletion, type CompletionShell } from "./script.js";

const COMPLETION_HEADER = "# Shrimpy Completion";

interface CompletionBootstrapResult {
  status: "installed" | "refreshed" | "skipped" | "failed";
  reason?: string;
  shell?: CompletionShell;
  profilePath?: string;
  cachePath?: string;
}

export function resolveShellFromEnv(env: NodeJS.ProcessEnv = process.env): CompletionShell | undefined {
  const shell = env.SHELL?.split("/").filter(Boolean).at(-1);
  return shell === "bash" || shell === "zsh" ? shell : undefined;
}

export function resolveCompletionCachePath(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state");
  return join(stateHome, "shrimpy", "completions", `shrimpy.${shell}`);
}

export function resolveShellProfilePath(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home = env.HOME || homedir();
  return shell === "zsh" ? join(home, ".zshrc") : join(home, ".bashrc");
}

export async function writeCompletionCache(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const cachePath = resolveCompletionCachePath(shell, env);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${renderShellCompletion(shell)}\n`, "utf-8");
  return cachePath;
}

export async function installCompletion(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ changed: boolean; profilePath: string; cachePath: string }> {
  const cachePath = await writeCompletionCache(shell, env);
  const profilePath = resolveShellProfilePath(shell, env);
  const current = existsSync(profilePath) ? await readFile(profilePath, "utf-8") : "";
  const { content, changed } = updateCompletionProfile(current, cachePath);
  if (changed) {
    await mkdir(dirname(profilePath), { recursive: true });
    await writeFile(profilePath, content, "utf-8");
  }
  return { changed, profilePath, cachePath };
}

export async function isCompletionInstalled(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const profilePath = resolveShellProfilePath(shell, env);
  if (!existsSync(profilePath)) return false;
  const cachePath = resolveCompletionCachePath(shell, env);
  const content = await readFile(profilePath, "utf-8");
  return content.split("\n").some((line) => isCompletionProfileLine(line, cachePath));
}

export async function bootstrapInteractiveCompletion(
  argv = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CompletionBootstrapResult> {
  if (env.SHRIMPY_NO_AUTO_COMPLETION === "1") {
    return { status: "skipped", reason: "disabled by SHRIMPY_NO_AUTO_COMPLETION" };
  }
  if (env.CI) {
    return { status: "skipped", reason: "CI" };
  }
  if (argv[2] === "completion") {
    return { status: "skipped", reason: "completion command" };
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { status: "skipped", reason: "non-interactive stdio" };
  }

  const shell = resolveShellFromEnv(env);
  if (shell !== "zsh") {
    return { status: "skipped", reason: "unsupported or non-zsh shell", shell };
  }

  try {
    const installed = await isCompletionInstalled(shell, env);
    if (installed) {
      const cachePath = await writeCompletionCache(shell, env);
      return {
        status: "refreshed",
        shell,
        profilePath: resolveShellProfilePath(shell, env),
        cachePath,
      };
    }

    const result = await installCompletion(shell, env);
    return {
      status: "installed",
      shell,
      profilePath: result.profilePath,
      cachePath: result.cachePath,
    };
  } catch (err) {
    return {
      status: "failed",
      shell,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateCompletionProfile(
  content: string,
  cachePath: string,
): { content: string; changed: boolean } {
  const lines = content.split("\n");
  const filtered: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === COMPLETION_HEADER) {
      index += 1;
      continue;
    }
    if (isCompletionProfileLine(line, cachePath)) continue;
    filtered.push(line);
  }

  const trimmed = filtered.join("\n").trimEnd();
  const block = `${COMPLETION_HEADER}\n[[ -r ${shellQuote(cachePath)} ]] && source ${shellQuote(cachePath)}`;
  const next = trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  return { content: next, changed: next !== content };
}

function isCompletionProfileLine(line: string, cachePath: string): boolean {
  return (
    line.trim() === COMPLETION_HEADER ||
    line.includes(cachePath) ||
    line.includes("shrimpy completion zsh") ||
    line.includes("shrimpy completion bash")
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
