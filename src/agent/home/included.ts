import { fileURLToPath } from "node:url";

/**
 * The folder of the skills that ship with Shrimpy: one folder for each skill,
 * with a `SKILL.md` in it, written like the skills of a home. Every agent is
 * shown them. It is found from this file's own location, so it does not depend
 * on where a command was run or on a setting.
 */
export const INCLUDED_SKILLS = fileURLToPath(new URL("../../../skills", import.meta.url));
