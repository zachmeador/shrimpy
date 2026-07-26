---
status: review
priority: P2
area: Context
depends_on: []
---

# 🦐 CTX-012: Product Agent Instruction Catalog

## Why

Shrimpy defines product-authored text that instructs agents in several source areas: session delivery guidance, turn-context framing, compaction prompts, worker contracts, tool descriptions and results, fallback identity text, and setup templates. These strings are individually reasonable but collectively difficult to discover, review, or customize. A maintainer should be able to inspect one obvious source boundary and answer, "What instructions does Shrimpy itself give models?"

Centralize ownership of Shrimpy-authored model-facing instructions without centralizing user-authored context, agent identities, or skills. This creates a transparent product surface now and a clean seam for future localization or workspace personalization without requiring a hard fork.

## Current State

- `PromptSection` already records `id`, `kind`, `source`, `reason`, and `content`, providing useful runtime provenance for stable prompt sections.
- Product-authored instructions live across `src/context/system/`, `src/context/turn/`, `src/context/assembly.ts`, `src/sessions/compaction-runner.ts`, `src/workers/runner.ts`, `src/setup/defaults.ts`, tool schemas/results, and setup templates.
- Included skills are already explicit Markdown instruction bundles and should remain independently owned rather than being copied into a central catalog.
- Skill-backed command handoffs such as `shrimpy update` load a canonical skill as an explicit session prompt resource and keep the task message to runtime facts plus the skill source path. Durable workflow directions belong in the skill.
- Workspace `context/`, agent `SOUL.md` and context files, watch text, session prompts, and caller additions are user-owned inputs rather than Shrimpy product copy.

## Build

- Add one obvious source boundary such as `src/instructions/` for Shrimpy-authored model-facing text.
- Give each coherent instruction a stable semantic identifier such as `session.delivery.channel`, `turn.context.leading`, `compaction.summary`, `worker.coding.contract`, or `tool.reply.description`.
- Keep static multi-paragraph instruction text readable as Markdown or plainly formatted source. Use small typed render functions for instructions with runtime values such as channel names, paths, and chunk numbers.
- Move existing product-authored instructions behind the catalog without changing their rendered wording or behavior.
- Return or retain enough definition metadata for prompt sections and debugging code to identify the instruction ID and source. Do not force all runtime facts or user-authored text through the catalog.
- Keep included skill resources on the existing session prompt-resource path. When a command loads a workflow skill, remove duplicated behavioral prose instead of moving it into the catalog; task-specific runtime facts and the skill path can remain at the call site.
- Remove setup-seeded watch schedules. The mechanic-owned `shrimpy-watches` skill should define and verify only user-approved recurring work.
- Cover the catalog with focused tests that verify stable IDs, interpolation, and parity with the current rendered prompts.
- Make future replacement of the built-in instruction resolver possible without implementing locale packs or workspace overrides in this item.

## Suggested Shape

Keep the implementation as a small set of domain modules behind one index rather than a registry service:

```text
src/instructions/
  index.ts
  session.ts
  turn.ts
  compaction.ts
  workers.ts
  tools.ts
  watches.ts
```

Each definition should pair a stable ID with either static text or a typed renderer:

```ts
export const turnContextLeading = defineInstruction(
  "turn.context.leading",
  "The turn context above is background for the user message below. ...",
);

export const channelDelivery = defineInstruction(
  "session.delivery.channel",
  ({ channel }: { channel: string }) => [
    "## Delivery",
    "",
    `This session is attached to channel ${channel}.`,
    // ...
  ].join("\n"),
);
```

`defineInstruction` only needs to retain the semantic ID and expose rendered text. Prompt-producing call sites can preserve that ID in `PromptSection` metadata where useful, while call sites that require a plain string can read the rendered text directly. No dynamic registration, dependency injection container, or runtime discovery is required.

## Initial Inventory

