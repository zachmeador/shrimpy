# BlueBubbles Adapter Interface

Date: 2026-06-06
Status: Research

High-level interface notes for adding BlueBubbles as a Shrimpy chat adapter. This is scoped to a first useful iMessage surface: receive BlueBubbles webhook events from known conversations, publish accepted text into Shrimpy channels, and deliver agent text replies back through the BlueBubbles REST API. Advanced iMessage actions, proactive chat creation, group administration, tapbacks, effects, read receipts, typing, and attachment ingestion should be separate follow-on work.

Primary sources checked:

- [BlueBubbles Server overview](https://docs.bluebubbles.app/server)
- [BlueBubbles REST API and Webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks)
- [BlueBubbles webhook server guide](https://docs.bluebubbles.app/server/developer-guides/simple-web-server-for-webhooks)
- [BlueBubbles Private API overview](https://docs.bluebubbles.app/private-api)
- [BlueBubbles Private API installation](https://docs.bluebubbles.app/private-api/installation)
- [BlueBubbles FAQ](https://bluebubbles.app/faq/)
- [BlueBubbles server GitHub repo](https://github.com/BlueBubblesApp/bluebubbles-server)
- local Shrimpy surface docs: `docs/reference/surfaces.md`
- local Shrimpy surface code: `src/surfaces/shared/`, `src/surfaces/telegram/`, `src/config/adapter-routing.ts`
- local OpenClaw BlueBubbles prior art: `/srv/syncthing/code/clones/openclaw/extensions/bluebubbles/` and `/srv/syncthing/code/clones/openclaw/docs/channels/bluebubbles.md`
- local Hermes BlueBubbles prior art: `/srv/syncthing/code/clones/hermes-agent.backup-20260521-103105/gateway/platforms/bluebubbles.py`

## Short Answer

Yes. BlueBubbles plays well with Shrimpy's current chat surface shape. It is a transport-edge service with inbound webhooks, outbound REST calls, stable conversation identifiers, one visible iMessage identity, and per-message sender/chat metadata. That maps naturally to a Shrimpy `ChatSurfaceModule`: BlueBubbles messages become typed channel messages, and Shrimpy channel publications route back out through an egress prefix.

The main mismatch is not conceptual; it is lifecycle. Telegram is currently a polling surface, while BlueBubbles is webhook-driven. A BlueBubbles adapter needs either a small gateway-owned HTTP ingress listener or a shared webhook registry under `src/surfaces/shared/`. That is a real implementation seam, but it fits inside `GatewaySurface.start()` / `stop()` without changing Shrimpy's channel/session model.

For a first implementation, make observed BlueBubbles chats into normal Shrimpy channels named like `bluebubbles~<instance>~<encoded-chat-guid>`. Use the BlueBubbles `chatGuid` as the routable thread id when available. Do not use phone numbers or display names as the channel suffix unless there is a separate resolver path, because handles are not stable enough for groups and can collide across iMessage/SMS-ish service forms.

## What BlueBubbles Is

BlueBubbles is a self-hosted macOS iMessage bridge. The server app runs on a Mac signed into Messages, reads the Messages chat database, exposes a REST API, and emits webhook events. Its own server overview says the server uses AppleScript for simpler send/create operations, polls `chat.db` for new messages, and can use a Private API bundle for deeper iMessage behavior.

The practical setup requirements matter for Shrimpy docs and diagnostics:

- It needs a macOS machine with working iMessage. BlueBubbles says Sierra and newer are supported, with older El Capitan no longer supported.
- The server needs Full Disk Access to read the Messages database.
- The REST API can run behind Ngrok, Cloudflare, dynamic DNS, or a local/private URL. Browser usage requires HTTPS with a valid certificate, but non-browser callers such as Shrimpy can use direct HTTP.
- The REST API requires BlueBubbles Server 0.2.0 or newer; webhooks require 1.0.0 or newer.
- The optional Private API unlocks richer features such as typing indicators, tapbacks, marking chats read, replies, effects, creating chats, editing, unsending, and group management. It also has heavier macOS setup implications, so Shrimpy should not make it mandatory for first-pass text replies to already-observed chats.
- BlueBubbles' own troubleshooting docs recommend Private API for reliability when AppleScript sending is flaky. Shrimpy should expose Private API status in diagnostics if it ever supports anything beyond plain text replies.

## API Shape

The official developer docs present two relevant surfaces:

- REST API: authenticated calls to the BlueBubbles server. Most requests authenticate by adding `guid`, `password`, or `token` as a query parameter containing the server password.
- Webhooks: BlueBubbles posts selected events to a registered URL. Supported event families include new messages, message updates, errors, group name/participant changes, chat read status changes, typing indicators, server update, server URL change, and test events.

The first Shrimpy adapter only needs a narrow subset:

- `GET /api/v1/ping` for setup and health checks.
- `GET /api/v1/server/info` for diagnostics, including Private API/helper status where available.
- `POST /api/v1/message/text` to send text to a `chatGuid` with a generated `tempGuid`.
- `POST /api/v1/chat/query` as an optional resolver/debug path for finding a `chatGuid` from an existing handle or inspecting recent chats.
- webhook registration/inspection via `/api/v1/webhook` if Shrimpy chooses auto-registration; otherwise the user can configure the webhook in BlueBubbles manually.

Prior art in OpenClaw and Hermes uses additional endpoints for chat creation, typing, read receipts, attachments, reactions, edit/unsend, and group actions. Those endpoints are useful, but they should not be in Shrimpy's first pass unless the user explicitly asks for advanced iMessage controls.

## Shrimpy Surface Shape

Suggested files:

- `src/surfaces/bluebubbles/config.ts`
- `src/surfaces/bluebubbles/client.ts`
- `src/surfaces/bluebubbles/webhook.ts` or `listener.ts`
- `src/surfaces/bluebubbles/bridge.ts`
- `src/surfaces/bluebubbles/outbound.ts`
- `src/surfaces/bluebubbles/surface.ts`
- `src/surfaces/bluebubbles/index.ts`

The module should export a `ChatSurfaceModule` and be added to `surfaceModules` in `src/surfaces/index.ts`. `AppRuntime` can then validate config, resolve surface routes, create egresses, create gateway lifecycle instances, and resolve default agent membership the same way it does for Telegram.

Proposed config shape:

```json
{
  "bluebubbles": {
    "instances": {
      "main": {
        "serverUrl": "http://192.168.1.50:1234",
        "password": "...",
        "webhookHost": "127.0.0.1",
        "webhookPort": 8645,
        "webhookPath": "/bluebubbles/main",
        "defaultAgentId": "shrimpy",
        "allowedHandles": ["+15551234567", "alice@example.com"],
        "allowedChatGuids": ["iMessage;-;+15551234567"],
        "users": {
          "+15551234567": {
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

- `surfaceId`: `bluebubbles.<instance>`
- `adapter`: `bluebubbles.<instance>`
- `channelPrefix`: `bluebubbles~<instance>~`
- `defaultAgentId`: configured agent id
- `serverUrl`: normalized base URL with trailing slash removed
- `password`: BlueBubbles server password, kept out of logs and never rendered into prompts
- `webhookPath` / host / port: gateway HTTP ingress settings
- `allowedHandles` and/or `allowedChatGuids`: inbound allowlist
- `users`: transport handle to stable Shrimpy user mapping

Token handling can follow Telegram initially because Shrimpy currently stores surface tokens in config. If Shrimpy later grows general secret references for provider credentials, BlueBubbles should move to `passwordEnv` or the same secret-store pattern.

## Inbound Mapping

The bridge should reject early unless all are true:

- the webhook authenticates against the configured BlueBubbles password;
- the event is a message event that carries a parseable message payload;
- the message is not authored by the Mac/server account itself;
- the message has usable sender identity;
- the message has a usable `chatGuid`, `chatIdentifier`, or numeric chat id;
- the sender/chat is authorized by `allowedHandles` / `allowedChatGuids` / future pairing state.

Accepted messages become typed channel messages:

- Shrimpy channel: `bluebubbles~<instance>~<encoded-chat-guid>` when `chatGuid` exists.
- `sender.kind`: `human`.
- `sender.actorId` and `sender.userId`: resolved through `IdentityStore`, using `users` config when present.
- `origin.transport`: `bluebubbles`.
- `origin.transportUserId`: normalized sender handle, such as an E.164 phone number or iMessage email.
- `origin.transportChatId`: the raw BlueBubbles `chatGuid` or the best stable chat identifier available.
- `origin.addressedAgentId`: current addressed agent for this surface/thread, falling back to `defaultAgentId`.

BlueBubbles webhook payloads have varied across versions and wrappers in prior art. A robust parser should check common fields such as `payload.data`, `payload.message`, nested `chat` / `chats`, `chatGuid`, `chatIdentifier`, `chatId`, `handle`, `sender`, `senderId`, `isGroup`, `attachments`, `associatedMessageGuid`, and `associatedMessageType`. Keep this normalization in `bridge.ts` or a small local helper and cover it with fixture-heavy tests.

For groups, the first adapter can either reject group chats or require explicit `allowedChatGuids`. Group iMessage has no native mention metadata, so mention gating is text-pattern based and should be a follow-on if group support is desired.

## Outbound Mapping

Register an egress route for `bluebubbles~<instance>~`. The suffix should decode to the BlueBubbles `chatGuid` and call the REST send endpoint with a generated `tempGuid`.

Delivery should:

- send only non-empty text in the first pass;
- strip or simplify Markdown that iMessage will not render reliably;
- split long text into multiple bubbles at a conservative configured limit;
- send chunks in order;
- set `method` explicitly if BlueBubbles server behavior proves version-sensitive;
- log delivery failures without mutating the durable Shrimpy channel message;
- never log the full REST URL with password query params.

For proactive sends to a phone/email, add an explicit resolver later. That resolver can query chats and, if Private API is enabled and the user explicitly requested a new target, create a new chat. Do not overload normal channel names with handles during the first pass.

## Webhook Lifecycle

BlueBubbles needs an HTTP endpoint reachable from the Mac running BlueBubbles. There are two viable Shrimpy shapes:

- First-pass simple shape: each BlueBubbles gateway surface starts a small Node HTTP listener from `GatewaySurface.start()` and stops it in `stop()`.
- Cleaner shared shape: add a `WebhookIngressRegistry` under `src/surfaces/shared/` so future webhook surfaces can register path handlers on one gateway HTTP server.

Prefer the shared shape if any other webhook surface is planned soon. Otherwise, the simple shape is enough for one BlueBubbles instance and can be extracted later once pressure is real.

Webhook security should be strict:

- Require the password in the registered webhook URL query, or accept a documented header if BlueBubbles supports one for the user's setup.
- Validate auth before reading or parsing large bodies.
- Rate-limit by path/client if the endpoint is exposed beyond localhost.
- Do not allow an agent prompt to change `serverUrl`, webhook auth, or allowlists.
- Keep raw phone numbers/emails out of debug logs where practical.

## Fit With Current Shrimpy Concepts

BlueBubbles fits especially well with Shrimpy's "one visible identity, many internal agents" model. iMessage exposes one visible sender identity: the Mac's Messages account. Shrimpy already separates surface-visible addressing from internal agent identity through `SurfaceThreadStateStore` and `origin.addressedAgentId`, so `/agent`-style switching can work like Telegram without pretending iMessage has multiple bot accounts.

The durable channel/session split also works cleanly:

- BlueBubbles conversation -> Shrimpy channel.
- Agent private working context -> Shrimpy session attached to that channel.
- `/new` or equivalent -> reset the addressed agent's session, not the iMessage conversation.
- Agent replies -> explicit channel publications routed by egress.

The current adapter route shape is enough: `ResolvedAdapterRoutingConfig` only needs `{ adapter, channelPrefix }`, and BlueBubbles can register one route per instance. The surface module shape is also enough: `createGatewaySurfaces()` can own the webhook listener and `createEgresses()` can create REST-only egress for CLI/child sessions.

## Risks And Open Questions

- **Webhook ingress is new to Shrimpy.** Telegram poller state is easy to isolate; webhook surfaces need port/path ownership, auth, body limits, and shutdown behavior.
- **Secret hygiene matters more than Telegram.** BlueBubbles auth is commonly query-param based, so URLs can leak passwords through logs and proxies if the adapter is careless.
- **Payload normalization needs tests.** BlueBubbles payloads include nested message/chat shapes and version differences. Fixture tests should cover direct messages, groups, missing chat GUIDs, self messages, attachments, reactions, and updated-message events.
- **Self-message filtering is important.** Outbound sends can produce webhook echoes. The adapter must ignore messages from the server account or dedupe by outgoing temp/message GUID where available.
- **Group support should stay narrow.** Group routing needs explicit chat GUID allowlists and likely mention gating; first-pass DM support is simpler and safer.
- **Private API should be a diagnostic, not a first-pass dependency.** Shrimpy should support plain text in existing chats without requiring Private API, but status should explain when advanced features are disabled.
- **Local network access is intentional but should be explicit.** Many BlueBubbles servers will be on `localhost` or a LAN host. That is fine for a local gateway, but config and diagnostics should make the trust boundary obvious.
- **Attachments should wait.** BlueBubbles supports attachments, and prior art has substantial media code. Shrimpy can first publish `unsupported_media` metadata, then add download/cache support once media policy is settled.

## First-Pass Done Shape

- A configured BlueBubbles instance can receive a text webhook from an authorized sender and publish it into a `bluebubbles~<instance>~...` Shrimpy channel.
- Unauthorized senders, missing-auth webhooks, self messages, unsupported events, and malformed payloads are ignored or logged without creating agent turns.
- An agent can reply through normal channel helpers or `send_message`, and the text is delivered back to the same BlueBubbles chat.
- The adapter has CLI-accessible setup/status diagnostics: ping server, show webhook listener address, show whether Private API/helper status is known, and show recent delivery errors without secrets.
- Tests cover config resolution, route registration, webhook auth, payload normalization, allowlist checks, self-message filtering, channel naming/encoding, outbound send payloads, chunking, and no password leakage in logs.
