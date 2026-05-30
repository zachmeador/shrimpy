# Shrimpy Memory System Design

## Problem

Three surfaces all push text into the prompt with no shared shape:

- `context.resources` — always-on files
- `briefing.commands` — per-turn command output
- `state/memory.json` — derived peer/channel cards, silently mutated by a `consolidate_memory` system task

`src/memory/derived/` is ~700 lines producing a global memory blob nobody owns. `src/context/turn/service.ts` is 335 lines wiring six unrelated turn-fact producers behind the misleading noun "briefing."

## Target

One vocabulary, one registry, one assembly path:

- **Context** — the prompt-relevant information surface for a turn.
- **Context source** — anything that emits context. Four types:
  - `file` — single Markdown file
  - `directory` — top-level Markdown discovery
  - `command` — shell command emitting compact text
  - `runtime` — framework code (scheduler origin, attention, unread cursors); not user-configurable but registered in the same list
- **Context block** — one resolved unit: `{ id, title, kind, body, provenance, freshness? }`. Every source emits blocks.
- **Scope** — `session` (loaded into every session for an agent) or `turn` (per-turn).
- **Agent context** — Markdown under `agents/<id>/context/`. Top-level files load every session; selected subdirectories load per turn. The agent's durable memory.
- **Workspace context** — Markdown under `profile/`. Shared, user-reviewed.
- **Evidence** — channels, sessions, vault, files. Inspectable but not loaded.

`shrimpy context sources list` shows every source — file, directory, command, runtime — so the assembly is one debugging surface.

The `<context>` envelope stays as the prompt wire format. What changes is what fills it, not how it's wrapped.

## Workspace Shape

```text
agents/<agent-id>/context/
  identity.md             session
  habits.md               session
  projects.md             session
  people/
    human-alice.md        turn  (loads when alice is sender)
    agent-admin.md        turn
  channels/
    home.md               turn  (loads when channel=home)
    career.md             turn
  journal/
    days/2026-05-11.md    upkeep/evidence  (inspect or add an explicit source)
    weeks/2026-W19.md     upkeep/evidence  (older days collapsed)
    months/2026-05.md     upkeep/evidence  (older weeks collapsed)
```

Files are mostly free Markdown. No required schema. The directory is the routing index — no `##`-heading parsing, no string-keyed routing. Per-entity files mtime-gate trivially.

Path classes:

- `context/*.md` (top level) — session, always loaded.
- `context/people/<actor-id>.md`, `context/channels/<name>.md` — turn-scoped; the keyed-slice runtime producer loads only the file matching the active sender/channel.
- `context/journal/**/*.md` — durable journal material for upkeep and later inspection. It is not loaded by the default `agent:context/` source; add an explicit bounded source if an agent needs journal material in prompt.

Example `people/human-alice.md`:

```markdown
works with me on the agent runtime. likes terse, evidence-backed
notes. gets cranky when i pad responses.

evidence: shrimpy channels read home --after <msg-id>
```

Notes are written in the **agent's own voice**, as if writing to its future self. No templated cards, no enforced tone. The agent's SOUL leaks through. This matters for the multi-agent direction — distinct agents should leave distinct notes.

`context/identity.md` is the agent's own self-knowledge accumulated over time; `SOUL.md` is the user/setup-authored stable identity. Two-tier: stable SOUL, fluid identity-notes.

**Each agent has its own private view of every peer.** `agent-a/context/people/human-alice.md` and `agent-b/context/people/human-alice.md` can diverge — they're impressions, not ground truth. Workspace `profile/USER.md` is the shared truth layer; agent context is the private working model on top. Two agents can develop different working models of the same person, and that's intentional — it's consistent with personality variance.

**Empty state.** Missing files emit no blocks. If `context/people/<sender>.md` doesn't exist for the active turn, the keyed-slice producer is silent. A fresh agent with no `context/` directory at all is fine; the assembly just has nothing agent-specific to add.

**Memory is git-trackable.** Context files are plain Markdown in the workspace. If the workspace is a git repo, `git log agents/<id>/context/` is the audit trail and `git checkout` is the recovery path. No framework-managed undo or history needed.

## Writes

Durable context is **only** written by:

- The owning agent, during scheduled upkeep runs (below), using its normal edit tool against files under `context/`.
- The user, directly editing files.

No mid-session writes. Current models can't be trusted to make in-flight save/skip decisions reliably; the result is either nothing useful or sludge. Deferred until small models can handle the judgment.

No framework writes. `consolidate_memory` and the derived peer/channel cards are gone.

## Upkeep

This whole design is one instance of a broader pattern: **skills are the policy layer.** Framework exposes primitives (mtimes, CLI subcommands); skill prose explains the recipe; agent runs bash and decides. Memory upkeep is the first place this lands; the same shape applies to other runtime policy questions (session compaction, escalation, stalled-work detection) as they come up.

Fresh setup seeds schedule entries in `agents/shrimpy/schedules.json` firing focused skills. Additional agents can opt in by adding the same pattern. Three time scales:

**`memory-management`** (durable context) — fires daily at 03:00. Activity-gated per entity:

```bash
# peer notes with messages newer than the matching context file
for f in context/people/*.md; do
  [ -f "$f" ] || continue
  peer="$(basename "$f" .md)"
  since_ms="$(($(stat -c %Y "$f") * 1000))"
  shrimpy channels --json \
    | jq -r '.[] | select(.exists and .path) | [.channel, .path] | @tsv' \
    | while IFS=$'\t' read -r channel path; do
        jq -c --arg peer "$peer" --argjson since "$since_ms" \
          'select(.timestamp > $since and .sender.actorId == $peer)' "$path" \
          | sed "s/^/[$channel] /"
      done
done

# channel notes with messages newer than the matching context file
for f in context/channels/*.md; do
  [ -f "$f" ] || continue
  channel="$(basename "$f" .md)"
  since_ms="$(($(stat -c %Y "$f") * 1000))"
  path="$(shrimpy channels show "$channel" --json | jq -r '.path')"
  jq -c --argjson since "$since_ms" 'select(.timestamp > $since)' "$path"
done
```

For each peer/channel with new activity, agent reads recent evidence, decides if anything durable is worth writing, edits the file. No activity → no-op.

**`journal-daily`** — fires end-of-day. If today had activity, write a short paragraph to `context/journal/days/<today>.md`. Skill prose enforces the date — agent reads `date`, writes that file, doesn't backfill.

**`journal-compact`** — fires weekly or monthly. Skill prose carries the hard date limits:

- day-notes older than 30 days → summarize the week into `context/journal/weeks/<iso-week>.md`, delete the consumed days
- week-notes older than 60 days → summarize into `context/journal/months/<yyyy-mm>.md`, delete the consumed weeks

Framework helpers like `shrimpy context files list --older-than 30d` make the bash trivial.

The only state tracking "what's been processed" is file mtimes plus explicit channel inspection. No framework-owned upkeep ledger.

Workspace-wide context (`profile/*.md`) requires user review. Agent-scoped context does not.

## Memory Skills

Three focused skills under `skills/`, each ~200-400 lines:

**`memory-management/SKILL.md`** — durable context upkeep. Teaches:

- bash recipes for activity gating
- what belongs in agent context vs workspace context vs `vault/`
- write in your own voice — these are notes to your future self, not a report
- prune as you write; replace, don't accumulate (working notes, not a log)
- preserve evidence pointers; don't replay transcripts
- avoid stale personality guesses, every-preference-ever, agent-bait taxonomy
- when to ask the user before touching `profile/`
- how to delete or replace a wrong note precisely

**`journal-daily/SKILL.md`** — produce a short paragraph for today if activity warrants it.

**`journal-compact/SKILL.md`** — cascading decay with the date limits above.

Splitting keeps each skill narrow enough that the agent reading it can hold the whole policy at once.

## Provenance

`ContextBlock.provenance` is a short string the assembly layer attaches to every block so an agent can trace where a fact came from:

- `file` / `directory` sources: `<path>` or `<path>#<heading>` for keyed slices
- `command` sources: the command line
- `runtime` sources: producer id (e.g. `runtime:scheduler-origin`)

This is separate from the evidence pointers an agent writes into the text of its own notes (`evidence: shrimpy channels read home --after <msg-id>`). Provenance is system-attached metadata; evidence is content the agent maintains.

## State That Survives

