import {
  type AgentSession,
  DynamicBorder,
  getSelectListTheme,
  getSettingsListTheme,
  type ExtensionFactory,
  type ExtensionCommandContext,
  type InteractiveMode,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  SelectList,
  SettingsList,
  type Component,
  type SettingItem,
} from "@earendil-works/pi-tui";
import type { AppRuntime } from "../app/runtime.js";
import type { RuntimeConfig } from "../config/index.js";
import { DEFAULT_MODEL_POLICY, formatModelRef } from "../config/model.js";
import { editConfigFile } from "../config/store.js";
import { isRecord } from "../util/record.js";

type ShowSelectorFactory = (done: () => void) => {
  component: Component;
  focus: Component;
};

interface SettingsInteractiveMode {
  showSelector(create: ShowSelectorFactory): void;
  showSettingsSelector(): void;
}

export interface ShrimpySettingsSelectorOptions {
  runtime: AppRuntime;
  agentId: string;
  sessionId: string;
  purpose: string;
  cwd: string;
  getSession: () => AgentSession;
  ui: ShrimpySettingsUiController;
}

type NotificationType = "info" | "warning" | "error";

export interface ShrimpySettingsUiController {
  extensionFactory: ExtensionFactory;
  notify(message: string, type?: NotificationType): void;
}

export function createShrimpySettingsUiController(): ShrimpySettingsUiController {
  let notify: ((message: string, type?: NotificationType) => void) | undefined;
  return {
    extensionFactory: (pi) => {
      pi.on("session_start", (_event, ctx) => {
        if (ctx.mode !== "tui") return;
        notify = (message, type) => ctx.ui.notify(message, type);
      });
    },
    notify(message, type = "info") {
      notify?.(message, type);
    },
  };
}

/**
 * Pi handles built-in /settings before extension commands and input hooks, so
 * there is no public API for adding a Shrimpy settings namespace. Keep this
 * compatibility seam limited to the two selector entry methods: Pi still owns
 * its settings component, callbacks, persistence, and live TUI behavior.
 */
export function installShrimpySettingsSelector(
  interactive: InteractiveMode,
  options: ShrimpySettingsSelectorOptions,
): void {
  const mode = interactive as unknown as SettingsInteractiveMode;
  if (
    typeof mode.showSettingsSelector !== "function"
    || typeof mode.showSelector !== "function"
  ) {
    return;
  }
  const piSettings = mode.showSettingsSelector;
  const showSelector = mode.showSelector;

  const showRoot = () => {
    showSelector.call(mode, (done) => {
      const selector = new SettingsRootSelector(
        options.agentId,
        showShrimpy,
        showPi,
        done,
      );
      return { component: selector, focus: selector.getSelectList() };
    });
  };

  const showShrimpy = () => {
    showSelector.call(mode, () => {
      const selector = new ShrimpySettingsPanel(options, showRoot);
      return { component: selector, focus: selector.getSettingsList() };
    });
  };

  const showPi = () => {
    const currentShowSelector = mode.showSelector;
    mode.showSelector = (create) => {
      showSelector.call(mode, () => create(showRoot));
    };
    try {
      piSettings.call(mode);
    } finally {
      mode.showSelector = currentShowSelector;
    }
  };

  mode.showSettingsSelector = showRoot;
}

class SettingsRootSelector extends Container {
  private readonly selectList: SelectList;

  constructor(
    agentId: string,
    showShrimpy: () => void,
    showPi: () => void,
    onCancel: () => void,
  ) {
    super();
    this.selectList = new SelectList([
      {
        value: "shrimpy",
        label: "Shrimpy settings",
        description: `Workspace, policy, and current-session settings for ${agentId}`,
      },
      {
        value: "pi",
        label: "Pi settings",
        description: "Live interactive-mode, model, display, and input settings",
      },
    ], 10, getSelectListTheme());
    this.selectList.onSelect = (item) => {
      if (item.value === "shrimpy") showShrimpy();
      else showPi();
    };
    this.selectList.onCancel = onCancel;
    this.addChild(new DynamicBorder());
    this.addChild(this.selectList);
    this.addChild(new DynamicBorder());
  }

  getSelectList(): SelectList {
    return this.selectList;
  }
}

class ShrimpySettingsPanel extends Container {
  private readonly settingsList: SettingsList;

