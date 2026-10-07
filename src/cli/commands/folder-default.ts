import { type ModelChoice, readDefaultModel } from "../../agent/index.ts";

/** The model the Shrimpy folder gives an agent that names none, from its `default-model.json`, or undefined when it names none or its file can't be read. */
export function folderDefault(file: string): ModelChoice | undefined {
  try {
    return readDefaultModel(file);
  } catch {
    // What is wrong with the file is for starting the agent to say. The home is made either way.
    return undefined;
  }
}
