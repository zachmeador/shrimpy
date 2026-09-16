# 🦐 In-OS Agent Sandboxing And Git Workflows

Originally researched: 2026-06-01
Last refreshed: 2026-09-14
Status: Research; no runtime validation

## Question

Can Shrimpy use built-in macOS/Linux sandboxing for local agents?

The open questions are:

- which Mac/Linux tools can limit files, network, and subprocesses;
- whether Shrimpy should choose a default yet;
- how git works from inside a sandbox;
- how sandboxed changes move back into the real workspace.

## Current Read

Compare whole-process SRT and nono first, then Smol Machines and Microsandbox where a separate guest kernel is needed. The [runtime scout](sandbox-runtime-scout-2026-08-26.md) owns current versions, advisories, licenses, and the acceptance suite. This page owns OS primitives and git/workspace semantics. [SECURITY.md](../../SECURITY.md) still correctly describes Shrimpy as unsandboxed. No runner was installed or exercised for this refresh.

- macOS: App Sandbox for a host app, Seatbelt/SBPL or equivalent runner policy for an entire agent process, XPC/bookmark brokers for dynamic host access;
- Linux: `bubblewrap`/namespaces plus seccomp as the most practical first runner shape, with Landlock worth studying for unprivileged filesystem and TCP restrictions;
- systemd sandboxing for a long-running gateway service on Linux;
- separate users as an explicit deployment boundary, with filesystem and service permissions reviewed. Missing sandbox support must not silently select this or unrestricted host execution.

Always ask:

- which process is constrained;
- what filesystem view it sees;
- what it can write;
- whether it sees `.git`, credentials, network, browser profiles, or package caches;
- how exceptions and file promotion work.

## What Current Agent Products Suggest

