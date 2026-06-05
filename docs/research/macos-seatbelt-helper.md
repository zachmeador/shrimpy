# 🦐 macOS Seatbelt Sandboxing and a Tiny Shrimpy Helper

Date: 2026-05-11
Status: Research

This note looks at Apple's macOS sandboxing stack at a high level, then sketches what a small Mac helper could look like for hosting Shrimpy with native per-agent sandboxing.

## Seatbelt in one page

Apple exposes two related but different sandboxing surfaces on macOS:

- **App Sandbox** is the public app-developer feature. It is enabled with code-signing entitlements such as `com.apple.security.app-sandbox`, `com.apple.security.network.client`, and user-selected file access keys. It is the normal route for Mac App Store apps and sandboxed Developer ID apps.
- **Seatbelt / `sandbox(7)`** is the lower-level policy system underneath the macOS sandbox. It uses sandbox profiles, often written in Sandbox Profile Language (SBPL), to allow or deny classes of operations for a process and its children. Chromium's macOS sandbox documentation explicitly distinguishes this lower-level sandbox from App Sandbox.

At runtime, a process ends up with a policy attached to it. The kernel enforces that policy when the process tries to acquire resources: file paths, sockets, Mach services, IOKit objects, sysctls, process operations, and other system facilities. A typical hardened profile starts with:

```scheme
(version 1)
(deny default)
```

Then it adds narrow `allow` rules for the resources the process needs:

```scheme
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath (param "WORKSPACE_READ")))
(allow file-write* (subpath (param "AGENT_SCRATCH")))
(allow network-outbound)
```

SBPL is a Scheme-like policy language. Profiles can be parameterized, so the host can compile or apply one policy template with per-agent paths such as a workspace root, an agent root, a scratch directory, or a downloads directory.

The critical behavioral detail is that sandboxing is usually enforced at **resource acquisition time**. If a process opens a file descriptor, Mach port, socket, or library before entering the sandbox, that handle may remain usable after lockdown. That is why sandboxed architectures try to apply the sandbox as early as possible and avoid linking or initializing large frameworks before the policy is active. Chromium's newer macOS design uses minimal helper executables that apply the sandbox before loading the real framework code.

Apple's older `sandbox_init()` API and `sandbox-exec` tooling are documented as deprecated, while App Sandbox is the supported public app model. In practice, the profile system is still important for browser-style helper processes and local developer tooling, but it should be treated as an implementation substrate rather than a polished public product API.

## App Sandbox versus Seatbelt profiles

For Shrimpy, the practical split is:

| Surface | Strength | Weakness | Fit |
|---|---|---|---|
| App Sandbox entitlements | Supported, signable, app-distribution friendly | Coarse; not designed for arbitrary per-agent filesystem policies | Main Mac app, config UI, broker, persistent host |
| XPC services | Good privilege separation; each service can have its own sandbox | Best when service jobs are static and app-bundled | Native brokers, credential or filesystem mediators |
| Inherited App Sandbox child tool | Simple way for a sandboxed app to run a bundled CLI | Child inherits static rights only; not enough for dynamic per-agent policy | Tiny bundled commands with the same app-level rights |
| Seatbelt/SBPL helper process | Fine-grained profile per agent or per turn | Deprecation caveats; profile syntax is not fully official public API | Agent execution sandbox, especially outside App Store constraints |

Apple recommends XPC for privilege separation over plain child processes. Apple also notes that inherited sandbox child tools receive static entitlement rights, not dynamic access granted after launch, so a helper needs either passed data, security-scoped bookmarks, or a broker when user-selected paths are involved.

## What native sandboxing should mean for Shrimpy

Shrimpy's current architecture is CLI-first and Pi-backed: sessions are the execution unit, channels are logs/routing, and agent resources live in the workspace. A Mac helper should preserve that shape. It should not become a second runtime or policy brain.

The native helper's job would be to launch Shrimpy/Pi turns under a per-agent macOS sandbox and broker the few host resources that cannot be safely granted directly.

This should sit behind a Shrimpy sandbox abstraction, not leak Seatbelt concepts into the agent/runtime model. macOS and Linux have different primitives, but Shrimpy's policy vocabulary can be shared: readable roots, writable roots, network mode, environment allowlist, process lifetime, device access, browser profile access, and brokered capabilities.

```text
Shrimpy policy
  profile: agent-workspace-write
  read: workspace, agent-root
  write: agent-root, runtime, scratch
  network: client | blocked | host
  brokers: secrets, bookmarks, tcc
        |
        v
Sandbox backend
  macOS: Seatbelt/App Sandbox/XPC
  Linux: bubblewrap namespaces + bind mounts
  VM: Gondolin micro-VM runner
  future: container runner, Windows AppContainer
```

