# Discord Adapter Interface

Date: 2026-05-30
Status: Research

High-level interface notes for adding Discord as a Shrimpy chat adapter. This is scoped to one-on-one bot DMs with authorized users. Multi-user chatrooms are explicitly out of scope for the first adapter.

Primary sources checked:

- [Discord Gateway docs](https://docs.discord.com/developers/events/gateway)
- [Discord Gateway Events docs](https://docs.discord.com/developers/events/gateway-events)
- [Discord Channel Resource docs](https://docs.discord.com/developers/resources/channel)
- [Discord Message Resource docs](https://docs.discord.com/developers/resources/message)
- [Discord User Resource docs](https://docs.discord.com/developers/resources/user)
- local Hermes clone: `/srv/syncthing/code/clones/hermes-agent-latest/gateway/platforms/discord.py`
- local OpenClaw clone: `/srv/syncthing/code/clones/openclaw/extensions/discord/`
- local OpenClaw Discord docs: `/srv/syncthing/code/clones/openclaw/docs/channels/discord.md`

## Short Answer

Build Discord as a normal Shrimpy `ChatSurfaceModule`, parallel to Telegram, with a deliberately small first contract:

- receive Discord `MESSAGE_CREATE` events over the Gateway;
- accept only channel type `DM`;
- authorize by configured Discord user id before publishing;
- publish accepted text into normal Shrimpy channels;
- deliver agent replies with Discord's create-message endpoint;
- keep group DMs, guild channels, threads, voice, slash commands, and components out of scope.

The first implementation should prefer a proven Discord Gateway library unless its footprint is a concrete Pi constraint. Discord's Gateway protocol is manageable, but heartbeat, resume, identify limits, close codes, and rate limits are a poor use of first-pass surface work when the product behavior is just DM text.

## Discord API Shape

Discord DMs arrive as normal message create gateway events. The event payload carries a message object; DM messages do not have a guild member payload. Discord channel type `1` is a one-on-one DM and type `3` is a group DM, so the adapter can reject group DMs before Shrimpy sees them.

Outbound text is a create-message call against a channel id. Discord's message resource says create-message works for guild text channels or DM channels, returns a message object, and fires a message-create gateway event. For a DM-only adapter, Shrimpy can send to the current DM channel id without supporting guild permissions or thread membership.

Discord also has a create-DM endpoint that opens or returns a DM channel for a user id. The docs warn against bulk/proactive DM opening. For Shrimpy, phase one should not need proactive user targeting: let the user DM the bot first, then reply to that channel. If proactive user-id targeting becomes useful later, add an explicit resolver path rather than changing the DM channel contract.

Discord message content is a privileged-intent area in guild contexts, but Discord's Gateway docs list DMs with the app as an exception where content is available. That makes a DM-only adapter materially simpler than a guild adapter.

## Shrimpy Surface Shape

Suggested files:

- `src/surfaces/discord/config.ts`
- `src/surfaces/discord/client.ts`
- `src/surfaces/discord/bridge.ts`
- `src/surfaces/discord/outbound.ts`
- `src/surfaces/discord/surface.ts`
- `src/surfaces/discord/index.ts`

The module should export a `ChatSurfaceModule` and be added to `surfaceModules` in `src/surfaces/index.ts`. `AppRuntime` will then validate config, resolve surface routes, create CLI egresses, create gateway lifecycle instances, and resolve default agent membership the same way it does for Telegram.

Proposed config shape:

```json
{
  "discord": {
    "instances": {
      "shrimpy": {
        "token": "...",
        "defaultAgentId": "shrimpy",
        "allowedUserIds": ["123456789012345678"],
        "users": {
          "123456789012345678": {
            "id": "alice",
            "displayName": "Alice"
          }
        },
        "textBurstWindowMs": 500
      }
    }
  }
}
```

Resolved instance fields should mirror Telegram where possible:

- `surfaceId`: `discord.<instance>`
- `adapter`: `discord.<instance>`
- `channelPrefix`: `discord~<instance>~`
- `defaultAgentId`: configured agent id
- `allowedUserIds`: Discord user id allowlist
- `users`: transport user id to stable Shrimpy user mapping

## Inbound Mapping

The bridge should reject early unless all are true:

- the event is `MESSAGE_CREATE`;
- the author exists and is not the current bot user;
- the author is not a bot unless a future explicit bot policy permits it;
- the Discord channel is a one-on-one DM;
- the author id is in `allowedUserIds`.

Accepted messages become typed channel messages:

- Shrimpy channel: `discord~<instance>~<dmChannelId>` for direct sendability.
- `sender.kind`: `human`.
- `sender.actorId` and `sender.userId`: resolved through `IdentityStore`, using `users` config when present.
- `origin.transport`: `discord`.
- `origin.transportUserId`: Discord author id.
- `origin.transportChatId`: Discord DM channel id.
- `origin.addressedAgentId`: current addressed agent for this surface/thread, falling back to `defaultAgentId`.

If proactive delivery to a configured user id is added later, introduce an explicit target resolver that accepts `user:<discordUserId>`, calls Create DM, then uses the returned DM channel id. Do not overload the first channel naming scheme until that need is real.

## Outbound Mapping

Register an egress route for `discord~<instance>~`. The suffix is the Discord DM channel id for phase one. Delivery should:

- split text into Discord-safe chunks no larger than 2000 characters;
- send chunks in order with Discord create-message;
- set `allowed_mentions` to suppress `@everyone`, roles, and broad user mentions by default;
- log and return failure without deleting or mutating the durable Shrimpy channel message.

Plain Markdown text is acceptable for the first version. Discord will render common Markdown. Rich embeds and components are out of scope.

## Authorization

Authorization should be id-only. Do not accept usernames, display names, nicknames, roles, or guild membership as authorization in the first pass.

Hermes has a useful warning in its Discord adapter: role-based DM auth can create cross-guild leakage unless it is carefully scoped to a configured guild. Shrimpy can avoid that whole class by not using role authorization for this item.

OpenClaw's DM policy is broader, with pairing and allowlist modes. For Shrimpy phase one, use only explicit configured users. Pairing can be a separate backlog item if Discord setup friction becomes the constraint.

## Attachments

Phase one can treat Discord attachments as unsupported surface media and still be useful for text chat.

A later media pass can download image attachments into `workspace/media/` and publish `image` or `image_group`, matching Telegram's bridge. Documents, voice notes, stickers, embeds, polls, and forwarded snapshots should stay unsupported until there is a concrete user workflow.

## CLI Coverage

Minimum CLI surfaces:

- `shrimpy setup discord` - add/update a Discord instance and authorized users.
- `shrimpy status` or `shrimpy gateway status` - show Discord instance/gateway state.
- Existing `shrimpy channels`, `shrimpy channels read`, and `send_message` remain the operational interface once messages flow.

The setup flow should tell the user to enable Discord Developer Mode, copy their Discord user id, create a bot token, DM the bot after the gateway starts, and inspect the resulting `discord~...` channel.

## Clone Notes

Hermes patterns worth borrowing:

- ignore bot self messages before any expensive work;
- keep DM and guild logic separate;
- use allowlists before routing;
- suppress risky Discord mentions by default;
- batch split text bursts;
- cache downloaded attachments at the adapter edge.

OpenClaw patterns worth borrowing:

- group DMs disabled by default;
- direct-message policy happens before session routing;
- direct conversation identity is separate from visible display name;
- tests cover unauthorized DM senders, group DMs, bot echoes, and message content normalization;
- setup docs are explicit about bot token handling, user ids, and Discord DM privacy settings.

## Open Questions

- Library choice: `discord.js` is the pragmatic first candidate, but measure install/runtime footprint on the Pi before committing.
- Channel suffix: this note recommends DM channel id for phase one because it is directly sendable. If proactive user-id delivery is a required first-class workflow, use user id plus a DM-channel resolver/cache instead.
- Token handling: Telegram currently stores tokens in Shrimpy config. Discord can follow that for consistency, but env/secret references would be a separate config improvement.
- Activity: Discord has a typing indicator endpoint, but typing belongs with the generic surface activity backlog rather than the first DM adapter.
