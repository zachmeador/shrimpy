import type { Reloaded } from "../../contracts/agent/index.ts";

/** How much of each kind an agent reads from its home, which a reload and a preview both count. */
export type Read = Pick<Reloaded, "soul" | "files" | "skills" | "triggers">;

/** What was found, such as "SOUL.md, 2 context files, 1 skill and 3 triggers". */
export function whatItReads({ soul, files, skills, triggers }: Read): string {
  const parts = [
    ...(soul ? ["SOUL.md"] : []),
    ...(files > 0 ? [`${files} context ${files === 1 ? "file" : "files"}`] : []),
    ...(skills > 0 ? [`${skills} ${skills === 1 ? "skill" : "skills"}`] : []),
    ...(triggers > 0 ? [`${triggers} ${triggers === 1 ? "trigger" : "triggers"}`] : []),
  ];
  const last = parts.pop();
  if (last === undefined) return "nothing from its home's files";
  return parts.length === 0 ? last : `${parts.join(", ")} and ${last}`;
}

/** The files an agent could not use, one to a line, each with why. */
export function leftOutLines(leftOut: readonly { file: string; reason: string }[]): string[] {
  return leftOut.map((each) => `  ${each.file}: ${each.reason}`);
}
