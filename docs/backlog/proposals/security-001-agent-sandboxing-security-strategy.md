---
status: todo
priority: P2
area: Security
depends_on: []
---

# 🦐 SECURITY-001: Local Agent Sandboxing

## Why
Some agents should get a workspace folder, not the whole machine. Shrimpy needs a local sandbox story for macOS and Linux that normal people can live with.

## UX Implications

Users can select and inspect a named OS-level containment profile for a session, understand its filesystem, network, browser, device, secret, and git boundaries, and deliberately promote sandboxed changes when the chosen backend requires it. Ordinary unsandboxed sessions must not be relabeled as safe merely because their model tools are restricted.

## Explore
- Study macOS App Sandbox, Seatbelt/SBPL, XPC, bookmarks, Linux namespaces, `bubblewrap`, seccomp, Landlock, systemd sandboxing, and separate users.
- Define the small policy shape Shrimpy needs: reads, writes, network, git, secrets, browser, devices, and promotion back to the real workspace.
- Decide how git works: in-place edits, `.git` access, scratch patches, worktrees, commits, and pushes.
- Design `shrimpy` inspection output that shows the active sandbox profile.
- Keep audit work in the existing mechanic audit skills.

## Do Not
- Do not implement native sandbox runners as part of this strategy item.
- Do not grant broad home-directory access as the convenient default.
- Do not present prompt rules, command allowlists, disabled tools, wake policy, remote execution, or separate nodes as sandboxing.
- Do not block the simpler macOS setup/install work on this item.

## Notes
- Later-scope follow-up to the macOS setup/install work completed for the `0.3.0` release.
- Builds on `docs/research/macos-seatbelt-helper.md`.
- Builds on `docs/research/in-os-agent-sandboxing-and-git.md`.
- Related product direction: `docs/musings/desktop-spotlight-surface.md`.
- Likely future files: sandbox policy docs, session launch code, gateway lifecycle code, service definitions, and platform-specific helpers or runners.

## Done
- Recommend first macOS and Linux paths.
- Define named sandbox profiles and their reads, writes, network, browser, device, secret, and git behavior.
- Define how sandboxed changes move into the real workspace.
- Define the `shrimpy` inspection surface.
- Split implementation work into follow-up backlog items.
