# 🦐 SLOP-001: Remove-the-Slop Cleanup Pass

Status: todo
Priority: P1
Area: Hygiene

## Why

An external review called out the gap between the doctrine ("keep it shrimple", few primitives, navigable by cheap models) and the implementation (type sprawl, interface bureaucracy). A four-dimension investigation (dead code, duplication, type surface, layering) verified where the slop actually is. Goal: delete complexity with zero behavior change, measured in LOC, exported types, and directories — not vibes.

Baseline (verified 2026-06-09, line refs from that snapshot): src/ = 31,690 LOC across 182 files, 22 top-level dirs + 3 loose root files; test/ = 16,329 LOC across 74 files; 353 exported interfaces/types.

## What is NOT here (verified negative results — don't go hunting)

- Zero orphan files, zero unused dependencies, zero commented-out code blocks. Both typebox versions are intentional (Pi pins `typebox` 1.x; config schemas use `@sinclair/typebox` 0.34; documented in docs/research/pi-agent.md).
- Token-level duplication is 1.2% (jscpd) — copy-paste is not the disease.
- Import graph is nearly clean: commands/ is a strict top layer, channels/ has no upward imports. Only defects: a sessions↔tui cycle (wave 4) and a context→gateway edge (wave 4).
- ts-prune output is 97% noise here (star-barrels break it): of 325 candidates, only ~10 symbols are truly dead. Never bulk-delete from tool output.
- The "55% of exported types have zero external importers" census number is an upper bound, not a kill list — many are union members, fields of exported parents, or forced by `declaration: true`. Realistic collapsible total: 70–100 of 353.

## Wave 0 — confirmed dead code and policy violations — done 2026-06-09

Pure deletion, −112 LOC net across 14 files; `tsc --noEmit`, `eslint`, and tests green (the lone `setup-init` SYSTEM.md assertion failure is pre-existing and unrelated — that text was dropped from the committed template in d62a83c, tracked separately). The diff is the record; see git history.

Two plan corrections found while executing, relevant to later waves: (1) the surfaces/telegram barrel re-exports are *not* all dead — `setup/telegram.ts`, `commands/status.ts`, and `test/tools.test.ts` consume them through the barrel, so only the dead type re-exports (`ResolvedTelegramInstanceConfig`, `TelegramRuntimeConfig`) were removed; the value exports stay. (2) `unbindSkillPackage` was kept — it gained a CLI caller since the plan was written.

## Wave 1 — missing primitives — done 2026-06-09

Shared primitive pass, −210 LOC net across 31 files; `tsc --noEmit`, `npm run lint`, and `npm test` green. Behavior stayed intentionally boring: shared helpers now own record guards, model refs, short age formatting, duration parsing, positive integers, session custom-entry lookup, recorded inference parsing, human message envelopes, compaction request bases, and watch run records. One deliberate tightening: command positive-integer parsing now rejects malformed strings like `5abc` instead of accepting the parsed prefix.

The util layer that exists is adopted (util/json-file.ts has 15 importers); the duplication is utils that were never created:

