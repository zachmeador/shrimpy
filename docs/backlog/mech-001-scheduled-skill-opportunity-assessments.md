# MECH-001: Scheduled Skill Opportunity Assessments

Status: todo
Priority: P2
Area: Mechanic
Depends On: [ADMIN-001](admin-001.md), [SCHED-002](sched-002-schedule-inspection-surfaces.md), [SCHED-003](sched-003-scheduled-channel-messages.md), [APP-001](app-001.md)

## Why

Shrimpy should be able to look at how the user is actually using the workspace
and occasionally surface implementation ideas worth considering. This is not
generic "tips" content. The useful behavior is an opt-in mechanic assessment
that reads recent channel activity, schedules, context files, skills, and
workspace artifacts, then suggests concrete Shrimpy skills, agents, schedules,
or small app patterns that match the user's real habits.

The product shape is a framework that can search autonomously for good ideas
without silently changing the workspace. The mechanic should write an
inspectable Markdown assessment and send the user a short message with the
highest-signal recommendations.

## Build

- Add an opt-in mechanic-owned schedule for recurring usage assessment.
- Run the recurrence through an ordinary configured channel where the mechanic is
  a member and its attention policy accepts the scheduled message.
- Let the user trigger the same assessment manually from a normal mechanic
  session before enabling recurrence.
- Implement the assessment as a mechanic skill/resource, not a special runtime
  control plane.
- Inspect recent channel activity, configured schedules, installed skills,
  agent prompts/context, and vault/workspace files when available.
- Produce a timestamped Markdown report under the mechanic's workspace, likely
  `agents/mechanic/context/assessments/` or a mechanic vault folder.
- Send the user a concise message after each assessment with:
  - the report path;
  - one to three concrete implementation skill ideas;
  - why each idea fits observed usage;
  - the smallest next action to enable or build it.
- Include a no-op path when there is not enough new usage signal.
- Keep recurrence conservative by default, such as monthly or disabled until
  the user explicitly enables it.

## Boundaries

- Do not auto-create skills, agents, schedules, or code changes from this
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

- This is a concrete scheduled check-in loop for [APP-001](app-001.md).
- It should probably ship after the bundled mechanic exists in
  [ADMIN-001](admin-001.md).
- [SCHED-002](sched-002-schedule-inspection-surfaces.md) gives the mechanic a
  safer way to inspect its own recurrence and explain when it will run next.
- [SCHED-003](sched-003-scheduled-channel-messages.md) keeps recurrence routing on
  ordinary channel membership and attention instead of addressed-agent bypasses.
- Good candidate recommendations: turn repeated manual requests into a skill,
  add a small recurring schedule, split a focused app-agent out of the main
  agent, add a vault collection/index, or create a channel convention.

## Done

- The mechanic can run a manual usage assessment from an ordinary session.
- The mechanic can optionally run the same assessment on a recurring schedule.
- Recurring assessment work becomes a mechanic turn through normal channel
  membership and mechanic attention.
- Each assessment writes a timestamped Markdown report in an inspectable
  workspace path.
- Each non-empty assessment sends the user a concise message with concrete
  implementation skill ideas and a report path.
- Tests cover default schedule/template seeding if recurrence is seeded by
  setup.
