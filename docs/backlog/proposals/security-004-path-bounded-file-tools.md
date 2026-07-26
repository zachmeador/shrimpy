---
status: draft
priority: P2
area: Security
depends_on:
  - SECURITY-002
---

# 🦐 SECURITY-004: Path-Bounded File Tools

## Why

A constrained session should be able to read or write deliberately selected directories without receiving Bash or unrestricted Pi file tools. This is especially useful for autonomous watches, small local models, project-specific agents, public-safe workflows with no filesystem access by default, and later OS-sandbox profiles.

Application-level path enforcement is a useful capability boundary, but it is not an OS sandbox. The Shrimpy/Pi process and permitted tool implementations still retain their host authority.

## Current State

- Pi exposes `read`, `write`, `edit`, `grep`, `find`, and `ls` operations that Shrimpy can replace.
- A custom tool with the same name can replace a Pi built-in.
- Shrimpy currently passes agent-level exclusions rather than a closed active-tool allowlist.
- `profileId` does not currently resolve filesystem roots or replacement operations.
- The design and first verification matrix are analyzed in [shrimpy-constrained-tool-profile.md](../../research/shrimpy-constrained-tool-profile.md).

## Direction

Extend a resolved SECURITY-002 profile with explicit absolute roots and separate access:

```ts
fileAccess: {
  roots: [
    { path: "/project/reference", access: "read" },
    { path: "/agent/output", access: "read-write" }
  ]
}
```

Every exposed path-bearing tool must use bounded replacement operations. If Shrimpy cannot construct or validate a replacement, the unrestricted built-in must remain inactive.

## Build

- Start with only `read`, `write`, and `edit`; add `grep`, `find`, or `ls` later only after their traversal and subprocess behavior uses the same boundary.
- Canonicalize configured roots when profiles load.
- Resolve relative tool inputs against the session working directory.
- Compare normalized path components rather than string prefixes.
- Resolve existing targets through `realpath`.
- For new write targets, resolve the nearest existing parent through `realpath` before creation.
- Reject traversal, sibling-prefix collisions, symlink escapes, missing roots, and destinations whose canonical target or parent leaves the granted root.
- Apply policy to every filesystem phase of an edit, including its read and final write.
- Keep read and write grants distinct. Do not turn a readable project into a writable project by convenience.
- Expose a CLI decision check for a profile and candidate path without reading or changing the target.
- Record canonical roots and access modes in redacted session inspection metadata.
- Review capability combinations. In particular, readable data plus web search, messaging, publication, or another egress tool may permit intentional or prompt-injected disclosure.

## UX Implications

Users can give a session access to a small project, reference directory, scratch area, or report destination and verify the exact canonical boundary before enabling autonomous work. Attempts outside the roots fail with a concise policy explanation. Inspection distinguishes read-only and read-write roots and never implies that tool-level enforcement contains the entire process.

## Boundaries

- Do not expose Bash, arbitrary subprocess execution, or a free-form Shrimpy CLI wrapper as a substitute for bounded tools.
- Do not call lexical prefix checks, prompt rules, or working-directory conventions path enforcement.
- Do not grant the entire Shrimpy workspace or agent root as a convenient default; those roots include config, sessions, vaults, watches, and other sensitive state.
- Do not assume an individually read-only tool is harmless when combined with an egress capability.
- Do not claim protection from other host processes, permitted-tool bugs, provider-side disclosure, or time-of-check-to-time-of-use races.
- Do not delay SECURITY-002 profiles that need no filesystem tools on this item.

## Touches

- SECURITY-002 profile configuration and validation
- Pi tool construction and replacement operation adapters
- path-policy helpers with symlink-aware tests
- session inspection and a CLI path decision command
- `docs/reference/security.md`, `docs/reference/tools.md`, and `docs/reference/configuration.md`

## Done

- A constrained profile can activate bounded `read`, `write`, and `edit` without activating Bash or unrestricted file operations.
- Every allowed and denied path is decided from canonical roots and real paths, including nonexistent write destinations.
- Replacement construction fails closed.
- CLI inspection explains roots, modes, and representative path decisions.
- Tests cover relative and absolute paths, `..` traversal, prefix siblings, file and directory symlink escapes, symlinked destination parents, edit phases, missing roots, and unexpected custom or extension tools.