- `isRecord` is defined byte-identically in 16 files. One export in src/util/ (json-file.ts or a sibling), delete the rest.
- Model-ref micro-library is fragmented across 6 files (commands/models.ts, sessions/models.ts, sessions/open.ts, config/model.ts, tui/shrimpy-model-selection.ts, setup/coding-policy.ts): `ModelRef` declared 3×, `toModelRef` 3×, `provider/id` formatting under 5 names, `hasConfiguredAuth` probe 2×. One home (config/model.ts or sessions/models.ts) exporting `ModelRef`, `formatModelRef`, `parseModelRef`, `sameModelRef`, `toModelRef`, `hasConfiguredAuth`.
- Relative-age ladder is hand-rolled 4× (sessions/status.ts, context/turn/service.ts, channels/format.ts, util/time-format.ts) — two copies byte-identical. Add `formatAgeShort` to util/time-format.ts, rebuild the rest on it. Fold commands/context.ts `parseDuration` into util's `parseDurationMs` (add weeks + non-throwing wrapper).
- Session JSONL "last custom entry" reverse-scan is written 4× and `parseModelVariantInference`/`parseRecordedInference` are character-identical 26-line twins (sessions/service.ts, sessions/compaction-runner.ts, context/metadata.ts). Add `findLastCustomEntry(lines, customType)` next to the writer; move the inference parser to inference/params.ts, exported once.
- src/channels/protocol.ts: four `human*MessageInput` builders repeat an identical 9-field sender/origin block — extract one `humanMessageInput(base, content)` helper; same for chat-bridge.ts `baseFields`.
- Within-file clones: compaction-runner.ts repeats an 11-field summary-request spread 4× (build `requestBase` once); watches/runner.ts builds near-identical success/failure `WatchRunRecord` literals (one `finishedRecord` helper).
- Six hand-rolled positive-int parsers (commands/watches.ts, commands/models.ts, channels-inspect.ts ×2, gateway-logs.ts; telegram client's clamping variants stay — different semantics) → one `parsePositiveInt(raw, label)` in util/. Export the structural-invisible-character guard from watches/schema.ts instead of the copy in commands/watches.ts.

## Wave 2 — command-layer and test convergence — done 2026-06-09

Command/test convergence pass: the model/session CLI option block (`provider/model/model-policy/thinking/skill`) now lives in `commands/agent-helpers.ts` as `MODEL_SESSION_OPTIONS` + `readModelSessionValues`; watches/models/context/workspace dispatch through `createCommandGroup`, including path-aware nested groups and the deliberate models unknown-subcommand convergence onto UsageError exit 1; and `test/helpers.ts` owns the stderr-capturing `captureLogs`, `makeTempWorkspace`, and `removeTempWorkspace` helpers used by the 9 command tests that had local log capture copies. `--json` stays per-action.

## Wave 3 — type-surface collapse (353 → ~285 exported types, ~300 LOC)

Decision gate first: tsconfig has `"declaration": true`, which forces `export` on every type referenced by an exported signature — yet shrimpy is a bin-only CLI; nothing consumes its .d.ts. Recommend dropping it; that legalizes unexporting without churn. If kept, "kill" means inline/merge, not unexport.

- Channel read-model family (the review's named example, confirmed): src/channels/service.ts exports 9 read-model types, 2 ever imported. `ChannelMessageInspection.source` duplicates 4 of 7 fields from the message itself; `ChannelSourceRecordSummary` is a pure field-rearrangement of an Inspection; `ChannelMessagePreview` differs from Inspection only by omission. Collapse to ~5 (keep `ChannelSummary`, `ChannelSearchFilters`, `ChannelSearchResult`, `ChannelMessageKind`, merged Inspection). Caution: these shapes are the `channels list/show/search --json` wire — key changes are allowed at alpha but must be deliberate, in one commit, with docs/reference updated. Bonus fix: `summarizeChannel` eagerly inspects every message to build `activity` that `cmdChannelsList` text mode discards.
- src/channels/protocol.ts Publish* family: 11 input types repeating one 9-field envelope; extract `PublishHumanBaseInput`, collapse the session trio (zero external refs) → ~6 types. Keep the publish-method-per-kind API itself.
- src/context: `ResolvedContextCommandSource` ≡ `Required<ContextCommandSourceConfig>`, `ContextDefaultsConfig` ≡ `Pick<ContextConfig, "sources" | "env">` — express as derived aliases so they can't drift. Inline `ParsedContextResource`, `ContextResourceScope`, and preview.ts's three zero-consumer return DTOs (`SessionContextPreview`, `ContextPreviewTarget`, `ContextSourceKind`).
- src/watches: inline never-referenced union members (`WatchMessageAction`, `WatchEveryMsTrigger`, `WatchCronTrigger`, `InspectWatchesOptions`); keep the schema core (real config format). Optionally slim `WatchInspection`'s 9 fields that restate `watch.*` — touches `watches show --json`, same wire caution.
- src/sessions: registry.ts and service.ts maintain parallel result vocabularies for the same lifecycle events (both sets have zero external refs). Pick one owner; embed registry results in the service unions.
- src/skills/project-sync.ts: 9 exported DTOs for an internal build script, zero external type consumers, Options/Result mirror pairs ×3 → collapse to ~3 via `Required<>`/inference.
- Explicit keeps (cite when wielding the census): Telegram wire types mirror the Bot API (external contract); channels/messages.ts union + constructors + guards is the message protocol; the Config→Resolved pairing is the one sanctioned two-types-per-thing idiom — enforce it via `Required<>`/`Pick<>` where shapes are exact derivations.

## Wave 4 — structure moves (net ~200 LOC, −2 dirs, clean seams)

- sessions/direct.ts: `openDirectAgentSession` and `runAgentTuiSession` are ~75-line near-verbatim twins (model resolution already drift-risk). Extract `prepareDirectSessionOpen` shared preamble; move the TUI runner + installer block into tui/ (e.g. tui/interactive.ts). This breaks the only directory cycle (sessions↔tui). Needs a manual TUI smoke test.
- Workspace-config mutation has no choke point: 6 independent read-patch-write sites (commands/models.ts, tui/shrimpy-settings.ts, tui/shrimpy-model-selection.ts, agents/config-store.ts, setup/telegram.ts + init.ts + coding-policy.ts), with `readRawConfig` duplicated verbatim in the two tui files — and this is the user-data file the Live Workspace Safety rule is about. Add `config/store.ts` `editConfigFile(workspace, mutate)` (read → mutate → validate → atomic write); route all writers through it; tui becomes pure UI.
- src/gateway-ctl.ts (547 LOC) is a library misfiled as a root entry (no shebang, imported by 6 modules) → move to src/gateway/service-ctl.ts; only code change is `gatewayScript()`'s `import.meta.dirname` join gaining a `".."`. src root becomes exactly the two package.json bins.
- Fold delivery/ (314 LOC, sole importer src/gateway.ts) into gateway/; fold memory/ (88 LOC + 1-line barrel, sole consumers context/turn/*) into context/turn/memory.ts — re-extract if it ever gains a second consumer. 22 dirs → 20. Other small dirs (util, inference, app, workspace-checkpoints) earn their keep via fan-in.
- Move gateway/status.ts → channels/activity.ts (it reads channel logs and watch state, nothing daemon-related); severs the context→gateway edge.
- sessions/open.ts: lines ~353-623 are a second job (session JSONL metadata recording + model-switch re-recording) → extract sessions/session-record.ts; pairs with wave 1's `findLastCustomEntry` so the record format has one named home. sessions/service.ts: compaction inspection (~300 LOC) → sessions/compaction-inspect.ts; service keeps lifecycle + listing.
- Seven deep imports into Pi's `dist/` internals across 5 files (theme, ThinkingSelectorComponent, configureHttpDispatcher, initTheme/setRegisteredThemes, BUILT_IN_PROVIDER_DISPLAY_NAMES) → one shim module (suggest src/app/pi-internals.ts; exact home is taste) so Pi upgrades break one file.

## Boundaries

- Do not split for size alone. Verified big-but-fine: compaction-runner.ts, telegram/outbound.ts, commands/models.ts (after `editPolicies` moves), telegram/bridge.ts, channels/service.ts (after type collapse), context/spec.ts, tui/shrimpy-command-surface.ts.
- Do not framework the versioned JSON-store envelope (channels/store, gateway/identity-store, thread-state-store, agents/config-store) — thin, domain-specific, already composed over util/json-file.
- Do not grow the surface-module registry abstraction before surface #2 exists; do not bulk-unexport the ~150 exported-but-internal symbols unless the `declaration: true` decision makes it mechanical.
- No new compat shims anywhere, per policy. JSON output key changes are deliberate, batched, and reflected in docs/reference.
- Zero behavior change except: unknown-subcommand exit codes converging on UsageError semantics (wave 2) and deliberate `--json` key changes (wave 3).

## Verification

Per wave: `npm run lint`, `tsc --noEmit`, full `npm test` (note: build/test rewrite dist/, which the live `shrimpy` binary points at — run deliberately). After wave 4: manual TUI smoke (`shrimpy`), gateway start/stop, one Telegram round-trip. Each wave is a coherent commit series on `wip`, promoted to `main` per the git workflow. Re-run the ts-prune/census after waves 3-5 to confirm the surface actually shrank.

## Done

- src root contains exactly cli.ts and gateway.ts; 20 top-level dirs.
- `isRecord`, model-ref helpers, age ladder, duration parser, positive-int parser, inference parser each exist exactly once.
- Zero removed-key tombstones; zero dead exports from waves 0 findings.
- Exported interface/type count ≤ 285 (from 353); ts-prune/knip runs near-clean with documented exceptions.
- watches/models/context/workspace use `createCommandGroup`; one `--json` convention; test/helpers.ts exists and the 9 `captureLogs` copies are gone.
- Total: ~1,200–1,500 LOC removed across src+test with tests green throughout.

## Noticed in passing (out of scope)

- CLI-coverage gap: the web server is only reachable via the `shrimpy-web` binary; no `shrimpy web` subcommand exists, contra the "every feature via `shrimpy <command>`" rule.
- Possible future refactor (not slop): converge config schemas from `@sinclair/typebox` 0.34 onto `typebox` 1.x to drop the dual dependency.
