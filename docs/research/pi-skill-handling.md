# Pi Skill Handling

Date: 2026-05-31
Status: Research note

This note summarizes Pi skill behavior as observed in
`@earendil-works/pi-coding-agent@0.77.0` and maps it to Shrimpy's Pi-backed
skill loading design.

## Sources Checked

- Pi docs: `node_modules/@earendil-works/pi-coding-agent/docs/skills.md`
- Pi settings docs:
  `node_modules/@earendil-works/pi-coding-agent/docs/settings.md`
- Pi RPC docs: `node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`
- Pi SDK example:
  `node_modules/@earendil-works/pi-coding-agent/examples/sdk/04-skills.ts`
- Pi implementation:
  `node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js`
- Pi resource loader:
  `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js`
- Pi session runtime:
  `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`
- Shrimpy integration:
  `src/sessions/pi-resources.ts`, `src/skills/service.ts`,
  `src/sessions/bootstrap.ts`, `src/sessions/prompt.ts`

## Pi Model

Pi treats skills as progressive-disclosure capability bundles. Startup loads
only name, description, file path, base directory, source info, and
`disable-model-invocation`. The system prompt advertises visible skills in an
XML `<available_skills>` block. Full `SKILL.md` content is loaded later when the
model reads the file or when the user invokes `/skill:<name>`.

Pi's canonical skill object has:

- `name`
- `description`
- `filePath`
- `baseDir`
- `sourceInfo`
- `disableModelInvocation`

Pi validates most Agent Skills standard issues as warnings, but a missing or
blank description means the skill is not loaded. Names must be lowercase
letters, numbers, and hyphens, with max length 64. Descriptions have max length
1024. Pi is deliberately lenient about the frontmatter `name` differing from
the parent directory.

## Discovery Rules

Pi can load skills from:

- global Pi/user locations: `~/.pi/agent/skills/`, `~/.agents/skills/`
- project locations: `.pi/skills/`, `.agents/skills/`
- package resources
- settings `skills`
- explicit CLI or SDK paths

For Shrimpy, the important detail is not the default locations. It is how the
SDK loader behaves when defaults are disabled:

- `DefaultResourceLoader({ noSkills: true })` disables default/settings skill
  discovery.
- Explicit CLI skills and `additionalSkillPaths` still load even when
  `noSkills` is true.
- `skillsOverride` can replace or filter the loaded skill list after the loader
  has built a base result.

This means Shrimpy can keep ambient cwd-local Pi skill discovery disabled while
still giving Pi an explicit Shrimpy-approved skill set.

## Files And Frontmatter

Pi supports a directory with `SKILL.md` as the standard bundle shape. When a
directory contains `SKILL.md`, Pi treats that directory as one skill root and
does not recurse deeper. If a scanned root does not itself contain `SKILL.md`,
Pi recurses into subdirectories. In some Pi-native roots, direct root `.md`
files are also loaded as skills.

Pi parses YAML frontmatter. This matters for Shrimpy because the default
`memory-management`, `journal-daily`, and `journal-compact` skills use
multi-line YAML descriptions. Shrimpy's current `src/skills/service.ts`
frontmatter parser is line-based, so a `description: |` field can become just
`|` in Shrimpy's skill view even though Pi parses the description correctly.

## Prompt And Slash Commands

Pi's `buildSystemPrompt()` appends skills to the system prompt when the read
tool is available. This happens even when a caller provides a custom
`systemPrompt` through `DefaultResourceLoader`.

Skill slash commands are registered as `/skill:<name>` when
`enableSkillCommands` is true. Expansion happens in `AgentSession`, not only in
interactive mode, so RPC and print-style prompts can expand skill commands too.
Expansion reads the skill file, strips frontmatter, wraps the body like:

```xml
<skill name="..." location="...">
References are relative to ...

...
</skill>
```

Any trailing command arguments are appended after the skill block. Unknown
skills pass through unchanged.

RPC `get_commands` reports skills as commands with names like
`skill:brave-search`, source `skill`, and source/path metadata. Interactive
autocomplete builds the same command list from `resourceLoader.getSkills()`.

## Pre-Integration Shrimpy Mismatch

Before Pi-backed skill loading, Shrimpy had its own skill scanner and prompt
resource path:

- `shrimpy skills list` scans `agents/<id>/skills/` and workspace `skills/`.
- `shrimpy --skill <id>` and scheduled skill runs load the matching
  `SKILL.md` into Shrimpy's assembled prompt resources.
