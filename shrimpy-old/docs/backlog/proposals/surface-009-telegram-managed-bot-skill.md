---
status: draft
priority: P2
area: Surfaces
depends_on: []
---

# 🦐 SURFACE-009: Telegram Managed-Bot Skill

## Why

Shrimpy currently asks the user to create every Telegram bot through BotFather, copy its token into `shrimpy setup telegram`, message the bot, discover the chat id, and repeat that process for each agent that needs a dedicated Telegram identity.

Telegram Bot API 9.6 added managed bots. An existing bot with bot-management enabled can ask its owner to create another bot through a native Telegram prompt, receive the resulting managed-bot update, and retrieve or rotate the new bot's token. This can remove nearly all manual BotFather and token-copying work after one manager bot has been bootstrapped.

The product shape should remain a skill-guided operator workflow. Adding an agent or starting the gateway must not silently create Telegram identities. The included `shrimpy-telegram` skill should let the mechanic satisfy requests such as “put Pearl on Telegram” or “add my agents to Telegram” using small inspectable Shrimpy primitives.

## Current State

- `shrimpy setup telegram` guides the user through BotFather, accepts a token interactively, validates it, and discovers required `allowedChatIds` by polling the new bot.
- Telegram instances already support a dedicated `defaultAgentId`, and current guidance prefers one instance per agent that regularly talks with the user.
- `src/surfaces/telegram/client.ts` models ordinary message updates and does not expose managed-bot creation prompts, managed-bot updates, or managed-token operations.
- The Telegram gateway owns long polling for configured instances. A skill must not start a competing `getUpdates` poll against a live manager bot.
- Telegram tokens currently use the existing Telegram instance configuration path. This item should not create a second credential convention.
- There is no included `shrimpy-telegram` skill. Telegram setup details are split between `shrimpy-setup`, `shrimpy-channels`, reference docs, and the interactive setup command.

## UX Implications

The first Telegram bot remains a deliberate one-time bootstrap. The user creates or selects the mechanic's Telegram bot, enables its ability to manage bots in BotFather, and configures it as a normal authorized Shrimpy Telegram instance. The `shrimpy-telegram` skill verifies that capability instead of assuming it from the bot's name or configured agent.

After that bootstrap, the user can ask the mechanic to add one agent or a set of agents to Telegram. The skill inspects configured agents and Telegram instances, skips agents that already have a suitable dedicated instance, proposes names and available-looking usernames, and sends Telegram's native managed-bot creation request through the manager bot. Telegram still asks the user to approve each created bot; Shrimpy cannot bypass that owner confirmation.

Telegram sends the manager bot a `managed_bot_created` service message when the user approves creation. The Telegram adapter should admit that authorized service message into the manager's existing Shrimpy channel so it naturally starts the mechanic's next turn. The same session history identifies the target agent, and `shrimpy-telegram` continues the workflow: retrieve the token without printing it, create the Telegram instance with the target agent as `defaultAgentId`, authorize the owner's numeric private-chat id, validate the bot, and tell the user to open it and press Start. The user should not copy a bot token or manually type a chat id for a managed child bot.

“Add my agents to Telegram” means a skill-driven batch request, not a permanent reconciliation policy. The skill should show the persistent configured agents it intends to add, exclude the already configured manager, skip ephemeral workers, and avoid giving a background-only support agent a dedicated bot unless the user explicitly includes it. Provision sequentially so each creation service message continues the clearly identified agent's setup before the skill sends the next prompt.

Removing an agent's Telegram connection removes the local instance and bindings only after showing the exact target. Permanent deletion of the Telegram-owned bot remains a separate explicit owner action through BotFather because Telegram does not expose managed-bot deletion to the manager. The skill may provide Telegram's deletion deep link after local removal but must not describe the remote bot as deleted.

## Build

- Add `src/skills/included/shrimpy-telegram/SKILL.md` as a `shrimpy-how-to` skill assigned to the mechanic. Keep the conversational selection, batching, confirmation, retry, and cleanup workflow in the skill.
- Move detailed Telegram operator guidance out of `shrimpy-setup` and `shrimpy-channels` where it would otherwise be duplicated. Those skills should hand Telegram setup and lifecycle work to `shrimpy-telegram`; stable transport facts remain in `docs/reference/surfaces.md` and configuration facts remain in `docs/reference/configuration.md`.
- Teach `shrimpy-telegram` both paths:
  - bootstrap or connect a manager bot using the existing manual setup path;
  - create and configure child bots through Telegram's managed-bot flow once a capable manager exists.