| Domain | Current source | Candidate IDs |
|---|---|---|
| Fallback identity | `src/context/system/scaffold.ts` | `identity.fallback` |
| Session delivery | `src/instructions/delivery.ts`, `src/context/session-prompt.ts` | `session.delivery.channel`, `session.delivery.transcript`, `turn.delivery.channel` |
| Turn framing | `src/context/turn/prompt-prefix.ts` | `turn.context.leading`, `turn.context.trailing` |
| Compaction | `src/instructions/compaction.ts`, `src/sessions/compaction/runner.ts` | `compaction.system`, `compaction.agent-context`, `compaction.summary`, `compaction.update`, `compaction.turn-prefix`, `compaction.chunk` |
| Coding workers | `src/workers/runner.ts` | `worker.coding.contract` |
| Tool model copy | Agent-facing tool schema and result modules | `tool.<name>.description`, `tool.<name>.parameter.<name>`, and behavioral result IDs |
| Setup templates | `src/setup/templates/` | Inventory as product-owned seed assets; keep the Markdown templates in place |

The implementation should perform one repository-wide inventory for additional model-facing search hints, continuation framing, or tool outputs. Discovery should use the instruction boundary below rather than treating every English source string as an instruction.

## Instruction Boundary

Catalog Shrimpy-authored text when its purpose is to direct or frame model behavior, including instructions delivered through system prompts, user-message framing, auxiliary model prompts, tool descriptions, and tool results with behavioral directions.

Do not catalog ordinary CLI/UI copy, pure runtime data, user messages, model output, workspace context, agent-authored memory, skill contents, task-specific runtime facts, or skill source pointers. If a product command selects a skill, durable behavioral directions belong in that `SKILL.md` rather than an adjacent TypeScript prompt. Product-owned setup templates may remain template assets, but their role and source should be represented in the inventory where they seed instructions that users later own.

## Boundaries

- Do not build a generalized prompt framework, plugin system, translation workflow, or instruction-management CLI.
- Do not create one giant instruction file; group definitions by domain behind one exported catalog boundary.
- Do not move included skill prose out of skill packages or duplicate it in the catalog.
- Do not restore setup-seeded watch schedules or treat installed skills as authorization to create watches.
- Do not change prompt ordering, context containment, prompt caching behavior, compaction semantics, delivery behavior, or worker policy.
- Do not add legacy compatibility paths.
- Keep the implementation small: mostly relocation and imports, with only enough catalog structure to make ownership and future substitution explicit.

## Expected Size

Expect roughly 200–300 net lines including focused tests, with approximately 400–600 existing lines touched or relocated. A substantially larger implementation likely means localization, configuration, CLI management, or a generalized prompt framework has leaked into this item.

## UX Implications

No immediate end-user interaction or command behavior should change. Maintainers and downstream builders gain an obvious place to inspect Shrimpy's built-in agent instructions, while existing context inspection continues to show the effective prompt. Future localization or personalization can replace catalog resolution rather than patching scattered source files, but no new configuration or override behavior is introduced here.

## Touches

- `src/instructions/`
- `src/context/system/`
- `src/context/turn/prompt-prefix.ts`
- `src/context/assembly.ts`
- `src/sessions/compaction-runner.ts`
- `src/workers/runner.ts`
- `src/setup/init.ts`
- `src/skills/included/shrimpy-setup/`
- `src/skills/included/shrimpy-watches/`
- Agent-facing tool schema and result definitions
- Prompt, compaction, worker, context, tool, and setup-default tests

## Done

- Shrimpy-authored model-facing instructions have stable semantic IDs and are defined behind one obvious source boundary.
- Existing product instruction call sites import or render catalog definitions instead of declaring scattered prose.
- User-owned context, agent identity and memory, and skill contents remain outside the catalog.
- Skill-backed command handoffs contain task facts and a skill source pointer without duplicating the workflow's behavioral directions in TypeScript.
- Rendered prompt and task behavior remains unchanged.
- Fresh setup creates no watch schedules; the mechanic skill creates only watches the user approved.
- Tests cover catalog identity, parameter interpolation, and representative rendering parity.
- A repository search and manual inventory find no unexplained Shrimpy-authored behavioral instruction strings outside the catalog boundary.
