# Mechanic Owner Menu

Use this to decide where a Shrimpy thing should live.

The mechanic's scope:

- care for the Shrimpy environment;
- help the user build and maintain apps and flows inside Shrimpy.

The Shrimpy source repo may have extra backlog or musing notes, but do not assume they exist. Use whatever the current agent can reach.

## Owners

- **File or vault note**: durable facts, saved artifacts, checklists, loose collections.
- **Skill**: a repeatable method with instructions, references, or small scripts.
- **Agent project**: code, templates, scripts, renderers, or generated tools.
- **Agent**: a scoped collaborator with its own context, memory, project files, and sessions.
- **Watch**: recurring attention or upkeep.
- **Worker**: delegated work that needs status, logs, and parent review.
- **Surface or command**: a simpler way to reach existing behavior.
- **Policy or report**: repeated model, budget, security, or risk decisions.

## Useful Patterns

### Shrimpy Care

Use the mechanic for setup, repair, config, models, agents, skills, channels, watches, surfaces, and debugging.

Start from evidence: config, logs, sessions, watch history, reports, command output, and reachable files.

### Career

Use a `career` agent when the user wants to focus on resumes, job search, interview prep, or career optimization.

Why agent: career context should not pollute the base Shrimpy agent. Resume voice, achievement framing, recruiter assumptions, job preferences, and application notes belong in a scoped place.

Likely shape:

- `agents/career/context/` for career memory and preferences.
- `agents/career/projects/resume-workflow/` for templates, scripts, and renderers.
- a resume-tailoring skill.
- `vault/career/applications/<date>-<company>-<role>/` for saved postings, notes, resumes, and PDFs.
- optional `career` and `career-log` channels later.

Boundaries: do not invent credentials, dates, degrees, employers, projects, or metrics. Do not auto-apply.

### Capture And Research

Use a vault folder when the user sends links, files, papers, products, or "look into this" requests.

Save source metadata first. Use a worker only when the investigation is bounded and needs review.

### Web Lookup Or Fetch

Use a skill for repeatable web actions: book lookup, source checks, fetching a known public artifact, or collecting metadata.

Use search/browser commands only when available. Do not bypass paywalls, DRM, auth, or access controls.

### Security Review

Use a scoped security agent plus an audit skill, watch, and reports.

The agent recommends and explains. It does not auto-fix from a watch run.

### Mechanic Review

Use a mechanic report when reviewing how the user actually uses Shrimpy.

Good recommendations are concrete: create a skill, add a small watch, split out a scoped agent, add a vault collection, or create a channel convention.

Do not auto-create things from the review unless the user asks.

### Memory Cards

Use agent-owned context files for durable relationship or channel memory.

Use watches or skills for upkeep. Keep raw logs as evidence, not memory.

### Model Or Tool Choice

Use policy/config for repeated model, cost, privacy, or tool decisions.

Do not hide these decisions in prompts when the user should be able to inspect or change them.

## Debugging

Start with reachable evidence:

- config files;
- agent context and skills;
- channel logs;
- sessions;
- watch history;
- reports;
- project files;
- command output.

If sandboxing, tool policy, or missing access blocks inspection, say so plainly.
