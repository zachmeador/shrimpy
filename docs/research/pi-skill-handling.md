# Pi Skill Handling

Date: 2026-05-31
Updated: 2026-07-26
Status: Research note

This note summarizes Pi skill behavior as observed in `@earendil-works/pi-coding-agent@0.77.0`, checks the same selection behavior against `0.82.1` and upstream commit `5bc1c2c0a6f07e00e8c240304182f213ab8d311f`, and maps it to Shrimpy's Pi-backed skill loading design.

## Sources Checked

- Pi docs: `node_modules/@earendil-works/pi-coding-agent/docs/skills.md`
- Pi settings docs: `node_modules/@earendil-works/pi-coding-agent/docs/settings.md`
- Pi RPC docs: `node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`
- Pi SDK example: `node_modules/@earendil-works/pi-coding-agent/examples/sdk/04-skills.ts`
- Pi implementation: `node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js`
- Pi resource loader: `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js`
- Pi session runtime: `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`
- Shrimpy integration: `src/sessions/pi-resources.ts`, `src/skills/service.ts`, `src/sessions/bootstrap.ts`, `src/context/session-prompt.ts`
- Pi upstream skill docs and implementation at commit `5bc1c2c0a6f07e00e8c240304182f213ab8d311f`
- Pi issues [#4753](https://github.com/earendil-works/pi/issues/4753), [#4635](https://github.com/earendil-works/pi/issues/4635), and [#2319](https://github.com/earendil-works/pi/issues/2319)
- Current [OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills.md) and [Codex skill metadata renderer](https://github.com/openai/codex/blob/61a44880a85d2fd0d8770908dea5733495e571c8/codex-rs/core-skills/src/render.rs) at commit `61a44880a85d2fd0d8770908dea5733495e571c8`
- Current [Claude Code skill documentation](https://code.claude.com/docs/en/skills) and [Gemini CLI skill activation documentation](https://geminicli.com/docs/tools/activate-skill/)
- Community projects [pi-smart-skills](https://github.com/dfein38347g/pi-smart-skills), [pi-context-skills](https://github.com/SeanPedersen/pi-context-skills), [pi-skill-gate](https://github.com/cullendotdev/pi-skill-gate), [pi-skill-tool-poc](https://github.com/dljsjr/pi-skill-tool-poc), and [pi-skill-smart-read](https://github.com/YHM404/pi-skill-smart-read)
- Research paper [SkillRouter: Retrieve-and-Rerank Skill Selection for LLM Agents at Scale](https://arxiv.org/abs/2603.22455)

## Intelligent Injection: Short Answer

Pi does not currently have a built-in semantic skill router that examines a request, retrieves or ranks skills, and injects only the most relevant subset. It has progressive disclosure: all model-invocable skill names, descriptions, and locations are advertised in the system prompt, then the model decides whether to read a full `SKILL.md`. Pi's current docs explicitly warn that models do not always perform that read.

There is no maintainer-committed roadmap item for relevance-ranked or top-k skill injection. The clearest maintainer responses point in the opposite architectural direction for now:

- In [#4753](https://github.com/earendil-works/pi/issues/4753), a user proposed configurable skill-prompt injection, token caps, and on-demand loading because a large catalog adds noise and token cost. Pi maintainer Mario Zechner replied that it could be implemented as an extension; the reporter confirmed that this worked.
- In [#4635](https://github.com/earendil-works/pi/issues/4635), a contributor reported that several open-weight models were much more reliable when skills were activated through a dedicated tool rather than the generic `read` tool and published [pi-skill-tool-poc](https://github.com/dljsjr/pi-skill-tool-poc). Zechner asked to see the extension, then said the loader should remain an extension until he could independently confirm the local-model benefit. He did say that Pi's larger execution-environment refactor is intended to load skills and prompts from remote or container filesystems, but that is resource-location work, not intelligent relevance selection.
- In [#2319](https://github.com/earendil-works/pi/issues/2319), a request for per-model-call system-prompt and tool mutation included progressive disclosure and token-budget use cases. Zechner rejected those examples because changing the prefix per call would break prompt caching and noted that extensions can already change active tools. Pi later added structured prompt access to `before_agent_start`, which is the hook community selectors now use, but the cache concern remains an important design constraint.

The practical reading is: maintainers recognize the problem, Pi exposes enough extension seams to experiment with it, and core adoption is not promised.

## What “Intelligent” Means Across Harnesses

It helps to separate three behaviors that are often described as automatic skill loading:

1. **Progressive disclosure:** keep full skill bodies out of the initial prompt and expose only metadata.
2. **Model-selected activation:** let the main model choose a skill from that visible metadata, then load the body with a read or dedicated tool call.
3. **Host-side routing:** run a separate relevance step over the catalog and show or inject only a selected subset.

Pi implements the first two, although activation uses the generic `read` tool. The requested feature is the third.

| Harness | Initial context | Activation | Host-side relevance filtering |
| --- | --- | --- | --- |
| Pi `0.82.1` | Every model-invocable skill's name, description, and path | Main model reads `SKILL.md`; `/skill:name` forces expansion | None in core |
| Codex | Name, description, and locator under a 2% context-window budget, or 8,000 characters when the window is unknown | Main model implicitly chooses from descriptions and then loads the selected source; explicit `$skill` is also supported | No semantic router is visible in the open-source renderer; overflow ordering is deterministic by system, admin, repo, user scope, then name/path |
| Claude Code | Model-invocable skill descriptions remain in context | Main model calls the dedicated Skill tool; `paths`, `when_to_use`, and invocation-policy metadata can narrow activation | Path gating exists, but normal relevance choice is still model judgment over metadata |
| Gemini CLI | Name and description are always in context | Main model calls `activate_skill`, with activation consent | No separate semantic retriever is documented |

So the user's intuition is directionally right but easy to overstate. Modern harnesses usually perform automatic activation, and dedicated skill tools may improve model adherence, but they generally do not semantically retrieve a shortlist before constructing the initial skills catalog. Codex is not evidence that a mature host already solves large-catalog relevance routing: its current implementation bounds metadata cost, shortens descriptions, and eventually omits lower-priority scopes without query-aware ranking.

## Community Pi Implementations

### `pi-smart-skills`: Query-Time Hybrid Retrieval

[pi-smart-skills](https://github.com/dfein38347g/pi-smart-skills/tree/8a08f37aa306d7fd8ec1eb9b37c8566a3ef0aaac) is the closest direct implementation of intelligent context injection found. Its `before_agent_start` hook queries [QMD](https://github.com/qmd-remote/qmd) with the current user prompt, uses lexical plus vector retrieval and reranking over indexed global/package skill files, keeps project-local skills visible, and rewrites Pi's `<available_skills>` block to the top results. It defaults to ten results, keeps a small stability cache to reduce prompt churn, and fails open to Pi's complete catalog if retrieval fails.

This is promising prior art, especially because it indexes skill bodies instead of routing only on descriptions. It is also very early: the repository was created on 2026-07-24, identifies itself as `0.1.0`, has no test directory or license file despite declaring MIT in `package.json`, imports QMD from installation-specific internal paths, discovers packages through filesystem conventions, and rewrites Pi's serialized XML block. Treat it as a design probe, not a production dependency.

### `pi-context-skills`: Project-Level LLM Curation

[`@sean_pedersen/pi-context-skills`](https://pi.dev/packages/%40sean_pedersen/pi-context-skills), inspected at [commit `5493713`](https://github.com/SeanPedersen/pi-context-skills/tree/5493713bcff23f29d00d113bc9d3c9294596b18a), asks the active Pi model to choose a conservative skill subset from a compact project summary, then saves that selection in `.pi/skills-selection.json`. Later turns reuse the project selection, and `/skills` allows inspection, editing, and reset.

This is cheaper and more cache-stable than query-time routing, but it answers “which skills fit this repository?” rather than “which skills fit this request?” A saved selection can go stale as the project or installed catalog changes, and a skill useful for an unusual one-off request may never be shown.

### Activation And Visibility Variants

- [pi-skill-tool-poc](https://github.com/dljsjr/pi-skill-tool-poc) adds a dedicated skill-loading tool to test model adherence. It improves the activation mechanism but does not reduce the visible catalog.
- [pi-skill-smart-read](https://pi.dev/packages/pi-skill-smart-read) adds a `skill_read` tool that can return an index or selected section of large skill documents. It reduces body-loading cost after selection but does not choose among skills.
- [pi-skill-gate](https://pi.dev/packages/pi-skill-gate) provides manual, per-project visibility controls, full-text browsing, and usage counts. It solves catalog curation and inspection, not automatic relevance.

The existence of several independent extensions is useful evidence that the pressure is real. It also supports Pi's current maintainership stance that this is extension-shaped until the community converges on a reliable policy.

## Research Signal

The March 2026 [SkillRouter paper](https://arxiv.org/abs/2603.22455) studies routing over roughly 80,000 skills and reports that removing full skill bodies from the retrieval input reduces top-1 performance by 29–44 percentage points across its tested methods. Its two-stage full-text retriever and reranker reaches 74% top-1 accuracy on the authors' benchmark.

This is early, non-Pi-specific research over a much larger catalog than Shrimpy currently needs, so its absolute numbers should not be treated as a product guarantee. The useful design signal is narrower: if Shrimpy eventually adds host-side routing, indexing only `name` and `description` is likely the wrong foundation. Full skill text is valuable offline retrieval input even though it should not all be injected into the agent context.

## Implications For Shrimpy

Shrimpy should not wait for a promised Pi core feature; none is promised. It also should not immediately adopt a third-party selector. Shrimpy already owns the effective skill set and prompt-resource boundary, while its fixed resource loader intentionally does not consume ambient Pi packages. A community package would therefore need deliberate integration or adaptation anyway.

The current warning above 20 visible skills remains a reasonable first-stage guardrail. If real workspaces begin exceeding it, the next experiment should be Shrimpy-owned and observable:

1. Preserve agent/workspace precedence, explicit `--skill`/watch invocation, `disable-model-invocation`, and tool-compatibility gating before retrieval.
2. Keep a small stable catalog when it fits the budget. Only introduce routing above a measured threshold.
3. Index complete `SKILL.md` bodies, while injecting only the chosen metadata or full bodies.
4. Prefer a stable system-prompt prefix. Put turn-specific selected skill content after that prefix or in a session message so prompt caching degrades as little as possible.
5. Expose selected candidates, scores/reasons, omitted count, fallback state, and manual override through the CLI and context inspection.
6. Fail open for small trusted catalogs and use an explicit user-visible fallback for large catalogs; silently hiding the one necessary skill is worse than spending some extra tokens.
7. Evaluate routing and downstream task success on Shrimpy's actual skill catalog before making it a default.

A useful first comparison would test three policies on the same prompts: Pi's full metadata catalog, persistent project-level curation, and query-time full-body hybrid retrieval. That would distinguish token savings from actual skill-selection and task-success gains.

## Pi Model

Pi treats skills as progressive-disclosure capability bundles. Startup loads only name, description, file path, base directory, source info, and `disable-model-invocation`. The system prompt advertises visible skills in an XML `<available_skills>` block. Full `SKILL.md` content is loaded later when the model reads the file or when the user invokes `/skill:<name>`.

Pi's canonical skill object has:

- `name`
- `description`
- `filePath`
- `baseDir`
- `sourceInfo`
- `disableModelInvocation`

Pi validates most Agent Skills standard issues as warnings, but a missing or blank description means the skill is not loaded. Names must be lowercase letters, numbers, and hyphens, with max length 64. Descriptions have max length
1024. Pi is deliberately lenient about the frontmatter `name` differing from
the parent directory.

## Discovery Rules

Pi can load skills from:

- global Pi/user locations: `~/.pi/agent/skills/`, `~/.agents/skills/`
- project locations: `.pi/skills/`, `.agents/skills/`
- package resources
- settings `skills`
- explicit CLI or SDK paths

For Shrimpy, the important detail is not the default locations. It is how the SDK loader behaves when defaults are disabled:

- `DefaultResourceLoader({ noSkills: true })` disables default/settings skill discovery.
- Explicit CLI skills and `additionalSkillPaths` still load even when `noSkills` is true.
- `skillsOverride` can replace or filter the loaded skill list after the loader has built a base result.

This means Shrimpy can keep ambient cwd-local Pi skill discovery disabled while still giving Pi an explicit Shrimpy-approved skill set.

## Files And Frontmatter

Pi supports a directory with `SKILL.md` as the standard bundle shape. When a directory contains `SKILL.md`, Pi treats that directory as one skill root and does not recurse deeper. If a scanned root does not itself contain `SKILL.md`, Pi recurses into subdirectories. In some Pi-native roots, direct root `.md` files are also loaded as skills.

Pi parses YAML frontmatter. This matters for Shrimpy because the default `memory-management`, `journal-daily`, and `journal-compact` skills use multi-line YAML descriptions. Shrimpy's current `src/skills/service.ts` frontmatter parser is line-based, so a `description: |` field can become just `|` in Shrimpy's skill view even though Pi parses the description correctly.

## Prompt And Slash Commands

Pi's `buildSystemPrompt()` appends skills to the system prompt when the read tool is available. This happens even when a caller provides a custom `systemPrompt` through `DefaultResourceLoader`.

Skill slash commands are registered as `/skill:<name>` when `enableSkillCommands` is true. Expansion happens in `AgentSession`, not only in interactive mode, so RPC and print-style prompts can expand skill commands too. Expansion reads the skill file, strips frontmatter, wraps the body like:

```xml
<skill name="..." location="...">
References are relative to ...

...
</skill>
```

Any trailing command arguments are appended after the skill block. Unknown skills pass through unchanged.

RPC `get_commands` reports skills as commands with names like `skill:brave-search`, source `skill`, and source/path metadata. Interactive autocomplete builds the same command list from `resourceLoader.getSkills()`.

## Pre-Integration Shrimpy Mismatch

Before Pi-backed skill loading, Shrimpy had its own skill scanner and prompt resource path:

- `shrimpy skills list` scans `agents/<id>/skills/` and workspace `skills/`.
- `shrimpy --skill <id>` and scheduled skill runs load the matching `SKILL.md` into Shrimpy's assembled prompt resources.
- `createBootstrap()` advertises available skills through Shrimpy's own `capability:available_skills` section.

But Shrimpy's Pi loader passed:

```ts
additionalSkillPaths: [],
noSkills: true,
```

So Pi's actual `resourceLoader.getSkills()` was empty in normal Shrimpy sessions. That means Pi slash skill commands, autocomplete, RPC command discovery, and Pi's XML skill prompt block do not match the Shrimpy skill list.

There was also a prompt-preview risk. If Shrimpy simply started giving Pi skills, Pi will append its own XML `<available_skills>` block to the custom system prompt. Shrimpy's prompt preview and Shrimpy's existing available-skill section would need to be adjusted to avoid duplicated or divergent skill advertising.

## Integration Options

### Option A: Pass Shrimpy Skill Files As Explicit Pi Paths

Keep `noSkills: true`, set `additionalSkillPaths` to Shrimpy-resolved `SKILL.md` file paths, and remove or replace Shrimpy's hand-rendered available skills section.

Pros:

- Simple.
- Uses Pi's parser, validation, slash commands, RPC command discovery, source metadata, and XML prompt formatting.
- Preserves Shrimpy's guardrail against ambient cwd-local discovery.

Risks:

- Pi collision behavior is by frontmatter `name`, not Shrimpy `id`.
- Path order controls winner precedence.
- Shrimpy context preview must account for Pi's appended skills block.

### Option B: Use `skillsOverride`

Keep `noSkills: true` and `additionalSkillPaths: []`, then return a Shrimpy-built `Skill[]` from `skillsOverride`.

Pros:

- Full control over Shrimpy workspace/agent precedence.
- Can avoid root `.md` behavior and other broad directory scan differences.
- Can assign source info and names deliberately.

Risks:

- Shrimpy must either reuse Pi parsing helpers or reproduce Pi validation accurately.
- More code than explicit path loading.

### Option C: Add Shrimpy Roots To Pi Settings/Defaults

Let Pi discover Shrimpy workspace and agent skill roots via settings/default paths.

Pros:

- Closer to normal Pi behavior.

Risks:

- More likely to reintroduce ambient discovery or mixed settings state.
- Harder to enforce Shrimpy's agent/workspace boundary and live-workspace safety policy.

## Recommendation

Use Option A for the first slice, with a narrow path list:

1. Resolve Shrimpy's effective skill list for the active agent.
2. Pass only the winning `SKILL.md` entry paths to Pi with `noSkills: true`.
3. Order paths so agent-level skills win before workspace skills if Pi sees the same `name`.
4. Replace Shrimpy's current available-skill section with Pi-compatible skill rendering, or make Shrimpy context preview explicitly include the same Pi skill block that runtime sessions receive.
5. Switch Shrimpy skill metadata parsing to Pi's exported parser/loader or a real YAML parser so Shrimpy and Pi agree on multi-line descriptions and validation.
6. Add tests that assert `resourceLoader.getSkills()` contains the setup and workspace default skills in normal Shrimpy sessions, while unrelated cwd `.pi/skills` or `.agents/skills` are still ignored.

If path ordering and name collision handling become awkward, move to Option B with `skillsOverride`, but still reuse Pi's `loadSkills`/frontmatter behavior where possible.

## Skill Loading Decisions

- Shrimpy's public skill id is the directory id. Pi's command name is frontmatter `name`. Shrimpy validation treats mismatches as errors so CLI, schedules, and `/skill:<name>` all stay aligned.
- `disable-model-invocation` follows Pi behavior: the skill remains loadable, but it is omitted from Pi's available-skill prompt block.
- `shrimpy skills list --json` exposes Shrimpy id, Pi name, scope, source paths, load state, diagnostics, and shadowed skills.
- Shrimpy prompt previews include Pi's XML `<available_skills>` block for parity with runtime sessions. The Shrimpy-only base prompt is still exposed as `shrimpySystemPrompt` in `shrimpy context --json`.
- Scheduled and explicit Shrimpy skill preloads continue to resolve by Shrimpy id. Pi slash commands resolve by Pi name.
- No automatic relevance ranking or top-k filtering is part of the first slice. Effective skill sets above 20 visible skills produce an inspectable warning.
