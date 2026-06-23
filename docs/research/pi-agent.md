# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-06-22
Status: Research

`earendil-works/pi/packages/coding-agent` - TypeScript, MIT, npm: `@earendil-works/pi-coding-agent`

Shrimpy pins registry-published `@earendil-works/*` Pi packages. The latest npm version checked for this note is `0.79.10`; upstream `main` also contains an unreleased `pi-ai` SDK-layer breaking change tracked in [pi-ai-sdk-layer-2026-06-22.md](pi-ai-sdk-layer-2026-06-22.md).

## Current Shrimpy Impact

- Shrimpy pins `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` directly.
- Shrimpy currently pins all four packages at `0.79.6`; npm `latest` is `0.79.10` as of 2026-06-22.
- Shrimpy requires Node `>=22.19.0`, matching Pi `0.75.0+` runtime constraints.
- The public dependency path is upstream npm registry packages, not a local path dependency, unpacked package, checked-in tarball, or active Pi fork.
- Tool schemas now use `typebox` 1.x types. Shrimpy's Pi-facing tool definitions should import `Type` from `typebox`; Shrimpy-owned config schemas can keep using `@sinclair/typebox` where they do not flow into Pi `ToolDefinition`.
- Normal `npm test` does not typecheck `extensions/*.ts`. The Pi bump should include an explicit extension typecheck because extension imports and root exports changed.
- `ToolRenderContext` still exists internally, but it is not exported from the package root in `0.79.1`. Shrimpy compact-tool renderers should use local structural typing or a deeper supported export if Pi adds one.
- Upcoming `pi-ai` break: upstream `main` moves old root global helpers such as `completeSimple`, `streamSimple`, and `getProviders` to `@earendil-works/pi-ai/compat` while introducing explicit `Models` collections and provider factories. Shrimpy directly imports only a few of those old globals; most runtime model calls still go through `pi-coding-agent`.

## Latest Version Gap

The current installed gap is `0.79.6 -> 0.79.10`, plus an unreleased breaking `pi-ai` change on upstream `main`. Since `0.79.6`, the published patch stream mainly contains provider/model metadata fixes, provider-scoped `StreamOptions.env`, `@earendil-works/pi-ai/base`, configurable `chat-template` thinking support for OpenAI-compatible providers, and streaming/reasoning fixes. See [pi-ai-sdk-layer-2026-06-22.md](pi-ai-sdk-layer-2026-06-22.md) before attempting the next Pi bump.

Historical `0.77.0 -> 0.79.1` upgrade-relevant highlights:

- `0.78.0`: adds named startup sessions, clickable file tool paths, exported `parseArgs`, custom Bedrock request headers, early-input buffering, and several OpenRouter/OpenCode provider fixes. `@earendil-works/pi-ai` changed direct provider stream functions to require explicit `options.apiKey`; top-level helpers still resolve built-in environment auth.
- `0.78.1`: adds Ant Ling, NVIDIA NIM, MiniMax-M3, extension `ctx.mode`, and `ctx.getSystemPromptOptions()`. It also hardens temporary extension installs, git package source handling, HTML export URL sanitization, SDK embedding without adjacent package metadata, HTTP timeout handling across providers, large session-file loading, tab width accounting, and overlay focus restoration.
- `0.79.0`: adds project trust gating for project-local settings/resources/instructions/packages, extension-controlled project-trust decisions, cache-hit footer display, RPC extension UI exports, and package asset path helpers. It also neutralizes compaction summary wording for non-coding agents and changes trust behavior around reload and project `.pi` creation.
- `0.79.1`: adds prompt-template default positional arguments, global `defaultProjectTrust`, `ctx.isProjectTrusted()`, experimental feature guard, extension autocomplete trigger characters, and Claude Fable 5 metadata. It fixes Azure/OpenAI metadata, provider thinking-off payloads, prompt history restoration, mixed CJK wrapping, extension OAuth prompt stability, `/reload` queue-mode updates, invalid `models.json` migration handling, CLI help/version output, and ephemeral `/new` behavior.

Shrimpy upgrade action for the next bump: bump all four package pins together, run `npm run build`, and run TUI/settings/model/compaction tests. Before moving past the breaking `pi-ai` release, check whether Shrimpy should temporarily import old globals from `/compat` or migrate the affected call sites to the new `Models` collection.

## Local Patch Contingency