On Linux, the obvious first backend is `bubblewrap` (`bwrap`). It is a low-level sandbox construction tool used by Flatpak and similar projects. It creates a new filesystem view with bind mounts and namespaces, then execs the target command. Like Seatbelt profiles, it is not a complete policy by itself: Shrimpy would be responsible for converting `read`, `write`, `network`, and environment policy into concrete `bwrap` arguments.

That means Shrimpy should model sandboxing as an execution adapter:

```ts
type SandboxSpec = {
  profile: "no-tools" | "workspace-read" | "agent-workspace-write" | "gateway" | "browser";
  read: SandboxMount[];
  write: SandboxMount[];
  network: "blocked" | "client" | "host";
  env: Record<string, string>;
  command: string[];
  cwd: string;
};
```

Then each platform owns translation:

| Backend | Translation job |
|---|---|
| `seatbelt` | Build/apply an SBPL profile, use bookmarks/XPC brokers for dynamic access, then launch Shrimpy. |
| `bubblewrap` | Build a minimal root with `--ro-bind`, `--bind`, `/proc`, `/dev`, tmpfs scratch, PID/session isolation, and optional `--share-net`. |
| `gondolin` | Start a local Linux micro-VM, mount a narrow workspace through Gondolin VFS, and enforce HTTP/TLS/secrets policy in the host TypeScript control plane. |
| `none` | Run directly, but still report that no native sandbox is active. Useful for unsupported platforms and debugging. |

The important design point: agents and config should talk about Shrimpy capabilities, not macOS operations or Linux namespace flags.

Gondolin belongs in the backend set as the heavier isolation option, not as a replacement for the Mac helper. It is strongest for high-risk agent turns where a Linux guest is acceptable and Shrimpy can promote results back through a diff, branch, or narrow VFS mount. Native Seatbelt/App Sandbox/XPC is still needed for Mac-specific user consent, security-scoped bookmarks, TCC-adjacent resources, and local app/browser integration.

The useful security boundary is:

```text
ShrimpyMac.app
  app sandbox + UI + config + launch control
  owns user consent, bookmarks, status, logs
  |
  | XPC / local authenticated control channel
  v
ShrimpySandboxRunner
  minimal native executable
  applies Seatbelt profile before launching runtime
  |
  v
node dist/cli.js / shrimpy gateway / shrimpy run
  Pi session + Shrimpy tools
  restricted to per-agent workspace paths and declared network policy
```

The runner should be deliberately boring:

- Accept a structured launch request: agent id, session type, channel/session label, workspace paths, network mode, writable mounts, environment allowlist, command arguments.
- Build or select a policy template: `readonly-workspace`, `agent-workspace-write`, `network-client`, `no-network`, `browser-automation`, etc.
- Apply the sandbox before starting the expensive runtime.
- Drop inherited environment variables that are not explicitly allowed.
- Put each run in a per-agent scratch directory under the Shrimpy workspace.
- Stream stdout/stderr and an exit record back to the app or Shrimpy logs.

## Tiny helper product shape

A first version could be a small menu-bar app, not a full IDE:

- **Install/check Shrimpy**: find `shrimpy`, Node, model/auth files, and the workspace config.
- **Run gateway**: start/stop/restart `shrimpy gateway` as a sandboxed child.
- **Agent sandbox profiles**: show each configured agent and the effective local policy: writable roots, readable roots, network allowed/blocked, browser access allowed/blocked.
- **Grant folders**: use `NSOpenPanel` and security-scoped bookmarks to add user-selected workspace or vault paths.
- **Logs**: show gateway logs, sandbox violations, and recent run exits.
- **CLI bridge**: expose equivalent commands first, for example `shrimpy mac profiles inspect`, `shrimpy mac run --agent <id>`, and `shrimpy mac gateway start`, with the app as a native wrapper around those mechanics.

The Shrimpy-specific config could live in the workspace rather than app preferences:

```json
{
  "macSandbox": {
    "defaultProfile": "agent-workspace-write",
    "agents": {
      "shrimpy": {
        "network": "client",
        "read": ["workspace", "agent-root"],
        "write": ["agent-root", "runtime", "scratch"],
        "browserAutomation": false
      }
    }
  }
}
```

That keeps policy inspectable by agents and humans, which matches Shrimpy's existing file-backed design.

## Policy model for agents

Start with coarse named profiles before trying to synthesize every SBPL rule:

