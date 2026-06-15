# Workers

Use a worker when you can hand off a clear task, inspect progress, and check the result.

Prepare a handoff with scope, cwd, constraints, expected output, and what not to change. Start small:

```bash
shrimpy worker backends --refresh
shrimpy worker start --cwd <path> --goal "<goal>" "<task>"
shrimpy worker start --backend codex --agent <id> --cwd <path> --goal "<goal>" "<task>"
shrimpy worker list
shrimpy worker list --all
shrimpy worker status <id>
shrimpy worker read <id>
shrimpy worker tail <id> --lines 80
shrimpy worker send <id> "<clarification>"
shrimpy worker wait <id> --timeout-ms 600000
shrimpy worker cancel <id>
shrimpy worker close <id>
```

Use workers for coding or investigation that benefits from isolation. Do not delegate vague ownership decisions, destructive cleanup, or work that needs continuous user judgment.

The parent remains responsible for reading the result, checking files or tests, and reporting what was accepted.

More detail: `reference/cli.md`.
