import type { AppRuntime } from "../app/index.js";
import {
  isSetupReady,
  resolveSetupState,
} from "./state.js";

export const TUI_SETUP_REQUIRED_MESSAGE =
  "Shrimpy needs a usable coding model policy before opening the TUI. Run: shrimpy setup";

export async function assertSetupReadyForNormalTui(
  runtime: AppRuntime,
): Promise<void> {
  const state = await resolveSetupState(runtime.paths.workspace);
  if (!isSetupReady(state)) {
    throw new Error(TUI_SETUP_REQUIRED_MESSAGE);
  }
}
