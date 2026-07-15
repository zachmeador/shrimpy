import {
  InteractiveMode,
  type AgentSession,
  type AgentSessionRuntime,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import {
  detectTerminalBackgroundFromEnv,
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
import { createShrimpyTuiCommandExtensionFactory } from "./shrimpy-commands.js";
import { createShrimpyFooterExtensionFactory } from "./shrimpy-footer.js";
import { installShrimpyInlineCommands } from "./shrimpy-inline-commands.js";
import { installShrimpyModelSelectionGuard } from "./shrimpy-model-selection.js";
import {
  createShrimpySettingsUiController,
  installShrimpySettingsSelector,
} from "./shrimpy-settings.js";
import { installShrimpyTurnContextRendering } from "./shrimpy-turn-context-rendering.js";

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
  const sessionId = formatSessionId(prepared.plan.descriptor.key);
  const sessionRuntime: { current?: AgentSessionRuntime } = {};
  const settingsUi = createShrimpySettingsUiController();
  const commandOptions = {
    runtime: input.runtime,
    agentId: prepared.agentId,
    sessionId,
    purpose: prepared.plan.descriptor.purpose,
    cwd: prepared.cwd,
  };
  const runtime = await openSessionRuntime(prepared.bootstrap, prepared.plan, {
    extensionFactories: [
      createShrimpyTuiCommandExtensionFactory(commandOptions),
      createShrimpyFooterExtensionFactory(() => {
        if (!sessionRuntime.current) {
          throw new Error("Shrimpy footer initialized before the TUI session runtime");
        }
        return sessionRuntime.current.session;
      }),
      settingsUi.extensionFactory,
    ],
  });
  sessionRuntime.current = runtime;

  try {
    primeInteractiveThemeForSession(runtime.session);
    const interactive = new InteractiveMode(runtime, {
      initialMessage: input.initialMessage,
    });
    installShrimpyInlineCommands(interactive, commandOptions);
    installShrimpyModelSelectionGuard(interactive, { runtime: input.runtime });
    installShrimpyTurnContextRendering();
    installShrimpySettingsSelector(interactive, {
      ...commandOptions,
      getSession: () => runtime.session,
      ui: settingsUi,
    });
    await interactive.run();
    return { agentId: prepared.agentId };
  } finally {
    await runtime.dispose();
  }
}
