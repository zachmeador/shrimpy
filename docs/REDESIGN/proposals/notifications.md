# 🦐 Notifications

A proposal from 2026-11-21, waiting on you. You asked for push from the beginning, and for "a coherent design for how notifications are handled". The build that started that day follows it as written, and it stays yours to strike.

A notification is a message that is new to you and stays unread for a moment. So notifications sit on the read marks the chat server keeps. What counts as new on a screen and what reaches your phone are the same fact, a few seconds apart.

## Who does what

| Program | Its part | Why there |
|---|---|---|
| The chat server | Decides what is worth telling you | It owns what was said, who it was for and what you have read |
| The gateway | Sends it to your devices | It owns your devices and how to reach them |
| A client | Shows it, and moves your read mark when you look | Only a client knows what is on show |

**The chat server raises a notification** when one of these stays unread for a few seconds:

- A message someone else wrote in a DM of yours.
- A message that names you, in a room you are in.
- A receipt that says a message of yours failed.

A message an agent sends with `quiet` raises none, as [the conversation model](../design/4-conversation.md) has it. An agent needs no tool for any of this: it notifies you by writing to you.

**The gateway delivers it.** A device of yours can hold where it is told things. For a browser that is its Web Push subscription. For an app, later, it is that app's own. The gateway keeps one key pair to sign with, sends to each device that has such a place, and forgets a place the push service says is gone. It is handed a finished notification and never reads chat. Taking a device back takes its place with it.

**A client shows it.** The web client's service worker shows the notification and sets the count on the app's icon. Opening the thread moves your read mark, which is what stops more notifications for it. The terminal has no push. It shows the same counts, and puts them in its tab's title.

## What a notification carries

- Who wrote, and the room if there is one.
- The first line of the message, cut short.
- The thread to open.
- How much is new to you in all, for the count on the icon.

The line travels in the notification, since a phone away from your network can't fetch it. Web Push encrypts it for the device, so the push service can't read it.

## What it needs first

1. The read marks.
2. A browser's way in, with HTTPS. Push needs HTTPS, and on an iPhone it needs the page installed to the home screen.

Web Push needs no package. Signing and encrypting are a small module on Node's own crypto, checked against the example in its standard.

## Left for later

- Telling only the devices you aren't using. The gateway knows which clients are linked, so it could hold a notification back while you are active in one.
- Quiet hours, and silencing one thread or one room.
- Every message of a room, where this has only the ones that name you.
- Notifications on a desktop from the terminal, which the plan defers.
- The companion app's own push.
