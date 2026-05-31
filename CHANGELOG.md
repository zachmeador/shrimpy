# Shrimpy Changelog

Public releases at `0.1.0` or later get a short lyrical aquatic release name/tagline.

## 0.2.0 - Lanterns in the Current - Unreleased

- Added a Shrimpy-owned TUI layer on top of Pi interactive mode, including unified `/status` and `/settings` surfaces, model/thinking selectors, compact tool rows with Ctrl+O expansion, and the bottom-row Shrimpy activity indicator.
- Added release metadata from `package.json` so CLI help/version output follows the configured package version, description, and release name.
- Changed Pi integration to depend on registry-published `@earendil-works/*@0.77.0` packages, with the local patch/fork path documented as a private-only contingency.
- Added `shrimpy models` and `shrimpy models resolve` for inspecting agent defaults, Pi-visible provider models, session/channel model precedence, and missing default-model setup hints.
- Changed model defaults to require explicit provider/id pairs, restore saved model selections for local `tui` and `run` sessions, and record current model/inference metadata in session history.
- Added `shrimpy agent inspect`, `--disable-tools`, and tool capability policy reporting so agents can enable Shrimpy daemon tools while excluding Pi built-ins or other registered tools.
- Added active-channel publication tools: `reply`, `ask`, `notify`, and `report`. Publication intent now flows through channel egress, and Telegram low-urgency notifications can be delivered quietly.
- Added fine-grained `shrimpy agent attention set` and `shrimpy agent attention clear` mutators for base and per-channel attention policies.
- Changed gateway/status reporting to summarize generic scheduled runs across configured schedules instead of treating heartbeat as a runtime/status primitive; default schedule seeding now lives with setup defaults.
- Improved compaction summaries with session-agent context, looser summary formats, system-prompt-aware chunking, and stronger preservation of agent voice/workspace expectations.
- Improved model-variant inference handling so payload rewrites and sampler params apply only to the current model.
- Added memory reference documentation, Discord DM adapter research, release-process docs, and new backlog notes for browser automation, worker sessions, durable waits, vault conventions, setup/security, and surface work.
- Removed completed backlog/tracking notes and stale VS Code workspace settings; added a checked-in `shrimpy.code-workspace`.
- Expanded regression coverage for the new TUI surfaces, model commands/restoration, tool policy, attention mutators, compaction, Telegram outbound formatting, and channel delivery behavior.

## 0.1.0 - First Light in the Tidepool - 2026-05-30

- Initial alpha release of Shrimpy.
- APIs, CLI behavior, and workspace layout may change.