The normal path is to stay on upstream Pi packages. For a private patch test only, use a separate Pi checkout with an untouched upstream-tracking branch and a small `shrimpy-patches` branch. Build Pi there, create local package artifacts with `npm pack` from the changed Pi package directories, install those artifacts into Shrimpy temporarily, and run Shrimpy's normal build and test commands. Do not check generated tarballs into Shrimpy; before public release, replace the temporary artifacts with upstream packages, a pinned public fork commit, or a scoped registry package.

## What It Is

Terminal coding agent similar to Claude Code. Pi provides the session runtime, provider/model registry, TUI, tools, extension system, compaction, and transcript persistence. It runs as an interactive CLI, print-mode CLI, JSON event stream, RPC subprocess, or embedded SDK.

The default active built-ins are `read`, `bash`, `edit`, and `write`. The built-in registry also includes file-discovery helpers such as `grep`, `find`, and `ls`, which can be selected by CLI flags, SDK options, or extension tool APIs.

## CLI

```bash
pi "do something"                  # interactive
pi -p "summarize this"             # print mode, non-interactive
pi --mode json "prompt"            # JSONL event stream to stdout
pi --mode rpc                      # headless, drive via stdin/stdout JSONL
pi --name "release audit"          # set session display name at startup
pi --session-id release-audit -p "continue audit" # create/resume an exact project-local session id
```

Important options for Shrimpy integration:

- `--provider`, `--model`, `--thinking`, `--models`, `--list-models`
- `--tools`, `--exclude-tools`, `--no-builtin-tools`, `--no-tools`
- `--skill`, `--extension`, `--prompt-template`, `--theme`
- `--no-skills`, `--no-extensions`, `--no-prompt-templates`, `--no-context-files`
- `--session`, `--session-id`, `--session-dir`, `--continue`, `--resume`, `--fork`, `--no-session`, `--name`

Sessions persist as JSONL with a tree structure: branching, forking, named sessions, and compaction are built in.

## SDK

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

session.subscribe((event) => { /* streaming events */ });
await session.prompt("do something");
```

Key methods on `AgentSession`: `prompt()`, `steer()`, `followUp()`, `subscribe()`, `abort()`, `compact()`, `setModel()`, `setThinkingLevel()`, `fork()`, `navigateTree()`, `sendHookMessage()`, `dispose()`, `getActiveToolNames()`, `getAllTools()`, `setActiveToolsByName()`, and `reload()`.

State access: `session.agent.state.messages`, `.model`, `.tools`, `.systemPrompt`, `.streamingMessage`.

Useful `createAgentSession()` options for Shrimpy:

- `agentDir` to redirect Pi auth/model/settings state under the Shrimpy workspace.
- `settingsManager`, `sessionManager`, `modelRegistry`, and `resourceLoader` for isolation.
- `tools` as an allowlist.
- `excludeTools` as a denylist.
- `noTools: "all" | "builtin"` for broad suppression modes.
- `customTools` for additive Shrimpy daemon tools.

## Extension API

Extensions are TS files exporting a default function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => { /* intercept */ });
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Do something structured",
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text: "done" }], details: {} }),
  });
  pi.registerCommand("mycmd", { handler: async () => {} });
  pi.registerProvider("my-llm", { baseUrl: "...", models: [] });
  pi.sendMessage({ content: "injected", customType: "x", display: true });
  pi.sendUserMessage("as if the user typed this");
  pi.appendEntry("my-state", { count: 1 });  // persist to session
  pi.getAllTools();                           // ToolInfo[] with sourceInfo and promptGuidelines
  pi.getActiveTools();                        // active tool names
  pi.setActiveTools(["read", "bash"]);        // toggle tools at runtime
}
```

Events you can hook: `resources_discover`, `session_start`, `session_shutdown`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, `context`, `before_provider_request`, `after_provider_response`, `before_agent_start`, `agent_start/end`, `turn_start/end`, `message_start/update/end`, `tool_call`, `tool_result`, `tool_execution_start/update/end`, `model_update`, `thinking_level_update`, `input`, and `user_bash`.

`InputEvent.streamingBehavior` distinguishes idle prompts from mid-stream steers and queued follow-ups. `!` / `!!` user bash input emits `user_bash`, whose handler can replace shell operations or return a synthetic result.

## Tool Policy

Built-in, extension, and custom tools can be inspected, enabled, disabled, and overridden without patching Pi:

- CLI: `--tools`, `--exclude-tools`, `--no-builtin-tools`, `--no-tools`
- SDK: `createAgentSession({ tools, excludeTools, noTools, customTools })`
- Extension: `pi.getAllTools()`, `pi.getActiveTools()`, `pi.setActiveTools()`
- Override: register a same-name tool to replace a built-in implementation
- Prompt: active tools contribute `promptSnippet` and `promptGuidelines` to Pi's default prompt assembly

