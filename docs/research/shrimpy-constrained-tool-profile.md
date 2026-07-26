# Shrimpy Session Security Profiles And Constrained Tools

Date: 2026-07-26
Status: Research

## Question

Can Shrimpy use its existing session profile identity to provide a simple, heavy-handed restricted session with only path-bounded file tools and a small set of fixed Shrimpy operations, with Bash disabled?

Yes at the tool-capability layer. This would restrict what the model can invoke through a Shrimpy session. It would not apply an OS sandbox to the Shrimpy/Pi process.

## Existing Profile Meaning

Every Shrimpy `SessionKey` already contains a `profileId`. The profile id is the named runtime variant of a logical session:

```text
agent id + namespace + name + profile id
```

The default profile is named `default` and is omitted from canonical CLI ids. A non-default profile appears as `<namespace>/<name>@<profile>`. Different profile ids produce different canonical identities, storage directories, transcripts, and ownership records. Gateway dispatch currently uses only `default`, and its pool lanes are still channel-keyed; profile-aware gateway work must key lanes by the full session identity.

Today `profileId` has no capability semantics. It does not select tools, path access, prompts, models, or command permissions. Gateway dispatch currently uses `default`.

The profile id should remain an identifier rather than contain policy. Before opening a session, Shrimpy can use that identifier and the current agent/runtime context to resolve a typed `SessionSecurityProfile`. That resolved object supplies behavior for the session.

## Existing Seams

The current code already provides part of the shape:

- `SessionKey.profileId` already partitions session identity and storage;
- agent `disabledTools` is passed to Pi as `excludeTools`, so an agent can disable `bash`;
- agent `tools` selects which Shrimpy daemon tools are registered;
- Shrimpy passes its daemon tools to Pi as custom tool definitions;
- Pi `0.82.1` accepts both an explicit active-tool allowlist and custom tools;
- a custom tool definition with the same name as a Pi built-in replaces the built-in;
- Pi exports pluggable operations for `read`, `write`, `edit`, `grep`, `find`, and `ls`.

Shrimpy currently does not resolve policy from `profileId`. It passes an agent-level denylist to Pi but does not pass an active-tool allowlist. Pi enables extension and custom tools by default unless an allowlist or other suppression mode removes them. Disabling only `bash` therefore does not define a closed capability set when extensions or additional tools are present.

## Session Security Profile Shape

A session security profile is resolved policy for one `profileId`; it is not a second identity system. A closed restricted profile would need all three controls:

1. Pass an explicit active-tool allowlist to Pi.
2. Replace every allowed path-bearing file tool with a path-bounded definition.
3. Register only explicitly selected fixed-operation Shrimpy tools.

For example:

```ts
type SessionSecurityProfile = {
  profileId: string;
  toolPolicy: {
    allowedToolNames: string[];
    fileAccess?: {
      roots: Array<{
        path: string;
        access: "read" | "read-write";
      }>;
    };
  };
  commandPermission: "full" | "read-only" | "none";
};
```

The exact TypeScript shape remains an implementation decision. The durable split is:

- `profileId` identifies and separates the session;
- `SessionSecurityProfile` is the resolved runtime policy;
- path-bounded file access is one optional component of that policy.

For a constrained workspace profile, `bash` would be absent from the allowlist rather than merely discouraged in the prompt. Extension tools would also be absent unless named explicitly.

## Resolution Order

Profile selection must happen before session lookup and tool construction:

```text
incoming turn or explicit run target
  -> choose profileId
  -> construct canonical SessionKey
  -> resolve SessionSecurityProfile for agent + profileId + runtime facts
  -> build bounded tools and exact active-tool allowlist
  -> open or resume that profile's Pi session
```

Shrimpy should not open `default` and then downgrade it in place. That would retain the default profile's transcript and could expose context accumulated under broader capabilities.

An unknown or invalid `profileId` should fail before session open rather than fall back to `default`.

Changing a named profile definition changes the effective policy on the next open unless Shrimpy introduces policy versioning. Session inspection and recorded metadata should therefore include the resolved policy or a stable summary of it so historical tool access remains explainable.

## Path Scope

"Workspace-only" needs an exact path definition inside the resolved security profile. Shrimpy currently has several relevant roots:

- the entire Shrimpy workspace;
- an individual agent root;
- an agent's configured session working directory;
- an explicitly attached project or scratch directory.

Those scopes grant materially different access. An entire Shrimpy workspace includes other agents and shared configuration. An individual agent root includes that agent's context, vault, watches, sessions, and skills. A project-only root excludes most Shrimpy state. The resolved policy therefore needs absolute roots rather than a boolean `workspaceOnly`.

Read and write policy should be separate. A session security profile can allow reading a project while limiting writes to the agent root or a scratch subdirectory.

## Path Enforcement Requirements

A lexical prefix check is insufficient. A bounded file operation needs to:

- canonicalize each configured allowed root before accepting calls;
- resolve relative input against the session working directory;
- normalize the absolute path;
- compare path components rather than string prefixes;
- resolve existing targets through `realpath`;
- for a new write target, resolve the nearest existing parent through `realpath` before creating the file;
- reject a target whose canonical path or canonical parent leaves the allowed root;
- apply the same validation to every filesystem operation used by the tool, including reads performed while preparing an edit;
- define whether symlinks inside an allowed root may point elsewhere;
- fail closed when canonicalization or policy loading fails.

Application-level checking has a time-of-check-to-time-of-use interval. Another process can change a path or symlink between validation and the eventual operation. Disabling Bash prevents the model from creating that race through Bash, but it does not prevent races from the user, another process, or another allowed tool.

## File Tool Coverage

Every exposed path-bearing tool needs the same root policy:

| Tool | Required checks |
|---|---|
| `read` | Canonical target must be under a readable root. |
| `write` | Canonical existing target or canonical destination parent must be under a writable root. |
| `edit` | Both its read and final write must remain under a writable root. |
| `grep` | Search root and every context-file read must remain under a readable root. |
| `find` | Search root must remain under a readable root; the glob implementation must not traverse outside it. |
| `ls` | Listed target must remain under a readable root. |

Pi's operation interfaces are sufficient to replace the direct file operations, but each tool still needs review because `grep` and `find` can invoke fixed search executables internally. A Shrimpy implementation can either validate before those fixed invocations or replace the search operation completely.

The initial implementation can expose only `read`, `write`, and `edit`. Adding `grep`, `find`, or `ls` is a capability expansion and should use the same root-policy tests.

## Fixed Shrimpy Operations

Frequently used Shrimpy actions do not require a general shell. A dedicated tool can expose one typed operation with fixed semantics.

Examples of existing direct tools are:

- `read_channel`;
- `reply`;
- `ask`;
- `notify`;
- `report`;
- `send_message`.

These tools already call Shrimpy internals rather than a shell. They are selected per agent, but they are not all low-impact: publication and messaging tools create externally visible channel state, while `read_channel` can expose channel contents.

Additional CLI-backed capabilities should follow the same shape:

- one tool name per stable operation or small coherent operation family;
- typed parameters rather than a free-form command or argument array;
- fixed command selection inside trusted code;
- explicit agent, channel, and path authorization in the handler;
- bounded output;
- no inherited ability to choose another subcommand, executable, workspace, config path, or output destination.

Calling an existing internal function avoids creating a subprocess. If a CLI subprocess is temporarily necessary, the wrapper should use a fixed executable and fixed argument structure without a shell. A prefix allowlist such as "anything beginning with `shrimpy agent`" would expose every present and future subcommand under that prefix and would not be equivalent to a fixed-operation tool.

Candidate read-only or local-inspection operations must still be checked individually. Commands that read context, sessions, channels, agent configuration, or vault-adjacent paths may expose data outside the restricted agent's intended scope even when they do not mutate state.

## Capability Construction

The effective session should be constructed from an allowlist rather than by subtracting a few known dangerous tools:

```text
SessionKey.profileId
  -> resolved SessionSecurityProfile
  -> bounded replacement file tools
  -> selected existing Shrimpy tools
  -> selected fixed-operation wrappers
  -> Pi active-tool allowlist containing exactly those names
```

This also makes inspection finite: `shrimpy agent inspect <id>` and session inspection can show the profile id, resolved roots, read/write access, command permission, and exact active tool names.

Tool registration should fail closed. If a bounded replacement cannot be created, Shrimpy should not leave Pi's unrestricted tool with the same name active.

## What This Prevents

Assuming the allowlist and path validation are correct, the model cannot use the session tool API to:

- start an arbitrary shell command;
- invoke an unlisted extension or daemon tool;
- use a listed file tool on a path outside its resolved roots;
- turn a fixed Shrimpy operation into another CLI subcommand.

This covers a large class of accidental broad-host access without requiring a platform-specific runner.

## What This Does Not Prevent

This session security profile does not:

- constrain the Shrimpy/Pi process, extension code, or provider libraries at the OS level;
- protect against a bug in a permitted tool or wrapper;
- stop another host process from reading or changing the same files;
- prevent provider-side exposure of content intentionally read and sent to the model;
- prevent data exfiltration through an allowed messaging or publication tool;
- make an allowed channel, session, config, vault, or project read safe merely because it is read-only;
- constrain browser, network, database, or other custom tools unless their names and internal policies are handled explicitly;
- provide syscall, process, network, device, credential, or resource-usage isolation;
- eliminate symlink and path race concerns inherent in host-side checking.

For these reasons the user-facing name should describe a constrained or restricted session profile, not native or OS sandboxing.

## Implementation Questions

- Where are named `SessionSecurityProfile` definitions stored, and which parts may be overridden per agent?
- Which root should be the default: agent root, configured cwd, a project attachment, or a new scratch directory?
- Should the agent root be split so context and skills are readable while vault and session data are excluded?
- Should write access default to the whole allowed read root or a narrower scratch/output root?
- Which existing Shrimpy daemon tools belong in each named profile?
- Should fixed-operation wrappers call command implementations directly or introduce a small service layer shared by CLI and tools?
- How should an operator inspect and test canonical path decisions, including symlinks and nonexistent destinations?
- Should a constrained profile be allowed in interactive TUI sessions where the human can still issue `!` commands, or only in agent-driven turns?
- When a profile definition changes, should an existing profile session resume under the new policy, require explicit confirmation, or receive a versioned profile id?

## First Verification Matrix

Any prototype should test at least:

- relative path inside the allowed root;
- absolute path inside the allowed root;
- `..` traversal outside the root;
- a sibling whose name shares the allowed-root prefix;
- existing symlink to an outside file;
- existing symlinked directory to an outside directory;
- new file below an inside parent;
- new file below a symlinked parent;
- edit read and write phases;
- missing or unreadable root;
- wrapper parameters attempting to select another Shrimpy command;
- an unlisted extension tool;
- effective tool inspection showing no `bash` and no unexpected custom tools.

## Relationship To OS Sandboxing

Session security profiles can exist independently of process sandboxing. If Shrimpy later runs the session under an OS boundary, the two layers compose:

- the OS policy limits the maximum authority of the process;
- the session security profile limits which portions of that authority the model can invoke through registered tools.

The separate [Pi sandboxing implementations](pi-sandboxing-implementations.md) note records current process- and extension-level implementations.
