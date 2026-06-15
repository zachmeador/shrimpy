# Vault

Use `agents/<id>/vault/` for durable material that should not load into every prompt: captures, source packets, research notes, trackers, reports, PDFs, generated artifacts, and saved user files.

Use `context/` only for compact memory intended to affect future prompts. Put bulky evidence and source material in `vault/`, then summarize durable facts into `context/` only when needed.

Good captures include source, date, request, owner agent, and next action. Prefer an inspectable Markdown note plus nearby files over raw chat history.

Start from the owner:

```text
agents/<id>/vault/<collection>/<slug>/
```

Useful inspection:

```bash
shrimpy agent show <id>
shrimpy workspace search "<topic>" --limit 10
shrimpy workspace index status
shrimpy workspace index rebuild
shrimpy context files list --agent <id>
shrimpy context files show --agent <id> <path>
shrimpy sessions search "<topic>" --agent <id>
shrimpy channels search <channel> "<topic>"
```

For generated or researched material, save the artifact under `vault/`, then post or report the path through the active channel.

Useful handoffs after saving:

```bash
shrimpy channels post <channel> --agent <id> "Saved: agents/<id>/vault/<collection>/<slug>/"
shrimpy worker start --agent <id> --cwd <path> --goal "<review goal>" "Review agents/<id>/vault/<collection>/<slug>/ and summarize next actions."
```

More detail: `reference/workspace.md`, `reference/memory.md`, `reference/cli.md`.
