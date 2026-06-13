import { delimiter } from "node:path";
import { homedir } from "node:os";

export function shrimpyBinDir(homeDir: string = homedir()): string {
  return `${homeDir}/.local/bin`;
}

export function pathWithShrimpyBin(
  pathValue: string | undefined,
  homeDir: string = homedir(),
): string {
  const binDir = shrimpyBinDir(homeDir);
  const parts = pathValue
    ? pathValue.split(delimiter).filter((part) => part.length > 0)
    : [];
  if (parts.includes(binDir)) return parts.join(delimiter);
  return [...parts, binDir].join(delimiter);
}

export function ensureShrimpyBinOnPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir(),
): void {
  env.PATH = pathWithShrimpyBin(env.PATH, homeDir);
}
