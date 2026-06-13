# 🦐 SURFACE-008: Chat Adapter Whitelists

Status: review
Priority: P1
Area: Surfaces
Depends On: none

## Why
Chat surfaces let remote humans enqueue agent turns and receive replies. A bot token is not an authorization boundary. Every inbound chat adapter must fail closed unless the source chat/user id is explicitly allowed.

## Current State
- Telegram has optional `allowedChatIds`. Missing or empty config accepts any chat Telegram delivers, binds the channel, creates a local identity, records presence, and publishes a human message.
- `shrimpy setup telegram` lets the user press Enter to skip allowed chat IDs, then writes an open instance.
- The setup instructions currently suggest starting the gateway to discover the Telegram chat ID, which can expose an open bot before the ID is configured.
- Future chat adapters need the same rule from the start instead of rediscovering it per surface.

## Build
- Make inbound authorization a required chat-surface contract for every gateway adapter that accepts human messages.
- Keep the authorization key transport-specific and stable: Telegram uses numeric chat IDs, Discord DMs use Discord user IDs, and future adapters must name their key explicitly.
- Fail closed when the required allowlist is missing or empty. Do not publish a Shrimpy channel message, bind a channel, record presence, dispatch commands, or download media before the authorization check passes.
- Update Telegram config validation and gateway startup/status behavior so an enabled Telegram instance without `allowedChatIds` is reported as invalid or blocked instead of silently becoming open.
- Update `shrimpy setup telegram` so setup cannot complete an enabled instance without at least one allowed chat ID. Add a safe discovery flow that asks the user to message the bot and polls Telegram directly from setup, or provide a non-gateway diagnostic command that prints candidate IDs without enabling normal inbound turns.
- Update the mechanic setup and channel-routing skills so interactive setup treats transport IDs and chat whitelists as required setup facts.
- Make planned adapters, including Discord, inherit this rule in their config schema, setup flow, bridge tests, and docs.

## Boundaries
- Do not authorize by display name, username, phone number, profile text, or other mutable cosmetic fields.
- `users` identity mappings are not authorization unless the same transport id is also allowed.
- Do not expose unknown sender text, media, or commands to Shrimpy channel logs, session prompts, or agent tools.
- Do not add a legacy open-adapter mode or compatibility shim unless the maintainer explicitly asks for it.
- Do not migrate existing workspace state implicitly. Surface invalid/missing allowlists clearly and let the user choose the IDs.

## Touches
- `src/surfaces/telegram/config.ts`
- `src/surfaces/telegram/bridge.ts`
- `src/surfaces/telegram/surface.ts`
- `src/setup/telegram.ts`
- `src/setup/templates/mechanic/skills/setup/SKILL.md`
- `src/setup/templates/mechanic/skills/channel-routing/SKILL.md`
- `docs/reference/configuration.md`
- `docs/reference/surfaces.md`
- `test/telegram-config.test.ts`
- `test/telegram-channel-bridge.test.ts`
- Future chat adapter backlog and implementation notes, especially [SURFACE-004](surface-004-discord-dm-chat-adapter.md)

## Done
- Telegram instances with missing or empty inbound allowlists cannot accept normal gateway turns.
- Unauthorized Telegram chats are ignored before channel binding, identity creation, presence recording, command dispatch, media download, or model wake.
- Telegram setup obtains and writes at least one allowed chat ID, or aborts without leaving an enabled open instance.
- Interactive mechanic setup guidance treats chat-surface transport IDs as required before gateway start.
- Every active or planned chat adapter has a documented authorization key and tests for authorized and unauthorized inbound messages.