- `createBootstrap()` advertises available skills through Shrimpy's own
  `capability:available_skills` section.

But Shrimpy's Pi loader passed:

```ts
additionalSkillPaths: [],
noSkills: true,
```

So Pi's actual `resourceLoader.getSkills()` was empty in normal Shrimpy sessions.
That means Pi slash skill commands, autocomplete, RPC command discovery, and
Pi's XML skill prompt block do not match the Shrimpy skill list.

There was also a prompt-preview risk. If Shrimpy simply started giving Pi skills,
Pi will append its own XML `<available_skills>` block to the custom system
prompt. Shrimpy's prompt preview and Shrimpy's existing available-skill
section would need to be adjusted to avoid duplicated or divergent skill
advertising.

## Integration Options

### Option A: Pass Shrimpy Skill Files As Explicit Pi Paths

Keep `noSkills: true`, set `additionalSkillPaths` to Shrimpy-resolved
`SKILL.md` file paths, and remove or replace Shrimpy's hand-rendered available
skills section.

Pros:

- Simple.
- Uses Pi's parser, validation, slash commands, RPC command discovery, source
  metadata, and XML prompt formatting.
- Preserves Shrimpy's guardrail against ambient cwd-local discovery.

Risks:

- Pi collision behavior is by frontmatter `name`, not Shrimpy `id`.
- Path order controls winner precedence.
- Shrimpy context preview must account for Pi's appended skills block.

### Option B: Use `skillsOverride`

Keep `noSkills: true` and `additionalSkillPaths: []`, then return a Shrimpy-built
`Skill[]` from `skillsOverride`.

Pros:

- Full control over Shrimpy workspace/agent precedence.
- Can avoid root `.md` behavior and other broad directory scan differences.
- Can assign source info and names deliberately.

Risks:

- Shrimpy must either reuse Pi parsing helpers or reproduce Pi validation
  accurately.
- More code than explicit path loading.

### Option C: Add Shrimpy Roots To Pi Settings/Defaults

Let Pi discover Shrimpy workspace and agent skill roots via settings/default
paths.

Pros:

- Closer to normal Pi behavior.

Risks:

- More likely to reintroduce ambient discovery or mixed settings state.
- Harder to enforce Shrimpy's agent/workspace boundary and live-workspace
  safety policy.

## Recommendation

Use Option A for the first slice, with a narrow path list:

1. Resolve Shrimpy's effective skill list for the active agent.
2. Pass only the winning `SKILL.md` entry paths to Pi with `noSkills: true`.
3. Order paths so agent-level skills win before workspace skills if Pi sees the
   same `name`.
4. Replace Shrimpy's current available-skill section with Pi-compatible skill
   rendering, or make Shrimpy context preview explicitly include the same Pi
   skill block that runtime sessions receive.
5. Switch Shrimpy skill metadata parsing to Pi's exported parser/loader or a
   real YAML parser so Shrimpy and Pi agree on multi-line descriptions and
   validation.
6. Add tests that assert `resourceLoader.getSkills()` contains the setup and
   workspace default skills in normal Shrimpy sessions, while unrelated cwd
   `.pi/skills` or `.agents/skills` are still ignored.

If path ordering and name collision handling become awkward, move to Option B
with `skillsOverride`, but still reuse Pi's `loadSkills`/frontmatter behavior
where possible.

## Skill Loading Decisions

- Shrimpy's public skill id is the directory id. Pi's command name is
  frontmatter `name`. Shrimpy validation treats mismatches as errors so CLI,
  schedules, and `/skill:<name>` all stay aligned.
- `disable-model-invocation` follows Pi behavior: the skill remains loadable,
  but it is omitted from Pi's available-skill prompt block.
- `shrimpy skills list --json` exposes Shrimpy id, Pi name, scope, source paths,
  load state, diagnostics, and shadowed skills.
- Shrimpy prompt previews include Pi's XML `<available_skills>` block for parity
  with runtime sessions. The Shrimpy-only base prompt is still exposed as
  `shrimpySystemPrompt` in `shrimpy context --json`.
- Scheduled and explicit Shrimpy skill preloads continue to resolve by Shrimpy
  id. Pi slash commands resolve by Pi name.
- No automatic relevance ranking or top-k filtering is part of the first slice.
  Effective skill sets above 20 visible skills produce an inspectable warning.
