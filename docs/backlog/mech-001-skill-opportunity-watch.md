# MECH-001: Mechanic Skill Opportunity Watch

Status: todo
Priority: P2
Area: Mechanic
Depends On: [ADMIN-001](admin-001.md), [APP-001](app-001.md)

## Why

Shrimpy should be able to look at how the user is actually using the workspace
and occasionally surface implementation ideas worth considering. This is not
generic "tips" content. The useful behavior is an opt-in mechanic assessment
  that reads recent channel activity, watches, context files, skills, and
  workspace artifacts, then suggests concrete Shrimpy skills, agents, watches,
  or small app patterns that match the user's real habits.

The product shape is a framework that can search autonomously for good ideas
without silently changing the workspace. The mechanic should write an
inspectable Markdown assessment and send the user a short message with the
highest-signal recommendations.

## Build

- Add an opt-in mechanic-owned watch for recurring usage assessment.
- Record each watch run in mechanic-owned run history. Emit a user-facing channel
  message only when the assessment has useful recommendations or an actionable
  failure.
- Let the user trigger the same assessment manually from a normal mechanic
  session before enabling recurrence.
- Implement the assessment as a mechanic skill/resource, not a special runtime
  control plane.
- Inspect recent channel activity, configured watches, installed skills,
  agent prompts/context, and vault/project files when available.
- Produce a timestamped Markdown report under the mechanic's vault, following
  the agent-report convention in
  [workspace.md](../reference/workspace.md):
  `agents/mechanic/vault/assessments/`.
- Send the user a concise message after each assessment with:
  - the report path;
  - one to three concrete implementation skill ideas;
  - why each idea fits observed usage;
  - the smallest next action to enable or build it.
- Include a no-op path when there is not enough new usage signal.
- Keep recurrence conservative by default, such as monthly or disabled until
  the user explicitly enables it.

## Boundaries

- Do not auto-create skills, agents, watches, or code changes from this
  assessment. The mechanic recommends; the user chooses.
- Do not read broad filesystem locations beyond the Shrimpy workspace unless
  the user explicitly grants that scope.
- Do not turn this into analytics telemetry. The assessment is local workspace
  state and user-facing Markdown.
- Do not spam the user. Prefer a quiet no-op or a terse note when no strong
  recommendation exists.
- Do not duplicate memory-management or journaling. This assessment is about
  implementation opportunities, not durable autobiographical memory.

## Notes

- This is a concrete recurring watch/check-in loop for [APP-001](app-001.md).
- It should probably ship after the bundled mechanic exists in
  [ADMIN-001](admin-001.md).
- The stable watch inspection surface gives the mechanic a way to inspect its
  own watch recurrence, run history, and next run.
- [channels.md](../reference/channels.md) owns the channel wake contract for any
  mechanic assessment emitted into a channel.
- Good candidate recommendations: turn repeated manual requests into a skill,
  add a small recurring watch, split a focused app-agent out of the main
  agent, add a vault collection/index, or create a channel convention.

## Done

- The mechanic can run a manual usage assessment from an ordinary session.
- The mechanic can optionally run the same assessment through a recurring
  mechanic-owned watch.
- Watch runs are inspectable even when they emit no channel message.
- Each assessment writes a timestamped Markdown report in an inspectable
  workspace path.
- Each non-empty assessment sends the user a concise message with concrete
  implementation skill ideas and a report path.
- Tests cover default watch/template seeding if recurrence is seeded by
  setup.
