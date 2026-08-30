# 🦐 Sandboxing Runtime Scout

Date: 2026-08-26
Status: Research

## Question

Have useful sandboxing libraries or runtimes appeared since Shrimpy's earlier Seatbelt, bubblewrap, `nono`, and Pi-extension research?

This scout looks for a backend that could contain an entire Shrimpy/Pi child process for [SECURITY-006](../backlog/proposals/security-006-session-authority.md). A wrapper around Bash alone is not enough. The contained child must inherit one kernel boundary, receive no provider credentials or kernel-store access, and talk to its supervising parent through a narrow channel.

Sources and releases were inspected on 2026-08-26. All candidates remain pre-1.0 or preview software.

## Executive Read

Yes. Two projects are now worth direct experiments:

1. **Anthropic Sandbox Runtime (`srt`) is the best immediate process-runner spike.** It is a TypeScript library and CLI that wraps arbitrary process trees with Seatbelt on macOS and bubblewrap on Linux. It now includes capability checks, violation attribution, proxy enforcement, and active upstream maintenance. Shrimpy can use it around the whole child process rather than adopting a Pi extension that covers only selected tools.
2. **Microsandbox is the best microVM spike.** It offers a TypeScript SDK, local libkrun-backed VMs, explicit read-only/read-write host mounts, explicit deny-by-default network policies, secret brokering, and persistent or ephemeral guest state. It is a stronger boundary for high-risk workers, but it introduces a Linux guest, native artifacts, images, and a larger host/guest integration seam.

Do not select either as the permanent backend before a local bake-off. Prototype the OS-native runner first because it matches the current SECURITY-006 build sequence. Keep the runner contract broad enough for a microVM backend later.

Several other projects are useful evidence without being good dependencies yet:

- Microsoft MXC has an unusually good cross-platform policy and capability model, but its own README says current generated policies are overly permissive and must not be treated as security boundaries.
- NVIDIA OpenShell validates Shrimpy's supervisor, credential-broker, and scoped-RPC direction, but adopting it would import another gateway and control plane.
- Shuru has an elegant Mac-first ephemeral microVM workflow, but its TypeScript SDK requires Bun and an installed CLI, while Linux support remains experimental and ARM64-only.
- `@torkbot/sandbox` is the closest architectural match to Shrimpy's proposed parent-broker model, but it is extremely young.

## Shortlist

