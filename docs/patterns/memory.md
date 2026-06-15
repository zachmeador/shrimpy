# Memory

Search before inventing. Use existing workspace knowledge when the user asks about prior work, preferences, saved files, sessions, channels, or agent memory.

Start with narrow inspection:

```bash
shrimpy workspace index status
shrimpy workspace index rebuild
shrimpy workspace search "<query>"
shrimpy sessions list --agent <id>
shrimpy sessions search "<query>" --agent <id>
shrimpy sessions read <session> --around <entry> --agent <id>
shrimpy channels search <channel> "<query>"
shrimpy channels read <channel> --limit 50
shrimpy context files list --agent <id>
shrimpy context files show --agent <id> <path>
shrimpy context --turn --channel <channel> --agent <id>
```

Then read the smallest source file or transcript window that supports the answer. If search surfaces are unavailable or the evidence is missing, say what was checked and ask instead of guessing.

Do not treat memory lookup as permission to crawl personal directories. Stay inside the Shrimpy workspace unless the user names another path.

More detail: `reference/memory.md`, `reference/workspace.md`, `reference/sessions.md`, `reference/channels.md`, `reference/cli.md`.