The current [Codex sandbox documentation](https://learn.chatgpt.com/docs/sandboxing) separates OS enforcement from approval policy. Spawned git commands, tests, and package managers inherit the execution boundary. macOS uses Seatbelt; Linux uses bubblewrap and a bundled helper fallback. The documentation recommends a suitable AppArmor profile rather than globally disabling Ubuntu's user-namespace restriction. Do not infer identical defaults across local, cloud, and managed configurations.

[Claude Code's sandboxed Bash](https://code.claude.com/docs/en/sandboxing) remains distinct from its tool permissions. It supports approved outside-sandbox retries and excluded commands; strict settings must account for both. These are product choices, not suitable automatic fallbacks when Shrimpy promises that a resident agent is contained.

For Shrimpy, the unit to constrain is the entire agent process. Permissions, OS policy, and authority of external MCP/ACP/browser services are separate layers. A successful permission response cannot widen an already-running OS sandbox.

The Sep 16 [networking comparison](sandbox-runtime-scout-2026-08-26.md#networking-comparison) separates destination filtering, API-operation permissions, and credential handling. It also records differences in default LAN access, DNS enforcement, proxy bypass prevention, and host IPC across the four leading candidates.

## OS Primitive Notes

### macOS

The existing [macos-seatbelt-helper.md](macos-seatbelt-helper.md) note remains the main macOS research source. Durable points:

- App Sandbox is the supported app-distribution model.
- Seatbelt/SBPL-style profiles are the lower-level policy substrate that can express per-process path and service restrictions.
- XPC services are the normal Apple privilege-separation path.
- Security-scoped bookmarks and picker flows are the user-consent story for folders selected at runtime.
- Sandboxing should apply before loading Node or any large runtime where feasible, because already-open descriptors or inherited services can weaken a late sandbox.

The first Mac proof should use an existing CLI runner around the agent process. A signed helper or menu-bar app is later work for folder consent or native services, not a prerequisite for the experiment. See the [helper note](macos-seatbelt-helper.md).

### Linux

Linux is a toolkit rather than one sandbox:

- Mount namespaces let a process see a different mount tree. A runner can construct a filesystem view with read-only bind mounts, writable scratch directories, private `/tmp`, and no broad home-directory mount.
- Network namespaces isolate network devices, routing tables, firewall rules, ports, and related network state. A runner can block network entirely by giving the process no useful interface, or route through a proxy.
- `bubblewrap` is a practical user-facing constructor for namespaces and bind mounts. It is not the security policy by itself; Shrimpy still has to decide what to mount read-only, what to mount writable, and whether to share network.
- Seccomp filters reduce syscall surface. Kernel docs are explicit that seccomp filtering is not a sandbox by itself; it is a tool sandbox developers combine with other hardening.
- Landlock restricts ambient rights for a process and its children. The [current kernel documentation](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html) distinguishes TCP port control (ABI 4), abstract Unix sockets/signals (ABI 6), thread synchronization (ABI 8), pathname Unix sockets (ABI 9), and UDP controls (ABI 10). These documented capabilities do not imply that a target distribution supplies them. Detect the running ABI and enabled LSM; refuse a launch when a required control is unavailable. Landlock port rules alone are not hostname authorization.
- AppArmor/SELinux and systemd sandboxing can be strong but depend on distro, packaging, and service management. They may fit gateway/service deployment better than per-turn local CLI runs.

The likely Linux first experiment is `bubblewrap` for the execution view, seccomp for syscall reduction, and possibly Landlock as an additional layer where the kernel supports the needed ABI.

## Git And Workspace Models

Decide separately where writes land and which process enforces access. A writable host mount changes host files even when the writer lives in a microVM. A worktree or copy-on-write branch provides change separation, not complete host containment.

### 1. In-place bounded workspace

The sandbox sees the real project directory, usually through a read/write bind mount or allowed path. Writes happen directly to host files. There is no "moving files back" step.

Pros:

- best UX;
- normal editors, tests, and git status work;
- no sync layer to lose metadata or confuse paths;
- matches how local Codex-style workspace sandboxes appear to behave.

Risks:

- every allowed write is a host write;
- package scripts and tests can modify any writable mounted path;
- `.git` write access is powerful: hooks, config, refs, index locks, packed refs, worktrees, and object storage are all mutation surfaces;
- if credentials or SSH agent sockets are mounted, git operations can become network/identity operations too.

Shrimpy implication: in-place sandboxing is good for normal trusted projects, but `.git` and credentials need their own policy rather than being treated as ordinary workspace files.

### 2. In-place workspace with protected git metadata

The project files are writable, but `.git` is read-only or partially blocked. The agent can edit files and run tests, but commit, rebase, tag, checkout, hook installation, and many branch operations fail or require a broker.

Pros:

- protects high-impact repository metadata;
- keeps normal file-edit UX;
- makes "agent changed code" separable from "agent changed history or pushed."

Risks:

- many tools expect to write `.git/index.lock` or read `.git/config`;
- `git status` and `git diff` are mostly read-only, but git has many flags and config mechanisms that can execute helpers or change state;
- implementation can become a pile of fragile git command exceptions.

Shrimpy implication: protect repository metadata and give any trusted git broker a fixed operation surface. `git add` writes the index and object database; it is not a read-only exception. Even inspection can invoke helpers through configuration: review [Git config](https://git-scm.com/docs/git-config), including external diff/textconv, fsmonitor, hooks, and credential helpers. Host-side git must not blindly trust agent-edited configuration.

### 3. Scratch workspace plus patch promotion

The agent receives a copy of the repo or selected files and writes only inside a scratch directory. At the end, Shrimpy shows a diff and applies it to the real workspace through a trusted patch step.

Pros:

- clean separation between agent execution and host mutation;
- easy to exclude `.git`, credentials, caches, and unrelated files;
- user can review a patch before promotion;
- works for dangerous package installs or generated code experiments.

Risks:

- slower and less ergonomic;
- tests may not reflect host-specific paths or services;
- binary files, file modes, symlinks, renames, and deletes need careful patch representation;
- long-running sessions can drift from the host workspace.

Shrimpy implication: this is a good "higher risk" mode and maybe the right default for untrusted repos, browser-derived code, or package installation experiments.

### 4. Git worktree per run

Shrimpy creates a disposable branch/worktree and runs the agent there. The result returns as a branch, diff, or merge request.

Pros:

- uses git's native model for divergent work;
- normal tests and file paths can run;
- easy to inspect and discard changes.

Risks:

- a git worktree still uses shared repository metadata unless carefully placed;
- `.git` in a worktree is often a pointer file to a gitdir outside the worktree;
- commit operations still need controlled access to object storage, refs, and config;
- setup is more complex for normal users.

Shrimpy implication: a worktree needs its own OS policy and explicit access to the required git directories. [Git documents](https://git-scm.com/docs/git-worktree) the split between per-worktree metadata and the shared common directory. A worktree of the live repository does not become independent just because its checkout lives under `/tmp`. Use a separate repository with its own metadata when isolation of history/configuration is required, and test that it has no object-store alternates back into the live repo. The current pi-permission-modes extension actually disables its Bash sandbox for real worktrees; see the [Pi survey](pi-sandboxing-implementations.md).

## Bringing sandbox changes back into the workspace

If an agent works in a temporary sandbox, check its changes before copying them into the real workspace. The code that copies them back must check for conflicts with newer edits and prevent paths or symlinks from writing outside the workspace. It also needs to handle renames, deletions, file permissions, and binary files correctly. Copying changes back must not run Git hooks or package scripts. Files produced inside a VM can still contain harmful code.

Test this with disposable repositories: ordinary checkouts, worktrees, submodules, repositories whose Git metadata lives elsewhere, and repositories with agent-edited configuration. Include a case where the workspace changes while the agent is working. Check that useful Git operations still work with the chosen restrictions; blocking one file write proves very little. The [shared sandbox tests](sandbox-runtime-scout-2026-08-26.md#shared-acceptance-suite) cover the wider isolation checks.

For the first experiment, run one agent process inside a sandbox, as proposed in the [runtime scout](sandbox-runtime-scout-2026-08-26.md). Sandboxing the shared gateway would still leave its agents together inside one boundary. Record the sandbox software version, host OS, and files and services the agent can access. After a crash, verify that the old agent and its child processes have stopped before starting a replacement.

## Open Questions

- Can Shrimpy get enough macOS enforcement from a CLI helper, or does real UX require a signed app/XPC/bookmark stack?
- Can the proposed per-agent resident process meet privacy and cleanup requirements without excessive idle cost?
- Is `.git` writable access acceptable for trusted projects, or should commit and push always be brokered?
- Is Landlock mature enough across target Linux distributions to be more than an optional hardening layer?
- Can a local patch-promotion mode handle renames, deletes, symlinks, binary files, and executable bits well enough for normal coding work?
- Should package installation happen in scratch by default, even when source edits happen in-place?
- How does browser automation fit: dedicated profile per agent, separate OS sandbox, both, or only remote/browser-service workflows?

## Sources

- Existing Shrimpy research: [macos-seatbelt-helper.md](macos-seatbelt-helper.md).
- OpenAI Codex docs: [Sandbox](https://learn.chatgpt.com/docs/sandboxing).
- Anthropic Claude Code docs: [Security](https://code.claude.com/docs/en/security), [Permissions](https://code.claude.com/docs/en/permissions), [Sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing), [Sandbox environments](https://code.claude.com/docs/en/sandbox-environments).
- Linux kernel docs: [Landlock](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html), [Seccomp BPF](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html).
- Git: [worktree metadata](https://git-scm.com/docs/git-worktree), [configuration and executable helpers](https://git-scm.com/docs/git-config).
- Linux man-pages: [namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html), [mount_namespaces(7)](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html), [network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html).
- `bubblewrap`: [README](https://github.com/containers/bubblewrap/blob/main/README.md), [security policy](https://github.com/containers/bubblewrap/security).
