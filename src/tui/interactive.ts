import {
  InteractiveMode,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import {
  detectTerminalBackgroundFromEnv,
  initTheme,
  resolveThemeSetting,
  setRegisteredThemes,
} from "../app/pi-internals.js";
import { assertSetupReadyForNormalTui } from "../setup/readiness.js";
import { openSessionRuntime } from "../sessions/open.js";
import {
  prepareForegroundSessionOpen,
  type OpenForegroundSessionInput,
} from "../sessions/foreground.js";
import { formatSessionId } from "../sessions/identity.js";
import { installShrimpyActivityIndicator } from "./shrimpy-activity-indicator.js";
import { installShrimpyCommandSurface } from "./shrimpy-command-surface.js";
import { installShrimpyContextRendering } from "./shrimpy-context-rendering.js";
import { installShrimpyModelSelectionGuard } from "./shrimpy-model-selection.js";
import { installShrimpySettingsSelector } from "./shrimpy-settings.js";
import { installShrimpyToolRendering } from "./shrimpy-tool-rendering.js";

export interface RunInteractiveSessionInput extends OpenForegroundSessionInput {
  initialMessage?: string;
}

export async function runInteractiveAgentSession(
  input: RunInteractiveSessionInput,
): Promise<{ agentId: string }> {
  await assertSetupReadyForNormalTui(input.runtime);
  return runAgentTuiSession(input);
}

export function primeInteractiveThemeForSession(
  session: Pick<AgentSession, "resourceLoader" | "settingsManager">,
): void {
  setRegisteredThemes(session.resourceLoader.getThemes().themes);
  initTheme(
    resolveInteractiveThemeName(session.settingsManager.getThemeSetting()),
    false,
  );
}

export function resolveInteractiveThemeName(
  themeSetting: string | undefined,
  terminalTheme: "dark" | "light" = detectTerminalBackgroundFromEnv().theme,
): string | undefined {
  return resolveThemeSetting(themeSetting, terminalTheme);
}

async function runAgentTuiSession(
  input: RunInteractiveSessionInput,
): Promise<{ agentId: string }> {
  const prepared = await prepareForegroundSessionOpen(input);
  const runtime = await openSessionRuntime(prepared.bootstrap, prepared.plan);

  try {
    primeInteractiveThemeForSession(runtime.session);
    const interactive = new InteractiveMode(runtime, {
      initialMessage: input.initialMessage,
    });
    installShrimpyActivityIndicator(interactive);
    installShrimpyCommandSurface(interactive, {
      runtime: input.runtime,
      agentId: prepared.agentId,
      sessionId: formatSessionId(prepared.plan.descriptor.key),
      purpose: prepared.plan.descriptor.purpose,
      cwd: prepared.cwd,
    });
    installShrimpyContextRendering(interactive);
    installShrimpyToolRendering(interactive);
    installShrimpyModelSelectionGuard(interactive, { runtime: input.runtime });
    installShrimpySettingsSelector(interactive, {
      runtime: input.runtime,
      agentId: prepared.agentId,
      sessionId: formatSessionId(prepared.plan.descriptor.key),
      purpose: prepared.plan.descriptor.purpose,
      cwd: prepared.cwd,
    });
    await interactive.run();
    return { agentId: prepared.agentId };
  } finally {
    await runtime.dispose();
  }
}