For Shrimpy, this makes Pi's tool policy a good adapter point. Use `tools` / `excludeTools` for the effective per-agent policy and keep `customTools` for Shrimpy daemon tools. Treat `customTools` alone as incomplete because Pi defaults still exist unless explicitly selected or disabled.

## RPC Protocol

JSONL over stdin/stdout. Commands include `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `set_model`, `cycle_model`, `set_thinking_level`, `compact`, `bash`, `get_commands`, `new_session`, `set_session_name`, `get_session_stats`, etc. Events stream back as typed JSON objects.

`bash` accepts `excludeFromContext`, matching the internal `!!` behavior: the command can run while keeping its output out of the next model-visible context.

## Theming And TUI

JSON theme files live in `~/.pi/agent/themes/` or `.pi/themes/` and can be selected through `/settings` or settings JSON. Extensions can replace or add footer/editor/widgets/overlays for deeper UI changes.

Interactive mode has a built-in slash command registry for `/settings`, `/model`, `/scoped-models`, `/export`, `/import`, `/share`, `/copy`, `/name`, `/session`, `/changelog`, `/hotkeys`, `/fork`, `/clone`, `/tree`, `/login`, `/logout`, `/new`, `/compact`, `/resume`, `/reload`, and `/quit`. Extensions add commands with `pi.registerCommand()`, and they appear in autocomplete unless they conflict with built-ins.

Current Shrimpy direction: the normal Shrimpy TUI uses Pi's stock `InteractiveMode` so autocomplete, selectors, editor behavior, hotkeys, and built-in commands stay aligned with Pi. Shrimpy patches the instance-level `/settings` selector to present a unified menu with Shrimpy workspace/runtime settings and Pi interactive settings. During first setup, Shrimpy can hand the user to Pi's built-in `/login` and `/model` flow to add credentials and pick a model.

## Packaging

A Pi package is an npm package or git repo with `extensions/`, `skills/`, `prompts/`, or `themes/` directories. Pi auto-discovers them by convention, or package paths can be declared under Pi package metadata. Install with `pi install .`, `pi install npm:pkg`, or `pi install git:repo`.

Current bundled extension peer imports are `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`.

## Models

Pi reads custom providers and model overrides from `models.json`. The parser accepts `//` comments and trailing commas before JSON parsing.

Provider `apiKey` and `headers` support command execution (`"!cmd"`), environment interpolation (`"$ENV_VAR"` / `"${ENV_VAR}"`), and escaped literal prefixes (`"$$"` and `"$!"`). Commands are resolved at request time; Pi does not cache arbitrary command output.

Model-level `thinkingLevelMap` maps Pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) to provider values and hides unsupported levels with `null`. Older configs that used `compat.reasoningEffortMap` should move that mapping to model-level `thinkingLevelMap`.

## How Tools Work

A tool is `{ name, description, parameters }` with a `typebox` schema. Pi passes active tool schemas as native tool definitions to the provider. The model calls them, Pi validates args, runs `execute()`, and returns the result. Tool calls can run in parallel within a turn. Output should be truncated (default 50KB / 2000 lines).

Custom renderers receive a `ToolRenderContext` with args, cwd, tool call id, render state, invalidation, partial/error/expanded flags, and image visibility. This type is internal in `0.79.1`; extension code that imports from the package root should not assume it is exported.

In the system prompt, tools can opt into an "Available tools" one-liner via `promptSnippet` and add guidelines via `promptGuidelines`. The prompt also includes cwd, date, AGENTS.md context files, skills, and `appendSystemPrompt` content. Extensions can modify the prompt per turn via `before_agent_start`, or mutate messages in `context`.

When a caller passes a full custom prompt body through `DefaultResourceLoader({ systemPrompt })`, Pi treats that as the system prompt replacement. Native tool definitions are still part of the model call. Shrimpy context inspection should use the real session/model-call path so prompt text, selected tools, turn context, and the final message payload are represented together.

## Context Construction

`buildSystemPrompt()` concatenates layers into a single string:

1. Base prompt - hardcoded identity or custom replacement via `.pi/SYSTEM.md` / resource-loader `systemPrompt`
2. Tool list - one-liner per active tool with `promptSnippet`
3. Guidelines - auto-generated active-tool guidelines plus custom `promptGuidelines`
4. `appendSystemPrompt` - free text appended when Pi's default prompt assembly is used
5. Context files - AGENTS.md hierarchy loaded by `DefaultResourceLoader`
6. Skills - formatted in XML blocks
7. Metadata - date and cwd

