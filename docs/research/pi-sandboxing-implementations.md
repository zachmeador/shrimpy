# 🦐 Pi Sandboxing Implementations

Originally researched: 2026-07-26
Last refreshed: 2026-09-16 (nono networking/advisories; Pi and extension inspection Sep 14)
Status: Research; source inspection, no runtime validation

## Current read

**A sandbox around Pi constrains extension code and built-in tools together. A sandbox extension generally constrains only the operations it intercepts.** This distinction still determines whether a candidate can supply Shrimpy's process boundary.

The current shortlist and release/security history live in the [runtime scout](sandbox-runtime-scout-2026-08-26.md). This page owns the Pi integration comparison. [SECURITY.md](../../shrimpy-old/SECURITY.md) owns Shrimpy's actual guarantees: there is no OS containment today.

## Pi and Shrimpy baseline

Shrimpy pins Pi `0.84.4` in [package.json](../../package.json). The [Pi SDK at that tag](https://github.com/earendil-works/pi/blob/v0.84.4/packages/coding-agent/src/core/sdk.ts) exposes `tools` as a name allowlist, `excludeTools` as a denylist, `customTools`, and `noTools` modes. These control tool availability. They do not create filesystem, network, or process isolation. The [Pi README](https://github.com/earendil-works/pi/blob/v0.84.4/packages/coding-agent/README.md) continues to delegate permissions and sandboxing to the embedding environment or extensions.

Current [Shrimpy session construction](../../shrimpy-old/src/sessions/open.ts) passes custom tools and exclusions, but no explicit active-tool allowlist. [Tool policy](../../shrimpy-old/src/tools/policy.ts) resolves the configured daemon tools and disabled names; `SessionKey.profileId` remains an identity/storage partition rather than a security policy. A system-prompt containment hook also supplies instructions, not OS containment. The [constrained-tool proposal](shrimpy-constrained-tool-profile.md) describes that separate layer.

## Version and boundary comparison

| Candidate | Observed version and inspection date | OS boundary | Code outside that boundary |
|---|---|---|---|
| [nono](https://github.com/nolabs-ai/nono/releases/tag/v0.78.0) | `0.78.0`; checked Sep 16 | Whole launched Pi process and descendants | Supervisor/proxy and explicitly granted host services |
| [pi-sandbox](https://registry.npmjs.org/pi-sandbox/latest) | npm `0.6.8`; latest listed GitHub release `0.6.6`; checked Sep 14 | Bash; user `!` commands by default | Pi process, file-tool checks, arbitrary extension code |
| [pi-permission-modes](https://github.com/wynainfo/pi-permission-modes/releases/tag/v2.2.0) | `2.2.0`; checked Sep 14 | Sandboxed Bash execution in eligible modes | Pi process, policy checks, allowed extension internals, approved outside-sandbox execution |

## nono

[nono](https://github.com/nolabs-ai/nono) uses Seatbelt on macOS and Landlock plus additional process/network enforcement on Linux. Starting Pi inside it places direct Node access, extensions, file tools, Bash, and descendants inside the same OS policy. Every session in that process shares its authority.

Current nono includes profile composition, proxies, credential injection, and policy inspection. Evaluate the current profile mechanism directly; the old Pi-pack example is not a sufficient description of the current integration. An inherited sandbox cannot simply widen itself on request: grants beyond its fixed rights require a trusted supervisor, restart, broker, or an already-authorized resource channel.

The [security policy](https://github.com/nolabs-ai/nono/blob/main/SECURITY.md) still describes unstable guarantees and discourages production use. Public proxy/DNS advisories credit an X41 audit sponsored by OSTIF, correcting this note's earlier incomplete audit observation. The [runtime scout](sandbox-runtime-scout-2026-08-26.md#nono-retain-as-a-serious-process-policy-comparison) owns the evidence, patched versions, and unresolved Sep 16 advisory qualifications. No Pi profile was exercised locally.

nono does not restrict networking by default merely because Pi is launched under it. Configure the required network mode explicitly, and test Pi's actual provider client through it. The [networking comparison](sandbox-runtime-scout-2026-08-26.md#networking-comparison) covers proxy enforcement, private destinations, credentials, and the distinction between host and API-operation permissions.

## pi-sandbox

The inspected source is [`31fa506`](https://github.com/carderne/pi-sandbox/tree/31fa5060689624467c1aeace2664ce91784522ff), Sep 8. Its package manifest and npm metadata identify version `0.6.8`, depending on `@carderne/sandbox-runtime` `^0.0.72`. That fork's version is independent of Anthropic SRT's version: a matching or nearby number does not establish equivalent fixes.

The [extension](https://github.com/carderne/pi-sandbox/blob/31fa5060689624467c1aeace2664ce91784522ff/src/extension.ts) wraps Bash with an OS sandbox and intercepts `read`, `write`, and `edit` tool calls inside the host Pi process. It has a `user_bash` hook, but `sandboxUserShell: false` bypasses that wrapping for `!` commands. The default remains enabled. Other built-ins and arbitrary extension internals do not inherit an OS boundary from these hooks.

The [configuration merger](https://github.com/carderne/pi-sandbox/blob/31fa5060689624467c1aeace2664ce91784522ff/src/config.ts) unions project and global path/domain arrays. A project's `.pi/sandbox.json` can therefore add permissions; it must not be the trusted maximum grant for an untrusted repository. Persisted approvals also change configuration. The [README](https://github.com/carderne/pi-sandbox/blob/31fa5060689624467c1aeace2664ce91784522ff/README.md) warns that its browser compatibility options open substantial security holes.

[0.6.6 release notes](https://github.com/carderne/pi-sandbox/releases/tag/v0.6.6) include a subprocess-hang fix, Linux seccomp-helper exposure, PTY forwarding, and the user-shell bypass option. The current [manifest](https://github.com/carderne/pi-sandbox/blob/31fa5060689624467c1aeace2664ce91784522ff/package.json) declares a Pi peer range of `^0.80.0`, which does not include Shrimpy's `0.84.4` under npm's pre-1.0 semver rules. Compatibility must be tested rather than inferred from similar extension APIs.

## pi-permission-modes

The [2.2.0 implementation](https://github.com/wynainfo/pi-permission-modes/blob/v2.2.0/src/index.ts) combines named modes, tool/path rules, shell parsing, and sandboxed Bash. Project configuration is tighten-only. This is a useful contrast with pi-sandbox's permission unions, but policy checks still run in an unconstrained Pi process.

Its [documented fallback behavior](https://github.com/wynainfo/pi-permission-modes/blob/v2.2.0/README.md) remains important:

- Worktrees/submodules with a real `.git` pointer file disable OS sandboxing and fall back to prompts.
- Missing sandbox support is reported and falls back to the permission flow.
- Approved out-of-project or privileged commands may execute outside the sandbox.
- If tree-sitter cannot load, command analysis uses a weaker heuristic.

The [manifest](https://github.com/wynainfo/pi-permission-modes/blob/v2.2.0/package.json) still pins Anthropic SRT `0.0.26`, far behind the current upstream. The advisory/history difference warrants inspection; it is not evidence that a particular newer vulnerability is present. Interactive fallback is incompatible with a Shrimpy launch contract that promises enforced containment and must fail closed.

## What to borrow

| Concern | Useful lesson |
|---|---|
| Whole-runtime containment | Launch Pi under a process sandbox; do not depend on tool hooks to contain arbitrary JavaScript |
| Tool policy | An exact allowlist and bounded tool implementations can reduce model capabilities inside the OS boundary |
| Configuration | Trusted launch grants define the maximum; project/session data may request or narrow access |
| Inspection | Report which process is sandboxed, the effective grant, and any missing enforcement |
| Compatibility | Pin Pi, extension, and backend separately; test noninteractive startup, ordinary file tools, Bash, cancellation, and restart |
| Host tools | An allowed MCP/ACP/browser service can have authority outside the child's sandbox and needs its own authorization |

nono and Anthropic SRT are Apache-2.0 at the project layer; pi-sandbox and pi-permission-modes are MIT, and pi-sandbox's runtime fork is Apache-2.0. See their linked repositories' license files. No extension was installed or tested during this refresh.
