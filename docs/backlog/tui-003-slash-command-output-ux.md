# 🦐 TUI-003: Slash Command Output UX Polish

Status: todo
Priority: P2
Area: TUI

## Why
Shrimpy-native slash commands are useful in the TUI, but their output currently feels bolted onto the bottom of the Pi interface instead of integrated into the active conversation surface. After running a command such as `/models`, the command panel can remain visually stuck at the bottom of the TUI until another Shrimpy slash command replaces it. This makes the interface feel stale and can leave old state competing with the prompt, live model output, or later user input.

Example current `/models` output:

```text
Models
 active: local_qwen_moe/Qwen3.6-35B-A3B-UD-Q6_K.gguf
 auth state: workspace/state/pi/auth.json
 model state: workspace/state/pi/models.json
Inspect:
 Use Pi /model for live selection
 Use Pi /login for provider auth
```

## Build
- Audit the visual behavior of all Shrimpy-native TUI slash commands, especially `/workspace`, `/agents`, `/channels`, `/context`, `/skills`, `/models`, `/doctor`, `/shrimpy`, `/thinking`, and `/toolrows`.
- Decide whether command output should render as a conversation message, a transient overlay, a dismissible panel, a status toast, or another Pi-native surface.
- Prevent stale Shrimpy slash command output from staying pinned at the bottom after the command is no longer the active interaction.
- Make multi-line command output visually distinct from the input editor without feeling like a separate debug dump.
- Improve spacing, labels, wrapping, and grouping for command output that contains paths, active state, follow-up actions, or inspection hints.
- Preserve agent-friendly text output where commands are also reachable through CLI or logs.

## Repro
- Start a Shrimpy TUI session.
- Run `/models`.
- Observe the Shrimpy command output at the bottom of the TUI.
- Continue typing or waiting without running another Shrimpy slash command.
- Expected: the `/models` result is readable, dismissible or naturally placed, and does not look like stale active UI.
- Actual: the `/models` result remains stuck at the bottom until another Shrimpy slash command replaces it.

## Boundaries
- Do not fork Pi's full TUI only for presentation polish.
- Do not hardwire special presentation behavior for `/models` alone; use a common command-output pattern.
- Do not remove the underlying Shrimpy slash commands or make them less useful to agents.
- Do not add legacy aliases or compatibility shims.

## Implementation Notes
- Likely files: bundled TUI extension command registration, command output rendering helpers, and any Pi UI hooks used by `pi.registerCommand()`.
- Compare upstream Pi source for the intended lifecycle of extension command output before deciding whether this is a Shrimpy rendering issue or a Pi integration limitation.
- This may intersect with [TUI-001](tui-001.md) because the final command surface should feel coherent across Shrimpy and Pi-owned commands.
- This may intersect with [TUI-002](tui-002-ctrl-o-tool-expansion.md) if both problems share command/tool row invalidation or re-render behavior.

## Done
- Shrimpy-native slash command output no longer remains stale at the bottom of the TUI.
- Repeated slash command runs, normal prompts, model responses, and idle states all have coherent output placement.
- `/models` and other multi-line commands are readable and visually polished in desktop and narrow terminal widths.
- Focused manual verification covers at least `/models`, `/doctor`, `/workspace`, and one short state-changing command such as `/toolrows`.