  constructor(
    private readonly options: ShrimpySettingsSelectorOptions,
    onCancel: () => void,
  ) {
    super();
    this.settingsList = new SettingsList(
      this.createItems(),
      12,
      getSettingsListTheme(),
      (id, value) => this.handleChange(id, value),
      onCancel,
      { enableSearch: true },
    );
    this.addChild(new DynamicBorder());
    this.addChild(this.settingsList);
    this.addChild(new DynamicBorder());
  }

  getSettingsList(): SettingsList {
    return this.settingsList;
  }

  private createItems(): SettingItem[] {
    const runtime = this.options.runtime;
    const agent = runtime.getAgent(this.options.agentId);
    const agentPaths = runtime.getAgentPaths(agent.id);
    const session = this.options.getSession();
    const compaction = runtime.resolved.runtime.compaction;
    return [
      readOnly("workspace", "Workspace", runtime.paths.workspace, "Shrimpy's persistent home directory"),
      readOnly("config", "Config", runtime.paths.primaryConfigPath, "Main Shrimpy configuration file"),
      readOnly("agent", "Agent", agent.id, "Active agent for this TUI session"),
      readOnly("agent-root", "Agent root", agentPaths.root, "Agent-owned context, sessions, skills, watches, and vault"),
      readOnly("session", "Session", `${this.options.sessionId} / ${this.options.purpose}`, "Canonical Shrimpy session and purpose"),
      readOnly("cwd", "Working dir", this.options.cwd, "Working directory passed to Pi tools"),
      readOnly(
        "model",
        "Model",
        formatSessionModel(session.model),
        `Current Pi session model; agent policy ${agent.modelPolicy ?? DEFAULT_MODEL_POLICY}`,
      ),
      readOnly(
        "thinking",
        "Thinking",
        session.thinkingLevel,
        "Current Pi session thinking level",
      ),
      readOnly(
        "tool-policy",
        "Tool policy",
        `${session.getActiveToolNames().length}/${session.getAllTools().length} active`,
        `Active tools: ${session.getActiveToolNames().join(", ") || "none"}. Available tools: ${session.getAllTools().map((tool) => tool.name).join(", ") || "none"}`,
      ),
      readOnly(
        "channel-policy",
        "Channel policy",
        formatChannelPolicy(agent.channelPolicy.mode),
        "Agent-owned policy for visible channel messages",
      ),
      {
        id: "auto-compact",
        label: "Auto-compact",
        description: "Update the current Pi session and persist the Shrimpy default",
        currentValue: onOff(session.autoCompactionEnabled),
        values: ["on", "off"],
      },
      readOnly(
        "compaction-window",
        "Compaction window",
        `keep ${compaction.keepRecentTokens}, reserve ${compaction.reserveTokens}`,
        "Effective Shrimpy compaction policy for newly opened sessions",
      ),
      {
        id: "quiet-startup",
        label: "Quiet startup",
        description: "Persist Shrimpy quiet startup and synchronize Pi's current settings manager",
        currentValue: onOff(runtime.resolved.runtime.quietStartup),
        values: ["on", "off"],
      },
      {
        id: "skill-context",
        label: "Skill context",
        description: "Advertise available Shrimpy skills in future-session context",
        currentValue: onOff(!runtime.resolved.runtime.noSkills),
        values: ["on", "off"],
      },
      {
        id: "prompt-templates",
        label: "Prompt templates",
        description: "Load prompt-template slash commands in future sessions",
        currentValue: onOff(!runtime.resolved.runtime.noPromptTemplates),
        values: ["on", "off"],
      },
    ];
  }

