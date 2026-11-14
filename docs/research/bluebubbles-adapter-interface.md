# 🦐 BlueBubbles Adapter Interface

Date: 2026-06-06
Status: Research
Trimmed: 2026-11-11. Git has the whole note.

High-level interface notes for adding BlueBubbles as a Shrimpy chat adapter. This is scoped to a first useful iMessage surface: receive BlueBubbles webhook events from known conversations, publish accepted text into Shrimpy channels, and deliver agent text replies back through the BlueBubbles REST API. Advanced iMessage actions, proactive chat creation, group administration, tapbacks, effects, read receipts, typing, and attachment ingestion should be separate follow-on work.

Primary sources checked:

- [BlueBubbles Server overview](https://docs.bluebubbles.app/server)
- [BlueBubbles REST API and Webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks)
- [BlueBubbles webhook server guide](https://docs.bluebubbles.app/server/developer-guides/simple-web-server-for-webhooks)
- [BlueBubbles Private API overview](https://docs.bluebubbles.app/private-api)
- [BlueBubbles Private API installation](https://docs.bluebubbles.app/private-api/installation)
- [BlueBubbles FAQ](https://bluebubbles.app/faq/)
- [BlueBubbles server GitHub repo](https://github.com/BlueBubblesApp/bluebubbles-server)

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

## Inbound Mapping

The adapter should reject early unless all are true:

- the webhook authenticates against the configured BlueBubbles password;
- the event is a message event that carries a parseable message payload;
- the message is not authored by the Mac/server account itself;
- the message has usable sender identity;
- the message has a usable `chatGuid`, `chatIdentifier`, or numeric chat id;
- the sender/chat is authorized by `allowedHandles` / `allowedChatGuids` / future pairing state.

Use the BlueBubbles `chatGuid`, such as `iMessage;-;+15551234567`, as the routable thread id when available. Do not use phone numbers or display names as the thread id unless there is a separate resolver path, because handles are not stable enough for groups and can collide across iMessage/SMS-ish service forms.

BlueBubbles webhook payloads have varied across versions and wrappers in prior art. A robust parser should check common fields such as `payload.data`, `payload.message`, nested `chat` / `chats`, `chatGuid`, `chatIdentifier`, `chatId`, `handle`, `sender`, `senderId`, `isGroup`, `attachments`, `associatedMessageGuid`, and `associatedMessageType`. Keep this normalization in a small local helper and cover it with fixture-heavy tests.

For groups, the first adapter can either reject group chats or require explicit `allowedChatGuids`. Group iMessage has no native mention metadata, so mention gating is text-pattern based and should be a follow-on if group support is desired.

## Outbound Mapping

The adapter should call the REST send endpoint with the BlueBubbles `chatGuid` and a generated `tempGuid`.

Delivery should:

- send only non-empty text in the first pass;
- strip or simplify Markdown that iMessage will not render reliably;
- split long text into multiple bubbles at a conservative configured limit;
- send chunks in order;
- set `method` explicitly if BlueBubbles server behavior proves version-sensitive;
- never log the full REST URL with password query params.

For proactive sends to a phone/email, add an explicit resolver later. That resolver can query chats and, if Private API is enabled and the user explicitly requested a new target, create a new chat.

## Webhook Lifecycle

BlueBubbles needs an HTTP endpoint reachable from the Mac running BlueBubbles.

Webhook security should be strict:

- Require the password in the registered webhook URL query, or accept a documented header if BlueBubbles supports one for the user's setup.
- Validate auth before reading or parsing large bodies.
- Rate-limit by path/client if the endpoint is exposed beyond localhost.
- Do not allow an agent prompt to change `serverUrl`, webhook auth, or allowlists.
- Keep raw phone numbers/emails out of debug logs where practical.

## Risks And Open Questions

- **Webhook ingress is new to Shrimpy.** Webhook surfaces need port/path ownership, auth, body limits, and shutdown behavior.
- **Secret hygiene matters more than Telegram.** BlueBubbles auth is commonly query-param based, so URLs can leak passwords through logs and proxies if the adapter is careless.
- **Payload normalization needs tests.** BlueBubbles payloads include nested message/chat shapes and version differences. Fixture tests should cover direct messages, groups, missing chat GUIDs, self messages, attachments, reactions, and updated-message events.
- **Self-message filtering is important.** Outbound sends can produce webhook echoes. The adapter must ignore messages from the server account or dedupe by outgoing temp/message GUID where available.
- **Group support should stay narrow.** Group routing needs explicit chat GUID allowlists and likely mention gating; first-pass DM support is simpler and safer.
- **Private API should be a diagnostic, not a first-pass dependency.** Shrimpy should support plain text in existing chats without requiring Private API, but status should explain when advanced features are disabled.
- **Local network access is intentional but should be explicit.** Many BlueBubbles servers will be on `localhost` or a LAN host. That is fine for a local gateway, but config and diagnostics should make the trust boundary obvious.
- **Attachments should wait.** BlueBubbles supports attachments, and prior art has substantial media code. Shrimpy can add download/cache support once media policy is settled.
