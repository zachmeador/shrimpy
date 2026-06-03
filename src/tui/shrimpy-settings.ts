import { existsSync } from "node:fs";
import {
  type AgentSession,
  DynamicBorder,
  type InteractiveMode,
  type SettingsCallbacks,
  type SettingsConfig,
  SettingsSelectorComponent,
  type SettingsManager,
  getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  SettingsList,
  type Component,
  type SettingItem,
} from "@earendil-works/pi-tui";
import {
  configureHttpDispatcher,
  formatHttpIdleTimeoutMs,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/http-dispatcher.js";
import {
  getAvailableThemes,
  setTheme,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import type { AppRuntime } from "../app/runtime.js";
import type { RuntimeConfig } from "../config/index.js";
import { formatModelSelection } from "../config/model.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";

type ShowSelectorFactory = (done: () => void) => {
  component: Component;
  focus: Component;
};

interface InteractiveModeInternals {
  showSelector(create: ShowSelectorFactory): void;
  session: AgentSession;
  settingsManager: SettingsManager;
  footer: {
    setAutoCompactEnabled(enabled: boolean): void;
    invalidate(): void;
  };
  chatContainer: {
    children: Component[];
    clear(): void;
  };
  defaultEditor: {
    setPaddingX?(padding: number): void;
    setAutocompleteMaxVisible?(maxVisible: number): void;
  };
  editor: {
    setPaddingX?(padding: number): void;
    setAutocompleteMaxVisible?(maxVisible: number): void;
  };
  ui: {
    invalidate(): void;
    requestRender(): void;
    setShowHardwareCursor(enabled: boolean): void;
    setClearOnShrink(enabled: boolean): void;
  };
  hideThinkingBlock: boolean;
  setupAutocompleteProvider(): void;
  updateEditorBorderColor(): void;
  rebuildChatFromMessages(): void;
  showError(message: string): void;
  showStatus(message: string): void;
  showSettingsSelector(): void;
}

export interface ShrimpySettingsSelectorOptions {
  runtime: AppRuntime;
  agentId: string;
  channel: string;
  sessionType: string;
  cwd: string;
}

export function installShrimpySettingsSelector(
  interactive: InteractiveMode,
  options: ShrimpySettingsSelectorOptions,
): void {
  const mode = interactive as unknown as InteractiveModeInternals;
  mode.showSettingsSelector = () => {
    mode.showSelector((done) => {
      const selector = new UnifiedSettingsSelector(mode, options, done);
      return { component: selector, focus: selector.getSettingsList() };
    });
  };
}

class UnifiedSettingsSelector extends Container {
  private readonly settingsList: SettingsList;

  constructor(
    private readonly mode: InteractiveModeInternals,
    private readonly options: ShrimpySettingsSelectorOptions,
    onCancel: () => void,
  ) {
    super();

    const configPath = options.runtime.paths.primaryConfigPath;
    const items: SettingItem[] = [
      {
        id: "shrimpy",
        label: "Shrimpy settings",
        description:
          `Workspace, agent, and Shrimpy runtime settings from ${configPath}.`,
        currentValue: options.agentId,
        submenu: (_currentValue, done) =>
          new ShrimpySettingsSubmenu(mode, options, () => done()),
      },
      {
        id: "pi",
        label: "Pi settings",
        description:
          "Pi interactive-mode settings. Shrimpy keeps these visible because Pi owns the TUI runtime and is doing the heavy lifting here.",
        currentValue: "interactive mode",
        submenu: (_currentValue, done) =>
          new PiSettingsSubmenu(mode, options, () => done()),
      },
    ];

    this.addChild(new DynamicBorder());
    this.settingsList = new SettingsList(
      items,
      10,
      getSettingsListTheme(),
      () => {},
      onCancel,
      { enableSearch: true },
    );
    this.addChild(this.settingsList);
    this.addChild(new DynamicBorder());
  }

  getSettingsList(): SettingsList {
    return this.settingsList;
  }
}

class PiSettingsSubmenu extends Container {
  private readonly selector: SettingsSelectorComponent;

  constructor(
    mode: InteractiveModeInternals,
    options: ShrimpySettingsSelectorOptions,
    onCancel: () => void,
  ) {
    super();
    this.selector = new SettingsSelectorComponent(
      buildPiSettingsConfig(mode),
      buildPiSettingsCallbacks(mode, options, onCancel),
    );
    this.addChild(this.selector);
  }

  handleInput(data: string): void {
    this.selector.getSettingsList().handleInput(data);
  }
}

class ShrimpySettingsSubmenu extends Container {
  private readonly settingsList: SettingsList;

  constructor(
    private readonly mode: InteractiveModeInternals,
    private readonly options: ShrimpySettingsSelectorOptions,
    onCancel: () => void,
  ) {
    super();
    this.settingsList = new SettingsList(
      this.createItems(),
      10,
      getSettingsListTheme(),
      (id, newValue) => this.handleChange(id, newValue),
      onCancel,
      { enableSearch: true },
    );
    this.addChild(this.settingsList);
  }

  handleInput(data: string): void {
    this.settingsList.handleInput(data);
  }

  private createItems(): SettingItem[] {
    const runtime = this.options.runtime;
    const agent = runtime.getAgent(this.options.agentId);
    const agentPaths = runtime.getAgentPaths(agent.id);
    const configuredModel = agent.model;
    const activeTools = this.mode.session.getActiveToolNames();
    const allTools = this.mode.session.getAllTools();
    const compaction = runtime.resolved.runtime.compaction;
    const channelPolicySummary = formatChannelPolicy(agent.channelPolicy.mode);

    return [
      {
        id: "workspace",
        label: "Workspace",
        description: "Shrimpy's persistent home directory.",
        currentValue: runtime.paths.workspace,
      },
      {
        id: "config",
        label: "Config",
        description: "Main Shrimpy config file. Editable settings here persist to this JSON file.",
        currentValue: runtime.paths.primaryConfigPath,
      },
      {
        id: "agent",
        label: "Agent",
        description: "Active Shrimpy agent for this TUI session.",
        currentValue: agent.id,
      },
      {
        id: "agent-root",
        label: "Agent root",
        description: "Agent-owned memory, sessions, skills, watches, and vault directory.",
        currentValue: agentPaths.root,
      },
      {
        id: "session-label",
        label: "Session label",
        description: "Direct local session label used for this Pi transcript.",
        currentValue: `${this.options.channel} / ${this.options.sessionType}`,
      },
      {
        id: "cwd",
        label: "Working dir",
        description: "Current working directory passed to Pi tools and the TUI.",
        currentValue: this.options.cwd,
      },
      {
        id: "model",
        label: "Model",
        description:
          configuredModel === undefined
            ? "Current Pi session model. This agent has no default model configured."
            : `Current Pi session model. Agent default: ${formatModelSelection(configuredModel)}.`,
        currentValue: formatSessionModel(this.mode.session.model),
      },
      {
        id: "thinking",
        label: "Thinking",
        description: "Current Pi session thinking level. Agent defaults are configured through Shrimpy agent settings.",
        currentValue: this.mode.session.thinkingLevel,
      },
      {
        id: "tool-policy",
        label: "Tool policy",
        description:
          `Active tools: ${activeTools.join(", ") || "none"}. Available tools: ${allTools.map((tool) => tool.name).join(", ") || "none"}.`,
        currentValue: `${activeTools.length}/${allTools.length} active`,
      },
      {
        id: "channel-policy",
        label: "Channel policy",
        description: "Agent-owned policy for visible channel messages.",
        currentValue: channelPolicySummary,
      },
      {
        id: "auto-compact",
        label: "Auto-compact",
        description:
          "Persist Shrimpy runtime.compaction.enabled and update the current Pi session immediately.",
        currentValue: this.mode.session.autoCompactionEnabled ? "true" : "false",
        values: ["true", "false"],
      },
      {
        id: "compaction-window",
        label: "Compaction window",
        description: "Effective Shrimpy compaction policy for newly opened sessions.",
        currentValue: `keep ${compaction.keepRecentTokens}, reserve ${compaction.reserveTokens}`,
      },
      {
        id: "quiet-startup",
        label: "Quiet startup",
        description:
          "Persist Shrimpy runtime.quietStartup and update Pi's current settings manager.",
        currentValue: runtime.resolved.runtime.quietStartup ? "true" : "false",
        values: ["true", "false"],
      },
      {
        id: "skill-context",
        label: "Skill context",
        description:
          "Controls Shrimpy's prompt-time skill advertisement for future sessions. Pi slash skill commands are still a Pi setting.",
        currentValue: runtime.resolved.runtime.noSkills ? "disabled" : "enabled",
        values: ["enabled", "disabled"],
      },
      {
        id: "prompt-templates",
        label: "Prompt templates",
        description:
          "Controls whether Pi loads prompt-template slash commands in newly opened Shrimpy TUI sessions.",
        currentValue: runtime.resolved.runtime.noPromptTemplates ? "disabled" : "enabled",
        values: ["enabled", "disabled"],
      },
    ];
  }

  private handleChange(id: string, newValue: string): void {
    try {
      switch (id) {
        case "auto-compact": {
          const enabled = newValue === "true";
          this.mode.session.setAutoCompactionEnabled(enabled);
          this.mode.footer.setAutoCompactEnabled(enabled);
          persistRuntimeConfig(this.options.runtime, {
            compaction: { enabled },
          });
          this.mode.showStatus(`Shrimpy auto-compact: ${newValue}`);
          break;
        }
        case "quiet-startup": {
          const enabled = newValue === "true";
          this.mode.settingsManager.setQuietStartup(enabled);
          persistRuntimeConfig(this.options.runtime, { quietStartup: enabled });
          this.mode.showStatus(`Shrimpy quiet startup: ${newValue}`);
          break;
        }
        case "skill-context": {
          const noSkills = newValue === "disabled";
          persistRuntimeConfig(this.options.runtime, { noSkills });
          this.mode.showStatus(`Shrimpy skill context: ${newValue}`);
          break;
        }
        case "prompt-templates": {
          const noPromptTemplates = newValue === "disabled";
          persistRuntimeConfig(this.options.runtime, { noPromptTemplates });
          this.mode.showStatus(`Shrimpy prompt templates: ${newValue}`);
          break;
        }
      }
    } catch (error) {
      this.mode.showError(error instanceof Error ? error.message : String(error));
    }
  }
}

function buildPiSettingsConfig(mode: InteractiveModeInternals): SettingsConfig {
  return {
    autoCompact: mode.session.autoCompactionEnabled,
    showImages: mode.settingsManager.getShowImages(),
    imageWidthCells: mode.settingsManager.getImageWidthCells(),
    autoResizeImages: mode.settingsManager.getImageAutoResize(),
    blockImages: mode.settingsManager.getBlockImages(),
    enableSkillCommands: mode.settingsManager.getEnableSkillCommands(),
    steeringMode: mode.session.steeringMode,
    followUpMode: mode.session.followUpMode,
    transport: mode.settingsManager.getTransport(),
    httpIdleTimeoutMs: mode.settingsManager.getHttpIdleTimeoutMs(),
    thinkingLevel: mode.session.thinkingLevel,
    availableThinkingLevels: mode.session.getAvailableThinkingLevels(),
    currentTheme: mode.settingsManager.getTheme() || "dark",
    availableThemes: getAvailableThemes(),
    hideThinkingBlock: mode.hideThinkingBlock,
    collapseChangelog: mode.settingsManager.getCollapseChangelog(),
    enableInstallTelemetry: mode.settingsManager.getEnableInstallTelemetry(),
    doubleEscapeAction: mode.settingsManager.getDoubleEscapeAction(),
    treeFilterMode: mode.settingsManager.getTreeFilterMode(),
    showHardwareCursor: mode.settingsManager.getShowHardwareCursor(),
    editorPaddingX: mode.settingsManager.getEditorPaddingX(),
    autocompleteMaxVisible: mode.settingsManager.getAutocompleteMaxVisible(),
    quietStartup: mode.settingsManager.getQuietStartup(),
    clearOnShrink: mode.settingsManager.getClearOnShrink(),
    showTerminalProgress: mode.settingsManager.getShowTerminalProgress(),
    warnings: mode.settingsManager.getWarnings(),
  };
}

function buildPiSettingsCallbacks(
  mode: InteractiveModeInternals,
  options: ShrimpySettingsSelectorOptions,
  onCancel: () => void,
): SettingsCallbacks {
  return {
    onAutoCompactChange: (enabled) => {
      mode.session.setAutoCompactionEnabled(enabled);
      mode.footer.setAutoCompactEnabled(enabled);
      persistRuntimeConfigSafely(mode, options.runtime, {
        compaction: { enabled },
      });
    },
    onShowImagesChange: (enabled) => {
      mode.settingsManager.setShowImages(enabled);
      for (const child of mode.chatContainer.children) {
        callIfPresent(child, "setShowImages", enabled);
      }
    },
    onImageWidthCellsChange: (width) => {
      mode.settingsManager.setImageWidthCells(width);
      for (const child of mode.chatContainer.children) {
        callIfPresent(child, "setImageWidthCells", width);
      }
    },
    onAutoResizeImagesChange: (enabled) => {
      mode.settingsManager.setImageAutoResize(enabled);
    },
    onBlockImagesChange: (blocked) => {
      mode.settingsManager.setBlockImages(blocked);
    },
    onEnableSkillCommandsChange: (enabled) => {
      mode.settingsManager.setEnableSkillCommands(enabled);
      mode.setupAutocompleteProvider();
    },
    onSteeringModeChange: (setting) => {
      mode.session.setSteeringMode(setting);
    },
    onFollowUpModeChange: (setting) => {
      mode.session.setFollowUpMode(setting);
    },
    onTransportChange: (transport) => {
      mode.settingsManager.setTransport(transport);
      mode.session.agent.transport = transport;
    },
    onHttpIdleTimeoutMsChange: (timeoutMs) => {
      mode.settingsManager.setHttpIdleTimeoutMs(timeoutMs);
      configureHttpDispatcher(timeoutMs);
      mode.showStatus(`HTTP idle timeout: ${formatHttpIdleTimeoutMs(timeoutMs)}`);
    },
    onThinkingLevelChange: (level) => {
      mode.session.setThinkingLevel(level);
      mode.footer.invalidate();
      mode.updateEditorBorderColor();
    },
    onThemeChange: (themeName) => {
      const result = setTheme(themeName, true);
      mode.settingsManager.setTheme(themeName);
      persistRuntimeConfigSafely(mode, options.runtime, { theme: themeName });
      mode.ui.invalidate();
      if (!result.success) {
        mode.showError(
          `Failed to load theme "${themeName}": ${result.error}\nFell back to dark theme.`,
        );
      }
    },
    onThemePreview: (themeName) => {
      const result = setTheme(themeName, true);
      if (result.success) {
        mode.ui.invalidate();
        mode.ui.requestRender();
      }
    },
    onHideThinkingBlockChange: (hidden) => {
      mode.hideThinkingBlock = hidden;
      mode.settingsManager.setHideThinkingBlock(hidden);
      for (const child of mode.chatContainer.children) {
        callIfPresent(child, "setHideThinkingBlock", hidden);
      }
      mode.chatContainer.clear();
      mode.rebuildChatFromMessages();
    },
    onCollapseChangelogChange: (collapsed) => {
      mode.settingsManager.setCollapseChangelog(collapsed);
    },
    onEnableInstallTelemetryChange: (enabled) => {
      mode.settingsManager.setEnableInstallTelemetry(enabled);
    },
    onQuietStartupChange: (enabled) => {
      mode.settingsManager.setQuietStartup(enabled);
      persistRuntimeConfigSafely(mode, options.runtime, { quietStartup: enabled });
    },
    onDoubleEscapeActionChange: (action) => {
      mode.settingsManager.setDoubleEscapeAction(action);
    },
    onTreeFilterModeChange: (treeFilterMode) => {
      mode.settingsManager.setTreeFilterMode(treeFilterMode);
    },
    onShowHardwareCursorChange: (enabled) => {
      mode.settingsManager.setShowHardwareCursor(enabled);
      mode.ui.setShowHardwareCursor(enabled);
    },
    onEditorPaddingXChange: (padding) => {
      mode.settingsManager.setEditorPaddingX(padding);
      mode.defaultEditor.setPaddingX?.(padding);
      if (mode.editor !== mode.defaultEditor) {
        mode.editor.setPaddingX?.(padding);
      }
    },
    onAutocompleteMaxVisibleChange: (maxVisible) => {
      mode.settingsManager.setAutocompleteMaxVisible(maxVisible);
      mode.defaultEditor.setAutocompleteMaxVisible?.(maxVisible);
      if (mode.editor !== mode.defaultEditor) {
        mode.editor.setAutocompleteMaxVisible?.(maxVisible);
      }
    },
    onClearOnShrinkChange: (enabled) => {
      mode.settingsManager.setClearOnShrink(enabled);
      mode.ui.setClearOnShrink(enabled);
    },
    onShowTerminalProgressChange: (enabled) => {
      mode.settingsManager.setShowTerminalProgress(enabled);
    },
    onWarningsChange: (warnings) => {
      mode.settingsManager.setWarnings(warnings);
    },
    onCancel: () => {
      onCancel();
      mode.ui.requestRender();
    },
  };
}

function persistRuntimeConfigSafely(
  mode: Pick<InteractiveModeInternals, "showError">,
  runtime: AppRuntime,
  patch: RuntimeConfigPatch,
): void {
  try {
    persistRuntimeConfig(runtime, patch);
  } catch (error) {
    mode.showError(error instanceof Error ? error.message : String(error));
  }
}

type RuntimeConfigPatch = Partial<Omit<RuntimeConfig, "compaction">> & {
  compaction?: Partial<NonNullable<RuntimeConfig["compaction"]>>;
};

function persistRuntimeConfig(
  runtime: AppRuntime,
  patch: RuntimeConfigPatch,
): void {
  const configPath = runtime.paths.primaryConfigPath;
  const raw = existsSync(configPath) ? readRawConfig(configPath) : {};
  const runtimeRaw = asRecord(raw.runtime);
  const nextRuntime: Record<string, unknown> = { ...runtimeRaw };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "compaction") continue;
    nextRuntime[key] = value;
  }

  if (patch.compaction !== undefined) {
    nextRuntime.compaction = {
      ...asRecord(runtimeRaw.compaction),
      ...patch.compaction,
    };
  }

  raw.runtime = nextRuntime;
  writeJsonFileAtomic(configPath, raw);
  applyRuntimePatch(runtime, patch);
}