  private handleChange(id: string, value: string): void {
    const previous = this.currentValue(id);
    const enabled = value === "on";
    try {
      if (id === "auto-compact") {
        persistRuntimeConfig(this.options.runtime, { compaction: { enabled } });
        this.options.getSession().setAutoCompactionEnabled(enabled);
      } else if (id === "quiet-startup") {
        persistRuntimeConfig(this.options.runtime, { quietStartup: enabled });
        this.options.getSession().settingsManager.setQuietStartup(enabled);
      } else if (id === "skill-context") {
        persistRuntimeConfig(this.options.runtime, { noSkills: !enabled });
      } else if (id === "prompt-templates") {
        persistRuntimeConfig(this.options.runtime, { noPromptTemplates: !enabled });
      }
      this.options.ui.notify(`Shrimpy ${settingLabel(id)}: ${value}`);
    } catch (error) {
      if (previous !== undefined) this.settingsList.updateValue(id, previous);
      this.options.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  }

  private currentValue(id: string): string | undefined {
    const runtime = this.options.runtime;
    if (id === "auto-compact") return onOff(this.options.getSession().autoCompactionEnabled);
    if (id === "quiet-startup") return onOff(runtime.resolved.runtime.quietStartup);
    if (id === "skill-context") return onOff(!runtime.resolved.runtime.noSkills);
    if (id === "prompt-templates") return onOff(!runtime.resolved.runtime.noPromptTemplates);
    return undefined;
  }
}

function readOnly(
  id: string,
  label: string,
  currentValue: string,
  description: string,
): SettingItem {
  return { id, label, currentValue, description };
}

export async function showShrimpySettings(
  ctx: ExtensionCommandContext,
  runtime: AppRuntime,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/shrimpy settings is available in the TUI.", "info");
    return;
  }

  while (true) {
    const compaction = runtime.resolved.runtime.compaction.enabled;
    const quiet = runtime.resolved.runtime.quietStartup;
    const skills = !runtime.resolved.runtime.noSkills;
    const templates = !runtime.resolved.runtime.noPromptTemplates;
    const selected = await ctx.ui.select("Shrimpy settings", [
      `Default auto-compact (new sessions): ${onOff(compaction)}`,
      `Quiet startup (new sessions): ${onOff(quiet)}`,
      `Skill context (new sessions): ${onOff(skills)}`,
      `Prompt templates (new sessions): ${onOff(templates)}`,
      "Done",
    ]);
    if (!selected || selected === "Done") return;

    if (selected.startsWith("Default auto-compact")) {
      persistRuntimeConfig(runtime, { compaction: { enabled: !compaction } });
    } else if (selected.startsWith("Quiet startup")) {
      persistRuntimeConfig(runtime, { quietStartup: !quiet });
    } else if (selected.startsWith("Skill context")) {
      persistRuntimeConfig(runtime, { noSkills: skills });
    } else if (selected.startsWith("Prompt templates")) {
      persistRuntimeConfig(runtime, { noPromptTemplates: templates });
    }
  }
}

function onOff(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

function settingLabel(id: string): string {
  if (id === "auto-compact") return "auto-compact";
  if (id === "quiet-startup") return "quiet startup";
  if (id === "skill-context") return "skill context";
  if (id === "prompt-templates") return "prompt templates";
  return id;
}

function formatSessionModel(model: AgentSession["model"]): string {
  return model ? formatModelRef(model, "set") : "unset";
}

function formatChannelPolicy(mode: string): string {
  if (mode === "all") return "all visible messages";
  if (mode === "mention") return "mentions only";
  if (mode === "none") return "disabled";
  return mode;
}

type RuntimeConfigPatch = Partial<Omit<RuntimeConfig, "compaction">> & {
  compaction?: Partial<NonNullable<RuntimeConfig["compaction"]>>;
};

function persistRuntimeConfig(runtime: AppRuntime, patch: RuntimeConfigPatch): void {
  editConfigFile(runtime.paths.workspace, (raw) => {
    const current = isRecord(raw.runtime) ? raw.runtime : {};
    const next = applyPatch(current, patch);
    raw.runtime = next;
  });

  const currentConfig = isRecord(runtime.config.runtime)
    ? runtime.config.runtime
    : {};
  runtime.config.runtime = applyPatch(currentConfig, patch) as RuntimeConfig;

  for (const [key, value] of Object.entries(patch)) {
    if (key === "compaction") continue;
    (runtime.resolved.runtime as Record<string, unknown>)[key] = value;
  }
  if (patch.compaction) {
    runtime.resolved.runtime.compaction = {
      ...runtime.resolved.runtime.compaction,
      ...patch.compaction,
    };
  }
}

function applyPatch(
  current: Record<string, unknown>,
  patch: RuntimeConfigPatch,
): Record<string, unknown> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key !== "compaction") next[key] = value;
  }
  if (patch.compaction) {
    next.compaction = {
      ...(isRecord(current.compaction) ? current.compaction : {}),
      ...patch.compaction,
    };
  }
  return next;
}