No memory-specific state file survives. Peer cards, channel summary cards, change notices, consolidate machinery, and the unused channel-cursor reservation are gone.

## Implementation

One cutover, no compatibility paths, per project legacy policy. The order is internal-first because the public surface depends on the model.

1. **Source model.** Define `ContextSource` (`file | directory | command | runtime`) and `ContextBlock` shapes. Replace `context.resources` and `briefing.commands` with one unified source list. Runtime turn producers register through the same interface.
2. **Agent context directory.** Add `agents/<id>/context/*.md` top-level discovery to assembly. User manually copies any meaningful `MEMORY.md` content into `context/`. Drop `agent:MEMORY.md` from defaults.
3. **Delete derived.** Remove `src/memory/derived/`. Remove the `consolidate_memory` system task. Remove `shrimpy memory peers|peer|channels|channel|changes|forget` CLI surface. Remove the Pi `memory` daemon tool (`src/tools/daemon.ts`) — agents edit context via normal Read/Write/Edit. Do not keep a memory-specific state file without a concrete consumer.
4. **Keyed-slice producer.** Keep one runtime turn-source that loads `context/people/<sender>.md` and `context/channels/<channel>.md` for the active turn and emits a context block. No section parsing — the path is the index.
5. **Rename.** `buildTurnBriefing` → `buildTurnContext`. `BriefingItem` → `ContextBlock`. `shrimpy briefing` → `shrimpy context turn`. `briefing.commands` config → folded into unified source list.
6. **Skills and schedules.** Add `skills/memory-management/`, `skills/journal-daily/`, `skills/journal-compact/`. Add `shrimpy context files list --older-than <duration>` for the compact skill. Document the per-agent schedule pattern. Update setup templates: new agents get an empty `context/` plus stub `identity.md` and `habits.md` with one-line "what goes here" comments. No `MEMORY.md` in new workspaces.

No automatic migration. Existing workspaces with populated `MEMORY.md` or `state/memory.json` content: user copies what matters into `context/` by hand and deletes the rest. Per legacy policy, no compat shim.

CLI lands as:

```bash
shrimpy context files list --agent <id> [--older-than <dur>] [--json]
shrimpy context files show --agent <id> <path>
shrimpy context sources list [--agent <id>] [--channel <name>] [--json]
shrimpy context sources run <id> [--agent <id>] [--channel <name>]
shrimpy context turn [--agent <id>] [--channel <name>]
```

## Tests

Most existing memory tests die with `src/memory/derived/` and `consolidate_memory`. New coverage:

- `context/` directory discovery: top-level files load at session scope, `people/` and `channels/` load at turn scope only when matching, missing files silent.
- Per-entity turn loading: routed turn with sender `human-alice` loads `people/human-alice.md`; turn with channel `home` loads `channels/home.md`; both at once loads both.
- Source-model unification: `file`, `directory`, `command`, `runtime` sources all emit `ContextBlock`s and round-trip through `shrimpy context sources list --json`.
- Skill activity gating: smoke test of the bash recipes against fixture mtimes and channel reads.
- Setup/upkeep coverage: setup installs the memory upkeep skills, and the context file listing CLI exposes older journal files for `journal-compact`.

## Decisions

- Default cadences are seeded conservatively: `memory-management` daily at 03:00, `journal-daily` daily at 22:30, `journal-compact` Sundays at 04:00.
- Do not add `context/agents/<id>.md`. Notes about peer agents use `context/people/agent-<id>.md` until a different routed entity proves necessary.
- Do not add `context/apps/<id>.md`. App/project notes stay in top-level `context/*.md`, vault, or project docs until there is a concrete app routing model.

Journal files are ordinary context files but are not loaded by the default top-level `agent:context/` source. If an agent needs recent journal material in prompt, add an explicit source with bounded scope. If that proves insufficient in practice, add a `maxBytes` or recursive option to directory sources rather than a journal-specific producer.

## Future Shape

Worth noting but out of scope for this redesign: the `runtime` source type could eventually fold into `command` if internal producers become CLI-addressable (`shrimpy context attention --turn $TURN` etc.). That gives full uniformity, free debugging surface ("what would attention emit for this turn?"), and forces deterministic input contracts on internal producers. Defer until after the core consolidation lands.
