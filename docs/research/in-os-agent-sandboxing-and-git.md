# In-OS Agent Sandboxing And Git Workflows

Date: 2026-06-01
Status: Research

## Question

Can Shrimpy use built-in macOS/Linux sandboxing for local agents, and when should it use a VM-backed sandbox instead?

The open questions are:

- which Mac/Linux tools can limit files, network, and subprocesses;
- whether a VM-backed runner such as Gondolin should be part of the sandbox backend set;
- whether Shrimpy should choose a default yet;
- how git works from inside a sandbox;
- how sandboxed changes move back into the real workspace.

## Current Read

Do not choose the default yet. First define the policy words and the inspection command. Keep the research focused on what Shrimpy can start and inspect directly.

- macOS: App Sandbox for a host app, Seatbelt/SBPL or equivalent runner policy for short-lived execution, XPC/bookmark brokers for dynamic host access;
- Linux: `bubblewrap`/namespaces plus seccomp as the most practical first runner shape, with Landlock worth studying for unprivileged filesystem and TCP restrictions;
- VM-backed: evaluate [Gondolin](https://github.com/earendil-works/gondolin) as a TypeScript-controlled local Linux micro-VM backend for higher-risk agent turns, especially when Shrimpy wants host-mediated network/secrets/filesystem policy rather than direct host writes;
- systemd sandboxing for a long-running gateway service on Linux;
- separate users as a blunt but understandable fallback.

Always ask:

- which process is constrained;
- what filesystem view it sees;
- what it can write;
- whether it sees `.git`, credentials, network, browser profiles, or package caches;
- how exceptions and file promotion work.

## What Current Agent Products Suggest

Codex: sandbox mode is the runner limit; approvals are the stop-and-ask layer. Local Codex defaults to workspace-write with network off. Spawned commands inherit the sandbox, including `git`, package managers, and tests. The local backends are Seatbelt on macOS and `bwrap` plus seccomp on Linux.

Claude Code: permissions and sandboxed Bash are separate. Its docs say Read/Edit deny rules do not stop arbitrary Python or Node subprocesses from opening files. The built-in Bash sandbox is the Claude-enforced option.

Shrimpy takeaway: copy mechanisms, not marketing.

## OS Primitive Notes

### macOS

The existing [macos-seatbelt-helper.md](macos-seatbelt-helper.md) note remains the main macOS research source. Durable points:

- App Sandbox is the supported app-distribution model.
- Seatbelt/SBPL-style profiles are the lower-level policy substrate that can express per-process path and service restrictions.
- XPC services are the normal Apple privilege-separation path.
- Security-scoped bookmarks and picker flows are the user-consent story for folders selected at runtime.
- Sandboxing should apply before loading Node or any large runtime where feasible, because already-open descriptors or inherited services can weaken a late sandbox.

The likely Mac product shape is still a tiny signed helper or menu-bar app that launches Shrimpy turns/gateway processes under a policy and brokers the host things that should not be granted directly.

### Linux

Linux is a toolkit rather than one sandbox:

- Mount namespaces let a process see a different mount tree. A runner can construct a filesystem view with read-only bind mounts, writable scratch directories, private `/tmp`, and no broad home-directory mount.
- Network namespaces isolate network devices, routing tables, firewall rules, ports, and related network state. A runner can block network entirely by giving the process no useful interface, or route through a proxy.
- `bubblewrap` is a practical user-facing constructor for namespaces and bind mounts. It is not the security policy by itself; Shrimpy still has to decide what to mount read-only, what to mount writable, and whether to share network.
- Seccomp filters reduce syscall surface. Kernel docs are explicit that seccomp filtering is not a sandbox by itself; it is a tool sandbox developers combine with other hardening.
- Landlock restricts ambient rights for a process and its children. It supports filesystem rules and TCP network rules in newer ABI versions, and it is designed for unprivileged processes to restrict themselves. Any Shrimpy use would need runtime ABI detection and graceful degradation.
- AppArmor/SELinux and systemd sandboxing can be strong but depend on distro, packaging, and service management. They may fit gateway/service deployment better than per-turn local CLI runs.

The likely Linux first experiment is `bubblewrap` for the execution view, seccomp for syscall reduction, and possibly Landlock as an additional layer where the kernel supports the needed ABI.

### VM-backed: Gondolin

[Gondolin](https://github.com/earendil-works/gondolin) is a local Linux micro-VM sandbox with a TypeScript/Node control plane. It runs untrusted code inside a QEMU VM by default, with an experimental `krun` backend, and keeps key I/O decisions in host-side JavaScript.

The interesting fit for Shrimpy is not just compute isolation. Gondolin also exposes policy hooks Shrimpy already wants to model:

- host-mediated HTTP/TLS egress with allowlists and request/response hooks;
- secret placeholders inside the guest, with real secret substitution only for allowed destinations;
- programmable VFS mounts, so `/workspace` can be backed by memory, a host directory, or a policy wrapper;
- attachable shells, SSH, ingress for guest HTTP services, and disk checkpoints.

That makes Gondolin a serious candidate for a `sandbox.backend = "gondolin"` style runner for high-risk tasks, package-install experiments, or scratch/patch workflows. It maps especially well to "scratch workspace plus patch promotion" and "git worktree per run": mount a narrow `/workspace`, keep `.git` and credentials out unless explicitly brokered, run tools inside the VM, then promote a diff or branch through a trusted Shrimpy step.

It should not replace the in-OS research. A micro-VM runner has different tradeoffs: the guest is Linux even on macOS, default images are Alpine-based, extra packages may require custom images, mediated networking does not cover every protocol class, and VM assets/backends add operational weight. Native Seatbelt/App Sandbox/XPC remains the likely answer for Mac app distribution, bookmarks, TCC-adjacent access, and local browser/profile integration.

Shrimpy implication: keep the policy vocabulary backend-neutral. `readRoots`, `writeRoots`, `network`, `git`, `secrets`, `browser`, and `promotion` should describe intent; backends such as `seatbelt`, `bubblewrap`, `gondolin`, and `none` translate that intent into their own enforcement mechanisms.

## Git And Workspace Models

This is the most important unresolved design area.

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

Shrimpy implication: treat git write operations as a brokered capability: `status`, `diff`, and maybe `add` are lower risk; `commit`, `checkout`, `merge`, `rebase`, `push`, hook/config changes, and credentialed network operations need clear approval or a separate trusted path.

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

Shrimpy implication: promising for coding-agent delegation, but not a complete sandbox story by itself. It pairs well with OS sandboxing if Shrimpy creates a dedicated gitdir/worktree root and explicitly decides which git operations are allowed.

## Small Shrimpy Policy

Before choosing a backend, Shrimpy should model what it wants to enforce:

```ts
type SandboxPolicy = {
  profile: "none" | "workspace-read" | "workspace-write" | "scratch-patch" | "gateway" | "browser";
  backend: "none" | "seatbelt" | "bubblewrap" | "gondolin";
  readRoots: string[];
  writeRoots: string[];
  network: "blocked" | "proxy" | "client" | "host";
  git: "read-only" | "worktree" | "brokered-commit" | "full";
  secrets: "none" | "brokered" | "env-allowlist";
  browser: "none" | "dedicated-profile" | "brokered";
  promotion: "in-place" | "patch" | "branch" | "manual";
};
```

The value is not the TypeScript shape itself; it is the discipline of asking the same questions on every backend.

## Likely First Experiments

1. **Inspection only.** Add a CLI command or diagnostic check that says "no native sandbox active" and shows intended policy once configured.
2. **Linux command runner prototype.** Use `bubblewrap` to run a benign command with a read-only project mount and writable scratch, then inspect whether writes, network, and `.git` behave as expected.
3. **Mac command runner prototype.** Build or borrow a tiny Seatbelt runner that launches a command before Node initializes, with a narrow path profile.
4. **Gondolin runner spike.** Run a benign command in a Gondolin VM with a narrow `/workspace` VFS mount, host-mediated network disabled or allowlisted, and no raw credential mounts; compare startup cost, package availability, diff extraction, and diagnostics against the in-OS prototypes.
5. **Git policy tests.** Create fixtures for `.git` read-only, brokered commit, patch promotion, and worktree-per-run.
6. **Violation diagnostics.** Capture denied filesystem/network/syscall events where the platform exposes them and translate them into user-facing recommendations.
7. **Security-agent audit awareness.** Have the planned `security` agent report effective sandbox state and unmanaged broad-access paths, but not remediate.

## Open Questions

- Can Shrimpy get enough macOS enforcement from a CLI helper, or does real UX require a signed app/XPC/bookmark stack?
- Should the gateway be one sandboxed long-running process, or should each agent turn be a short-lived sandboxed worker?
- Is `.git` writable access acceptable for trusted projects, or should commit and push always be brokered?
- Is Landlock mature enough across target Linux distributions to be more than an optional hardening layer?
- Can a local patch-promotion mode handle renames, deletes, symlinks, binary files, and executable bits well enough for normal coding work?
- Should package installation happen in scratch by default, even when source edits happen in-place?
- Should high-risk coding runs default to a Gondolin VM while trusted local runs use lighter in-OS sandboxing?
- How does browser automation fit: dedicated profile per agent, separate OS sandbox, both, or only remote/browser-service workflows?

## Sources

- Existing Shrimpy research: [macos-seatbelt-helper.md](macos-seatbelt-helper.md).
- Gondolin: [GitHub repository](https://github.com/earendil-works/gondolin), [documentation](https://earendil-works.github.io/gondolin/), [architecture overview](https://earendil-works.github.io/gondolin/architecture/), [security design](https://earendil-works.github.io/gondolin/security/), [limitations](https://earendil-works.github.io/gondolin/limitations/).
- OpenAI Codex docs: [Sandbox](https://developers.openai.com/codex/concepts/sandboxing), [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security), [Shell tool](https://developers.openai.com/api/docs/guides/tools-shell).
- Anthropic Claude Code docs: [Security](https://code.claude.com/docs/en/security), [Permissions](https://code.claude.com/docs/en/permissions), [Sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing), [Sandbox environments](https://code.claude.com/docs/en/sandbox-environments).
- Linux kernel docs: [Landlock](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html), [Seccomp BPF](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html).
- Linux man-pages: [namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html), [mount_namespaces(7)](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html), [network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html).
- `bubblewrap`: [README](https://github.com/containers/bubblewrap/blob/main/README.md), [security policy](https://github.com/containers/bubblewrap/security).