- Add the minimum agent-friendly CLI and Telegram client primitives the skill needs to inspect manager capability, send a managed-bot creation request with suggested name and username, retrieve the created bot's token directly into instance configuration, validate the configured child, rotate a managed token, and disconnect a local instance.
- Keep primitives narrow and machine-readable. They must not decide which agents deserve bots, automatically react to agent creation, or implement an “all agents” policy outside the skill.
- Extend Telegram update parsing for `managed_bot_created` and the bot/user identifiers needed to complete setup. Translate an authorized creation service message into a small typed inbound event in the manager's existing Shrimpy channel so normal channel logging and session wake behavior provide the resume seam.
- Accept the creation event only from the configured manager instance and authorized owner. The skill provisions one bot at a time, so the immediately preceding request in the same session identifies the target agent without a separate pending-operation store or gateway workflow engine.
- Reuse the gateway's existing poller. The CLI and skill must never race it with a second long poll against the manager bot.
- Resolve the manager's owner destination from a positively mapped, authorized private Telegram user/chat id. Do not send creation prompts to every `allowedChatIds` entry or to groups.
- Configure a managed child with the same owner private-chat id as its required `allowedChatIds`. The child still cannot initiate a conversation, so finish by giving the owner a direct bot link and asking them to press Start.
- Never return a full token from a `--json` command used by an agent. Pass the token internally into the existing Telegram instance configuration update, redact inspection output, and avoid channel logs, session instructions, shell arguments, and temporary files.
- Make batch work restartable from normal Shrimpy state. Re-running the skill should report already configured agents, username collisions, and failed validations without creating duplicates; it does not need a separate batch state machine.
- Update `shrimpy setup telegram` to point manager-capable agent workflows toward `shrimpy-telegram` while retaining a direct manual operator path for the first bot and for users who do not want managed bots.
- Add tests for capability detection, owner/private-chat resolution, authorized `managed_bot_created` translation, gateway-owned update consumption, sequential batch continuation, token redaction, child instance configuration, username conflicts, local disconnect, and the absence of automatic provisioning hooks.

## Boundaries

- Do not add agent-creation hooks, background reconciliation, startup provisioning, or a workspace invariant that every agent has a Telegram bot.
- Do not create a separate `shrimpy-telegram-bots` or mechanic-only workflow skill. Telegram operator behavior belongs together in `shrimpy-telegram`.
- Do not introduce a hosted or project-operated Shrimpy manager bot. The configured manager bot and every managed token remain under the user's Telegram ownership and local Shrimpy workspace.
- Do not let a skill or model handle raw bot tokens when a typed CLI/client boundary can move them directly into configuration.
- Do not infer the owner from a display name, username, the first allowed chat, or the last person who messaged the bot.
- Do not treat Telegram's native creation confirmation as permission for unrelated config changes, gateway restarts, agent creation, or remote bot deletion.
- Do not automatically delete a Telegram bot when removing a Shrimpy agent, surface instance, or skill.
- Do not promise that local disconnect permanently revokes or deletes the Telegram identity. Token rotation and BotFather deletion are distinct explicit operations.
- Do not add compatibility aliases or migration paths for older Telegram configuration.

## Protocol Notes

- Telegram documents managed bots at <https://core.telegram.org/api/bots/managed-bots>.
- A manager bot must have `can_manage_bots` enabled through BotFather.
- A private-chat keyboard can carry `request_managed_bot` with suggested name and username.
- The manager receives `managed_bot` or `managed_bot_created` data and can call `getManagedBotToken` or `replaceManagedBotToken`.
- The user remains the owner and can manage or delete the bot through BotFather. The managed-bot API does not provide a manager-side delete method.

## Done

- `shrimpy-telegram` is the single included skill for Telegram bootstrap, managed child creation, validation, local removal, and remote-deletion guidance.
- A user with a configured mechanic manager bot can ask to add one or several persistent agents and receives native Telegram creation prompts with useful suggested names and usernames.
- After owner approval, the mechanic can resume the operation and configure each child bot without the user copying a token or entering a numeric chat id.
- Telegram's authorized creation service message enters the manager's existing channel and naturally starts the mechanic turn that completes setup; there is no separate provisioning workflow engine.
- Re-running an interrupted or batch operation does not duplicate already configured bots.
- Manager capability, child configuration, and local removal are inspectable through agent-friendly CLI output with all tokens redacted.
- The gateway remains the sole poller for an active manager instance.
- Removing a local Telegram instance is explicit and does not claim to delete the user-owned Telegram bot.
- No agent lifecycle hook or background policy creates Telegram bots outside an invoked `shrimpy-telegram` workflow.