| Candidate | Boundary | Interface | Current read |
|---|---|---|---|
| [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime) | OS-native process tree | TypeScript library and CLI | Prototype now |
| [`microsandbox`](https://github.com/superradcompany/microsandbox) | Local Linux microVM | TypeScript, Rust, Python, and Go SDKs; CLI | Prototype as the stronger second backend |
| [`shuru`](https://github.com/superhq-ai/shuru) | Local Linux microVM | CLI and Bun-based TypeScript SDK | Mac-only comparison spike if useful |
| [`@microsoft/mxc-sdk`](https://github.com/microsoft/mxc) | Several OS-native and VM backends | Versioned JSON policy and TypeScript SDK | Borrow concepts; do not trust as a boundary yet |
| [OpenShell](https://github.com/NVIDIA/OpenShell) | Container or microVM workload plus in-guest restrictions | Gateway, CLI, SDK, supervisor | Architecture reference, not a Shrimpy dependency |

## 1. Anthropic Sandbox Runtime

Anthropic's [`sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime) is the clearest new fit. The earlier Pi survey encountered a fork through `pi-sandbox`; Shrimpy can now evaluate the maintained upstream directly.

The library wraps arbitrary commands, not only agent tool calls:

- macOS uses generated Seatbelt profiles through `sandbox-exec`;
- Linux uses bubblewrap, a network namespace, and optional seccomp support;
- Windows support exists but is still labeled alpha;
- filesystem rules apply to the whole child process tree;
- network traffic can be restricted to a host proxy and filtered by domain and port;
- violations can be attributed to an opaque command id and returned as model-facing diagnostics.

The upstream released `v0.0.74` on 2026-08-25. Changes since the 2026-07-26 Pi survey include per-invocation violation attribution, model-facing network-denial reasons, port-qualified host rules, more proxy hardening, TLS termination and credential substitution, and a JVM agent for Java tools. The project is still explicitly a beta research preview.

### Why it maps well

Shrimpy can initialize the sandbox in the trusted parent, translate `SessionPolicy.fileAccess` into a runtime config, then spawn the entire Pi child through `SandboxManager.wrapWithSandbox()`. Descendant Bash commands and in-process Node file operations receive the same kernel boundary.

The parent should pass a minimal environment and use inherited pipes or one dedicated file descriptor for RPC. This avoids granting a general local socket or network path. The child receives only:

- system runtime reads required by Node;
- declared read or read-write roots;
- a private scratch directory and synthetic `HOME`;
- its own bounded transcript/runtime area;
- the inherited RPC channel.

Use the programmatic config object. Do not let a project-local settings file widen the policy, and do not rely on the CLI's missing-settings fallback. Keep Apple Events disabled because SRT documents that enabling them lets launched applications escape the child sandbox.

### What still needs proof

- The macOS profile must run a non-interactive Pi child and its normal subprocesses without broad home access.
- The Linux path depends on bubblewrap and usable unprivileged user namespaces. Ubuntu AppArmor settings can block initialization.
- Shrimpy must clear the environment itself; wrapping a command does not make ambient environment variables disappear.
- The parent must treat initialization or capability degradation as fatal for a policy that claims containment.
- SRT has had a fixed network-sandbox advisory and continues to find edge cases. Pin an exact version and keep adversarial conformance tests in Shrimpy.

## 2. Microsandbox

[`microsandbox`](https://github.com/superradcompany/microsandbox) is a local-first libkrun microVM runtime with a native TypeScript SDK. It supports Apple Silicon macOS, KVM-enabled Linux, and WHP-enabled Windows. The project reports sub-100 ms guest boot on an M1, but the first image pull and full Shrimpy guest setup are separate costs that must be measured locally.

Relevant features:

- each sandbox has its own Linux kernel;
- `Sandbox.builder(...).create()` launches a VM as a child process without a daemon;
- host directories and files mount explicitly as read-only or read-write through virtio-fs;
- guest root state can be ephemeral, persistent, or snapshot-based;
- a restricted guest profile drops mount administration, enables `no_new_privs`, and forces `nosuid,nodev` on user mounts;
- network policy can be made deny-by-default or fully airgapped; the zero-config CLI still adds an implicit public-egress rule, so a Shrimpy runner must set the policy explicitly;
- secrets can remain on the host and be attached only to approved upstream requests;
- long-running process handles, streaming I/O, metrics, and lifecycle APIs are already present.

The current `v0.6.15` release shipped on 2026-08-24. The project calls itself beta and has one published moderate advisory, fixed in current versions, for secrets previously exposed in process arguments.

### Why it is not the first backend

The security boundary is attractive, but Shrimpy would no longer start its existing Node child directly. It would need to:

- build or select a Linux image containing compatible Node, Shrimpy, and Pi artifacts;
- translate host paths into guest mount paths;
- carry the parent/child session protocol over the SDK's streaming process I/O or another guest channel;
- decide whether dependencies and caches live in a checkpoint, named volume, or fresh root;
- ship or download native runtime artifacts and images.

That is reasonable for high-risk workers, package installation, browser jobs, and scratch-patch execution. It is heavier than the first contained command watch or background Pi turn.

## 3. Shuru

[`shuru`](https://github.com/superhq-ai/shuru) is a focused local microVM runner for Apple Silicon Macs. It uses Virtualization.framework, resets the guest root on each run, supports reusable checkpoints, and mounts host directories through VirtioFS. A normal mount is overlaid so guest writes disappear when the VM stops; direct host writes require an explicit read-write mount and `--allow-host-writes`.

Its network allowlist and placeholder-secret proxy are directly relevant to future Shrimpy policy. The `@superhq/shuru` SDK exposes exec, streaming processes, file operations, watching, mounts, checkpoints, network rules, and secrets.

The tradeoffs are sharper than Microsandbox:

- the SDK requires Bun and the separately installed `shuru` CLI;
- macOS requires Apple Silicon and macOS 14 or later;
- Linux support is experimental and ARM64-only;
- the project has a much shorter public history.

Shuru is still worth a Mac comparison because its overlay-by-default mount is almost exactly the `scratch-patch` workspace mode from the earlier git research.

## 4. Microsoft MXC

[`microsoft/mxc`](https://github.com/microsoft/mxc) provides a unified JSON policy and TypeScript SDK over Seatbelt, bubblewrap, Windows ProcessContainer, LXC, and experimental VM backends. Its `v0.8.0` prerelease shipped on 2026-08-22.

MXC contains several ideas Shrimpy should copy regardless of backend:

- apply the macOS profile in `pre_exec` with `sandbox_init()` before the target program starts;
- clear the host environment and construct a small child environment explicitly;
- expose backend capability inspection;
- version the wire policy and reject combinations a backend cannot enforce;
- provide a dry run that shows the effective plan;
- keep process-tree lifecycle and cleanup in the runner;
- reject rather than approximate unsupported hostname rules.

It is not a candidate dependency yet. The repository explicitly warns that current generated policies have known overly permissive cases and that no MXC profile should presently be treated as a security boundary. That warning outweighs the attractive API.

## 5. NVIDIA OpenShell

[`NVIDIA/OpenShell`](https://github.com/NVIDIA/OpenShell) is a larger safe-agent runtime rather than a library. Its sandbox supervisor runs inside a container or microVM workload, drops to an unprivileged child, clears capabilities, and layers Landlock, seccomp, a network namespace, and a policy proxy. The gateway owns policy, identity, provider credentials, and lifecycle.

This strongly validates ARCH-002 and SECURITY-006:

- the supervisor, not the child, keeps management authority;
- raw provider credentials stay outside the agent process;
- filesystem and network policy meet at the process boundary;
- the child talks back through a bounded control channel;
- capability setup fails closed;
- policy and denial state are inspectable.

Shrimpy should borrow those invariants, not the control plane. OpenShell's gateway, state, policy lifecycle, provider system, and sandbox object would overlap with Shrimpy's home kernel, sessions, workers, and CLI.

## Other Candidates

### Very early but interesting

- [`@torkbot/sandbox`](https://github.com/torkbot/sandbox) is a TypeScript-first libkrun library with caller-owned copy-on-write state, host-implemented virtual filesystems, explicit host-directory masks, default-deny connection callbacks, request-bound credential injection, inherited guest pipes, and a separate signed helper. That architecture is an unusually close match for Shrimpy. It currently has a tiny user base and should be watched rather than adopted.
- [`ROCm/axis`](https://github.com/ROCm/axis) combines Seatbelt, bubblewrap, Landlock, seccomp, proxy policy, and capability reporting. Its macOS and Linux shape is useful, but it is young, depends partly on MXC, and its platform maturity is uneven.
- [`runseal-labs/runseal`](https://github.com/runseal-labs/runseal) deliberately exposes a small command-execution protocol, policy hashes, capability reporting, audit events, and conformance tests. It is a technical preview with Windows as the reference backend and experimental macOS/Linux implementations.

### Viable, but weaker fits than the shortlist

- [`boxlite-ai/boxlite`](https://github.com/boxlite-ai/boxlite) is an embeddable OCI microVM runtime with Node support and persistent guests. Two critical isolation vulnerabilities affected versions before `0.9.0`: a read-only volume remount bypass and an OCI symlink host-write issue. Current releases include regression tests, but Microsandbox has a cleaner fit for a first Shrimpy VM experiment.
- [`microsoft/quicksand`](https://github.com/microsoft/quicksand) offers portable QEMU VMs, snapshots, mounts, and desktop/browser images. It is Python-first and heavier than Shrimpy needs for ordinary session containment.
- [`apple/containerization`](https://github.com/apple/containerization) is the strongest official Mac substrate: a Swift library that runs each OCI container in its own Virtualization.framework VM on Apple Silicon and macOS 26. It is a possible future native-helper foundation, not a direct TypeScript dependency.
- [Kubernetes Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox) is a useful remote execution API over pod-backed sandboxes and runtime classes such as gVisor or Kata. It assumes a Kubernetes control plane and does not fit the default local home.
- Agent Safehouse, `ai-jail`, `agent-sandbox.nix`, and similar wrappers contain useful profile examples. SRT and MXC expose better embedding seams for Shrimpy than adopting a coding-agent launcher wholesale.

## Recommended Experiments

### Experiment A: OS-native contained child

Build the smallest runner adapter around an exact-pinned SRT release.

1. Start a test child with an empty environment plus `PATH`, scratch `HOME`, and one inherited RPC descriptor.
2. Grant one read-only root, one read-write root, and one scratch root.
3. Deny all network.
4. Prove direct Node reads, Pi file tools, Bash descendants, symlink traversal, and subprocesses all stay inside the same boundary.
5. Prove the child cannot read Shrimpy config, provider state, channel logs, the kernel store, SSH material, or unrelated home files.
6. Kill the child mid-command and verify the parent reaps the full process tree and retains the session lease.
7. Record capability state, the effective plan, and denial diagnostics. Any missing enforcement must fail the run.

Compare the same fixture with `nono`. The decision should come from boundary behavior, diagnostics, packaging, and failure modes rather than API appearance.

### Experiment B: microVM worker

Run the same fixture through Microsandbox.

1. Build a pinned Node/Shrimpy guest image or checkpoint.
2. Mount declared roots with explicit read-only/read-write modes and hide `.git` or kernel state where appropriate.
3. Carry the same child protocol over streaming stdin/stdout.
4. Measure cold boot, warm boot, image size, memory, first-run download, teardown, and host-file semantics.
5. Exercise package installation, a coding worker, and a command watch.

The shared acceptance suite matters more than a shared backend API. A backend may claim `fileAccess` only when it passes the same adversarial cases on the current host.

## Recommendation For SECURITY-006

Keep the proposal's policy vocabulary and supervisor boundary. Refine the implementation choice from “generate Seatbelt or bubblewrap ourselves” to “own the policy translation and conformance tests; initially delegate OS profile construction to a reviewed runtime.”

The likely first stack is:

```text
trusted Shrimpy parent
  owns lease, model traffic, kernel store, policy, cleanup
        |
        | inherited RPC pipe
        v
SRT-contained Node child
  owns one Pi session and declared file roots
  has no credentials, store access, or ambient network
```

Later, high-risk consumers can use the same logical runner contract through a microVM:

```text
trusted Shrimpy parent
        |
        | SDK process stream
        v
Microsandbox VM
  pinned Linux image + Shrimpy child
  explicit host mounts, guest state, and network grants
```

Do not add a general sandbox registry or expose backend-specific policy fields to agents. Select the backend in trusted configuration, report its effective capabilities, and fail closed when the selected backend cannot enforce the resolved session policy.

## Sources

- Shrimpy baseline: [in-os-agent-sandboxing-and-git.md](in-os-agent-sandboxing-and-git.md), [macos-seatbelt-helper.md](macos-seatbelt-helper.md), [pi-sandboxing-implementations.md](pi-sandboxing-implementations.md).
- Anthropic Sandbox Runtime: [repository](https://github.com/anthropic-experimental/sandbox-runtime), [releases](https://github.com/anthropic-experimental/sandbox-runtime/releases), [network advisory](https://github.com/advisories/GHSA-9gqj-5w7c-vx47).
- Microsandbox: [repository and SDK examples](https://github.com/superradcompany/microsandbox), [volume model](https://github.com/superradcompany/microsandbox/blob/main/docs/sandboxes/volumes.mdx), [releases](https://github.com/superradcompany/microsandbox/releases), [security policy](https://github.com/superradcompany/microsandbox/security/policy).
- Shuru: [repository](https://github.com/superhq-ai/shuru), [TypeScript SDK](https://github.com/superhq-ai/shuru/tree/main/packages/sdk), [releases](https://github.com/superhq-ai/shuru/releases).
- Microsoft MXC: [repository](https://github.com/microsoft/mxc), [macOS Seatbelt backend](https://github.com/microsoft/mxc/blob/main/docs/seatbelt/seatbelt-backend.md), [releases](https://github.com/microsoft/mxc/releases).
- NVIDIA OpenShell: [repository](https://github.com/NVIDIA/OpenShell), [architecture](https://github.com/NVIDIA/OpenShell/blob/main/architecture/README.md), [sandbox boundary](https://github.com/NVIDIA/OpenShell/blob/main/architecture/sandbox.md).
- Other candidates: [`@torkbot/sandbox`](https://github.com/torkbot/sandbox), [AXIS](https://github.com/ROCm/axis), [RunSeal](https://github.com/runseal-labs/runseal), [BoxLite](https://github.com/boxlite-ai/boxlite), [Quicksand](https://github.com/microsoft/quicksand), [Apple Containerization](https://github.com/apple/containerization), [Kubernetes Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox).
