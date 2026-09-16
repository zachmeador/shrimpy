# 🦐 macOS Seatbelt Sandboxing and a Tiny Shrimpy Helper

Originally researched: 2026-05-11
Last refreshed: 2026-09-14
Status: Research; helper and containment remain unimplemented

## Current read

**Prove a CLI-launched, whole-agent sandbox before building a Mac app.** SRT and nono already provide macOS process runners worth testing; Shrimpy does not need to start by inventing an SBPL generator or menu-bar control plane. The [runtime scout](sandbox-runtime-scout-2026-08-26.md) owns the candidate comparison and acceptance suite.

A native app could later own folder selection, bookmarks, status, and narrowly scoped host services. It would not establish a separate sandbox for every Pi session merely by launching Shrimpy. Every session inside the same OS process shares that process's rights. [SECURITY.md](../../SECURITY.md) continues to state that current Shrimpy has no OS containment.

## Apple's two sandbox surfaces

[App Sandbox](https://developer.apple.com/documentation/security/app-sandbox) is Apple's supported application feature, enabled through signing entitlements. It limits an application's access to resources and is required for Mac App Store distribution. Entitlements, user-selected files, and sandboxed helper packaging are the supported app-development surface.

Seatbelt is the lower-level policy mechanism. Its profiles restrict operations such as file access, sockets, Mach services, and process interaction. [Chromium's macOS sandbox design](https://chromium.googlesource.com/chromium/src/+/HEAD/sandbox/mac/seatbelt_sandbox_design.md) explains why it applies policy in a small helper before loading larger frameworks: resources acquired before lockdown can retain authority afterward. Audit inherited descriptors and services as carefully as path rules.

The lower-level `sandbox_init`/`sandbox-exec` interfaces have deprecation and API-stability caveats. Current [SRT](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/src/sandbox/macos-sandbox-utils.ts) still launches through `sandbox-exec`. That is evidence of current tooling practice, not a promise of future Apple support. Use a reviewed runner and platform regression tests; App Sandbox entitlements are not a drop-in replacement for arbitrary per-agent read/write path policies.

| Surface | Suitable job | Limit to preserve |
|---|---|---|
| App Sandbox entitlements | Signed native app and fixed helper capabilities | Coarse application rights; not a dynamic per-agent policy language |
| XPC service | Separate process for a narrow host operation | The service's authority and request authorization matter independently |
| Inherited sandbox helper | Bundled command with inherited application restrictions | Do not assume arbitrary per-agent rights or dynamic grants transfer automatically |
| Seatbelt runner | Restrict a whole agent process before Node/Pi starts | Policy details and platform support need direct validation |
| MicroVM | Linux guest with its own kernel | Mounted paths, forwarded services, and guest images still require policy |

Apple's [helper-tool guide](https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app) describes the `app-sandbox` and `inherit` entitlement combination and recommends considering XPC for separate-process work. A Developer ID signature alone does not sandbox a program. An XPC connection alone does not authorize an operation.

## Proposed Shrimpy seam

The resident-agent option considered in the [runtime scout](sandbox-runtime-scout-2026-08-26.md) uses a runner and supervisor per agent. This replaces the earlier research assumption that a Mac app should start the whole gateway inside one agent sandbox. It remains a proposal; the separation to test is:

```text
trusted launch grant and supervisor
  | owns policy, attachment, proxy lifetime, cleanup
  | narrow control channel
  v
whole Node/Pi agent process under Seatbelt
  | sessions, tools, extensions, child commands
  v
explicit file roots and service connections
```

The runner constructs paths and environment from trusted configuration. Agent-writable preferences cannot enlarge those grants. SRT's module-global manager state means independent policies need independent manager processes; see the [source-based explanation](sandbox-runtime-scout-2026-08-26.md#srt-smallest-first-experiment).

Required policy questions are concrete: which files can be read, which can be written, which network and IPC endpoints are reachable, which environment values and descriptors are inherited, and what happens when the parent dies. A profile named `workspace-write` answers none of those questions on its own.

## Mac-specific gates

- **Private reads:** broad system access and a writable workspace must not imply readable home directories, sibling agents, credentials, or browser profiles. Test real paths, symlinks, new destinations, `/tmp` versus `/private/tmp`, and nested exceptions.
- **Early enforcement:** apply policy before loading Node, Pi, or extensions. Inventory handles deliberately retained across launch.
- **IPC and networking:** test unrelated loopback listeners, Unix sockets, Mach services, and proxy-only egress. A Unix socket to a privileged host service can confer more authority than an ordinary file grant.
- **Application launch:** keep SRT's `allowAppleEvents` disabled for contained agents. Its [documentation](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/README.md) says this option permits application launches outside the sandbox. TCC consent for scripting does not make those launches contained.
- **Lifecycle:** sandbox inheritance and process cleanup are separate properties. Test detached children and supervisor death. A parent exit or process-group signal is not sufficient proof that all work stopped.
- **Resource limits:** file/network confinement does not imply CPU, memory, process-count, or disk quotas. Report what the selected runner actually enforces.

## When a native app is useful

Add a small native surface only when a concrete workflow needs folder pickers, persisted security-scoped bookmarks, or native host integration. The CLI should expose the operation first. A broker should accept one typed request, authorize its target, and return bounded data or a narrow resource handle. Do not hand the agent a general host shell, unrestricted Apple Events, an SSH-agent socket, or an entire browser profile as a shortcut.

For folder access, use Apple's [App Sandbox configuration guidance](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox). Test access across helper launch and restart; opening a picker and storing a bookmark do not by themselves establish the desired child-process policy. A broker for Contacts, browser state, or credentials would need separate authorization and lifecycle evidence.

Apple's [Containerization source at `b44e17e`](https://github.com/apple/containerization/tree/b44e17e1a4c135bc0168e615bf6a8e3798d070c0) remains a possible Swift-based VM substrate. The current source also describes a Linux Cloud Hypervisor backend, so the older Mac-only description is incomplete. This is a source observation, not a verified released cross-platform Shrimpy dependency.

## Evidence and remaining questions

This refresh read Apple's App Sandbox and helper documentation, Chromium's design, current runner source, and Shrimpy's launch/tool-policy seams. It did not build a helper, run a sandbox, test TCC/bookmarks, or verify descendant cleanup. The next evidence should be one useful resident Pi process passing the [shared acceptance suite](sandbox-runtime-scout-2026-08-26.md#shared-acceptance-suite), with host OS and exact runner version recorded.

A native UI, a custom SBPL compiler, and a general credential broker remain optional later work. If the process runners cannot meet private-read and lifecycle requirements, compare the microVM candidates before expanding the helper design.
