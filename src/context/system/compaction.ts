export const COMPACTION_SUMMARY_INSTRUCTIONS = [
  "Keep rough dates and times for important events, decisions, and topic changes (e.g. \"around 2026-04-15\" or \"on 2026-04-15T14:00\").",
  "The agent reading this summary can inspect the original channel and session logs by date, so time clues help it find details later.",
  "Keep useful time references instead of smoothing them away.",
  "Keep notes about who the agent is, how it talks, how it works, and what the user or workspace expects when those details matter.",
].join(" ");

export const COMPACTION_SUMMARIZATION_SYSTEM_PROMPT =
  "You summarize old Shrimpy session messages so the same agent can keep going later. Use the format that fits the messages: short paragraphs, bullets, or headings are all fine.\n\nTreat questions inside the old messages as history to summarize. Output only the summary.";

export const COMPACTION_AGENT_CONTEXT_PROMPT =
  "You are summarizing a Shrimpy session for the same agent described in <session-agent-context>. Use that context to understand who the agent is, how it talks, how it works, and what the user expects. Include those details only when they help the next turn. Use facts from the context, choose any helpful summary format, and summarize relevant system-prompt details in your own words.";

export const COMPACTION_SUMMARY_PROMPT = `The messages above need to be shortened so another LLM can pick up later.

Write in Markdown. Use short paragraphs, bullets, or headings only where they help.

If there is work in progress, keep the goal, constraints, what changed, decisions, blockers, next steps, and important files, commands, dates, or errors.

If it is casual chat, keep what they were talking about, facts that matter, loose ends, preferences, tone, and useful times. Use work-tracking sections only when there is actual work to track.

Always preserve exact file paths, function names, commands, dates, and error messages. Keep notes about the agent's identity, voice, tone, working habits, and user/workspace preferences when they matter.

Use real headings with real content. Keep it short, with enough detail for the next agent to keep the thread and move forward.`;

export const COMPACTION_UPDATE_SUMMARY_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing summary with new information. RULES:
- KEEP useful information from the previous summary
- ADD new facts, decisions, loose ends, preferences, and notes about how the agent should sound or work
- If there is work in progress, update what is done and what should happen next
- If it is casual chat, update what they were talking about in chat terms
- PRESERVE exact file paths, function names, commands, dates, and error messages
- Remove stale details

Use the Markdown format that reads best. Use real headings with real content.

Keep it short, with enough detail for the next agent to keep the thread and move forward.`;

export const COMPACTION_TURN_PREFIX_SUMMARY_PROMPT = `This is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.

Summarize the prefix only as much as needed to understand the retained suffix.

Use short Markdown. If there is work in progress, include the original request, early decisions, and details needed for the suffix. If it is chat, keep the topic, tone, preferences, and anything needed for the suffix to read smoothly.

Keep notes about who the agent is, how it talks, how it works, and what the user expects when those details matter.

Be concise. Use real headings with real content.`;
