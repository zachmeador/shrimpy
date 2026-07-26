# Pi Sandboxing Implementations

Date: 2026-07-26
Status: Research

## Question

What sandboxing implementations currently exist for Pi, what do they enforce, and where does each enforcement boundary end?

This note records the implementations as inspected on 2026-07-26. It does not select a Shrimpy backend.

## Pi Baseline

Pi `0.82.1` does not include a built-in permission system for filesystem, process, network, or credential access. The default process and built-in tools run with the permissions of the user that launched Pi.

Pi does expose the mechanisms needed for an embedding application or extension to change that behavior:

- `createAgentSession()` accepts an active-tool allowlist, an excluded-tool denylist, and custom tool definitions;
- custom tools with the same names as built-ins replace those built-ins;
- `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls` expose pluggable operation interfaces;
- extensions can intercept tool calls and user `!` commands.

These are integration surfaces, not enforcement by themselves.

## Implementations

### nono

[nono](https://github.com/nolabs-ai/nono) is a process launcher and Rust library for applying an OS policy before running an agent. Its [Pi package](https://github.com/always-further/nono-packs/tree/main/pi) supplies a Pi-specific profile.

Observed enforcement shape:

- the Pi process and its descendants inherit the policy;
- macOS filesystem policy uses Seatbelt;
- Linux filesystem policy uses Landlock;
- network access is mediated through configured policy and proxy paths;
- credential proxying can keep configured raw credentials outside the sandboxed process;
- the CLI also exposes policy inspection, audit, snapshot, and rollback features.

Because the process itself is constrained, Pi built-ins, direct Node filesystem access, Bash subprocesses, and in-process extension tools share the same OS boundary. Anything explicitly allowed to the process remains available to all code running inside that process.

The project security policy labels the project alpha, says its guarantees are not yet stable, and lists a third-party security audit as future work before `v1.0`. Its current security claims therefore come from the project documentation and implementation rather than a published third-party audit.

Operational facts relevant to Shrimpy:

- Pi still needs readable runtime files, model configuration, session state, and the selected workspace paths;
- a whole-process policy must account for Shrimpy's workspace state, channel logs, agent roots, and runtime writes, not only the current project directory;
- irreversible kernel restrictions cannot be widened inside the already-constrained process; dynamic grants require a supervisor, restart, broker, or resource passed through a prearranged channel;
- allowing a project directory read/write gives the process access to every file reachable through that allowed path, subject to the backend's path and symlink semantics.

### pi-sandbox

[pi-sandbox](https://github.com/carderne/pi-sandbox) is a Pi extension derived from Pi's example sandbox extension. It uses [`@carderne/sandbox-runtime`](https://github.com/carderne/sandbox-runtime), a fork of Anthropic's experimental sandbox runtime.

Observed enforcement shape:

- model `bash` calls and user `!` commands run through `sandbox-exec` on macOS or `bubblewrap` on Linux;
- Bash filesystem and network restrictions are OS-enforced for the spawned process tree;
- Pi `read`, `write`, and `edit` calls are checked in the host Pi process before their normal Node operations run;
- blocked accesses can be granted for the session, project, or all projects;
- project and global configuration are merged, and project configuration can add allowed paths and domains;
- the extension displays whether its sandbox initialized.

The enforcement boundary is split. Bash receives an OS boundary, while direct file-tool checks are application code running in the unconstrained Pi process. Other Pi built-ins and tools registered by other extensions are not automatically covered by the `read`/`write`/`edit` checks. Code inside the Pi process retains the launcher's ambient authority.

Configuration facts relevant to untrusted projects:

- `.pi/sandbox.json` is read from the project;
- project path and domain arrays are combined with global arrays, so a project file can widen those arrays;
- persisted approvals modify project or global configuration;
- browser compatibility settings documented by the project widen process, socket, or network access and are called out by the project as security tradeoffs.

### pi-permission-modes

[pi-permission-modes](https://github.com/wynainfo/pi-permission-modes) is a Pi extension that combines named permission modes, tool-call policy, Bash parsing, and Pi's example OS sandbox runtime.

Observed enforcement shape:

- modes define `allow`, `ask`, or `deny` rules for Bash, file tools, paths, external directories, web search, extension tools, and skills;
- Bash commands are parsed with tree-sitter, including nested shell constructs, before policy evaluation;
- in-project Bash runs through `sandbox-exec` on macOS or `bubblewrap` on Linux when the runtime initializes;
- file tools are enforced through tool policy and path checks in the Pi process rather than the OS sandbox;
- extension tools and skills can be gated by name;
- project configuration is tighten-only and cannot widen the global mode;
- the footer and `/sandbox` report degraded or unavailable sandbox state;
- missing sandbox support falls back to prompts rather than silently presenting the mode as sandboxed.

Boundary and fallback facts:

- only Bash receives the OS sandbox;
- an allowed extension tool is not constrained according to its internal filesystem, process, or network effects;
- a user-approved out-of-project or privilege-escalating Bash command runs outside the sandbox;
- the documented current implementation disables OS sandboxing for Git worktrees and submodules whose `.git` is a pointer file, then falls back to prompting;
- if tree-sitter cannot load, command analysis falls back to a token-scan heuristic;
- the project was first published shortly before this inspection and has a short public history, so compatibility and security behavior have had limited time to stabilize.

## Comparison

| Property | nono | pi-sandbox | pi-permission-modes |
|---|---|---|---|
| Unit receiving OS enforcement | Whole Pi process and descendants | Bash and `!` subprocess trees | In-project Bash subprocess trees |
| Direct Pi file tools | Inherit process boundary | Host-side checks for `read`, `write`, `edit` | Host-side policy/path checks |
| Arbitrary extension tools | Inherit process boundary | Not automatically constrained | Gated by name; allowed tool internals remain unconstrained |
| Permission prompts | Supervisor/profile dependent | Session, project, or global grants | Once/session/persistent policy grants |
| Project config can widen policy | Depends on selected profile loading | Yes, for merged path/domain arrays | No; project overlay is tighten-only |
| Network enforcement | Process policy/proxy | Bash process tree | Sandboxed Bash process tree |
| Explicit degraded-state reporting | CLI/policy diagnostics | Sandbox initialization status | Footer and `/sandbox` fallback reason |
| Published third-party security audit | None identified | None identified | None identified |

## Shrimpy Integration Distinctions

The implementations occupy two different layers:

- `nono` constrains the host process. Shrimpy would need to describe every path and service required by that process.
- `pi-sandbox` and `pi-permission-modes` run inside Pi. They can provide interactive tool policy while the containing Shrimpy/Pi process retains its normal OS authority.

Using an in-process extension does not prevent Shrimpy from also running under a process sandbox. If the two are combined, the OS boundary is the maximum ambient authority and the Pi extension can further reduce or prompt for use of the tools it understands.

## Sources

- Pi: [repository permission baseline](https://github.com/earendil-works/pi#permissions--containerization), [extension tool overrides and pluggable operations](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- nono: [repository](https://github.com/nolabs-ai/nono), [security policy](https://github.com/nolabs-ai/nono/blob/main/SECURITY.md), [OS sandbox documentation](https://nono.sh/os-sandbox), [Pi package](https://github.com/always-further/nono-packs/tree/main/pi)
- pi-sandbox: [repository and documentation](https://github.com/carderne/pi-sandbox), [sandbox runtime](https://github.com/carderne/sandbox-runtime)
- pi-permission-modes: [repository and documentation](https://github.com/wynainfo/pi-permission-modes), [threat model](https://github.com/wynainfo/pi-permission-modes/blob/main/SECURITY.md)
