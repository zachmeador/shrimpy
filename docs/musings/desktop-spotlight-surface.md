# 🦐 Desktop Spotlight Surface

Date: --
Status: Draft

_A small macOS-first UI direction for Shrimpy._

The best first desktop UI for Shrimpy is probably not a dashboard. It is a Spotlight/Raycast-style command surface: tiny, keyboard-first, always available, and fast enough to feel like part of the operating system.

Raycast is the useful reference point for interaction, but not the product model. It seems to be trying to funnel users into its AI-as-a-service path, which is not the direction Shrimpy wants. There also does not seem to be a happy path for local inference beyond Ollama, and the whole thing feels weaker and less customizable than a home-agent surface should be.

The ideal version is a proper SwiftUI macOS app. Hit a global shortcut, get one focused entry box, type naturally, and let Shrimpy show the most relevant surrounding state while you work. It should feel closer to "summon the home agent" than "open another chat app."

## Product Shape

- Global hotkey opens a compact command window.
- Primary interaction is typing, with arrow-key navigation and return-to-run.
- The input box is the center of gravity. Everything else supports it.
- Results and context are visualized inline: recent channels, active sessions, commands, memories, running work, and likely targets.
- The surface should be useful before it is clever. Fast command invocation beats a thick UI.
- macOS only is fine for the first version.

## Taste

This should feel like Spotlight if Spotlight understood Shrimpy. Not a web app in a native shell, not a chat transcript with extra padding, and not a general desktop client trying to expose every feature.

It should also avoid the AI SaaS funnel shape: no pressure toward a hosted assistant account, no baked-in assumption that inference lives somewhere remote, and no narrow "local means Ollama only" path. Shrimpy should stay provider-flexible and local-friendly because the desktop surface is just one invocation point for the same home system.

The UI can be extremely simple:

- one floating panel
- one prompt/input line
- a small structured result/context area
- keyboard shortcuts for selection and execution
- minimal persistent chrome

Visual density is good here. The user is invoking this while already doing something else, so the app should be brief, readable, and easy to dismiss.

## Shortcut

If there is a barebones OSS Spotlight replacement that is easy to adapt, that may be the nicest starting point. If not, the shortcut does not need to be perfect. Something like `ctrl+cmd+space` is fine.

The important thing is the interaction model, not owning the canonical system shortcut on day one.

## What It Should Reach

Every Shrimpy feature should already be reachable through `shrimpy <command>`, so the desktop app can stay thin:

- invoke CLI commands
- open or continue sessions
- send messages to channels
- inspect recent channel/session state
- run setup/doctor-style flows
- surface background work and heartbeat summaries

This reinforces the CLI-first architecture instead of bypassing it. The app is a native command surface over Shrimpy, not a second product model.

## Why Not Just Raycast

- Raycast's AI direction is too aligned with hosted AI services.
- Local inference does not look like a first-class, provider-flexible path.
- Customization feels too constrained for Shrimpy's weird home-agent shape.
- Shrimpy needs an inspectable command surface over its own runtime, not a plugin inside someone else's launcher.
- The useful part to borrow is speed and keyboard ergonomics, not the platform.

## Open Questions

- Is there a small open-source Spotlight/Raycast-style SwiftUI app worth forking?
- Should the UI talk to Shrimpy only through CLI commands at first, or through a local gateway once that path is more settled?
- How much "result visualization" is enough before this becomes a dashboard?
- Should commands be explicit menu items, natural-language intents, or both?

## Non-Goals

- Do not start with a full desktop dashboard.
- Do not build a heavy chat client first.
- Do not add a second control plane for skills, sessions, or channels.
- Do not make this cross-platform until the macOS shape feels right.

The first useful version can be almost comically small: summon, type, see the right nearby Shrimpy state, execute, vanish.