| Profile | Intended use | Reads | Writes | Network |
|---|---|---|---|---|
| `no-tools` | passive summarization or memory work | Shrimpy config, agent identity/memory, channel logs | agent memory/runtime only | blocked |
| `workspace-read` | answer questions over local context | workspace + agent root | agent runtime/scratch only | blocked or opt-in |
| `agent-workspace-write` | normal coding/task execution | workspace + agent root | configured workspace roots + scratch | opt-in |
| `gateway` | long-running surfaces and schedules | workspace state/config | channel logs, runtime logs, state | client/server as configured |
| `browser` | local browser automation | browser profile dir, downloads scratch | browser profile/download scratch | client |

The policy should be visible in Shrimpy's own capability inspection. If `TOOLS-001` adds effective Pi tool visibility, the Mac sandbox state should show up in the same mental model: not just "agent has shell", but "agent has shell inside profile X with writable roots Y".

## Brokered access

Some access should not be granted directly to the agent process:

- Security-scoped bookmarks and PowerBox-selected folders.
- Secrets, model provider tokens, and auth files.
- Camera, microphone, Contacts, Calendar, Apple Events, and other TCC-protected resources.
- Privileged host operations such as installing LaunchAgents or changing app settings.

For these, the app or an XPC service should act as a broker with explicit request/approval semantics. The agent asks for a capability; the host evaluates policy, user consent, and audit logging; the sandboxed runner receives only the narrow result, such as a file descriptor, copied file, signed token, or temporary scratch path.

## Implementation path

1. **Document-only model.** Add config vocabulary for intended macOS profiles, but do not enforce it. This lets Shrimpy inspect and discuss desired policy.
2. **CLI launcher prototype.** Build `shrimpy-mac-runner` as a tiny native executable that launches `shrimpy run` or `shrimpy gateway` under one static profile on macOS.
3. **Per-agent profile selection.** Add named profile templates and workspace-path parameters.
4. **Violation diagnostics.** Capture `sandboxd` logs relevant to the child pid and turn them into actionable Shrimpy diagnostics.
5. **Menu-bar wrapper.** Add the smallest native app that manages bookmarks, starts the gateway, and displays status.
6. **Brokers.** Add XPC services only when a concrete resource cannot be safely handled with static profile grants.

## Design cautions

- Do not make the Mac app a second Shrimpy control plane. The CLI remains the source of truth.
- Apply the sandbox before loading Node or any large framework where feasible. If that is not feasible for the Node process itself, use a tiny native launcher that locks down first and then `exec`s Node.
- Avoid broad home-directory read access. Agent memory and vaults should be explicit.
- Treat network as a profile feature, not a default. Channel surfaces and model calls may need network; local code-reading agents often do not.
- Expect compatibility churn. System frameworks may touch resources that were not obvious from app code, so profile work needs iterative diagnostics.
- Keep App Store distribution out of the first milestone. Developer ID signed distribution is likely a better target while experimenting with Seatbelt profile enforcement.

## Open questions

- Should Shrimpy rely on macOS profiles directly, or should it delegate sandbox execution to Pi when Pi already has a macOS sandbox runner available?
- Should Shrimpy expose Gondolin as a high-isolation backend for coding turns while keeping the Mac helper focused on native policy, bookmarks, and brokers?
- Does the gateway need one sandbox for the whole process, or should individual agent turns run in separate short-lived sandboxed workers?
- How should browser automation be isolated: separate browser profile per agent, separate Seatbelt profile, or both?
- Should network policy distinguish model-provider egress from arbitrary internet egress?
- How much TCC-brokered native access should Shrimpy ever expose to agents?

## Sources

- Apple Developer Documentation: [App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- Apple Developer Documentation: [Configuring the macOS App Sandbox](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox)
- Apple Documentation Archive: [Enabling App Sandbox](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
- Apple Developer Documentation: [Embedding a command-line tool in a sandboxed app](https://developer.apple.com/documentation/Xcode/embedding-a-helper-tool-in-a-sandboxed-app)
- Apple Documentation Archive: [Creating XPC Services](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingXPCServices.html)
- BSD man page mirror: [`sandbox_init(3)`](https://www.unix.com/man_page/osx/3/sandbox_init/)
- Chromium: [The Mac Sandbox](https://chromium.googlesource.com/chromium/src/+/main/sandbox/mac/)
- Chromium: [Mac Sandbox V2 Design Doc](https://chromium.googlesource.com/chromium/src/+/HEAD/sandbox/mac/seatbelt_sandbox_design.md)
- containers: [bubblewrap README](https://github.com/containers/bubblewrap/blob/main/README.md)
- containers: [bubblewrap security overview](https://github.com/containers/bubblewrap/security)
- Gondolin: [GitHub repository](https://github.com/earendil-works/gondolin), [documentation](https://earendil-works.github.io/gondolin/), [architecture overview](https://earendil-works.github.io/gondolin/architecture/)
