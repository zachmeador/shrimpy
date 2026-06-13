# 🦐 SECURITY-001: Local Agent Sandboxing

Status: todo
Priority: P2
Area: Security

## Why
Some agents should get a workspace folder, not the whole machine. Shrimpy needs a local sandbox story for macOS and Linux that normal people can live with.

## Explore
- Prefer in-OS sandboxing first, but evaluate Gondolin as a VM-backed runner for high-risk turns. Study macOS App Sandbox, Seatbelt/SBPL, XPC, bookmarks, Linux namespaces, `bubblewrap`, seccomp, Landlock, systemd sandboxing, separate users, and Gondolin's host-mediated network/secrets/VFS model.
- Define the small policy shape Shrimpy needs: reads, writes, network, git, secrets, browser, devices, and promotion back to the real workspace.
- Decide how git works: in-place edits, `.git` access, scratch patches, worktrees, commits, and pushes.
- Design `shrimpy` inspection output that shows the active sandbox profile.
- Keep audit work in the existing mechanic audit skills.

## Do Not
- Do not implement native sandbox runners as part of this strategy item.
- Do not assume a micro-VM removes the need for Shrimpy-level policy vocabulary, inspection, git rules, and promotion semantics.
- Do not grant broad home-directory access as the convenient default.
- Do not present prompt rules, command allowlists, disabled tools, wake policy, remote execution, or separate nodes as sandboxing.
- Do not block the simpler macOS setup/install work on this item.

## Notes
- Later-scope follow-up to the macOS setup/install work completed for the `0.3.0` release.
- Builds on `docs/research/macos-seatbelt-helper.md`.
- Builds on `docs/research/in-os-agent-sandboxing-and-git.md`.
- Include a Gondolin comparison in the strategy: where VM-backed execution is preferable, where native in-OS sandboxing is still required, and how the same Shrimpy policy shape maps to both.
- Related product direction: `docs/musings/desktop-spotlight-surface.md`.
- Likely future files: sandbox policy docs, session launch code, gateway lifecycle code, service definitions, and platform-specific helpers or runners.

## Done
- Recommend first macOS and Linux paths.
- Decide whether Gondolin belongs in the first implementation tranche, a later high-isolation backend, or only as related prior art.
- Define named sandbox profiles and their reads, writes, network, browser, device, secret, and git behavior.
- Define how sandboxed changes move into the real workspace.
- Define the `shrimpy` inspection surface.
- Split implementation work into follow-up backlog items.
