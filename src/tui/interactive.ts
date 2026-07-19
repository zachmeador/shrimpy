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
import { createAgentSessionNavigatorExtensionFactory } from "./agent-session-navigator.js";
import { createShrimpyHeaderExtensionFactory } from "./shrimpy-header.js";
import { createShrimpyTuiCommandExtensionFactory } from "./shrimpy-commands.js";
import { createShrimpyFooterExtensionFactory } from "./shrimpy-footer.js";
import { installShrimpyInlineCommands } from "./shrimpy-inline-commands.js";
import { installShrimpyModelSelectionGuard } from "./shrimpy-model-selection.js";
import {
  createShrimpySettingsUiController,
  installShrimpySettingsSelector,
} from "./shrimpy-settings.js";
import { installShrimpyTurnContextRendering } from "./shrimpy-turn-context-rendering.js";
import { TuiSessionTargetController } from "./session-target.js";

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
  const sessionRuntime: { current?: AgentSessionRuntime } = {};
  const settingsUi = createShrimpySettingsUiController();
  const target = new TuiSessionTargetController(input.runtime, prepared);
  const commandOptions = {
    runtime: input.runtime,
    get agentId() {
      return target.getTarget().agentId;
    },
    get sessionId() {
      return target.getTarget().sessionId;
    },
    get purpose() {
      return target.getTarget().purpose;
    },
    get cwd() {
      return target.getTarget().cwd;
    },
  };
  const runtime = await openSessionRuntime(prepared.bootstrap, prepared.plan, {
    extensionFactories: [
      createAgentSessionNavigatorExtensionFactory({
        runtime: input.runtime,
        target,
      }),
      createShrimpyHeaderExtensionFactory(() => target.getTarget().agentId),
      createShrimpyTuiCommandExtensionFactory(commandOptions),
      createShrimpyFooterExtensionFactory(() => {
        if (!sessionRuntime.current) {
          throw new Error("Shrimpy footer initialized before the TUI session runtime");
        }
        return sessionRuntime.current.session;
      }),
      settingsUi.extensionFactory,
    ],
    runtimeFactory: target.createRuntime,
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
      runtime: input.runtime,
      get agentId() {
        return target.getTarget().agentId;
      },
      get sessionId() {
        return target.getTarget().sessionId;
      },
      get purpose() {
        return target.getTarget().purpose;
      },
      get cwd() {
        return target.getTarget().cwd;
      },
      getSession: () => runtime.session,
      ui: settingsUi,
    });
    await interactive.run();
    return { agentId: target.getTarget().agentId };
  } finally {
    await runtime.dispose();
  }
}