function applyRuntimePatch(
  runtime: AppRuntime,
  patch: RuntimeConfigPatch,
): void {
  const configRuntime = {
    ...asRecord(runtime.config.runtime),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "compaction") continue;
    configRuntime[key] = value;
    (runtime.resolved.runtime as Record<string, unknown>)[key] = value;
  }

  if (patch.compaction !== undefined) {
    configRuntime.compaction = {
      ...asRecord(configRuntime.compaction),
      ...patch.compaction,
    };
    runtime.resolved.runtime.compaction = {
      ...runtime.resolved.runtime.compaction,
      ...patch.compaction,
    };
  }

  runtime.config.runtime = configRuntime as RuntimeConfig;
}

function readRawConfig(path: string): Record<string, unknown> {
  const raw = readJsonFileStrict(
    path,
    (parsed) => parsed as unknown,
  );
  if (!isRecord(raw)) {
    throw new Error(`config must be a JSON object: ${path}`);
  }
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function callIfPresent<T>(
  target: Component,
  method: string,
  value: T,
): void {
  const candidate = target as unknown as Record<string, unknown>;
  const fn = candidate[method];
  if (typeof fn === "function") {
    (fn as (input: T) => void).call(target, value);
  }
}

function formatSessionModel(model: AgentSession["model"]): string {
  if (!model) return "unset";
  return [model.provider, model.id].filter(Boolean).join("/") || "set";
}

function formatChannelPolicy(mode: string): string {
  return mode || "all";
}
