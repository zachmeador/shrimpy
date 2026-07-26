# 🦐 Promoting Browser Workflows Into Durable Capabilities

Date: 2026-07-26
Status: Draft

## Purpose

Think out loud about a pattern that sits somewhere between browser automation, reverse engineering, skill authoring, and app-building:

1. An agent uses a browser to perform a workflow.
2. It records the browser's network traffic, often as a HAR file.
3. It infers the site's internal JSON, GraphQL, or RPC interface.
4. It generates a narrow client, CLI, script, or skill for the useful operations.
5. Later agent runs use that durable capability instead of replaying the interface one click at a time.

The motivating example is [Dax's Uber Eats experiment](https://x.com/thdxr/status/2078727284865827140), based on a technique attributed to James Longster: let the agent control the browser once, record the requests, then derive a more efficient client for repeated use. [CLI Printing Press](https://printingpress.dev/) is a larger expression of the same idea: turn an API, application, or website into an agent-oriented CLI and companion skill.

This pattern almost certainly does not need to originate in Shrimpy. Variants already exist as skills and tools across agent projects. The open question is whether Shrimpy should eventually include a small skill that teaches agents when and how to promote a browser workflow, recommend an external package, or simply leave this entirely to workspace-specific skills.

## The Core Shape

The browser is excellent at discovery. It can establish a session, let the user handle login, expose what the application actually does, and traverse workflows that have no published machine interface.

The browser is often poor as the permanent execution path. Repeated DOM inspection, clicking, waiting, and screenshot interpretation is slow, token-heavy, and sensitive to presentation changes. If the useful work ultimately becomes a handful of structured requests, a narrow client can be faster, cheaper, easier to test, and easier for an agent to compose.

The interesting move is therefore not "replace browsers with private APIs." It is:

```text
use browser -> understand recurring workflow -> produce durable capability -> keep browser as fallback
```

The browser becomes a profiler, teacher, authentication bridge, and verifier. The generated capability becomes the normal fast path.

## When Promotion Starts To Make Sense

The main signal is repetition. If an agent occasionally visits a site, browser control is probably enough. If the site is becoming infrastructure for the agent, rediscovering and replaying the same interaction every time starts to look wasteful.

Promotion is attractive when several of these are true:

- The same workflow has been performed more than once and is likely to recur.
- Browser execution is meaningfully slower, costlier, or less reliable than the underlying requests.
- The web application exposes reasonably stable structured endpoints.
- No supported public API exists, or the public API omits the capability the user actually needs.
- The workflow is read-heavy, reversible, or easy to verify.
- A compound command could replace many browser round trips.
- More than one agent, watch, or app would reuse the capability.
- The user owns the application, operates it internally, or knowingly accepts the maintenance and policy risk of an unsupported integration.

Good early examples are search, listing, export, synchronization, reporting, order history, catalog inspection, message retrieval, and other structured reads. A generated client for these operations can be both more reliable and more inspectable than a long browser dance.

The economics matter. Reverse engineering a one-off interaction is usually needless ceremony. Reverse engineering a daily workflow used by several agents may pay for itself immediately.

## Where It Does Not Fit

This is not a replacement for general web search. A site-specific client can provide excellent vertical search inside one application, but it cannot discover arbitrary sources across the public web. Shrimpy would still want separate concepts for broad search, fetching known pages, and interactive browsing.

It is also a poor default for:

- one-off tasks;
- sites whose protocols change constantly;
- flows dominated by CAPTCHA, device attestation, request signing, or anti-automation defenses;
- consequential mutations such as purchases, banking, account recovery, permission changes, and destructive administration;
- integrations for which a supported official API already works well;
- public redistribution when the site's terms, authentication model, or data rights are unclear.

The technique does not remove brittleness. It trades presentation brittleness for undocumented-protocol brittleness. That is often a good trade, but it is still a maintenance obligation.

A HAR shows examples of what happened. It does not automatically reveal all business rules, preconditions, edge cases, retry semantics, idempotency behavior, or hidden state transitions. A generated client needs tests and bounded claims rather than assuming that one successful trace is a complete specification.

## A Sensible Capability Ladder

This pattern fits the broader Shrimpy idea that capabilities can graduate as their weight increases:

```text
ad hoc browser task
  -> saved browser recipe or script
  -> site-specific skill with helper scripts
  -> maintained CLI or client
  -> app habitat with state, watches, and a resident owner
```

Not every workflow should climb the ladder. Promotion should happen because repetition, state, or maintenance pressure appears, not because generated code feels more sophisticated.

A small site-specific skill may be enough when the interface is narrow and a few commands already exist. A real CLI becomes attractive when the capability needs stable arguments, structured output, dry runs, exit codes, caching, authentication handling, or compound operations. A resident app-agent only becomes useful when the integration accumulates recurring work, user-specific state, failures that need attention, or its own maintenance lifecycle.

This is the same basic "skill graduation" idea described in [`app-habitats.md`](app-habitats.md), with browser observation as one possible source of the initial capability.

## Security Shape

HAR files are dangerous artifacts. They can contain cookies, bearer tokens, addresses, request bodies, personal data, and complete responses. Treating a HAR as an ordinary research file would be a serious mistake.

Any reusable workflow should probably follow rules like:

- capture only the required domains and the shortest useful time window;
- keep raw captures local and ephemeral by default;
- redact cookies, authorization headers, tokens, identifiers, and personal payloads before model exposure or durable storage;
- preserve an inferred schema or sanitized fixture instead of the authenticated trace;
- give the generated capability only the narrow operations it needs rather than a generic arbitrary-request escape hatch;
- prefer short-lived session handoff from a browser or credential broker over copying durable browser cookies into source or skill text;
- never place secrets in generated skills, examples, logs, or published packages.

For writes, the bar should be higher:

- start with read-only commands;
- support `--dry-run` or an equivalent preview;
- distinguish reversible writes from consequential actions;
- require confirmation for purchases, messages, deletes, and permission changes;
- use idempotency keys where available;
- verify the resulting state independently;
- fail closed when authentication or response shapes drift.

The Uber Eats example illustrates the boundary nicely. Menu search, price comparison, order history, and perhaps building a draft cart are plausible client operations. Address review, substitutions, payment, final totals, and order submission should likely return to a visible browser flow with explicit confirmation.

## Maintenance And Drift

An undocumented client should advertise that it is undocumented. The failure mode to avoid is a generated skill quietly becoming trusted infrastructure while its assumptions decay invisibly.

A durable capability could keep:

- the source site and workflow it was derived from;
- a sanitized example or schema;
- the capture or verification date;
- a small smoke test;
- known read and write operations;
- authentication expectations;
- explicit failure behavior for schema drift;
- a browser fallback or rediscovery procedure.

Relearning should probably be deliberate. If a client breaks, an agent can propose a new capture and diff the inferred contract, but should not silently rewrite a consequential integration from fresh network traffic and immediately resume mutations.

The browser remains useful after promotion. It can verify that results match the visible application, recover authentication, handle exceptional flows, and provide a safe handoff for sensitive final actions.

## Could This Be An Included Shrimpy Skill?

Maybe, but the useful included skill would be smaller than a code generator.

It might teach an agent to recognize the promotion threshold and choose among:

- keep using the browser;
- save a repeatable browser script;
- install an existing site-specific CLI or skill;
- capture a sanitized network trace;
- generate a narrow local client;
- ask the mechanic to turn the workflow into a maintained app capability.

It could also carry the safety checklist: prefer official APIs, treat captures as secrets, begin read-only, preserve provenance, test drift, and return sensitive final actions to a visible browser.

Reasons to include such a skill:

- it captures a generally useful agent workflow rather than one provider implementation;
- it fits Shrimpy's CLI-first preference;
- it helps agents avoid repeatedly solving the same browser task;
- it gives capability promotion an inspectable, user-legible path;
- it can point toward external tools without Shrimpy owning their internals.

Reasons not to include it:

- capable coding agents may already discover this pattern naturally;
- strong versions already exist in other projects and can be installed as normal skills;
- the workflow depends heavily on whichever browser and capture tools are available;
- bundling it might imply that Shrimpy endorses private API reverse engineering as a default behavior;
- a vague meta-skill can become prompt clutter if it rarely triggers.

The smallest reasonable Shrimpy position may be to document the pattern and let users install or author a skill when they actually need it. If recurring live-workspace evidence shows agents repeatedly driving the same sites inefficiently, that would be a stronger reason to include a promotion skill.

## Possible Shrimpy Product Feel

The user-facing idea should remain simple:

> You use this site often. I can keep operating it through the browser, or I can turn the recurring read-only parts into a faster local capability and leave sensitive actions in the browser.

That is better than silently reverse engineering a site or presenting a framework concept like "HAR-derived private API adapter." The user should understand that the result is faster but unsupported, what data it can access, where credentials live, and how it will fail when the site changes.

If Shrimpy ever recognizes this automatically, it should propose promotion rather than perform it invisibly. A mechanic session is a natural owner for the work because the output is real home modification: code, a CLI, a skill, configuration, tests, and an ongoing maintenance surface.

## Current Lean

The pattern is real and useful. It belongs beside web search, page fetching, and browser automation rather than replacing any of them:

```text
broad discovery        -> web search
read a known source     -> page fetch
interactive task        -> browser
repeated site workflow  -> promoted skill, script, or CLI
```

Shrimpy probably does not need to implement a private-API inference subsystem. It may eventually benefit from a small included skill about promoting repeated browser work into durable agent capabilities, but the case should come from observed repetition in real workspaces. Until then, this musing is enough of a breadcrumb.