The prompt is rebuilt each turn and when `setActiveTools()` changes the active tool set. `DefaultResourceLoader` controls which context files and skills are fed in.

Constructor overrides allow Shrimpy to intercept or replace layers without subclassing: `systemPromptOverride`, `appendSystemPromptOverride`, `agentsFilesOverride`, `extensionsOverride`, `skillsOverride`, and `promptsOverride`. It also accepts `systemPrompt`, `appendSystemPrompt`, `additionalExtensionPaths`, `additionalSkillPaths`, and `additionalPromptTemplatePaths`.

Shrimpy currently uses the `systemPrompt` replacement path for its assembled context, strips Pi-discovered AGENTS/append-prompt/skill layers, and loads a curated extension list. This means Shrimpy owns the stable prompt body while Pi still owns provider-native tool definitions and interactive command handling.

Focused follow-up: [pi-skill-handling.md](pi-skill-handling.md) covers Pi skill discovery, `additionalSkillPaths`, slash command expansion, and the Shrimpy integration gap in more detail.

## pi-mom

`packages/mom/` is the upstream example of an external messaging channel driving a Pi agent.

Architecture:

- Slack Socket Mode receives messages, logs them to per-channel `log.jsonl`, and queues them for sequential processing.
- Per-channel state includes `log.jsonl`, `context.jsonl`, and `MEMORY.md`.
- `ChannelQueue` handles one-message-at-a-time processing per channel.
- Event trigger files can trigger channel processing immediately, once at a scheduled time, or periodically.

Relevance to Shrimpy: prior art for channel-to-agent routing. Key differences from Shrimpy's design are that mom responds via Slack API directly, handles only Slack, and runs one agent per channel.

## Ongoing Conversation Context

The conversation is the context. Pi sends the system prompt plus message history to the LLM each turn. No selective per-turn injection exists by default; messages accumulate until compaction triggers.

Compaction walks backward from newest messages, keeps recent history, summarizes older context into a structured checkpoint, and preserves file-awareness metadata. Recent Pi fixes make compaction use custom agent stream functions and ensure session disposal aborts in-flight compaction/retry/bash work.

What Pi still does not provide by default:

- No per-turn context selection by source.
- No token budgeting per context section.
- No memory tiering beyond message history and compaction.
- No selective injection of external knowledge mid-conversation unless Shrimpy or an extension does it.

## Loops / Polling / Watchers

Pi has no native background daemon concept. Three ways to get there:

- Extension: use `fs.watch` or `setInterval` inside `session_start`, then call `pi.sendMessage()` or `pi.sendUserMessage()`.
- SDK supervisor: wrap `createAgentSession()` in an external loop and call `session.prompt()` when conditions are met.
- RPC driver: spawn `pi --mode rpc` and send prompts on stdin whenever an external scheduler decides to.

## Embedding Without Touching User Config

The SDK can run Pi as an isolated runtime. Use `SettingsManager.inMemory()` to avoid reading/writing user settings. Use `DefaultResourceLoader` with explicit paths to load only Shrimpy extensions, skills, and prompts. Use `SessionManager.create(cwd, sessionDir)` to store sessions in Shrimpy's workspace. Set `agentDir` or `PI_CODING_AGENT_DIR` depending on the integration path to redirect auth/model/config reads.

```typescript
const { session } = await createAgentSession({
  agentDir: "/path/to/shrimpy/workspace/state/pi",
  settingsManager: SettingsManager.inMemory(),
  sessionManager: SessionManager.create(process.cwd(), "./shrimpy-sessions"),
  resourceLoader: loader,
  tools: ["read", "bash"],
  excludeTools: ["write"],
  customTools: [myTool],
});
```

## Sub-Agents And Cross-Agent Supervision

Pi has no built-in sub-agent or multi-agent support. Ecosystem packages such as `pi-subagents`, `pi-cli-subagent-extension`, `pi-side-agents`, and `@tintinweb/pi-subagents` spawn child Pi or other coding-agent processes and feed their output back to the supervising agent. No protocol-level interop is required; the parent agent reads subprocess output like a human would.

## Ecosystem Packages

MCP is not built in, but packages such as `pi-mcp-adapter` and `pi-mcp-tools` add MCP access through extension tools.

A2A / ACP are not in core.

## Sources

[README](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#readme) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md) · [RPC](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/rpc.md) · [Usage](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/usage.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/models.md) · [Custom providers](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/custom-provider.md) · [Skills](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md) · [Packages](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/themes.md)
